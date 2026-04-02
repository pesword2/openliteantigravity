"""
Repository Manager for OpenLiteAntigravity

High-level repository management including PR creation,
issue tracking integration, and workflow automation.
"""

import logging
from typing import Optional, Dict, Any, List
from pathlib import Path
from datetime import datetime

from .git_operations import GitOperations, GitOperationError

logger = logging.getLogger(__name__)


class RepositoryManager:
    """
    High-level repository manager for automated workflows.
    
    Provides convenient methods for common Git operations in the context
    of AI-assisted development, including PR preparation and branch management.
    """
    
    def __init__(self, workspace_root: str = "./workspace"):
        self.git_ops = GitOperations(workspace_root)
        self.workspace_root = Path(workspace_root).resolve()
        logger.info(f"RepositoryManager initialized with workspace: {self.workspace_root}")
    
    def prepare_feature_branch(
        self,
        repo_url: str,
        feature_name: str,
        base_branch: str = "main",
        shallow_clone: bool = True
    ) -> Dict[str, Any]:
        """
        Prepare a feature branch for AI-generated changes.
        
        Args:
            repo_url: URL of the repository
            feature_name: Name of the feature/bugfix
            base_branch: Base branch to create feature branch from
            shallow_clone: Whether to use shallow clone for speed
            
        Returns:
            Dictionary with repo_path, branch_name, and status
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        branch_name = f"feature/{feature_name}_{timestamp}"
        
        # Clone repository
        logger.info(f"Cloning repository for feature: {feature_name}")
        repo_path = self.git_ops.clone_repository(
            repo_url,
            depth=1 if shallow_clone else None
        )
        
        # Checkout base branch
        self.git_ops.checkout_branch(str(repo_path), base_branch)
        
        # Pull latest changes
        self._pull_latest(str(repo_path), base_branch)
        
        # Create feature branch
        self.git_ops.create_branch(str(repo_path), branch_name)
        
        logger.info(f"Feature branch ready: {branch_name} at {repo_path}")
        
        return {
            "success": True,
            "repo_path": str(repo_path),
            "branch_name": branch_name,
            "base_branch": base_branch,
            "repo_url": repo_url
        }
    
    def commit_ai_changes(
        self,
        repo_path: str,
        commit_message: str,
        author_name: str = "OpenLiteAntigravity AI",
        author_email: str = "ai@openliteantigravity.local"
    ) -> Dict[str, Any]:
        """
        Commit AI-generated changes with proper metadata.
        
        Args:
            repo_path: Path to the repository
            commit_message: Commit message describing the changes
            author_name: Author name for the commit
            author_email: Author email for the commit
            
        Returns:
            Dictionary with commit hash and status
        """
        try:
            # Stage all changes
            self.git_ops.add_changes(repo_path)
            
            # Get status for logging
            status = self.git_ops.get_status(repo_path)
            logger.info(f"Changes to commit: {len(status['staged_files'])} files")
            
            # Commit changes
            commit_hash = self.git_ops.commit_changes(
                repo_path,
                commit_message,
                author_name=author_name,
                author_email=author_email
            )
            
            return {
                "success": True,
                "commit_hash": commit_hash,
                "message": commit_message,
                "files_changed": len(status['staged_files']) + len(status['changed_files'])
            }
            
        except GitOperationError as e:
            logger.error(f"Failed to commit AI changes: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def generate_pr_diff(self, repo_path: str, base_branch: str) -> str:
        """
        Generate diff for PR review.
        
        Args:
            repo_path: Path to the repository
            base_branch: Base branch to compare against
            
        Returns:
            Diff string for PR
        """
        current_branch = self.git_ops.get_current_branch(repo_path)
        
        if current_branch == base_branch:
            logger.warning("Current branch is the same as base branch")
            return ""
        
        diff = self.git_ops.get_diff(repo_path, target=base_branch)
        logger.info(f"Generated diff for PR: {len(diff)} characters")
        
        return diff
    
    def push_to_remote(
        self,
        repo_path: str,
        remote: str = "origin",
        set_upstream: bool = True
    ) -> Dict[str, Any]:
        """
        Push changes to remote repository.
        
        Args:
            repo_path: Path to the repository
            remote: Remote name
            set_upstream: Whether to set upstream tracking
            
        Returns:
            Dictionary with push status
        """
        try:
            branch = self.git_ops.get_current_branch(repo_path)
            
            if set_upstream:
                # Set upstream and push
                self.git_ops._run_git_command(
                    ["push", "-u", remote, branch],
                    cwd=Path(repo_path)
                )
            else:
                self.git_ops.push_changes(repo_path, remote=remote)
            
            return {
                "success": True,
                "branch": branch,
                "remote": remote,
                "message": f"Successfully pushed {branch} to {remote}"
            }
            
        except GitOperationError as e:
            logger.error(f"Failed to push to remote: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def get_repo_summary(self, repo_path: str) -> Dict[str, Any]:
        """
        Get comprehensive repository summary.
        
        Args:
            repo_path: Path to the repository
            
        Returns:
            Dictionary with repository information
        """
        if not self.git_ops.is_repository(repo_path):
            return {
                "success": False,
                "error": "Not a valid git repository"
            }
        
        status = self.git_ops.get_status(repo_path)
        current_branch = self.git_ops.get_current_branch(repo_path)
        
        return {
            "success": True,
            "repo_path": repo_path,
            "current_branch": current_branch,
            "branch_info": status.get("ahead_behind"),
            "staged_files": status["staged_files"],
            "changed_files": status["changed_files"],
            "untracked_files": status["untracked_files"],
            "has_changes": bool(
                status["staged_files"] or 
                status["changed_files"] or 
                status["untracked_files"]
            )
        }
    
    def cleanup_workspace(self, repo_path: str, force: bool = False) -> bool:
        """
        Clean up workspace by removing cloned repositories.
        
        Args:
            repo_path: Path to remove
            force: Force removal even if there are uncommitted changes
            
        Returns:
            Success status
        """
        try:
            path = Path(repo_path).resolve()
            
            # Security check
            if not str(path).startswith(str(self.workspace_root)):
                raise GitOperationError(
                    f"Security violation: Cannot remove path outside workspace: {repo_path}"
                )
            
            if not path.exists():
                logger.warning(f"Path does not exist: {repo_path}")
                return True
            
            # Check for uncommitted changes
            if self.git_ops.is_repository(str(path)) and not force:
                status = self.git_ops.get_status(str(path))
                if status["has_changes"]:
                    logger.warning(
                        f"Repository has uncommitted changes. Use force=True to remove."
                    )
                    return False
            
            # Remove directory
            import shutil
            shutil.rmtree(path)
            logger.info(f"Cleaned up workspace: {repo_path}")
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to cleanup workspace: {str(e)}")
            return False
    
    def _pull_latest(self, repo_path: str, branch: str) -> bool:
        """Pull latest changes from remote."""
        try:
            self.git_ops._run_git_command(
                ["pull", "origin", branch],
                cwd=Path(repo_path)
            )
            logger.info(f"Pulled latest changes for branch: {branch}")
            return True
        except GitOperationError as e:
            logger.warning(f"Failed to pull latest changes: {str(e)}")
            return False
    
    def create_commit_with_context(
        self,
        repo_path: str,
        message: str,
        context: Dict[str, Any],
        author_name: str = "OpenLiteAntigravity AI",
        author_email: str = "ai@openliteantigravity.local"
    ) -> Dict[str, Any]:
        """
        Create a commit with additional context metadata.
        
        Args:
            repo_path: Path to the repository
            message: Commit message
            context: Additional context (e.g., AI model used, task ID)
            author_name: Author name
            author_email: Author email
            
        Returns:
            Commit result with metadata
        """
        # Add context to commit message
        enhanced_message = f"{message}\n\n"
        enhanced_message += "---\nAI-Generated Commit\n"
        
        if "model" in context:
            enhanced_message += f"Model: {context['model']}\n"
        if "task_id" in context:
            enhanced_message += f"Task ID: {context['task_id']}\n"
        if "timestamp" in context:
            enhanced_message += f"Timestamp: {context['timestamp']}\n"
        
        return self.commit_ai_changes(
            repo_path,
            enhanced_message,
            author_name=author_name,
            author_email=author_email
        )


# Factory function
def create_repository_manager(workspace_root: str = "./workspace") -> RepositoryManager:
    """Factory function to create RepositoryManager instance."""
    return RepositoryManager(workspace_root)
