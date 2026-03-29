import { GenerationOptions, GenerationResponse } from '../types';

/**
 * Calculates the cost of a generation based on token usage and model pricing
 */
export function calculateCost(
  usage: { promptTokens: number; completionTokens: number },
  inputCostPer1k: number,
  outputCostPer1k: number
): number {
  const inputCost = (usage.promptTokens / 1000) * inputCostPer1k;
  const outputCost = (usage.completionTokens / 1000) * outputCostPer1k;
  return inputCost + outputCost;
}

/**
 * Truncates text to a maximum length while preserving readability
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Formats tokens into a human-readable format
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(2)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

/**
 * Validates generation options
 */
export function validateOptions(options?: GenerationOptions): Partial<GenerationOptions> {
  const validated: Partial<GenerationOptions> = {};

  if (options?.temperature !== undefined) {
    validated.temperature = Math.max(0, Math.min(2, options.temperature));
  }

  if (options?.maxTokens !== undefined) {
    validated.maxTokens = Math.max(1, Math.min(100000, options.maxTokens));
  }

  if (options?.topP !== undefined) {
    validated.topP = Math.max(0, Math.min(1, options.topP));
  }

  return validated;
}

/**
 * Sleep utility for rate limiting
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry wrapper with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const delay = baseDelay * Math.pow(2, attempt);
      console.warn(`Attempt ${attempt + 1} failed. Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }

  throw lastError || new Error('All retries failed');
}

/**
 * Generates a unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
