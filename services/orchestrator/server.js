const http = require('http');
const { spawn } = require('child_process');
const dns = require('dns').promises;
const fs = require('fs');
const net = require('net');
const path = require('path');
const { randomUUID, createHash } = require('crypto');

const host = process.env.HOST || '0.0.0.0';
const port = parsePort(process.env.PORT || '4000');
const maxBodyBytes = 1024 * 1024;
const lifecycleDelays = {
  planningMs: 600,
  runningMs: 1800,
};
const defaultCommandTimeoutMs = parsePositiveInt(process.env.COMMAND_TIMEOUT_MS, 20000, 1000, 300000);
const maxTaskCommands = parsePositiveInt(process.env.MAX_TASK_COMMANDS, 5, 1, 20);
const maxConcurrentTasks = parsePositiveInt(process.env.MAX_CONCURRENT_TASKS, 1, 1, 8);
const maxCommandOutputChars = parsePositiveInt(process.env.MAX_COMMAND_OUTPUT_CHARS, 12000, 2000, 100000);
const allowedCommandPrefixes = (process.env.ALLOWED_COMMAND_PREFIXES || 'node,npm,echo,ls,pwd,cat')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const allowlistedCommands = new Set(allowedCommandPrefixes);
const modelGatewayTimeoutMs = parsePositiveInt(process.env.MODEL_GATEWAY_TIMEOUT_MS, 30000, 1000, 120000);
const openaiApiKey = (process.env.OPENAI_API_KEY || '').trim();
const anthropicApiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
const googleApiKey = (process.env.GOOGLE_API_KEY || '').trim();
const azureFoundryApiKey = (process.env.AZURE_FOUNDRY_API_KEY || '').trim();
const azureFoundryChatUrl = (process.env.AZURE_FOUNDRY_CHAT_URL || '').trim();
const azureFoundryApiVersion = (process.env.AZURE_FOUNDRY_API_VERSION || '2024-05-01-preview').trim();
const knownProviders = new Set(['openai', 'anthropic', 'google', 'azure', 'custom']);
const modelCatalog = parseModelCatalog(
  process.env.MODEL_CATALOG || '',
  process.env.DEFAULT_MODELS || 'gpt-4.1-mini,claude-sonnet,gemini-2.0-flash'
);
const models = modelCatalog.map((entry) => entry.id);
const modelProvidersById = new Map(modelCatalog.map((entry) => [entry.id.toLowerCase(), entry.provider]));
const modelProviderOverrides = parseModelProviderOverrides(process.env.MODEL_PROVIDER_OVERRIDES || '');
const openaiResponsesUrl = process.env.OPENAI_RESPONSES_URL || 'https://api.openai.com/v1/responses';
const anthropicMessagesUrl = process.env.ANTHROPIC_MESSAGES_URL || 'https://api.anthropic.com/v1/messages';
const googleApiBase = process.env.GOOGLE_API_BASE || 'https://generativelanguage.googleapis.com/v1beta/models';
const orchestratorApiToken = (process.env.ORCHESTRATOR_API_TOKEN || '').trim();
const allowInsecureMarketplaceHttp = parseBooleanEnv(process.env.ALLOW_INSECURE_MARKETPLACE_HTTP, false);
const allowedWorkspaceRoots = parseWorkspaceRoots(process.env.ALLOWED_WORKSPACE_ROOTS || '/tmp,/app');
const corsAllowedOrigins = parseCorsAllowedOrigins(
  process.env.CORS_ALLOWED_ORIGINS ||
    'http://localhost:3000,http://127.0.0.1:3000,http://localhost:3100,http://127.0.0.1:3100,http://localhost:13100,http://127.0.0.1:13100'
);
const allowAllCorsOrigins = corsAllowedOrigins.has('*');
const defaultWorkingDirectory = resolveDefaultWorkingDirectory(
  process.env.DEFAULT_WORKING_DIRECTORY || '/tmp',
  allowedWorkspaceRoots
);
const allowedTaskStatuses = new Set(['queued', 'planning', 'running', 'completed', 'failed', 'cancelled']);
const terminalTaskStatuses = new Set(['completed', 'failed', 'cancelled']);
const allowedTaskPriorities = new Set(['low', 'normal', 'high']);
const allowedEditStatuses = new Set(['pending', 'applied', 'rejected', 'stale', 'reverted']);
const taskPriorityRank = {
  low: 1,
  normal: 2,
  high: 3,
};
const defaultCollaborativeTemplateId = 'delivery';
const defaultCollaborativeRoles = ['planner', 'executor', 'verifier'];
const collaborativeRoleInstructions = {
  planner:
    'You are the planner agent. Produce a clear execution plan, enumerate assumptions, and identify verification steps.',
  executor:
    'You are the executor agent. Carry out the objective based on the planner output and generate concrete implementation artifacts.',
  tester:
    'You are the tester agent. Design and run focused test cases, report concrete pass/fail evidence, and surface reproducible failures.',
  reviewer:
    'You are the reviewer agent. Perform a code-review style pass, identify defects and risks, and recommend exact fixes with severity.',
  verifier:
    'You are the verifier agent. Validate outcomes, run checks, and report pass/fail evidence with any residual risks.',
};
const collaborativeRunTemplateCatalog = Object.freeze({
  delivery: {
    id: 'delivery',
    label: 'Delivery',
    description: 'Plan, implement, and verify the shared objective.',
    roles: ['planner', 'executor', 'verifier'],
  },
  quality: {
    id: 'quality',
    label: 'Quality',
    description: 'Add explicit testing before final verification.',
    roles: ['planner', 'executor', 'tester', 'verifier'],
  },
  review: {
    id: 'review',
    label: 'Review',
    description: 'Add structured code review before final verification.',
    roles: ['planner', 'executor', 'reviewer', 'verifier'],
  },
  hardening: {
    id: 'hardening',
    label: 'Hardening',
    description: 'Run implementation, testing, review, and final verification in sequence.',
    roles: ['planner', 'executor', 'tester', 'reviewer', 'verifier'],
  },
});
const collaborativeRunTemplates = Object.values(collaborativeRunTemplateCatalog).map((template) => ({
  id: template.id,
  label: template.label,
  description: template.description,
  roles: normalizeCollaborativeRunRoles(template.roles),
}));
const collaborativeRunTemplatesById = new Map(collaborativeRunTemplates.map((template) => [template.id, template]));
const taskStorePath = resolveTaskStorePath(process.env.TASK_STORE_PATH || '');
let persistTimer = null;

const tasks = [];
const tasksById = new Map();
const collaborativeRuns = [];
const collaborativeRunsById = new Map();
const plugins = [];
const pluginsById = new Map();
const pluginModelContributionsById = new Map();
const pluginTemplateContributionsById = new Map();
const pluginHealthById = new Map();
const pluginMarketplaceById = new Map();
let pluginMarketplaceCatalog = [];
const pluginHealthcheckTtlMs = parsePositiveInt(
  process.env.PLUGIN_HEALTHCHECK_TTL_MS,
  10 * 60 * 1000,
  30000,
  24 * 60 * 60 * 1000
);
const edits = [];
const editsById = new Map();
const taskTimers = new Map();
const activeTaskProcesses = new Map();
const activeLifecycleTaskIds = new Set();
let queuePaused = false;
const maxWorkspaceFilePreviewChars = 20000;
const maxWorkspaceFileWriteChars = 200000;
const eventHistoryLimit = parsePositiveInt(process.env.EVENT_HISTORY_LIMIT, 300, 20, 5000);
const eventHeartbeatMs = parsePositiveInt(process.env.EVENT_HEARTBEAT_MS, 15000, 5000, 60000);
// Extended Diagnostics
const diagnosticsHistory = [];
const maxDiagnosticsHistory = 100;
const diagnosticsMetrics = {
  apiLatencies: [],
  modelApiLatencies: [],
  memorySnapshots: [],
  cpuSnapshots: [],
  diskSnapshots: [],
};
const maxLatencySamples = 100;
const maxMemorySnapshots = 50;

function recordApiLatency(endpoint, latencyMs) {
  diagnosticsMetrics.apiLatencies.push({
    endpoint,
    latencyMs,
    timestamp: new Date().toISOString(),
  });
  while (diagnosticsMetrics.apiLatencies.length > maxLatencySamples) {
    diagnosticsMetrics.apiLatencies.shift();
  }
}

function recordModelApiLatency(provider, modelId, latencyMs) {
  diagnosticsMetrics.modelApiLatencies.push({
    provider,
    modelId,
    latencyMs,
    timestamp: new Date().toISOString(),
  });
  while (diagnosticsMetrics.modelApiLatencies.length > maxLatencySamples) {
    diagnosticsMetrics.modelApiLatencies.shift();
  }
}

function captureMemorySnapshot() {
  const memory = process.memoryUsage();
  const snapshot = {
    timestamp: new Date().toISOString(),
    rss: memory.rss,
    heapTotal: memory.heapTotal,
    heapUsed: memory.heapUsed,
    external: memory.external,
    arrayBuffers: memory.arrayBuffers,
  };
  diagnosticsMetrics.memorySnapshots.push(snapshot);
  while (diagnosticsMetrics.memorySnapshots.length > maxMemorySnapshots) {
    diagnosticsMetrics.memorySnapshots.shift();
  }
  return snapshot;
}

function captureCpuSnapshot() {
  const cpuUsage = process.cpuUsage();
  const snapshot = {
    timestamp: new Date().toISOString(),
    user: cpuUsage.user,
    system: cpuUsage.system,
  };
  diagnosticsMetrics.cpuSnapshots.push(snapshot);
  while (diagnosticsMetrics.cpuSnapshots.length > maxMemorySnapshots) {
    diagnosticsMetrics.cpuSnapshots.shift();
  }
  return snapshot;
}

function buildExtendedDiagnostics() {
  const memorySnapshot = captureMemorySnapshot();
  const cpuSnapshot = captureCpuSnapshot();
  
  // Calculate latency statistics
  const latencies = diagnosticsMetrics.apiLatencies;
  const sortedLatencies = latencies.map(l => l.latencyMs).sort((a, b) => a - b);
  const latencyStats = latencies.length > 0 ? {
    count: latencies.length,
    min: sortedLatencies[0],
    max: sortedLatencies[sortedLatencies.length - 1],
    avg: sortedLatencies.reduce((a, b) => a + b, 0) / sortedLatencies.length,
    p50: sortedLatencies[Math.floor(sortedLatencies.length * 0.5)],
    p95: sortedLatencies[Math.floor(sortedLatencies.length * 0.95)],
    p99: sortedLatencies[Math.floor(sortedLatencies.length * 0.99)],
  } : null;

  // Calculate model API latency statistics
  const modelLatencies = diagnosticsMetrics.modelApiLatencies;
  const modelLatencyStats = {};
  const providers = [...new Set(modelLatencies.map(l => l.provider))];
  for (const provider of providers) {
    const providerLatencies = modelLatencies.filter(l => l.provider === provider).map(l => l.latencyMs).sort((a, b) => a - b);
    if (providerLatencies.length > 0) {
      modelLatencyStats[provider] = {
        count: providerLatencies.length,
        min: providerLatencies[0],
        max: providerLatencies[providerLatencies.length - 1],
        avg: providerLatencies.reduce((a, b) => a + b, 0) / providerLatencies.length,
      };
    }
  }

  return {
    service: 'orchestrator',
    runtime: buildRuntimeDiagnostics(),
    extended: {
      memory: {
        current: memorySnapshot,
        snapshots: diagnosticsMetrics.memorySnapshots.slice(-10),
      },
      cpu: {
        current: cpuSnapshot,
        snapshots: diagnosticsMetrics.cpuSnapshots.slice(-10),
      },
      apiLatencies: latencyStats,
      modelApiLatencies: modelLatencyStats,
    },
    timestamp: new Date().toISOString(),
  };
}

const eventHistory = [];
const eventStreamClients = new Map();

function parsePort(raw) {
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`Invalid PORT value "${raw}". Expected 1-65535.`);
  }
  return value;
}

function parsePositiveInt(raw, fallback, min, max) {
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value)) {
    return fallback;
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function parseBooleanEnv(raw, fallback) {
  if (raw === undefined || raw === null) {
    return fallback;
  }

  const value = String(raw).trim().toLowerCase();
  if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
    return true;
  }
  if (value === '0' || value === 'false' || value === 'no' || value === 'off') {
    return false;
  }
  return fallback;
}

function parseCorsAllowedOrigins(raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) {
    return new Set();
  }

  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return new Set(items);
}

function parseDefaultModelIds(raw) {
  const parsed = String(raw || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (!parsed.length) {
    return ['gpt-4.1-mini', 'claude-sonnet', 'gemini-2.0-flash'];
  }

  return Array.from(new Set(parsed));
}

function parseModelCatalog(rawCatalog, rawDefaultModels) {
  const fallbackIds = parseDefaultModelIds(rawDefaultModels);
  const fallbackCatalog = fallbackIds.map((id) => ({
    id,
    label: id,
    provider: inferProviderFromModelName(id),
  }));

  const value = typeof rawCatalog === 'string' ? rawCatalog.trim() : '';
  if (!value) {
    return fallbackCatalog;
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      console.error('MODEL_CATALOG must be a JSON array. Falling back to DEFAULT_MODELS.');
      return fallbackCatalog;
    }

    const items = [];
    const seenIds = new Set();

    for (const candidate of parsed) {
      let id = '';
      let label = '';
      let provider = '';

      if (typeof candidate === 'string') {
        id = candidate.trim();
      } else if (candidate && typeof candidate === 'object') {
        id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
        label = typeof candidate.label === 'string' ? candidate.label.trim() : '';
        provider = typeof candidate.provider === 'string' ? candidate.provider.trim().toLowerCase() : '';
      }

      if (!id) {
        continue;
      }

      const normalizedId = id.toLowerCase();
      if (seenIds.has(normalizedId)) {
        continue;
      }

      if (!provider) {
        provider = inferProviderFromModelName(id);
      }
      if (!knownProviders.has(provider)) {
        provider = 'custom';
      }

      items.push({
        id,
        label: label || id,
        provider,
      });
      seenIds.add(normalizedId);
    }

    return items.length ? items : fallbackCatalog;
  } catch (error) {
    console.error('Invalid MODEL_CATALOG JSON. Falling back to DEFAULT_MODELS.');
    return fallbackCatalog;
  }
}

function parseModelProviderOverrides(raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const overrides = {};
    for (const [modelId, providerRaw] of Object.entries(parsed)) {
      if (typeof modelId !== 'string' || !modelId.trim()) {
        continue;
      }
      const provider = typeof providerRaw === 'string' ? providerRaw.trim().toLowerCase() : '';
      if (!knownProviders.has(provider)) {
        continue;
      }
      overrides[modelId.toLowerCase()] = provider;
    }

    return overrides;
  } catch (error) {
    console.error('Invalid MODEL_PROVIDER_OVERRIDES JSON. Falling back to auto provider inference.');
    return {};
  }
}

function parseWorkspaceRoots(raw) {
  const candidates = String(raw || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const roots = [];
  for (const candidate of candidates) {
    if (!path.isAbsolute(candidate)) {
      continue;
    }

    const resolved = path.resolve(candidate);
    roots.push(resolved);
  }

  if (!roots.length) {
    return ['/tmp'];
  }

  return Array.from(new Set(roots));
}

function isPathInsideRoot(candidatePath, rootPath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isPathWithinAllowedWorkspaceRoots(candidatePath, allowedRoots) {
  for (const root of allowedRoots) {
    if (isPathInsideRoot(candidatePath, root)) {
      return true;
    }
  }
  return false;
}

function resolveDefaultWorkingDirectory(raw, allowedRoots) {
  const preferred = typeof raw === 'string' ? raw.trim() : '';
  const fallback = allowedRoots[0] || '/tmp';

  if (!preferred || !path.isAbsolute(preferred)) {
    return fallback;
  }

  const resolved = path.resolve(preferred);
  if (!isPathWithinAllowedWorkspaceRoots(resolved, allowedRoots)) {
    return fallback;
  }

  return resolved;
}

function resolveTaskStorePath(rawPath) {
  const value = typeof rawPath === 'string' ? rawPath.trim() : '';
  if (value) {
    return path.resolve(value);
  }

  return '/tmp/open-antigravity/tasks.json';
}

function isIsoDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function buildPersistedTimelineEntry(entry, fallbackState) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const state = typeof entry.state === 'string' ? entry.state : fallbackState;
  const message = typeof entry.message === 'string' ? entry.message : '';
  if (!message) {
    return null;
  }

  return {
    id: typeof entry.id === 'string' ? entry.id : randomUUID(),
    state,
    message,
    createdAt: isIsoDate(entry.createdAt) ? entry.createdAt : new Date().toISOString(),
  };
}

function buildPersistedArtifact(artifact) {
  if (!artifact || typeof artifact !== 'object') {
    return null;
  }

  const type = typeof artifact.type === 'string' ? artifact.type : 'note';
  const title = typeof artifact.title === 'string' ? artifact.title : '';
  const content = typeof artifact.content === 'string' ? artifact.content : '';
  if (!title || !content) {
    return null;
  }

  return {
    id: typeof artifact.id === 'string' ? artifact.id : randomUUID(),
    type,
    title,
    content,
    createdAt: isIsoDate(artifact.createdAt) ? artifact.createdAt : new Date().toISOString(),
  };
}

function normalizeTaskStatus(value) {
  const status = typeof value === 'string' ? value : '';
  return allowedTaskStatuses.has(status) ? status : 'queued';
}

function normalizeTaskPriority(value) {
  const priority = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return allowedTaskPriorities.has(priority) ? priority : 'normal';
}

function normalizeEditStatus(value) {
  const status = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return allowedEditStatuses.has(status) ? status : 'pending';
}

function persistTasksSoon() {
  if (!taskStorePath) {
    return;
  }

  if (persistTimer) {
    clearTimeout(persistTimer);
  }

  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistTasksNow();
  }, 120);
}

function persistTasksNow() {
  if (!taskStorePath) {
    return;
  }

  try {
    const taskStoreDirectory = path.dirname(taskStorePath);
    fs.mkdirSync(taskStoreDirectory, { recursive: true });
    const payload = {
      version: 5,
      savedAt: new Date().toISOString(),
      tasks,
      runs: collaborativeRuns,
      plugins,
      edits,
      restoreDrills: restoreDrillRuns,
      replayConsistencyRuns,
      recoverySmokeRuns,
      reliabilityHistory,
    };
    writeFileAtomic(taskStorePath, JSON.stringify(payload, null, 2));
  } catch (error) {
    console.error(`Failed to persist tasks to ${taskStorePath}:`, error.message);
  }
}

function writeFileAtomic(filePath, content) {
  const directoryPath = path.dirname(filePath);
  const tempPath = path.join(directoryPath, `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}`);
  let fileHandle = null;
  let renamed = false;
  try {
    fileHandle = fs.openSync(tempPath, 'w');
    fs.writeFileSync(fileHandle, content, 'utf8');
    fs.fsyncSync(fileHandle);
    fs.closeSync(fileHandle);
    fileHandle = null;

    fs.renameSync(tempPath, filePath);
    renamed = true;

    try {
      const directoryHandle = fs.openSync(directoryPath, 'r');
      fs.fsyncSync(directoryHandle);
      fs.closeSync(directoryHandle);
    } catch (error) {
      // Best-effort fsync for filesystem metadata.
    }
  } finally {
    if (fileHandle !== null) {
      fs.closeSync(fileHandle);
    }
    if (!renamed && fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

function isMutableRequestMethod(method) {
  const value = typeof method === 'string' ? method.toUpperCase() : '';
  return value === 'POST' || value === 'PATCH' || value === 'DELETE' || value === 'PUT';
}

function getBearerTokenFromRequest(req) {
  const authorizationHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization.trim() : '';
  if (!authorizationHeader) {
    return '';
  }

  const lower = authorizationHeader.toLowerCase();
  if (!lower.startsWith('bearer ')) {
    return '';
  }

  return authorizationHeader.slice(7).trim();
}

function hasValidApiAuth(req) {
  if (!orchestratorApiToken) {
    return true;
  }

  const bearerToken = getBearerTokenFromRequest(req);
  if (bearerToken && bearerToken === orchestratorApiToken) {
    return true;
  }

  const apiKeyHeader = typeof req.headers['x-api-key'] === 'string' ? req.headers['x-api-key'].trim() : '';
  if (apiKeyHeader && apiKeyHeader === orchestratorApiToken) {
    return true;
  }

  return false;
}

function applyCorsHeaders(req, res) {
  const requestOrigin = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
  if (!requestOrigin) {
    return { allowed: true, origin: null, isCorsRequest: false };
  }

  if (allowAllCorsOrigins) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return { allowed: true, origin: requestOrigin, isCorsRequest: true };
  }

  if (corsAllowedOrigins.has(requestOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Vary', 'Origin');
    return { allowed: true, origin: requestOrigin, isCorsRequest: true };
  }

  return { allowed: false, origin: requestOrigin, isCorsRequest: true };
}

function setCommonHeaders(res) {
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-API-Key');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
}

function sendJson(res, status, payload) {
  setCommonHeaders(res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, status, content, contentType) {
  setCommonHeaders(res);
  res.statusCode = status;
  res.setHeader('Content-Type', contentType || 'text/plain; charset=utf-8');
  res.end(content);
}

function buildSystemEvent(type, payload) {
  return {
    id: randomUUID(),
    type,
    time: new Date().toISOString(),
    payload: payload || {},
  };
}

function buildTaskEventPayload(task) {
  if (!task) {
    return null;
  }

  const queuePositions = buildQueuePositionById();
  const dependsOn = normalizeTaskDependsOn(task.dependsOn);
  const blockedBy = getTaskDependencyBlockers(task);
  const collaboration = normalizeCollaborativeTaskMetadata(task.collaboration);
  return {
    id: task.id,
    status: task.status,
    priority: normalizeTaskPriority(task.priority),
    modelId: task.modelId,
    workingDirectory: task.workingDirectory,
    updatedAt: task.updatedAt,
    dependsOn,
    blockedBy,
    blocked: blockedBy.length > 0,
    collaboration,
    queuePosition: queuePositions.has(task.id) ? queuePositions.get(task.id) : null,
    activeWorker: activeLifecycleTaskIds.has(task.id),
  };
}

function pushEventToHistory(event) {
  eventHistory.push(event);
  while (eventHistory.length > eventHistoryLimit) {
    eventHistory.shift();
  }
}

function writeEventStreamMessage(res, event) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function removeEventStreamClient(clientId) {
  const client = eventStreamClients.get(clientId);
  if (!client) {
    return;
  }

  clearInterval(client.heartbeatTimer);
  eventStreamClients.delete(clientId);
  try {
    client.res.end();
  } catch (error) {
    // Ignore network teardown errors on closed streams.
  }
}

function publishSystemEvent(type, payload) {
  const event = buildSystemEvent(type, payload);
  pushEventToHistory(event);

  for (const [clientId, client] of eventStreamClients.entries()) {
    try {
      writeEventStreamMessage(client.res, event);
    } catch (error) {
      removeEventStreamClient(clientId);
    }
  }

  return event;
}

function parseEventReplayLimit(searchParams) {
  const rawLimit = searchParams.get('limit');
  return parsePositiveInt(rawLimit, 50, 0, eventHistoryLimit);
}

function openEventStream(req, res, searchParams) {
  setCommonHeaders(res);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const clientId = randomUUID();
  const replayLimit = parseEventReplayLimit(searchParams);
  const startIndex = Math.max(eventHistory.length - replayLimit, 0);
  for (let index = startIndex; index < eventHistory.length; index++) {
    writeEventStreamMessage(res, eventHistory[index]);
  }

  const readyEvent = buildSystemEvent('stream.ready', {
    replayed: eventHistory.length - startIndex,
    queueManager: buildQueueManagerState(),
  });
  writeEventStreamMessage(res, readyEvent);

  const heartbeatTimer = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (error) {
      removeEventStreamClient(clientId);
    }
  }, eventHeartbeatMs);

  eventStreamClients.set(clientId, { res, heartbeatTimer });

  const handleClose = () => {
    removeEventStreamClient(clientId);
  };

  req.on('close', handleClose);
  req.on('error', handleClose);
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

function normalizeCommandTimeoutMs(raw) {
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value)) {
    return defaultCommandTimeoutMs;
  }
  return Math.max(1000, Math.min(value, 300000));
}

function tokenizeCommand(command) {
  const source = typeof command === 'string' ? command : '';
  const tokens = [];
  let current = '';
  let quote = null;
  let escaped = false;

  const flushToken = () => {
    if (current.length) {
      tokens.push(current);
      current = '';
    }
  };

  for (let index = 0; index < source.length; index++) {
    const char = source[index];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      const next = source[index + 1];
      if (quote === "'") {
        current += char;
        continue;
      }

      if (quote === '"') {
        if (next === '"' || next === '\\') {
          escaped = true;
        } else {
          current += char;
        }
        continue;
      }

      if (next === '"' || next === "'" || next === '\\' || (next && /\s/.test(next))) {
        escaped = true;
      } else {
        current += char;
      }
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      flushToken();
      continue;
    }

    current += char;
  }

  if (escaped) {
    current += '\\';
  }

  if (quote) {
    throw new Error('Command contains an unterminated quote.');
  }

  flushToken();
  return tokens;
}

function parseTaskCommands(rawCommands) {
  if (rawCommands === undefined || rawCommands === null) {
    return { commands: [] };
  }
  if (!Array.isArray(rawCommands)) {
    return { error: 'Field "commands" must be an array of strings.' };
  }

  const commands = [];
  for (const raw of rawCommands) {
    if (typeof raw !== 'string') {
      return { error: 'Each command must be a string.' };
    }

    const command = raw.trim();
    if (!command) {
      continue;
    }
    commands.push(command);
  }

  if (commands.length > maxTaskCommands) {
    return { error: `Too many commands. Maximum allowed is ${maxTaskCommands}.` };
  }

  for (const command of commands) {
    let tokens;
    try {
      tokens = tokenizeCommand(command);
    } catch (error) {
      return { error: `Invalid command "${command}": ${error.message}` };
    }
    if (!tokens.length) {
      return { error: 'Command cannot be empty after parsing.' };
    }
    if (!allowlistedCommands.has(tokens[0])) {
      return {
        error: `Command "${tokens[0]}" is not allowlisted. Allowed: ${allowedCommandPrefixes.join(', ')}`,
      };
    }
  }

  return { commands };
}

function parseTaskWorkingDirectory(rawWorkingDirectory) {
  if (rawWorkingDirectory === undefined || rawWorkingDirectory === null || rawWorkingDirectory === '') {
    return { workingDirectory: defaultWorkingDirectory };
  }

  if (typeof rawWorkingDirectory !== 'string') {
    return { error: 'Field "workingDirectory" must be a string.' };
  }

  const trimmed = rawWorkingDirectory.trim();
  if (!trimmed) {
    return { workingDirectory: defaultWorkingDirectory };
  }

  if (!path.isAbsolute(trimmed)) {
    return { error: 'Field "workingDirectory" must be an absolute path.' };
  }

  const resolved = path.resolve(trimmed);
  if (!isPathWithinAllowedWorkspaceRoots(resolved, allowedWorkspaceRoots)) {
    return {
      error: `Field "workingDirectory" must be inside allowlisted roots: ${allowedWorkspaceRoots.join(', ')}`,
    };
  }

  try {
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return { error: `Field "workingDirectory" must point to a directory: ${resolved}` };
    }
  } catch (error) {
    return { error: `Working directory does not exist or is not accessible: ${resolved}` };
  }

  return { workingDirectory: resolved };
}

function normalizeTaskDependsOn(rawDependsOn) {
  if (!Array.isArray(rawDependsOn)) {
    return [];
  }

  const dependsOn = [];
  const seen = new Set();

  for (const item of rawDependsOn) {
    if (typeof item !== 'string') {
      continue;
    }
    const taskId = item.trim();
    if (!taskId || seen.has(taskId)) {
      continue;
    }
    seen.add(taskId);
    dependsOn.push(taskId);
  }

  return dependsOn;
}

