import { LLMGateway, getLLMGateway } from './gateway/llm_gateway';

export { LLMGateway, getLLMGateway };
export * from './types';
export * from './providers/ollama_provider';
export * from './providers/openai_provider';
export * from './providers/anthropic_provider';
export * from './providers/google_provider';

// Main entry point example
async function main() {
  console.log('Open Lite Antigravity - LLM Gateway');
  console.log('====================================\n');

  const gateway = getLLMGateway();

  // List available models
  console.log('Available Models:');
  gateway.listModels().forEach(model => {
    console.log(`  - ${model.id} (${model.name}) [${model.provider}]`);
  });

  console.log('\nAvailable Providers:', gateway.listAvailableProviders());

  // Example generation with Ollama (default)
  try {
    console.log('\n--- Testing Ollama Generation ---');
    const response = await gateway.generate('Hello! Write a short poem about coding.', {
      model: 'ollama/llama3',
      temperature: 0.7,
      maxTokens: 100,
    });

    console.log('Model:', response.model);
    console.log('Provider:', response.provider);
    console.log('Content:', response.content);
    console.log('Tokens Used:', response.usage?.totalTokens || 'N/A');
  } catch (error: any) {
    console.error('Generation error:', error.message);
  }

  // Example streaming
  try {
    console.log('\n--- Testing Streaming ---');
    const stream = gateway.stream('Count from 1 to 5.', {
      model: 'ollama/llama3',
    });

    process.stdout.write('Stream output: ');
    for await (const chunk of stream) {
      process.stdout.write(chunk);
    }
    console.log('\n');
  } catch (error: any) {
    console.error('Streaming error:', error.message);
  }

  // Health check
  console.log('\n--- Provider Health Check ---');
  const health = await gateway.healthCheck();
  health.forEach((isHealthy, provider) => {
    console.log(`${provider}: ${isHealthy ? '✅ Healthy' : '❌ Unhealthy'}`);
  });
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}
