"""
Docker Sandbox Module for OpenLiteAntigravity

Provides secure, isolated code execution environment using Docker containers.
Ensures generated code cannot harm the host machine.
"""

import docker
import json
import logging
import os
import tempfile
import time
from typing import Dict, Any, Optional, Tuple
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class SandboxConfig:
    """Configuration for sandbox container"""
    image: str = "python:3.11-slim"
    timeout: int = 30  # seconds
    memory_limit: str = "512m"
    cpu_limit: float = 1.0
    network_enabled: bool = False
    workdir: str = "/workspace"
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "image": self.image,
            "timeout": self.timeout,
            "memory_limit": self.memory_limit,
            "cpu_limit": self.cpu_limit,
            "network_enabled": self.network_enabled,
            "workdir": self.workdir
        }


@dataclass
class ExecutionResult:
    """Result of code execution in sandbox"""
    success: bool
    output: str
    error: str
    exit_code: int
    execution_time: float
    container_id: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "output": self.output,
            "error": self.error,
            "exit_code": self.exit_code,
            "execution_time": self.execution_time,
            "container_id": self.container_id
        }


class DockerSandbox:
    """
    Secure sandbox for executing untrusted code in isolated Docker containers.
    
    Features:
    - Complete isolation from host system
    - Resource limits (CPU, memory, time)
    - Network isolation (optional)
    - Automatic cleanup
    - Support for multiple programming languages
    """
    
    def __init__(self, config: Optional[SandboxConfig] = None):
        """Initialize Docker sandbox with configuration"""
        self.config = config or SandboxConfig()
        self.client = None
        self._connect_to_docker()
        
    def _connect_to_docker(self) -> None:
        """Establish connection to Docker daemon"""
        try:
            self.client = docker.from_env()
            # Test connection
            self.client.ping()
            logger.info("Connected to Docker daemon")
        except docker.errors.DockerException as e:
            logger.error(f"Failed to connect to Docker: {e}")
            raise RuntimeError(
                "Cannot connect to Docker daemon. "
                "Please ensure Docker is running and accessible."
            ) from e
    
    def execute_code(
        self, 
        code: str, 
        language: str = "python",
        files: Optional[Dict[str, str]] = None,
        stdin_input: Optional[str] = None
    ) -> ExecutionResult:
        """
        Execute code in isolated sandbox environment.
        
        Args:
            code: Source code to execute
            language: Programming language ('python', 'javascript', etc.)
            files: Additional files to include in workspace {filename: content}
            stdin_input: Input to provide via stdin
            
        Returns:
            ExecutionResult with output, errors, and metadata
        """
        start_time = time.time()
        container = None
        
        try:
            # Prepare workspace
            workspace_files = self._prepare_workspace(code, language, files)
            
            # Build command based on language
            cmd = self._build_command(language)
            
            # Create and run container
            container = self.client.containers.run(
                self.config.image,
                command=cmd,
                working_dir=self.config.workdir,
                volumes=workspace_files,
                mem_limit=self.config.memory_limit,
                nano_cpus=int(self.config.cpu_limit * 1e9),
                network_mode="none" if not self.config.network_enabled else "bridge",
                remove=False,  # We'll remove manually after getting logs
                stdout=True,
                stderr=True,
                stdin_open=stdin_input is not None,
                tty=False,
                detach=True
            )
            
            # Wait for completion with timeout
            try:
                result = container.wait(timeout=self.config.timeout)
                exit_code = result.get("StatusCode", -1)
            except Exception as e:
                # Timeout or other error
                logger.warning(f"Container execution failed: {e}")
                container.kill()
                return ExecutionResult(
                    success=False,
                    output="",
                    error=f"Execution timeout or error: {str(e)}",
                    exit_code=-1,
                    execution_time=time.time() - start_time,
                    container_id=container.id
                )
            
            # Get logs
            try:
                logs = container.logs().decode('utf-8', errors='replace')
            except Exception:
                logs = ""
            
            # Parse output and error
            output, error = self._parse_logs(logs, exit_code)
            
            # Add stdin response if provided
            if stdin_input and exit_code == 0:
                output = f"Input: {stdin_input}\n{output}"
            
            execution_result = ExecutionResult(
                success=(exit_code == 0),
                output=output,
                error=error,
                exit_code=exit_code,
                execution_time=time.time() - start_time,
                container_id=container.id
            )
            
            logger.info(
                f"Code execution completed: success={execution_result.success}, "
                f"time={execution_result.execution_time:.2f}s"
            )
            
            return execution_result
            
        except Exception as e:
            logger.error(f"Sandbox execution error: {e}")
            return ExecutionResult(
                success=False,
                output="",
                error=f"Sandbox error: {str(e)}",
                exit_code=-1,
                execution_time=time.time() - start_time
            )
        finally:
            # Cleanup container
            if container:
                try:
                    container.remove(force=True)
                except Exception as e:
                    logger.warning(f"Failed to remove container: {e}")
    
    def _prepare_workspace(
        self, 
        code: str, 
        language: str, 
        files: Optional[Dict[str, str]] = None
    ) -> Dict[str, Dict[str, str]]:
        """Prepare workspace with code and additional files"""
        # Create temporary directory for workspace
        temp_dir = tempfile.mkdtemp(prefix="sandbox_")
        workspace_path = Path(temp_dir)
        
        # Determine main filename based on language
        extensions = {
            "python": "py",
            "javascript": "js",
            "typescript": "ts",
            "java": "java",
            "cpp": "cpp",
            "c": "c",
            "go": "go",
            "rust": "rs"
        }
        ext = extensions.get(language, "txt")
        main_file = f"main.{ext}"
        
        # Write main code file
        main_path = workspace_path / main_file
        main_path.write_text(code, encoding='utf-8')
        
        # Write additional files
        if files:
            for filename, content in files.items():
                file_path = workspace_path / filename
                file_path.parent.mkdir(parents=True, exist_ok=True)
                file_path.write_text(content, encoding='utf-8')
        
        # Return volume mapping
        return {
            str(workspace_path): {
                "bind": self.config.workdir,
                "mode": "ro"  # Read-only for security
            }
        }
    
    def _build_command(self, language: str) -> str:
        """Build execution command based on language"""
        commands = {
            "python": "python main.py",
            "javascript": "node main.js",
            "typescript": "tsc main.ts && node main.js",
            "java": "javac Main.java && java Main",
            "cpp": "g++ -o main main.cpp && ./main",
            "c": "gcc -o main main.c && ./main",
            "go": "go run main.go",
            "rust": "rustc main.rs && ./main"
        }
        return commands.get(language, f"echo 'Unsupported language: {language}'")
    
    def _parse_logs(self, logs: str, exit_code: int) -> Tuple[str, str]:
        """Parse container logs into output and error"""
        if not logs:
            return "", ""
        
        # Simple parsing: assume stderr is mixed with stdout
        # For better separation, we could use separate streams
        lines = logs.split('\n')
        output_lines = []
        error_lines = []
        
        for line in lines:
            if any(err in line.lower() for err in ['error', 'exception', 'traceback']):
                error_lines.append(line)
            else:
                output_lines.append(line)
        
        output = '\n'.join(output_lines).strip()
        error = '\n'.join(error_lines).strip()
        
        # If exit code is non-zero and no error detected, treat all as error
        if exit_code != 0 and not error:
            error = output
            output = ""
        
        return output, error
    
    def test_connection(self) -> bool:
        """Test Docker connection and basic functionality"""
        try:
            result = self.execute_code("print('Sandbox test successful')", "python")
            return result.success and "Sandbox test successful" in result.output
        except Exception as e:
            logger.error(f"Sandbox connection test failed: {e}")
            return False
    
    def get_system_info(self) -> Dict[str, Any]:
        """Get Docker system information"""
        try:
            info = self.client.info()
            return {
                "docker_version": info.get("ServerVersion", "unknown"),
                "containers_running": info.get("ContainersRunning", 0),
                "os": info.get("OperatingSystem", "unknown"),
                "architecture": info.get("Architecture", "unknown"),
                "cpus": info.get("NCPU", 0),
                "memory_total": info.get("MemTotal", 0),
                "sandbox_config": self.config.to_dict()
            }
        except Exception as e:
            return {"error": str(e)}


