const statusEl = document.querySelector('#status');
const tasksEl = document.querySelector('#tasks');
const timelineEl = document.querySelector('#timeline');
const artifactsEl = document.querySelector('#artifacts');
const eventsEl = document.querySelector('#events');
const selectedTaskLabelEl = document.querySelector('#selected-task-label');
const taskForm = document.querySelector('#task-form');
const taskPrompt = document.querySelector('#task-prompt');
const taskCommands = document.querySelector('#task-commands');
const taskWorkingDirectory = document.querySelector('#task-working-directory');
const taskModel = document.querySelector('#task-model');
const taskPriority = document.querySelector('#task-priority');
const taskDependsOn = document.querySelector('#task-depends-on');
const collabPromptInput = document.querySelector('#collab-prompt');
const collabRolesInput = document.querySelector('#collab-roles');
const collabTemplateSelect = document.querySelector('#collab-template');
const queueCollabBtn = document.querySelector('#queue-collab-btn');
const queueSpecializedCollabBtn = document.querySelector('#queue-specialized-collab-btn');
const collabOutput = document.querySelector('#collab-output');
const collabRunsEl = document.querySelector('#collab-runs');
const collabRunOutput = document.querySelector('#collab-run-output');
const collabFeedbackInput = document.querySelector('#collab-feedback');
const sendRunFeedbackBtn = document.querySelector('#send-run-feedback-btn');
const selfHealRunBtn = document.querySelector('#self-heal-run-btn');
const pluginManifestInput = document.querySelector('#plugin-manifest');
const registerPluginBtn = document.querySelector('#register-plugin-btn');
const refreshPluginsBtn = document.querySelector('#refresh-plugins-btn');
const pluginListEl = document.querySelector('#plugin-list');
const updatePluginBtn = document.querySelector('#update-plugin-btn');
const healthcheckPluginBtn = document.querySelector('#healthcheck-plugin-btn');
const enablePluginBtn = document.querySelector('#enable-plugin-btn');
const disablePluginBtn = document.querySelector('#disable-plugin-btn');
const removePluginBtn = document.querySelector('#remove-plugin-btn');
const pluginOutput = document.querySelector('#plugin-output');
const pluginMarketplaceQueryInput = document.querySelector('#plugin-marketplace-query');
const pluginMarketplaceImportUrlInput = document.querySelector('#plugin-marketplace-import-url');
const pluginMarketplaceUpdateExistingInput = document.querySelector('#plugin-marketplace-update-existing');
const refreshPluginMarketplaceBtn = document.querySelector('#refresh-plugin-marketplace-btn');
const importPluginMarketplaceBtn = document.querySelector('#import-plugin-marketplace-btn');
const installMarketplacePluginBtn = document.querySelector('#install-marketplace-plugin-btn');
const pluginMarketplaceListEl = document.querySelector('#plugin-marketplace-list');
const pluginMarketplaceOutput = document.querySelector('#plugin-marketplace-output');
const modelTestPrompt = document.querySelector('#model-test-prompt');
const modelTestBtn = document.querySelector('#model-test-btn');
const modelTestOutput = document.querySelector('#model-test-output');
const auditJsonBtn = document.querySelector('#audit-json-btn');
const auditMdBtn = document.querySelector('#audit-md-btn');
const auditOutput = document.querySelector('#audit-output');
const workspacePathInput = document.querySelector('#workspace-path');
const workspaceListBtn = document.querySelector('#workspace-list-btn');
const workspaceReadBtn = document.querySelector('#workspace-read-btn');
const workspaceSaveBtn = document.querySelector('#workspace-save-btn');
const workspaceEditContent = document.querySelector('#workspace-edit-content');
const workspaceEditorHost = document.querySelector('#workspace-editor-host');
const workspaceOutput = document.querySelector('#workspace-output');
const editPathInput = document.querySelector('#edit-path');
const editSummaryInput = document.querySelector('#edit-summary');
const editContentInput = document.querySelector('#edit-content');
const editEditorHost = document.querySelector('#edit-editor-host');
const createEditBtn = document.querySelector('#create-edit-btn');
const refreshEditsBtn = document.querySelector('#refresh-edits-btn');
const applyEditBtn = document.querySelector('#apply-edit-btn');
const revertEditBtn = document.querySelector('#revert-edit-btn');
const rejectEditBtn = document.querySelector('#reject-edit-btn');
const editListEl = document.querySelector('#edit-list');
const editOutput = document.querySelector('#edit-output');
const taskFilterStatus = document.querySelector('#task-filter-status');
const taskFilterQuery = document.querySelector('#task-filter-query');
const refreshBtn = document.querySelector('#refresh-btn');
const pauseQueueBtn = document.querySelector('#pause-queue-btn');
const resumeQueueBtn = document.querySelector('#resume-queue-btn');
const cancelQueuedBtn = document.querySelector('#cancel-queued-btn');
const queueSummaryEl = document.querySelector('#queue-summary');
const queueStatusPillsEl = document.querySelector('#queue-status-pills');
const taskQuickFiltersEl = document.querySelector('#quick-filter-row');
const clearTaskSearchBtn = document.querySelector('#clear-task-search-btn');
const replayTaskBtn = document.querySelector('#replay-task-btn');
const cancelTaskBtn = document.querySelector('#cancel-task-btn');
const clearEventsBtn = document.querySelector('#clear-events-btn');
const sliceTaskListEl = document.querySelector('#slice-task-list');
const queueSliceBatchBtn = document.querySelector('#queue-slice-batch-btn');
const runtimeDiagnosticsBtn = document.querySelector('#runtime-diagnostics-btn');
const runtimeDiagnosticsOutput = document.querySelector('#runtime-diagnostics-output');
const reliabilityGatesBtn = document.querySelector('#reliability-gates-btn');
const reliabilityGatesOutput = document.querySelector('#reliability-gates-output');
const restoreDrillBtn = document.querySelector('#restore-drill-btn');
const restoreDrillOutput = document.querySelector('#restore-drill-output');
const replayConsistencyBtn = document.querySelector('#replay-consistency-btn');
const replayConsistencyOutput = document.querySelector('#replay-consistency-output');
const runAllReliabilityBtn = document.querySelector('#run-all-reliability-btn');
const simpleModeToggle = document.querySelector('#simple-mode-toggle');
const collapseAdvancedBtn = document.querySelector('#collapse-advanced-btn');
const expandPanelsBtn = document.querySelector('#expand-panels-btn');
const modulePanels = Array.from(document.querySelectorAll('.module-panel'));
const advancedModulePanels = modulePanels.filter(
  (panel) => panel && panel.dataset && panel.dataset.advanced === 'true'
);

const monacoVersion = '0.47.0';
const monacoBaseUrl = `https://cdn.jsdelivr.net/npm/monaco-editor@${monacoVersion}/min/vs`;
let monacoInitPromise = null;
let workspaceCodeEditor = null;
let editProposalCodeEditor = null;

const state = {
  selectedTaskId: null,
  selectedRunId: null,
  selectedPluginId: null,
  selectedMarketplacePluginId: null,
  selectedEditId: null,
  isRefreshing: false,
  pendingEventRefresh: false,
  models: [],
  tasks: [],
  runs: [],
  plugins: [],
  marketplacePlugins: [],
  runTemplates: [],
  edits: [],
  taskFilterStatus: 'all',
  taskFilterQuery: '',
  eventSource: null,
  eventRetryTimer: null,
  simpleMode: true,
};
const simpleModeStorageKey = 'oa_dashboard_simple_mode';

const terminalStatuses = new Set(['completed', 'failed', 'cancelled']);
const taskStatusFilterOptions = new Set(['all', 'queued', 'planning', 'running', 'completed', 'failed', 'cancelled']);
const suggestedSlices = [
  {
    id: 'artifact-persistence',
    title: 'Persist Artifacts',
    prompt: '[slice:artifact-persistence] Persist task and artifact data to local disk with restart recovery.',
  },
  {
    id: 'executor-adapter',
    title: 'Local Executor',
    prompt: '[slice:executor-adapter] Add local command executor adapter with logs and timeout handling.',
  },
  {
    id: 'workspace-guardrails',
    title: 'Workspace Guardrails',
    prompt: '[slice:workspace-guardrails] Add workspace allowlist guardrails for local command execution.',
  },
  {
    id: 'artifact-viewer-upgrade',
    title: 'Artifact Viewer',
    prompt: '[slice:artifact-viewer-upgrade] Improve artifact viewer with per-artifact expand and timestamps.',
  },
  {
    id: 'task-replay',
    title: 'Task Replay',
    prompt: '[slice:task-replay] Add ability to replay a finished task prompt into a new run.',
  },
];

async function readJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with status ${response.status}`);
  }
  return payload;
}

function renderModelOptions(models) {
  const selected = taskModel.value;
  taskModel.innerHTML = '';

  for (const model of models) {
    const option = document.createElement('option');
    option.value = model.id;
    const label = typeof model.label === 'string' && model.label.trim() ? model.label.trim() : model.id;
    const readiness = model.configured ? 'ready' : 'fallback';
    const source = typeof model.source === 'string' ? model.source : 'core';
    const sourceLabel =
      source === 'plugin' && typeof model.pluginName === 'string' && model.pluginName.trim()
        ? `plugin:${model.pluginName.trim()}`
        : source;
    option.textContent = `${label} [${model.id}] (${model.provider}, ${readiness}, ${sourceLabel})`;
    taskModel.appendChild(option);
  }

  if (!models.length) {
    const fallback = document.createElement('option');
    fallback.value = '';
    fallback.textContent = 'No models available';
    taskModel.appendChild(fallback);
    taskModel.disabled = true;
    return;
  }

  taskModel.disabled = false;
  if (selected && models.some((model) => model.id === selected)) {
    taskModel.value = selected;
  } else {
    taskModel.value = models[0].id;
  }
}

function hasSliceTask(sliceId) {
  const marker = `[slice:${sliceId}]`;
  return state.tasks.some((task) => typeof task.prompt === 'string' && task.prompt.includes(marker));
}

async function queueTask(prompt, modelId) {
  return queueTaskWithCommands(prompt, modelId, [], taskWorkingDirectory.value, taskPriority.value, []);
}

function parseCommandsInput(rawValue) {
  if (!rawValue) {
    return [];
  }
  return rawValue
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseDependsOnInput(rawValue) {
  if (!rawValue) {
    return [];
  }

  const ids = rawValue
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return Array.from(new Set(ids));
}

function parseCollaborativeRolesInput(rawValue) {
  if (!rawValue) {
    return [];
  }

  const roles = rawValue
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  return Array.from(new Set(roles));
}

function guessLanguageFromPath(pathValue) {
  const normalized = typeof pathValue === 'string' ? pathValue.trim().toLowerCase() : '';
  if (!normalized) {
    return 'plaintext';
  }
  if (normalized.endsWith('.ts') || normalized.endsWith('.tsx')) {
    return 'typescript';
  }
  if (normalized.endsWith('.js') || normalized.endsWith('.mjs') || normalized.endsWith('.cjs')) {
    return 'javascript';
  }
  if (normalized.endsWith('.json')) {
    return 'json';
  }
  if (normalized.endsWith('.md')) {
    return 'markdown';
  }
  if (normalized.endsWith('.yml') || normalized.endsWith('.yaml')) {
    return 'yaml';
  }
  if (normalized.endsWith('.html') || normalized.endsWith('.htm')) {
    return 'html';
  }
  if (normalized.endsWith('.css')) {
    return 'css';
  }
  if (normalized.endsWith('.xml')) {
    return 'xml';
  }
  if (normalized.endsWith('.sh') || normalized.endsWith('.bash')) {
    return 'shell';
  }
  if (normalized.endsWith('.ps1')) {
    return 'powershell';
  }
  if (normalized.endsWith('.py')) {
    return 'python';
  }
  if (normalized.endsWith('.go')) {
    return 'go';
  }
  if (normalized.endsWith('.rs')) {
    return 'rust';
  }
  if (normalized.endsWith('.java')) {
    return 'java';
  }
  if (normalized.endsWith('.kt')) {
    return 'kotlin';
  }
  if (normalized.endsWith('.sql')) {
    return 'sql';
  }
  return 'plaintext';
}

function setMonacoEditorLanguage(editor, pathValue) {
  if (!editor || !window.monaco || !window.monaco.editor) {
    return;
  }
  const model = editor.getModel();
  if (!model) {
    return;
  }
  const language = guessLanguageFromPath(pathValue);
  window.monaco.editor.setModelLanguage(model, language);
}

function setWorkspaceEditorValue(content) {
  const value = typeof content === 'string' ? content : '';
  workspaceEditContent.value = value;
  if (workspaceCodeEditor && workspaceCodeEditor.getValue() !== value) {
    workspaceCodeEditor.setValue(value);
  }
}

function getWorkspaceEditorValue() {
  if (workspaceCodeEditor) {
    return workspaceCodeEditor.getValue();
  }
  return workspaceEditContent.value || '';
}

function setEditProposalEditorValue(content) {
  const value = typeof content === 'string' ? content : '';
  editContentInput.value = value;
  if (editProposalCodeEditor && editProposalCodeEditor.getValue() !== value) {
    editProposalCodeEditor.setValue(value);
  }
}

function getEditProposalEditorValue() {
  if (editProposalCodeEditor) {
    return editProposalCodeEditor.getValue();
  }
  return editContentInput.value || '';
}

function updateWorkspaceEditorLanguage(pathValue) {
  setMonacoEditorLanguage(workspaceCodeEditor, pathValue);
}

function updateEditProposalEditorLanguage(pathValue) {
  setMonacoEditorLanguage(editProposalCodeEditor, pathValue);
}

function loadMonacoLoaderScript() {
  if (window.monaco && window.monaco.editor) {
    return Promise.resolve();
  }

  if (window.require && typeof window.require.config === 'function') {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${monacoBaseUrl}/loader.js`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Monaco loader script.'));
    document.head.appendChild(script);
  });
}

