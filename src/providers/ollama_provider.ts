import axios from 'axios';
import { LLMProvider, GenerationOptions, GenerationResponse } from '../types';

export class OllamaProvider implements LLMProvider {
  name = 'ollama';
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:11434') {
    this.baseUrl = baseUrl;
  }

  async generate(prompt: string, options?: GenerationOptions): Promise<GenerationResponse> {
    const model = options?.model?.replace('ollama/', '') || 'llama3';
    
    try {
      const response = await axios.post(`${this.baseUrl}/api/generate`, {
        model: model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: options?.temperature,
          num_predict: options?.maxTokens,
          top_p: options?.topP,
          stop: options?.stopSequences,
        },
        system: options?.systemPrompt,
      });

      const data = response.data;
      
      return {
        content: data.response,
        usage: {
          promptTokens: data.prompt_eval_count || 0,
          completionTokens: data.eval_count || 0,
          totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
        },
        model: `ollama/${model}`,
        provider: this.name,
      };
    } catch (error: any) {
      throw new Error(`Ollama generation failed: ${error.message}`);
    }
  }

  async *stream(prompt: string, options?: GenerationOptions): AsyncGenerator<string> {
    const model = options?.model?.replace('ollama/', '') || 'llama3';
    
    try {
      const response = await axios.post(`${this.baseUrl}/api/generate`, {
        model: model,
        prompt: prompt,
        stream: true,
        options: {
          temperature: options?.temperature,
          num_predict: options?.maxTokens,
          top_p: options?.topP,
          stop: options?.stopSequences,
        },
        system: options?.systemPrompt,
      }, {
        responseType: 'stream',
      });

      for await (const chunk of response.data) {
        const lines = chunk.toString().split('\n').filter(line => line.trim());
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.response) {
              yield parsed.response;
            }
            if (parsed.done) {
              break;
            }
          } catch {
            // Skip invalid JSON lines
          }
        }
      }
    } catch (error: any) {
      throw new Error(`Ollama streaming failed: ${error.message}`);
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/tags`);
      return response.status === 200;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/tags`);
      return response.data.models.map((m: any) => `ollama/${m.name}`);
    } catch {
      return [];
    }
  }
}