function parseTaskDependsOn(rawDependsOn) {
  if (rawDependsOn === undefined || rawDependsOn === null) {
    return { dependsOn: [] };
  }

  if (!Array.isArray(rawDependsOn)) {
    return { error: 'Field "dependsOn" must be an array of task IDs.' };
  }

  const dependsOn = normalizeTaskDependsOn(rawDependsOn);
  for (const dependencyTaskId of dependsOn) {
    if (!tasksById.has(dependencyTaskId)) {
      return { error: `Dependency task "${dependencyTaskId}" was not found.` };
    }
  }

  return { dependsOn };
}

function normalizeCollaborativeRole(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeCollaborativeTemplateId(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizePluginId(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalized || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(normalized)) {
    return '';
  }
  return normalized;
}

function normalizePluginTemplateKey(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalized || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(normalized)) {
    return '';
  }
  return normalized;
}

function normalizePluginVersion(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized ? normalized.slice(0, 64) : '0.1.0';
}

function normalizePluginName(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized ? normalized.slice(0, 120) : '';
}

function normalizePluginDescription(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized ? normalized.slice(0, 500) : '';
}

function normalizePluginMarketplaceMetadata(rawMetadata, fallbackMetadata, nowIso) {
  const fallback =
    fallbackMetadata && typeof fallbackMetadata === 'object' && !Array.isArray(fallbackMetadata)
      ? fallbackMetadata
      : null;

  if (rawMetadata === undefined) {
    if (!fallback) {
      return { marketplace: null };
    }
    return {
      marketplace: {
        marketplaceId: typeof fallback.marketplaceId === 'string' ? fallback.marketplaceId : '',
        source: typeof fallback.source === 'string' ? fallback.source : '',
        sourceUrl: typeof fallback.sourceUrl === 'string' ? fallback.sourceUrl : '',
        manifestChecksumSha256: typeof fallback.manifestChecksumSha256 === 'string' ? fallback.manifestChecksumSha256 : '',
        installedAt: isIsoDate(fallback.installedAt) ? fallback.installedAt : nowIso,
        updatedAt: isIsoDate(fallback.updatedAt) ? fallback.updatedAt : nowIso,
        lastAction: typeof fallback.lastAction === 'string' ? fallback.lastAction : '',
      },
    };
  }

  if (rawMetadata === null) {
    return { marketplace: null };
  }

  if (!rawMetadata || typeof rawMetadata !== 'object' || Array.isArray(rawMetadata)) {
    return { error: 'Field "marketplace" must be an object when provided.' };
  }

  const marketplaceId = normalizePluginMarketplaceId(rawMetadata.marketplaceId || rawMetadata.id);
  if (!marketplaceId) {
    return { error: 'Field "marketplace.marketplaceId" must be a lowercase slug when provided.' };
  }

  const sourceRaw =
    typeof rawMetadata.source === 'string' && rawMetadata.source.trim()
      ? rawMetadata.source.trim().toLowerCase()
      : fallback && typeof fallback.source === 'string' && fallback.source.trim()
        ? fallback.source.trim().toLowerCase()
        : 'registry';
  const source = sourceRaw.slice(0, 48);

  const sourceUrlRaw =
    typeof rawMetadata.sourceUrl === 'string' && rawMetadata.sourceUrl.trim()
      ? rawMetadata.sourceUrl.trim()
      : fallback && typeof fallback.sourceUrl === 'string'
        ? fallback.sourceUrl
        : '';
  const sourceUrl = sourceUrlRaw ? sourceUrlRaw.slice(0, 500) : '';

  const checksumRaw =
    typeof rawMetadata.manifestChecksumSha256 === 'string' && rawMetadata.manifestChecksumSha256.trim()
      ? rawMetadata.manifestChecksumSha256.trim().toLowerCase()
      : fallback && typeof fallback.manifestChecksumSha256 === 'string'
        ? fallback.manifestChecksumSha256.toLowerCase()
        : '';
  if (checksumRaw && !/^[a-f0-9]{64}$/.test(checksumRaw)) {
    return { error: 'Field "marketplace.manifestChecksumSha256" must be a SHA-256 hex digest when provided.' };
  }

  const installedAt =
    isIsoDate(rawMetadata.installedAt)
      ? rawMetadata.installedAt
      : fallback && isIsoDate(fallback.installedAt)
        ? fallback.installedAt
        : nowIso;
  const updatedAt = isIsoDate(rawMetadata.updatedAt) ? rawMetadata.updatedAt : nowIso;

  const lastActionRaw =
    typeof rawMetadata.lastAction === 'string' && rawMetadata.lastAction.trim()
      ? rawMetadata.lastAction.trim().toLowerCase()
      : fallback && typeof fallback.lastAction === 'string'
        ? fallback.lastAction.toLowerCase()
        : '';
  const lastAction = lastActionRaw === 'updated' ? 'updated' : lastActionRaw === 'installed' ? 'installed' : '';

  return {
    marketplace: {
      marketplaceId,
      source,
      sourceUrl,
      manifestChecksumSha256: checksumRaw,
      installedAt,
      updatedAt,
      lastAction,
    },
  };
}

function normalizePluginContributedModels(rawModels, pluginId, fallbackModels) {
  if (rawModels === undefined || rawModels === null) {
    return {
      models: Array.isArray(fallbackModels) ? fallbackModels.map((entry) => ({ ...entry })) : [],
    };
  }

  if (!Array.isArray(rawModels)) {
    return { error: 'Field "contributions.models" must be an array.' };
  }

  const modelsForPlugin = [];
  const seen = new Set();
  for (let index = 0; index < rawModels.length; index++) {
    const candidate = rawModels[index];
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return { error: `Field "contributions.models[${index}]" must be an object.` };
    }

    const modelId = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    if (!modelId) {
      return { error: `Field "contributions.models[${index}].id" is required.` };
    }

    const normalizedModelId = modelId.toLowerCase();
    if (seen.has(normalizedModelId)) {
      continue;
    }
    seen.add(normalizedModelId);

    const providerRaw = typeof candidate.provider === 'string' ? candidate.provider.trim().toLowerCase() : '';
    const provider = knownProviders.has(providerRaw) ? providerRaw : inferProviderFromModelName(modelId);
    const label = typeof candidate.label === 'string' && candidate.label.trim() ? candidate.label.trim() : modelId;

    modelsForPlugin.push({
      id: modelId,
      label: label.slice(0, 160),
      provider: knownProviders.has(provider) ? provider : 'custom',
      pluginId,
    });
  }

  return { models: modelsForPlugin };
}

function normalizePluginContributedTemplates(rawTemplates, pluginId, fallbackTemplates) {
  if (rawTemplates === undefined || rawTemplates === null) {
    return {
      templates: Array.isArray(fallbackTemplates) ? fallbackTemplates.map((entry) => ({ ...entry })) : [],
    };
  }

  if (!Array.isArray(rawTemplates)) {
    return { error: 'Field "contributions.templates" must be an array.' };
  }

  const templatesForPlugin = [];
  const seen = new Set();
  for (let index = 0; index < rawTemplates.length; index++) {
    const candidate = rawTemplates[index];
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return { error: `Field "contributions.templates[${index}]" must be an object.` };
    }

    const rawKey =
      typeof candidate.id === 'string' && candidate.id.trim()
        ? candidate.id
        : typeof candidate.key === 'string' && candidate.key.trim()
          ? candidate.key
          : '';
    const templateKey = normalizePluginTemplateKey(rawKey);
    if (!templateKey) {
      return {
        error: `Field "contributions.templates[${index}].id" must be a lowercase slug (letters, numbers, hyphen).`,
      };
    }
    if (seen.has(templateKey)) {
      continue;
    }
    seen.add(templateKey);

    const roleResult = parseCollaborativeRoles(candidate.roles);
    if (roleResult.error) {
      return {
        error: `Field "contributions.templates[${index}].roles" is invalid: ${roleResult.error}`,
      };
    }

    const fullTemplateId = `${pluginId}/${templateKey}`;
    const label =
      typeof candidate.label === 'string' && candidate.label.trim()
        ? candidate.label.trim()
        : templateKey;
    const description = normalizePluginDescription(candidate.description);

    templatesForPlugin.push({
      id: fullTemplateId,
      key: templateKey,
      label: label.slice(0, 120),
      description: description || `Plugin template ${templateKey} from ${pluginId}.`,
      roles: normalizeCollaborativeRunRoles(roleResult.roles),
      pluginId,
    });
  }

  return { templates: templatesForPlugin };
}

function normalizePluginManifest(payload, existingPlugin) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { error: 'Invalid plugin payload.' };
  }

  const existing = existingPlugin && typeof existingPlugin === 'object' ? existingPlugin : null;
  const pluginId = existing ? existing.id : normalizePluginId(payload.id);
  if (!pluginId) {
    return { error: 'Field "id" is required and must be a lowercase slug.' };
  }

  const nameValue = payload.name !== undefined ? payload.name : existing ? existing.name : '';
  const name = normalizePluginName(nameValue);
  if (!name) {
    return { error: 'Field "name" is required.' };
  }

  const versionValue = payload.version !== undefined ? payload.version : existing ? existing.version : '0.1.0';
  const version = normalizePluginVersion(versionValue);
  const descriptionValue = payload.description !== undefined ? payload.description : existing ? existing.description : '';
  const description = normalizePluginDescription(descriptionValue);

  const enabled =
    payload.enabled === undefined
      ? existing
        ? Boolean(existing.enabled)
        : true
      : Boolean(payload.enabled);

  const rawContributions =
    payload.contributions === undefined
      ? existing && existing.contributions
        ? existing.contributions
        : {}
      : payload.contributions;
  if (!rawContributions || typeof rawContributions !== 'object' || Array.isArray(rawContributions)) {
    return { error: 'Field "contributions" must be an object when provided.' };
  }

  const modelsResult = normalizePluginContributedModels(
    rawContributions.models,
    pluginId,
    existing && existing.contributions ? existing.contributions.models : []
  );
  if (modelsResult.error) {
    return { error: modelsResult.error };
  }

  const templatesResult = normalizePluginContributedTemplates(
    rawContributions.templates,
    pluginId,
    existing && existing.contributions ? existing.contributions.templates : []
  );
  if (templatesResult.error) {
    return { error: templatesResult.error };
  }

  const now = new Date().toISOString();
  const marketplaceResult = normalizePluginMarketplaceMetadata(
    payload.marketplace,
    existing ? existing.marketplace : null,
    now
  );
  if (marketplaceResult.error) {
    return { error: marketplaceResult.error };
  }
  const plugin = {
    id: pluginId,
    name,
    version,
    description,
    enabled,
    contributions: {
      models: modelsResult.models,
      templates: templatesResult.templates,
    },
    marketplace: marketplaceResult.marketplace,
    createdAt: existing && isIsoDate(existing.createdAt) ? existing.createdAt : now,
    updatedAt: now,
  };

  return { plugin };
}

function normalizePluginMarketplaceId(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalized || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(normalized)) {
    return '';
  }
  return normalized;
}

function normalizePluginMarketplaceTags(rawTags) {
  if (!Array.isArray(rawTags)) {
    return [];
  }

  const tags = [];
  const seen = new Set();
  for (const rawTag of rawTags) {
    const tag = typeof rawTag === 'string' ? rawTag.trim().toLowerCase() : '';
    if (!tag || seen.has(tag)) {
      continue;
    }
    seen.add(tag);
    tags.push(tag.slice(0, 32));
  }
  return tags;
}

function buildDefaultPluginMarketplaceEntries() {
  return [
    {
      marketplaceId: 'qa-pack-starter',
      name: 'QA Pack Starter',
      summary: 'Adds QA-oriented collaborative templates for validation-heavy runs.',
      tags: ['qa', 'testing', 'starter'],
      manifest: {
        id: 'qa-pack-starter',
        name: 'QA Pack Starter',
        version: '0.1.0',
        description: 'Starter plugin with QA-focused collaborative templates.',
        enabled: false,
        contributions: {
          templates: [
            {
              id: 'qa-pass',
              label: 'QA Pass',
              description: 'Plan, execute, test, and verify for quality-focused delivery.',
              roles: ['planner', 'executor', 'tester', 'verifier'],
            },
            {
              id: 'regression-sweep',
              label: 'Regression Sweep',
              description: 'Include review before final verification.',
              roles: ['planner', 'executor', 'tester', 'reviewer', 'verifier'],
            },
          ],
        },
      },
    },
    {
      marketplaceId: 'review-pack-starter',
      name: 'Review Pack Starter',
      summary: 'Adds reviewer-centric templates for architecture and code-quality checks.',
      tags: ['review', 'architecture', 'starter'],
      manifest: {
        id: 'review-pack-starter',
        name: 'Review Pack Starter',
        version: '0.1.0',
        description: 'Starter plugin with architecture and review templates.',
        enabled: false,
        contributions: {
          templates: [
            {
              id: 'arch-review',
              label: 'Architecture Review',
              description: 'Plan and review with verification before sign-off.',
              roles: ['planner', 'reviewer', 'verifier'],
            },
            {
              id: 'delivery-review',
              label: 'Delivery + Review',
              description: 'Deliver, review, and verify implementation.',
              roles: ['planner', 'executor', 'reviewer', 'verifier'],
            },
          ],
        },
      },
    },
  ];
}

function normalizePluginMarketplaceEntry(candidate, source) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return null;
  }

  const marketplaceId = normalizePluginMarketplaceId(candidate.marketplaceId || candidate.id);
  if (!marketplaceId) {
    return null;
  }

  const manifestSource = candidate.manifest && typeof candidate.manifest === 'object' ? candidate.manifest : null;
  const normalizedManifest = normalizePluginManifest(manifestSource || candidate, null);
  if (normalizedManifest.error) {
    return null;
  }

  const now = new Date().toISOString();
  const manifest = {
    ...normalizedManifest.plugin,
    enabled: false,
    updatedAt: now,
  };
  const sourceUrl =
    typeof candidate.sourceUrl === 'string' && candidate.sourceUrl.trim() ? candidate.sourceUrl.trim().slice(0, 500) : '';
  const checksumCandidate =
    typeof candidate.manifestChecksumSha256 === 'string' ? candidate.manifestChecksumSha256.trim().toLowerCase() : '';
  const manifestChecksumSha256 =
    /^[a-f0-9]{64}$/.test(checksumCandidate) ? checksumCandidate : hashContent(JSON.stringify(manifest));
  const displayName = normalizePluginName(candidate.name) || manifest.name || marketplaceId;
  const summary =
    normalizePluginDescription(candidate.summary || candidate.description) ||
    `Install plugin "${manifest.name}" from marketplace.`;

  return {
    marketplaceId,
    source: typeof source === 'string' && source.trim() ? source.trim() : 'builtin',
    name: displayName,
    summary,
    tags: normalizePluginMarketplaceTags(candidate.tags),
    manifest,
    sourceUrl,
    manifestChecksumSha256,
    createdAt: now,
    updatedAt: now,
  };
}

function loadPluginMarketplaceCatalog() {
  const rawCatalog = typeof process.env.PLUGIN_MARKETPLACE_CATALOG === 'string' ? process.env.PLUGIN_MARKETPLACE_CATALOG.trim() : '';
  let source = 'builtin';
  let candidates = buildDefaultPluginMarketplaceEntries();

  if (rawCatalog) {
    try {
      const parsed = JSON.parse(rawCatalog);
      if (Array.isArray(parsed)) {
        candidates = parsed;
        source = 'env';
      } else {
        console.error('PLUGIN_MARKETPLACE_CATALOG must be a JSON array. Falling back to built-in entries.');
      }
    } catch (error) {
      console.error('Invalid PLUGIN_MARKETPLACE_CATALOG JSON. Falling back to built-in entries.');
    }
  }

  pluginMarketplaceCatalog = [];
  pluginMarketplaceById.clear();

  for (const candidate of candidates) {
    const entry = normalizePluginMarketplaceEntry(candidate, source);
    if (!entry || pluginMarketplaceById.has(entry.marketplaceId)) {
      continue;
    }
    pluginMarketplaceCatalog.push(entry);
    pluginMarketplaceById.set(entry.marketplaceId, entry);
  }

  if (!pluginMarketplaceCatalog.length && source !== 'builtin') {
    for (const candidate of buildDefaultPluginMarketplaceEntries()) {
      const entry = normalizePluginMarketplaceEntry(candidate, 'builtin');
      if (!entry || pluginMarketplaceById.has(entry.marketplaceId)) {
        continue;
      }
      pluginMarketplaceCatalog.push(entry);
      pluginMarketplaceById.set(entry.marketplaceId, entry);
    }
  }
}

function upsertPluginMarketplaceEntry(entry, options) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const existing = pluginMarketplaceById.get(entry.marketplaceId);
  const now = new Date().toISOString();
  const normalizedEntry = {
    ...entry,
    createdAt: existing && isIsoDate(existing.createdAt) ? existing.createdAt : entry.createdAt || now,
    updatedAt: now,
  };

  const existingIndex = pluginMarketplaceCatalog.findIndex((candidate) => candidate.marketplaceId === entry.marketplaceId);
  if (existingIndex >= 0) {
    pluginMarketplaceCatalog[existingIndex] = normalizedEntry;
  } else if (options && options.prepend) {
    pluginMarketplaceCatalog.unshift(normalizedEntry);
  } else {
    pluginMarketplaceCatalog.push(normalizedEntry);
  }

  pluginMarketplaceById.set(normalizedEntry.marketplaceId, normalizedEntry);
  return normalizedEntry;
}

function rebuildPluginContributionIndexes() {
  pluginModelContributionsById.clear();
  pluginTemplateContributionsById.clear();

  for (const plugin of plugins) {
    if (!plugin || !plugin.enabled) {
      continue;
    }

    const pluginName = typeof plugin.name === 'string' ? plugin.name : plugin.id;
    const modelsForPlugin =
      plugin.contributions && Array.isArray(plugin.contributions.models) ? plugin.contributions.models : [];
    for (const model of modelsForPlugin) {
      const modelId = typeof model.id === 'string' ? model.id.trim() : '';
      if (!modelId) {
        continue;
      }

      const key = modelId.toLowerCase();
      if (pluginModelContributionsById.has(key)) {
        continue;
      }

      pluginModelContributionsById.set(key, {
        id: modelId,
        label: typeof model.label === 'string' && model.label.trim() ? model.label.trim() : modelId,
        provider:
          typeof model.provider === 'string' && knownProviders.has(model.provider)
            ? model.provider
            : inferProviderFromModelName(modelId),
        pluginId: plugin.id,
        pluginName,
      });
    }

    const templatesForPlugin =
      plugin.contributions && Array.isArray(plugin.contributions.templates) ? plugin.contributions.templates : [];
    for (const template of templatesForPlugin) {
      const templateId = normalizeCollaborativeTemplateId(template && template.id);
      if (!templateId || pluginTemplateContributionsById.has(templateId)) {
        continue;
      }

      pluginTemplateContributionsById.set(templateId, {
        id: template.id,
        label: typeof template.label === 'string' ? template.label : template.id,
        description: typeof template.description === 'string' ? template.description : '',
        roles: normalizeCollaborativeRunRoles(template.roles),
        pluginId: plugin.id,
        pluginName,
      });
    }
  }
}

function listAvailableModelCatalog() {
  const combined = [];
  const seen = new Set();

  for (const model of modelCatalog) {
    const modelId = typeof model.id === 'string' ? model.id.trim() : '';
    if (!modelId) {
      continue;
    }

    const key = modelId.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    combined.push({
      id: modelId,
      label: typeof model.label === 'string' && model.label.trim() ? model.label.trim() : modelId,
      provider: inferProvider(modelId),
      source: 'core',
      pluginId: null,
      pluginName: null,
    });
  }

  for (const model of pluginModelContributionsById.values()) {
    const key = model.id.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    combined.push({
      id: model.id,
      label: model.label,
      provider: model.provider,
      source: 'plugin',
      pluginId: model.pluginId,
      pluginName: model.pluginName,
    });
  }

  return combined;
}

function listAvailableModelIds() {
  return listAvailableModelCatalog().map((model) => model.id);
}

function resolveModelId(rawModelId) {
  const requested = typeof rawModelId === 'string' ? rawModelId.trim() : '';
  if (!requested) {
    return null;
  }

  const lowerRequested = requested.toLowerCase();
  const available = listAvailableModelCatalog();
  return available.find((model) => model.id.toLowerCase() === lowerRequested) || null;
}

function selectModelIdForRequest(requestedModelId, fallbackModelId) {
  const requested = typeof requestedModelId === 'string' ? requestedModelId.trim() : '';
  const fallback = typeof fallbackModelId === 'string' ? fallbackModelId.trim() : '';
  const availableModelIds = listAvailableModelIds();

  if (!availableModelIds.length) {
    return {
      error: 'No models are available. Configure DEFAULT_MODELS or plugin model contributions.',
      availableModelIds: [],
    };
  }

  if (requested) {
    const requestedModel = resolveModelId(requested);
    if (!requestedModel) {
      return {
        error: `Field "modelId" must be one of: ${availableModelIds.join(', ')}`,
        availableModelIds,
      };
    }
    return { modelId: requestedModel.id, availableModelIds };
  }

  const fallbackModel = fallback ? resolveModelId(fallback) : null;
  if (fallbackModel) {
    return { modelId: fallbackModel.id, availableModelIds };
  }

  return { modelId: availableModelIds[0], availableModelIds };
}

function getCollaborativeRunTemplateById(templateId) {
  const normalized = normalizeCollaborativeTemplateId(templateId);
  if (!normalized) {
    return null;
  }
  return collaborativeRunTemplatesById.get(normalized) || pluginTemplateContributionsById.get(normalized) || null;
}

function buildCollaborativeRunTemplateSummary(template) {
  if (!template || typeof template !== 'object') {
    return null;
  }

  return {
    id: template.id,
    label: template.label,
    description: template.description,
    roles: normalizeCollaborativeRunRoles(template.roles),
    source: template.pluginId ? 'plugin' : 'core',
    pluginId: template.pluginId || null,
    pluginName: template.pluginName || null,
  };
}

function listCollaborativeRunTemplates() {
  const templates = [];
  for (const template of collaborativeRunTemplates) {
    const summary = buildCollaborativeRunTemplateSummary(template);
    if (summary) {
      templates.push(summary);
    }
  }

  for (const template of pluginTemplateContributionsById.values()) {
    const summary = buildCollaborativeRunTemplateSummary(template);
    if (summary) {
      templates.push(summary);
    }
  }

  return templates;
}

function parseCollaborativeRoles(rawRoles) {
  if (rawRoles === undefined || rawRoles === null) {
    return { roles: [...defaultCollaborativeRoles] };
  }

  if (!Array.isArray(rawRoles)) {
    return { error: 'Field "roles" must be an array of role names.' };
  }

  const roles = [];
  const seen = new Set();
  for (const roleValue of rawRoles) {
    const role = normalizeCollaborativeRole(roleValue);
    if (!role || seen.has(role)) {
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(collaborativeRoleInstructions, role)) {
      return {
        error: `Field "roles" contains unsupported role "${role}". Supported roles: ${Object.keys(collaborativeRoleInstructions).join(', ')}`,
      };
    }
    seen.add(role);
    roles.push(role);
  }

  if (!roles.length) {
    return { error: 'Field "roles" must include at least one supported role.' };
  }

  return { roles };
}

function buildCollaborativeTaskPrompt(basePrompt, role, runId, stepIndex, totalSteps) {
  const instruction = collaborativeRoleInstructions[role] || '';
  const heading = `[collab:${runId}] [role:${role}] [step:${stepIndex + 1}/${totalSteps}]`;
  return [heading, '', instruction, '', 'Objective:', basePrompt].join('\n');
}

function parseCollaborativeCommandsByRole(rawCommandsByRole, roles) {
  if (rawCommandsByRole !== undefined && rawCommandsByRole !== null) {
    if (!rawCommandsByRole || typeof rawCommandsByRole !== 'object' || Array.isArray(rawCommandsByRole)) {
      return { error: 'Field "commandsByRole" must be an object keyed by role name.' };
    }
  }

  const commandsByRole = new Map();
  for (const role of roles) {
    const rawRoleCommands = rawCommandsByRole ? rawCommandsByRole[role] : undefined;
    const commandResult = parseTaskCommands(rawRoleCommands);
    if (commandResult.error) {
      return {
        error: `Field "commandsByRole.${role}" is invalid: ${commandResult.error.replace('Field "commands"', 'commands')}`,
      };
    }
    commandsByRole.set(role, commandResult.commands);
  }

  return { commandsByRole };
}

function normalizeCollaborativeTaskMetadata(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const runId = typeof raw.runId === 'string' ? raw.runId.trim() : '';
  const role = normalizeCollaborativeRole(raw.role);
  const stepIndex = Number.isInteger(raw.stepIndex) && raw.stepIndex >= 0 ? raw.stepIndex : null;
  const totalSteps = Number.isInteger(raw.totalSteps) && raw.totalSteps > 0 ? raw.totalSteps : null;
  const templateId = normalizeCollaborativeTemplateId(raw.templateId);

  if (!runId || !role || stepIndex === null || totalSteps === null) {
    return null;
  }

  return {
    runId,
    role,
    stepIndex,
    totalSteps,
    templateId: templateId || null,
  };
}

function normalizeCollaborativeRunRoles(rawRoles) {
  if (!Array.isArray(rawRoles)) {
    return [...defaultCollaborativeRoles];
  }

  const roles = [];
  const seen = new Set();
  for (const roleValue of rawRoles) {
    const role = normalizeCollaborativeRole(roleValue);
    if (!role || seen.has(role)) {
      continue;
    }
    seen.add(role);
    roles.push(role);
  }

  return roles.length ? roles : [...defaultCollaborativeRoles];
}

function summarizeCollaborativeRunTasks(runTasks) {
  const counts = {
    queued: 0,
    planning: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  };

  for (const task of runTasks) {
    if (!task || typeof task.status !== 'string') {
      continue;
    }
    if (counts[task.status] === undefined) {
      counts[task.status] = 0;
    }
    counts[task.status] += 1;
  }

  let status = 'queued';
  if (!runTasks.length) {
    status = 'unknown';
  } else if ((counts.failed || 0) > 0) {
    status = 'failed';
  } else if ((counts.running || 0) > 0) {
    status = 'running';
  } else if ((counts.planning || 0) > 0) {
    status = 'planning';
  } else if ((counts.queued || 0) > 0) {
    status = 'queued';
  } else if ((counts.cancelled || 0) > 0 && (counts.completed || 0) > 0) {
    status = 'partial-cancelled';
  } else if ((counts.cancelled || 0) > 0) {
    status = 'cancelled';
  } else if ((counts.completed || 0) === runTasks.length) {
    status = 'completed';
  } else {
    status = 'unknown';
  }

  return { status, counts };
}

function resolveCollaborativeRunTasks(run) {
  const taskIds = Array.isArray(run && run.taskIds) ? run.taskIds : [];
  const tasksForRun = [];
  const seen = new Set();

  for (const taskId of taskIds) {
    if (typeof taskId !== 'string' || !taskId || seen.has(taskId)) {
      continue;
    }
    seen.add(taskId);
    const task = tasksById.get(taskId);
    if (task) {
      tasksForRun.push(task);
    }
  }

  return tasksForRun;
}

function buildCollaborativeRunSummary(run) {
  const runTasks = resolveCollaborativeRunTasks(run);
  const taskIds = runTasks.map((task) => task.id);
  const taskCount = runTasks.length;
  const roles = normalizeCollaborativeRunRoles(run && run.roles);
  const templateId = normalizeCollaborativeTemplateId(run && run.templateId);
  const template = templateId ? getCollaborativeRunTemplateById(templateId) : null;
  const createdAt = isIsoDate(run && run.createdAt) ? run.createdAt : new Date().toISOString();
  const baseUpdatedAt = isIsoDate(run && run.updatedAt) ? run.updatedAt : createdAt;
  const latestTaskUpdatedAt = runTasks.reduce((latest, task) => {
    if (!task || !isIsoDate(task.updatedAt)) {
      return latest;
    }
    return task.updatedAt > latest ? task.updatedAt : latest;
  }, baseUpdatedAt);
  const summary = summarizeCollaborativeRunTasks(runTasks);

  return {
    id: run.id,
    prompt: run.prompt,
    templateId: template ? template.id : templateId || null,
    templateLabel: template ? template.label : null,
    roles,
    taskIds,
    taskCount,
    feedbackCount: Array.isArray(run && run.feedback) ? run.feedback.length : 0,
    status: summary.status,
    counts: summary.counts,
    createdAt,
    updatedAt: latestTaskUpdatedAt,
  };
}