function getMonacoApi() {
  if (window.monaco && window.monaco.editor) {
    return Promise.resolve(window.monaco);
  }

  if (!window.require || typeof window.require.config !== 'function') {
    return Promise.reject(new Error('Monaco loader is unavailable.'));
  }

  return new Promise((resolve, reject) => {
    window.require.config({ paths: { vs: monacoBaseUrl } });
    window.require(['vs/editor/editor.main'], () => {
      if (window.monaco && window.monaco.editor) {
        resolve(window.monaco);
        return;
      }
      reject(new Error('Monaco API failed to initialize.'));
    }, reject);
  });
}

function activateMonacoEditorFallback(textarea, host) {
  if (!textarea || !host) {
    return;
  }
  textarea.classList.add('textarea-fallback-hidden');
  host.classList.add('is-active');
}

async function initializeMonacoEditors() {
  if (monacoInitPromise) {
    return monacoInitPromise;
  }

  monacoInitPromise = loadMonacoLoaderScript()
    .then(() => getMonacoApi())
    .then((monaco) => {
      if (workspaceEditorHost && !workspaceCodeEditor) {
        workspaceCodeEditor = monaco.editor.create(workspaceEditorHost, {
          value: workspaceEditContent.value || '',
          language: guessLanguageFromPath(normalizeWorkspacePathInput()),
          automaticLayout: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 13,
          tabSize: 2,
          theme: 'vs',
        });
        workspaceCodeEditor.onDidChangeModelContent(() => {
          workspaceEditContent.value = workspaceCodeEditor.getValue();
        });
        activateMonacoEditorFallback(workspaceEditContent, workspaceEditorHost);
      }

      if (editEditorHost && !editProposalCodeEditor) {
        editProposalCodeEditor = monaco.editor.create(editEditorHost, {
          value: editContentInput.value || '',
          language: guessLanguageFromPath(normalizeEditPathInput()),
          automaticLayout: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 13,
          tabSize: 2,
          theme: 'vs',
        });
        editProposalCodeEditor.onDidChangeModelContent(() => {
          editContentInput.value = editProposalCodeEditor.getValue();
        });
        activateMonacoEditorFallback(editContentInput, editEditorHost);
      }
    })
    .catch((error) => {
      console.warn(`Monaco initialization failed: ${error.message}`);
    });

  return monacoInitPromise;
}

function normalizeTaskPriority(priority) {
  const value = typeof priority === 'string' ? priority.trim().toLowerCase() : '';
  if (value === 'high' || value === 'low') {
    return value;
  }
  return 'normal';
}

function humanizeToken(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return 'Unknown';
  }
  return value
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTaskStatusLabel(status) {
  return humanizeToken(typeof status === 'string' ? status : 'unknown');
}

function formatTaskPriorityLabel(priority) {
  return humanizeToken(normalizeTaskPriority(priority));
}

function formatCountLabel(value, singular, plural) {
  const count = Number.isInteger(value) ? value : 0;
  const pluralForm = typeof plural === 'string' && plural ? plural : `${singular}s`;
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function normalizeTaskStatusFilter(status) {
  const value = typeof status === 'string' ? status.trim().toLowerCase() : '';
  if (taskStatusFilterOptions.has(value)) {
    return value;
  }
  return 'all';
}

function setTaskStatusFilterControlState() {
  const activeStatus = normalizeTaskStatusFilter(state.taskFilterStatus);
  state.taskFilterStatus = activeStatus;

  if (taskFilterStatus && taskFilterStatus.value !== activeStatus) {
    taskFilterStatus.value = activeStatus;
  }
  if (!taskQuickFiltersEl) {
    return;
  }

  const buttons = taskQuickFiltersEl.querySelectorAll('button[data-status]');
  for (const button of buttons) {
    const buttonStatus = normalizeTaskStatusFilter(button.dataset.status || 'all');
    const selected = buttonStatus === activeStatus;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  }
}

function setTaskSearchControlState() {
  if (!clearTaskSearchBtn || !taskFilterQuery) {
    return;
  }
  const hasQuery = typeof state.taskFilterQuery === 'string' && state.taskFilterQuery.length > 0;
  clearTaskSearchBtn.disabled = !hasQuery;
}

function renderQueueStatusPills(statusPayload) {
  if (!queueStatusPillsEl) {
    return;
  }

  const counts = statusPayload && statusPayload.counts && statusPayload.counts.byStatus ? statusPayload.counts.byStatus : {};
  const queued = Number.isInteger(counts.queued) ? counts.queued : 0;
  const planning = Number.isInteger(counts.planning) ? counts.planning : 0;
  const running = Number.isInteger(counts.running) ? counts.running : 0;
  const completed = Number.isInteger(counts.completed) ? counts.completed : 0;
  const failed = Number.isInteger(counts.failed) ? counts.failed : 0;
  const cancelled = Number.isInteger(counts.cancelled) ? counts.cancelled : 0;
  const activeCount = queued + planning + running;
  const attentionCount = failed + cancelled;
  const paused = isQueuePaused(statusPayload);

  const pillConfig = [
    { label: 'Queue', value: paused ? 'Paused' : 'Active', tone: paused ? 'warn' : 'ok' },
    { label: 'Active', value: String(activeCount), tone: activeCount > 0 ? 'warn' : 'neutral' },
    { label: 'Done', value: String(completed), tone: completed > 0 ? 'ok' : 'neutral' },
    { label: 'Attention', value: String(attentionCount), tone: attentionCount > 0 ? 'fail' : 'neutral' },
  ];

  queueStatusPillsEl.innerHTML = '';
  for (const item of pillConfig) {
    const pill = document.createElement('div');
    pill.className = 'queue-pill';
    pill.dataset.tone = item.tone;

    const label = document.createElement('span');
    label.className = 'queue-pill-label';
    label.textContent = item.label;

    const value = document.createElement('span');
    value.className = 'queue-pill-value';
    value.textContent = item.value;

    pill.appendChild(label);
    pill.appendChild(value);
    queueStatusPillsEl.appendChild(pill);
  }
}

function applyTaskStatusFilter(nextStatus) {
  state.taskFilterStatus = normalizeTaskStatusFilter(nextStatus);
  setTaskStatusFilterControlState();
  return refresh();
}

function loadSimpleModePreference() {
  try {
    const stored = window.localStorage.getItem(simpleModeStorageKey);
    if (stored === 'false') {
      return false;
    }
    if (stored === 'true') {
      return true;
    }
  } catch (error) {
    // Ignore localStorage availability issues.
  }
  return true;
}

function saveSimpleModePreference(enabled) {
  try {
    window.localStorage.setItem(simpleModeStorageKey, enabled ? 'true' : 'false');
  } catch (error) {
    // Ignore localStorage availability issues.
  }
}

function applyDashboardMode() {
  const simpleMode = Boolean(state.simpleMode);
  document.body.classList.toggle('simple-mode', simpleMode);

  if (simpleModeToggle) {
    simpleModeToggle.checked = simpleMode;
  }
  if (collapseAdvancedBtn) {
    collapseAdvancedBtn.textContent = simpleMode ? 'Show Advanced' : 'Hide Advanced';
  }
}

function setSimpleMode(enabled) {
  state.simpleMode = Boolean(enabled);
  saveSimpleModePreference(state.simpleMode);
  applyDashboardMode();
}

function collapseAdvancedPanels() {
  for (const panel of advancedModulePanels) {
    if (panel && panel.tagName === 'DETAILS') {
      panel.open = false;
    }
  }
}

function expandVisiblePanels() {
  for (const panel of modulePanels) {
    if (!panel || panel.tagName !== 'DETAILS') {
      continue;
    }
    if (state.simpleMode && panel.dataset && panel.dataset.advanced === 'true') {
      continue;
    }
    panel.open = true;
  }
}

function formatTaskQueueContext(task) {
  let queueLabel = 'Not queued';
  if (Number.isInteger(task.queuePosition) && task.queuePosition > 0) {
    queueLabel = `Queue #${task.queuePosition}`;
  } else if (task && (task.status === 'planning' || task.status === 'running')) {
    queueLabel = 'In progress';
  }

  const workerState = task && task.activeWorker ? 'Worker active' : 'Worker idle';
  return `${queueLabel}, ${workerState}`;
}

function formatTaskDependencyContext(task) {
  const dependsOn = Array.isArray(task.dependsOn) ? task.dependsOn : [];
  const blockedBy = Array.isArray(task.blockedBy) ? task.blockedBy : [];
  if (!dependsOn.length) {
    return 'Dependencies: none';
  }
  if (!blockedBy.length) {
    return `Dependencies: ${formatCountLabel(dependsOn.length, 'task')} ready`;
  }
  const blockerPreview = blockedBy
    .slice(0, 2)
    .map((entry) => `${String(entry.id || '?').slice(0, 8)} (${formatTaskStatusLabel(entry.status || 'blocked')})`)
    .join(',');
  return `Dependencies: ${formatCountLabel(dependsOn.length, 'task')} total, ${formatCountLabel(blockedBy.length, 'blocked dependency')} [${blockerPreview}]`;
}

async function queueTaskWithCommands(prompt, modelId, commands, workingDirectory, priority, dependsOn) {
  const requestedWorkingDirectory = typeof workingDirectory === 'string' ? workingDirectory.trim() : '';
  const requestedPriority = normalizeTaskPriority(priority);
  const requestedDependsOn = Array.isArray(dependsOn) ? dependsOn : [];
  const created = await readJson('/api/v1/tasks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      modelId: modelId || undefined,
      commands,
      workingDirectory: requestedWorkingDirectory || undefined,
      priority: requestedPriority,
      dependsOn: requestedDependsOn.length ? requestedDependsOn : undefined,
    }),
  });

  state.selectedTaskId = created.id;
  return created;
}

async function queueCollaborativeRun(prompt, roles) {
  const created = await readJson('/api/v1/tasks/collaborative', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      roles: Array.isArray(roles) && roles.length ? roles : undefined,
      modelId: taskModel.value || undefined,
      workingDirectory: taskWorkingDirectory.value || undefined,
      priority: taskPriority.value || undefined,
    }),
  });

  if (Array.isArray(created.tasks) && created.tasks.length) {
    state.selectedTaskId = created.tasks[0].id;
  }
  return created;
}

async function queueSpecializedCollaborativeRun(prompt, specialization) {
  const created = await readJson('/api/v1/tasks/collaborative/specialized', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      specialization,
      modelId: taskModel.value || undefined,
      workingDirectory: taskWorkingDirectory.value || undefined,
      priority: taskPriority.value || undefined,
    }),
  });

  if (Array.isArray(created.tasks) && created.tasks.length) {
    state.selectedTaskId = created.tasks[0].id;
  }
  return created;
}

function findCollaborativeTemplate(templateId) {
  if (!templateId || !Array.isArray(state.runTemplates)) {
    return null;
  }
  return state.runTemplates.find((template) => template.id === templateId) || null;
}

function updateCollaborativeRolesFromTemplate(templateId) {
  const template = findCollaborativeTemplate(templateId);
  if (!template || !Array.isArray(template.roles) || !template.roles.length) {
    return;
  }
  collabRolesInput.value = template.roles.join(',');
}

function renderCollaborativeTemplateOptions(templates, defaultTemplateId) {
  if (!collabTemplateSelect) {
    return;
  }

  const items = Array.isArray(templates) ? templates : [];
  const fallbackDefault = items.length ? items[0].id : '';
  const preferredDefault = defaultTemplateId || fallbackDefault;

  collabTemplateSelect.innerHTML = '';
  if (!items.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No templates available';
    collabTemplateSelect.appendChild(option);
    collabTemplateSelect.disabled = true;
    queueSpecializedCollabBtn.disabled = true;
    return;
  }

  collabTemplateSelect.disabled = false;
  queueSpecializedCollabBtn.disabled = false;

  for (const template of items) {
    const option = document.createElement('option');
    option.value = template.id;
    const roles = Array.isArray(template.roles) ? template.roles.join(' -> ') : '';
    option.textContent = `${template.label || template.id} [${template.id}] (${roles})`;
    collabTemplateSelect.appendChild(option);
  }

  if (preferredDefault && items.some((template) => template.id === preferredDefault)) {
    collabTemplateSelect.value = preferredDefault;
  } else {
    collabTemplateSelect.value = items[0].id;
  }

  updateCollaborativeRolesFromTemplate(collabTemplateSelect.value);
}

