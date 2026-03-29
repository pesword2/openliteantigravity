"""
Open-Antigravity LLM Gateway
Universal interface for all major LLM providers (OpenAI, Claude, Gemini, Llama, Grok, Qwen, etc.)
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Any
import os
import json

class LLMProvider(ABC):
    """Base class for all LLM providers"""
    
    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model
    
    @abstractmethod
    async def generate(self, prompt: str, **kwargs) -> str:
        """Generate text response from the model"""
        pass
    
    @abstractmethod
    async def stream_generate(self, prompt: str, **kwargs):
        """Stream text response from the model"""
        pass
    
    @abstractmethod
    def get_model_info(self) -> Dict[str, Any]:
        """Get model capabilities and info"""
        pass


class OpenAIProvider(LLMProvider):
    """OpenAI GPT models provider"""
    
    def __init__(self, api_key: str, model: str = "gpt-4o"):
        super().__init__(api_key, model)
        self.base_url = "https://api.openai.com/v1"
    
    async def generate(self, prompt: str, **kwargs) -> str:
        # Implementation for OpenAI API
        pass
    
    async def stream_generate(self, prompt: str, **kwargs):
        # Implementation for streaming
        pass
    
    def get_model_info(self) -> Dict[str, Any]:
        return {
            "provider": "OpenAI",
            "model": self.model,
            "context_window": 128000,
            "supports_vision": True,
            "supports_function_calling": True
        }


class ClaudeProvider(LLMProvider):
    """Anthropic Claude models provider"""
    
    def __init__(self, api_key: str, model: str = "claude-3-5-sonnet-20241022"):
        super().__init__(api_key, model)
        self.base_url = "https://api.anthropic.com/v1"
    
    async def generate(self, prompt: str, **kwargs) -> str:
        # Implementation for Claude API
        pass
    
    async def stream_generate(self, prompt: str, **kwargs):
        # Implementation for streaming
        pass
    
    def get_model_info(self) -> Dict[str, Any]:
        return {
            "provider": "Anthropic",
            "model": self.model,
            "context_window": 200000,
            "supports_vision": True,
            "supports_function_calling": True
        }


class GoogleCodeMenderProvider(LLMProvider):
    """Google CodeMender integration (Gemini-based)"""
    
    def __init__(self, api_key: str, model: str = "gemini-1.5-pro"):
        super().__init__(api_key, model)
        self.base_url = "https://generativelanguage.googleapis.com/v1beta"
    
    async def generate(self, prompt: str, **kwargs) -> str:
        # Implementation for Google CodeMender/Gemini API
        pass
    
    async def stream_generate(self, prompt: str, **kwargs):
        # Implementation for streaming
        pass
    
    def get_model_info(self) -> Dict[str, Any]:
        return {
            "provider": "Google",
            "model": self.model,
            "context_window": 2000000,
            "supports_vision": True,
            "supports_function_calling": True,
            "special_features": ["code_understanding", "multi_modal"]
        }


class LLMGateway:
    """
    Universal LLM Gateway - Routes requests to appropriate providers
    Supports dynamic provider switching and fallback mechanisms
    """
    
    def __init__(self):
        self.providers: Dict[str, LLMProvider] = {}
        self.default_provider = None
    
    def register_provider(self, name: str, provider: LLMProvider):
        """Register a new LLM provider"""
        self.providers[name] = provider
        if not self.default_provider:
            self.default_provider = name
    
    def set_default_provider(self, name: str):
        """Set the default provider"""
        if name not in self.providers:
            raise ValueError(f"Provider {name} not registered")
        self.default_provider = name
    
    async def generate(self, prompt: str, provider: Optional[str] = None, **kwargs) -> str:
        """Generate response using specified or default provider"""
        provider_name = provider or self.default_provider
        if not provider_name:
            raise ValueError("No provider available")
        
        if provider_name not in self.providers:
            raise ValueError(f"Provider {provider_name} not found")
        
        return await self.providers[provider_name].generate(prompt, **kwargs)
    
    async def generate_with_fallback(self, prompt: str, provider_order: List[str], **kwargs) -> str:
        """Try multiple providers in order until one succeeds"""
        for provider_name in provider_order:
            try:
                if provider_name in self.providers:
                    return await self.providers[provider_name].generate(prompt, **kwargs)
            except Exception as e:
                print(f"Provider {provider_name} failed: {e}")
                continue
        
        raise Exception("All providers failed")
    
    def list_providers(self) -> List[str]:
        """List all registered providers"""
        return list(self.providers.keys())
    
    def get_provider_info(self, provider_name: str) -> Dict[str, Any]:
        """Get information about a specific provider"""
        if provider_name not in self.providers:
            raise ValueError(f"Provider {provider_name} not found")
        return self.providers[provider_name].get_model_info()


# Factory function to create gateway with common providers
def create_gateway(config: Dict[str, str]) -> LLMGateway:
    """
    Create and configure LLM Gateway with provided API keys
    
    config: {
        "openai_api_key": "...",
        "anthropic_api_key": "...",
        "google_api_key": "...",
        ...
    }
    """
    gateway = LLMGateway()
    
    if "openai_api_key" in config:
        gateway.register_provider("openai", OpenAIProvider(
            config["openai_api_key"], 
            config.get("openai_model", "gpt-4o")
        ))
    
    if "anthropic_api_key" in config:
        gateway.register_provider("claude", ClaudeProvider(
            config["anthropic_api_key"],
            config.get("claude_model", "claude-3-5-sonnet-20241022")
        ))
    
    if "google_api_key" in config:
        gateway.register_provider("google", GoogleCodeMenderProvider(
            config["google_api_key"],
            config.get("google_model", "gemini-1.5-pro")
        ))
    
    return gateway
