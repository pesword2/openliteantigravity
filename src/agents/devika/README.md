# Devika-Inspired Agent Engine for OpenLiteAntigravity

Lightweight, modular AI agent system inspired by Devika's architecture, integrated with Model Context Protocol (MCP) for seamless tool interaction.

## Features

- **Hierarchical Planning**: Breaks down high-level goals into actionable sub-tasks
- **MCP Integration**: Full Model Context Protocol support for external tool communication
- **Multi-Provider Support**: Works with Ollama (local), OpenAI, Anthropic, and more
- **Streaming Responses**: Real-time task execution updates
- **Context-Aware Memory**: Maintains conversation history and execution context
- **Lightweight Design**: Minimal dependencies, fast startup, low resource usage

## Architecture

```
┌─────────────────┐
│   MCP Client    │ ←→ External Tools/UI
└────────┬────────┘
         │ MCP Protocol
┌────────▼────────┐
│  MCP Adapter    │ ←→ Tool Handler
└────────┬────────┘
         │
┌────────▼────────┐
│  Devika Engine  │ ←→ Planning & Execution
└────────┬────────┘
         │
┌────────▼────────┐
│  LLM Provider   │ ←→ Ollama/OpenAI/Anthropic
└─────────────────┘
```

## Installation

```bash
cd src/agents/devika
npm install
```

## Usage

### As a Library

```typescript
import { DevikaEngine } from './devika_engine.js';

// Initialize engine with Ollama (default)
const agent = new DevikaEngine('ollama', 'http://localhost:11434');

// Set a high-level goal
await agent.initialize('Create a REST API with Express.js');

// Execute tasks one by one
while (true) {
  const result = await agent.executeNext();
  console.log(result);
  
  if (agent.getState().status === 'completed') {
    break;
  }
}
```

### Streaming Mode

```typescript
for await (const update of agent.streamExecute('Build a todo app')) {
  process.stdout.write(update);
}
```

### Via MCP Server

Start the MCP server:

```bash
npm run start:mcp
```

Available MCP tools:

1. **initialize_agent** - Set goal and generate plan
2. **execute_next_task** - Run next task in queue
3. **get_agent_state** - Retrieve current agent status
4. **chat_with_agent** - Send messages and get responses
5. **reset_agent** - Clear state and restart

## Configuration

Edit `devika_config.json` to customize:

- Default LLM provider and model
- Ollama base URL
- Task execution timeout
- Maximum history length
- Retry policies

## Example Workflow

```
User Goal: "Create a Python Flask API with user authentication"

1. Agent initializes and generates plan:
   - Analyze requirements
   - Set up Flask project structure
   - Implement user models
   - Create authentication endpoints
   - Add JWT token handling
   - Write tests

2. Execute each task sequentially:
   ⚡ Executing: Analyze requirements
   ✅ Completed: [Analysis output]
   
   ⚡ Executing: Set up Flask project structure
   ✅ Completed: [Code generation]
   
   ... continues until all tasks done

3. Final state: completed
```

## Integration with OpenLiteAntigravity

The Devika engine integrates with the main OpenLiteAntigravity system through:

- **LLM Gateway**: Uses existing provider abstraction
- **MCP Protocol**: Standardized tool communication
- **Shared Config**: Centralized configuration management
- **Unified Logging**: Consistent observability

## Development

```bash
# Build TypeScript
npm run build

# Run in development mode
npm run dev

# Start MCP server
npm run start:mcp
```

## Roadmap

- [ ] Browser automation integration
- [ ] Code execution sandbox
- [ ] Multi-agent collaboration
- [ ] Visual planning interface
- [ ] Plugin system for custom tools
- [ ] Enhanced memory management (vector DB)

## License

MIT
