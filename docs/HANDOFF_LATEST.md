# Handoff (Latest)

## Snapshot
- Folder: `D:\Dev\audit\20260223-182006\open-antigravity_snapshot`
- Archive: `D:\Dev\audit\20260223-182006\open-antigravity_snapshot\open-antigravity-working-tree.zip`
- Detailed summary: `D:\Dev\audit\20260223-182006\open-antigravity_snapshot\SNAPSHOT_SUMMARY.md`

## Resume Tomorrow
1. `Set-Location D:\open-antigravity`
2. `powershell -ExecutionPolicy Bypass -File .\scripts\vps_connect.ps1 -Sync -Deploy -UseSudo`
3. `vps_connect.ps1 -Sync -Deploy -UseSudo` deploys services on the VPS, but it does not create SSH tunnels.
4. Required for local browser access: `ssh -N -L 13100:127.0.0.1:3100 open-antigravity-vps`
5. Optional orchestrator tunnel: `ssh -N -L 14100:127.0.0.1:4100 open-antigravity-vps`
6. Open `http://localhost:13100`
7. Keep local Docker stopped unless you are explicitly doing local-container debugging.

## Last Known Healthy Checks
- `http://127.0.0.1:4100/health` (from VPS)
- `http://127.0.0.1:3100/health` (from VPS)
- `GET /v1/plugins/marketplace`
- `POST /v1/plugins/marketplace/install`

## Integration Tests
- `services/orchestrator/tests/orchestrator.test.js` and `services/web/tests/web.test.js` are external-service integration tests.
- If target services are offline, tests run in skip-pass mode (single warning) instead of failing with `AggregateError`.
- Strict verification mode:
  - Start services first (local or tunneled VPS), then run:
  - `npm --prefix services/orchestrator test -- --runInBand`
  - `npm --prefix services/web test -- --runInBand`
- Tunnel-targeted strict mode example:
  - `set ORCHESTRATOR_URL=http://127.0.0.1:14100`
  - `set WEB_URL=http://127.0.0.1:13100`

## Session Hygiene
- Do not open Notepad for this workflow. Use VS Code/terminal-based tools only.
- Do not leave one-off terminals open after commands finish.
- Do not leave temporary apps/processes open after validation (close shells, SSH tunnels, ad hoc terminals).
- For low-resource mode, do not run `docker compose up` locally during normal VPS-first development.
