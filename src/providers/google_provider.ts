import axios from 'axios';
import { LLMProvider, GenerationOptions, GenerationResponse } from '../types';

export class GoogleProvider implements LLMProvider {
  name = 'google';
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = 'https://generativelanguage.googleapis.com/v1beta') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async generate(prompt: string, options?: GenerationOptions): Promise<GenerationResponse> {
    const model = options?.model?.replace('google/', '') || 'gemini-pro';
    
    try {
      const response = await axios.post(
        `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: options?.temperature,
            maxOutputTokens: options?.maxTokens,
            topP: options?.topP,
            stopSequences: options?.stopSequences,
          },
          systemInstruction: options?.systemPrompt ? { parts: [{ text: options.systemPrompt }] } : undefined,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const data = response.data;
      const content = data.candidates[0].content.parts[0].text;
      
      return {
        content: content,
        usage: {
          promptTokens: data.usageMetadata?.promptTokenCount || 0,
          completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: data.usageMetadata?.totalTokenCount || 0,
        },
        model: `google/${model}`,
        provider: this.name,
      };
    } catch (error: any) {
      throw new Error(`Google generation failed: ${error.message}`);
    }
  }

  async *stream(prompt: string, options?: GenerationOptions): AsyncGenerator<string> {
    const model = options?.model?.replace('google/', '') || 'gemini-pro';
    
    try {
      const response = await axios.post(
        `${this.baseUrl}/models/${model}:streamGenerateContent?key=${this.apiKey}&alt=sse`,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: options?.temperature,
            maxOutputTokens: options?.maxTokens,
            topP: options?.topP,
            stopSequences: options?.stopSequences,
          },
          systemInstruction: options?.systemPrompt ? { parts: [{ text: options.systemPrompt }] } : undefined,
        },
        {
          headers: {
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
              const content = parsed.candidates[0]?.content?.parts[0]?.text;
              if (content) {
                yield content;
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error: any) {
      throw new Error(`Google streaming failed: ${error.message}`);
    }
  }
}