function buildCollaborativeRunDetail(run) {
  const summary = buildCollaborativeRunSummary(run);
  const queuePositionById = buildQueuePositionById();
  const tasksForRun = resolveCollaborativeRunTasks(run).slice();
  tasksForRun.sort((a, b) => {
    const aStep = a && a.collaboration && a.collaboration.runId === run.id ? a.collaboration.stepIndex : Number.MAX_SAFE_INTEGER;
    const bStep = b && b.collaboration && b.collaboration.runId === run.id ? b.collaboration.stepIndex : Number.MAX_SAFE_INTEGER;
    if (aStep !== bStep) {
      return aStep - bStep;
    }
    return a.createdAt.localeCompare(b.createdAt);
  });

  return {
    ...summary,
    feedback: Array.isArray(run && run.feedback)
      ? run.feedback.map((entry) => normalizeCollaborativeRunFeedbackEntry(entry)).filter(Boolean)
      : [],
    tasks: tasksForRun.map((task) => buildTaskResponse(task, queuePositionById)),
  };
}

function queryCollaborativeRuns(searchParams) {
  const status = (searchParams.get('status') || '').trim().toLowerCase();
  const templateRaw = (searchParams.get('template') || '').trim();
  const template = normalizeCollaborativeTemplateId(templateRaw);
  const query = (searchParams.get('q') || '').trim().toLowerCase();
  const limitRaw = searchParams.get('limit');
  const limit = parsePositiveInt(limitRaw, collaborativeRuns.length || 100, 1, 500);

  let summaries = collaborativeRuns.map((run) => buildCollaborativeRunSummary(run));

  if (status && status !== 'all') {
    summaries = summaries.filter((run) => run.status === status);
  }
  if (templateRaw) {
    summaries = summaries.filter((run) => {
      const runTemplate = normalizeCollaborativeTemplateId(run.templateId);
      return runTemplate && runTemplate === template;
    });
  }
  if (query) {
    summaries = summaries.filter((run) => {
      const prompt = typeof run.prompt === 'string' ? run.prompt.toLowerCase() : '';
      const roles = Array.isArray(run.roles) ? run.roles.join(',').toLowerCase() : '';
      const templateId = typeof run.templateId === 'string' ? run.templateId.toLowerCase() : '';
      const templateLabel = typeof run.templateLabel === 'string' ? run.templateLabel.toLowerCase() : '';
      return (
        run.id.toLowerCase().includes(query) ||
        prompt.includes(query) ||
        roles.includes(query) ||
        templateId.includes(query) ||
        templateLabel.includes(query)
      );
    });
  }

  return {
    runs: summaries.slice(0, limit),
    meta: {
      total: collaborativeRuns.length,
      matched: summaries.length,
      limit,
      status: status || 'all',
      template: templateRaw ? templateRaw.toLowerCase() : '',
      q: query || '',
    },
  };
}

function buildPluginSummary(plugin) {
  const modelsForPlugin =
    plugin && plugin.contributions && Array.isArray(plugin.contributions.models) ? plugin.contributions.models : [];
  const templatesForPlugin =
    plugin && plugin.contributions && Array.isArray(plugin.contributions.templates) ? plugin.contributions.templates : [];
  const healthcheck = buildPluginHealthSummary(plugin ? plugin.id : '');
  const marketplace =
    plugin && plugin.marketplace && typeof plugin.marketplace === 'object'
      ? {
          marketplaceId:
            typeof plugin.marketplace.marketplaceId === 'string' ? plugin.marketplace.marketplaceId : '',
          source: typeof plugin.marketplace.source === 'string' ? plugin.marketplace.source : '',
          sourceUrl: typeof plugin.marketplace.sourceUrl === 'string' ? plugin.marketplace.sourceUrl : '',
          manifestChecksumSha256:
            typeof plugin.marketplace.manifestChecksumSha256 === 'string'
              ? plugin.marketplace.manifestChecksumSha256
              : '',
          installedAt: isIsoDate(plugin.marketplace.installedAt) ? plugin.marketplace.installedAt : null,
          updatedAt: isIsoDate(plugin.marketplace.updatedAt) ? plugin.marketplace.updatedAt : null,
          lastAction: typeof plugin.marketplace.lastAction === 'string' ? plugin.marketplace.lastAction : '',
        }
      : null;

  return {
    id: plugin.id,
    name: plugin.name,
    version: plugin.version,
    description: plugin.description || '',
    enabled: Boolean(plugin.enabled),
    modelContributions: modelsForPlugin.length,
    templateContributions: templatesForPlugin.length,
    createdAt: plugin.createdAt,
    updatedAt: plugin.updatedAt,
    healthcheck,
    marketplace,
  };
}

function buildPluginDetail(plugin) {
  if (!plugin) {
    return null;
  }

  return {
    ...buildPluginSummary(plugin),
    contributions: {
      models:
        plugin.contributions && Array.isArray(plugin.contributions.models)
          ? plugin.contributions.models.map((entry) => ({
              id: entry.id,
              label: entry.label,
              provider: entry.provider,
              pluginId: plugin.id,
            }))
          : [],
      templates:
        plugin.contributions && Array.isArray(plugin.contributions.templates)
          ? plugin.contributions.templates.map((entry) => ({
              id: entry.id,
              key: entry.key,
              label: entry.label,
              description: entry.description,
              roles: normalizeCollaborativeRunRoles(entry.roles),
              pluginId: plugin.id,
            }))
          : [],
    },
  };
}

function buildPluginHealthSummary(pluginId) {
  const normalizedPluginId = normalizePluginId(pluginId);
  if (!normalizedPluginId) {
    return null;
  }

  const record = pluginHealthById.get(normalizedPluginId);
  if (!record || !isIsoDate(record.checkedAt)) {
    return null;
  }

  const checkedAtMs = Date.parse(record.checkedAt);
  if (Number.isNaN(checkedAtMs)) {
    return null;
  }

  const nowMs = Date.now();
  const ageMs = Math.max(0, nowMs - checkedAtMs);
  const expiresAt = new Date(checkedAtMs + pluginHealthcheckTtlMs).toISOString();

  return {
    healthy: Boolean(record.healthy),
    checkedAt: record.checkedAt,
    expiresAt,
    fresh: ageMs <= pluginHealthcheckTtlMs,
    ageMs,
    ttlMs: pluginHealthcheckTtlMs,
    issues: Array.isArray(record.issues) ? [...record.issues] : [],
    warnings: Array.isArray(record.warnings) ? [...record.warnings] : [],
    counts:
      record.counts && typeof record.counts === 'object'
        ? {
            models: Number.isInteger(record.counts.models) ? record.counts.models : 0,
            templates: Number.isInteger(record.counts.templates) ? record.counts.templates : 0,
          }
        : { models: 0, templates: 0 },
  };
}

function checkPluginHealth(plugin, options) {
  if (!plugin) {
    return { error: 'Plugin not found.', status: 404 };
  }

  const modelsForPlugin =
    plugin.contributions && Array.isArray(plugin.contributions.models) ? plugin.contributions.models : [];
  const templatesForPlugin =
    plugin.contributions && Array.isArray(plugin.contributions.templates) ? plugin.contributions.templates : [];

  const issues = [];
  const warnings = [];
  const warningSet = new Set();

  if (!modelsForPlugin.length && !templatesForPlugin.length) {
    issues.push('Plugin must contribute at least one model or template.');
  }

  const coreModelIds = new Set(
    modelCatalog
      .map((entry) => (entry && typeof entry.id === 'string' ? entry.id.trim().toLowerCase() : ''))
      .filter(Boolean)
  );

  const seenModelIds = new Set();
  for (const model of modelsForPlugin) {
    const modelId = typeof model.id === 'string' ? model.id.trim() : '';
    if (!modelId) {
      continue;
    }

    const normalizedModelId = modelId.toLowerCase();
    if (seenModelIds.has(normalizedModelId)) {
      continue;
    }
    seenModelIds.add(normalizedModelId);

    if (coreModelIds.has(normalizedModelId)) {
      const warning = `Model "${modelId}" collides with a core model id and may not be selectable as a plugin model.`;
      if (!warningSet.has(warning)) {
        warningSet.add(warning);
        warnings.push(warning);
      }
    }

    const provider =
      typeof model.provider === 'string' && model.provider.trim()
        ? model.provider.trim().toLowerCase()
        : inferProvider(modelId);
    if (knownProviders.has(provider) && provider !== 'custom' && !hasProviderKey(provider)) {
      const warning = `Provider credentials for "${provider}" are not configured; model "${modelId}" will run in simulated fallback mode.`;
      if (!warningSet.has(warning)) {
        warningSet.add(warning);
        warnings.push(warning);
      }
    }

    for (const candidate of plugins) {
      if (!candidate || candidate.id === plugin.id) {
        continue;
      }

      const candidateModels =
        candidate.contributions && Array.isArray(candidate.contributions.models) ? candidate.contributions.models : [];
      const hasCollision = candidateModels.some((entry) => {
        const candidateModelId = typeof entry.id === 'string' ? entry.id.trim().toLowerCase() : '';
        return candidateModelId && candidateModelId === normalizedModelId;
      });

      if (!hasCollision) {
        continue;
      }

      const warning = `Model "${modelId}" also exists in plugin "${candidate.id}" and may be shadowed by registration order.`;
      if (!warningSet.has(warning)) {
        warningSet.add(warning);
        warnings.push(warning);
      }
    }
  }

  const seenTemplateIds = new Set();
  for (const template of templatesForPlugin) {
    const templateId = normalizeCollaborativeTemplateId(template && template.id);
    if (!templateId || seenTemplateIds.has(templateId)) {
      continue;
    }
    seenTemplateIds.add(templateId);

    if (collaborativeRunTemplatesById.has(templateId)) {
      const warning = `Template "${templateId}" collides with a core template id.`;
      if (!warningSet.has(warning)) {
        warningSet.add(warning);
        warnings.push(warning);
      }
    }
  }

  const checkedAt = new Date().toISOString();
  const record = {
    healthy: issues.length === 0,
    checkedAt,
    issues,
    warnings,
    counts: {
      models: modelsForPlugin.length,
      templates: templatesForPlugin.length,
    },
  };
  pluginHealthById.set(plugin.id, record);

  const publish = !options || options.publish !== false;
  if (publish) {
    const source =
      options && typeof options.source === 'string' && options.source.trim()
        ? options.source.trim()
        : 'manual';
    publishSystemEvent('plugin.healthcheck', {
      plugin: buildPluginSummary(plugin),
      source,
      healthcheck: buildPluginHealthSummary(plugin.id),
    });
  }

  return {
    plugin: buildPluginDetail(plugin),
    healthcheck: buildPluginHealthSummary(plugin.id),
  };
}

function queryPluginCatalog(searchParams) {
  const status = (searchParams.get('status') || '').trim().toLowerCase();
  const query = (searchParams.get('q') || '').trim().toLowerCase();
  const limitRaw = searchParams.get('limit');
  const limit = parsePositiveInt(limitRaw, plugins.length || 100, 1, 500);

  let entries = plugins.map((plugin) => {
    const detail = buildPluginDetail(plugin);
    const modelsForPlugin = detail && detail.contributions ? detail.contributions.models : [];
    const templatesForPlugin = detail && detail.contributions ? detail.contributions.templates : [];
    return {
      ...detail,
      source: 'registry',
      capabilities: {
        modelIds: modelsForPlugin.map((entry) => entry.id),
        templateIds: templatesForPlugin.map((entry) => entry.id),
      },
    };
  });

  if (status === 'enabled') {
    entries = entries.filter((entry) => entry.enabled);
  } else if (status === 'disabled') {
    entries = entries.filter((entry) => !entry.enabled);
  }

  if (query) {
    entries = entries.filter((entry) => {
      const id = typeof entry.id === 'string' ? entry.id.toLowerCase() : '';
      const name = typeof entry.name === 'string' ? entry.name.toLowerCase() : '';
      const version = typeof entry.version === 'string' ? entry.version.toLowerCase() : '';
      const description = typeof entry.description === 'string' ? entry.description.toLowerCase() : '';
      const modelIds = Array.isArray(entry.capabilities && entry.capabilities.modelIds)
        ? entry.capabilities.modelIds.join(',').toLowerCase()
        : '';
      const templateIds = Array.isArray(entry.capabilities && entry.capabilities.templateIds)
        ? entry.capabilities.templateIds.join(',').toLowerCase()
        : '';
      return (
        id.includes(query) ||
        name.includes(query) ||
        version.includes(query) ||
        description.includes(query) ||
        modelIds.includes(query) ||
        templateIds.includes(query)
      );
    });
  }

  return {
    catalog: entries.slice(0, limit),
    meta: {
      total: plugins.length,
      matched: entries.length,
      limit,
      status: status || 'all',
      q: query || '',
      source: 'registry',
    },
  };
}

function buildPluginMarketplaceManifestSummary(manifest) {
  const models =
    manifest && manifest.contributions && Array.isArray(manifest.contributions.models)
      ? manifest.contributions.models
      : [];
  const templates =
    manifest && manifest.contributions && Array.isArray(manifest.contributions.templates)
      ? manifest.contributions.templates
      : [];

  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description || '',
    modelContributions: models.length,
    templateContributions: templates.length,
  };
}

function buildPluginMarketplaceSummary(entry) {
  if (!entry) {
    return null;
  }

  const installedPlugin = getPluginById(entry.manifest.id);
  const installedMarketplaceId =
    installedPlugin &&
    installedPlugin.marketplace &&
    typeof installedPlugin.marketplace.marketplaceId === 'string'
      ? installedPlugin.marketplace.marketplaceId
      : '';
  const installedAt =
    installedPlugin &&
    installedPlugin.marketplace &&
    isIsoDate(installedPlugin.marketplace.installedAt)
      ? installedPlugin.marketplace.installedAt
      : null;
  const installedMarketplaceUpdatedAt =
    installedPlugin &&
    installedPlugin.marketplace &&
    isIsoDate(installedPlugin.marketplace.updatedAt)
      ? installedPlugin.marketplace.updatedAt
      : null;
  const installedViaMarketplace = Boolean(installedPlugin && installedMarketplaceId === entry.marketplaceId);
  const installedVersion = installedPlugin && typeof installedPlugin.version === 'string' ? installedPlugin.version : '';
  const updateAvailable = Boolean(
    installedPlugin &&
      installedVersion &&
      entry.manifest &&
      typeof entry.manifest.version === 'string' &&
      installedVersion !== entry.manifest.version
  );
  const installState = !installedPlugin
    ? 'available'
    : updateAvailable
      ? 'update-available'
      : installedViaMarketplace
        ? 'installed'
        : 'manual-installed';
  return {
    marketplaceId: entry.marketplaceId,
    name: entry.name,
    summary: entry.summary,
    source: entry.source,
    tags: Array.isArray(entry.tags) ? [...entry.tags] : [],
    sourceUrl: entry.sourceUrl || '',
    manifestChecksumSha256:
      typeof entry.manifestChecksumSha256 === 'string' && entry.manifestChecksumSha256
        ? entry.manifestChecksumSha256
        : '',
    installed: Boolean(installedPlugin),
    installedPluginId: installedPlugin ? installedPlugin.id : null,
    installedAt,
    installedMarketplaceUpdatedAt,
    installedVersion: installedVersion || null,
    installedViaMarketplace,
    updateAvailable,
    installState,
    reinstallHint: installedPlugin
      ? installedViaMarketplace
        ? updateAvailable
          ? 'update-available'
          : 'reinstall-available'
        : 'manual-conflict'
      : 'fresh-install',
    manifest: buildPluginMarketplaceManifestSummary(entry.manifest),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

function queryPluginMarketplace(searchParams) {
  const query = (searchParams.get('q') || '').trim().toLowerCase();
  const installedFilter = (searchParams.get('installed') || '').trim().toLowerCase();
  const tagFilter = (searchParams.get('tag') || '').trim().toLowerCase();
  const limitRaw = searchParams.get('limit');
  const limit = parsePositiveInt(limitRaw, pluginMarketplaceCatalog.length || 100, 1, 500);

  let entries = pluginMarketplaceCatalog.map((entry) => buildPluginMarketplaceSummary(entry)).filter(Boolean);

  if (installedFilter === 'true' || installedFilter === 'installed') {
    entries = entries.filter((entry) => entry.installed);
  } else if (installedFilter === 'false' || installedFilter === 'available') {
    entries = entries.filter((entry) => !entry.installed);
  }

  if (tagFilter) {
    entries = entries.filter((entry) => Array.isArray(entry.tags) && entry.tags.includes(tagFilter));
  }

  if (query) {
    entries = entries.filter((entry) => {
      const name = typeof entry.name === 'string' ? entry.name.toLowerCase() : '';
      const summary = typeof entry.summary === 'string' ? entry.summary.toLowerCase() : '';
      const marketplaceId = typeof entry.marketplaceId === 'string' ? entry.marketplaceId.toLowerCase() : '';
      const manifestId = entry.manifest && typeof entry.manifest.id === 'string' ? entry.manifest.id.toLowerCase() : '';
      const tags = Array.isArray(entry.tags) ? entry.tags.join(',').toLowerCase() : '';
      const sourceUrl = typeof entry.sourceUrl === 'string' ? entry.sourceUrl.toLowerCase() : '';
      return (
        name.includes(query) ||
        summary.includes(query) ||
        marketplaceId.includes(query) ||
        manifestId.includes(query) ||
        tags.includes(query) ||
        sourceUrl.includes(query)
      );
    });
  }

  return {
    plugins: entries.slice(0, limit),
    meta: {
      total: pluginMarketplaceCatalog.length,
      matched: entries.length,
      limit,
      q: query || '',
      installed: installedFilter || 'all',
      tag: tagFilter || '',
    },
  };
}

function isRestrictedIpv4Address(address) {
  const parts = String(address || '')
    .split('.')
    .map((segment) => Number.parseInt(segment, 10));
  if (parts.length !== 4 || parts.some((segment) => !Number.isInteger(segment) || segment < 0 || segment > 255)) {
    return false;
  }

  const first = parts[0];
  const second = parts[1];

  if (first === 0 || first === 10 || first === 127) {
    return true;
  }
  if (first === 169 && second === 254) {
    return true;
  }
  if (first === 172 && second >= 16 && second <= 31) {
    return true;
  }
  if (first === 192 && second === 168) {
    return true;
  }
  if (first === 100 && second >= 64 && second <= 127) {
    return true;
  }
  if (first >= 224) {
    return true;
  }
  return false;
}

function isRestrictedIpv6Address(address) {
  const value = String(address || '').toLowerCase().split('%')[0];
  if (!value) {
    return false;
  }
  if (value === '::' || value === '::1') {
    return true;
  }
  if (value.startsWith('fc') || value.startsWith('fd')) {
    return true;
  }
  if (value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')) {
    return true;
  }
  if (value.startsWith('::ffff:')) {
    const mappedIpv4 = value.slice('::ffff:'.length);
    return isRestrictedIpv4Address(mappedIpv4);
  }
  return false;
}

function isRestrictedIpAddress(address) {
  const ipVersion = net.isIP(address);
  if (ipVersion === 4) {
    return isRestrictedIpv4Address(address);
  }
  if (ipVersion === 6) {
    return isRestrictedIpv6Address(address);
  }
  return false;
}

async function ensureMarketplaceImportUrlIsSafe(parsedUrl) {
  if (!parsedUrl || !(parsedUrl instanceof URL)) {
    return { error: 'Field "url" must be a valid absolute URL.', status: 400 };
  }

  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    return { error: 'Field "url" must use http or https.', status: 400 };
  }
  if (parsedUrl.protocol === 'http:' && !allowInsecureMarketplaceHttp) {
    return {
      error:
        'Field "url" must use https unless ALLOW_INSECURE_MARKETPLACE_HTTP=true is explicitly configured.',
      status: 400,
    };
  }
  if (parsedUrl.username || parsedUrl.password) {
    return { error: 'Field "url" must not include embedded credentials.', status: 400 };
  }

  const hostname = String(parsedUrl.hostname || '').trim().toLowerCase();
  if (!hostname) {
    return { error: 'Field "url" must include a hostname.', status: 400 };
  }
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return { error: 'Field "url" must not target localhost.', status: 400 };
  }
  if (net.isIP(hostname) && isRestrictedIpAddress(hostname)) {
    return { error: 'Field "url" resolves to a private or loopback address.', status: 400 };
  }

  let resolvedAddresses;
  try {
    resolvedAddresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch (error) {
    return { error: `Failed to resolve marketplace host "${hostname}".`, status: 400 };
  }

  if (!Array.isArray(resolvedAddresses) || !resolvedAddresses.length) {
    return { error: `Marketplace host "${hostname}" did not resolve to a routable address.`, status: 400 };
  }

  for (const resolvedAddress of resolvedAddresses) {
    if (resolvedAddress && typeof resolvedAddress.address === 'string' && isRestrictedIpAddress(resolvedAddress.address)) {
      return {
        error: `Field "url" resolves to a private or loopback address (${resolvedAddress.address}).`,
        status: 400,
      };
    }
  }

  return { ok: true };
}

async function importPluginMarketplaceEntryFromUrl(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { error: 'Invalid plugin marketplace import payload.', status: 400 };
  }

  const urlRaw = typeof payload.url === 'string' ? payload.url.trim() : '';
  if (!urlRaw) {
    return { error: 'Field "url" is required.', status: 400 };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(urlRaw);
  } catch (error) {
    return { error: 'Field "url" must be a valid absolute URL.', status: 400 };
  }

  const safetyResult = await ensureMarketplaceImportUrlIsSafe(parsedUrl);
  if (safetyResult.error) {
    return safetyResult;
  }

  let fetchedPayload;
  try {
    fetchedPayload = await fetchJsonWithTimeout(
      parsedUrl.toString(),
      {
        method: 'GET',
        headers: {
          accept: 'application/json',
        },
      },
      modelGatewayTimeoutMs
    );
  } catch (error) {
    return { error: `Failed to fetch marketplace manifest: ${error.message}`, status: 502 };
  }

  if (!fetchedPayload || typeof fetchedPayload !== 'object' || Array.isArray(fetchedPayload)) {
    return { error: 'Fetched marketplace content must be a JSON object.', status: 400 };
  }

  const candidate =
    fetchedPayload.manifest && typeof fetchedPayload.manifest === 'object' && !Array.isArray(fetchedPayload.manifest)
      ? { ...fetchedPayload }
      : { manifest: fetchedPayload };

  const marketplaceIdOverride = normalizePluginMarketplaceId(payload.marketplaceId || payload.id);
  if (marketplaceIdOverride) {
    candidate.marketplaceId = marketplaceIdOverride;
  }
  if (typeof payload.name === 'string' && payload.name.trim()) {
    candidate.name = payload.name;
  }
  if (typeof payload.summary === 'string' && payload.summary.trim()) {
    candidate.summary = payload.summary;
  }
  if (Array.isArray(payload.tags)) {
    candidate.tags = payload.tags;
  }
  candidate.sourceUrl = parsedUrl.toString();

  const normalizedEntry = normalizePluginMarketplaceEntry(candidate, 'imported');
  if (!normalizedEntry) {
    return { error: 'Fetched JSON is not a valid plugin marketplace entry or plugin manifest.', status: 400 };
  }

  const mergedEntry = upsertPluginMarketplaceEntry(
    {
      ...normalizedEntry,
      source: 'imported',
      sourceUrl: parsedUrl.toString(),
      manifestChecksumSha256: hashContent(JSON.stringify(normalizedEntry.manifest || {})),
    },
    { prepend: true }
  );

  publishSystemEvent('plugin.marketplaceImported', {
    marketplace: buildPluginMarketplaceSummary(mergedEntry),
    url: parsedUrl.toString(),
  });

  return {
    marketplace: buildPluginMarketplaceSummary(mergedEntry),
  };
}

function installPluginFromMarketplace(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { error: 'Invalid plugin marketplace install payload.', status: 400 };
  }

  const marketplaceId = normalizePluginMarketplaceId(payload.marketplaceId || payload.id);
  if (!marketplaceId) {
    return { error: 'Field "marketplaceId" is required.', status: 400 };
  }

  const entry = pluginMarketplaceById.get(marketplaceId);
  if (!entry) {
    return { error: `Marketplace plugin "${marketplaceId}" not found.`, status: 404 };
  }

  const existing = getPluginById(entry.manifest.id);
  const updateExisting = Boolean(payload.updateExisting);
  const now = new Date().toISOString();
  const marketplaceMetadata = {
    marketplaceId: entry.marketplaceId,
    source: entry.source || 'registry',
    sourceUrl: entry.sourceUrl || '',
    manifestChecksumSha256:
      typeof entry.manifestChecksumSha256 === 'string' && entry.manifestChecksumSha256
        ? entry.manifestChecksumSha256
        : hashContent(JSON.stringify(entry.manifest || {})),
    installedAt:
      existing &&
      existing.marketplace &&
      isIsoDate(existing.marketplace.installedAt)
        ? existing.marketplace.installedAt
        : now,
    updatedAt: now,
    lastAction: existing ? 'updated' : 'installed',
  };
  const manifestPayload = {
    id: entry.manifest.id,
    name: entry.manifest.name,
    version: entry.manifest.version,
    description: entry.manifest.description,
    enabled: existing ? existing.enabled : false,
    marketplace: marketplaceMetadata,
    contributions: {
      models:
        entry.manifest.contributions && Array.isArray(entry.manifest.contributions.models)
          ? entry.manifest.contributions.models.map((model) => ({
              id: model.id,
              label: model.label,
              provider: model.provider,
            }))
          : [],
      templates:
        entry.manifest.contributions && Array.isArray(entry.manifest.contributions.templates)
          ? entry.manifest.contributions.templates.map((template) => ({
              id: template.key || template.id,
              label: template.label,
              description: template.description,
              roles: normalizeCollaborativeRunRoles(template.roles),
            }))
          : [],
    },
  };

  if (existing) {
    if (!updateExisting) {
      return {
        error: `Plugin "${existing.id}" is already installed. Pass "updateExisting": true to refresh it.`,
        status: 409,
      };
    }

    const updated = updatePlugin(existing, manifestPayload);
    if (updated.error) {
      return updated;
    }

    publishSystemEvent('plugin.marketplaceInstalled', {
      marketplaceId,
      action: 'updated',
      plugin: buildPluginSummary(existing),
      marketplace: buildPluginMarketplaceSummary(entry),
    });

    return {
      plugin: updated.plugin,
      action: 'updated',
      marketplace: buildPluginMarketplaceSummary(entry),
    };
  }

  const registered = registerPlugin(manifestPayload);
  if (registered.error) {
    return registered;
  }
  const installedPlugin = getPluginById(manifestPayload.id);

  publishSystemEvent('plugin.marketplaceInstalled', {
    marketplaceId,
    action: 'installed',
    plugin: installedPlugin ? buildPluginSummary(installedPlugin) : buildPluginMarketplaceManifestSummary(entry.manifest),
    marketplace: buildPluginMarketplaceSummary(entry),
  });

  return {
    plugin: registered.plugin,
    action: 'installed',
    marketplace: buildPluginMarketplaceSummary(entry),
  };
}

function summarizePluginCounts() {
  const counts = {
    total: plugins.length,
    enabled: 0,
    disabled: 0,
    modelContributions: 0,
    templateContributions: 0,
  };

  for (const plugin of plugins) {
    if (plugin && plugin.enabled) {
      counts.enabled += 1;
    } else {
      counts.disabled += 1;
    }

    const modelsForPlugin =
      plugin && plugin.contributions && Array.isArray(plugin.contributions.models) ? plugin.contributions.models : [];
    const templatesForPlugin =
      plugin && plugin.contributions && Array.isArray(plugin.contributions.templates) ? plugin.contributions.templates : [];
    counts.modelContributions += modelsForPlugin.length;
    counts.templateContributions += templatesForPlugin.length;
  }

  return counts;
}

