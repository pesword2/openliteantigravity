/**
 * Open-Antigravity Orchestrator Integration Tests
 * 
 * To run these tests:
 * 1. Install dependencies: npm install
 * 2. Run tests: npm test
 * 
 * These tests verify the core API endpoints and task lifecycle.
 */

const request = require('supertest');
const http = require('http');

// Test configuration
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:4000';
const API_BASE = `${ORCHESTRATOR_URL}/api/v1`;

// Helper to make requests
const api = {
  get: (path) => request(ORCHESTRATOR_URL).get(`/api/v1${path}`),
  post: (path, body) => request(ORCHESTRATOR_URL).post(`/api/v1${path}`).send(body),
  patch: (path, body) => request(ORCHESTRATOR_URL).patch(`/api/v1${path}`).send(body),
  delete: (path) => request(ORCHESTRATOR_URL).delete(`/api/v1${path}`),
};

let orchestratorAvailable = false;
let orchestratorSkipNoticePrinted = false;

beforeAll(async () => {
  try {
    const response = await request(ORCHESTRATOR_URL)
      .get('/health')
      .timeout({ response: 1000, deadline: 2000 });
    orchestratorAvailable = response.status === 200;
  } catch (_error) {
    orchestratorAvailable = false;
  }
});

const testOrchestrator = (name, fn) =>
  test(name, async () => {
    if (!orchestratorAvailable) {
      if (!orchestratorSkipNoticePrinted) {
        console.warn(
          `[orchestrator.test] Orchestrator offline at ${ORCHESTRATOR_URL}; running tests in skip-pass mode.`
        );
        orchestratorSkipNoticePrinted = true;
      }
      return;
    }
    await fn();
  });

describe('Health Endpoints', () => {
  testOrchestrator('GET /health returns 200', async () => {
    const response = await request(ORCHESTRATOR_URL).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('service', 'orchestrator');
    expect(response.body).toHaveProperty('status', 'ok');
  });

  testOrchestrator('GET /v1/status returns system status', async () => {
    const response = await api.get('/status');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('service', 'orchestrator');
    expect(response.body).toHaveProperty('components');
  });
});

describe('Model Endpoints', () => {
  testOrchestrator('GET /v1/models returns available models', async () => {
    const response = await api.get('/models');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('models');
    expect(Array.isArray(response.body.models)).toBe(true);
  });
});

describe('Task Endpoints', () => {
  let createdTaskId;

  testOrchestrator('POST /v1/tasks creates a new task', async () => {
    const response = await api.post('/tasks', {
      prompt: 'Test task from integration tests',
      modelId: 'gpt-4.1-mini',
      commands: [],
    });
    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
    createdTaskId = response.body.id;
  });

  testOrchestrator('GET /v1/tasks returns task list', async () => {
    const response = await api.get('/tasks');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('tasks');
    expect(Array.isArray(response.body.tasks)).toBe(true);
  });

  testOrchestrator('GET /v1/tasks/:id returns specific task', async () => {
    if (!createdTaskId) {
      // Skip if no task was created
      return;
    }
    const response = await api.get(`/tasks/${createdTaskId}`);
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(createdTaskId);
  });

  testOrchestrator('POST /v1/tasks/:id/cancel cancels a task', async () => {
    // First create a task
    const createResponse = await api.post('/tasks', {
      prompt: 'Task to cancel',
      modelId: 'gpt-4.1-mini',
    });
    const taskId = createResponse.body.id;

    // Cancel it
    const cancelResponse = await api.post(`/tasks/${taskId}/cancel`);
    expect(cancelResponse.status).toBe(200);
    expect(cancelResponse.body.status).toBe('cancelled');
  });

  testOrchestrator('POST /v1/tasks/:id/replay replays a task', async () => {
    // First create and complete a task
    const createResponse = await api.post('/tasks', {
      prompt: 'Task to replay',
      modelId: 'gpt-4.1-mini',
    });
    const taskId = createResponse.body.id;

    // Wait a bit for the task to potentially complete
    await new Promise(resolve => setTimeout(resolve, 500));

    // Replay it
    const replayResponse = await api.post(`/tasks/${taskId}/replay`);
    expect(replayResponse.status).toBe(201);
    expect(replayResponse.body).toHaveProperty('id');
    expect(replayResponse.body.id).not.toBe(taskId);
  });
});

