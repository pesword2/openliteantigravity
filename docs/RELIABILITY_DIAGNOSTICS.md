# Reliability Diagnostics Runbook

This runbook covers the single-user reliability diagnostics surface implemented in the orchestrator and exposed in the dashboard.

## Scope
- Validate restore/replay readiness for one developer environment (local or private VPS).
- Produce evidence that can be reviewed later (`history` and exported report).

## Endpoints

Base URL options:
- Direct orchestrator: `http://localhost:4000`
- Through web proxy: `http://localhost:3000/api`
- Through VPS tunnel example: `http://localhost:13100/api`

| Endpoint | Purpose |
|---|---|
| `GET /v1/diagnostics/runtime` | Runtime snapshot (queue, storage, model config, limits, counts). |
| `GET /v1/diagnostics/reliability-gates` | Gate verdicts (`pass`/`warn`/`fail`) and recommended actions. |
| `POST /v1/diagnostics/restore-drill/start` | Start restore drill and return drill/task IDs. |
| `GET /v1/diagnostics/restore-drill/latest` | Latest restore drill result. |
| `GET /v1/diagnostics/restore-drill/:id` | Specific restore drill result by ID. |
| `POST /v1/diagnostics/replay-consistency/start` | Start replay consistency check. |
| `GET /v1/diagnostics/replay-consistency/latest` | Latest replay consistency result. |
| `POST /v1/diagnostics/recovery-smoke/start` | Start recovery smoke check. |
| `GET /v1/diagnostics/recovery-smoke/latest` | Latest recovery smoke result. |
| `GET /v1/diagnostics/reliability-history` | Historical reliability snapshots. |
| `GET /v1/diagnostics/reliability-report/export?format=json|md` | Export consolidated report in JSON or Markdown. |

## Recommended Operator Flow

1. Check baseline gates:
```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:13100/api/v1/diagnostics/reliability-gates
```

2. Start a restore drill and keep the returned `drill.id`:
```powershell
(Invoke-WebRequest -UseBasicParsing -Method Post http://localhost:13100/api/v1/diagnostics/restore-drill/start).Content
```

3. Poll by ID until terminal status (`completed`, `failed`, `cancelled`, `timeout`):
```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:13100/api/v1/diagnostics/restore-drill/<drill-id>
```

4. Run replay consistency and recovery smoke:
```powershell
Invoke-WebRequest -UseBasicParsing -Method Post http://localhost:13100/api/v1/diagnostics/replay-consistency/start
Invoke-WebRequest -UseBasicParsing -Method Post http://localhost:13100/api/v1/diagnostics/recovery-smoke/start
```

5. Export final report:
```powershell
Invoke-WebRequest -UseBasicParsing "http://localhost:13100/api/v1/diagnostics/reliability-report/export?format=md"
```

## Dashboard Mapping

Manager View -> `Runtime Diagnostics` module:
- `Refresh Runtime Diagnostics` -> `GET /v1/diagnostics/runtime`
- `Refresh Reliability Gates` -> `GET /v1/diagnostics/reliability-gates`
- `Run Restore Drill` -> `POST /v1/diagnostics/restore-drill/start` + polling latest
- `Run Replay Consistency` -> `POST /v1/diagnostics/replay-consistency/start` + polling latest
- `Run All Reliability Checks` -> runs restore, replay consistency, then reloads gates

