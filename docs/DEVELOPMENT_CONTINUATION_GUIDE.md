# Open-Antigravity Development Continuation Guide

This guide is the operational playbook for continuing development in a stable, repeatable way across local machine and VPS.

Use this when you need:
- step by step local and VPS workflows
- dependency and environment setup
- credential and key management
- API usage examples
- storage and backup guidance
- regression protections and guardrails
- AI tooling workflow (Codex, Cline, Gemini, skills, MCP)

---

## 1. Current System Topology

Primary services:
- `services/orchestrator` (Node.js API and task runtime)
- `services/web` (Node.js static UI + `/api` proxy to orchestrator)
- optional `cloudflared` profile in Docker Compose
- optional `mitmserver` for request interception experiments

Standard local ports:
- Web UI: `3000`
- Orchestrator: `4000`

Common VPS host ports:
- Web host port: `3100`
- Orchestrator host port: `4100`

Common tunnel mapping:
- `localhost:13100 -> VPS:127.0.0.1:3100`

---

## 2. Dependency and Runtime Matrix

Host dependencies (VPS-first local machine):
- PowerShell 5+ (Windows workflows/scripts)
- OpenSSH client (`ssh`, `scp`)
- `tar`
- Node.js v20+ for syntax checks only

VPS dependencies:
- Docker Engine
- Docker Compose plugin (`docker compose`)

Repo runtime dependencies:
- `services/orchestrator`: Node built-ins only (no external deps)
- `services/web`: Node built-ins only (no external deps)
- `mitmserver`: `http-proxy`

Container base image:
- `node:22-alpine`

---

## 3. Environment and Key Management

### 3.1 Base env files

Repo files:
- template: `.env.example`
- active local env: `.env` (must remain uncommitted)

VPS env:
- `/opt/open-antigravity/.env`

Important behavior:
- `scripts/vps_connect.ps1 -Sync` excludes `.env` by design
- code sync happens, secrets do not

### 3.2 Global credential source

Preferred single source:
- `D:\Dev\global.env`

Sync command (local + VPS):
```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync_env_from_global.ps1 -UseSudo
```

Local only:
```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync_env_from_global.ps1 -SkipRemote
```

### 3.3 Key fields you should maintain

Model keys and endpoints:
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_API_KEY`
- `AZURE_FOUNDRY_API_KEY`
- `AZURE_FOUNDRY_CHAT_URL`
- `AZURE_FOUNDRY_API_VERSION`

Routing and auth:
- `MODEL_CATALOG`
- `MODEL_PROVIDER_OVERRIDES`
- `DEFAULT_MODELS`
- `ORCHESTRATOR_API_TOKEN`

Safety and network:
- `CORS_ALLOWED_ORIGINS`
- `ALLOW_INSECURE_MARKETPLACE_HTTP`

### 3.4 Storage and runtime controls

- `TASK_STORE_PATH` (default `/data/tasks.json`)
- `MAX_TASK_COMMANDS`
- `MAX_CONCURRENT_TASKS`
- `COMMAND_TIMEOUT_MS`
- `MODEL_GATEWAY_TIMEOUT_MS`
- `ALLOWED_COMMAND_PREFIXES`
- `ALLOWED_WORKSPACE_ROOTS`
- `DEFAULT_WORKING_DIRECTORY`

Additional hardening knobs used by orchestrator:
- `MAX_COMMAND_OUTPUT_CHARS`
- `EVENT_HISTORY_LIMIT`
- `EVENT_HEARTBEAT_MS`
- `PLUGIN_HEALTHCHECK_TTL_MS`
- `PLUGIN_MARKETPLACE_CATALOG`

---

## 4. Local Development Workflow (VPS-First, Low Resource)

### 4.1 Normal local workflow (recommended)

```powershell
Set-Location D:\open-antigravity
Copy-Item .env.example .env -ErrorAction SilentlyContinue
node --check .\services\orchestrator\server.js
node --check .\services\web\server.js
node --check .\services\web\public\app.js
```

Then deploy and run on VPS:
```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\vps_connect.ps1 -Sync -Deploy -UseSudo
ssh -N -L 13100:127.0.0.1:3100 open-antigravity-vps
```

Open:
- `http://localhost:13100`

### 4.2 Optional local container debugging (resource-heavy)

```powershell
docker compose up --build
Invoke-WebRequest -UseBasicParsing http://localhost:3000/health
Invoke-WebRequest -UseBasicParsing http://localhost:4000/health
```

Use this only when you intentionally need local containers. For normal development, keep local Docker stopped.

---

## 5. VPS Workflow

