import { LLMProvider, GenerationOptions, GenerationResponse, ModelConfig } from '../types';
import { OllamaProvider } from '../providers/ollama_provider';
import { OpenAIProvider } from '../providers/openai_provider';
import { AnthropicProvider } from '../providers/anthropic_provider';
import { GoogleProvider } from '../providers/google_provider';
import modelsConfig from '../config/models.json';

export class LLMGateway {
  private providers: Map<string, LLMProvider> = new Map();
  private models: ModelConfig[] = [];
  private defaultProvider: string;
  private fallbackChain: string[];

  constructor() {
    this.defaultProvider = (modelsConfig as any).defaultProvider;
    this.fallbackChain = (modelsConfig as any).fallbackChain;
    this.models = Object.values((modelsConfig as any).providers)
      .flatMap((p: any) => p.models);
    
    this.initializeProviders();
  }

  private initializeProviders() {
    const providers = (modelsConfig as any).providers;

    // Initialize Ollama (no API key needed)
    if (providers.ollama) {
      this.providers.set('ollama', new OllamaProvider(providers.ollama.baseUrl));
    }

    // Initialize OpenAI
    if (providers.openai) {
      const apiKey = process.env[providers.openai.apiKeyEnvVar];
      if (apiKey) {
        this.providers.set('openai', new OpenAIProvider(apiKey, providers.openai.baseUrl));
      }
    }

    // Initialize Anthropic
    if (providers.anthropic) {
      const apiKey = process.env[providers.anthropic.apiKeyEnvVar];
      if (apiKey) {
        this.providers.set('anthropic', new AnthropicProvider(apiKey, providers.anthropic.baseUrl));
      }
    }

    // Initialize Google
    if (providers.google) {
      const apiKey = process.env[providers.google.apiKeyEnvVar];
      if (apiKey) {
        this.providers.set('google', new GoogleProvider(apiKey, providers.google.baseUrl));
      }
    }
  }

  async generate(prompt: string, options?: GenerationOptions): Promise<GenerationResponse> {
    const modelId = options?.model || this.getDefaultModel();
    const providerName = this.getProviderFromModel(modelId);

    if (!providerName) {
      throw new Error(`No provider found for model: ${modelId}`);
    }

    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider not initialized: ${providerName}`);
    }

    try {
      return await provider.generate(prompt, { ...options, model: modelId });
    } catch (error: any) {
      // Try fallback chain if available
      console.error(`Generation failed with ${providerName}: ${error.message}`);
      return await this.tryFallback(prompt, options, providerName);
    }
  }

  async *stream(prompt: string, options?: GenerationOptions): AsyncGenerator<string> {
    const modelId = options?.model || this.getDefaultModel();
    const providerName = this.getProviderFromModel(modelId);

    if (!providerName) {
      throw new Error(`No provider found for model: ${modelId}`);
    }

    const provider = this.providers.get(providerName);
    if (!provider || !provider.stream) {
      throw new Error(`Provider does not support streaming: ${providerName}`);
    }

    yield* provider.stream(prompt, { ...options, model: modelId });
  }

  private async tryFallback(
    prompt: string,
    options?: GenerationOptions,
    failedProvider?: string
  ): Promise<GenerationResponse> {
    const fallbackProviders = failedProvider
      ? this.fallbackChain.filter(p => p !== failedProvider)
      : this.fallbackChain;

    for (const providerName of fallbackProviders) {
      const provider = this.providers.get(providerName);
      if (provider) {
        try {
          console.log(`Trying fallback provider: ${providerName}`);
          return await provider.generate(prompt, options);
        } catch (error: any) {
          console.error(`Fallback ${providerName} failed: ${error.message}`);
          continue;
        }
      }
    }

    throw new Error('All providers in fallback chain failed');
  }

  getProviderFromModel(modelId: string): string | null {
    const model = this.models.find(m => m.id === modelId);
    return model ? model.provider : null;
  }

  getDefaultModel(): string {
    const defaultProviderModels = this.models.filter(m => m.provider === this.defaultProvider);
    return defaultProviderModels.length > 0 ? defaultProviderModels[0].id : this.models[0].id;
  }

  listModels(): ModelConfig[] {
    return this.models;
  }

  listAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  async healthCheck(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    
    for (const [name, provider] of this.providers.entries()) {
      if ('checkHealth' in provider) {
        results.set(name, await (provider as any).checkHealth());
      } else {
        results.set(name, true); // Assume healthy if no health check method
      }
    }
    
    return results;
  }
}

// Singleton instance
let gatewayInstance: LLMGateway | null = null;

export function getLLMGateway(): LLMGateway {
  if (!gatewayInstance) {
    gatewayInstance = new LLMGateway();
  }
  return gatewayInstance;
}