function parsePluginManifestInput(rawValue) {
  const text = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (!text) {
    return { error: 'Enter a plugin manifest JSON first.' };
  }

  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { error: 'Plugin manifest must be a JSON object.' };
    }
    return { manifest: parsed };
  } catch (error) {
    return { error: `Plugin manifest JSON is invalid: ${error.message}` };
  }
}

function formatPluginRow(plugin) {
  const pluginId = typeof plugin.id === 'string' ? plugin.id : 'unknown';
  const enabled = plugin.enabled ? 'enabled' : 'disabled';
  const modelCount = Number.isInteger(plugin.modelContributions) ? plugin.modelContributions : 0;
  const templateCount = Number.isInteger(plugin.templateContributions) ? plugin.templateContributions : 0;
  const healthcheck = plugin && typeof plugin.healthcheck === 'object' ? plugin.healthcheck : null;
  const healthStatus = !healthcheck
    ? 'health:unknown'
    : healthcheck.healthy
      ? healthcheck.fresh
        ? 'health:pass'
        : 'health:stale'
      : 'health:fail';
  const name = typeof plugin.name === 'string' ? plugin.name : pluginId;
  return `${pluginId} | ${enabled} | ${healthStatus} | models:${modelCount} templates:${templateCount}\n${name} (${plugin.version || '0.1.0'})`;
}

function setPluginActionButtons(plugin) {
  const hasSelection = Boolean(plugin);
  const enabled = Boolean(plugin && plugin.enabled);
  updatePluginBtn.disabled = !hasSelection;
  healthcheckPluginBtn.disabled = !hasSelection;
  enablePluginBtn.disabled = !hasSelection || enabled;
  disablePluginBtn.disabled = !hasSelection || !enabled;
  removePluginBtn.disabled = !hasSelection;
}

function renderPluginDetail(plugin) {
  if (!plugin) {
    setPluginActionButtons(null);
    pluginOutput.textContent = 'No plugin selected.';
    return;
  }

  setPluginActionButtons(plugin);
  const models = plugin.contributions && Array.isArray(plugin.contributions.models) ? plugin.contributions.models : [];
  const templates =
    plugin.contributions && Array.isArray(plugin.contributions.templates) ? plugin.contributions.templates : [];
  const healthcheck = plugin && typeof plugin.healthcheck === 'object' ? plugin.healthcheck : null;
  const marketplace = plugin && typeof plugin.marketplace === 'object' ? plugin.marketplace : null;
  const lines = [
    `ID: ${plugin.id}`,
    `Name: ${plugin.name || plugin.id}`,
    `Version: ${plugin.version || '0.1.0'}`,
    `Enabled: ${plugin.enabled ? 'yes' : 'no'}`,
    `Created At: ${plugin.createdAt || '-'}`,
    `Updated At: ${plugin.updatedAt || '-'}`,
    '',
    'Marketplace:',
  ];

  if (!marketplace || !marketplace.marketplaceId) {
    lines.push('Not marketplace-managed');
  } else {
    lines.push(`Marketplace ID: ${marketplace.marketplaceId}`);
    lines.push(`Source: ${marketplace.source || '-'}`);
    lines.push(`Source URL: ${marketplace.sourceUrl || '-'}`);
    lines.push(`Manifest SHA256: ${marketplace.manifestChecksumSha256 || '-'}`);
    lines.push(`Installed At: ${marketplace.installedAt || '-'}`);
    lines.push(`Marketplace Updated At: ${marketplace.updatedAt || '-'}`);
    lines.push(`Last Action: ${marketplace.lastAction || '-'}`);
  }

  lines.push('');
  lines.push('Healthcheck:');

  if (!healthcheck) {
    lines.push('Not run yet');
  } else {
    lines.push(`Healthy: ${healthcheck.healthy ? 'yes' : 'no'}`);
    lines.push(`Fresh: ${healthcheck.fresh ? 'yes' : 'no'}`);
    lines.push(`Checked At: ${healthcheck.checkedAt || '-'}`);
    lines.push(`Expires At: ${healthcheck.expiresAt || '-'}`);
    const issues = Array.isArray(healthcheck.issues) ? healthcheck.issues : [];
    const warnings = Array.isArray(healthcheck.warnings) ? healthcheck.warnings : [];
    lines.push(`Issues: ${issues.length}`);
    lines.push(`Warnings: ${warnings.length}`);
    if (issues.length) {
      lines.push('Issue details:');
      for (const issue of issues) {
        lines.push(`- ${issue}`);
      }
    }
    if (warnings.length) {
      lines.push('Warning details:');
      for (const warning of warnings) {
        lines.push(`- ${warning}`);
      }
    }
  }

  lines.push('');
  lines.push('Models:');
  if (!models.length) {
    lines.push('(none)');
  } else {
    for (const model of models) {
      lines.push(`${model.id} | ${model.provider} | ${model.label || model.id}`);
    }
  }

  lines.push('');
  lines.push('Templates:');
  if (!templates.length) {
    lines.push('(none)');
  } else {
    for (const template of templates) {
      const roles = Array.isArray(template.roles) ? template.roles.join(' -> ') : '';
      lines.push(`${template.id} | ${template.label || template.id} | ${roles}`);
    }
  }

  pluginOutput.textContent = lines.join('\n');
}

function renderPluginList(plugins) {
  pluginListEl.innerHTML = '';
  const items = Array.isArray(plugins) ? plugins : [];

  if (!items.length) {
    const item = document.createElement('li');
    item.className = 'empty-list-item';
    item.textContent = 'No plugins registered.';
    pluginListEl.appendChild(item);
    renderPluginDetail(null);
    return;
  }

  for (const plugin of items) {
    const selected = plugin.id === state.selectedPluginId;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = selected ? 'task-row is-selected' : 'task-row';
    button.textContent = formatPluginRow(plugin);
    button.addEventListener('click', () => {
      state.selectedPluginId = plugin.id;
      renderPluginList(state.plugins);
      refreshSelectedPluginDetail().catch((error) => {
        pluginOutput.textContent = `Error: ${error.message}`;
      });
    });

    const item = document.createElement('li');
    item.appendChild(button);
    pluginListEl.appendChild(item);
  }
}

async function refreshSelectedPluginDetail() {
  if (!state.selectedPluginId) {
    renderPluginDetail(null);
    return;
  }

  const plugin = await readJson(`/api/v1/plugins/${state.selectedPluginId}`);
  renderPluginDetail(plugin);
}

async function refreshPluginCatalog() {
  const payload = await readJson('/api/v1/plugins/catalog?limit=80');
  const catalog = Array.isArray(payload.catalog) ? payload.catalog : [];
  if (!catalog.length) {
    return;
  }

  state.plugins = catalog.map((entry) => {
    const modelCount =
      Number.isInteger(entry.modelContributions) ||
      (entry.capabilities && Array.isArray(entry.capabilities.modelIds))
        ? Number.isInteger(entry.modelContributions)
          ? entry.modelContributions
          : entry.capabilities.modelIds.length
        : 0;
    const templateCount =
      Number.isInteger(entry.templateContributions) ||
      (entry.capabilities && Array.isArray(entry.capabilities.templateIds))
        ? Number.isInteger(entry.templateContributions)
          ? entry.templateContributions
          : entry.capabilities.templateIds.length
        : 0;
    return {
      ...entry,
      modelContributions: modelCount,
      templateContributions: templateCount,
    };
  });
}

function formatMarketplacePluginRow(entry) {
  const marketplaceId = typeof entry.marketplaceId === 'string' ? entry.marketplaceId : 'unknown';
  const manifest = entry && typeof entry.manifest === 'object' ? entry.manifest : {};
  const modelCount = Number.isInteger(manifest.modelContributions) ? manifest.modelContributions : 0;
  const templateCount = Number.isInteger(manifest.templateContributions) ? manifest.templateContributions : 0;
  const installState =
    entry && typeof entry.installState === 'string' && entry.installState.trim() ? entry.installState.trim() : '';
  const installed = installState || (entry && entry.installed ? 'installed' : 'available');
  const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : marketplaceId;
  return `${marketplaceId} | ${installed} | models:${modelCount} templates:${templateCount}\n${name}`;
}

function setMarketplaceActionButtons(entry) {
  if (!installMarketplacePluginBtn) {
    return;
  }
  const hasSelection = Boolean(entry);
  installMarketplacePluginBtn.disabled = !hasSelection;
  if (!entry) {
    installMarketplacePluginBtn.textContent = 'Install Selected';
    return;
  }
  if (entry.installState === 'update-available') {
    installMarketplacePluginBtn.textContent = 'Update Selected';
    return;
  }
  if (entry.installed) {
    installMarketplacePluginBtn.textContent = 'Reinstall Selected';
    return;
  }
  installMarketplacePluginBtn.textContent = 'Install Selected';
}

function renderMarketplacePluginDetail(entry) {
  if (!entry) {
    setMarketplaceActionButtons(null);
    pluginMarketplaceOutput.textContent = 'No marketplace plugin selected.';
    return;
  }

  setMarketplaceActionButtons(entry);
  const manifest = entry && typeof entry.manifest === 'object' ? entry.manifest : {};
  const lines = [
    `Marketplace ID: ${entry.marketplaceId || '-'}`,
    `Name: ${entry.name || entry.marketplaceId || '-'}`,
    `Installed: ${entry.installed ? 'yes' : 'no'}`,
    `Install State: ${entry.installState || (entry.installed ? 'installed' : 'available')}`,
    `Installed Version: ${entry.installedVersion || '-'}`,
    `Installed Via Marketplace: ${entry.installedViaMarketplace ? 'yes' : 'no'}`,
    `Installed At: ${entry.installedAt || '-'}`,
    `Marketplace Install Updated At: ${entry.installedMarketplaceUpdatedAt || '-'}`,
    `Update Available: ${entry.updateAvailable ? 'yes' : 'no'}`,
    `Reinstall Hint: ${entry.reinstallHint || '-'}`,
    `Source: ${entry.source || '-'}`,
    `Source URL: ${entry.sourceUrl || '-'}`,
    `Manifest SHA256: ${entry.manifestChecksumSha256 || '-'}`,
    `Tags: ${Array.isArray(entry.tags) && entry.tags.length ? entry.tags.join(', ') : '(none)'}`,
    `Summary: ${entry.summary || '(none)'}`,
    '',
    `Manifest Plugin ID: ${manifest.id || '-'}`,
    `Manifest Name: ${manifest.name || '-'}`,
    `Manifest Version: ${manifest.version || '-'}`,
    `Models: ${Number.isInteger(manifest.modelContributions) ? manifest.modelContributions : 0}`,
    `Templates: ${Number.isInteger(manifest.templateContributions) ? manifest.templateContributions : 0}`,
  ];
  pluginMarketplaceOutput.textContent = lines.join('\n');
}

function renderMarketplacePluginList(entries) {
  pluginMarketplaceListEl.innerHTML = '';
  const items = Array.isArray(entries) ? entries : [];

  if (!items.length) {
    const item = document.createElement('li');
    item.className = 'empty-list-item';
    item.textContent = 'No marketplace plugins found.';
    pluginMarketplaceListEl.appendChild(item);
    renderMarketplacePluginDetail(null);
    return;
  }

  for (const entry of items) {
    const selected = entry.marketplaceId === state.selectedMarketplacePluginId;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = selected ? 'task-row is-selected' : 'task-row';
    button.textContent = formatMarketplacePluginRow(entry);
    button.addEventListener('click', () => {
      state.selectedMarketplacePluginId = entry.marketplaceId;
      renderMarketplacePluginList(state.marketplacePlugins);
      renderMarketplacePluginDetail(entry);
    });

    const item = document.createElement('li');
    item.appendChild(button);
    pluginMarketplaceListEl.appendChild(item);
  }
}

async function refreshPluginMarketplace() {
  const params = new URLSearchParams();
  params.set('limit', '80');
  const query = pluginMarketplaceQueryInput && typeof pluginMarketplaceQueryInput.value === 'string'
    ? pluginMarketplaceQueryInput.value.trim()
    : '';
  if (query) {
    params.set('q', query);
  }

  const payload = await readJson(`/api/v1/plugins/marketplace?${params.toString()}`);
  state.marketplacePlugins = Array.isArray(payload.plugins) ? payload.plugins : [];

  if (
    state.selectedMarketplacePluginId &&
    !state.marketplacePlugins.some((entry) => entry.marketplaceId === state.selectedMarketplacePluginId)
  ) {
    state.selectedMarketplacePluginId = null;
  }
  if (!state.selectedMarketplacePluginId && state.marketplacePlugins.length) {
    state.selectedMarketplacePluginId = state.marketplacePlugins[0].marketplaceId;
  }

  renderMarketplacePluginList(state.marketplacePlugins);
  const selectedEntry = state.marketplacePlugins.find((entry) => entry.marketplaceId === state.selectedMarketplacePluginId);
  renderMarketplacePluginDetail(selectedEntry || null);
}

