const statusEl = document.querySelector('#status');
const modelsEl = document.querySelector('#models');
const tasksEl = document.querySelector('#tasks');
const taskForm = document.querySelector('#task-form');
const taskPrompt = document.querySelector('#task-prompt');

async function readJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with status ${response.status}`);
  }
  return payload;
}

function renderModels(models) {
  modelsEl.innerHTML = '';
  for (const model of models) {
    const item = document.createElement('li');
    item.textContent = `${model.id} (${model.provider})`;
    modelsEl.appendChild(item);
  }
}

function renderTasks(tasks) {
  tasksEl.innerHTML = '';
  if (!tasks.length) {
    const item = document.createElement('li');
    item.textContent = 'No tasks queued yet.';
    tasksEl.appendChild(item);
    return;
  }

  for (const task of tasks) {
    const item = document.createElement('li');
    item.textContent = `${task.id.slice(0, 8)} | ${task.status} | ${task.prompt}`;
    tasksEl.appendChild(item);
  }
}

async function refresh() {
  try {
    const [status, models, tasks] = await Promise.all([
      readJson('/api/v1/status'),
      readJson('/api/v1/models'),
      readJson('/api/v1/tasks'),
    ]);

    statusEl.textContent = JSON.stringify(status, null, 2);
    renderModels(models.models || []);
    renderTasks(tasks.tasks || []);
  } catch (error) {
    statusEl.textContent = `Error: ${error.message}`;
  }
}

taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const prompt = taskPrompt.value.trim();
  if (!prompt) {
    return;
  }

  try {
    await readJson('/api/v1/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt }),
    });
    taskPrompt.value = '';
    await refresh();
  } catch (error) {
    statusEl.textContent = `Error creating task: ${error.message}`;
  }
});

refresh();
