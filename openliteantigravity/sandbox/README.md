# Docker Sandbox Module

Secure, isolated code execution environment using Docker containers.

## Features

- **Complete Isolation**: Code runs in isolated Docker containers with no access to host system
- **Resource Limits**: Configurable CPU, memory, and execution time limits
- **Network Isolation**: Optional network access control
- **Multi-Language Support**: Python, JavaScript, TypeScript, Java, C++, C, Go, Rust
- **Automatic Cleanup**: Containers are automatically removed after execution
- **Security**: Read-only workspace mounting prevents host file modification

## Installation

Requires Docker to be installed and running:

```bash
# Install Docker (Ubuntu/Debian)
curl -fsSL https://get.docker.com | sh

# Verify installation
docker --version
```

Install Python dependencies:

```bash
pip install docker
```

## Usage

### Basic Usage

```python
from sandbox import execute_in_sandbox

# Execute simple Python code
result = execute_in_sandbox("print('Hello World')")
print(result.output)  # Hello World
print(result.success)  # True
```

### Advanced Usage

```python
from sandbox import DockerSandbox, SandboxConfig

# Configure sandbox
config = SandboxConfig(
    image="python:3.11-slim",
    timeout=60,
    memory_limit="1g",
    cpu_limit=2.0,
    network_enabled=False
)

# Create sandbox instance
sandbox = DockerSandbox(config)

# Execute code with multiple files
files = {
    "utils.py": "def add(a, b): return a + b"
}
code = """
from utils import add
print(f"2 + 3 = {add(2, 3)}")
"""

result = sandbox.execute_code(code, "python", files=files)
print(result.to_dict())
```

### Execution Result

The `ExecutionResult` object contains:

- `success`: Boolean indicating if execution succeeded
- `output`: Standard output from the code
- `error`: Error messages or stderr output
- `exit_code`: Process exit code
- `execution_time`: Time taken in seconds
- `container_id`: Docker container ID (for debugging)

## Security Considerations

1. **Read-Only Workspace**: Code cannot modify host files
2. **No Network Access**: Disabled by default to prevent external calls
3. **Resource Limits**: Prevents DoS attacks via resource exhaustion
4. **Container Cleanup**: Automatic removal prevents container accumulation
5. **Timeout Protection**: Prevents infinite loops

## Supported Languages

| Language | Extension | Runtime Required |
|----------|-----------|------------------|
| Python | .py | python3 |
| JavaScript | .js | node |
| TypeScript | .ts | tsc + node |
| Java | .java | javac + java |
| C++ | .cpp | g++ |
| C | .c | gcc |
| Go | .go | go |
| Rust | .rs | rustc |

## Configuration Options

```python
@dataclass
class SandboxConfig:
    image: str = "python:3.11-slim"      # Docker image to use
    timeout: int = 30                     # Max execution time (seconds)
    memory_limit: str = "512m"           # Memory limit
    cpu_limit: float = 1.0               # CPU cores limit
    network_enabled: bool = False        # Enable network access
    workdir: str = "/workspace"          # Working directory in container
```

## Error Handling

The sandbox handles various error scenarios:

- **Docker Connection Errors**: Raises `RuntimeError` if Docker is not available
- **Execution Timeout**: Returns failed result with timeout error
- **Code Errors**: Captures exceptions and returns in `error` field
- **Resource Limits**: Kills container if limits exceeded

## Testing

Run the built-in tests:

```bash
python -m sandbox
```

This will:
1. Test Docker connection
2. Execute simple Python code
3. Test error handling
4. Test multi-file execution
5. Display system information

## Integration

The sandbox module integrates with other OpenLiteAntigravity components:

- **API Gateway**: Exposes sandbox execution via REST API
- **Agent Engine**: Provides safe code execution for AI agents
- **Git Manager**: Tests generated code before committing
- **Dashboard**: Displays execution results in real-time

## Troubleshooting

### Docker Connection Failed

```
RuntimeError: Cannot connect to Docker daemon
```

**Solution**: Ensure Docker is running:
```bash
sudo systemctl start docker
# or
sudo service docker start
```

### Permission Denied

```
docker.errors.DockerException: Permission denied
```

**Solution**: Add user to docker group:
```bash
sudo usermod -aG docker $USER
# Then logout and login again
```

### Execution Timeout

```
ExecutionResult: success=False, error="Execution timeout"
```

**Solution**: Increase timeout in config:
```python
config = SandboxConfig(timeout=120)  # 2 minutes
```

## Best Practices

1. **Always Use Sandboxing**: Never execute AI-generated code directly on host
2. **Set Appropriate Limits**: Balance between functionality and security
3. **Monitor Resource Usage**: Watch for unusual patterns
4. **Keep Images Updated**: Regularly update base Docker images
5. **Log Everything**: Enable logging for audit trails

## License

Part of OpenLiteAntigravity - Open Source AI Code Development Platform
