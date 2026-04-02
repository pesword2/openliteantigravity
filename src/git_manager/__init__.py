"""
Git Manager Module for OpenLiteAntigravity

Provides comprehensive Git repository management capabilities
for AI-assisted development workflows.
"""

from .git_operations import GitOperations, GitOperationError, create_git_operations
from .repo_manager import RepositoryManager, create_repository_manager

__version__ = "1.0.0"
__all__ = [
    # Core operations
    "GitOperations",
    "GitOperationError",
    "create_git_operations",
    
    # High-level management
    "RepositoryManager",
    "create_repository_manager",
]


def get_git_manager(workspace_root: str = "./workspace") -> tuple[GitOperations, RepositoryManager]:
    """
    Get both Git operations and repository manager instances.
    
    Args:
        workspace_root: Root directory for git workspaces
        
    Returns:
        Tuple of (GitOperations, RepositoryManager)
    """
    git_ops = create_git_operations(workspace_root)
    repo_manager = create_repository_manager(workspace_root)
    return git_ops, repo_manager


# Convenience exports
GitManager = GitOperations