async function importPluginMarketplaceFromUrl() {
  const urlValue =
    pluginMarketplaceImportUrlInput && typeof pluginMarketplaceImportUrlInput.value === 'string'
      ? pluginMarketplaceImportUrlInput.value.trim()
      : '';
  if (!urlValue) {
    pluginMarketplaceOutput.textContent = 'Enter a manifest URL first.';
    return;
  }

  importPluginMarketplaceBtn.disabled = true;
  try {
    const payload = await readJson('/api/v1/plugins/marketplace/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: urlValue,
      }),
    });
    const marketplaceId =
      payload && payload.marketplace && payload.marketplace.marketplaceId ? payload.marketplace.marketplaceId : '(unknown)';
    pluginMarketplaceOutput.textContent = `Marketplace plugin imported: ${marketplaceId}`;
    state.selectedMarketplacePluginId = marketplaceId;
    await refresh();
  } catch (error) {
    pluginMarketplaceOutput.textContent = `Error importing marketplace plugin: ${error.message}`;
    await refresh().catch(() => {});
  } finally {
    importPluginMarketplaceBtn.disabled = false;
  }
}

async function installSelectedMarketplacePlugin() {
  if (!state.selectedMarketplacePluginId) {
    pluginMarketplaceOutput.textContent = 'Select a marketplace plugin first.';
    return;
  }

  const updateExisting = Boolean(
    pluginMarketplaceUpdateExistingInput && pluginMarketplaceUpdateExistingInput.checked
  );
  installMarketplacePluginBtn.disabled = true;
  try {
    const payload = await readJson('/api/v1/plugins/marketplace/install', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        marketplaceId: state.selectedMarketplacePluginId,
        updateExisting,
      }),
    });
    const pluginId = payload && payload.plugin && payload.plugin.id ? payload.plugin.id : '(unknown)';
    const action = payload && payload.action ? payload.action : 'installed';
    pluginMarketplaceOutput.textContent = `Marketplace plugin ${action}: ${state.selectedMarketplacePluginId} -> ${pluginId}`;
    state.selectedPluginId = pluginId;
    await refresh();
  } catch (error) {
    const message = error && typeof error.message === 'string' ? error.message : 'Install failed.';
    if (pluginMarketplaceUpdateExistingInput && message.toLowerCase().includes('updateexisting')) {
      pluginMarketplaceUpdateExistingInput.checked = true;
    }
    pluginMarketplaceOutput.textContent = `Error installing marketplace plugin: ${message}`;
    await refresh().catch(() => {});
  } finally {
    installMarketplacePluginBtn.disabled = false;
  }
}

