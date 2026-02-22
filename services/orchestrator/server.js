const http = require('http');
const { randomUUID } = require('crypto');

const host = process.env.HOST || '0.0.0.0';
const port = parsePort(process.env.PORT || '4000');
const maxBodyBytes = 1024 * 1024;

const models = (process.env.DEFAULT_MODELS || 'gpt-4.1-mini,claude-sonnet,gemini-2.0-flash')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const tasks = [];

function parsePort(raw) {
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`Invalid PORT value "${raw}". Expected 1-65535.`);
  }
  return value;
}

function setCommonHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
}

function sendJson(res, status, payload) {
  setCommonHeaders(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload, null, 2));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let totalBytes = 0;

    req.on('data', (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBodyBytes) {
        reject(new Error('Request body too large.'));
        req.destroy();
        return;
      }
      body += chunk.toString('utf8');
    });

    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON payload.'));
      }
    });

    req.on('error', (error) => {
      reject(error);
    });
  });
}

function buildTask(payload) {
  const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : '';
  if (!prompt) {
    return { error: 'Field "prompt" is required.' };
  }

  const task = {
    id: randomUUID(),
    prompt,
    status: 'queued',
    createdAt: new Date().toISOString(),
    artifacts: [],
  };

  tasks.unshift(task);
  return { task };
}

function getTaskById(taskId) {
  return tasks.find((task) => task.id === taskId);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    setCommonHeaders(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, {
      service: 'orchestrator',
      status: 'ok',
      time: new Date().toISOString(),
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/v1/status') {
    sendJson(res, 200, {
      service: 'orchestrator',
      phase: 'mvp-skeleton',
      components: {
        apiGateway: 'ready',
        workspaceManager: 'stub',
        modelGateway: 'stub',
      },
      counts: {
        tasks: tasks.length,
        models: models.length,
      },
      time: new Date().toISOString(),
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/v1/models') {
    sendJson(res, 200, {
      models: models.map((name) => ({
        id: name,
        provider: inferProvider(name),
      })),
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/v1/workspaces') {
    sendJson(res, 200, {
      workspaces: [
        {
          id: 'local-default',
          status: 'ready',
          runtime: 'docker',
          isolation: 'container-per-task (planned)',
        },
      ],
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/v1/tasks') {
    sendJson(res, 200, { tasks });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/v1/tasks') {
    try {
      const payload = await parseJsonBody(req);
      const result = buildTask(payload);
      if (result.error) {
        sendJson(res, 400, { error: result.error });
        return;
      }
      sendJson(res, 201, result.task);
      return;
    } catch (error) {
      sendJson(res, 400, { error: error.message || 'Invalid request.' });
      return;
    }
  }

  if (req.method === 'GET' && url.pathname.startsWith('/v1/tasks/')) {
    const taskId = url.pathname.replace('/v1/tasks/', '').trim();
    const task = getTaskById(taskId);
    if (!task) {
      sendJson(res, 404, { error: `Task "${taskId}" not found.` });
      return;
    }
    sendJson(res, 200, task);
    return;
  }

  sendJson(res, 404, {
    error: 'Not found.',
    availableRoutes: [
      'GET /health',
      'GET /v1/status',
      'GET /v1/models',
      'GET /v1/workspaces',
      'GET /v1/tasks',
      'POST /v1/tasks',
      'GET /v1/tasks/:id',
    ],
  });
});

server.on('clientError', (error, socket) => {
  console.error('Client error:', error.message);
  if (socket.writable) {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  }
});

server.on('error', (error) => {
  console.error('Server error:', error.message);
});

server.listen(port, host, () => {
  console.log(`Orchestrator listening on http://${host}:${port}`);
});

function inferProvider(name) {
  const normalized = name.toLowerCase();
  if (normalized.includes('gpt')) {
    return 'openai';
  }
  if (normalized.includes('claude')) {
    return 'anthropic';
  }
  if (normalized.includes('gemini')) {
    return 'google';
  }
  return 'custom';
}
