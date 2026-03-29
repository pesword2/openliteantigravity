import axios from 'axios';
import { LLMProvider, GenerationOptions, GenerationResponse } from '../types';

export class AnthropicProvider implements LLMProvider {
  name = 'anthropic';
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = 'https://api.anthropic.com/v1') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async generate(prompt: string, options?: GenerationOptions): Promise<GenerationResponse> {
    const model = options?.model?.replace('anthropic/', '') || 'claude-3-haiku-20240307';
    
    try {
      const response = await axios.post(
        `${this.baseUrl}/messages`,
        {
          model: model,
          max_tokens: options?.maxTokens || 1024,
          system: options?.systemPrompt,
          messages: [
            { role: 'user', content: prompt },
          ],
        },
        {
          headers: {
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
        }
      );

      const data = response.data;
      
      return {
        content: data.content[0].text,
        usage: {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
          totalTokens: data.usage.input_tokens + data.usage.output_tokens,
        },
        model: `anthropic/${model}`,
        provider: this.name,
      };
    } catch (error: any) {
      throw new Error(`Anthropic generation failed: ${error.message}`);
    }
  }

  async *stream(prompt: string, options?: GenerationOptions): AsyncGenerator<string> {
    const model = options?.model?.replace('anthropic/', '') || 'claude-3-haiku-20240307';
    
    try {
      const response = await axios.post(
        `${this.baseUrl}/messages`,
        {
          model: model,
          max_tokens: options?.maxTokens || 1024,
          system: options?.systemPrompt,
          messages: [
            { role: 'user', content: prompt },
          ],
          stream: true,
        },
        {
          headers: {
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          responseType: 'stream',
        }
      );

      for await (const chunk of response.data) {
        const lines = chunk.toString().split('\n').filter(line => line.trim());
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                yield parsed.delta.text;
              }
              if (parsed.type === 'message_stop') {
                break;
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error: any) {
      throw new Error(`Anthropic streaming failed: ${error.message}`);
    }
  }
}