async function updateSelectedPluginFromInput() {
  if (!state.selectedPluginId) {
    pluginOutput.textContent = 'Select a plugin first.';
    return;
  }

  const parsed = parsePluginManifestInput(pluginManifestInput.value);
  if (parsed.error) {
    pluginOutput.textContent = parsed.error;
    return;
  }

  updatePluginBtn.disabled = true;
  try {
    const plugin = await readJson(`/api/v1/plugins/${state.selectedPluginId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(parsed.manifest),
    });
    pluginOutput.textContent = `Plugin updated: ${plugin.id}`;
    await refresh();
  } catch (error) {
    pluginOutput.textContent = `Error updating plugin: ${error.message}`;
    await refresh().catch(() => {});
  } finally {
    updatePluginBtn.disabled = false;
  }
}

async function runSelectedPluginHealthcheck() {
  if (!state.selectedPluginId) {
    pluginOutput.textContent = 'Select a plugin first.';
    return;
  }

  healthcheckPluginBtn.disabled = true;
  try {
    const result = await readJson(`/api/v1/plugins/${state.selectedPluginId}/healthcheck`, {
      method: 'POST',
    });
    const healthcheck = result && result.healthcheck && typeof result.healthcheck === 'object' ? result.healthcheck : null;
    if (healthcheck) {
      const status = healthcheck.healthy ? 'PASS' : 'FAIL';
      const freshness = healthcheck.fresh ? 'fresh' : 'stale';
      pluginOutput.textContent = `Plugin healthcheck ${status} (${freshness}): ${state.selectedPluginId}`;
    } else {
      pluginOutput.textContent = `Plugin healthcheck completed: ${state.selectedPluginId}`;
    }
    await refresh();
  } catch (error) {
    pluginOutput.textContent = `Error running plugin healthcheck: ${error.message}`;
    await refresh().catch(() => {});
  } finally {
    healthcheckPluginBtn.disabled = false;
  }
}

async function registerPluginFromInput() {
  const parsed = parsePluginManifestInput(pluginManifestInput.value);
  if (parsed.error) {
    pluginOutput.textContent = parsed.error;
    return;
  }

  registerPluginBtn.disabled = true;
  try {
    const plugin = await readJson('/api/v1/plugins', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(parsed.manifest),
    });
    state.selectedPluginId = plugin.id;
    pluginOutput.textContent = `Plugin registered: ${plugin.id}`;
    await refresh();
  } catch (error) {
    pluginOutput.textContent = `Error registering plugin: ${error.message}`;
  } finally {
    registerPluginBtn.disabled = false;
  }
}

async function setSelectedPluginEnabled(enabled) {
  if (!state.selectedPluginId) {
    pluginOutput.textContent = 'Select a plugin first.';
    return;
  }

  const action = enabled ? 'enable' : 'disable';
  const button = enabled ? enablePluginBtn : disablePluginBtn;
  button.disabled = true;
  try {
    await readJson(`/api/v1/plugins/${state.selectedPluginId}/${action}`, {
      method: 'POST',
    });
    pluginOutput.textContent = `Plugin ${action}d: ${state.selectedPluginId}`;
    await refresh();
  } catch (error) {
    pluginOutput.textContent = `Error updating plugin: ${error.message}`;
    await refresh().catch(() => {});
  }
}

async function removeSelectedPlugin() {
  if (!state.selectedPluginId) {
    pluginOutput.textContent = 'Select a plugin first.';
    return;
  }

  const confirmed = window.confirm(`Remove plugin ${state.selectedPluginId}?`);
  if (!confirmed) {
    return;
  }

  removePluginBtn.disabled = true;
  try {
    const payload = await readJson(`/api/v1/plugins/${state.selectedPluginId}`, {
      method: 'DELETE',
    });
    const removedId = payload && payload.removed && payload.removed.id ? payload.removed.id : state.selectedPluginId;
    pluginOutput.textContent = `Plugin removed: ${removedId}`;
    state.selectedPluginId = null;
    await refresh();
  } catch (error) {
    pluginOutput.textContent = `Error removing plugin: ${error.message}`;
    await refresh().catch(() => {});
  }
}

function buildTasksApiUrl() {
  const params = new URLSearchParams();
  if (state.taskFilterStatus && state.taskFilterStatus !== 'all') {
    params.set('status', state.taskFilterStatus);
  }
  if (state.taskFilterQuery) {
    params.set('q', state.taskFilterQuery);
  }

  const query = params.toString();
  return query ? `/api/v1/tasks?${query}` : '/api/v1/tasks';
}

function renderTasks(tasks) {
  tasksEl.innerHTML = '';

  if (!tasks.length) {
    const item = document.createElement('li');
    item.className = 'empty-list-item';
    item.textContent = 'No tasks queued yet.';
    tasksEl.appendChild(item);
    return;
  }

  for (const task of tasks) {
    const selected = task.id === state.selectedTaskId;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = selected ? 'task-row is-selected' : 'task-row';
    button.dataset.status = typeof task.status === 'string' ? task.status.toLowerCase() : 'unknown';

    const shortId = task.id.slice(0, 8);
    const promptPreview = task.prompt.length > 70 ? `${task.prompt.slice(0, 70)}...` : task.prompt;
    const commandCount = Array.isArray(task.commands) ? task.commands.length : 0;
    const workingDirectory = typeof task.workingDirectory === 'string' ? task.workingDirectory : '?';
    const priority = normalizeTaskPriority(task.priority);
    const statusLabel = formatTaskStatusLabel(task.status);
    const priorityLabel = formatTaskPriorityLabel(priority);
    const queueContext = formatTaskQueueContext(task);
    const dependencyContext = formatTaskDependencyContext(task);
    button.textContent = `${promptPreview}\nTask ${shortId} • ${statusLabel} • ${priorityLabel} priority\nModel: ${task.modelId} • ${formatCountLabel(commandCount, 'command')}\nQueue: ${queueContext}\n${dependencyContext}\nWorkspace: ${workingDirectory}`;
    button.addEventListener('click', () => {
      state.selectedTaskId = task.id;
      refreshDetails().catch((error) => {
        statusEl.textContent = `Error loading task details: ${error.message}`;
      });
      renderTasks(state.tasks);
    });
    const item = document.createElement('li');
    item.appendChild(button);
    tasksEl.appendChild(item);
  }
}

function renderSliceTasks() {
  sliceTaskListEl.innerHTML = '';

  for (const slice of suggestedSlices) {
    const alreadyQueued = hasSliceTask(slice.id);
    const item = document.createElement('li');
    item.className = 'slice-task-item';

    const text = document.createElement('p');
    text.className = 'slice-task-title';
    text.textContent = `${slice.title}: ${slice.prompt.replace(`[slice:${slice.id}] `, '')}`;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'small secondary';
    button.textContent = alreadyQueued ? 'Queued' : 'Queue';
    button.disabled = alreadyQueued;
    button.addEventListener('click', async () => {
      try {
        await queueTask(slice.prompt, taskModel.value);
        await refresh();
      } catch (error) {
        statusEl.textContent = `Error queueing slice task: ${error.message}`;
      }
    });

    item.appendChild(text);
    item.appendChild(button);
    sliceTaskListEl.appendChild(item);
  }
}

function formatCollaborativeRunRow(run) {
  const shortId = typeof run.id === 'string' ? run.id.slice(0, 8) : 'unknown';
  const status = typeof run.status === 'string' ? run.status : 'unknown';
  const taskCount = Number.isInteger(run.taskCount) ? run.taskCount : 0;
  const template = typeof run.templateLabel === 'string' && run.templateLabel ? run.templateLabel : run.templateId || 'custom';
  const roles = Array.isArray(run.roles) ? run.roles.join(',') : '';
  const prompt = typeof run.prompt === 'string' ? run.prompt : '';
  const promptPreview = prompt.length > 70 ? `${prompt.slice(0, 70)}...` : prompt;
  return `${shortId} | ${status} | tasks:${taskCount} | tpl:${template} | roles:${roles}\n${promptPreview}`;
}

function renderCollaborativeRuns(runs) {
  collabRunsEl.innerHTML = '';
  const items = Array.isArray(runs) ? runs : [];

  if (!items.length) {
    const item = document.createElement('li');
    item.className = 'empty-list-item';
    item.textContent = 'No collaborative runs yet.';
    collabRunsEl.appendChild(item);
    return;
  }

  for (const run of items) {
    const selected = run.id === state.selectedRunId;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = selected ? 'task-row is-selected' : 'task-row';
    button.textContent = formatCollaborativeRunRow(run);
    button.addEventListener('click', () => {
      state.selectedRunId = run.id;
      renderCollaborativeRuns(state.runs);
      refreshSelectedRunDetails().catch((error) => {
        collabRunOutput.textContent = `Error: ${error.message}`;
      });
    });

    const item = document.createElement('li');
    item.appendChild(button);
    collabRunsEl.appendChild(item);
  }
}

function canSelfHealRun(run) {
  if (!run || typeof run !== 'object') {
    return false;
  }
  if (run.status === 'failed' || run.status === 'cancelled' || run.status === 'partial-cancelled') {
    return true;
  }
  const counts = run.counts && typeof run.counts === 'object' ? run.counts : {};
  const failedCount = Number.isInteger(counts.failed) ? counts.failed : 0;
  const cancelledCount = Number.isInteger(counts.cancelled) ? counts.cancelled : 0;
  return failedCount > 0 || cancelledCount > 0;
}

function renderCollaborativeRunDetail(run) {
  if (!run) {
    sendRunFeedbackBtn.disabled = true;
    selfHealRunBtn.disabled = true;
    collabRunOutput.textContent = 'No collaborative run selected.';
    return;
  }

  sendRunFeedbackBtn.disabled = false;
  selfHealRunBtn.disabled = !canSelfHealRun(run);

  const roles = Array.isArray(run.roles) && run.roles.length ? run.roles.join(', ') : '(none)';
  const template = typeof run.templateLabel === 'string' && run.templateLabel ? run.templateLabel : run.templateId || '(none)';
  const lines = [
    `Run ID: ${run.id}`,
    `Status: ${run.status || 'unknown'}`,
    `Template: ${template}`,
    `Roles: ${roles}`,
    `Task Count: ${run.taskCount || 0}`,
    `Created At: ${run.createdAt || '-'}`,
    `Updated At: ${run.updatedAt || '-'}`,
    '',
    'Objective:',
    run.prompt || '(none)',
    '',
    'Tasks:',
  ];

  const tasks = Array.isArray(run.tasks) ? run.tasks : [];
  if (!tasks.length) {
    lines.push('(no tasks)');
  } else {
    for (const task of tasks) {
      const collab = task && typeof task.collaboration === 'object' ? task.collaboration : null;
      const stepLabel =
        collab && Number.isInteger(collab.stepIndex) && Number.isInteger(collab.totalSteps)
          ? `${collab.stepIndex + 1}/${collab.totalSteps}`
          : '-';
      const roleLabel = collab && typeof collab.role === 'string' ? collab.role : '?';
      lines.push(`${task.id} | ${task.status} | role:${roleLabel} | step:${stepLabel}`);
    }
  }

  const feedback = Array.isArray(run.feedback) ? run.feedback : [];
  lines.push('');
  lines.push(`Feedback (${feedback.length}):`);
  if (!feedback.length) {
    lines.push('(none)');
  } else {
    for (const entry of feedback.slice(0, 10)) {
      lines.push(`${entry.createdAt} | ${entry.source || 'user'} | role:${entry.role || 'operator'} | ${entry.message}`);
    }
  }

  collabRunOutput.textContent = lines.join('\n');
}

async function refreshSelectedRunDetails() {
  if (!state.selectedRunId) {
    renderCollaborativeRunDetail(null);
    return;
  }

  const run = await readJson(`/api/v1/runs/${state.selectedRunId}`);
  renderCollaborativeRunDetail(run);
}

function renderTimeline(timeline) {
  timelineEl.innerHTML = '';
  if (!timeline.length) {
    const item = document.createElement('li');
    item.className = 'empty-list-item';
    item.textContent = 'No timeline entries yet.';
    timelineEl.appendChild(item);
    return;
  }

  for (const entry of timeline) {
    const item = document.createElement('li');
    item.textContent = `${entry.createdAt} | ${humanizeToken(entry.state)} | ${entry.message}`;
    timelineEl.appendChild(item);
  }
}

function renderArtifacts(artifacts) {
  artifactsEl.innerHTML = '';
  if (!artifacts.length) {
    const item = document.createElement('li');
    item.className = 'empty-list-item';
    item.textContent = 'No artifacts yet.';
    artifactsEl.appendChild(item);
    return;
  }

  for (const artifact of artifacts) {
    const item = document.createElement('li');
    item.className = 'artifact-item';
    const details = document.createElement('details');
    details.className = 'artifact-details';
    details.open = false;

    const summary = document.createElement('summary');
    summary.className = 'artifact-summary';
    summary.textContent = `${artifact.title} (${humanizeToken(artifact.type)}) | ${artifact.createdAt}`;

    const pre = document.createElement('pre');
    pre.className = 'artifact-content';
    pre.textContent = artifact.content;

    details.appendChild(summary);
    details.appendChild(pre);
    item.appendChild(details);
    artifactsEl.appendChild(item);
  }
}

function renderStatus(statusPayload) {
  statusEl.textContent = JSON.stringify(statusPayload, null, 2);
}

async function loadRuntimeDiagnostics() {
  if (!runtimeDiagnosticsOutput) {
    return;
  }
  const payload = await readJson('/api/v1/diagnostics/runtime');
  runtimeDiagnosticsOutput.textContent = JSON.stringify(payload, null, 2);
}

function formatReliabilityGateLine(gate) {
  const id = gate && typeof gate.id === 'string' ? gate.id : 'unknown-gate';
  const status = gate && typeof gate.status === 'string' ? gate.status.toUpperCase() : 'UNKNOWN';
  const details = gate && typeof gate.details === 'string' ? gate.details : '(no details)';
  return `${status.padEnd(5)} ${id} - ${details}`;
}

async function loadReliabilityGates() {
  if (!reliabilityGatesOutput) {
    return;
  }

  const payload = await readJson('/api/v1/diagnostics/reliability-gates');
  const summary = payload && typeof payload.summary === 'object' ? payload.summary : {};
  const gates = Array.isArray(payload.gates) ? payload.gates : [];
  const overall = typeof payload.overall === 'string' ? payload.overall.toUpperCase() : 'UNKNOWN';

  const lines = [
    `Overall: ${overall}`,
    `Summary: pass=${summary.pass || 0} warn=${summary.warn || 0} fail=${summary.fail || 0}`,
    '',
    'Gates:',
    ...gates.map((gate) => formatReliabilityGateLine(gate)),
  ];

  const actions = Array.isArray(payload.recommendedActions) ? payload.recommendedActions : [];
  if (actions.length) {
    lines.push('', 'Recommended Actions:');
    for (const action of actions) {
      lines.push(`- ${action}`);
    }
  }

  reliabilityGatesOutput.textContent = lines.join('\n');
}

function buildEventSummary(eventPayload) {
  const type = typeof eventPayload.type === 'string' ? eventPayload.type : 'event';
  const payload = eventPayload && typeof eventPayload.payload === 'object' ? eventPayload.payload : {};
  const task = payload.task && typeof payload.task === 'object' ? payload.task : null;
  const edit = payload.edit && typeof payload.edit === 'object' ? payload.edit : null;
  const entry = payload.entry && typeof payload.entry === 'object' ? payload.entry : null;
  const artifact = payload.artifact && typeof payload.artifact === 'object' ? payload.artifact : null;

  if (type === 'task.created' && task) {
    return `${type} | ${task.id} | ${task.status} | p:${task.priority}`;
  }
  if (type === 'task.replayed' && payload.sourceTaskId && task) {
    return `${type} | src:${payload.sourceTaskId} -> ${task.id}`;
  }
  if (type === 'task.collaborationCreated' && payload.runId) {
    const roleCount = Array.isArray(payload.roles) ? payload.roles.length : 0;
    const taskCount = Array.isArray(payload.taskIds) ? payload.taskIds.length : 0;
    return `${type} | run:${payload.runId} | roles:${roleCount} tasks:${taskCount}`;
  }
  if (type === 'task.specializedCollaborationCreated' && payload.runId && payload.template) {
    const templateId = payload.template.id || 'unknown';
    return `${type} | run:${payload.runId} | template:${templateId}`;
  }
  if (type === 'run.feedback' && payload.runId && payload.feedback) {
    return `${type} | run:${payload.runId} | role:${payload.feedback.role || 'operator'}`;
  }
  if (type === 'run.selfHealed' && payload.runId && payload.healingTask) {
    return `${type} | run:${payload.runId} | task:${payload.healingTask.id}`;
  }
  if (type === 'plugin.marketplaceImported' && payload.marketplace) {
    const marketId = payload.marketplace.marketplaceId || 'unknown';
    const source = payload.marketplace.source || 'unknown';
    return `${type} | ${marketId} | source:${source}`;
  }
  if (type === 'plugin.marketplaceInstalled' && payload.marketplace && payload.plugin) {
    const marketId = payload.marketplace.marketplaceId || 'unknown';
    const pluginId = payload.plugin.id || 'unknown';
    const action = payload.action || 'installed';
    return `${type} | ${marketId} -> ${pluginId} | ${action}`;
  }
  if (
    (type === 'plugin.registered' ||
      type === 'plugin.updated' ||
      type === 'plugin.marketplaceInstalled' ||
      type === 'plugin.enabled' ||
      type === 'plugin.disabled' ||
      type === 'plugin.healthcheck' ||
      type === 'plugin.removed') &&
    payload.plugin
  ) {
    const health = payload.healthcheck && typeof payload.healthcheck === 'object' ? payload.healthcheck : null;
    const healthLabel = health ? (health.healthy ? (health.fresh ? 'health:pass' : 'health:stale') : 'health:fail') : '';
    const suffix = healthLabel ? ` | ${healthLabel}` : '';
    return `${type} | ${payload.plugin.id} | ${payload.plugin.enabled ? 'enabled' : 'disabled'}${suffix}`;
  }
  if (type === 'task.timeline' && task && entry) {
    return `${type} | ${task.id} | ${entry.state} | ${entry.message}`;
  }
  if (type === 'task.artifact' && task && artifact) {
    return `${type} | ${task.id} | ${artifact.type} | ${artifact.title}`;
  }
  if (type === 'queue.cancelQueued') {
    return `${type} | cancelled:${payload.cancelledCount || 0}`;
  }
  if (type === 'queue.paused' || type === 'queue.resumed') {
    const activeWorkers = Array.isArray(payload.activeTaskIds) ? payload.activeTaskIds.length : 0;
    return `${type} | queued:${payload.queuedTasks || 0} running:${payload.runningTasks || 0} workers:${activeWorkers}/${payload.maxConcurrentTasks || 0}`;
  }
  if ((type === 'workspace.read' || type === 'workspace.write' || type === 'workspace.list') && payload.path) {
    return `${type} | ${payload.path}`;
  }
  if (
    (type === 'edit.created' ||
      type === 'edit.applied' ||
      type === 'edit.rejected' ||
      type === 'edit.stale' ||
      type === 'edit.reverted') &&
    edit
  ) {
    return `${type} | ${edit.id} | ${edit.status} | ${edit.path}`;
  }
  if (type === 'system.ready') {
    return `${type} | ${payload.host}:${payload.port}`;
  }
  if (type === 'stream.ready') {
    return `${type} | replayed:${payload.replayed || 0}`;
  }
  return `${type} | ${JSON.stringify(payload)}`;
}

function prependEvent(eventPayload) {
  const timestamp = typeof eventPayload.time === 'string' ? eventPayload.time : new Date().toISOString();
  const item = document.createElement('li');
  item.className = 'event-item';
  item.textContent = `${timestamp} | ${buildEventSummary(eventPayload)}`;
  eventsEl.prepend(item);
  while (eventsEl.children.length > 80) {
    eventsEl.removeChild(eventsEl.lastChild);
  }
}

function renderRecentEvents(events) {
  eventsEl.innerHTML = '';
  const items = Array.isArray(events) ? events.slice(-80) : [];
  for (const item of items) {
    prependEvent(item);
  }
}

async function loadRecentEvents() {
  const payload = await readJson('/api/v1/events/recent?limit=30');
  renderRecentEvents(payload.events || []);
}

function scheduleRefreshFromEvent() {
  if (state.pendingEventRefresh) {
    return;
  }

  state.pendingEventRefresh = true;
  setTimeout(() => {
    state.pendingEventRefresh = false;
    refresh().catch((error) => {
      statusEl.textContent = `Error refreshing dashboard: ${error.message}`;
    });
  }, 250);
}

function disconnectEventStream() {
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }
  if (state.eventRetryTimer) {
    clearTimeout(state.eventRetryTimer);
    state.eventRetryTimer = null;
  }
}

function connectEventStream() {
  if (state.eventSource) {
    return;
  }

  const source = new EventSource('/api/v1/events?limit=0');
  state.eventSource = source;

  source.onmessage = (messageEvent) => {
    let parsed;
    try {
      parsed = JSON.parse(messageEvent.data);
    } catch (error) {
      return;
    }

    prependEvent(parsed);

    const type = typeof parsed.type === 'string' ? parsed.type : '';
    if (
      type.startsWith('task.') ||
      type.startsWith('run.') ||
      type.startsWith('plugin.') ||
      type.startsWith('queue.') ||
      type.startsWith('workspace.') ||
      type.startsWith('edit.')
    ) {
      scheduleRefreshFromEvent();
    }
  };

  source.onerror = () => {
    if (state.eventSource) {
      state.eventSource.close();
      state.eventSource = null;
    }
    if (!state.eventRetryTimer) {
      state.eventRetryTimer = setTimeout(() => {
        state.eventRetryTimer = null;
        connectEventStream();
      }, 2000);
    }
  };
}

function isQueuePaused(statusPayload) {
  return Boolean(
    statusPayload &&
      statusPayload.components &&
      statusPayload.components.queueManager &&
      statusPayload.components.queueManager.paused
  );
}

function renderQueueControls(statusPayload) {
  const paused = isQueuePaused(statusPayload);
  const counts = statusPayload && statusPayload.counts && statusPayload.counts.byStatus ? statusPayload.counts.byStatus : {};
  const queuedCount = Number.isInteger(counts.queued) ? counts.queued : 0;
  const planningCount = Number.isInteger(counts.planning) ? counts.planning : 0;
  const runningCount = Number.isInteger(counts.running) ? counts.running : 0;
  const queueManager =
    statusPayload && statusPayload.components && statusPayload.components.queueManager
      ? statusPayload.components.queueManager
      : {};
  const maxWorkers = Number.isInteger(queueManager.maxConcurrentTasks) ? queueManager.maxConcurrentTasks : 0;
  const activeWorkers = Array.isArray(queueManager.activeTaskIds) ? queueManager.activeTaskIds.length : 0;
  const stateLabel = paused ? 'paused' : 'active';

  pauseQueueBtn.disabled = paused;
  resumeQueueBtn.disabled = !paused;
  cancelQueuedBtn.disabled = queuedCount < 1;
  queueSummaryEl.textContent = `Queue is ${stateLabel}. ${queuedCount} queued, ${planningCount} planning, ${runningCount} running. Active workers: ${activeWorkers}/${maxWorkers}.`;
  renderQueueStatusPills(statusPayload);
  setTaskStatusFilterControlState();
  setTaskSearchControlState();
}

async function refreshDetails() {
  if (!state.selectedTaskId) {
    selectedTaskLabelEl.textContent = 'Select a task to inspect details.';
    replayTaskBtn.disabled = true;
    cancelTaskBtn.disabled = true;
    renderTimeline([]);
    renderArtifacts([]);
    return;
  }

  const [task, artifactPayload] = await Promise.all([
    readJson(`/api/v1/tasks/${state.selectedTaskId}`),
    readJson(`/api/v1/tasks/${state.selectedTaskId}/artifacts`),
  ]);

  const commandCount = Array.isArray(task.commands) ? task.commands.length : 0;
  const workingDirectory = typeof task.workingDirectory === 'string' ? task.workingDirectory : '?';
  const priority = normalizeTaskPriority(task.priority);
  const statusLabel = formatTaskStatusLabel(task.status);
  const priorityLabel = formatTaskPriorityLabel(priority);
  const queueContext = formatTaskQueueContext(task);
  const dependencyContext = formatTaskDependencyContext(task);
  selectedTaskLabelEl.textContent = [
    `Task ${task.id}`,
    `Status: ${statusLabel}`,
    `Priority: ${priorityLabel}`,
    `Queue: ${queueContext}`,
    dependencyContext,
    `Model: ${task.modelId}`,
    `Commands: ${formatCountLabel(commandCount, 'command')}`,
    `Workspace: ${workingDirectory}`,
    `Timeout: ${task.commandTimeoutMs || 'default'} ms`,
  ].join('\n');
  replayTaskBtn.disabled = false;
  cancelTaskBtn.disabled = terminalStatuses.has(task.status);
  renderTimeline(task.timeline || []);
  renderArtifacts(artifactPayload.artifacts || []);
}

async function refresh() {
  if (state.isRefreshing) {
    return;
  }

  state.isRefreshing = true;
  try {
    const [status, modelPayload, taskPayload, runPayload, runTemplatePayload, pluginPayload, editPayload] = await Promise.all([
      readJson('/api/v1/status'),
      readJson('/api/v1/models'),
      readJson(buildTasksApiUrl()),
      readJson('/api/v1/runs?limit=80'),
      readJson('/api/v1/runs/templates').catch(() => ({ templates: [], defaultTemplateId: '' })),
      readJson('/api/v1/plugins?limit=80').catch(() => ({ plugins: [] })),
      readJson('/api/v1/edits?limit=80'),
    ]);

    state.models = modelPayload.models || [];
    state.tasks = taskPayload.tasks || [];
    state.runs = runPayload.runs || [];
    state.runTemplates = runTemplatePayload.templates || [];
    state.plugins = pluginPayload.plugins || [];
    state.edits = editPayload.edits || [];
    await refreshPluginCatalog().catch(() => {});
    await refreshPluginMarketplace().catch(() => {});

    renderStatus(status);
    renderQueueControls(status);
    renderModelOptions(state.models);
    renderCollaborativeTemplateOptions(state.runTemplates, runTemplatePayload.defaultTemplateId || '');
    renderSliceTasks();

    if (state.selectedTaskId && !state.tasks.some((task) => task.id === state.selectedTaskId)) {
      state.selectedTaskId = null;
    }
    if (!state.selectedTaskId && state.tasks.length) {
      state.selectedTaskId = state.tasks[0].id;
    }
    if (state.selectedRunId && !state.runs.some((run) => run.id === state.selectedRunId)) {
      state.selectedRunId = null;
    }
    if (!state.selectedRunId && state.runs.length) {
      state.selectedRunId = state.runs[0].id;
    }
    if (state.selectedPluginId && !state.plugins.some((plugin) => plugin.id === state.selectedPluginId)) {
      state.selectedPluginId = null;
    }
    if (!state.selectedPluginId && state.plugins.length) {
      state.selectedPluginId = state.plugins[0].id;
    }
    if (state.selectedEditId && !state.edits.some((edit) => edit.id === state.selectedEditId)) {
      state.selectedEditId = null;
    }
    if (!state.selectedEditId && state.edits.length) {
      state.selectedEditId = state.edits[0].id;
    }

    renderTasks(state.tasks);
    renderCollaborativeRuns(state.runs);
    renderPluginList(state.plugins);
    renderMarketplacePluginList(state.marketplacePlugins);
    renderEditList(state.edits);
    await refreshDetails();
    await refreshSelectedRunDetails();
    await refreshSelectedPluginDetail();
    await refreshSelectedEditDetails();
  } catch (error) {
    statusEl.textContent = `Error: ${error.message}`;
  } finally {
    state.isRefreshing = false;
  }
}

taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const prompt = taskPrompt.value.trim();
  if (!prompt) {
    return;
  }
  const commands = parseCommandsInput(taskCommands.value);
  const workingDirectory = taskWorkingDirectory.value;
  const priority = taskPriority.value;
  const dependsOn = parseDependsOnInput(taskDependsOn.value);

  try {
    await queueTaskWithCommands(prompt, taskModel.value, commands, workingDirectory, priority, dependsOn);
    taskPrompt.value = '';
    taskCommands.value = '';
    taskDependsOn.value = '';
    await refresh();
  } catch (error) {
    statusEl.textContent = `Error creating task: ${error.message}`;
  }
});

queueCollabBtn.addEventListener('click', async () => {
  const prompt = typeof collabPromptInput.value === 'string' ? collabPromptInput.value.trim() : '';
  if (!prompt) {
    collabOutput.textContent = 'Enter a shared objective first.';
    return;
  }

  const roles = parseCollaborativeRolesInput(collabRolesInput.value);
  queueCollabBtn.disabled = true;
  try {
    const created = await queueCollaborativeRun(prompt, roles);
    const runId = typeof created.runId === 'string' ? created.runId : created.id;
    if (runId) {
      state.selectedRunId = runId;
    }
    const taskLines = Array.isArray(created.tasks)
      ? created.tasks.map((task, index) => `${index + 1}. ${task.id} | ${task.status} | ${task.prompt.split('\n')[0]}`)
      : [];

    collabOutput.textContent = [
      `Run ID: ${runId || '(unknown)'}`,
      `Roles: ${(Array.isArray(created.roles) && created.roles.length ? created.roles.join(', ') : '(none)')}`,
      `Tasks: ${taskLines.length}`,
      '',
      ...taskLines,
    ].join('\n');
    await refresh();
  } catch (error) {
    collabOutput.textContent = `Error: ${error.message}`;
  } finally {
    queueCollabBtn.disabled = false;
  }
});

if (collabTemplateSelect) {
  collabTemplateSelect.addEventListener('change', () => {
    updateCollaborativeRolesFromTemplate(collabTemplateSelect.value || '');
  });
}

if (queueSpecializedCollabBtn) {
  queueSpecializedCollabBtn.addEventListener('click', async () => {
    const prompt = typeof collabPromptInput.value === 'string' ? collabPromptInput.value.trim() : '';
    if (!prompt) {
      collabOutput.textContent = 'Enter a shared objective first.';
      return;
    }

    const specialization = collabTemplateSelect ? (collabTemplateSelect.value || '').trim() : '';
    if (!specialization) {
      collabOutput.textContent = 'Select a specialized template first.';
      return;
    }

    queueSpecializedCollabBtn.disabled = true;
    try {
      const created = await queueSpecializedCollaborativeRun(prompt, specialization);
      const runId = typeof created.runId === 'string' ? created.runId : created.id;
      if (runId) {
        state.selectedRunId = runId;
      }
      updateCollaborativeRolesFromTemplate(specialization);
      const taskLines = Array.isArray(created.tasks)
        ? created.tasks.map((task, index) => `${index + 1}. ${task.id} | ${task.status} | ${task.prompt.split('\n')[0]}`)
        : [];

      collabOutput.textContent = [
        `Run ID: ${runId || '(unknown)'}`,
        `Template: ${created.templateLabel || created.templateId || specialization}`,
        `Roles: ${(Array.isArray(created.roles) && created.roles.length ? created.roles.join(', ') : '(none)')}`,
        `Tasks: ${taskLines.length}`,
        '',
        ...taskLines,
      ].join('\n');
      await refresh();
    } catch (error) {
      collabOutput.textContent = `Error queueing specialized run: ${error.message}`;
    } finally {
      queueSpecializedCollabBtn.disabled = false;
    }
  });
}

if (registerPluginBtn) {
  registerPluginBtn.addEventListener('click', () => {
    registerPluginFromInput().catch((error) => {
      pluginOutput.textContent = `Error registering plugin: ${error.message}`;
    });
  });
}

if (refreshPluginsBtn) {
  refreshPluginsBtn.addEventListener('click', () => {
    refresh().catch((error) => {
      pluginOutput.textContent = `Error refreshing plugins: ${error.message}`;
    });
  });
}

if (refreshPluginMarketplaceBtn) {
  refreshPluginMarketplaceBtn.addEventListener('click', () => {
    refreshPluginMarketplace().catch((error) => {
      pluginMarketplaceOutput.textContent = `Error refreshing marketplace: ${error.message}`;
    });
  });
}

if (importPluginMarketplaceBtn) {
  importPluginMarketplaceBtn.addEventListener('click', () => {
    importPluginMarketplaceFromUrl().catch((error) => {
      pluginMarketplaceOutput.textContent = `Error importing marketplace plugin: ${error.message}`;
    });
  });
}

if (installMarketplacePluginBtn) {
  installMarketplacePluginBtn.addEventListener('click', () => {
    installSelectedMarketplacePlugin().catch((error) => {
      pluginMarketplaceOutput.textContent = `Error installing marketplace plugin: ${error.message}`;
    });
  });
}

if (pluginMarketplaceQueryInput) {
  pluginMarketplaceQueryInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    refreshPluginMarketplace().catch((error) => {
      pluginMarketplaceOutput.textContent = `Error searching marketplace: ${error.message}`;
    });
  });
}

if (pluginMarketplaceImportUrlInput) {
  pluginMarketplaceImportUrlInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    importPluginMarketplaceFromUrl().catch((error) => {
      pluginMarketplaceOutput.textContent = `Error importing marketplace plugin: ${error.message}`;
    });
  });
}

if (updatePluginBtn) {
  updatePluginBtn.addEventListener('click', () => {
    updateSelectedPluginFromInput().catch((error) => {
      pluginOutput.textContent = `Error updating plugin: ${error.message}`;
    });
  });
}

if (healthcheckPluginBtn) {
  healthcheckPluginBtn.addEventListener('click', () => {
    runSelectedPluginHealthcheck().catch((error) => {
      pluginOutput.textContent = `Error running plugin healthcheck: ${error.message}`;
    });
  });
}

if (enablePluginBtn) {
  enablePluginBtn.addEventListener('click', () => {
    setSelectedPluginEnabled(true).catch((error) => {
      pluginOutput.textContent = `Error enabling plugin: ${error.message}`;
    });
  });
}

if (disablePluginBtn) {
  disablePluginBtn.addEventListener('click', () => {
    setSelectedPluginEnabled(false).catch((error) => {
      pluginOutput.textContent = `Error disabling plugin: ${error.message}`;
    });
  });
}

if (removePluginBtn) {
  removePluginBtn.addEventListener('click', () => {
    removeSelectedPlugin().catch((error) => {
      pluginOutput.textContent = `Error removing plugin: ${error.message}`;
    });
  });
}

sendRunFeedbackBtn.addEventListener('click', async () => {
  if (!state.selectedRunId) {
    collabOutput.textContent = 'Select a collaborative run first.';
    return;
  }

  const message = typeof collabFeedbackInput.value === 'string' ? collabFeedbackInput.value.trim() : '';
  if (!message) {
    collabOutput.textContent = 'Enter feedback text first.';
    return;
  }

  sendRunFeedbackBtn.disabled = true;
  try {
    await readJson(`/api/v1/runs/${state.selectedRunId}/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
      }),
    });
    collabFeedbackInput.value = '';
    collabOutput.textContent = `Feedback logged for run ${state.selectedRunId}.`;
    await refresh();
  } catch (error) {
    collabOutput.textContent = `Error logging run feedback: ${error.message}`;
  } finally {
    sendRunFeedbackBtn.disabled = false;
  }
});