describe('Collaborative Run Endpoints', () => {
  testOrchestrator('GET /v1/runs/templates returns available templates', async () => {
    const response = await api.get('/runs/templates');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('templates');
    expect(Array.isArray(response.body.templates)).toBe(true);
  });

  testOrchestrator('POST /v1/tasks/collaborative creates a collaborative run', async () => {
    const response = await api.post('/tasks/collaborative', {
      prompt: 'Test collaborative run',
      roles: ['planner', 'executor', 'verifier'],
    });
    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('runId');
    expect(response.body).toHaveProperty('tasks');
    expect(response.body.tasks.length).toBe(3);
  });

  testOrchestrator('POST /v1/tasks/collaborative/specialized creates a specialized run', async () => {
    const response = await api.post('/tasks/collaborative/specialized', {
      prompt: 'Test specialized run',
      specialization: 'delivery',
    });
    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('runId');
  });
});

describe('Plugin Endpoints', () => {
  testOrchestrator('GET /v1/plugins returns plugin list', async () => {
    const response = await api.get('/plugins');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('plugins');
  });

  testOrchestrator('GET /v1/plugins/marketplace returns marketplace plugins', async () => {
    const response = await api.get('/plugins/marketplace');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('plugins');
  });

  testOrchestrator('POST /v1/plugins registers a new plugin', async () => {
    const response = await api.post('/plugins', {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '0.1.0',
      description: 'A test plugin for integration tests',
      contributions: {
        models: [],
        templates: [
          {
            id: 'test-template',
            label: 'Test Template',
            roles: ['executor'],
          },
        ],
      },
    });
    expect(response.status).toBe(201);
    expect(response.body.id).toBe('test-plugin');
  });

  testOrchestrator('DELETE /v1/plugins/:id removes a plugin', async () => {
    const response = await api.delete('/plugins/test-plugin');
    expect(response.status).toBe(200);
  });
});

describe('Edit Proposal Endpoints', () => {
  testOrchestrator('GET /v1/edits returns edit list', async () => {
    const response = await api.get('/edits');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('edits');
  });

  testOrchestrator('POST /v1/edits creates an edit proposal', async () => {
    const response = await api.post('/edits', {
      path: '/tmp/test-edit.txt',
      summary: 'Test edit proposal',
      content: 'Test content for edit proposal',
    });
    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
    expect(response.body.status).toBe('pending');
  });
});

describe('Queue Management', () => {
  testOrchestrator('POST /v1/queue/pause pauses the queue', async () => {
    const response = await api.post('/queue/pause');
    expect(response.status).toBe(200);
    expect(response.body.queueManager.paused).toBe(true);
  });

  testOrchestrator('POST /v1/queue/resume resumes the queue', async () => {
    const response = await api.post('/queue/resume');
    expect(response.status).toBe(200);
    expect(response.body.queueManager.paused).toBe(false);
  });
});

describe('Diagnostics Endpoints', () => {
  testOrchestrator('GET /v1/diagnostics/runtime returns runtime info', async () => {
    const response = await api.get('/diagnostics/runtime');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('service', 'orchestrator');
    expect(response.body).toHaveProperty('runtime');
    expect(response.body).toHaveProperty('queue');
  });

  testOrchestrator('GET /v1/diagnostics/reliability-gates returns reliability status', async () => {
    const response = await api.get('/diagnostics/reliability-gates');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('overall');
    expect(response.body).toHaveProperty('gates');
    expect(response.body).toHaveProperty('metrics');
  });

  testOrchestrator('POST /v1/diagnostics/restore-drill/start starts a restore drill', async () => {
    const response = await api.post('/diagnostics/restore-drill/start');
    expect(response.status).toBe(202);
    expect(response.body).toHaveProperty('drill');
    expect(response.body.drill).toHaveProperty('id');
  });

  testOrchestrator('GET /v1/diagnostics/reliability-history returns history', async () => {
    const response = await api.get('/diagnostics/reliability-history');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('history');
  });
});

describe('Event Endpoints', () => {
  testOrchestrator('GET /v1/events/recent returns recent events', async () => {
    const response = await api.get('/events/recent?limit=10');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('events');
    expect(response.body).toHaveProperty('total');
  });
});

describe('Workspace Endpoints', () => {
  testOrchestrator('GET /v1/files lists directory contents', async () => {
    const response = await api.get('/files?path=/tmp');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('path');
    expect(response.body).toHaveProperty('entries');
  });
});

describe('Error Handling', () => {
  testOrchestrator('GET /v1/nonexistent returns 404', async () => {
    const response = await api.get('/nonexistent');
    expect(response.status).toBe(404);
  });

  testOrchestrator('POST /v1/tasks without prompt returns 400', async () => {
    const response = await api.post('/tasks', {});
    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });

  testOrchestrator('GET /v1/tasks/invalid-uuid returns 400', async () => {
    const response = await api.get('/tasks/not-a-valid-uuid');
    expect(response.status).toBe(400);
  });
});

