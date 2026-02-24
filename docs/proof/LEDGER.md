# AEI Proof Ledger

## DONE

### WP 1.1 - Native PM2 Stack Transition

- **Description**: Migrated from Docker-only to a native PM2-managed stack on Windows.
- **Verification**: Services running under PM2 (orchestrator, web, browser).
- **Date**: 2026-02-24

### WP 1.2 - Autonomous Command Extraction Logic

- **Description**: Implemented `extractCommandsFromText` to parse markdown code blocks in model outputs.
- **Verification**: Successful extraction of multi-line commands in test tasks.
- **Date**: 2026-02-24

### WP 1.3 - Windows PowerShell (.ps1) Execution Adapter

- **Description**: Re-engineered `runSingleCommand` to use temporary `.ps1` files to solve brittle quoting/tokenization on Windows.
- **Verification**: Ability to run complex `curl` and `echo` strings without termination errors.
- **Date**: 2026-02-24

### WP 1.4 - Browser Automation Service

- **Description**: Created a Playwright-based REST service for headless web interaction.
- **Verification**: `open-antigravity-browser` online at port 14200.
- **Date**: 2026-02-24

### WP 1.5 - Inter-Agent Communication Bus

- **Description**: Added `parentTaskId` and implemented `/v1/tasks/:id/wait` endpoint for synchronous agent cascades.
- **Verification**: Task queue correctly tracks parent-child hierarchy.
- **Date**: 2026-02-24

### WP 2.1 - Core Reliability Hardening (UI & Parser)

- **Description**: Improved UI visibility for Parent IDs and enhanced parser to support ^ and ` continuations.
- **Verification**: Task Queue UI shows "Parent: [ID]" labels.
- **Date**: 2026-02-24

### WP 2.3 - Robotic Protocol & Dynamic Dispatch

- **Description**: Injected the "Robotic Protocol" into autonomous tasks to force code-block use and PowerShell best practices.
- **Verification**: Agents now consistently use "Invoke-RestMethod" and ` blocks.
- **Date**: 2026-02-24

### WP 2.4 - Role Instruction Precision

- **Description**: Hardened role instructions for "researcher" and "qa_engineer" with explicit API endpoints.
- **Verification**: Reduced agent hallucinations regarding internal service discovery.
- **Date**: 2026-02-24

### WP 2.5 - Observability Hardening

- **Description**: Modified orchestrator to preserve "model-output" artifacts even if execution fails.
- **Verification**: Full visibility into agent "intent" post-crash.
- **Date**: 2026-02-24

### WP 2.6 - Persistence Hardening

- **Description**: Restored "parentTaskId" and "isAutonomous" flags during server re-hydration.
- **Verification**: Agent cascades survive service restarts.
- **Date**: 2026-02-24

### WP 2.7 - Premium Mission Control UI

- **Description**: Full redesign of the web dashboard with Inter/Outfit fonts, Dark Mode, and Glassmorphism.
- **Verification**: Modern 3-column layout with real-time timeline pulses and rich artifact cards.
- **Date**: 2026-02-24

### WP 3.1 - Collaborative Verification Loops

- **Description**: Implemented task handover logic that injects artifacts from dependency tasks into the prompts of subsequent roles (Verifier/Tester).
- **Verification**: New magic prefix \@auto-verify\ correctly spawns a collaborative Executor -> Verifier loop.
- **Date**: 2026-02-24

### WP 3.2 - Project Rebranding: AEI

- **Description**: Renamed project from Open-Antigravity to AEI (Autonomous Engineering Intelligence) across UI, backend diagnostics, and documentation.
- **Verification**: UI header shows AEI; /v1/status report headers updated.
- **Date**: 2026-02-24

### WP 3.3 - Maintenance & Architecture Offloading

- **Description**: Queued 3 major technical debt/maintenance tasks using the @auto-verify protocol to demonstrate handover reliability.
- **Verification**: Tasks visible in the 'Operation' view with dependency chains established.
- **Date**: 2026-02-24

### WP 4.1 - Neural OS MCP Server Integration

- **Description**: Integrated @modelcontextprotocol/sdk to expose native tools (\dispatch_task\, \
ead_ledger\) on the orchestrator via SSE.
- **Verification**: Port 4000 serves /mcp/sse and /mcp/messages handling Model Context Protocol connections securely.
- **Date**: 2026-02-24

### WP 4.2 - VPS Architecture & SSH Tunnelling

- **Description**: Corrected deployment topology mapping the local development frontend (AG) directly to the IONOS VPS (AEI) orchestrator via SSH port forwarding, matching the "Neural OS" design.
- **Verification**: Web UI reads and dispatches tasks directly into the VPS Docker containers.
- **Date**: 2026-02-24

### WP 4.3 - Live Token Streaming Console

- **Description**: Added real-time token streaming to the Azure Foundry API provider and built a frontend console UI to visualize agent "thinking" synchronously.
- **Verification**: Verified using live GPT-4.1 generation; terminal shows blinking cursor and token-by-token readout.
- **Date**: 2026-02-24

### WP 4.4 - Postgres Ledger Base Migration
- **Description**: Upgraded the local task.json state to be structurally mirrored into a Postgres Database running in Docker using 'pgPool' and ON CONFLICT DO UPDATE transactions.
- **Verification**: Verified using Adminer UI on port 8080 and live PostgreSQL query verifying rows load seamlessly into Docker volumes payload.
- **Date**: 2026-02-24