selfHealRunBtn.addEventListener('click', async () => {
  if (!state.selectedRunId) {
    collabOutput.textContent = 'Select a collaborative run first.';
    return;
  }

  const confirmed = window.confirm('Queue a self-heal task for the selected run?');
  if (!confirmed) {
    return;
  }

  selfHealRunBtn.disabled = true;
  try {
    const payload = await readJson(`/api/v1/runs/${state.selectedRunId}/self-heal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    if (payload.task && payload.task.id) {
      state.selectedTaskId = payload.task.id;
    }
    collabOutput.textContent = `Self-heal queued for run ${state.selectedRunId} (task ${payload.task ? payload.task.id : 'n/a'}).`;
    await refresh();
  } catch (error) {
    collabOutput.textContent = `Error queueing self-heal: ${error.message}`;
    await refresh().catch(() => {});
  } finally {
    selfHealRunBtn.disabled = false;
  }
});

refreshBtn.addEventListener('click', () => {
  refresh().catch((error) => {
    statusEl.textContent = `Error refreshing dashboard: ${error.message}`;
  });
});

pauseQueueBtn.addEventListener('click', async () => {
  try {
    await readJson('/api/v1/queue/pause', {
      method: 'POST',
    });
    await refresh();
  } catch (error) {
    statusEl.textContent = `Error pausing queue: ${error.message}`;
  }
});

resumeQueueBtn.addEventListener('click', async () => {
  try {
    await readJson('/api/v1/queue/resume', {
      method: 'POST',
    });
    await refresh();
  } catch (error) {
    statusEl.textContent = `Error resuming queue: ${error.message}`;
  }
});

cancelQueuedBtn.addEventListener('click', async () => {
  const confirmed = window.confirm('Cancel all currently queued tasks?');
  if (!confirmed) {
    return;
  }

  try {
    await readJson('/api/v1/queue/cancel-queued', {
      method: 'POST',
    });
    await refresh();
  } catch (error) {
    statusEl.textContent = `Error cancelling queued tasks: ${error.message}`;
  }
});

taskFilterStatus.addEventListener('change', () => {
  applyTaskStatusFilter(taskFilterStatus.value || 'all').catch((error) => {
    statusEl.textContent = `Error applying status filter: ${error.message}`;
  });
});

taskFilterQuery.addEventListener('input', () => {
  state.taskFilterQuery = taskFilterQuery.value.trim();
  setTaskSearchControlState();
  refresh().catch((error) => {
    statusEl.textContent = `Error applying search filter: ${error.message}`;
  });
});

if (taskQuickFiltersEl) {
  taskQuickFiltersEl.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('button[data-status]') : null;
    if (!target) {
      return;
    }

    const filter = target.dataset.status || 'all';
    applyTaskStatusFilter(filter).catch((error) => {
      statusEl.textContent = `Error applying status filter: ${error.message}`;
    });
  });
}

if (clearTaskSearchBtn) {
  clearTaskSearchBtn.addEventListener('click', () => {
    if (!taskFilterQuery) {
      return;
    }
    taskFilterQuery.value = '';
    state.taskFilterQuery = '';
    setTaskSearchControlState();
    refresh().catch((error) => {
      statusEl.textContent = `Error clearing search filter: ${error.message}`;
    });
  });
}

cancelTaskBtn.addEventListener('click', async () => {
  if (!state.selectedTaskId) {
    return;
  }

  try {
    await readJson(`/api/v1/tasks/${state.selectedTaskId}/cancel`, {
      method: 'POST',
    });
    await refresh();
  } catch (error) {
    statusEl.textContent = `Error cancelling task: ${error.message}`;
  }
});

replayTaskBtn.addEventListener('click', async () => {
  if (!state.selectedTaskId) {
    return;
  }

  try {
    const replayed = await readJson(`/api/v1/tasks/${state.selectedTaskId}/replay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    state.selectedTaskId = replayed.id;
    await refresh();
  } catch (error) {
    statusEl.textContent = `Error replaying task: ${error.message}`;
  }
});

queueSliceBatchBtn.addEventListener('click', async () => {
  const remaining = suggestedSlices.filter((slice) => !hasSliceTask(slice.id)).slice(0, 3);
  if (!remaining.length) {
    statusEl.textContent = 'All suggested slice tasks are already queued.';
    return;
  }

  try {
    for (const slice of remaining) {
      await queueTask(slice.prompt, taskModel.value);
    }
    await refresh();
  } catch (error) {
    statusEl.textContent = `Error queueing slice batch: ${error.message}`;
  }
});

modelTestBtn.addEventListener('click', async () => {
  const prompt = modelTestPrompt.value.trim();
  if (!prompt) {
    modelTestOutput.textContent = 'Enter a prompt first.';
    return;
  }

  modelTestBtn.disabled = true;
  try {
    const response = await readJson('/api/v1/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        modelId: taskModel.value || undefined,
      }),
    });

    modelTestOutput.textContent = [
      `model: ${response.modelId}`,
      `provider: ${response.provider}`,
      `simulated: ${response.simulated}`,
      '',
      response.text || '(empty output)',
    ].join('\n');
  } catch (error) {
    modelTestOutput.textContent = `Error: ${error.message}`;
  } finally {
    modelTestBtn.disabled = false;
  }
});