### 5.1 Connection and runtime status

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\vps_connect.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\vps_connect.ps1 -Status
```

### 5.2 Sync code only

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\vps_connect.ps1 -Sync -UseSudo
```

### 5.3 Sync + deploy containers

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\vps_connect.ps1 -Sync -Deploy -UseSudo
```

### 5.4 Optional tunnel profile

Set token in VPS `.env`, then:
```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\vps_connect.ps1 -Sync -DeployTunnel -UseSudo
```

### 5.5 Local port forward to VPS web UI

```powershell
ssh -N -L 13100:127.0.0.1:3100 open-antigravity-vps
```

Then open:
- `http://localhost:13100`

Important:
- This tunnel is required if you want to use `localhost:13100`.
- If `13100` is active, you are viewing VPS UI, not local UI.

---

## 6. API Usage Guide

Base URL choices:
- VPS via tunnel proxy: `http://localhost:13100/api`
- local orchestrator direct: `http://localhost:4000` (only when running local containers)
- local via web proxy: `http://localhost:3000/api` (only when running local containers)

### 6.1 Task lifecycle

Create:
```powershell
curl.exe -s -X POST http://localhost:13100/api/v1/tasks ^
  -H "Content-Type: application/json" ^
  -d "{\"prompt\":\"Create a hello-world endpoint\"}"
```

List:
```powershell
curl.exe -s http://localhost:13100/api/v1/tasks
```

Replay:
```powershell
curl.exe -s -X POST http://localhost:13100/api/v1/tasks/<task-id>/replay
```

Cancel:
```powershell
curl.exe -s -X POST http://localhost:13100/api/v1/tasks/<task-id>/cancel
```

### 6.2 Reliability diagnostics

Runtime:
```powershell
curl.exe -s http://localhost:13100/api/v1/diagnostics/runtime
```

Gates:
```powershell
curl.exe -s http://localhost:13100/api/v1/diagnostics/reliability-gates
```

Restore drill:
```powershell
curl.exe -s -X POST http://localhost:13100/api/v1/diagnostics/restore-drill/start
curl.exe -s http://localhost:13100/api/v1/diagnostics/restore-drill/latest
curl.exe -s http://localhost:13100/api/v1/diagnostics/restore-drill/<drill-id>
```

Replay consistency:
```powershell
curl.exe -s -X POST http://localhost:13100/api/v1/diagnostics/replay-consistency/start
curl.exe -s http://localhost:13100/api/v1/diagnostics/replay-consistency/latest
```

Recovery smoke:
```powershell
curl.exe -s -X POST http://localhost:13100/api/v1/diagnostics/recovery-smoke/start
curl.exe -s http://localhost:13100/api/v1/diagnostics/recovery-smoke/latest
```

History and report export:
```powershell
curl.exe -s http://localhost:13100/api/v1/diagnostics/reliability-history
curl.exe -s "http://localhost:13100/api/v1/diagnostics/reliability-report/export?format=json"
curl.exe -s "http://localhost:13100/api/v1/diagnostics/reliability-report/export?format=md"
```

For full diagnostics runbook, see:
- `docs/RELIABILITY_DIAGNOSTICS.md`

### 6.3 Filesystem and edit proposals

Read file:
```powershell
curl.exe -s "http://localhost:13100/api/v1/files/content?path=/tmp/example.txt"
```

Create edit proposal:
```powershell
curl.exe -s -X POST http://localhost:13100/api/v1/edits ^
  -H "Content-Type: application/json" ^
  -d "{\"path\":\"/tmp/example.txt\",\"content\":\"hello\"}"
```

---

## 7. Storage and Persistence Model

Primary persisted store:
- `TASK_STORE_PATH` (container default `/data/tasks.json`)
- Docker volume: `orchestrator_data` mapped to `/data`

Persistence behavior:
- debounced write (`persistTasksSoon`)
- atomic write (`writeFileAtomic`)
- data recovery on startup (`loadPersistedTasks`)

Persisted payload includes:
- `tasks`
- `runs`
- `plugins`
- `edits`
- `restoreDrills`
- `replayConsistencyRuns`
- `recoverySmokeRuns`
- `reliabilityHistory`

### 7.1 Backup and restore

VPS backup:
```powershell
ssh open-antigravity-vps "sudo -n cp /opt/open-antigravity/.env /opt/open-antigravity/.env.backup.$(date +%Y%m%d-%H%M%S)"
ssh open-antigravity-vps "docker volume inspect open-antigravity_orchestrator_data"
```

Task store copy:
```powershell
ssh open-antigravity-vps "sudo -n cp /var/lib/docker/volumes/open-antigravity_orchestrator_data/_data/tasks.json /tmp/tasks.json.backup"
```

---

