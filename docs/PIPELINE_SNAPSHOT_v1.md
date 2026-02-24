# AEI Pipeline Snapshot v1

**Date:** 2026-02-24
**Status:** FULLY FUNCTIONAL MVP STACK
**Project Name:** AEI (Autonomous Engineering Intelligence) (formerly Open-Antigravity)

## 1. Executive Summary

AEI is an Agent-First Development Environment that lets autonomous agents (Codex, Cline, etc.) dynamically plan, write, test, and verify software using a remote engine.
The system operates using a "Local Frontend, Remote Brain" topology. The developer runs a UI on their local laptop, while the heavy lifting (Orchestrator Engine, Database, Visual Browser, and Workspace File I/O Sandbox) runs inside specialized Docker containers on an IONOS VPS.

## 2. Infrastructure Topology

### Local Machine (Windows)

- **Codebase location:** `D:\open-antigravity`
- **UI Service (PM2):** Serves `services/web` to `http://localhost:13100` targeting remote proxy ports.
- **SSH Tunnels:**
  - `4000:127.0.0.1:4000` (Orchestrator Engine / MCP Endpoint)
  - `8080:127.0.0.1:8080` (Adminer PostgreSQL Visual viewer)
  - `3100:127.0.0.1:3100` (Remote UI fallback)
  - `14200:127.0.0.1:14200` (Remote Playwright Browser)

### IONOS VPS (Linux)

- **Deployment Location:** `/opt/open-antigravity`
- **Docker Compose Stack:**
  - **`open-antigravity-orchestrator-1` (Port 4000):** The Brain. Node service running HTTP REST and MCP SSE Endpoints.
  - **`open-antigravity-web-1` (Port 3100):** Remote dashboard container (optional usage).
  - **`open-antigravity-db-1` (Port 5432):** PostgreSQL 15 persistent memory core for tasks/artifacts.
  - **`open-antigravity-adminer-1` (Port 8080):** Postgres schema management UI.
  - **`open-antigravity-browser-1` (Port 14200):** Debian headless Playwright environment for agent vision tasks.

## 3. Data & Persistence

- **Tasks Ledger:** Tasks started on the UI or via MCP are recorded immediately in memory and PostgreSQL via `persistTasksToLedger()` on `INSERT ... ON CONFLICT DO UPDATE`.
- **Workspace Sandbox:** Agent modifications to physical files using MCP tools explicitly operate inside a `/workspaces` mapped directory `(/opt/open-antigravity/workspaces)` bound to the Orchestrator on the VPS.

## 4. MCP Agent Integration Workflow

An agent like Cline natively links to AEI's internal loop using an active MCP Server located at `http://localhost:4000/mcp/sse`.

**Available Neural OS MCP Tools:**

1. `dispatch_task`
2. `read_ledger`
3. `read_file`
4. `write_file`

These endpoints inherently restrict bounds based on environment scopes (like `ALLOWED_WORKSPACE_ROOTS`) for safety.

## 5. Development Pipeline

1. Developer authors task specs or edits code locally on Windows (`D:\...`).
2. Verification tests run using `npm test`.
3. Changes pushed to VPS via `<root>\scripts\vps_connect.ps1 -Sync -Deploy -UseSudo`
4. Container restarts rapidly via Docker builder.
5. User confirms deployment visually on `http://localhost:13100`.
6. Changes logged in `<root>\docs\proof\LEDGER.md`.
