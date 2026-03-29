"""
Model configurations and capabilities for all supported LLMs
"""

from typing import Dict, List, Any

MODEL_CONFIGS: Dict[str, Dict[str, Any]] = {
    # OpenAI Models
    "gpt-4o": {
        "provider": "openai",
        "context_window": 128000,
        "max_output_tokens": 16384,
        "supports_vision": True,
        "supports_function_calling": True,
        "supports_json_mode": True,
        "price_per_1m_input": 5.0,
        "price_per_1m_output": 15.0
    },
    "gpt-4-turbo": {
        "provider": "openai",
        "context_window": 128000,
        "max_output_tokens": 4096,
        "supports_vision": True,
        "supports_function_calling": True,
        "supports_json_mode": True,
        "price_per_1m_input": 10.0,
        "price_per_1m_output": 30.0
    },
    
    # Anthropic Claude Models
    "claude-3-5-sonnet-20241022": {
        "provider": "anthropic",
        "context_window": 200000,
        "max_output_tokens": 8192,
        "supports_vision": True,
        "supports_function_calling": True,
        "supports_pdf": True,
        "price_per_1m_input": 3.0,
        "price_per_1m_output": 15.0
    },
    "claude-3-opus-20240229": {
        "provider": "anthropic",
        "context_window": 200000,
        "max_output_tokens": 4096,
        "supports_vision": True,
        "supports_function_calling": True,
        "price_per_1m_input": 15.0,
        "price_per_1m_output": 75.0
    },
    
    # Google Gemini/CodeMender Models
    "gemini-1.5-pro": {
        "provider": "google",
        "context_window": 2000000,
        "max_output_tokens": 8192,
        "supports_vision": True,
        "supports_function_calling": True,
        "supports_video": True,
        "supports_audio": True,
        "special_features": ["code_understanding", "multi_modal", "long_context"],
        "price_per_1m_input": 1.25,
        "price_per_1m_output": 5.0
    },
    "gemini-1.5-flash": {
        "provider": "google",
        "context_window": 1000000,
        "max_output_tokens": 8192,
        "supports_vision": True,
        "supports_function_calling": True,
        "price_per_1m_input": 0.075,
        "price_per_1m_output": 0.3
    },
    
    # Meta Llama Models (via Groq, Together, etc.)
    "llama-3.1-405b": {
        "provider": "meta",
        "context_window": 128000,
        "max_output_tokens": 4096,
        "supports_vision": False,
        "supports_function_calling": True,
        "open_source": True
    },
    "llama-3.1-70b": {
        "provider": "meta",
        "context_window": 128000,
        "max_output_tokens": 4096,
        "supports_vision": False,
        "supports_function_calling": True,
        "open_source": True
    },
    
    # xAI Grok Models
    "grok-beta": {
        "provider": "xai",
        "context_window": 128000,
        "max_output_tokens": 4096,
        "supports_vision": False,
        "supports_function_calling": True
    },
    
    # Alibaba Qwen Models
    "qwen-2.5-coder-32b": {
        "provider": "alibaba",
        "context_window": 128000,
        "max_output_tokens": 4096,
        "supports_vision": False,
        "supports_function_calling": True,
        "specializes_in": "coding",
        "open_source": True
    }
}

def get_model_config(model_name: str) -> Dict[str, Any]:
    """Get configuration for a specific model"""
    if model_name not in MODEL_CONFIGS:
        raise ValueError(f"Model {model_name} not found in configurations")
    return MODEL_CONFIGS[model_name]

def list_models_by_provider(provider: str) -> List[str]:
    """List all models from a specific provider"""
    return [
        name for name, config in MODEL_CONFIGS.items() 
        if config["provider"] == provider
    ]

def get_best_model_for_task(task_type: str) -> str:
    """
    Recommend the best model for a specific task type
    
    task_type: "coding", "vision", "long_context", "fast_response", "cost_effective"
    """
    recommendations = {
        "coding": "claude-3-5-sonnet-20241022",
        "vision": "gemini-1.5-pro",
        "long_context": "gemini-1.5-pro",
        "fast_response": "gemini-1.5-flash",
        "cost_effective": "gemini-1.5-flash",
        "complex_reasoning": "claude-3-opus-20240229",
        "balanced": "gpt-4o"
    }
    
    return recommendations.get(task_type, "gpt-4o")

def compare_models(model_names: List[str]) -> Dict[str, Any]:
    """Compare multiple models side by side"""
    comparison = {}
    for model_name in model_names:
        if model_name in MODEL_CONFIGS:
            comparison[model_name] = MODEL_CONFIGS[model_name]
    
    return comparison