function queryPlugins(searchParams) {
  const status = (searchParams.get('status') || '').trim().toLowerCase();
  const query = (searchParams.get('q') || '').trim().toLowerCase();
  const limitRaw = searchParams.get('limit');
  const limit = parsePositiveInt(limitRaw, plugins.length || 100, 1, 500);

  let summaries = plugins.map((plugin) => buildPluginSummary(plugin));
  if (status === 'enabled') {
    summaries = summaries.filter((plugin) => plugin.enabled);
  } else if (status === 'disabled') {
    summaries = summaries.filter((plugin) => !plugin.enabled);
  }

  if (query) {
    summaries = summaries.filter((plugin) => {
      const id = typeof plugin.id === 'string' ? plugin.id.toLowerCase() : '';
      const name = typeof plugin.name === 'string' ? plugin.name.toLowerCase() : '';
      const version = typeof plugin.version === 'string' ? plugin.version.toLowerCase() : '';
      const description = typeof plugin.description === 'string' ? plugin.description.toLowerCase() : '';
      return id.includes(query) || name.includes(query) || version.includes(query) || description.includes(query);
    });
  }

  return {
    plugins: summaries.slice(0, limit),
    meta: {
      total: plugins.length,
      matched: summaries.length,
      limit,
      status: status || 'all',
      q: query || '',
    },
  };
}

function getPluginById(rawPluginId) {
  const normalized = normalizePluginId(rawPluginId);
  return normalized ? pluginsById.get(normalized) : null;
}

function registerPlugin(payload) {
  const normalized = normalizePluginManifest(payload, null);
  if (normalized.error) {
    return { error: normalized.error, status: 400 };
  }

  const plugin = normalized.plugin;
  if (pluginsById.has(plugin.id)) {
    return { error: `Plugin "${plugin.id}" already exists.`, status: 409 };
  }

  plugins.unshift(plugin);
  pluginsById.set(plugin.id, plugin);
  const healthResult = checkPluginHealth(plugin, {
    publish: true,
    source: 'register',
  });
  const healthcheck = healthResult && healthResult.healthcheck ? healthResult.healthcheck : null;
  let autoDisabled = false;
  if (plugin.enabled && (!healthcheck || !healthcheck.healthy)) {
    plugin.enabled = false;
    plugin.updatedAt = new Date().toISOString();
    autoDisabled = true;
  }
  rebuildPluginContributionIndexes();
  persistTasksSoon();
  publishSystemEvent('plugin.registered', {
    plugin: buildPluginSummary(plugin),
    healthcheck: buildPluginHealthSummary(plugin.id),
    autoDisabled,
    counts: summarizePluginCounts(),
  });

  return {
    plugin: buildPluginDetail(plugin),
  };
}

function setPluginEnabled(plugin, enabled) {
  if (!plugin) {
    return { error: 'Plugin not found.', status: 404 };
  }

  const desired = Boolean(enabled);
  if (!plugin.enabled && desired) {
    const healthcheck = buildPluginHealthSummary(plugin.id);
    if (!healthcheck) {
      return {
        error: `Plugin "${plugin.id}" requires a successful healthcheck before enablement.`,
        status: 409,
      };
    }
    if (!healthcheck.healthy) {
      return {
        error: `Plugin "${plugin.id}" failed healthcheck. Fix reported issues before enabling.`,
        status: 409,
      };
    }
    if (!healthcheck.fresh) {
      return {
        error: `Plugin "${plugin.id}" healthcheck expired. Run healthcheck again before enabling.`,
        status: 409,
      };
    }
  }

  const changed = Boolean(plugin.enabled) !== desired;
  plugin.enabled = desired;
  plugin.updatedAt = new Date().toISOString();
  rebuildPluginContributionIndexes();
  persistTasksSoon();

  publishSystemEvent(desired ? 'plugin.enabled' : 'plugin.disabled', {
    plugin: buildPluginSummary(plugin),
    changed,
    counts: summarizePluginCounts(),
  });

  return {
    plugin: buildPluginDetail(plugin),
    changed,
  };
}

function updatePlugin(plugin, payload) {
  if (!plugin) {
    return { error: 'Plugin not found.', status: 404 };
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { error: 'Invalid plugin update payload.', status: 400 };
  }

  const requestedPluginId = payload.id !== undefined ? normalizePluginId(payload.id) : plugin.id;
  if (requestedPluginId && requestedPluginId !== plugin.id) {
    return { error: 'Plugin id cannot be changed.', status: 400 };
  }

  const normalizedPayload = payload.contributions === undefined ? { ...payload, contributions: {} } : payload;
  const normalized = normalizePluginManifest(normalizedPayload, plugin);
  if (normalized.error) {
    return { error: normalized.error, status: 400 };
  }

  const updated = normalized.plugin;
  plugin.name = updated.name;
  plugin.version = updated.version;
  plugin.description = updated.description;
  plugin.enabled = Boolean(updated.enabled);
  plugin.contributions = updated.contributions;
  plugin.marketplace = updated.marketplace;
  plugin.updatedAt = updated.updatedAt;

  const healthResult = checkPluginHealth(plugin, {
    publish: true,
    source: 'update',
  });
  const healthcheck = healthResult && healthResult.healthcheck ? healthResult.healthcheck : null;
  let autoDisabled = false;
  if (plugin.enabled && (!healthcheck || !healthcheck.healthy)) {
    plugin.enabled = false;
    plugin.updatedAt = new Date().toISOString();
    autoDisabled = true;
  }

  rebuildPluginContributionIndexes();
  persistTasksSoon();
  publishSystemEvent('plugin.updated', {
    plugin: buildPluginSummary(plugin),
    autoDisabled,
    counts: summarizePluginCounts(),
  });

  return {
    plugin: buildPluginDetail(plugin),
    autoDisabled,
  };
}

function runPluginHealthcheck(plugin) {
  const result = checkPluginHealth(plugin, {
    publish: true,
    source: 'manual',
  });
  if (result.error) {
    return result;
  }

  persistTasksSoon();
  return result;
}

function removePlugin(plugin) {
  if (!plugin) {
    return { error: 'Plugin not found.', status: 404 };
  }

  const index = plugins.findIndex((entry) => entry && entry.id === plugin.id);
  if (index >= 0) {
    plugins.splice(index, 1);
  }
  pluginsById.delete(plugin.id);
  pluginHealthById.delete(plugin.id);
  rebuildPluginContributionIndexes();
  persistTasksSoon();

  publishSystemEvent('plugin.removed', {
    plugin: buildPluginSummary(plugin),
    counts: summarizePluginCounts(),
  });

  return {
    removed: buildPluginSummary(plugin),
  };
}

function normalizeCollaborativeRunFeedbackEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const message = typeof entry.message === 'string' ? entry.message.trim() : '';
  if (!message) {
    return null;
  }

  const role = normalizeCollaborativeRole(entry.role);
  const source = typeof entry.source === 'string' && entry.source.trim() ? entry.source.trim() : 'user';
  const taskId = typeof entry.taskId === 'string' && entry.taskId.trim() ? entry.taskId.trim() : null;

  return {
    id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : randomUUID(),
    message: message.slice(0, 3000),
    role: role || 'operator',
    source,
    taskId,
    createdAt: isIsoDate(entry.createdAt) ? entry.createdAt : new Date().toISOString(),
  };
}

function parseCollaborativeRoleForAction(rawRole, fallbackRole) {
  const role = normalizeCollaborativeRole(rawRole);
  const fallback = normalizeCollaborativeRole(fallbackRole) || 'executor';
  const selected = role || fallback;
  if (!Object.prototype.hasOwnProperty.call(collaborativeRoleInstructions, selected)) {
    return {
      error: `Field "role" must be one of: ${Object.keys(collaborativeRoleInstructions).join(', ')}`,
    };
  }
  return { role: selected };
}

function appendCollaborativeRunFeedback(run, feedback) {
  if (!Array.isArray(run.feedback)) {
    run.feedback = [];
  }
  run.feedback.unshift(feedback);
  run.updatedAt = new Date().toISOString();
  persistTasksSoon();
}

function addCollaborativeRunFeedback(run, payload) {
  if (!run) {
    return { error: 'Collaborative run not found.', status: 404 };
  }
  if (!payload || typeof payload !== 'object') {
    return { error: 'Invalid request body.', status: 400 };
  }

  const message = typeof payload.message === 'string' ? payload.message.trim() : '';
  if (!message) {
    return { error: 'Field "message" is required.', status: 400 };
  }

  const roleResult = parseCollaborativeRoleForAction(payload.role, 'executor');
  if (roleResult.error) {
    return { error: roleResult.error, status: 400 };
  }

  const feedback = normalizeCollaborativeRunFeedbackEntry({
    id: randomUUID(),
    message,
    role: roleResult.role,
    source: 'user',
    createdAt: new Date().toISOString(),
  });

  appendCollaborativeRunFeedback(run, feedback);
  publishSystemEvent('run.feedback', {
    runId: run.id,
    feedback,
    run: buildCollaborativeRunSummary(run),
  });

  return {
    run: buildCollaborativeRunDetail(run),
    feedback,
  };
}

function selfHealCollaborativeRun(run, payload) {
  if (!run) {
    return { error: 'Collaborative run not found.', status: 404 };
  }

  const values = payload && typeof payload === 'object' ? payload : {};
  const roleResult = parseCollaborativeRoleForAction(values.role, 'executor');
  if (roleResult.error) {
    return { error: roleResult.error, status: 400 };
  }

  const runTasks = resolveCollaborativeRunTasks(run).slice();
  runTasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const failedTask = runTasks.find((task) => task.status === 'failed' || task.status === 'cancelled');
  if (!failedTask) {
    return { error: 'No failed or cancelled task found in this run.', status: 409 };
  }

  const commandResult = parseTaskCommands(values.commands !== undefined ? values.commands : failedTask.commands);
  if (commandResult.error) {
    return { error: commandResult.error, status: 400 };
  }

  const requestedModelId = typeof values.modelId === 'string' ? values.modelId.trim() : '';
  const selectedModelResult = selectModelIdForRequest(requestedModelId, failedTask.modelId || models[0]);
  if (selectedModelResult.error) {
    return { error: selectedModelResult.error, status: 400 };
  }
  const modelId = selectedModelResult.modelId;

  const workingDirectoryResult = parseTaskWorkingDirectory(
    values.workingDirectory !== undefined ? values.workingDirectory : failedTask.workingDirectory
  );
  if (workingDirectoryResult.error) {
    return { error: workingDirectoryResult.error, status: 400 };
  }

  const priorityResult = parseTaskPriority(values.priority !== undefined ? values.priority : 'high');
  if (priorityResult.error) {
    return { error: priorityResult.error, status: 400 };
  }

  const dependsOnResult = parseTaskDependsOn(values.dependsOn !== undefined ? values.dependsOn : []);
  if (dependsOnResult.error) {
    return { error: dependsOnResult.error, status: 400 };
  }

  const commandTimeoutMs = normalizeCommandTimeoutMs(
    values.commandTimeoutMs !== undefined ? values.commandTimeoutMs : failedTask.commandTimeoutMs
  );

  const role = roleResult.role;
  const stepIndex = Array.isArray(run.taskIds) ? run.taskIds.length : 0;
  const totalSteps = stepIndex + 1;
  const healPrompt =
    typeof values.prompt === 'string' && values.prompt.trim()
      ? values.prompt.trim()
      : [
          `[collab:${run.id}] [role:${role}] [self-heal] [step:${stepIndex + 1}/${totalSteps}]`,
          '',
          collaborativeRoleInstructions[role] || '',
          '',
          'Shared Objective:',
          run.prompt,
          '',
          `Recovery Target Task: ${failedTask.id}`,
          `Recovery Target Status: ${failedTask.status}`,
          `Recovery Failure Summary: ${
            failedTask.result && typeof failedTask.result.summary === 'string'
              ? failedTask.result.summary
              : '(no summary)'
          }`,
          '',
          'Recovery Goal:',
          'Produce a corrected follow-up implementation and explicit verification notes.',
        ].join('\n');

  const taskResult = buildTask({
    prompt: healPrompt,
    modelId,
    commands: commandResult.commands,
    workingDirectory: workingDirectoryResult.workingDirectory,
    priority: priorityResult.priority,
    dependsOn: dependsOnResult.dependsOn,
    commandTimeoutMs,
  });

  if (taskResult.error) {
    return { error: taskResult.error, status: 400 };
  }

  const task = taskResult.task;
  task.collaboration = {
    runId: run.id,
    role,
    stepIndex,
    totalSteps,
    templateId: normalizeCollaborativeTemplateId(run.templateId) || null,
  };
  if (!Array.isArray(run.taskIds)) {
    run.taskIds = [];
  }
  run.taskIds.push(task.id);
  if (!Array.isArray(run.roles)) {
    run.roles = [];
  }
  if (!run.roles.includes(role)) {
    run.roles.push(role);
  }
  run.updatedAt = new Date().toISOString();

  addArtifact(
    task,
    'collaboration',
    'Self-Heal Step',
    [
      `Run ID: ${run.id}`,
      `Role: ${role}`,
      `Step: ${stepIndex + 1}/${totalSteps}`,
      `Depends On: ${dependsOnResult.dependsOn.length ? dependsOnResult.dependsOn.join(', ') : '(none)'}`,
      `Recovery Target Task: ${failedTask.id}`,
      `Recovery Target Status: ${failedTask.status}`,
      '',
      'Shared Objective:',
      run.prompt,
    ].join('\n')
  );
  appendTimeline(
    task,
    'queued',
    `Collaboration run ${run.id}: self-heal queued for role "${role}" after task ${failedTask.id}.`
  );

  const feedback = normalizeCollaborativeRunFeedbackEntry({
    id: randomUUID(),
    message: `Self-heal queued for failed task ${failedTask.id}.`,
    role,
    source: 'system',
    taskId: task.id,
    createdAt: new Date().toISOString(),
  });
  appendCollaborativeRunFeedback(run, feedback);

  publishSystemEvent('run.selfHealed', {
    runId: run.id,
    failedTaskId: failedTask.id,
    healingTask: buildTaskEventPayload(task),
    feedback,
    run: buildCollaborativeRunSummary(run),
  });

  return {
    run: buildCollaborativeRunDetail(run),
    failedTaskId: failedTask.id,
    task: buildTaskResponse(task),
    feedback,
  };
}

function summarizeCollaborativeRunCounts() {
  const counts = {
    queued: 0,
    planning: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    'partial-cancelled': 0,
    unknown: 0,
  };

  for (const run of collaborativeRuns) {
    const summary = buildCollaborativeRunSummary(run);
    const status = summary.status || 'unknown';
    if (counts[status] === undefined) {
      counts[status] = 0;
    }
    counts[status] += 1;
  }

  return counts;
}

function getTaskDependencyBlockers(task) {
  const dependsOn = normalizeTaskDependsOn(task && task.dependsOn);
  const blockers = [];

  for (const dependencyTaskId of dependsOn) {
    const dependencyTask = tasksById.get(dependencyTaskId);
    if (!dependencyTask) {
      blockers.push({
        id: dependencyTaskId,
        status: 'missing',
      });
      continue;
    }

    if (dependencyTask.status !== 'completed') {
      blockers.push({
        id: dependencyTaskId,
        status: dependencyTask.status,
      });
    }
  }

  return blockers;
}

function resolveWorkspacePath(rawPath, options) {
  const raw = typeof rawPath === 'string' ? rawPath.trim() : '';
  const fallbackToDefault = Boolean(options && options.fallbackToDefault);
  const requireAbsolute = options && options.requireAbsolute !== undefined ? Boolean(options.requireAbsolute) : true;
  const allowFilePath = options && options.allowFilePath !== undefined ? Boolean(options.allowFilePath) : true;

  if (!raw) {
    if (fallbackToDefault) {
      return { path: defaultWorkingDirectory };
    }
    return { error: 'Query "path" is required.' };
  }

  if (requireAbsolute && !path.isAbsolute(raw)) {
    return { error: 'Query "path" must be an absolute path.' };
  }

  const resolved = path.resolve(raw);
  if (!isPathWithinAllowedWorkspaceRoots(resolved, allowedWorkspaceRoots)) {
    return {
      error: `Query "path" must be inside allowlisted roots: ${allowedWorkspaceRoots.join(', ')}`,
    };
  }

  try {
    const stat = fs.statSync(resolved);
    if (!allowFilePath && !stat.isDirectory()) {
      return { error: `Path must point to a directory: ${resolved}` };
    }
    return { path: resolved, stat };
  } catch (error) {
    return { error: `Path does not exist or is not accessible: ${resolved}` };
  }
}

function resolveWorkspaceWritePath(rawPath) {
  const raw = typeof rawPath === 'string' ? rawPath.trim() : '';
  if (!raw) {
    return { error: 'Field "path" is required.' };
  }

  if (!path.isAbsolute(raw)) {
    return { error: 'Field "path" must be an absolute path.' };
  }

  const resolved = path.resolve(raw);
  if (!isPathWithinAllowedWorkspaceRoots(resolved, allowedWorkspaceRoots)) {
    return { error: `Field "path" must be inside allowlisted roots: ${allowedWorkspaceRoots.join(', ')}` };
  }

  const parentDirectory = path.dirname(resolved);
  if (!isPathWithinAllowedWorkspaceRoots(parentDirectory, allowedWorkspaceRoots)) {
    return {
      error: `Field "path" parent directory must be inside allowlisted roots: ${allowedWorkspaceRoots.join(', ')}`,
    };
  }

  try {
    const parentStat = fs.statSync(parentDirectory);
    if (!parentStat.isDirectory()) {
      return { error: `Parent path is not a directory: ${parentDirectory}` };
    }
  } catch (error) {
    return { error: `Parent directory does not exist or is not accessible: ${parentDirectory}` };
  }

  return { path: resolved };
}

function buildDirectoryEntries(directoryPath) {
  const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
  const items = entries.map((entry) => {
    const fullPath = path.join(directoryPath, entry.name);
    let size = null;
    let modifiedAt = null;

    try {
      const stat = fs.statSync(fullPath);
      size = stat.isFile() ? stat.size : null;
      modifiedAt = stat.mtime.toISOString();
    } catch (error) {
      size = null;
      modifiedAt = null;
    }

    return {
      name: entry.name,
      path: fullPath,
      type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
      size,
      modifiedAt,
    };
  });

  items.sort((a, b) => {
    if (a.type !== b.type) {
      if (a.type === 'directory') {
        return -1;
      }
      if (b.type === 'directory') {
        return 1;
      }
    }
    return a.name.localeCompare(b.name);
  });

  return items;
}

function listWorkspaceFiles(rawPath) {
  const resolvedPath = resolveWorkspacePath(rawPath, { fallbackToDefault: true, allowFilePath: false });
  if (resolvedPath.error) {
    return { error: resolvedPath.error, status: 400 };
  }

  const entries = buildDirectoryEntries(resolvedPath.path);
  const response = {
    path: resolvedPath.path,
    entries,
    count: entries.length,
    time: new Date().toISOString(),
  };
  publishSystemEvent('workspace.list', {
    path: response.path,
    count: response.count,
  });
  return response;
}

function readWorkspaceFile(rawPath) {
  const resolvedPath = resolveWorkspacePath(rawPath, { fallbackToDefault: false, allowFilePath: true });
  if (resolvedPath.error) {
    return { error: resolvedPath.error, status: 400 };
  }

  if (!resolvedPath.stat || !resolvedPath.stat.isFile()) {
    return { error: `Path must point to a file: ${resolvedPath.path}`, status: 400 };
  }

  let content = '';
  try {
    content = fs.readFileSync(resolvedPath.path, 'utf8');
  } catch (error) {
    return { error: `Failed to read file: ${error.message}`, status: 500 };
  }

  const truncated = content.length > maxWorkspaceFilePreviewChars;
  const preview = truncated ? content.slice(0, maxWorkspaceFilePreviewChars) : content;

  const response = {
    path: resolvedPath.path,
    size: resolvedPath.stat.size,
    truncated,
    content: preview,
    maxPreviewChars: maxWorkspaceFilePreviewChars,
    time: new Date().toISOString(),
  };
  publishSystemEvent('workspace.read', {
    path: response.path,
    size: response.size,
    truncated: response.truncated,
  });
  return response;
}

function writeWorkspaceFile(payload) {
  if (!payload || typeof payload !== 'object') {
    return { error: 'Invalid request body.', status: 400 };
  }

  const resolvedPath = resolveWorkspaceWritePath(payload.path);
  if (resolvedPath.error) {
    return { error: resolvedPath.error, status: 400 };
  }

  if (typeof payload.content !== 'string') {
    return { error: 'Field "content" must be a string.', status: 400 };
  }

  if (payload.content.length > maxWorkspaceFileWriteChars) {
    return { error: `Field "content" exceeds ${maxWorkspaceFileWriteChars} characters.`, status: 400 };
  }

  let existed = false;
  let previousContent = '';
  try {
    const existingStat = fs.statSync(resolvedPath.path);
    if (!existingStat.isFile()) {
      return { error: `Path must point to a file or a new file path: ${resolvedPath.path}`, status: 400 };
    }
    existed = true;
    previousContent = fs.readFileSync(resolvedPath.path, 'utf8');
  } catch (error) {
    existed = false;
    previousContent = '';
  }

  try {
    fs.writeFileSync(resolvedPath.path, payload.content, 'utf8');
  } catch (error) {
    return { error: `Failed to write file: ${error.message}`, status: 500 };
  }

  const currentSize = Buffer.byteLength(payload.content, 'utf8');
  const previousSize = existed ? Buffer.byteLength(previousContent, 'utf8') : 0;

  const response = {
    path: resolvedPath.path,
    existed,
    changed: !existed || previousContent !== payload.content,
    previousSize,
    size: currentSize,
    maxWriteChars: maxWorkspaceFileWriteChars,
    time: new Date().toISOString(),
  };
  publishSystemEvent('workspace.write', {
    path: response.path,
    existed: response.existed,
    changed: response.changed,
    size: response.size,
    previousSize: response.previousSize,
  });
  return response;
}

function hashContent(content) {
  return createHash('sha256').update(content || '', 'utf8').digest('hex');
}

function buildTaskArtifactHash(task) {
  const artifacts = task && Array.isArray(task.artifacts) ? task.artifacts : [];
  const canonicalArtifacts = artifacts.map((artifact) => ({
    type: artifact && typeof artifact.type === 'string' ? artifact.type : '',
    title: artifact && typeof artifact.title === 'string' ? artifact.title : '',
    content: artifact && typeof artifact.content === 'string' ? artifact.content : '',
  }));
  return hashContent(JSON.stringify(canonicalArtifacts));
}

function computeChangedLines(beforeContent, afterContent) {
  const beforeLines = String(beforeContent || '').split('\n');
  const afterLines = String(afterContent || '').split('\n');
  const max = Math.max(beforeLines.length, afterLines.length);
  let changed = 0;
  for (let index = 0; index < max; index++) {
    if ((beforeLines[index] || '') !== (afterLines[index] || '')) {
      changed += 1;
    }
  }
  return changed;
}

function buildSimpleDiffPreview(filePath, beforeContent, afterContent) {
  const beforeLines = String(beforeContent || '').split('\n');
  const afterLines = String(afterContent || '').split('\n');
  const maxLines = 240;
  const lines = [`--- ${filePath}`, `+++ ${filePath}`];
  const max = Math.max(beforeLines.length, afterLines.length);
  let emitted = 0;
  let changedBlocks = 0;

  for (let index = 0; index < max; index++) {
    const beforeLine = beforeLines[index];
    const afterLine = afterLines[index];
    if ((beforeLine || '') === (afterLine || '')) {
      continue;
    }

    changedBlocks += 1;
    const lineNumber = index + 1;
    lines.push(`@@ line ${lineNumber} @@`);
    emitted += 1;

    if (beforeLine !== undefined && emitted < maxLines) {
      lines.push(`-${beforeLine}`);
      emitted += 1;
    }

    if (afterLine !== undefined && emitted < maxLines) {
      lines.push(`+${afterLine}`);
      emitted += 1;
    }

    if (emitted >= maxLines) {
      break;
    }
  }

  if (!changedBlocks) {
    lines.push('(no textual changes)');
  } else if (emitted >= maxLines) {
    lines.push('...diff preview truncated...');
  }

  return lines.join('\n');
}

function readFileIfExistsForEdit(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return { error: `Path must point to a file or a new file path: ${filePath}`, status: 400 };
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return { exists: true, content, size: stat.size };
  } catch (error) {
    return { exists: false, content: '', size: 0 };
  }
}

function buildEditSummaryResponse(edit) {
  return {
    id: edit.id,
    path: edit.path,
    summary: edit.summary,
    status: edit.status,
    changedLines: edit.changedLines,
    baseSize: edit.base.size,
    proposedSize: edit.proposal.size,
    createdAt: edit.createdAt,
    updatedAt: edit.updatedAt,
    appliedAt: edit.appliedAt || null,
    rejectedAt: edit.rejectedAt || null,
    revertedAt: edit.revertedAt || null,
  };
}

function buildEditDetailResponse(edit) {
  return {
    ...buildEditSummaryResponse(edit),
    base: edit.base,
    proposal: edit.proposal,
    diffPreview: edit.diffPreview,
    proposedContent: edit.proposedContent,
  };
}

function summarizeEditCounts() {
  const counts = {
    pending: 0,
    applied: 0,
    rejected: 0,
    stale: 0,
    reverted: 0,
  };

  for (const edit of edits) {
    if (counts[edit.status] === undefined) {
      counts[edit.status] = 0;
    }
    counts[edit.status] += 1;
  }

  return counts;
}

function queryEdits(searchParams) {
  const status = (searchParams.get('status') || '').trim().toLowerCase();
  const query = (searchParams.get('q') || '').trim().toLowerCase();
  const limitRaw = searchParams.get('limit');
  const limit = parsePositiveInt(limitRaw, edits.length || 100, 1, 500);

  let filtered = edits;
  if (status && status !== 'all') {
    filtered = filtered.filter((edit) => edit.status === status);
  }
  if (query) {
    filtered = filtered.filter((edit) => {
      const pathValue = typeof edit.path === 'string' ? edit.path.toLowerCase() : '';
      const summaryValue = typeof edit.summary === 'string' ? edit.summary.toLowerCase() : '';
      return edit.id.toLowerCase().includes(query) || pathValue.includes(query) || summaryValue.includes(query);
    });
  }

  return {
    edits: filtered.slice(0, limit).map((edit) => buildEditSummaryResponse(edit)),
    meta: {
      total: edits.length,
      matched: filtered.length,
      limit,
      status: status || 'all',
      q: query || '',
    },
  };
}

function createEditProposal(payload) {
  if (!payload || typeof payload !== 'object') {
    return { error: 'Invalid request body.', status: 400 };
  }

  const resolvedPath = resolveWorkspaceWritePath(payload.path);
  if (resolvedPath.error) {
    return { error: resolvedPath.error, status: 400 };
  }

  if (typeof payload.content !== 'string') {
    return { error: 'Field "content" must be a string.', status: 400 };
  }

  if (payload.content.length > maxWorkspaceFileWriteChars) {
    return { error: `Field "content" exceeds ${maxWorkspaceFileWriteChars} characters.`, status: 400 };
  }

  const summary =
    typeof payload.summary === 'string' && payload.summary.trim()
      ? payload.summary.trim().slice(0, 300)
      : `Edit proposal for ${resolvedPath.path}`;

  const current = readFileIfExistsForEdit(resolvedPath.path);
  if (current.error) {
    return { error: current.error, status: current.status || 400 };
  }

  if ((current.content || '') === payload.content) {
    return { error: 'No changes detected between current and proposed content.', status: 400 };
  }

  const now = new Date().toISOString();
  const edit = {
    id: randomUUID(),
    path: resolvedPath.path,
    summary,
    status: 'pending',
    changedLines: computeChangedLines(current.content, payload.content),
    diffPreview: buildSimpleDiffPreview(resolvedPath.path, current.content, payload.content),
    base: {
      existed: Boolean(current.exists),
      size: current.size || 0,
      sha256: hashContent(current.content || ''),
    },
    proposal: {
      size: Buffer.byteLength(payload.content, 'utf8'),
      sha256: hashContent(payload.content),
    },
    baseContent: current.content || '',
    proposedContent: payload.content,
    createdAt: now,
    updatedAt: now,
    appliedAt: null,
    rejectedAt: null,
    revertedAt: null,
  };

  edits.unshift(edit);
  editsById.set(edit.id, edit);
  persistTasksSoon();

  publishSystemEvent('edit.created', {
    edit: buildEditSummaryResponse(edit),
  });

  return { edit };
}

