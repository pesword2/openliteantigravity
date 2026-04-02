"""
Git Operations Module for OpenLiteAntigravity

Provides core Git functionality for repository management,
including clone, commit, push, branch operations, and diff generation.
"""

import subprocess
import os
from typing import Optional, List, Dict, Any
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


class GitOperations:
    """Core Git operations handler with security features."""
    
    def __init__(self, workspace_root: str = "./workspace"):
        self.workspace_root = Path(workspace_root).resolve()
        self.workspace_root.mkdir(parents=True, exist_ok=True)
        logger.info(f"GitOperations initialized with workspace: {self.workspace_root}")
    
    def _run_git_command(
        self, 
        command: List[str], 
        cwd: Optional[Path] = None,
        check: bool = True
    ) -> subprocess.CompletedProcess:
        """
        Execute a Git command with security validations.
        
        Args:
            command: List of git command arguments
            cwd: Working directory for the command
            check: Whether to raise exception on non-zero exit
            
        Returns:
            CompletedProcess instance with output
            
        Raises:
            GitOperationError: On git command failure
        """
        # Security: Prevent path traversal
        if cwd:
            cwd = cwd.resolve()
            if not str(cwd).startswith(str(self.workspace_root)):
                raise GitOperationError(
                    f"Security violation: Attempted to access path outside workspace: {cwd}"
                )
        
        full_command = ["git"] + command
        logger.debug(f"Executing git command: {' '.join(full_command)}")
        
        try:
            result = subprocess.run(
                full_command,
                cwd=cwd or self.workspace_root,
                capture_output=True,
                text=True,
                check=check,
                timeout=300  # 5 minute timeout
            )
            
            if result.returncode != 0 and check:
                logger.error(f"Git command failed: {result.stderr}")
                raise GitOperationError(f"Git command failed: {result.stderr}")
            
            return result
            
        except subprocess.TimeoutExpired:
            raise GitOperationError("Git command timed out after 300 seconds")
        except Exception as e:
            raise GitOperationError(f"Git operation failed: {str(e)}")
    
    def clone_repository(
        self, 
        repo_url: str, 
        target_dir: Optional[str] = None,
        depth: Optional[int] = None
    ) -> Path:
        """
        Clone a repository into the workspace.
        
        Args:
            repo_url: URL of the repository to clone
            target_dir: Optional target directory name
            depth: Optional shallow clone depth
            
        Returns:
            Path to the cloned repository
        """
        # Extract repo name from URL if target_dir not specified
        if not target_dir:
            repo_name = repo_url.rstrip('/').split('/')[-1]
            if repo_name.endswith('.git'):
                repo_name = repo_name[:-4]
            target_dir = repo_name
        
        repo_path = self.workspace_root / target_dir
        
        # Security: Validate target path
        if not str(repo_path.resolve()).startswith(str(self.workspace_root)):
            raise GitOperationError(
                f"Security violation: Invalid target directory: {target_dir}"
            )
        
        command = ["clone", repo_url, str(repo_path)]
        if depth:
            command.insert(1, f"--depth={depth}")
        
        logger.info(f"Cloning repository: {repo_url} -> {repo_path}")
        self._run_git_command(command, check=True)
        
        logger.info(f"Successfully cloned repository to: {repo_path}")
        return repo_path
    
    def create_branch(self, repo_path: str, branch_name: str) -> bool:
        """Create a new branch in the repository."""
        repo_path = self._validate_repo_path(repo_path)
        
        logger.info(f"Creating branch '{branch_name}' in {repo_path}")
        self._run_git_command(["checkout", "-b", branch_name], cwd=repo_path)
        return True
    
    def checkout_branch(self, repo_path: str, branch_name: str) -> bool:
        """Checkout an existing branch."""
        repo_path = self._validate_repo_path(repo_path)
        
        logger.info(f"Checking out branch '{branch_name}' in {repo_path}")
        self._run_git_command(["checkout", branch_name], cwd=repo_path)
        return True
    
    def add_changes(self, repo_path: str, files: Optional[List[str]] = None) -> bool:
        """
        Stage changes for commit.
        
        Args:
            repo_path: Path to the repository
            files: Specific files to stage, or None for all changes
        """
        repo_path = self._validate_repo_path(repo_path)
        
        if files:
            for file in files:
                # Security: Validate file path
                file_path = Path(file)
                if not str(file_path.resolve()).startswith(str(repo_path)):
                    raise GitOperationError(
                        f"Security violation: File path outside repo: {file}"
                    )
                self._run_git_command(["add", str(file)], cwd=repo_path)
            logger.info(f"Staged specific files: {files}")
        else:
            self._run_git_command(["add", "-A"], cwd=repo_path)
            logger.info("Staged all changes")
        
        return True
    
    def commit_changes(
        self, 
        repo_path: str, 
        message: str,
        author_name: Optional[str] = None,
        author_email: Optional[str] = None
    ) -> str:
        """
        Commit staged changes.
        
        Returns:
            Commit hash
        """
        repo_path = self._validate_repo_path(repo_path)
        
        command = ["commit", "-m", message]
        
        if author_name and author_email:
            command.extend(["--author", f"{author_name} <{author_email}>"])
        
        logger.info(f"Committing changes: {message[:50]}...")
        self._run_git_command(command, cwd=repo_path)
        
        # Get commit hash
        result = self._run_git_command(
            ["rev-parse", "HEAD"], 
            cwd=repo_path
        )
        commit_hash = result.stdout.strip()
        
        logger.info(f"Committed with hash: {commit_hash}")
        return commit_hash
    
    def push_changes(
        self, 
        repo_path: str, 
        remote: str = "origin",
        branch: Optional[str] = None,
        force: bool = False
    ) -> bool:
        """Push changes to remote repository."""
        repo_path = self._validate_repo_path(repo_path)
        
        # Get current branch if not specified
        if not branch:
            result = self._run_git_command(
                ["rev-parse", "--abbrev-ref", "HEAD"],
                cwd=repo_path
            )
            branch = result.stdout.strip()
        
        command = ["push", remote, branch]
        if force:
            command.insert(1, "--force")
        
        logger.info(f"Pushing branch '{branch}' to {remote}")
        self._run_git_command(command, cwd=repo_path)
        
        logger.info("Successfully pushed changes")
        return True
    
    def get_diff(
        self, 
        repo_path: str,
        target: Optional[str] = None,
        staged: bool = False
    ) -> str:
        """
        Get diff of changes.
        
        Args:
            repo_path: Path to repository
            target: Target branch/commit to compare against
            staged: If True, show staged changes; otherwise working tree
            
        Returns:
            Diff output as string
        """
        repo_path = self._validate_repo_path(repo_path)
        
        command = ["diff"]
        if staged:
            command.append("--cached")
        if target:
            command.append(target)
        
        result = self._run_git_command(command, cwd=repo_path, check=False)
        return result.stdout
    
    def get_status(self, repo_path: str) -> Dict[str, Any]:
        """Get repository status as structured data."""
        repo_path = self._validate_repo_path(repo_path)
        
        result = self._run_git_command(["status", "--porcelain", "-b"], cwd=repo_path)
        lines = result.stdout.strip().split('\n')
        
        status = {
            "branch": None,
            "ahead_behind": None,
            "changed_files": [],
            "staged_files": [],
            "untracked_files": []
        }
        
        if lines:
            # First line contains branch info
            branch_line = lines[0]
            if branch_line.startswith("## "):
                branch_info = branch_line[3:]
                if "..." in branch_info:
                    branch_parts = branch_info.split("...")
                    status["branch"] = branch_parts[0]
                    if len(branch_parts) > 1:
                        status["ahead_behind"] = branch_parts[1]
                else:
                    status["branch"] = branch_info
            
            # Parse file statuses
            for line in lines[1:]:
                if not line.strip():
                    continue
                file_status = line[:2]
                file_path = line[3:].split(" -> ")[-1] if " -> " in line else line[3:]
                
                if file_status[0] != ' ' and file_status[0] != '?':
                    status["staged_files"].append(file_path)
                if file_status[1] != ' ':
                    status["changed_files"].append(file_path)
                if file_status == "??":
                    status["untracked_files"].append(file_path)
        
        return status
    
    def get_current_branch(self, repo_path: str) -> str:
        """Get current branch name."""
        repo_path = self._validate_repo_path(repo_path)
        result = self._run_git_command(
            ["rev-parse", "--abbrev-ref", "HEAD"],
            cwd=repo_path
        )
        return result.stdout.strip()
    
    def _validate_repo_path(self, repo_path: str) -> Path:
        """Validate that repo path is within workspace."""
        path = Path(repo_path).resolve()
        if not str(path).startswith(str(self.workspace_root)):
            raise GitOperationError(
                f"Security violation: Repository path outside workspace: {repo_path}"
            )
        if not path.exists():
            raise GitOperationError(f"Repository path does not exist: {repo_path}")
        return path
    
    def is_repository(self, repo_path: str) -> bool:
        """Check if path is a valid git repository."""
        try:
            path = Path(repo_path).resolve()
            git_dir = path / ".git"
            return git_dir.exists()
        except Exception:
            return False


class GitOperationError(Exception):
    """Custom exception for Git operation errors."""
    pass


# Convenience functions for direct usage
def create_git_operations(workspace_root: str = "./workspace") -> GitOperations:
    """Factory function to create GitOperations instance."""
    return GitOperations(workspace_root)