async function loadAuditExport(format) {
  const payload = await fetch(`/api/v1/audit/export?format=${encodeURIComponent(format)}`);
  if (!payload.ok) {
    const errorBody = await payload.text();
    throw new Error(errorBody || `Audit export failed with status ${payload.status}`);
  }

  return payload.text();
}

function normalizeWorkspacePathInput() {
  return typeof workspacePathInput.value === 'string' ? workspacePathInput.value.trim() : '';
}

function normalizeEditPathInput() {
  return typeof editPathInput.value === 'string' ? editPathInput.value.trim() : '';
}

function normalizeEditSummaryInput() {
  if (typeof editSummaryInput.value !== 'string') {
    return '';
  }
  return editSummaryInput.value.trim();
}

function renderWorkspaceList(payload) {
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  const lines = [`Path: ${payload.path}`, `Entries: ${entries.length}`, ''];
  for (const entry of entries) {
    const size = Number.isInteger(entry.size) ? `${entry.size}b` : '-';
    const modified = entry.modifiedAt || '-';
    lines.push(`${entry.type.padEnd(9)} | ${size.padStart(8)} | ${modified} | ${entry.name}`);
  }
  workspaceOutput.textContent = lines.join('\n');
}

function renderWorkspaceFile(payload) {
  const lines = [
    `Path: ${payload.path}`,
    `Size: ${payload.size} bytes`,
    `Truncated: ${payload.truncated ? 'yes' : 'no'}`,
  ];
  if (payload.truncated) {
    lines.push(`Preview limited to ${payload.maxPreviewChars} characters.`);
  }
  lines.push('');
  lines.push(payload.content || '(empty file)');
  setWorkspaceEditorValue(payload.content || '');
  updateWorkspaceEditorLanguage(payload.path);
  workspaceSaveBtn.disabled = Boolean(payload.truncated);
  workspaceOutput.textContent = lines.join('\n');
}

async function loadWorkspaceListing() {
  const pathValue = normalizeWorkspacePathInput();
  if (!pathValue) {
    workspaceOutput.textContent = 'Enter a path first.';
    return;
  }

  workspaceListBtn.disabled = true;
  try {
    const payload = await readJson(`/api/v1/files?path=${encodeURIComponent(pathValue)}`);
    renderWorkspaceList(payload);
  } catch (error) {
    workspaceOutput.textContent = `Error: ${error.message}`;
  } finally {
    workspaceListBtn.disabled = false;
  }
}

async function loadWorkspaceFile() {
  const pathValue = normalizeWorkspacePathInput();
  if (!pathValue) {
    workspaceOutput.textContent = 'Enter a file path first.';
    return;
  }

  workspaceReadBtn.disabled = true;
  try {
    const payload = await readJson(`/api/v1/files/content?path=${encodeURIComponent(pathValue)}`);
    renderWorkspaceFile(payload);
  } catch (error) {
    workspaceOutput.textContent = `Error: ${error.message}`;
  } finally {
    workspaceReadBtn.disabled = false;
  }
}

async function saveWorkspaceFile() {
  const pathValue = normalizeWorkspacePathInput();
  if (!pathValue) {
    workspaceOutput.textContent = 'Enter a file path first.';
    return;
  }

  const confirmed = window.confirm(`Write changes to ${pathValue}?`);
  if (!confirmed) {
    return;
  }

  workspaceSaveBtn.disabled = true;
  try {
    const payload = await readJson('/api/v1/files/content', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: pathValue,
        content: getWorkspaceEditorValue(),
      }),
    });

    workspaceOutput.textContent = [
      `Saved: ${payload.path}`,
      `Existed: ${payload.existed ? 'yes' : 'no'}`,
      `Changed: ${payload.changed ? 'yes' : 'no'}`,
      `Size: ${payload.size} bytes`,
      `Previous Size: ${payload.previousSize} bytes`,
      `Max Write Chars: ${payload.maxWriteChars}`,
    ].join('\n');
  } catch (error) {
    workspaceOutput.textContent = `Error: ${error.message}`;
  } finally {
    workspaceSaveBtn.disabled = false;
  }
}

function formatEditRow(edit) {
  const shortId = typeof edit.id === 'string' ? edit.id.slice(0, 8) : 'unknown';
  const changedLines = Number.isInteger(edit.changedLines) ? edit.changedLines : 0;
  const pathValue = typeof edit.path === 'string' ? edit.path : '(unknown path)';
  const summary = typeof edit.summary === 'string' ? edit.summary : '';
  const summaryPreview = summary.length > 90 ? `${summary.slice(0, 90)}...` : summary;
  return `${shortId} | ${edit.status} | lines:${changedLines} | ${pathValue}\n${summaryPreview}`;
}

function renderEditList(edits) {
  editListEl.innerHTML = '';
  const items = Array.isArray(edits) ? edits : [];

  if (!items.length) {
    const item = document.createElement('li');
    item.className = 'empty-list-item';
    item.textContent = 'No edit proposals yet.';
    editListEl.appendChild(item);
    return;
  }

  for (const edit of items) {
    const selected = edit.id === state.selectedEditId;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = selected ? 'edit-row is-selected' : 'edit-row';
    button.textContent = formatEditRow(edit);
    button.addEventListener('click', () => {
      state.selectedEditId = edit.id;
      renderEditList(state.edits);
      refreshSelectedEditDetails().catch((error) => {
        editOutput.textContent = `Error: ${error.message}`;
      });
    });

    const item = document.createElement('li');
    item.appendChild(button);
    editListEl.appendChild(item);
  }
}

function setEditActionButtons(edit) {
  const pending = Boolean(edit && edit.status === 'pending');
  const applied = Boolean(edit && edit.status === 'applied');
  applyEditBtn.disabled = !pending;
  revertEditBtn.disabled = !applied;
  rejectEditBtn.disabled = !pending;
}

function renderEditDetails(edit) {
  if (!edit) {
    setEditActionButtons(null);
    editOutput.textContent = 'No edit proposal selected.';
    return;
  }

  updateEditProposalEditorLanguage(edit.path);

  const lines = [
    `ID: ${edit.id}`,
    `Path: ${edit.path}`,
    `Summary: ${edit.summary || '(none)'}`,
    `Status: ${edit.status}`,
    `Changed Lines: ${edit.changedLines}`,
    `Created At: ${edit.createdAt}`,
    `Updated At: ${edit.updatedAt}`,
  ];

  if (edit.appliedAt) {
    lines.push(`Applied At: ${edit.appliedAt}`);
  }
  if (edit.rejectedAt) {
    lines.push(`Rejected At: ${edit.rejectedAt}`);
  }
  if (edit.revertedAt) {
    lines.push(`Reverted At: ${edit.revertedAt}`);
  }

  if (edit.base && typeof edit.base === 'object') {
    lines.push(`Base: existed=${edit.base.existed ? 'yes' : 'no'}, size=${edit.base.size} bytes, sha256=${edit.base.sha256}`);
  }
  if (edit.proposal && typeof edit.proposal === 'object') {
    lines.push(`Proposal: size=${edit.proposal.size} bytes, sha256=${edit.proposal.sha256}`);
  }

  if (typeof edit.diffPreview === 'string' && edit.diffPreview) {
    lines.push('');
    lines.push('Diff Preview:');
    lines.push(edit.diffPreview);
  }

  setEditActionButtons(edit);
  editOutput.textContent = lines.join('\n');
}

async function refreshSelectedEditDetails() {
  if (!state.selectedEditId) {
    renderEditDetails(null);
    return;
  }

  const edit = await readJson(`/api/v1/edits/${state.selectedEditId}`);
  renderEditDetails(edit);
}