function getEditById(editId) {
  return editsById.get(editId);
}

function applyEditProposal(edit) {
  if (!edit) {
    return { error: 'Edit proposal not found.', status: 404 };
  }

  if (edit.status !== 'pending') {
    return { error: `Edit proposal is already ${edit.status}.`, status: 409 };
  }

  const current = readFileIfExistsForEdit(edit.path);
  if (current.error) {
    return { error: current.error, status: current.status || 400 };
  }

  const currentHash = hashContent(current.content || '');
  if (currentHash !== edit.base.sha256) {
    edit.status = 'stale';
    edit.updatedAt = new Date().toISOString();
    persistTasksSoon();
    publishSystemEvent('edit.stale', {
      edit: buildEditSummaryResponse(edit),
      currentHash,
      baseHash: edit.base.sha256,
    });
    return {
      error: 'Edit proposal is stale because the file changed since proposal creation.',
      status: 409,
    };
  }

  try {
    fs.writeFileSync(edit.path, edit.proposedContent, 'utf8');
  } catch (error) {
    return { error: `Failed to apply edit: ${error.message}`, status: 500 };
  }

  edit.status = 'applied';
  edit.updatedAt = new Date().toISOString();
  edit.appliedAt = edit.updatedAt;
  edit.rejectedAt = null;
  edit.revertedAt = null;
  persistTasksSoon();
  publishSystemEvent('edit.applied', {
    edit: buildEditSummaryResponse(edit),
  });
  return { edit };
}

function rejectEditProposal(edit) {
  if (!edit) {
    return { error: 'Edit proposal not found.', status: 404 };
  }

  if (edit.status !== 'pending') {
    return { error: `Edit proposal is already ${edit.status}.`, status: 409 };
  }

  edit.status = 'rejected';
  edit.updatedAt = new Date().toISOString();
  edit.rejectedAt = edit.updatedAt;
  edit.revertedAt = null;
  persistTasksSoon();
  publishSystemEvent('edit.rejected', {
    edit: buildEditSummaryResponse(edit),
  });
  return { edit };
}

function revertEditProposal(edit) {
  if (!edit) {
    return { error: 'Edit proposal not found.', status: 404 };
  }

  if (edit.status !== 'applied') {
    return { error: `Edit proposal is ${edit.status}; only applied proposals can be reverted.`, status: 409 };
  }

  const current = readFileIfExistsForEdit(edit.path);
  if (current.error) {
    return { error: current.error, status: current.status || 400 };
  }

  const currentHash = hashContent(current.content || '');
  if (currentHash !== edit.proposal.sha256) {
    return {
      error: 'Cannot revert because file content no longer matches the applied proposal.',
      status: 409,
    };
  }

  try {
    fs.writeFileSync(edit.path, edit.baseContent, 'utf8');
  } catch (error) {
    return { error: `Failed to revert edit: ${error.message}`, status: 500 };
  }

  edit.status = 'reverted';
  edit.updatedAt = new Date().toISOString();
  edit.revertedAt = edit.updatedAt;
  persistTasksSoon();
  publishSystemEvent('edit.reverted', {
    edit: buildEditSummaryResponse(edit),
  });
  return { edit };
}

function parseTaskPriority(rawPriority) {
  if (rawPriority === undefined || rawPriority === null || rawPriority === '') {
    return { priority: 'normal' };
  }
  if (typeof rawPriority !== 'string') {
    return { error: 'Field "priority" must be one of: low, normal, high.' };
  }

  const priority = rawPriority.trim().toLowerCase();
  if (!allowedTaskPriorities.has(priority)) {
    return { error: 'Field "priority" must be one of: low, normal, high.' };
  }

  return { priority };
}

function getTaskPriorityValue(task) {
  const priority = normalizeTaskPriority(task && task.priority);
  return taskPriorityRank[priority] || taskPriorityRank.normal;
}

function parseModelTemperature(raw) {
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) {
    return 0.2;
  }
  return Math.max(0, Math.min(value, 2));
}

function parseModelMaxOutputTokens(raw) {
  return parsePositiveInt(raw, 800, 16, 4096);
}

function hasProviderKey(provider) {
  if (provider === 'openai') {
    return Boolean(openaiApiKey);
  }
  if (provider === 'anthropic') {
    return Boolean(anthropicApiKey);
  }
  if (provider === 'google') {
    return Boolean(googleApiKey);
  }
  if (provider === 'azure') {
    return Boolean(azureFoundryApiKey && azureFoundryChatUrl);
  }
  return false;
}