## 8. Regression Protection Checklist

Use this for every meaningful slice.

### 8.1 Pre-change baseline

```powershell
curl.exe -s http://localhost:13100/api/v1/diagnostics/reliability-gates
curl.exe -s http://localhost:13100/api/v1/diagnostics/reliability-history
```

### 8.2 Local validation

```powershell
node --check .\services\orchestrator\server.js
node --check .\services\web\server.js
node --check .\services\web\public\app.js
```

### 8.3 Deploy and verify

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\vps_connect.ps1 -Sync -Deploy -UseSudo
curl.exe -s http://localhost:13100/api/v1/diagnostics/reliability-gates
curl.exe -s -X POST http://localhost:13100/api/v1/diagnostics/restore-drill/start
```

### 8.4 Contract checks for hardened diagnostics

Expect:
- first start call: `202`
- second concurrent start: `409`
- invalid drill id format: `400`
- extra path segments on drill-by-id route: `404`

---

## 9. Guardrails and Safety Controls

Implemented controls:
- command allowlist (`ALLOWED_COMMAND_PREFIXES`)
- command count and timeout limits
- working directory restricted to `ALLOWED_WORKSPACE_ROOTS`
- optional API token auth (`ORCHESTRATOR_API_TOKEN`, bearer or `x-api-key`)
- CORS allowlist (`CORS_ALLOWED_ORIGINS`)
- marketplace import URL hardening:
  - blocks localhost/private/loopback
  - HTTPS required unless explicitly overridden
  - blocks embedded credentials in URL
- reliability diagnostics hardening:
  - concurrent-run conflict protection
  - restore drill UUID validation
  - strict route matching for restore-drill-by-id

Operational guardrails:
- never commit `.env`
- keep local and VPS `.env` separate
- use `global.env` plus sync script for controlled secret propagation
- keep production-like keys on VPS only where possible

---

## 10. AI Tooling, Skills, and MCP Workflow

This repo currently includes:
- `.gemini/settings.json`
- `.gemini/gemini.prompt`

There is no repo-scoped MCP server config file yet.

### 10.1 Recommended agent workflow

For each slice:
1. define scope and acceptance checks
2. implement minimal diff
3. run syntax/contract checks
4. deploy to VPS
5. verify via tunnel endpoints/UI
6. update docs/roadmap

### 10.2 Codex and Cline usage pattern

Use a strict prompt template:
- objective
- exact files allowed
- safety constraints
- required checks and expected status codes
- required output format (commands + raw output + diff summary)

### 10.3 MCP strategy (recommended)

When you add MCP tooling, keep it least-privilege:
- read-only servers by default (docs, search, issue lookup)
- explicit write-capable servers only when needed
- isolated credentials per provider
- do not store MCP tokens in repo files

Suggested baseline MCP capabilities:
- filesystem (scoped to repo root)
- git
- HTTP/docs lookup
- browser automation (for UI regression checks)

Document future MCP config in:
- `docs/AI_TOOLING_AND_MCP.md` (recommended next doc)

---

## 11. Daily Operating Loop

Start of day:
1. `Set-Location D:\open-antigravity`
2. sync keys: `sync_env_from_global.ps1`
3. runtime status: `vps_connect.ps1 -Status`
4. open tunnel (`ssh -N -L 13100:127.0.0.1:3100 open-antigravity-vps`) for browser/API access
5. run baseline diagnostics

During development:
1. implement one slice
2. run syntax checks (no local Docker by default)
3. deploy to VPS
4. verify UI/API
5. update docs and roadmap

End of day:
1. export reliability report
2. create snapshot/backup of working tree and key docs
3. leave next-step checklist in handoff doc

---

## 12. Fast Troubleshooting

Symptom: UI does not show latest changes
- check if `localhost:13100` is SSH tunnel to VPS
- run sync + deploy
- hard refresh browser (`Ctrl+F5`)

Symptom: model calls fail
- verify keys in local/VPS `.env`
- verify outbound network from container host
- check `DOCKER-USER` egress rules

Symptom: writes blocked
- verify `workingDirectory` is absolute and inside allowlisted roots
- verify command is in allowlist

Symptom: diagnostics endpoint fails
- check orchestrator health first
- check latest container logs
- run reliability gates endpoint and inspect details/evidence

---

## 13. Source References

Primary implementation files:
- `services/orchestrator/server.js`
- `services/web/server.js`
- `services/web/public/app.js`
- `docker-compose.yml`
- `.env.example`
- `scripts/vps_connect.ps1`
- `scripts/sync_env_from_global.ps1`
- `docs/VPS_CONNECTION.md`
- `docs/RELIABILITY_DIAGNOSTICS.md`
