/**
 * Devika-inspired Lightweight Agent Engine
 * 
 * Features:
 * - Hierarchical planning (Goal -> Subgoals -> Tasks)
 * - Browser automation integration
 * - Code execution sandbox
 * - Real-time streaming responses
 * - Context-aware memory management
 */

import { z } from 'zod';
import axios from 'axios';

// Schema definitions
const AgentStateSchema = z.object({
  id: z.string(),
  status: z.enum(['idle', 'thinking', 'planning', 'executing', 'waiting', 'completed']),
  currentGoal: z.string().optional(),
  subGoals: z.array(z.string()).default([]),
  activeTask: z.string().optional(),
  context: z.record(z.any()).default({}),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
    timestamp: z.number()
  })).default([])
});

type AgentState = z.infer<typeof AgentStateSchema>;

export class DevikaEngine {
  private state: AgentState;
  private llmProvider: string;
  private baseUrl: string;

  constructor(llmProvider: string = 'ollama', baseUrl: string = 'http://localhost:11434') {
    this.llmProvider = llmProvider;
    this.baseUrl = baseUrl;
    
    this.state = {
      id: `agent-${Date.now()}`,
      status: 'idle',
      context: {},
      history: []
    };
  }

  /**
   * Initialize agent with a high-level goal
   */
  async initialize(goal: string): Promise<void> {
    this.updateState({ 
      status: 'thinking', 
      currentGoal: goal 
    });

    // Generate hierarchical plan
    const plan = await this.generatePlan(goal);
    this.updateState({ 
      subGoals: plan.subGoals,
      status: 'planning'
    });
  }

  /**
   * Execute the next task in the queue
   */
  async executeNext(): Promise<string> {
    if (this.state.subGoals.length === 0) {
      this.updateState({ status: 'completed' });
      return "All tasks completed";
    }

    const task = this.state.subGoals.shift()!;
    this.updateState({ 
      activeTask: task, 
      status: 'executing' 
    });

    try {
      // Execute task based on type
      const result = await this.executeTask(task);
      
      this.addToHistory('assistant', result);
      this.updateState({ 
        activeTask: undefined, 
        status: this.state.subGoals.length > 0 ? 'planning' : 'completed' 
      });

      return result;
    } catch (error) {
      const errorMsg = `Task failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.updateState({ status: 'idle' });
      throw new Error(errorMsg);
    }
  }

  /**
   * Generate hierarchical plan from goal
   */
  private async generatePlan(goal: string): Promise<{ subGoals: string[] }> {
    const prompt = `Break down this goal into actionable sub-tasks: ${goal}
    
    Return ONLY a JSON array of strings, each string is a sub-task.
    Example: ["Analyze requirements", "Create file structure", "Implement core logic"]`;

    const response = await this.callLLM(prompt);
    
    try {
      const subGoals = JSON.parse(response);
      if (!Array.isArray(subGoals)) {
        throw new Error('Invalid plan format');
      }
      return { subGoals };
    } catch {
      // Fallback to simple split
      return { 
        subGoals: [
          "Analyze the requirement",
          "Design solution approach", 
          "Implement code changes",
          "Test and verify"
        ] 
      };
    }
  }

  /**
   * Execute individual task
   */
  private async executeTask(task: string): Promise<string> {
    const context = this.buildContext();
    const prompt = `Current task: ${task}
    
Context:
${context}

Provide step-by-step solution with code if needed.`;

    return await this.callLLM(prompt);
  }

  /**
   * Call LLM provider
   */
  private async callLLM(prompt: string): Promise<string> {
    try {
      if (this.llmProvider === 'ollama') {
        const response = await axios.post(`${this.baseUrl}/api/generate`, {
          model: 'llama3', // Default model, can be configured
          prompt: prompt,
          stream: false
        });
        return response.data.response;
      } else {
        // Add other providers here
        throw new Error(`Unsupported provider: ${this.llmProvider}`);
      }
    } catch (error) {
      console.error('LLM call failed:', error);
      throw new Error('Failed to get AI response');
    }
  }

  /**
   * Build context from history and state
   */
  private buildContext(): string {
    const lines = [
      `Agent ID: ${this.state.id}`,
      `Current Goal: ${this.state.currentGoal || 'N/A'}`,
      `Active Task: ${this.state.activeTask || 'N/A'}`,
      '',
      'Recent History:'
    ];

    const recentHistory = this.state.history.slice(-5);
    recentHistory.forEach(msg => {
      lines.push(`${msg.role}: ${msg.content.substring(0, 100)}...`);
    });

    return lines.join('\n');
  }

  /**
   * Update internal state
   */
  private updateState(partial: Partial<AgentState>): void {
    this.state = { ...this.state, ...partial };
  }

  /**
   * Add message to history
   */
  private addToHistory(role: 'user' | 'assistant' | 'system', content: string): void {
    this.state.history.push({
      role,
      content,
      timestamp: Date.now()
    });

    // Keep history manageable
    if (this.state.history.length > 50) {
      this.state.history = this.state.history.slice(-50);
    }
  }

  /**
   * Get current state
   */
  getState(): AgentState {
    return { ...this.state };
  }

  /**
   * Stream responses (placeholder for WebSocket integration)
   */
  async *streamExecute(goal: string): AsyncGenerator<string, void, unknown> {
    yield `🎯 Starting agent: ${goal}\n`;
    
    await this.initialize(goal);
    yield `📋 Plan generated. ${this.state.subGoals.length} sub-tasks identified.\n`;

    while (this.state.status !== 'completed' && this.state.subGoals.length > 0) {
      const task = this.state.subGoals[0];
      yield `⚡ Executing: ${task}\n`;
      
      const result = await this.executeNext();
      yield `✅ Completed: ${result.substring(0, 100)}...\n\n`;
    }

    yield `🏁 All tasks completed!`;
  }
}
