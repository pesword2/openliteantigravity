export interface LLMProvider {
  name: string;
  generate(prompt: string, options?: GenerationOptions): Promise<GenerationResponse>;
  stream?(prompt: string, options?: GenerationOptions): AsyncGenerator<string>;
}

export interface GenerationOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
  systemPrompt?: string;
}

export interface GenerationResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  provider: string;
}

export interface ModelConfig {
  id: string;
  provider: string;
  name: string;
  contextWindow: number;
  inputCostPer1k?: number;
  outputCostPer1k?: number;
  supportsStreaming?: boolean;
  isLocal?: boolean;
}

export interface ProviderConfig {
  name: string;
  apiKeyEnvVar?: string;
  baseUrl?: string;
  models: ModelConfig[];
}