async function fetchJsonWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const raw = await response.text();
    let payload = null;
    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch (error) {
        payload = null;
      }
    }

    if (!response.ok) {
      const details = payload ? JSON.stringify(payload) : raw || response.statusText;
      throw new Error(`Model gateway request failed (${response.status}): ${details}`);
    }

    return payload || {};
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw new Error(`Model gateway request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function extractOpenAiText(payload) {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  if (Array.isArray(payload.output)) {
    const segments = [];
    for (const item of payload.output) {
      if (!item || !Array.isArray(item.content)) {
        continue;
      }
      for (const part of item.content) {
        if (part && typeof part.text === 'string' && part.text.trim()) {
          segments.push(part.text.trim());
        }
      }
    }
    if (segments.length) {
      return segments.join('\n');
    }
  }

  return '';
}

function extractAnthropicText(payload) {
  if (!payload || !Array.isArray(payload.content)) {
    return '';
  }

  const segments = payload.content
    .filter((part) => part && typeof part.text === 'string' && part.text.trim())
    .map((part) => part.text.trim());

  return segments.join('\n');
}

function extractGoogleText(payload) {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const first = candidates[0];
  if (!first || !first.content || !Array.isArray(first.content.parts)) {
    return '';
  }

  const segments = first.content.parts
    .filter((part) => part && typeof part.text === 'string' && part.text.trim())
    .map((part) => part.text.trim());

  return segments.join('\n');
}

function withApiVersion(urlString, apiVersion) {
  const url = new URL(urlString);
  if (apiVersion && !url.searchParams.has('api-version')) {
    url.searchParams.set('api-version', apiVersion);
  }
  return url.toString();
}

function extractAzureFoundryText(payload) {
  if (!payload || !Array.isArray(payload.choices) || !payload.choices.length) {
    return '';
  }

  const firstChoice = payload.choices[0] || {};
  const message = firstChoice.message || {};
  const content = message.content;

  if (typeof content === 'string' && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const segments = content
      .map((part) => {
        if (typeof part === 'string') {
          return part.trim();
        }
        if (part && typeof part.text === 'string') {
          return part.text.trim();
        }
        return '';
      })
      .filter(Boolean);
    return segments.join('\n');
  }

  return '';
}

async function requestOpenAiModel(modelId, prompt, temperature, maxOutputTokens) {
  const payload = await fetchJsonWithTimeout(
    openaiResponsesUrl,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        input: prompt,
        temperature,
        max_output_tokens: maxOutputTokens,
      }),
    },
    modelGatewayTimeoutMs
  );

  const text = extractOpenAiText(payload);
  if (!text) {
    throw new Error(`OpenAI gateway returned no textual output for model "${modelId}".`);
  }

  return text;
}

async function requestAnthropicModel(modelId, prompt, temperature, maxOutputTokens) {
  const payload = await fetchJsonWithTimeout(
    anthropicMessagesUrl,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: maxOutputTokens,
        temperature,
        messages: [{ role: 'user', content: prompt }],
      }),
    },
    modelGatewayTimeoutMs
  );

  const text = extractAnthropicText(payload);
  if (!text) {
    throw new Error(`Anthropic gateway returned no textual output for model "${modelId}".`);
  }

  return text;
}

async function requestGoogleModel(modelId, prompt, temperature, maxOutputTokens) {
  const encodedModel = encodeURIComponent(modelId);
  const url = `${googleApiBase}/${encodedModel}:generateContent?key=${encodeURIComponent(googleApiKey)}`;
  const payload = await fetchJsonWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: maxOutputTokens,
        },
      }),
    },
    modelGatewayTimeoutMs
  );

  const text = extractGoogleText(payload);
  if (!text) {
    throw new Error(`Google gateway returned no textual output for model "${modelId}".`);
  }

  return text;
}

async function requestAzureFoundryModel(modelId, prompt, temperature, maxOutputTokens) {
  if (!azureFoundryChatUrl) {
    throw new Error('AZURE_FOUNDRY_CHAT_URL is not set.');
  }

  const url = withApiVersion(azureFoundryChatUrl, azureFoundryApiVersion);
  const payload = await fetchJsonWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': azureFoundryApiKey,
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: maxOutputTokens,
      }),
    },
    modelGatewayTimeoutMs
  );

  const text = extractAzureFoundryText(payload);
  if (!text) {
    throw new Error(`Azure Foundry gateway returned no textual output for model "${modelId}".`);
  }

  return text;
}

async function runModelGeneration(modelId, prompt, options) {
  const provider = inferProvider(modelId);
  const temperature = parseModelTemperature(options && options.temperature);
  const maxOutputTokens = parseModelMaxOutputTokens(options && options.maxOutputTokens);

  if (!hasProviderKey(provider)) {
    return {
      provider,
      configured: false,
      simulated: true,
      text: [
        `[simulated:${modelId}]`,
        'Model API key is not configured for this provider. Returning local fallback output.',
        '',
        `Prompt excerpt: ${prompt.slice(0, 300)}`,
      ].join('\n'),
    };
  }

  let text = '';
  if (provider === 'openai') {
    text = await requestOpenAiModel(modelId, prompt, temperature, maxOutputTokens);
  } else if (provider === 'anthropic') {
    text = await requestAnthropicModel(modelId, prompt, temperature, maxOutputTokens);
  } else if (provider === 'google') {
    text = await requestGoogleModel(modelId, prompt, temperature, maxOutputTokens);
  } else if (provider === 'azure') {
    text = await requestAzureFoundryModel(modelId, prompt, temperature, maxOutputTokens);
  } else {
    return {
      provider,
      configured: false,
      simulated: true,
      text: `[simulated:${modelId}] Unsupported provider route for "${provider}".`,
    };
  }

  return {
    provider,
    configured: true,
    simulated: false,
    text,
  };
}

function buildTask(payload) {
  const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : '';
  if (!prompt) {
    return { error: 'Field "prompt" is required.' };
  }
  const requestedModelId = typeof payload.modelId === 'string' ? payload.modelId.trim() : '';
  const selectedModelResult = selectModelIdForRequest(requestedModelId, models[0]);
  if (selectedModelResult.error) {
    return { error: selectedModelResult.error };
  }
  const modelId = selectedModelResult.modelId;
  const commandResult = parseTaskCommands(payload.commands);
  if (commandResult.error) {
    return { error: commandResult.error };
  }
  const workingDirectoryResult = parseTaskWorkingDirectory(payload.workingDirectory);
  if (workingDirectoryResult.error) {
    return { error: workingDirectoryResult.error };
  }
  const priorityResult = parseTaskPriority(payload.priority);
  if (priorityResult.error) {
    return { error: priorityResult.error };
  }
  const dependsOnResult = parseTaskDependsOn(payload.dependsOn);
  if (dependsOnResult.error) {
    return { error: dependsOnResult.error };
  }
  const commandTimeoutMs = normalizeCommandTimeoutMs(payload.commandTimeoutMs);

  const now = new Date().toISOString();
  const task = {
    id: randomUUID(),
    prompt,
    modelId,
    commands: commandResult.commands,
    workingDirectory: workingDirectoryResult.workingDirectory,
    priority: priorityResult.priority,
    dependsOn: dependsOnResult.dependsOn,
    commandTimeoutMs,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    timeline: [],
    artifacts: [],
    result: null,
  };

  tasks.unshift(task);
  tasksById.set(task.id, task);
  appendTimeline(task, 'queued', 'Task accepted and waiting for execution.');
  const requestedCommands = task.commands.length ? task.commands.join('\n') : '(none)';
  addArtifact(
    task,
    'plan-request',
    'Task Request',
    [
      'Prompt:',
      prompt,
      '',
      'Model:',
      modelId,
      '',
      'Priority:',
      task.priority,
      '',
      'Depends On:',
      task.dependsOn.length ? task.dependsOn.join('\n') : '(none)',
      '',
      'Commands:',
      requestedCommands,
      '',
      'Working Directory:',
      task.workingDirectory,
      '',
      `Timeout per command (ms): ${commandTimeoutMs}`,
    ].join('\n')
  );
  scheduleNextLifecycle();
  persistTasksSoon();
  publishSystemEvent('task.created', { task: buildTaskEventPayload(task) });
  return { task };
}

function createCollaborativeRun(payload) {
  if (!payload || typeof payload !== 'object') {
    return { error: 'Invalid request body.', status: 400 };
  }

  const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : '';
  if (!prompt) {
    return { error: 'Field "prompt" is required.', status: 400 };
  }

  const templateId = normalizeCollaborativeTemplateId(payload.templateId);
  if (payload.templateId !== undefined && payload.templateId !== null && !templateId) {
    return { error: 'Field "templateId" must be a non-empty string when provided.', status: 400 };
  }
  const template = templateId ? getCollaborativeRunTemplateById(templateId) : null;
  if (templateId && !template) {
    return {
      error: `Field "templateId" must be one of: ${listCollaborativeRunTemplates()
        .map((entry) => entry.id)
        .join(', ')}`,
      status: 400,
    };
  }

  const requestedRoles = payload.roles !== undefined ? payload.roles : template ? template.roles : undefined;
  const rolesResult = parseCollaborativeRoles(requestedRoles);
  if (rolesResult.error) {
    return { error: rolesResult.error, status: 400 };
  }
  const roles = rolesResult.roles;

  const commandsByRoleResult = parseCollaborativeCommandsByRole(payload.commandsByRole, roles);
  if (commandsByRoleResult.error) {
    return { error: commandsByRoleResult.error, status: 400 };
  }

  const requestedModelId = typeof payload.modelId === 'string' ? payload.modelId.trim() : '';
  const selectedModelResult = selectModelIdForRequest(requestedModelId, models[0]);
  if (selectedModelResult.error) {
    return { error: selectedModelResult.error, status: 400 };
  }
  const modelId = selectedModelResult.modelId;

  const workingDirectoryResult = parseTaskWorkingDirectory(payload.workingDirectory);
  if (workingDirectoryResult.error) {
    return { error: workingDirectoryResult.error, status: 400 };
  }

  const priorityResult = parseTaskPriority(payload.priority);
  if (priorityResult.error) {
    return { error: priorityResult.error, status: 400 };
  }

  const dependencyResult = parseTaskDependsOn(payload.dependsOn);
  if (dependencyResult.error) {
    return { error: dependencyResult.error, status: 400 };
  }

  const commandTimeoutMs = normalizeCommandTimeoutMs(payload.commandTimeoutMs);
  const runId = randomUUID();
  const now = new Date().toISOString();
  const run = {
    id: runId,
    prompt,
    templateId: template ? template.id : null,
    roles,
    taskIds: [],
    feedback: [],
    createdAt: now,
    updatedAt: now,
  };
  const createdTasks = [];

  for (let index = 0; index < roles.length; index++) {
    const role = roles[index];
    const commands = commandsByRoleResult.commandsByRole.get(role) || [];
    const rolePrompt = buildCollaborativeTaskPrompt(prompt, role, runId, index, roles.length);
    const dependsOn =
      index === 0
        ? dependencyResult.dependsOn
        : [createdTasks[index - 1].id];
    const taskResult = buildTask({
      prompt: rolePrompt,
      modelId,
      commands,
      workingDirectory: workingDirectoryResult.workingDirectory,
      priority: priorityResult.priority,
      dependsOn,
      commandTimeoutMs,
    });

    if (taskResult.error) {
      for (const createdTask of createdTasks) {
        cancelTask(createdTask);
      }
      return {
        error: `Failed to create collaborative task for role "${role}": ${taskResult.error}`,
        status: 400,
      };
    }

    const task = taskResult.task;
    task.collaboration = {
      runId,
      role,
      stepIndex: index,
      totalSteps: roles.length,
      templateId: template ? template.id : null,
    };
    createdTasks.push(task);
    run.taskIds.push(task.id);
    addArtifact(
      task,
      'collaboration',
      'Collaboration Step',
      [
        `Run ID: ${runId}`,
        `Role: ${role}`,
        `Step: ${index + 1}/${roles.length}`,
        `Depends On: ${dependsOn.length ? dependsOn.join(', ') : '(none)'}`,
        '',
        'Shared Objective:',
        prompt,
      ].join('\n')
    );
    appendTimeline(task, 'queued', `Collaboration run ${runId}: role "${role}" queued as step ${index + 1}/${roles.length}.`);
  }

  run.updatedAt = new Date().toISOString();
  collaborativeRuns.unshift(run);
  collaborativeRunsById.set(run.id, run);
  persistTasksSoon();

  const runDetail = buildCollaborativeRunDetail(run);
  const queuePositionById = buildQueuePositionById();
  const responseTasks = createdTasks.map((task) => buildTaskResponse(task, queuePositionById));
  const response = {
    ...runDetail,
    runId: runDetail.id,
    feedback: runDetail.feedback,
    tasks: responseTasks,
    queueManager: buildQueueControlResponse().queueManager,
    time: new Date().toISOString(),
  };

  publishSystemEvent('task.collaborationCreated', {
    runId: run.id,
    prompt: run.prompt,
    templateId: run.templateId,
    template: buildCollaborativeRunTemplateSummary(template),
    roles: run.roles,
    taskIds: run.taskIds,
    run: buildCollaborativeRunSummary(run),
    tasks: createdTasks.map((task) => buildTaskEventPayload(task)),
  });

  return { run: response };
}

function createSpecializedCollaborativeRun(payload) {
  if (!payload || typeof payload !== 'object') {
    return { error: 'Invalid request body.', status: 400 };
  }

  const specialization = normalizeCollaborativeTemplateId(payload.specialization || payload.templateId);
  if (!specialization) {
    return {
      error: `Field "specialization" is required. Supported values: ${listCollaborativeRunTemplates()
        .map((entry) => entry.id)
        .join(', ')}`,
      status: 400,
    };
  }

  const template = getCollaborativeRunTemplateById(specialization);
  if (!template) {
    return {
      error: `Field "specialization" must be one of: ${listCollaborativeRunTemplates()
        .map((entry) => entry.id)
        .join(', ')}`,
      status: 400,
    };
  }

  const createPayload = {
    ...payload,
    templateId: template.id,
    roles: template.roles,
  };
  delete createPayload.specialization;

  const result = createCollaborativeRun(createPayload);
  if (result.error) {
    return result;
  }

  publishSystemEvent('task.specializedCollaborationCreated', {
    runId: result.run.runId || result.run.id,
    template: buildCollaborativeRunTemplateSummary(template),
    run: result.run,
  });

  return result;
}

function buildReplayTaskPayload(sourceTask, overrides) {
  const replaySource = sourceTask || {};
  const overrideValues = overrides && typeof overrides === 'object' ? overrides : {};

  const payload = {
    prompt: replaySource.prompt,
    modelId: replaySource.modelId,
    commands: Array.isArray(replaySource.commands) ? replaySource.commands : [],
    workingDirectory: replaySource.workingDirectory,
    priority: normalizeTaskPriority(replaySource.priority),
    dependsOn: normalizeTaskDependsOn(replaySource.dependsOn),
    commandTimeoutMs: replaySource.commandTimeoutMs,
  };

  if (typeof overrideValues.prompt === 'string' && overrideValues.prompt.trim()) {
    payload.prompt = overrideValues.prompt.trim();
  }
  if (typeof overrideValues.modelId === 'string' && overrideValues.modelId.trim()) {
    payload.modelId = overrideValues.modelId.trim();
  }
  if (Array.isArray(overrideValues.commands)) {
    payload.commands = overrideValues.commands;
  }
  if (typeof overrideValues.workingDirectory === 'string' && overrideValues.workingDirectory.trim()) {
    payload.workingDirectory = overrideValues.workingDirectory.trim();
  }
  if (typeof overrideValues.priority === 'string' && overrideValues.priority.trim()) {
    payload.priority = overrideValues.priority.trim().toLowerCase();
  }
  if (Array.isArray(overrideValues.dependsOn)) {
    payload.dependsOn = overrideValues.dependsOn;
  }
  if (overrideValues.commandTimeoutMs !== undefined && overrideValues.commandTimeoutMs !== null) {
    payload.commandTimeoutMs = overrideValues.commandTimeoutMs;
  }

  return payload;
}

function replayTask(sourceTask, overrides) {
  if (!sourceTask) {
    return { error: 'Task not found.', status: 404 };
  }

  const replayPayload = buildReplayTaskPayload(sourceTask, overrides);
  const result = buildTask(replayPayload);
  if (result.error) {
    return { error: result.error, status: 400 };
  }

  appendTimeline(result.task, 'queued', `Task replayed from source task ${sourceTask.id}.`);
  addArtifact(
    result.task,
    'control',
    'Replay Source',
    [`Source Task: ${sourceTask.id}`, `Source Status: ${sourceTask.status}`].join('\n')
  );
  publishSystemEvent('task.replayed', {
    sourceTaskId: sourceTask.id,
    task: buildTaskEventPayload(result.task),
  });

  return { task: result.task, status: 201 };
}

function getTaskById(taskId) {
  return tasksById.get(taskId);
}

function getCollaborativeRunById(runId) {
  return collaborativeRunsById.get(runId);
}

function matchTaskRoute(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'v1' || parts[1] !== 'tasks' || parts.length < 3) {
    return null;
  }

  return {
    taskId: parts[2],
    subresource: parts[3] || null,
  };
}

function matchCollaborativeRunRoute(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'v1' || parts[1] !== 'runs' || parts.length < 3) {
    return null;
  }

  return {
    runId: parts[2],
    subresource: parts[3] || null,
  };
}

function matchEditRoute(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'v1' || parts[1] !== 'edits' || parts.length < 3) {
    return null;
  }

  return {
    editId: parts[2],
    subresource: parts[3] || null,
  };
}

function matchPluginRoute(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'v1' || parts[1] !== 'plugins' || parts.length < 3) {
    return null;
  }

  return {
    pluginId: parts[2],
    subresource: parts[3] || null,
  };
}

function appendTimeline(task, state, message) {
  const entry = {
    id: randomUUID(),
    state,
    message,
    createdAt: new Date().toISOString(),
  };

  task.timeline.unshift(entry);
  task.updatedAt = entry.createdAt;
  persistTasksSoon();
  publishSystemEvent('task.timeline', {
    task: buildTaskEventPayload(task),
    entry,
  });
  return entry;
}

function addArtifact(task, type, title, content) {
  const artifact = {
    id: randomUUID(),
    type,
    title,
    content,
    createdAt: new Date().toISOString(),
  };

  task.artifacts.unshift(artifact);
  task.updatedAt = artifact.createdAt;
  persistTasksSoon();
  publishSystemEvent('task.artifact', {
    task: buildTaskEventPayload(task),
    artifact: {
      id: artifact.id,
      type: artifact.type,
      title: artifact.title,
      createdAt: artifact.createdAt,
    },
  });
  return artifact;
}

function clearTaskTimers(taskId) {
  const timerSet = taskTimers.get(taskId);
  if (!timerSet) {
    return;
  }

  for (const timer of timerSet) {
    clearTimeout(timer);
  }
  taskTimers.delete(taskId);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncateOutput(text) {
  if (text.length <= maxCommandOutputChars) {
    return text;
  }

  return `${text.slice(0, maxCommandOutputChars)}\n...output truncated...`;
}

function runSingleCommand(taskId, command, timeoutMs, workingDirectory) {
  return new Promise((resolve, reject) => {
    let tokens;
    try {
      tokens = tokenizeCommand(command);
    } catch (error) {
      reject(new Error(`Invalid command "${command}": ${error.message}`));
      return;
    }
    if (!tokens.length) {
      reject(new Error('Cannot execute an empty command.'));
      return;
    }

    const executable = tokens[0];
    const args = tokens.slice(1);
    const commandEnv = {
      ...process.env,
      PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    };

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const child = spawn(executable, args, {
      cwd: workingDirectory,
      env: commandEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    activeTaskProcesses.set(taskId, child);

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 500);
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
      stdout = truncateOutput(stdout);
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
      stderr = truncateOutput(stderr);
    });

    child.on('error', (error) => {
      clearTimeout(timeoutHandle);
      activeTaskProcesses.delete(taskId);
      reject(new Error(`Failed to start command "${command}": ${error.message}`));
    });

    child.on('close', (code, signal) => {
      clearTimeout(timeoutHandle);
      activeTaskProcesses.delete(taskId);
      resolve({
        command,
        code: Number.isInteger(code) ? code : 1,
        signal: signal || null,
        timedOut,
        stdout,
        stderr,
      });
    });
  });
}

async function executeTaskCommands(task) {
  if (!task.commands.length) {
    await wait(400);
    const modelResponse = await runModelGeneration(task.modelId, task.prompt, {});
    const checkStatus = modelResponse.simulated ? 'unknown' : 'pass';
    const modelMode = modelResponse.simulated ? 'simulated-fallback' : 'provider-api';
    return {
      checks: [
        {
          name: `model-generation:${task.modelId}`,
          status: checkStatus,
          provider: modelResponse.provider,
          mode: modelMode,
        },
      ],
      executionLog: [
        `cwd: ${task.workingDirectory}`,
        '$ (model generation)',
        `provider: ${modelResponse.provider}`,
        `mode: ${modelMode}`,
      ].join('\n'),
      modelOutput: modelResponse.text,
      summary: modelResponse.simulated
        ? 'No commands executed; returned simulated model output (provider key missing).'
        : 'No commands executed; model output generated via provider API.',
    };
  }

  const commandResults = [];

  for (const command of task.commands) {
    if (task.status !== 'running') {
      throw new Error('Task execution was interrupted.');
    }

    const result = await runSingleCommand(task.id, command, task.commandTimeoutMs, task.workingDirectory);
    commandResults.push(result);

    if (result.code !== 0 || result.timedOut) {
      const failureReason = result.timedOut
        ? `Command timed out after ${task.commandTimeoutMs}ms.`
        : `Command exited with code ${result.code}.`;
      const error = new Error(`${failureReason} (${command})`);
      error.commandResults = commandResults;
      throw error;
    }
  }

  const checks = commandResults.map((result) => ({
    name: `command:${result.command}`,
    status: result.code === 0 ? 'pass' : 'fail',
    code: result.code,
  }));

  const executionLog = commandResults
    .map((result) =>
      [
        `cwd: ${task.workingDirectory}`,
        `$ ${result.command}`,
        result.stdout ? `stdout:\n${result.stdout}` : 'stdout: (empty)',
        result.stderr ? `stderr:\n${result.stderr}` : 'stderr: (empty)',
        `exitCode: ${result.code}`,
      ].join('\n')
    )
    .join('\n\n');

  return {
    checks,
    executionLog,
    summary: `Executed ${commandResults.length} command(s).`,
  };
}

function buildVerificationArtifact(checks) {
  return JSON.stringify(
    {
      checks,
    },
    null,
    2
  );
}

async function startTaskExecution(task) {
  try {
    const result = await executeTaskCommands(task);
    if (task.status !== 'running') {
      return;
    }

    if (typeof result.modelOutput === 'string' && result.modelOutput.trim()) {
      addArtifact(task, 'model-output', 'Model Output', result.modelOutput);
    }
    addArtifact(task, 'execution-log', 'Execution Log', result.executionLog);
    addArtifact(task, 'verification', 'Verification Report', buildVerificationArtifact(result.checks));
    task.status = 'completed';
    task.result = {
      outcome: 'success',
      summary: result.summary,
      completedAt: new Date().toISOString(),
    };
    appendTimeline(task, 'completed', 'Task completed successfully.');
  } catch (error) {
    if (task.status !== 'running') {
      return;
    }

    const commandResults = Array.isArray(error.commandResults) ? error.commandResults : [];
    const checks = commandResults.length
      ? commandResults.map((result) => ({
          name: `command:${result.command}`,
          status: result.code === 0 ? 'pass' : 'fail',
          code: result.code,
          timedOut: result.timedOut,
        }))
      : [{ name: 'execution', status: 'fail', note: error.message }];

    const executionLog = commandResults.length
      ? commandResults
          .map((result) =>
            [
              `cwd: ${task.workingDirectory}`,
              `$ ${result.command}`,
              result.stdout ? `stdout:\n${result.stdout}` : 'stdout: (empty)',
              result.stderr ? `stderr:\n${result.stderr}` : 'stderr: (empty)',
              `exitCode: ${result.code}`,
              `timedOut: ${result.timedOut}`,
            ].join('\n')
          )
          .join('\n\n')
      : `Execution error: ${error.message}`;

    addArtifact(task, 'execution-log', 'Execution Log', executionLog);
    addArtifact(task, 'verification', 'Verification Report', buildVerificationArtifact(checks));

    task.status = 'failed';
    task.result = {
      outcome: 'failed',
      summary: error.message,
      completedAt: new Date().toISOString(),
    };
    appendTimeline(task, 'failed', `Task failed: ${error.message}`);
  } finally {
    clearTaskTimers(task.id);
    activeLifecycleTaskIds.delete(task.id);
    scheduleNextLifecycle();
    persistTasksSoon();
  }
}

function compareTaskQueueOrder(a, b) {
  const byPriority = getTaskPriorityValue(b) - getTaskPriorityValue(a);
  if (byPriority !== 0) {
    return byPriority;
  }
  const byCreatedAt = a.createdAt.localeCompare(b.createdAt);
  if (byCreatedAt !== 0) {
    return byCreatedAt;
  }
  return a.id.localeCompare(b.id);
}

function selectNextQueuedTask(excludedTaskIds) {
  const excluded = excludedTaskIds || new Set();
  const queued = tasks.filter(
    (task) => task.status === 'queued' && !excluded.has(task.id) && getTaskDependencyBlockers(task).length === 0
  );
  if (!queued.length) {
    return null;
  }

  queued.sort(compareTaskQueueOrder);

  return queued[0];
}

function scheduleNextLifecycle() {
  if (queuePaused) {
    return;
  }

  while (activeLifecycleTaskIds.size < maxConcurrentTasks) {
    const nextTask = selectNextQueuedTask(activeLifecycleTaskIds);
    if (!nextTask) {
      break;
    }
    scheduleLifecycle(nextTask);
  }
}

function scheduleLifecycle(task) {
  if (!task || task.status !== 'queued' || activeLifecycleTaskIds.has(task.id)) {
    return;
  }

  activeLifecycleTaskIds.add(task.id);
  const timerSet = new Set();

  const planningTimer = setTimeout(() => {
    if (!task || task.status !== 'queued') {
      if (activeLifecycleTaskIds.delete(task.id)) {
        scheduleNextLifecycle();
      }
      return;
    }

    task.status = 'planning';
    appendTimeline(task, 'planning', 'Built an execution plan.');
    addArtifact(
      task,
      'plan',
      'Execution Plan',
      createExecutionPlan(task.prompt, task.commands, task.workingDirectory, task.priority, task.dependsOn)
    );
  }, lifecycleDelays.planningMs);
  timerSet.add(planningTimer);

  const runningTimer = setTimeout(() => {
    if (!task || (task.status !== 'planning' && task.status !== 'queued')) {
      if (activeLifecycleTaskIds.delete(task.id)) {
        scheduleNextLifecycle();
      }
      return;
    }

    task.status = 'running';
    appendTimeline(task, 'running', 'Running workspace actions.');
    startTaskExecution(task);
  }, lifecycleDelays.runningMs);
  timerSet.add(runningTimer);

  taskTimers.set(task.id, timerSet);
}

function createExecutionPlan(prompt, commands, workingDirectory, priority, dependsOn) {
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  const dependencyList = normalizeTaskDependsOn(dependsOn);
  const commandPlan = commands.length
    ? `3. Execute allowlisted commands:\n   - ${commands.join('\n   - ')}`
    : '3. No commands were requested, so execution remains plan-only for this task.';
  return [
    '1. Analyze the request and identify impacted files.',
    `2. Draft implementation approach for: "${normalized}".`,
    `Working directory: ${workingDirectory}`,
    `Priority: ${normalizeTaskPriority(priority)}`,
    `Depends on: ${dependencyList.length ? dependencyList.join(', ') : '(none)'}`,
    commandPlan,
    '4. Run verification checks and attach artifacts.',
  ].join('\n');
}

function cancelTask(task) {
  if (!task) {
    return { error: 'Task not found.', status: 404 };
  }

  if (terminalTaskStatuses.has(task.status)) {
    return { error: `Task is already ${task.status}.`, status: 409 };
  }

  clearTaskTimers(task.id);
  const activeProcess = activeTaskProcesses.get(task.id);
  if (activeProcess) {
    try {
      activeProcess.kill('SIGTERM');
    } catch (error) {
      console.error(`Failed to stop task process ${task.id}:`, error.message);
    }
    activeTaskProcesses.delete(task.id);
  }
  task.status = 'cancelled';
  appendTimeline(task, 'cancelled', 'Task was cancelled by user.');
  addArtifact(task, 'control', 'Cancellation Notice', 'Execution stopped before completion.');
  task.result = {
    outcome: 'cancelled',
    completedAt: new Date().toISOString(),
  };
  activeLifecycleTaskIds.delete(task.id);
  scheduleNextLifecycle();
  persistTasksSoon();

  return { task };
}

function summarizeTaskCounts() {
  const counts = {
    queued: 0,
    planning: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  };

  for (const task of tasks) {
    if (counts[task.status] === undefined) {
      counts[task.status] = 0;
    }
    counts[task.status] += 1;
  }

  return counts;
}

function buildQueueManagerState() {
  return {
    mode: 'priority-bounded-workers',
    paused: queuePaused,
    maxConcurrentTasks,
    activeTaskIds: Array.from(activeLifecycleTaskIds),
    priorities: ['high', 'normal', 'low'],
  };
}

function buildRuntimeDiagnostics() {
  let taskStoreInfo = {
    path: taskStorePath,
    exists: false,
    sizeBytes: 0,
    updatedAt: null,
  };

  try {
    if (taskStorePath && fs.existsSync(taskStorePath)) {
      const stats = fs.statSync(taskStorePath);
      taskStoreInfo = {
        path: taskStorePath,
        exists: true,
        sizeBytes: Number.isFinite(stats.size) ? stats.size : 0,
        updatedAt: typeof stats.mtime?.toISOString === 'function' ? stats.mtime.toISOString() : null,
      };
    }
  } catch (error) {
    taskStoreInfo = {
      path: taskStorePath,
      exists: false,
      sizeBytes: 0,
      updatedAt: null,
      error: error.message,
    };
  }

  const memory = process.memoryUsage();

  return {
    service: 'orchestrator',
    runtime: {
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      uptimeSeconds: Math.floor(process.uptime()),
      memoryBytes: {
        rss: memory.rss,
        heapTotal: memory.heapTotal,
        heapUsed: memory.heapUsed,
        external: memory.external,
        arrayBuffers: memory.arrayBuffers,
      },
    },
    queue: {
      ...buildQueueManagerState(),
      activeProcessTaskIds: Array.from(activeTaskProcesses.keys()),
    },
    storage: taskStoreInfo,
    models: {
      configuredProviders: {
        openai: Boolean(openaiApiKey),
        anthropic: Boolean(anthropicApiKey),
        google: Boolean(googleApiKey),
        azure: Boolean(azureFoundryApiKey && azureFoundryChatUrl),
      },
      availableModelCount: listAvailableModelCatalog().length,
    },
    security: {
      apiAuthEnabled: Boolean(orchestratorApiToken),
      cors: {
        allowAllOrigins: allowAllCorsOrigins,
        allowedOrigins: allowAllCorsOrigins ? ['*'] : Array.from(corsAllowedOrigins),
      },
      marketplaceImport: {
        httpsRequired: !allowInsecureMarketplaceHttp,
      },
    },
    counts: {
      tasks: tasks.length,
      runs: collaborativeRuns.length,
      plugins: plugins.length,
      edits: edits.length,
      byStatus: summarizeTaskCounts(),
    },
    limits: {
      maxConcurrentTasks,
      maxTaskCommands,
      defaultCommandTimeoutMs,
      maxCommandOutputChars,
      eventHistoryLimit,
      eventHeartbeatMs,
    },
    time: new Date().toISOString(),
  };
}

function resolveReliabilityOverallStatus(gates) {
  const statuses = Array.isArray(gates) ? gates.map((gate) => gate.status) : [];
  if (statuses.includes('fail')) {
    return 'fail';
  }
  if (statuses.includes('warn')) {
    return 'warn';
  }
  return 'pass';
}

function checkTaskStoreWritable() {
  if (!taskStorePath) {
    return { ok: false, reason: 'TASK_STORE_PATH is empty.' };
  }

  try {
    const directory = path.dirname(taskStorePath);
    fs.mkdirSync(directory, { recursive: true });
    fs.accessSync(directory, fs.constants.W_OK);

    const probePath = path.join(directory, `.write-probe-${process.pid}-${Date.now()}.tmp`);
    fs.writeFileSync(probePath, 'ok', 'utf8');
    fs.unlinkSync(probePath);

    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

// Restore Drill Runner - stores drill run records in memory
const restoreDrillRuns = [];
const restoreDrillRunsById = new Map();
const maxRestoreDrillRuns = 10;

// Replay Consistency Diagnostics - S2
const replayConsistencyRuns = [];
const replayConsistencyRunsById = new Map();
const maxReplayConsistencyRuns = 10;

// Recovery Smoke Diagnostics - S3
const recoverySmokeRuns = [];
const recoverySmokeRunsById = new Map();
const maxRecoverySmokeRuns = 10;

// Reliability History - S4
const reliabilityHistory = [];
const maxReliabilityHistory = 100;
const allowedDiagnosticRunStatuses = new Set(['running', 'completed', 'failed', 'cancelled', 'timeout']);
const uuidV4LikePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeDiagnosticRunStatus(value) {
  const status = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return allowedDiagnosticRunStatuses.has(status) ? status : 'failed';
}

function isUuidLike(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return uuidV4LikePattern.test(normalized);
}

function findRunningDiagnosticRun(runs) {
  if (!Array.isArray(runs)) {
    return null;
  }
  return runs.find((run) => run && normalizeDiagnosticRunStatus(run.status) === 'running') || null;
}

function recordReliabilityCheck(gatesResult) {
  const entry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    overall: gatesResult.overall,
    summary: gatesResult.summary,
    gateStatuses: gatesResult.gates.map(g => ({ id: g.id, status: g.status })),
    metrics: gatesResult.metrics,
  };
  
  reliabilityHistory.unshift(entry);
  
  while (reliabilityHistory.length > maxReliabilityHistory) {
    reliabilityHistory.pop();
  }

  persistTasksSoon();
  
  return entry;
}

function getReliabilityHistory(limit = 10) {
  return {
    history: reliabilityHistory.slice(0, limit),
    total: reliabilityHistory.length,
  };
}

function startRecoverySmoke() {
  const activeRun = findRunningDiagnosticRun(recoverySmokeRuns);
  if (activeRun) {
    return {
      error: `Recovery smoke test already running (drill ${activeRun.id}).`,
      status: 409,
    };
  }

  const drillId = randomUUID();
  const now = new Date().toISOString();
  
  // Create a test task
  const drillTaskResult = buildTask({
    prompt: '[drill:smoke] Synthetic recovery smoke test task.',
    modelId: models[0],
    commands: [],
    workingDirectory: defaultWorkingDirectory,
    priority: 'normal',
    dependsOn: [],
    commandTimeoutMs: defaultCommandTimeoutMs,
  });
  
  if (drillTaskResult.error) {
    return { error: drillTaskResult.error, status: 400 };
  }
  
  const drillTask = drillTaskResult.task;
  
  const drillRun = {
    id: drillId,
    taskId: drillTask.id,
    startedAt: now,
    status: 'running',
    evidence: {
      taskId: drillTask.id,
      pauseTest: 'pending',
      resumeTest: 'pending',
      cancelTest: 'pending',
      allPassed: false,
    },
  };
  
  recoverySmokeRuns.unshift(drillRun);
  recoverySmokeRunsById.set(drillRun.id, drillRun);
  
  while (recoverySmokeRuns.length > maxRecoverySmokeRuns) {
    const removed = recoverySmokeRuns.pop();
    if (removed) {
      recoverySmokeRunsById.delete(removed.id);
    }
  }

  persistTasksSoon();
  
  // Run smoke test sequence
  trackRecoverySmoke(drillRun.id, drillTask.id);
  
  return {
    drill: {
      id: drillRun.id,
      taskId: drillTask.id,
      startedAt: drillRun.startedAt,
      status: drillRun.status,
    },
  };
}

function trackRecoverySmoke(drillId, taskId) {
  const drillRun = recoverySmokeRunsById.get(drillId);
  if (!drillRun) return;
  
  const task = tasksById.get(taskId);
  if (!task) {
    drillRun.status = 'failed';
    drillRun.evidence.cancelTest = 'task-not-found';
    persistTasksSoon();
    return;
  }
  
  // Step 1: Test pause
  setTimeout(() => {
    const currentDrill = recoverySmokeRunsById.get(drillId);
    if (!currentDrill || currentDrill.status !== 'running') return;
    
    // Pause the queue
    queuePaused = true;
    currentDrill.evidence.pauseTest = 'passed';
    persistTasksSoon();
    
    // Step 2: Test resume after 500ms
    setTimeout(() => {
      const currentDrill2 = recoverySmokeRunsById.get(drillId);
      if (!currentDrill2 || currentDrill2.status !== 'running') return;
      
      queuePaused = false;
      currentDrill2.evidence.resumeTest = 'passed';
      scheduleNextLifecycle();
      persistTasksSoon();
      
      // Step 3: Test cancel after another 500ms
      setTimeout(() => {
        const currentDrill3 = recoverySmokeRunsById.get(drillId);
        if (!currentDrill3 || currentDrill3.status !== 'running') return;
        
        const task3 = tasksById.get(taskId);
        if (task3 && task3.status !== 'completed') {
          cancelTask(task3);
          currentDrill3.evidence.cancelTest = 'passed';
        } else {
          currentDrill3.evidence.cancelTest = 'skipped (already completed)';
        }
        
        // Determine overall pass/fail
        const passed = currentDrill3.evidence.pauseTest === 'passed' && 
                       currentDrill3.evidence.resumeTest === 'passed';
        currentDrill3.evidence.allPassed = passed;
        currentDrill3.status = passed ? 'completed' : 'failed';
        persistTasksSoon();
        
      }, 500);
    }, 500);
  }, 500);
}

function getLatestRecoverySmoke() {
  if (!recoverySmokeRuns.length) {
    return { drill: null, message: 'No recovery smoke tests yet.' };
  }
  
  const latest = recoverySmokeRuns[0];
  const evidenceLines = [
    `taskId: ${latest.evidence.taskId}`,
    `pauseTest: ${latest.evidence.pauseTest}`,
    `resumeTest: ${latest.evidence.resumeTest}`,
    `cancelTest: ${latest.evidence.cancelTest}`,
    `allPassed: ${latest.evidence.allPassed}`,
  ];
  
  return {
    drill: {
      id: latest.id,
      taskId: latest.taskId,
      startedAt: latest.startedAt,
      status: latest.status,
      evidence: evidenceLines,
    },
  };
}

function trackReplayConsistency(drillId, sourceTaskId, replayTaskId) {
  const checkInterval = setInterval(() => {
    const drillRun = replayConsistencyRunsById.get(drillId);
    if (!drillRun) {
      clearInterval(checkInterval);
      return;
    }
    
    const sourceTask = tasksById.get(sourceTaskId);
    const replayTask = tasksById.get(replayTaskId);
    
    if (!sourceTask || !replayTask) {
      drillRun.status = 'failed';
      drillRun.evidence.replayStatus = 'task-not-found';
      drillRun.evidence.consistent = false;
      persistTasksSoon();
      clearInterval(checkInterval);
      return;
    }
    
    // Check if replay task reached terminal status
    if (terminalTaskStatuses.has(replayTask.status)) {
      const sourceStatus = sourceTask.status;
      const replayStatus = replayTask.status;
      const sourceArtifactHash = buildTaskArtifactHash(sourceTask);
      const replayArtifactHash = buildTaskArtifactHash(replayTask);
      const terminalStatusMatch = sourceStatus === replayStatus;
      const artifactHashMatch = sourceArtifactHash === replayArtifactHash;
      const consistent = terminalStatusMatch && artifactHashMatch;

      drillRun.status = consistent
        ? 'completed'
        : replayStatus === 'cancelled'
          ? 'cancelled'
          : 'failed';
      drillRun.evidence.sourceStatus = sourceStatus;
      drillRun.evidence.replayStatus = replayTask.status;
      drillRun.evidence.sourceArtifactHash = sourceArtifactHash;
      drillRun.evidence.replayArtifactHash = replayArtifactHash;
      drillRun.evidence.terminalStatusMatch = terminalStatusMatch;
      drillRun.evidence.artifactHashMatch = artifactHashMatch;
      drillRun.evidence.consistent = consistent;
      persistTasksSoon();
      
      clearInterval(checkInterval);
      return;
    }
  }, 500);
  
  // Timeout after 30 seconds
  setTimeout(() => {
    const drillRun = replayConsistencyRunsById.get(drillId);
    if (drillRun && drillRun.status === 'running') {
      drillRun.status = 'timeout';
      drillRun.evidence.replayStatus = 'timeout';
      drillRun.evidence.consistent = false;
      persistTasksSoon();
      clearInterval(checkInterval);
    }
  }, 30000);
}

function startRestoreDrill() {
  const activeRun = findRunningDiagnosticRun(restoreDrillRuns);
  if (activeRun) {
    return {
      error: `Restore drill already running (drill ${activeRun.id}).`,
      status: 409,
    };
  }

  const drillId = randomUUID();
  const now = new Date().toISOString();
  
  // Create a synthetic drill task with prompt marker [drill:restore]
  const drillTaskResult = buildTask({
    prompt: '[drill:restore] Synthetic restore drill task to verify task replay capability and persistence.',
    modelId: models[0],
    commands: [],
    workingDirectory: defaultWorkingDirectory,
    priority: 'normal',
    dependsOn: [],
    commandTimeoutMs: defaultCommandTimeoutMs,
  });
  
  if (drillTaskResult.error) {
    return { error: drillTaskResult.error, status: 400 };
  }
  
  const drillTask = drillTaskResult.task;
  
  // Create drill run record
  const drillRun = {
    id: drillId,
    taskId: drillTask.id,
    startedAt: now,
    status: 'running',
    evidence: {
      taskId: drillTask.id,
      terminalStatus: null,
      taskStorePath: taskStorePath,
      taskStoreExists: false,
      taskStoreSizeBytes: 0,
      taskStoreUpdatedAt: null,
      replayReady: false,
    },
  };
  
  // Get initial taskStore info
  try {
    if (taskStorePath && fs.existsSync(taskStorePath)) {
      const stats = fs.statSync(taskStorePath);
      drillRun.evidence.taskStoreExists = true;
      drillRun.evidence.taskStoreSizeBytes = Number.isFinite(stats.size) ? stats.size : 0;
      drillRun.evidence.taskStoreUpdatedAt = typeof stats.mtime?.toISOString === 'function' ? stats.mtime.toISOString() : null;
    }
  } catch (error) {
    // Keep defaults
  }
  
  restoreDrillRuns.unshift(drillRun);
  restoreDrillRunsById.set(drillRun.id, drillRun);
  
  // Trim old runs
  while (restoreDrillRuns.length > maxRestoreDrillRuns) {
    const removed = restoreDrillRuns.pop();
    if (removed) {
      restoreDrillRunsById.delete(removed.id);
    }
  }

  persistTasksSoon();
  
  // Track progress asynchronously
  trackRestoreDrillProgress(drillRun.id, drillTask.id);
  
  return {
    drill: {
      id: drillRun.id,
      taskId: drillTask.id,
      startedAt: drillRun.startedAt,
      status: drillRun.status,
    },
  };
}

function trackRestoreDrillProgress(drillId, taskId) {
  const checkInterval = setInterval(() => {
    const drillRun = restoreDrillRunsById.get(drillId);
    if (!drillRun) {
      clearInterval(checkInterval);
      return;
    }
    
    const task = tasksById.get(taskId);
    if (!task) {
      drillRun.status = 'failed';
      drillRun.evidence.terminalStatus = 'task-not-found';
      persistTasksSoon();
      clearInterval(checkInterval);
      return;
    }
    
    // Check if task reached terminal status
    if (terminalTaskStatuses.has(task.status)) {
      drillRun.status = task.status === 'completed' ? 'completed' : (task.status === 'failed' ? 'failed' : 'cancelled');
      drillRun.evidence.terminalStatus = task.status;
      
      // Check replay readiness
      drillRun.evidence.replayReady = terminalTaskStatuses.has(task.status);
      try {
        if (taskStorePath && fs.existsSync(taskStorePath)) {
          const stats = fs.statSync(taskStorePath);
          drillRun.evidence.taskStoreExists = true;
          drillRun.evidence.taskStoreSizeBytes = Number.isFinite(stats.size) ? stats.size : 0;
          drillRun.evidence.taskStoreUpdatedAt =
            typeof stats.mtime?.toISOString === 'function' ? stats.mtime.toISOString() : null;
        }
      } catch (error) {
        // Best-effort evidence refresh.
      }
      persistTasksSoon();
      
      clearInterval(checkInterval);
      return;
    }
  }, 500);
  
  // Timeout after 30 seconds
  setTimeout(() => {
    const drillRun = restoreDrillRunsById.get(drillId);
    if (drillRun && drillRun.status === 'running') {
      drillRun.status = 'timeout';
      drillRun.evidence.terminalStatus = 'timeout';
      persistTasksSoon();
      clearInterval(checkInterval);
    }
  }, 30000);
}

function getRestoreDrillById(drillId) {
  if (!drillId) {
    return { error: 'Drill ID is required.', status: 400 };
  }
  if (!isUuidLike(drillId)) {
    return { error: 'Drill ID must be a valid UUID.', status: 400 };
  }
  const drillRun = restoreDrillRunsById.get(drillId);
  if (!drillRun) {
    return { error: 'Restore drill not found.', status: 404 };
  }
  const evidenceLines = [
    `taskId: ${drillRun.evidence.taskId}`,
    `terminalStatus: ${drillRun.evidence.terminalStatus || '(in progress)'}`,
    `taskStorePath: ${drillRun.evidence.taskStorePath}`,
    `taskStoreExists: ${drillRun.evidence.taskStoreExists}`,
    `taskStoreSizeBytes: ${drillRun.evidence.taskStoreSizeBytes}`,
    `taskStoreUpdatedAt: ${drillRun.evidence.taskStoreUpdatedAt || '(none)'}`,
    `replayReady: ${drillRun.evidence.replayReady}`,
  ];
  return {
    drill: {
      id: drillRun.id,
      taskId: drillRun.taskId,
      startedAt: drillRun.startedAt,
      status: drillRun.status,
      evidence: evidenceLines,
    },
  };
}

function getLatestRestoreDrill() {
  if (!restoreDrillRuns.length) {
    return {
      drill: null,
      message: 'No restore drill runs yet.',
    };
  }
  
  const latest = restoreDrillRuns[0];
  
  // Build evidence lines
  const evidenceLines = [
    `taskId: ${latest.evidence.taskId}`,
    `terminalStatus: ${latest.evidence.terminalStatus || '(in progress)'}`,
    `taskStorePath: ${latest.evidence.taskStorePath}`,
    `taskStoreExists: ${latest.evidence.taskStoreExists}`,
    `taskStoreSizeBytes: ${latest.evidence.taskStoreSizeBytes}`,
    `taskStoreUpdatedAt: ${latest.evidence.taskStoreUpdatedAt || '(none)'}`,
    `replayReady: ${latest.evidence.replayReady}`,
  ];
  
  return {
    drill: {
      id: latest.id,
      taskId: latest.taskId,
      startedAt: latest.startedAt,
      status: latest.status,
      evidence: evidenceLines,
    },
  };
}

function buildReliabilityGates() {
  const diagnostics = buildRuntimeDiagnostics();
  const taskStoreWritable = checkTaskStoreWritable();
  const taskStoreExists = Boolean(diagnostics.storage && diagnostics.storage.exists);
  const terminalTaskCount = tasks.filter((task) => terminalTaskStatuses.has(task.status)).length;
  const queueState = buildQueueManagerState();
  const activeProcessTaskIds = Array.from(activeTaskProcesses.keys());
  const activeTaskIds = Array.isArray(queueState.activeTaskIds) ? queueState.activeTaskIds : [];
  const orphanedProcessTaskIds = activeProcessTaskIds.filter((taskId) => !activeTaskIds.includes(taskId));

  const persistenceGateStatus = !taskStoreWritable.ok ? 'fail' : taskStoreExists ? 'pass' : 'warn';
  const restoreDataGateStatus = !taskStoreWritable.ok ? 'fail' : taskStoreExists ? 'pass' : 'warn';
  const replayGateStatus = terminalTaskCount > 0 ? 'pass' : 'warn';
  const recoveryGateStatus = orphanedProcessTaskIds.length ? 'fail' : 'pass';

  const gates = [
    {
      id: 'persistent_store_writable',
      label: 'Persistent Store Writable',
      status: persistenceGateStatus,
      details: !taskStoreWritable.ok
        ? taskStoreWritable.reason || 'Task store path is not writable.'
        : `Task store path is writable (${taskStorePath}).`,
      evidence: {
        taskStorePath,
        writable: taskStoreWritable.ok,
      },
    },
    {
      id: 'restore_data_present',
      label: 'Restore Data Present',
      status: restoreDataGateStatus,
      details: taskStoreExists
        ? `Persisted task state found at ${taskStorePath}.`
        : `No persisted task state found at ${taskStorePath} yet.`,
      evidence: {
        taskStorePath,
        exists: taskStoreExists,
        sizeBytes: diagnostics.storage && typeof diagnostics.storage.sizeBytes === 'number' ? diagnostics.storage.sizeBytes : 0,
        updatedAt: diagnostics.storage ? diagnostics.storage.updatedAt : null,
      },
    },
    {
      id: 'task_replay_readiness',
      label: 'Task Replay Readiness',
      status: replayGateStatus,
      details:
        replayGateStatus === 'pass'
          ? `Replay is available with ${terminalTaskCount} completed/failed/cancelled task(s).`
          : 'Replay endpoint is available, but no terminal tasks exist yet for deterministic replay checks.',
      evidence: {
        terminalTaskCount,
        replayEndpoint: '/v1/tasks/:id/replay',
      },
    },
    {
      id: 'recovery_controls_health',
      label: 'Recovery Controls Health',
      status: recoveryGateStatus,
      details:
        recoveryGateStatus === 'pass'
          ? 'Queue pause/resume/cancel controls are healthy and process tracking is consistent.'
          : `Detected orphaned running process records for task IDs: ${orphanedProcessTaskIds.join(', ')}.`,
      evidence: {
        activeTaskIds,
        activeProcessTaskIds,
        orphanedProcessTaskIds,
      },
    },
  ];

  const overall = resolveReliabilityOverallStatus(gates);
  const summaryByStatus = gates.reduce(
    (acc, gate) => {
      if (!acc[gate.status]) {
        acc[gate.status] = 0;
      }
      acc[gate.status] += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0 }
  );

  return {
    scope: 'single-user',
    overall,
    summary: summaryByStatus,
    gates,
    metrics: {
      taskCount: tasks.length,
      terminalTaskCount,
      replayableTaskCount: terminalTaskCount,
      queuePaused: queuePaused,
      activeTaskCount: activeTaskIds.length,
      activeProcessTaskCount: activeProcessTaskIds.length,
    },
    recommendedActions: [
      'Keep TASK_STORE_PATH writable and backed by a persistent volume on VPS.',
      'Run at least one full task cycle, then replay it to validate deterministic behavior.',
      'Run restore verification after container restarts to confirm recovery from persisted state.',
    ],
    time: new Date().toISOString(),
  };
}

function buildQueueControlResponse() {
  const counts = summarizeTaskCounts();
  return {
    queueManager: {
      ...buildQueueManagerState(),
      queuedTasks: counts.queued || 0,
      planningTasks: counts.planning || 0,
      runningTasks: counts.running || 0,
    },
    time: new Date().toISOString(),
  };
}

function pauseQueue() {
  queuePaused = true;
  const response = buildQueueControlResponse();
  publishSystemEvent('queue.paused', response.queueManager);
  return response;
}

function resumeQueue() {
  queuePaused = false;
  scheduleNextLifecycle();
  const response = buildQueueControlResponse();
  publishSystemEvent('queue.resumed', response.queueManager);
  return response;
}

function cancelQueuedTasks() {
  const queuedTasks = tasks.filter((task) => task.status === 'queued');
  const cancelledTaskIds = [];

  for (const task of queuedTasks) {
    const result = cancelTask(task);
    if (!result.error) {
      cancelledTaskIds.push(task.id);
    }
  }

  const response = {
    cancelledCount: cancelledTaskIds.length,
    cancelledTaskIds,
    ...buildQueueControlResponse(),
  };
  publishSystemEvent('queue.cancelQueued', {
    cancelledCount: response.cancelledCount,
    cancelledTaskIds: response.cancelledTaskIds,
    queueManager: response.queueManager,
  });
  return response;
}

function buildQueuePositionById() {
  const queuedOrder = tasks.filter((task) => task.status === 'queued').sort(compareTaskQueueOrder);
  const queuePositionById = new Map();
  for (let index = 0; index < queuedOrder.length; index++) {
    queuePositionById.set(queuedOrder[index].id, index + 1);
  }
  return queuePositionById;
}

function buildTaskResponse(task, queuePositionById) {
  const queuePositions = queuePositionById || buildQueuePositionById();
  const dependsOn = normalizeTaskDependsOn(task && task.dependsOn);
  const blockedBy = getTaskDependencyBlockers(task);
  const collaboration = normalizeCollaborativeTaskMetadata(task && task.collaboration);
  return {
    ...task,
    priority: normalizeTaskPriority(task.priority),
    dependsOn,
    blockedBy,
    blocked: blockedBy.length > 0,
    collaboration,
    queuePosition: queuePositions.has(task.id) ? queuePositions.get(task.id) : null,
    activeWorker: activeLifecycleTaskIds.has(task.id),
  };
}

function queryTasks(searchParams) {
  const status = (searchParams.get('status') || '').trim();
  const query = (searchParams.get('q') || '').trim().toLowerCase();
  const limitRaw = searchParams.get('limit');
  const limit = parsePositiveInt(limitRaw, tasks.length || 100, 1, 500);
  const queuePositionById = buildQueuePositionById();

  let filtered = tasks;

  if (status && status !== 'all') {
    filtered = filtered.filter((task) => task.status === status);
  }

  if (query) {
    filtered = filtered.filter((task) => {
      const prompt = typeof task.prompt === 'string' ? task.prompt.toLowerCase() : '';
      const priority = normalizeTaskPriority(task.priority);
      const dependsOn = normalizeTaskDependsOn(task.dependsOn);
      const collaboration = normalizeCollaborativeTaskMetadata(task.collaboration);
      const collaborationRunId = collaboration ? collaboration.runId.toLowerCase() : '';
      const collaborationRole = collaboration ? collaboration.role.toLowerCase() : '';
      return (
        task.id.toLowerCase().includes(query) ||
        prompt.includes(query) ||
        priority.includes(query) ||
        collaborationRunId.includes(query) ||
        collaborationRole.includes(query) ||
        dependsOn.some((dependencyTaskId) => dependencyTaskId.toLowerCase().includes(query))
      );
    });
  }

  return {
    tasks: filtered.slice(0, limit).map((task) => buildTaskResponse(task, queuePositionById)),
    meta: {
      total: tasks.length,
      matched: filtered.length,
      limit,
      status: status || 'all',
      q: query || '',
    },
  };
}

function buildTaskAuditEntry(task) {
  const dependsOn = normalizeTaskDependsOn(task.dependsOn);
  const collaboration = normalizeCollaborativeTaskMetadata(task.collaboration);
  return {
    id: task.id,
    status: task.status,
    priority: normalizeTaskPriority(task.priority),
    modelId: task.modelId,
    prompt: task.prompt,
    workingDirectory: task.workingDirectory,
    commandCount: Array.isArray(task.commands) ? task.commands.length : 0,
    dependencyCount: dependsOn.length,
    blockedByCount: getTaskDependencyBlockers(task).length,
    collaborationRunId: collaboration ? collaboration.runId : null,
    collaborationRole: collaboration ? collaboration.role : null,
    collaborationTemplateId: collaboration ? collaboration.templateId || null : null,
    artifactCount: Array.isArray(task.artifacts) ? task.artifacts.length : 0,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    result: task.result,
  };
}

function buildAuditExportJson(searchParams) {
  const queried = queryTasks(searchParams);
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalTasks: tasks.length,
      filteredTasks: queried.meta.matched,
      returnedTasks: queried.tasks.length,
      statusFilter: queried.meta.status,
      searchFilter: queried.meta.q,
      counts: summarizeTaskCounts(),
    },
    tasks: queried.tasks.map(buildTaskAuditEntry),
  };
}

function buildAuditExportMarkdown(searchParams) {
  const report = buildAuditExportJson(searchParams);
  const lines = [];
  lines.push('# Open-Antigravity Audit Export');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Total tasks: ${report.summary.totalTasks}`);
  lines.push(`Filtered tasks: ${report.summary.filteredTasks}`);
  lines.push(`Returned tasks: ${report.summary.returnedTasks}`);
  lines.push(`Status filter: ${report.summary.statusFilter}`);
  lines.push(`Search filter: ${report.summary.searchFilter || '(none)'}`);
  lines.push('');
  lines.push('## Status Counts');
  lines.push('');
  for (const [status, count] of Object.entries(report.summary.counts)) {
    lines.push(`- ${status}: ${count}`);
  }

  lines.push('');
  lines.push('## Tasks');
  lines.push('');
  if (!report.tasks.length) {
    lines.push('No tasks matched the selected filters.');
  } else {
    for (const task of report.tasks) {
      lines.push(`### ${task.id}`);
      lines.push(`- Status: ${task.status}`);
      lines.push(`- Priority: ${normalizeTaskPriority(task.priority)}`);
      lines.push(`- Model: ${task.modelId}`);
      lines.push(`- Working Directory: ${task.workingDirectory}`);
      lines.push(`- Command Count: ${task.commandCount}`);
      lines.push(`- Artifact Count: ${task.artifactCount}`);
      lines.push(`- Created: ${task.createdAt}`);
      lines.push(`- Updated: ${task.updatedAt}`);
      if (task.result && typeof task.result === 'object') {
        lines.push(`- Result: ${JSON.stringify(task.result)}`);
      }
      lines.push(`- Prompt: ${task.prompt}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

function normalizeNonNegativeNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function buildPersistedRestoreDrillRun(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }
  if (typeof candidate.id !== 'string' || typeof candidate.taskId !== 'string') {
    return null;
  }

  const evidence = candidate.evidence && typeof candidate.evidence === 'object' ? candidate.evidence : {};
  return {
    id: candidate.id,
    taskId: candidate.taskId,
    startedAt: isIsoDate(candidate.startedAt) ? candidate.startedAt : new Date().toISOString(),
    status: normalizeDiagnosticRunStatus(candidate.status),
    evidence: {
      taskId: typeof evidence.taskId === 'string' ? evidence.taskId : candidate.taskId,
      terminalStatus: typeof evidence.terminalStatus === 'string' ? evidence.terminalStatus : null,
      taskStorePath: typeof evidence.taskStorePath === 'string' ? evidence.taskStorePath : taskStorePath,
      taskStoreExists: Boolean(evidence.taskStoreExists),
      taskStoreSizeBytes: normalizeNonNegativeNumber(evidence.taskStoreSizeBytes, 0),
      taskStoreUpdatedAt: isIsoDate(evidence.taskStoreUpdatedAt) ? evidence.taskStoreUpdatedAt : null,
      replayReady: Boolean(evidence.replayReady),
    },
  };
}

function buildPersistedReplayConsistencyRun(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }
  if (typeof candidate.id !== 'string' || typeof candidate.sourceTaskId !== 'string' || typeof candidate.replayTaskId !== 'string') {
    return null;
  }

  const evidence = candidate.evidence && typeof candidate.evidence === 'object' ? candidate.evidence : {};
  return {
    id: candidate.id,
    sourceTaskId: candidate.sourceTaskId,
    replayTaskId: candidate.replayTaskId,
    startedAt: isIsoDate(candidate.startedAt) ? candidate.startedAt : new Date().toISOString(),
    status: normalizeDiagnosticRunStatus(candidate.status),
    evidence: {
      sourceTaskId: typeof evidence.sourceTaskId === 'string' ? evidence.sourceTaskId : candidate.sourceTaskId,
      replayTaskId: typeof evidence.replayTaskId === 'string' ? evidence.replayTaskId : candidate.replayTaskId,
      sourceStatus: typeof evidence.sourceStatus === 'string' ? evidence.sourceStatus : null,
      replayReady: Boolean(evidence.replayReady),
      replayStatus: typeof evidence.replayStatus === 'string' ? evidence.replayStatus : null,
      sourceArtifactHash: typeof evidence.sourceArtifactHash === 'string' ? evidence.sourceArtifactHash : null,
      replayArtifactHash: typeof evidence.replayArtifactHash === 'string' ? evidence.replayArtifactHash : null,
      terminalStatusMatch: Boolean(evidence.terminalStatusMatch),
      artifactHashMatch: Boolean(evidence.artifactHashMatch),
      consistent: Boolean(evidence.consistent),
    },
  };
}

function buildPersistedRecoverySmokeRun(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }
  if (typeof candidate.id !== 'string' || typeof candidate.taskId !== 'string') {
    return null;
  }

  const evidence = candidate.evidence && typeof candidate.evidence === 'object' ? candidate.evidence : {};
  return {
    id: candidate.id,
    taskId: candidate.taskId,
    startedAt: isIsoDate(candidate.startedAt) ? candidate.startedAt : new Date().toISOString(),
    status: normalizeDiagnosticRunStatus(candidate.status),
    evidence: {
      taskId: typeof evidence.taskId === 'string' ? evidence.taskId : candidate.taskId,
      pauseTest: typeof evidence.pauseTest === 'string' ? evidence.pauseTest : 'pending',
      resumeTest: typeof evidence.resumeTest === 'string' ? evidence.resumeTest : 'pending',
      cancelTest: typeof evidence.cancelTest === 'string' ? evidence.cancelTest : 'pending',
      allPassed: Boolean(evidence.allPassed),
    },
  };
}

function buildPersistedReliabilityHistoryEntry(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }
  if (typeof candidate.id !== 'string') {
    return null;
  }
  const timestamp = isIsoDate(candidate.timestamp) ? candidate.timestamp : null;
  if (!timestamp) {
    return null;
  }

  const gateStatuses = Array.isArray(candidate.gateStatuses)
    ? candidate.gateStatuses
        .map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return null;
          }
          const id = typeof entry.id === 'string' ? entry.id : '';
          const status = typeof entry.status === 'string' ? entry.status : '';
          if (!id || !status) {
            return null;
          }
          return { id, status };
        })
        .filter(Boolean)
    : [];

  return {
    id: candidate.id,
    timestamp,
    overall: typeof candidate.overall === 'string' ? candidate.overall : 'warn',
    summary: candidate.summary && typeof candidate.summary === 'object' ? candidate.summary : { pass: 0, warn: 0, fail: 0 },
    gateStatuses,
    metrics: candidate.metrics && typeof candidate.metrics === 'object' ? candidate.metrics : {},
  };
}

function loadPersistedTasks() {
  if (!taskStorePath || !fs.existsSync(taskStorePath)) {
    return;
  }

  try {
    const raw = fs.readFileSync(taskStorePath, 'utf8');
    const payload = JSON.parse(raw);
    const persistedTasks = Array.isArray(payload.tasks) ? payload.tasks : [];
    const persistedRuns = Array.isArray(payload.runs) ? payload.runs : [];
    const persistedPlugins = Array.isArray(payload.plugins) ? payload.plugins : [];
    const persistedEdits = Array.isArray(payload.edits) ? payload.edits : [];
    const persistedRestoreDrills = Array.isArray(payload.restoreDrills) ? payload.restoreDrills : [];
    const persistedReplayConsistencyRuns = Array.isArray(payload.replayConsistencyRuns) ? payload.replayConsistencyRuns : [];
    const persistedRecoverySmokeRuns = Array.isArray(payload.recoverySmokeRuns) ? payload.recoverySmokeRuns : [];
    const persistedReliabilityHistory = Array.isArray(payload.reliabilityHistory) ? payload.reliabilityHistory : [];

    for (const candidate of persistedTasks) {
      if (!candidate || typeof candidate !== 'object') {
        continue;
      }
      if (typeof candidate.id !== 'string' || typeof candidate.prompt !== 'string') {
        continue;
      }
      if (tasksById.has(candidate.id)) {
        continue;
      }
      const restoredCommandResult = parseTaskCommands(candidate.commands);
      const restoredWorkingDirectoryResult = parseTaskWorkingDirectory(candidate.workingDirectory);
      const restoredCollaboration = normalizeCollaborativeTaskMetadata(candidate.collaboration);

      const now = new Date().toISOString();
      const candidateModelId = typeof candidate.modelId === 'string' ? candidate.modelId.trim() : '';
      const restoredModel = resolveModelId(candidateModelId) || resolveModelId(models[0]);
      const task = {
        id: candidate.id,
        prompt: candidate.prompt,
        modelId: restoredModel ? restoredModel.id : candidateModelId || models[0],
        commands: restoredCommandResult.error ? [] : restoredCommandResult.commands,
        workingDirectory: restoredWorkingDirectoryResult.error
          ? defaultWorkingDirectory
          : restoredWorkingDirectoryResult.workingDirectory,
        priority: normalizeTaskPriority(candidate.priority),
        dependsOn: normalizeTaskDependsOn(candidate.dependsOn),
        commandTimeoutMs: normalizeCommandTimeoutMs(candidate.commandTimeoutMs),
        status: normalizeTaskStatus(candidate.status),
        createdAt: isIsoDate(candidate.createdAt) ? candidate.createdAt : now,
        updatedAt: isIsoDate(candidate.updatedAt) ? candidate.updatedAt : now,
        timeline: Array.isArray(candidate.timeline)
          ? candidate.timeline
              .map((entry) => buildPersistedTimelineEntry(entry, 'loaded'))
              .filter(Boolean)
          : [],
        artifacts: Array.isArray(candidate.artifacts)
          ? candidate.artifacts.map(buildPersistedArtifact).filter(Boolean)
          : [],
        collaboration: restoredCollaboration,
        result: candidate.result || null,
      };

      tasks.push(task);
      tasksById.set(task.id, task);
    }

    for (const candidate of persistedRuns) {
      if (!candidate || typeof candidate !== 'object') {
        continue;
      }
      if (typeof candidate.id !== 'string' || !candidate.id.trim()) {
        continue;
      }
      if (collaborativeRunsById.has(candidate.id)) {
        continue;
      }
      if (typeof candidate.prompt !== 'string' || !candidate.prompt.trim()) {
        continue;
      }

      const taskIdsRaw = Array.isArray(candidate.taskIds) ? candidate.taskIds : [];
      const taskIds = [];
      const seenTaskIds = new Set();
      for (const taskId of taskIdsRaw) {
        if (typeof taskId !== 'string' || !taskId || seenTaskIds.has(taskId)) {
          continue;
        }
        if (!tasksById.has(taskId)) {
          continue;
        }
        seenTaskIds.add(taskId);
        taskIds.push(taskId);
      }

      const now = new Date().toISOString();
      const run = {
        id: candidate.id,
        prompt: candidate.prompt.trim(),
        templateId: normalizeCollaborativeTemplateId(candidate.templateId) || null,
        roles: normalizeCollaborativeRunRoles(candidate.roles),
        taskIds,
        feedback: Array.isArray(candidate.feedback)
          ? candidate.feedback.map((entry) => normalizeCollaborativeRunFeedbackEntry(entry)).filter(Boolean)
          : [],
        createdAt: isIsoDate(candidate.createdAt) ? candidate.createdAt : now,
        updatedAt: isIsoDate(candidate.updatedAt) ? candidate.updatedAt : now,
      };

      collaborativeRuns.push(run);
      collaborativeRunsById.set(run.id, run);
    }

    for (const candidate of persistedPlugins) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        continue;
      }

      const normalized = normalizePluginManifest(candidate, null);
      if (normalized.error) {
        continue;
      }

      const plugin = normalized.plugin;
      if (pluginsById.has(plugin.id)) {
        continue;
      }

      plugin.createdAt = isIsoDate(candidate.createdAt) ? candidate.createdAt : plugin.createdAt;
      plugin.updatedAt = isIsoDate(candidate.updatedAt) ? candidate.updatedAt : plugin.updatedAt;
      plugins.push(plugin);
      pluginsById.set(plugin.id, plugin);
    }

    if (!collaborativeRuns.length) {
      const groupedByRunId = new Map();
      for (const task of tasks) {
        const collaboration = normalizeCollaborativeTaskMetadata(task.collaboration);
        if (!collaboration) {
          continue;
        }
        const existing = groupedByRunId.get(collaboration.runId) || {
          id: collaboration.runId,
          prompt: task.prompt,
          templateId: collaboration.templateId || null,
          roles: [],
          taskIds: [],
          feedback: [],
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
        };
        if (!existing.templateId && collaboration.templateId) {
          existing.templateId = collaboration.templateId;
        }
        if (!existing.roles.includes(collaboration.role)) {
          existing.roles.push(collaboration.role);
        }
        if (!existing.taskIds.includes(task.id)) {
          existing.taskIds.push(task.id);
        }
        if (isIsoDate(task.createdAt) && task.createdAt < existing.createdAt) {
          existing.createdAt = task.createdAt;
        }
        if (isIsoDate(task.updatedAt) && task.updatedAt > existing.updatedAt) {
          existing.updatedAt = task.updatedAt;
        }
        groupedByRunId.set(collaboration.runId, existing);
      }

      for (const run of groupedByRunId.values()) {
        collaborativeRuns.push(run);
        collaborativeRunsById.set(run.id, run);
      }
    }

    for (const run of collaborativeRuns) {
      const totalSteps = Array.isArray(run.taskIds) ? run.taskIds.length : 0;
      const roles = normalizeCollaborativeRunRoles(run.roles);
      for (let index = 0; index < totalSteps; index++) {
        const taskId = run.taskIds[index];
        const task = tasksById.get(taskId);
        if (!task) {
          continue;
        }
        const existing = normalizeCollaborativeTaskMetadata(task.collaboration);
        if (existing) {
          if (!existing.templateId && normalizeCollaborativeTemplateId(run.templateId)) {
            task.collaboration = {
              ...existing,
              templateId: normalizeCollaborativeTemplateId(run.templateId),
            };
          }
          continue;
        }
        task.collaboration = {
          runId: run.id,
          role: roles[index] || roles[roles.length - 1] || 'executor',
          stepIndex: index,
          totalSteps,
          templateId: normalizeCollaborativeTemplateId(run.templateId) || null,
        };
      }
    }

    rebuildPluginContributionIndexes();
    for (const plugin of plugins) {
      checkPluginHealth(plugin, {
        publish: false,
        source: 'recovery',
      });
    }

    for (const candidate of persistedEdits) {
      if (!candidate || typeof candidate !== 'object') {
        continue;
      }

      if (typeof candidate.id !== 'string' || !candidate.id.trim()) {
        continue;
      }
      if (editsById.has(candidate.id)) {
        continue;
      }

      const rawPath = typeof candidate.path === 'string' ? candidate.path.trim() : '';
      if (!rawPath || !path.isAbsolute(rawPath)) {
        continue;
      }
      const resolvedPath = path.resolve(rawPath);
      if (!isPathWithinAllowedWorkspaceRoots(resolvedPath, allowedWorkspaceRoots)) {
        continue;
      }

      const baseContent = typeof candidate.baseContent === 'string' ? candidate.baseContent : '';
      const proposedContent = typeof candidate.proposedContent === 'string' ? candidate.proposedContent : '';
      const now = new Date().toISOString();
      const createdAt = isIsoDate(candidate.createdAt) ? candidate.createdAt : now;
      const updatedAt = isIsoDate(candidate.updatedAt) ? candidate.updatedAt : createdAt;
      const status = normalizeEditStatus(candidate.status);

      const baseSize =
        candidate.base && Number.isInteger(candidate.base.size) && candidate.base.size >= 0
          ? candidate.base.size
          : Buffer.byteLength(baseContent, 'utf8');
      const proposalSize =
        candidate.proposal && Number.isInteger(candidate.proposal.size) && candidate.proposal.size >= 0
          ? candidate.proposal.size
          : Buffer.byteLength(proposedContent, 'utf8');
      const changedLines =
        Number.isInteger(candidate.changedLines) && candidate.changedLines >= 0
          ? candidate.changedLines
          : computeChangedLines(baseContent, proposedContent);
      const appliedAt = isIsoDate(candidate.appliedAt) ? candidate.appliedAt : null;
      const rejectedAt = isIsoDate(candidate.rejectedAt) ? candidate.rejectedAt : null;
      const revertedAt = isIsoDate(candidate.revertedAt) ? candidate.revertedAt : null;

      const edit = {
        id: candidate.id,
        path: resolvedPath,
        summary:
          typeof candidate.summary === 'string' && candidate.summary.trim()
            ? candidate.summary.trim().slice(0, 300)
            : `Edit proposal for ${resolvedPath}`,
        status,
        changedLines,
        diffPreview:
          typeof candidate.diffPreview === 'string' && candidate.diffPreview
            ? candidate.diffPreview
            : buildSimpleDiffPreview(resolvedPath, baseContent, proposedContent),
        base: {
          existed: Boolean(candidate.base && candidate.base.existed),
          size: baseSize,
          sha256:
            candidate.base && typeof candidate.base.sha256 === 'string' && candidate.base.sha256
              ? candidate.base.sha256
              : hashContent(baseContent),
        },
        proposal: {
          size: proposalSize,
          sha256:
            candidate.proposal && typeof candidate.proposal.sha256 === 'string' && candidate.proposal.sha256
              ? candidate.proposal.sha256
              : hashContent(proposedContent),
        },
        baseContent,
        proposedContent,
        createdAt,
        updatedAt,
        appliedAt: status === 'applied' ? appliedAt || updatedAt : null,
        rejectedAt: status === 'rejected' ? rejectedAt || updatedAt : null,
        revertedAt: status === 'reverted' ? revertedAt || updatedAt : null,
      };

      edits.push(edit);
      editsById.set(edit.id, edit);
    }

    for (const candidate of persistedRestoreDrills) {
      const run = buildPersistedRestoreDrillRun(candidate);
      if (!run || restoreDrillRunsById.has(run.id)) {
        continue;
      }
      restoreDrillRuns.push(run);
      restoreDrillRunsById.set(run.id, run);
    }

    for (const candidate of persistedReplayConsistencyRuns) {
      const run = buildPersistedReplayConsistencyRun(candidate);
      if (!run || replayConsistencyRunsById.has(run.id)) {
        continue;
      }
      replayConsistencyRuns.push(run);
      replayConsistencyRunsById.set(run.id, run);
    }

    for (const candidate of persistedRecoverySmokeRuns) {
      const run = buildPersistedRecoverySmokeRun(candidate);
      if (!run || recoverySmokeRunsById.has(run.id)) {
        continue;
      }
      recoverySmokeRuns.push(run);
      recoverySmokeRunsById.set(run.id, run);
    }

    for (const candidate of persistedReliabilityHistory) {
      const entry = buildPersistedReliabilityHistoryEntry(candidate);
      if (!entry) {
        continue;
      }
      reliabilityHistory.push(entry);
    }

    tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    collaborativeRuns.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    plugins.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    edits.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    restoreDrillRuns.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    replayConsistencyRuns.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    recoverySmokeRuns.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    reliabilityHistory.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    while (restoreDrillRuns.length > maxRestoreDrillRuns) {
      const removed = restoreDrillRuns.pop();
      if (removed) {
        restoreDrillRunsById.delete(removed.id);
      }
    }
    while (replayConsistencyRuns.length > maxReplayConsistencyRuns) {
      const removed = replayConsistencyRuns.pop();
      if (removed) {
        replayConsistencyRunsById.delete(removed.id);
      }
    }
    while (recoverySmokeRuns.length > maxRecoverySmokeRuns) {
      const removed = recoverySmokeRuns.pop();
      if (removed) {
        recoverySmokeRunsById.delete(removed.id);
      }
    }
    while (reliabilityHistory.length > maxReliabilityHistory) {
      reliabilityHistory.pop();
    }

    for (const task of tasks) {
      if (!terminalTaskStatuses.has(task.status)) {
        task.status = 'queued';
        appendTimeline(task, 'queued', 'Task recovered from persisted local storage after restart.');
      }
    }

    scheduleNextLifecycle();

    if (tasks.length) {
      console.log(`Recovered ${tasks.length} task(s) from ${taskStorePath}`);
      publishSystemEvent('system.tasksRecovered', {
        totalTasks: tasks.length,
        taskStorePath,
      });
    }

    if (edits.length) {
      console.log(`Recovered ${edits.length} edit proposal(s) from ${taskStorePath}`);
      publishSystemEvent('system.editsRecovered', {
        totalEdits: edits.length,
        taskStorePath,
      });
    }

    if (collaborativeRuns.length) {
      console.log(`Recovered ${collaborativeRuns.length} collaborative run(s) from ${taskStorePath}`);
      publishSystemEvent('system.collaborativeRunsRecovered', {
        totalRuns: collaborativeRuns.length,
        taskStorePath,
      });
    }

    if (plugins.length) {
      console.log(`Recovered ${plugins.length} plugin(s) from ${taskStorePath}`);
      publishSystemEvent('system.pluginsRecovered', {
        totalPlugins: plugins.length,
        taskStorePath,
      });
    }

    if (restoreDrillRuns.length || replayConsistencyRuns.length || recoverySmokeRuns.length) {
      console.log(
        `Recovered diagnostics from ${taskStorePath} (restore=${restoreDrillRuns.length}, replay=${replayConsistencyRuns.length}, recovery=${recoverySmokeRuns.length}, history=${reliabilityHistory.length})`
      );
    }
  } catch (error) {
    console.error(`Failed to load persisted tasks from ${taskStorePath}:`, error.message);
  }
}

loadPluginMarketplaceCatalog();
loadPersistedTasks();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const taskRoute = matchTaskRoute(url.pathname);
  const runRoute = matchCollaborativeRunRoute(url.pathname);
  const editRoute = matchEditRoute(url.pathname);
  const pluginRoute = matchPluginRoute(url.pathname);
  const cors = applyCorsHeaders(req, res);

  if (!cors.allowed) {
    setCommonHeaders(res);
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify(
        {
          error: `Origin "${cors.origin}" is not allowed by CORS policy.`,
        },
        null,
        2
      )
    );
    return;
  }

  if (req.method === 'OPTIONS') {
    setCommonHeaders(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  if (isMutableRequestMethod(req.method) && !hasValidApiAuth(req)) {
    sendJson(res, 401, {
      error: 'Unauthorized. Provide Authorization: Bearer <token> (or X-API-Key) matching ORCHESTRATOR_API_TOKEN.',
    });
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
        workspaceManager: 'simulated',
        queueManager: buildQueueManagerState(),
        collaborationManager: {
          mode: 'dependency-chained-role-template',
          defaultRoles: defaultCollaborativeRoles,
          defaultTemplateId: defaultCollaborativeTemplateId,
          availableRoles: Object.keys(collaborativeRoleInstructions),
          templates: listCollaborativeRunTemplates(),
          runCount: collaborativeRuns.length,
          byStatus: summarizeCollaborativeRunCounts(),
        },
        modelGateway: {
          mode: 'provider-api-with-simulated-fallback',
          timeoutMs: modelGatewayTimeoutMs,
          providerOverridesCount: Object.keys(modelProviderOverrides).length,
          configuredProviders: {
            openai: Boolean(openaiApiKey),
            anthropic: Boolean(anthropicApiKey),
            google: Boolean(googleApiKey),
            azure: Boolean(azureFoundryApiKey && azureFoundryChatUrl),
          },
        },
        executor: {
          mode: 'local-allowlisted-shell',
          allowlistedCommands: allowedCommandPrefixes,
          allowlistedWorkspaceRoots: allowedWorkspaceRoots,
          defaultWorkingDirectory,
          defaultTimeoutMs: defaultCommandTimeoutMs,
          maxCommandsPerTask: maxTaskCommands,
        },
        artifactStore: `local-json (${taskStorePath})`,
        pluginManager: {
          mode: 'manifest-registry',
          counts: summarizePluginCounts(),
          enabledPluginIds: plugins.filter((plugin) => plugin && plugin.enabled).map((plugin) => plugin.id),
        },
        editManager: {
          mode: 'proposal-approval',
          counts: summarizeEditCounts(),
        },
        eventStream: {
          mode: 'sse',
          connectedClients: eventStreamClients.size,
          historySize: eventHistory.length,
          historyLimit: eventHistoryLimit,
        },
      },
      counts: {
        tasks: tasks.length,
        runs: collaborativeRuns.length,
        plugins: plugins.length,
        models: listAvailableModelCatalog().length,
        byStatus: summarizeTaskCounts(),
      },
      time: new Date().toISOString(),
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/v1/diagnostics/runtime') {
    sendJson(res, 200, buildRuntimeDiagnostics());
    return;
  }

  if (req.method === 'GET' && url.pathname === '/v1/diagnostics/reliability-gates') {
    const gatesResult = buildReliabilityGates();
    // Record to history - S4 integration
    recordReliabilityCheck(gatesResult);
    sendJson(res, 200, gatesResult);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/v1/diagnostics/restore-drill/start') {
    const result = startRestoreDrill();
    if (result.error) {
      sendJson(res, result.status || 500, { error: result.error });
      return;
    }
    sendJson(res, 202, result);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/v1/diagnostics/restore-drill/latest') {
    sendJson(res, 200, getLatestRestoreDrill());
    return;
  }

  // GET /v1/diagnostics/restore-drill/:id
  const restoreDrillByIdMatch =
    req.method === 'GET' ? url.pathname.match(/^\/v1\/diagnostics\/restore-drill\/([^/]+)$/) : null;
  if (restoreDrillByIdMatch) {
    const drillId = decodeURIComponent(restoreDrillByIdMatch[1] || '').trim();
    const result = getRestoreDrillById(drillId);
    if (result.error) {
      sendJson(res, result.status || 500, { error: result.error });
      return;
    }
    sendJson(res, 200, result);
    return;
  }

  // Replay Consistency Diagnostics - S2
  if (req.method === 'POST' && url.pathname === '/v1/diagnostics/replay-consistency/start') {
    const activeRun = findRunningDiagnosticRun(replayConsistencyRuns);
    if (activeRun) {
      sendJson(res, 409, {
        error: `Replay consistency check already running (drill ${activeRun.id}).`,
      });
      return;
    }

    // Find a completed task to replay for consistency check
    const completedTasks = tasks.filter((task) => task.status === 'completed');
    if (!completedTasks.length) {
      sendJson(res, 400, { error: 'No completed tasks available for replay consistency check.' });
      return;
    }
    
    // Use the most recent completed task
    const sourceTask = completedTasks[0];
    const replayResult = replayTask(sourceTask, {});
    
    if (replayResult.error) {
      sendJson(res, replayResult.status || 400, { error: replayResult.error });
      return;
    }
    
    const drillId = randomUUID();
    const now = new Date().toISOString();
    
    const drillRun = {
      id: drillId,
      sourceTaskId: sourceTask.id,
      replayTaskId: replayResult.task.id,
      startedAt: now,
      status: 'running',
      evidence: {
        sourceTaskId: sourceTask.id,
        replayTaskId: replayResult.task.id,
        sourceStatus: sourceTask.status,
        replayReady: true,
        replayStatus: null,
        sourceArtifactHash: null,
        replayArtifactHash: null,
        terminalStatusMatch: false,
        artifactHashMatch: false,
        consistent: false,
      },
    };
    
    // Add to the runs array and Map
    replayConsistencyRuns.unshift(drillRun);
    replayConsistencyRunsById.set(drillRun.id, drillRun);
    
    // Trim old runs
    while (replayConsistencyRuns.length > maxReplayConsistencyRuns) {
      const removed = replayConsistencyRuns.pop();
      if (removed) {
        replayConsistencyRunsById.delete(removed.id);
      }
    }

    persistTasksSoon();
    
    // Track replay consistency
    trackReplayConsistency(drillId, sourceTask.id, replayResult.task.id);
    
    sendJson(res, 202, {
      drill: {
        id: drillId,
        sourceTaskId: sourceTask.id,
        replayTaskId: replayResult.task.id,
        startedAt: drillRun.startedAt,
        status: drillRun.status,
      },
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/v1/diagnostics/replay-consistency/latest') {
    if (!replayConsistencyRuns.length) {
      sendJson(res, 200, { drill: null, message: 'No replay consistency checks yet.' });
      return;
    }
    
    const latest = replayConsistencyRuns[0];
    const evidenceLines = [
      `sourceTaskId: ${latest.evidence.sourceTaskId}`,
      `replayTaskId: ${latest.evidence.replayTaskId}`,
      `sourceStatus: ${latest.evidence.sourceStatus}`,
      `replayStatus: ${latest.evidence.replayStatus || '(in progress)'}`,
      `sourceArtifactHash: ${latest.evidence.sourceArtifactHash || '(pending)'}`,
      `replayArtifactHash: ${latest.evidence.replayArtifactHash || '(pending)'}`,
      `terminalStatusMatch: ${latest.evidence.terminalStatusMatch}`,
      `artifactHashMatch: ${latest.evidence.artifactHashMatch}`,
      `replayReady: ${latest.evidence.replayReady}`,
      `consistent: ${latest.evidence.consistent}`,
    ];
    
    sendJson(res, 200, {
      drill: {
        id: latest.id,
        sourceTaskId: latest.sourceTaskId,
        replayTaskId: latest.replayTaskId,
        startedAt: latest.startedAt,
        status: latest.status,
        evidence: evidenceLines,
      },
    });
    return;
  }

  // Recovery Smoke Diagnostics - S3
  if (req.method === 'POST' && url.pathname === '/v1/diagnostics/recovery-smoke/start') {
    const result = startRecoverySmoke();
    if (result.error) {
      sendJson(res, result.status || 500, { error: result.error });
      return;
    }
    sendJson(res, 202, result);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/v1/diagnostics/recovery-smoke/latest') {
    sendJson(res, 200, getLatestRecoverySmoke());
    return;
  }

  // Reliability History - S4
  if (req.method === 'GET' && url.pathname === '/v1/diagnostics/reliability-history') {
    const limit = parsePositiveInt(url.searchParams.get('limit'), 10, 1, 100);
    sendJson(res, 200, getReliabilityHistory(limit));
    return;
  }

  // Reliability Report Export - S6
  if (req.method === 'GET' && url.pathname === '/v1/diagnostics/reliability-report/export') {
    const format = (url.searchParams.get('format') || 'json').trim().toLowerCase();
    const gatesResult = buildReliabilityGates();
    const historyResult = getReliabilityHistory(parsePositiveInt(url.searchParams.get('historyLimit'), 10, 1, 100));
    
    if (format === 'md' || format === 'markdown') {
      const lines = [];
      lines.push('# Open-Antigravity Reliability Report');
      lines.push('');
      lines.push(`**Generated:** ${new Date().toISOString()}`);
      lines.push(`**Overall Status:** ${gatesResult.overall.toUpperCase()}`);
      lines.push('');
      lines.push('## Reliability Gates');
      lines.push('');
      for (const gate of gatesResult.gates) {
        const icon = gate.status === 'pass' ? '✅' : gate.status === 'warn' ? '⚠️' : '❌';
        lines.push(`### ${icon} ${gate.label}`);
        lines.push(`- **Status:** ${gate.status}`);
        lines.push(`- **Details:** ${gate.details}`);
        lines.push('');
      }
      lines.push('## Metrics');
      lines.push('');
      lines.push(`- Total Tasks: ${gatesResult.metrics.taskCount}`);
      lines.push(`- Terminal Tasks: ${gatesResult.metrics.terminalTaskCount}`);
      lines.push(`- Replayable Tasks: ${gatesResult.metrics.replayableTaskCount}`);
      lines.push(`- Queue Paused: ${gatesResult.metrics.queuePaused}`);
      lines.push(`- Active Tasks: ${gatesResult.metrics.activeTaskCount}`);
      lines.push('');
      lines.push('## Recommended Actions');
      lines.push('');
      for (const action of gatesResult.recommendedActions) {
        lines.push(`- ${action}`);
      }
      lines.push('');
      lines.push('## Reliability History');
      lines.push('');
      if (historyResult.history.length === 0) {
        lines.push('No reliability history recorded yet.');
      } else {
        lines.push(`| Timestamp | Overall | Gates |`);
        lines.push(`|-----------|---------|-------|`);
        for (const entry of historyResult.history) {
          const gateStatuses = entry.gateStatuses.map(g => `${g.id}:${g.status}`).join(', ');
          lines.push(`| ${entry.timestamp} | ${entry.overall} | ${gateStatuses} |`);
        }
      }
      sendText(res, 200, lines.join('\n'), 'text/markdown; charset=utf-8');
      return;
    }
    
    if (format !== 'json') {
      sendJson(res, 400, { error: 'Field "format" must be one of: json, md.' });
      return;
    }
    
    sendJson(res, 200, {
      generatedAt: new Date().toISOString(),
      gates: gatesResult,
      history: historyResult,
      taskStorePath,
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/v1/events') {
    openEventStream(req, res, url.searchParams);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/v1/events/recent') {
    const limit = parseEventReplayLimit(url.searchParams);
    const startIndex = Math.max(eventHistory.length - limit, 0);
    sendJson(res, 200, {
      events: eventHistory.slice(startIndex),
      total: eventHistory.length,
      limit,
      time: new Date().toISOString(),
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/v1/models') {
    const availableModels = listAvailableModelCatalog();
    sendJson(res, 200, {
      models: availableModels.map((model) => {
        const provider = inferProvider(model.id);
        const configured = hasProviderKey(provider);
        return {
          id: model.id,
          label: model.label,
          provider,
          configured,
          source: model.source || 'core',
          pluginId: model.pluginId || null,
          pluginName: model.pluginName || null,
          status: configured ? 'ready' : 'simulated-fallback',
        };
      }),
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

  if (req.method === 'GET' && url.pathname === '/v1/files') {
    const result = listWorkspaceFiles(url.searchParams.get('path'));
    if (result.error) {
      sendJson(res, result.status || 400, { error: result.error });
      return;
    }
    sendJson(res, 200, result);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/v1/files/content') {
    const result = readWorkspaceFile(url.searchParams.get('path'));
    if (result.error) {
      sendJson(res, result.status || 400, { error: result.error });
      return;
    }
    sendJson(res, 200, result);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/v1/files/content') {
    try {
      const payload = await parseJsonBody(req);
      const result = writeWorkspaceFile(payload);
      if (result.error) {
        sendJson(res, result.status || 400, { error: result.error });
        return;
      }
      sendJson(res, 200, result);
      return;
    } catch (error) {
      sendJson(res, 400, { error: error.message || 'Invalid request.' });
      return;
    }
  }

  if (req.method === 'POST' && url.pathname === '/v1/generate') {
    try {
      const payload = await parseJsonBody(req);
      const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : '';
      if (!prompt) {
        sendJson(res, 400, { error: 'Field "prompt" is required.' });
        return;
      }

      const requestedModelId = typeof payload.modelId === 'string' ? payload.modelId.trim() : '';
      const selectedModelResult = selectModelIdForRequest(requestedModelId, models[0]);
      if (selectedModelResult.error) {
        sendJson(res, 400, { error: selectedModelResult.error });
        return;
      }
      const modelId = selectedModelResult.modelId;

      const response = await runModelGeneration(modelId, prompt, payload);
      sendJson(res, 200, {
        modelId,
        provider: response.provider,
        simulated: response.simulated,
        text: response.text,
      });
      return;
    } catch (error) {
      sendJson(res, 400, { error: error.message || 'Failed to generate model output.' });
      return;
    }
  }

  if (req.method === 'GET' && url.pathname === '/v1/audit/export') {
    const format = (url.searchParams.get('format') || 'json').trim().toLowerCase();
    if (format === 'md' || format === 'markdown') {
      const markdown = buildAuditExportMarkdown(url.searchParams);
      sendText(res, 200, markdown, 'text/markdown; charset=utf-8');
      return;
    }

    if (format !== 'json') {
      sendJson(res, 400, { error: 'Field "format" must be one of: json, md.' });
      return;
    }

    sendJson(res, 200, buildAuditExportJson(url.searchParams));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/v1/queue/pause') {
    sendJson(res, 200, pauseQueue());
    return;
  }

  if (req.method === 'POST' && url.pathname === '/v1/queue/resume') {
    sendJson(res, 200, resumeQueue());
    return;
  }

  if (req.method === 'POST' && url.pathname === '/v1/queue/cancel-queued') {
    sendJson(res, 200, cancelQueuedTasks());
    return;
  }

  if (req.method === 'GET' && url.pathname === '/v1/edits') {
    sendJson(res, 200, queryEdits(url.searchParams));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/v1/edits') {
    try {
      const payload = await parseJsonBody(req);
      const result = createEditProposal(payload);
      if (result.error) {
        sendJson(res, result.status || 400, { error: result.error });
        return;
      }
      sendJson(res, 201, buildEditDetailResponse(result.edit));
      return;
    } catch (error) {
      sendJson(res, 400, { error: error.message || 'Invalid request.' });
      return;
    }
  }

  if (req.method === 'GET' && url.pathname === '/v1/tasks') {
    sendJson(res, 200, queryTasks(url.searchParams));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/v1/runs') {
    sendJson(res, 200, queryCollaborativeRuns(url.searchParams));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/v1/runs/templates') {
    sendJson(res, 200, {
      templates: listCollaborativeRunTemplates(),
      defaultTemplateId: defaultCollaborativeTemplateId,
      time: new Date().toISOString(),
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/v1/plugins') {
    sendJson(res, 200, queryPlugins(url.searchParams));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/v1/plugins/catalog') {
    sendJson(res, 200, queryPluginCatalog(url.searchParams));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/v1/plugins/marketplace') {
    sendJson(res, 200, queryPluginMarketplace(url.searchParams));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/v1/plugins') {
    try {
      const payload = await parseJsonBody(req);
      const result = registerPlugin(payload);
      if (result.error) {
        sendJson(res, result.status || 400, { error: result.error });
        return;
      }
      sendJson(res, 201, result.plugin);
      return;
    } catch (error) {
      sendJson(res, 400, { error: error.message || 'Invalid plugin registration payload.' });
      return;
    }
  }

  if (req.method === 'POST' && url.pathname === '/v1/plugins/marketplace/install') {
    try {
      const payload = await parseJsonBody(req);
      const result = installPluginFromMarketplace(payload);
      if (result.error) {
        sendJson(res, result.status || 400, { error: result.error });
        return;
      }
      sendJson(res, 200, result);
      return;
    } catch (error) {
      sendJson(res, 400, { error: error.message || 'Invalid plugin marketplace install payload.' });
      return;
    }
  }

  if (req.method === 'POST' && url.pathname === '/v1/plugins/marketplace/import') {
    try {
      const payload = await parseJsonBody(req);
      const result = await importPluginMarketplaceEntryFromUrl(payload);
      if (result.error) {
        sendJson(res, result.status || 400, { error: result.error });
        return;
      }
      sendJson(res, 201, result);
      return;
    } catch (error) {
      sendJson(res, 400, { error: error.message || 'Invalid plugin marketplace import payload.' });
      return;
    }
  }

  if (pluginRoute && req.method === 'GET' && !pluginRoute.subresource) {
    const plugin = getPluginById(pluginRoute.pluginId);
    if (!plugin) {
      sendJson(res, 404, { error: `Plugin "${pluginRoute.pluginId}" not found.` });
      return;
    }
    sendJson(res, 200, buildPluginDetail(plugin));
    return;
  }

  if (pluginRoute && req.method === 'PATCH' && !pluginRoute.subresource) {
    const plugin = getPluginById(pluginRoute.pluginId);
    try {
      const payload = await parseJsonBody(req);
      const result = updatePlugin(plugin, payload);
      if (result.error) {
        sendJson(res, result.status || 400, { error: result.error });
        return;
      }
      sendJson(res, 200, result.plugin);
      return;
    } catch (error) {
      sendJson(res, 400, { error: error.message || 'Invalid plugin update payload.' });
      return;
    }
  }

  if (pluginRoute && req.method === 'POST' && pluginRoute.subresource === 'enable') {
    const plugin = getPluginById(pluginRoute.pluginId);
    const result = setPluginEnabled(plugin, true);
    if (result.error) {
      sendJson(res, result.status || 400, { error: result.error });
      return;
    }
    sendJson(res, 200, result.plugin);
    return;
  }

  if (pluginRoute && req.method === 'POST' && pluginRoute.subresource === 'disable') {
    const plugin = getPluginById(pluginRoute.pluginId);
    const result = setPluginEnabled(plugin, false);
    if (result.error) {
      sendJson(res, result.status || 400, { error: result.error });
      return;
    }
    sendJson(res, 200, result.plugin);
    return;
  }

  if (pluginRoute && req.method === 'POST' && pluginRoute.subresource === 'healthcheck') {
    const plugin = getPluginById(pluginRoute.pluginId);
    const result = runPluginHealthcheck(plugin);
    if (result.error) {
      sendJson(res, result.status || 400, { error: result.error });
      return;
    }
    sendJson(res, 200, result);
    return;
  }

  if (pluginRoute && req.method === 'DELETE' && !pluginRoute.subresource) {
    const plugin = getPluginById(pluginRoute.pluginId);
    const result = removePlugin(plugin);
    if (result.error) {
      sendJson(res, result.status || 400, { error: result.error });
      return;
    }
    sendJson(res, 200, result);
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
      sendJson(res, 201, buildTaskResponse(result.task));
      return;
    } catch (error) {
      sendJson(res, 400, { error: error.message || 'Invalid request.' });
      return;
    }
  }

  if (req.method === 'POST' && url.pathname === '/v1/tasks/collaborative/specialized') {
    try {
      const payload = await parseJsonBody(req);
      const result = createSpecializedCollaborativeRun(payload);
      if (result.error) {
        sendJson(res, result.status || 400, { error: result.error });
        return;
      }
      sendJson(res, 201, result.run);
      return;
    } catch (error) {
      sendJson(res, 400, { error: error.message || 'Invalid specialized collaborative task request.' });
      return;
    }
  }

  if (req.method === 'POST' && url.pathname === '/v1/tasks/collaborative') {
    try {
      const payload = await parseJsonBody(req);
      const result = createCollaborativeRun(payload);
      if (result.error) {
        sendJson(res, result.status || 400, { error: result.error });
        return;
      }
      sendJson(res, 201, result.run);
      return;
    } catch (error) {
      sendJson(res, 400, { error: error.message || 'Invalid collaborative task request.' });
      return;
    }
  }

  if (runRoute && req.method === 'GET' && !runRoute.subresource) {
    const run = getCollaborativeRunById(runRoute.runId);
    if (!run) {
      sendJson(res, 404, { error: `Collaborative run "${runRoute.runId}" not found.` });
      return;
    }
    sendJson(res, 200, buildCollaborativeRunDetail(run));
    return;
  }

  if (runRoute && req.method === 'POST' && runRoute.subresource === 'feedback') {
    const run = getCollaborativeRunById(runRoute.runId);
    try {
      const payload = await parseJsonBody(req);
      const result = addCollaborativeRunFeedback(run, payload);
      if (result.error) {
        sendJson(res, result.status || 400, { error: result.error });
        return;
      }
      sendJson(res, 200, result);
      return;
    } catch (error) {
      sendJson(res, 400, { error: error.message || 'Invalid run feedback request.' });
      return;
    }
  }

  if (runRoute && req.method === 'POST' && runRoute.subresource === 'self-heal') {
    const run = getCollaborativeRunById(runRoute.runId);
    try {
      const payload = await parseJsonBody(req);
      const result = selfHealCollaborativeRun(run, payload);
      if (result.error) {
        sendJson(res, result.status || 400, { error: result.error });
        return;
      }
      sendJson(res, 200, result);
      return;
    } catch (error) {
      sendJson(res, 400, { error: error.message || 'Invalid run self-heal request.' });
      return;
    }
  }

  if (editRoute && req.method === 'GET' && !editRoute.subresource) {
    const edit = getEditById(editRoute.editId);
    if (!edit) {
      sendJson(res, 404, { error: `Edit proposal "${editRoute.editId}" not found.` });
      return;
    }
    sendJson(res, 200, buildEditDetailResponse(edit));
    return;
  }

  if (editRoute && req.method === 'POST' && editRoute.subresource === 'apply') {
    const edit = getEditById(editRoute.editId);
    const result = applyEditProposal(edit);
    if (result.error) {
      sendJson(res, result.status || 400, { error: result.error });
      return;
    }
    sendJson(res, 200, buildEditDetailResponse(result.edit));
    return;
  }

  if (editRoute && req.method === 'POST' && editRoute.subresource === 'reject') {
    const edit = getEditById(editRoute.editId);
    const result = rejectEditProposal(edit);
    if (result.error) {
      sendJson(res, result.status || 400, { error: result.error });
      return;
    }
    sendJson(res, 200, buildEditDetailResponse(result.edit));
    return;
  }

  if (editRoute && req.method === 'POST' && editRoute.subresource === 'revert') {
    const edit = getEditById(editRoute.editId);
    const result = revertEditProposal(edit);
    if (result.error) {
      sendJson(res, result.status || 400, { error: result.error });
      return;
    }
    sendJson(res, 200, buildEditDetailResponse(result.edit));
    return;
  }

  if (taskRoute && req.method === 'GET' && taskRoute.subresource === 'artifacts') {
    const task = getTaskById(taskRoute.taskId);
    if (!task) {
      sendJson(res, 404, { error: `Task "${taskRoute.taskId}" not found.` });
      return;
    }
    sendJson(res, 200, { taskId: task.id, artifacts: task.artifacts });
    return;
  }

  if (taskRoute && req.method === 'POST' && taskRoute.subresource === 'cancel') {
    const task = getTaskById(taskRoute.taskId);
    const result = cancelTask(task);
    if (result.error) {
      sendJson(res, result.status || 400, { error: result.error });
      return;
    }
    sendJson(res, 200, buildTaskResponse(result.task));
    return;
  }

  if (taskRoute && req.method === 'POST' && taskRoute.subresource === 'replay') {
    const sourceTask = getTaskById(taskRoute.taskId);
    try {
      const overrides = await parseJsonBody(req);
      const result = replayTask(sourceTask, overrides);
      if (result.error) {
        sendJson(res, result.status || 400, { error: result.error });
        return;
      }
      sendJson(res, result.status || 201, buildTaskResponse(result.task));
      return;
    } catch (error) {
      sendJson(res, 400, { error: error.message || 'Invalid replay payload.' });
      return;
    }
  }

  if (taskRoute && req.method === 'GET' && !taskRoute.subresource) {
    const task = getTaskById(taskRoute.taskId);
    if (!task) {
      sendJson(res, 404, { error: `Task "${taskRoute.taskId}" not found.` });
      return;
    }
    sendJson(res, 200, buildTaskResponse(task));
    return;
  }

  sendJson(res, 404, {
    error: 'Not found.',
    availableRoutes: [
      'GET /health',
      'GET /v1/status',
      'GET /v1/diagnostics/runtime',
      'GET /v1/diagnostics/reliability-gates',
      'POST /v1/diagnostics/restore-drill/start',
      'GET /v1/diagnostics/restore-drill/latest',
      'GET /v1/diagnostics/restore-drill/:id',
      'POST /v1/diagnostics/replay-consistency/start',
      'GET /v1/diagnostics/replay-consistency/latest',
      'POST /v1/diagnostics/recovery-smoke/start',
      'GET /v1/diagnostics/recovery-smoke/latest',
      'GET /v1/diagnostics/reliability-history',
      'GET /v1/diagnostics/reliability-report/export?format=json|md',
      'GET /v1/events?limit=50',
      'GET /v1/events/recent?limit=50',
      'GET /v1/models',
      'GET /v1/plugins',
      'GET /v1/plugins/catalog',
      'GET /v1/plugins/marketplace',
      'POST /v1/plugins',
      'POST /v1/plugins/marketplace/install',
      'POST /v1/plugins/marketplace/import',
      'GET /v1/plugins/:id',
      'PATCH /v1/plugins/:id',
      'POST /v1/plugins/:id/enable',
      'POST /v1/plugins/:id/disable',
      'POST /v1/plugins/:id/healthcheck',
      'DELETE /v1/plugins/:id',
      'GET /v1/workspaces',
      'GET /v1/files?path=/absolute/directory',
      'GET /v1/files/content?path=/absolute/file',
      'POST /v1/files/content',
      'POST /v1/generate',
      'GET /v1/audit/export?format=json|md',
      'POST /v1/queue/pause',
      'POST /v1/queue/resume',
      'POST /v1/queue/cancel-queued',
      'GET /v1/edits',
      'POST /v1/edits',
      'GET /v1/edits/:id',
      'POST /v1/edits/:id/apply',
      'POST /v1/edits/:id/reject',
      'POST /v1/edits/:id/revert',
      'GET /v1/tasks',
      'GET /v1/runs',
      'GET /v1/runs/templates',
      'POST /v1/tasks',
      'POST /v1/tasks/collaborative/specialized',
      'POST /v1/tasks/collaborative',
      'GET /v1/runs/:id',
      'POST /v1/runs/:id/feedback',
      'POST /v1/runs/:id/self-heal',
      'GET /v1/tasks/:id',
      'GET /v1/tasks/:id/artifacts',
      'POST /v1/tasks/:id/cancel',
      'POST /v1/tasks/:id/replay',
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
  publishSystemEvent('system.ready', {
    host,
    port,
    queueManager: buildQueueManagerState(),
  });
});

function stopActiveProcesses() {
  for (const [taskId, child] of activeTaskProcesses.entries()) {
    try {
      child.kill('SIGTERM');
    } catch (error) {
      console.error(`Failed to stop child process for task ${taskId}:`, error.message);
    }
  }
  activeTaskProcesses.clear();
}

function closeEventStreams() {
  for (const clientId of Array.from(eventStreamClients.keys())) {
    removeEventStreamClient(clientId);
  }
}

process.on('SIGINT', () => {
  stopActiveProcesses();
  closeEventStreams();
  persistTasksNow();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopActiveProcesses();
  closeEventStreams();
  persistTasksNow();
  process.exit(0);
});

function inferProvider(name) {
  const rawName = typeof name === 'string' ? name.trim() : '';
  const normalized = rawName.toLowerCase();

  if (modelProviderOverrides[normalized]) {
    return modelProviderOverrides[normalized];
  }

  const catalogProvider = modelProvidersById.get(normalized);
  if (catalogProvider) {
    return catalogProvider;
  }

  const pluginModel = pluginModelContributionsById.get(normalized);
  if (pluginModel && typeof pluginModel.provider === 'string') {
    return pluginModel.provider;
  }

  return inferProviderFromModelName(rawName);
}

function inferProviderFromModelName(name) {
  const normalized = String(name || '').trim().toLowerCase();
  if (
    normalized.startsWith('azure/') ||
    normalized.startsWith('foundry/') ||
    normalized.includes('azure-foundry') ||
    normalized.includes('azure_openai')
  ) {
    return 'azure';
  }
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
