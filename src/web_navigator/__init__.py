"""
Web Navigator Modülü

Playwright tabanlı web otomasyonu ve browser agent entegrasyonu.
"""

from .navigator import WebNavigator, NavigationResult, FormField
from .browser_agent import BrowserAgent, BrowserAction, BrowserTask

__all__ = [
    "WebNavigator",
    "NavigationResult",
    "FormField",
    "BrowserAgent",
    "BrowserAction",
    "BrowserTask"
]

__version__ = "1.0.0"