# Convenience function for quick execution
def execute_in_sandbox(
    code: str, 
    language: str = "python",
    timeout: int = 30,
    **kwargs
) -> ExecutionResult:
    """
    Quick helper to execute code in sandbox with default settings.
    
    Example:
        result = execute_in_sandbox("print('Hello World')")
        print(result.output)
    """
    config = SandboxConfig(timeout=timeout)
    sandbox = DockerSandbox(config)
    return sandbox.execute_code(code, language, **kwargs)


if __name__ == "__main__":
    # Example usage and testing
    logging.basicConfig(level=logging.INFO)
    
    print("Testing Docker Sandbox...")
    
    try:
        sandbox = DockerSandbox()
        
        # Test 1: Simple Python code
        print("\n=== Test 1: Simple Python ===")
        result = sandbox.execute_code("print('Hello from sandbox!')")
        print(f"Output: {result.output}")
        print(f"Success: {result.success}")
        
        # Test 2: Code with error
        print("\n=== Test 2: Code with Error ===")
        result = sandbox.execute_code("raise ValueError('Test error')")
        print(f"Error: {result.error}")
        print(f"Success: {result.success}")
        
        # Test 3: Multiple files
        print("\n=== Test 3: Multiple Files ===")
        files = {
            "utils.py": "def add(a, b): return a + b"
        }
        code = """
from utils import add
print(f"2 + 3 = {add(2, 3)}")
"""
        result = sandbox.execute_code(code, "python", files=files)
        print(f"Output: {result.output}")
        print(f"Success: {result.success}")
        
        # Test 4: System info
        print("\n=== System Info ===")
        info = sandbox.get_system_info()
        print(json.dumps(info, indent=2))
        
    except Exception as e:
        print(f"Test failed: {e}")
