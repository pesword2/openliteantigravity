# AEI Architecture & Infrastructure

Formerly known as **Open-Antigravity**.

The AEI project operates on an Orchestrator/Task-Ledger model, where the local Windows machine acts purely as an authoring API environment, while all AI-heavy processing occurs asynchronously on an isolated IONOS `.vps`.

### Local vs. Remote Roles

1. **Local (Windows `D:\open-antigravity`)**:
   - Stores code modifications before push.
   - Hosts the `13100` PM2 dashboard pointing its API layer over `SSH` into port `4000` on the VPS.
   - Deploys changes using `scripts\vps_connect.ps1 -Sync -Deploy -UseSudo`.
2. **Remote (IONOS VPS `/opt/open-antigravity`)**:
   - `docker-compose.yml` mounts 4 distinct services.
   - **orchestrator**: A Node app processing an advanced task priority queue.
   - **db**: PostgreSQL instance persisting the task ledger using `node-pg`.
   - **adminer**: Visual database UI for manual intervention.
   - **browser**: A separate headless Playwright container for UI visual checks and navigations.

**Core Design Rule:** Never commit the `.env` file since tokens live securely on the VPS. Always run the `-Sync` parameter so scripts only mount non-sensitive configuration to the host.

### Task Flow

1. User provides prompt via UI.
2. Next.JS Dashboard creates JSON task to `POST /v1/tasks`.
3. Orchestrator places task on memory queue, dual writes to PostgreSQL `tasks` table.
4. Worker unspools task, calls Model Gateway for generation.
5. Emits real time status to `mcp/sse` channels or local polling tools.
