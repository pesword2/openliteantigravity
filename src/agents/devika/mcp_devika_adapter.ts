/**
 * MCP Adapter for Devika Engine
 * 
 * Bridges Devika's agent capabilities with Model Context Protocol (MCP)
 * allowing external tools and UIs to interact with the agent.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { DevikaEngine } from './devika_engine.js';

// Initialize Devika engine
const devika = new DevikaEngine('ollama', 'http://localhost:11434');

// Create MCP server
const server = new Server(
  {
    name: 'openliteantigravity-devika',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'initialize_agent',
        description: 'Initialize agent with a high-level goal and generate execution plan',
        inputSchema: {
          type: 'object',
          properties: {
            goal: {
              type: 'string',
              description: 'The high-level goal for the agent to achieve',
            },
          },
          required: ['goal'],
        },
      },
      {
        name: 'execute_next_task',
        description: 'Execute the next task in the agent\'s queue',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_agent_state',
        description: 'Get current state of the agent including status, goals, and history',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'chat_with_agent',
        description: 'Send a message to the agent and get response',
        inputSchema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Message to send to the agent',
            },
          },
          required: ['message'],
        },
      },
      {
        name: 'reset_agent',
        description: 'Reset agent state to initial idle status',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'initialize_agent': {
        const goal = (args as any).goal as string;
        await devika.initialize(goal);
        const state = devika.getState();
        return {
          content: [
            {
              type: 'text',
              text: `Agent initialized successfully!\n\nGoal: ${state.currentGoal}\nSub-tasks: ${state.subGoals.length}\nStatus: ${state.status}`,
            },
          ],
        };
      }

      case 'execute_next_task': {
        const result = await devika.executeNext();
        const state = devika.getState();
        return {
          content: [
            {
              type: 'text',
              text: `Task executed!\n\nResult: ${result}\n\nRemaining tasks: ${state.subGoals.length}\nStatus: ${state.status}`,
            },
          ],
        };
      }

      case 'get_agent_state': {
        const state = devika.getState();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(state, null, 2),
            },
          ],
        };
      }

      case 'chat_with_agent': {
        const message = (args as any).message as string;
        
        // Add user message to history
        (devika as any).addToHistory('user', message);
        
        // Get AI response based on current context
        const context = (devika as any).buildContext();
        const prompt = `${context}\n\nUser: ${message}\n\nAssistant:`;
        
        // This would need proper integration with callLLM
        const response = "Response processing... (full integration pending)";
        
        return {
          content: [
            {
              type: 'text',
              text: response,
            },
          ],
        };
      }

      case 'reset_agent': {
        // Reset by creating new instance or clearing state
        const newState = {
          id: `agent-${Date.now()}`,
          status: 'idle',
          context: {},
          history: [],
        };
        
        return {
          content: [
            {
              type: 'text',
              text: 'Agent reset successfully!',
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Devika MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