async function createEditProposal() {
  const pathValue = normalizeEditPathInput();
  if (!pathValue) {
    editOutput.textContent = 'Enter a path first.';
    return;
  }

  createEditBtn.disabled = true;
  try {
    const payload = await readJson('/api/v1/edits', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: pathValue,
        summary: normalizeEditSummaryInput() || undefined,
        content: getEditProposalEditorValue(),
      }),
    });
    state.selectedEditId = payload.id;
    renderEditDetails(payload);
    await refresh();
  } catch (error) {
    editOutput.textContent = `Error: ${error.message}`;
  } finally {
    createEditBtn.disabled = false;
  }
}

async function applySelectedEdit() {
  if (!state.selectedEditId) {
    editOutput.textContent = 'Select an edit proposal first.';
    return;
  }

  const confirmed = window.confirm('Apply the selected edit proposal?');
  if (!confirmed) {
    return;
  }

  applyEditBtn.disabled = true;
  revertEditBtn.disabled = true;
  rejectEditBtn.disabled = true;
  try {
    const payload = await readJson(`/api/v1/edits/${state.selectedEditId}/apply`, {
      method: 'POST',
    });
    renderEditDetails(payload);
    await refresh();
  } catch (error) {
    editOutput.textContent = `Error: ${error.message}`;
    await refresh().catch(() => {});
  }
}

async function rejectSelectedEdit() {
  if (!state.selectedEditId) {
    editOutput.textContent = 'Select an edit proposal first.';
    return;
  }

  const confirmed = window.confirm('Reject the selected edit proposal?');
  if (!confirmed) {
    return;
  }

  applyEditBtn.disabled = true;
  revertEditBtn.disabled = true;
  rejectEditBtn.disabled = true;
  try {
    const payload = await readJson(`/api/v1/edits/${state.selectedEditId}/reject`, {
      method: 'POST',
    });
    renderEditDetails(payload);
    await refresh();
  } catch (error) {
    editOutput.textContent = `Error: ${error.message}`;
    await refresh().catch(() => {});
  }
}

async function revertSelectedEdit() {
  if (!state.selectedEditId) {
    editOutput.textContent = 'Select an edit proposal first.';
    return;
  }

  const confirmed = window.confirm('Revert the selected applied edit proposal?');
  if (!confirmed) {
    return;
  }

  applyEditBtn.disabled = true;
  revertEditBtn.disabled = true;
  rejectEditBtn.disabled = true;
  try {
    const payload = await readJson(`/api/v1/edits/${state.selectedEditId}/revert`, {
      method: 'POST',
    });
    renderEditDetails(payload);
    await refresh();
  } catch (error) {
    editOutput.textContent = `Error: ${error.message}`;
    await refresh().catch(() => {});
  }
}

auditJsonBtn.addEventListener('click', async () => {
  auditJsonBtn.disabled = true;
  try {
    const content = await loadAuditExport('json');
    auditOutput.textContent = content;
  } catch (error) {
    auditOutput.textContent = `Error: ${error.message}`;
  } finally {
    auditJsonBtn.disabled = false;
  }
});

auditMdBtn.addEventListener('click', async () => {
  auditMdBtn.disabled = true;
  try {
    const content = await loadAuditExport('md');
    auditOutput.textContent = content;
  } catch (error) {
    auditOutput.textContent = `Error: ${error.message}`;
  } finally {
    auditMdBtn.disabled = false;
  }
});

workspaceListBtn.addEventListener('click', () => {
  loadWorkspaceListing().catch((error) => {
    workspaceOutput.textContent = `Error: ${error.message}`;
  });
});

workspaceReadBtn.addEventListener('click', () => {
  loadWorkspaceFile().catch((error) => {
    workspaceOutput.textContent = `Error: ${error.message}`;
  });
});

workspaceSaveBtn.addEventListener('click', () => {
  saveWorkspaceFile().catch((error) => {
    workspaceOutput.textContent = `Error: ${error.message}`;
  });
});

createEditBtn.addEventListener('click', () => {
  createEditProposal().catch((error) => {
    editOutput.textContent = `Error: ${error.message}`;
  });
});

refreshEditsBtn.addEventListener('click', () => {
  refresh().catch((error) => {
    editOutput.textContent = `Error: ${error.message}`;
  });
});

applyEditBtn.addEventListener('click', () => {
  applySelectedEdit().catch((error) => {
    editOutput.textContent = `Error: ${error.message}`;
  });
});

revertEditBtn.addEventListener('click', () => {
  revertSelectedEdit().catch((error) => {
    editOutput.textContent = `Error: ${error.message}`;
  });
});

rejectEditBtn.addEventListener('click', () => {
  rejectSelectedEdit().catch((error) => {
    editOutput.textContent = `Error: ${error.message}`;
  });
});

workspacePathInput.addEventListener('input', () => {
  workspaceSaveBtn.disabled = false;
  updateWorkspaceEditorLanguage(normalizeWorkspacePathInput());
});

editPathInput.addEventListener('input', () => {
  updateEditProposalEditorLanguage(normalizeEditPathInput());
});

clearEventsBtn.addEventListener('click', () => {
  eventsEl.innerHTML = '';
});

if (runtimeDiagnosticsBtn) {
  runtimeDiagnosticsBtn.addEventListener('click', async () => {
    runtimeDiagnosticsBtn.disabled = true;
    try {
      await loadRuntimeDiagnostics();
    } catch (error) {
      runtimeDiagnosticsOutput.textContent = `Error loading runtime diagnostics: ${error.message}`;
    } finally {
      runtimeDiagnosticsBtn.disabled = false;
    }
  });
}

if (reliabilityGatesBtn) {
  reliabilityGatesBtn.addEventListener('click', async () => {
    reliabilityGatesBtn.disabled = true;
    try {
      await loadReliabilityGates();
    } catch (error) {
      reliabilityGatesOutput.textContent = `Error loading reliability gates: ${error.message}`;
    } finally {
      reliabilityGatesBtn.disabled = false;
    }
  });
}

async function runRestoreDrill() {
  if (!restoreDrillOutput) {
    return;
  }

  restoreDrillBtn.disabled = true;
  restoreDrillOutput.textContent = 'Starting restore drill...';

  try {
    // Start the drill
    const startResult = await readJson('/api/v1/diagnostics/restore-drill/start', {
      method: 'POST',
    });

    const drillId = startResult.drill && startResult.drill.id;
    const taskId = startResult.drill && startResult.drill.taskId;
    restoreDrillOutput.textContent = `Drill started: ${drillId}\nTask: ${taskId}\nPolling for completion...`;

    // Poll for completion (max 45 seconds)
    const maxPolls = 45;
    const pollInterval = 1000; // 1 second

    for (let i = 0; i < maxPolls; i++) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      const latestResult = await readJson('/api/v1/diagnostics/restore-drill/latest');
      const drill = latestResult.drill;

      if (!drill || !drill.status) {
        continue;
      }

      const status = drill.status;
      const isTerminal = status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'timeout';

      if (isTerminal) {
        const lines = [
          `Drill ID: ${drill.id}`,
          `Status: ${status}`,
          '',
          'Evidence:',
        ];

        if (Array.isArray(drill.evidence)) {
          lines.push(...drill.evidence);
        }

        restoreDrillOutput.textContent = lines.join('\n');
        restoreDrillBtn.disabled = false;
        return;
      }

      restoreDrillOutput.textContent = `Drill started: ${drillId}\nTask: ${taskId}\nStatus: ${status} (polling ${i + 1}/${maxPolls})...`;
    }

    // Timeout after 45 seconds
    restoreDrillOutput.textContent = 'Drill timed out after 45 seconds.';
  } catch (error) {
    restoreDrillOutput.textContent = `Error running restore drill: ${error.message}`;
  } finally {
    restoreDrillBtn.disabled = false;
  }
}

if (restoreDrillBtn) {
  restoreDrillBtn.addEventListener('click', async () => {
    await runRestoreDrill();
  });
}

async function runReplayConsistency() {
  if (!replayConsistencyOutput) {
    return;
  }

  replayConsistencyBtn.disabled = true;
  replayConsistencyOutput.textContent = 'Starting replay consistency check...';

  try {
    // Start the replay consistency check
    const startResult = await readJson('/api/v1/diagnostics/replay-consistency/start', {
      method: 'POST',
    });

    if (startResult.error) {
      replayConsistencyOutput.textContent = `Error: ${startResult.error}`;
      replayConsistencyBtn.disabled = false;
      return;
    }

    const drillId = startResult.drill && startResult.drill.id;
    const sourceTaskId = startResult.drill && startResult.drill.sourceTaskId;
    const replayTaskId = startResult.drill && startResult.drill.replayTaskId;
    replayConsistencyOutput.textContent = `Consistency check started: ${drillId}\nSource: ${sourceTaskId}\nReplay: ${replayTaskId}\nPolling for completion...`;

    // Poll for completion (max 45 seconds)
    const maxPolls = 45;
    const pollInterval = 1000; // 1 second

    for (let i = 0; i < maxPolls; i++) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      const latestResult = await readJson('/api/v1/diagnostics/replay-consistency/latest');
      const drill = latestResult.drill;

      if (!drill || !drill.status) {
        continue;
      }

      const status = drill.status;
      const isTerminal = status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'timeout';

      if (isTerminal) {
        const lines = [
          `Drill ID: ${drill.id}`,
          `Status: ${status}`,
          '',
          'Evidence:',
        ];

        if (Array.isArray(drill.evidence)) {
          lines.push(...drill.evidence);
        }

        replayConsistencyOutput.textContent = lines.join('\n');
        replayConsistencyBtn.disabled = false;
        return;
      }

      replayConsistencyOutput.textContent = `Drill started: ${drillId}\nSource: ${sourceTaskId}\nReplay: ${replayTaskId}\nStatus: ${status} (polling ${i + 1}/${maxPolls})...`;
    }

    // Timeout after 45 seconds
    replayConsistencyOutput.textContent = 'Replay consistency check timed out after 45 seconds.';
  } catch (error) {
    replayConsistencyOutput.textContent = `Error running replay consistency check: ${error.message}`;
  } finally {
    replayConsistencyBtn.disabled = false;
  }
}

if (replayConsistencyBtn) {
  replayConsistencyBtn.addEventListener('click', async () => {
    await runReplayConsistency();
  });
}

async function runAllReliabilityChecks() {
  runAllReliabilityBtn.disabled = true;
  restoreDrillOutput.textContent = 'Running all reliability checks...';
  replayConsistencyOutput.textContent = 'Running all reliability checks...';
  
  try {
    // Step 1: Restore Drill
    await runRestoreDrill();
    
    // Step 2: Replay Consistency
    await runReplayConsistency();
    
    // Step 3: Reload Reliability Gates (which auto-records to history)
    await loadReliabilityGates();
    
    restoreDrillOutput.textContent += '\n\nAll reliability checks completed.';
    replayConsistencyOutput.textContent += '\n\nAll reliability checks completed.';
  } catch (error) {
    restoreDrillOutput.textContent += `\n\nError: ${error.message}`;
    replayConsistencyOutput.textContent += `\n\nError: ${error.message}`;
  } finally {
    runAllReliabilityBtn.disabled = false;
  }
}

if (runAllReliabilityBtn) {
  runAllReliabilityBtn.addEventListener('click', async () => {
    await runAllReliabilityChecks();
  });
}

if (simpleModeToggle) {
  simpleModeToggle.addEventListener('change', () => {
    setSimpleMode(simpleModeToggle.checked);
    if (state.simpleMode) {
      collapseAdvancedPanels();
    }
  });
}

if (collapseAdvancedBtn) {
  collapseAdvancedBtn.addEventListener('click', () => {
    if (state.simpleMode) {
      setSimpleMode(false);
      return;
    }
    setSimpleMode(true);
    collapseAdvancedPanels();
  });
}

if (expandPanelsBtn) {
  expandPanelsBtn.addEventListener('click', () => {
    expandVisiblePanels();
  });
}

window.addEventListener('beforeunload', () => {
  disconnectEventStream();
});

state.simpleMode = loadSimpleModePreference();
applyDashboardMode();
if (state.simpleMode) {
  collapseAdvancedPanels();
}
setTaskStatusFilterControlState();
setTaskSearchControlState();

initializeMonacoEditors();

loadRecentEvents().catch((error) => {
  eventsEl.innerHTML = '';
  const item = document.createElement('li');
  item.className = 'event-item';
  item.textContent = `Event history load failed: ${error.message}`;
  eventsEl.appendChild(item);
});

connectEventStream();

loadRuntimeDiagnostics().catch((error) => {
  if (runtimeDiagnosticsOutput) {
    runtimeDiagnosticsOutput.textContent = `Runtime diagnostics load failed: ${error.message}`;
  }
});

loadReliabilityGates().catch((error) => {
  if (reliabilityGatesOutput) {
    reliabilityGatesOutput.textContent = `Reliability gates load failed: ${error.message}`;
  }
});

setInterval(() => {
  refresh().catch((error) => {
    statusEl.textContent = `Error refreshing dashboard: ${error.message}`;
  });
}, 2000);

refresh().catch((error) => {
  statusEl.textContent = `Error initializing dashboard: ${error.message}`;
});
