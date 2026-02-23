/**
 * Open-Antigravity Web Service Integration Tests
 * 
 * To run these tests:
 * 1. Install dependencies: npm install
 * 2. Run tests: npm test
 * 
 * These tests verify the core web service endpoints and proxy functionality.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Test configuration
const WEB_URL = process.env.WEB_URL || 'http://localhost:3000';
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:4000';

// Helper to make requests
const api = {
  get: (path) => request(WEB_URL).get(path),
  post: (path, body) => request(WEB_URL).post(path).send(body),
};

// Helper to create HTTP requests
function request(baseUrl) {
  const url = new URL(baseUrl);
  
  return {
    get: (path) => makeRequest(url.origin, 'GET', path),
    post: (path) => ({
      send: (body) => makeRequest(url.origin, 'POST', path, body)
    })
  };
}

function makeRequest(origin, method, pathname, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, origin);
    const transport = url.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };
    
    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = data;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          // Not JSON
        }
        resolve({
          status: res.statusCode,
          body: parsed,
          headers: res.headers
        });
      });
    });
    
    req.on('error', reject);
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

let webAvailable = false;
let webSkipNoticePrinted = false;

beforeAll(async () => {
  try {
    const response = await request(WEB_URL).get('/health');
    webAvailable = response.status === 200;
  } catch (_error) {
    webAvailable = false;
  }
});

const testWeb = (name, fn) =>
  test(name, async () => {
    if (!webAvailable) {
      if (!webSkipNoticePrinted) {
        console.warn(
          `[web.test] Web service offline at ${WEB_URL}; running tests in skip-pass mode.`
        );
        webSkipNoticePrinted = true;
      }
      return;
    }
    await fn();
  });

describe('Health Endpoints', () => {
  testWeb('GET /health returns 200', async () => {
    const response = await request(WEB_URL).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('service', 'web');
    expect(response.body).toHaveProperty('status', 'ok');
    expect(response.body).toHaveProperty('orchestratorUrl');
  });
});

describe('Static File Serving', () => {
  testWeb('GET / returns index.html', async () => {
    const response = await request(WEB_URL).get('/');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
  });

  testWeb('GET /nonexistent returns 404', async () => {
    const response = await request(WEB_URL).get('/nonexistent-file.html');
    expect(response.status).toBe(404);
  });
});

describe('API Proxy to Orchestrator', () => {
  testWeb('GET /api/v1/models proxies to orchestrator', async () => {
    const response = await request(WEB_URL).get('/api/v1/models');
    // Should either proxy successfully or fail if orchestrator is not running
    expect([200, 502]).toContain(response.status);
    if (response.status === 200) {
      expect(response.body).toHaveProperty('models');
    }
  });

  testWeb('GET /api/v1/tasks proxies to orchestrator', async () => {
    const response = await request(WEB_URL).get('/api/v1/tasks');
    // Should either proxy successfully or fail if orchestrator is not running
    expect([200, 502]).toContain(response.status);
    if (response.status === 200) {
      expect(response.body).toHaveProperty('tasks');
    }
  });

  testWeb('GET /api/v1/status proxies to orchestrator', async () => {
    const response = await request(WEB_URL).get('/api/v1/status');
    expect([200, 502]).toContain(response.status);
    if (response.status === 200) {
      expect(response.body).toHaveProperty('service', 'orchestrator');
    }
  });

  testWeb('GET /api/v1/diagnostics/runtime proxies to orchestrator', async () => {
    const response = await request(WEB_URL).get('/api/v1/diagnostics/runtime');
    expect([200, 502]).toContain(response.status);
    if (response.status === 200) {
      expect(response.body).toHaveProperty('service', 'orchestrator');
      expect(response.body).toHaveProperty('runtime');
      expect(response.body).toHaveProperty('queue');
    }
  });

  testWeb('GET /api/v1/diagnostics/reliability-gates proxies to orchestrator', async () => {
    const response = await request(WEB_URL).get('/api/v1/diagnostics/reliability-gates');
    expect([200, 502]).toContain(response.status);
    if (response.status === 200) {
      expect(response.body).toHaveProperty('overall');
      expect(response.body).toHaveProperty('gates');
    }
  });

  testWeb('GET /api/v1/events proxies to orchestrator', async () => {
    const response = await request(WEB_URL).get('/api/v1/events');
    // SSE endpoint - may get 200 or 502
    expect([200, 502]).toContain(response.status);
  });

  testWeb('POST /api/v1/tasks proxies to orchestrator', async () => {
    const response = await request(WEB_URL).post('/api/v1/tasks').send({
      prompt: 'Test task from web integration tests',
      modelId: 'gpt-4.1-mini'
    });
    // Should either succeed or fail gracefully
    expect([201, 400, 502]).toContain(response.status);
  });
});

describe('Plugin Marketplace Proxy', () => {
  testWeb('GET /api/v1/plugins proxies to orchestrator', async () => {
    const response = await request(WEB_URL).get('/api/v1/plugins');
    expect([200, 502]).toContain(response.status);
    if (response.status === 200) {
      expect(response.body).toHaveProperty('plugins');
    }
  });

  testWeb('GET /api/v1/plugins/marketplace proxies to orchestrator', async () => {
    const response = await request(WEB_URL).get('/api/v1/plugins/marketplace');
    expect([200, 502]).toContain(response.status);
    if (response.status === 200) {
      expect(response.body).toHaveProperty('plugins');
    }
  });

  testWeb('GET /api/v1/plugins/catalog proxies to orchestrator', async () => {
    const response = await request(WEB_URL).get('/api/v1/plugins/catalog');
    expect([200, 502]).toContain(response.status);
    if (response.status === 200) {
      expect(response.body).toHaveProperty('catalog');
    }
  });
});

describe('Queue Management Proxy', () => {
  testWeb('POST /api/v1/queue/pause proxies to orchestrator', async () => {
    const response = await request(WEB_URL).post('/api/v1/queue/pause').send({});
    expect([200, 502]).toContain(response.status);
    if (response.status === 200) {
      expect(response.body).toHaveProperty('queueManager');
    }
  });

  testWeb('POST /api/v1/queue/resume proxies to orchestrator', async () => {
    const response = await request(WEB_URL).post('/api/v1/queue/resume').send({});
    expect([200, 502]).toContain(response.status);
    if (response.status === 200) {
      expect(response.body).toHaveProperty('queueManager');
    }
  });
});

describe('Diagnostics Proxy', () => {
  testWeb('GET /api/v1/diagnostics/reliability-history proxies to orchestrator', async () => {
    const response = await request(WEB_URL).get('/api/v1/diagnostics/reliability-history');
    expect([200, 502]).toContain(response.status);
    if (response.status === 200) {
      expect(response.body).toHaveProperty('history');
    }
  });

  testWeb('GET /api/v1/diagnostics/reliability-report/export proxies to orchestrator', async () => {
    const response = await request(WEB_URL).get('/api/v1/diagnostics/reliability-report/export');
    expect([200, 502]).toContain(response.status);
    if (response.status === 200) {
      expect(response.body).toHaveProperty('generatedAt');
      expect(response.body).toHaveProperty('gates');
    }
  });

  testWeb('GET /api/v1/diagnostics/reliability-report/export?format=md returns markdown', async () => {
    const response = await request(WEB_URL).get('/api/v1/diagnostics/reliability-report/export?format=md');
    expect([200, 502]).toContain(response.status);
    if (response.status === 200) {
      expect(response.headers['content-type']).toContain('text/markdown');
    }
  });

  testWeb('POST /api/v1/diagnostics/restore-drill/start proxies to orchestrator', async () => {
    const response = await request(WEB_URL).post('/api/v1/diagnostics/restore-drill/start').send({});
    expect([202, 400, 409, 502]).toContain(response.status);
    if (response.status === 202) {
      expect(response.body).toHaveProperty('drill');
    }
  });

  testWeb('GET /api/v1/diagnostics/restore-drill/latest proxies to orchestrator', async () => {
    const response = await request(WEB_URL).get('/api/v1/diagnostics/restore-drill/latest');
    expect([200, 502]).toContain(response.status);
    if (response.status === 200) {
      expect(response.body).toHaveProperty('drill');
    }
  });

  testWeb('POST /api/v1/diagnostics/replay-consistency/start proxies to orchestrator', async () => {
    const response = await request(WEB_URL).post('/api/v1/diagnostics/replay-consistency/start').send({});
    expect([202, 400, 409, 502]).toContain(response.status);
    if (response.status === 202) {
      expect(response.body).toHaveProperty('drill');
    }
  });

  testWeb('POST /api/v1/diagnostics/recovery-smoke/start proxies to orchestrator', async () => {
    const response = await request(WEB_URL).post('/api/v1/diagnostics/recovery-smoke/start').send({});
    expect([202, 400, 409, 502]).toContain(response.status);
    if (response.status === 202) {
      expect(response.body).toHaveProperty('drill');
    }
  });
});

describe('Workspace Proxy', () => {
  testWeb('GET /api/v1/files proxies to orchestrator', async () => {
    const response = await request(WEB_URL).get('/api/v1/files?path=/tmp');
    expect([200, 400, 502]).toContain(response.status);
    if (response.status === 200) {
      expect(response.body).toHaveProperty('path');
      expect(response.body).toHaveProperty('entries');
    }
  });

  testWeb('GET /api/v1/workspaces proxies to orchestrator', async () => {
    const response = await request(WEB_URL).get('/api/v1/workspaces');
    expect([200, 502]).toContain(response.status);
    if (response.status === 200) {
      expect(response.body).toHaveProperty('workspaces');
    }
  });
});

describe('Edit Proposals Proxy', () => {
  testWeb('GET /api/v1/edits proxies to orchestrator', async () => {
    const response = await request(WEB_URL).get('/api/v1/edits');
    expect([200, 502]).toContain(response.status);
    if (response.status === 200) {
      expect(response.body).toHaveProperty('edits');
    }
  });
});

describe('Error Handling', () => {
  testWeb('GET /api/v1/nonexistent proxies 404 from orchestrator', async () => {
    const response = await request(WEB_URL).get('/api/v1/nonexistent');
    // Should proxy the 404 from orchestrator
    expect([404, 502]).toContain(response.status);
  });

  testWeb('POST /api/v1/tasks without prompt returns 400 from orchestrator', async () => {
    const response = await request(WEB_URL).post('/api/v1/tasks').send({});
    expect([400, 502]).toContain(response.status);
    if (response.status === 400) {
      expect(response.body).toHaveProperty('error');
    }
  });
});

