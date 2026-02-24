# Roadmap: AEI | Autonomous Engineering Intelligence

## High-Level Summary

Create an agent-first development environment where AI agents can plan, write, run, debug, test, and verify software using an IDE, terminal, browser, and artifact system. The core pillars include agent orchestration, verifiable artifacts, secure tool access, and a trustworthy development workflow.

---

## Scope Reset (2026-02-23): Single-User First

### Active Scope

- Optimize for one developer running locally or on a private VPS.
- Deliver the core loop: plan -> execute -> verify artifacts -> retry/accept.
- Focus on stability, deterministic behavior, and easy recovery.
- Keep model-provider flexibility (OpenAI, Anthropic, Google, and local models when available).

### Deferred Scope

- Multi-user workspaces, sharing, and concurrent collaboration.
- Public plugin marketplace and ecosystem distribution features.
- Enterprise/compliance controls (SOC2, SSO, RBAC).
- Billing, tenancy, and go-to-market packaging.

### Phase Priority Override

Use this roadmap as a complete backlog, but run execution in this order:

1. Single-user UX depth and reliability.
2. Single-user performance and safety hardening.
3. Deferred multi-user/commercial expansion.

---

## Phase 0 — Discovery & Constraints (2–4 weeks)

### Objectives

- Understand Antigravity’s core UX patterns: agent manager, editor integration, artifacts, multi-agent coordination.
- Define MVP functional boundaries for a single primary user (indie developer / solo operator).
- Identify compliance, safety, and data privacy constraints.
- Estimate budget, infrastructure, hosting model, and team composition.

### Key Decisions

- OS support for MVP (start with macOS or Linux).
- Supported programming languages (pick one—Python or JS/TS).
- LLM providers and fallback model strategy.
- Security posture, sandboxing, logging expectations.

---

## Phase 1 — Core Architecture & Backend (COMPLETED)

### Core System Components

1. **Agent Manager / Orchestrator**
   - Manages lifecycle, role assignment, execution priority, and task queues.
   - Responsible for single-agent execution state and queued task ordering for one user.

2. **Frontend IDE / Editor**
   - Build a standalone desktop app OR extend VS Code.
   - Must expose APIs for file edits, navigation, running code, opening terminals.

3. **Tooling Bridge Layer**
   - Secure sandboxed adapters for filesystem, CLI, browser automation, test runners.
   - Permission scoping required.

4. **Model Runtime Layer**
   - Connect to multiple models via a plug-and-play abstraction.
   - Support both short-lived stateless calls and persistent agent sessions.

5. **Artifact Storage System**
   - Store execution plans, diffs, logs, screenshots, test results, recordings.
   - Provide tamper-evident trust surface.

6. **Policy & Safety Enforcement**
   - Runtime permissions.
   - Audit logging.
   - High-risk action approvals.

7. **Observability & Diagnostics**
   - Real-time event streams, logs, performance analytics.

### Architecture Patterns

- Event-driven or queue-based agent execution.
- Microservice or modular monolith with well-defined boundaries.
- Clear separation between execution, language-model reasoning, and UI.

---

## Phase 2 — MVP Feature Set (IN PROGRESS)

### Minimum Capabilities Required

1. Agent sidebar integrated into the IDE.
2. Ability to read/edit files and propose changes through diffs or PR-style flows.
3. Terminal adapter capable of executing commands and gathering results.
4. Artifact system UI—displays generated plans, logs, diffs, screenshots.
5. Model switching and fallback between providers.
6. Workspace sandboxing + audit logs for transparency.
7. Basic developer trust mechanisms—undo, revert, confirmation UI.

### Additional Nice-to-Haves

- One-click runnable demos.
- Shared telemetry dashboard (opt-in).
- Issue-to-fix workflows via task assignment.

---

## Phase 3 — Advanced Feature Expansion (8–16 weeks)

### Platform Evolution

- Status: deferred until single-user UX and reliability milestones are complete.

1. **Multi-Agent Systems**
   - Agents specializing in testing, documentation, planning, UI flows, refactoring.
   - Task decomposition and cooperative execution.

2. **Browser Automation**
   - Playwright/Puppeteer integration.
   - Live interaction, screenshots, session recordings.

3. **Human-in-the-Loop Approvals**
   - Deployment gating.
   - Database migration safety checks.

4. **Artifact Verification**
   - Signed builds, reproducible test execution, provenance metadata.

5. **Plugin Ecosystem**
   - Third-party agents, tool adapters, UI extensions.

6. **Enterprise Features**
   - SOC2, SSO, RBAC, secret vaults.

---

## Technical Stack Recommendations

### Frontend / Desktop

- VS Code extension + webview OR Electron/Tauri app.
- React/TypeScript UI.
- Monaco editor integration.

### Backend

- Node.js or Python API service.
- Postgres for metadata.
- S3-compatible object store for artifacts.

### Agent Runtime

- Kubernetes or containerized workers.
- Redis or Kafka for job queueing.

### LLM & Reasoning Layer

- Providers: OpenAI, Google, Anthropic, open-source local models.
- Routing based on cost, latency, and task type.

### Automation & Execution

- Playwright for browser automation.
- Ephemeral workspaces for safety.

### Security Foundation

- Sandboxed processes.
- Token-scoped permissions.
- Full action audit timeline.

---

## UX Principles

- **Artifacts before trust** — don’t ask users to believe output, let them verify it.
- **Explainability by default** — always show reasoning, diffs, logs.
- **Reversible actions** — every change must be undoable.
- **Transparency over autonomy** — agents are collaborators, not silent actors.

---

## Testing, Validation & Safety Strategy

- Unit and integration test suites for agent behavior.
- Red-teaming for prompt injection and sandbox escape.
- Fuzz testing tooling adapters.
- Replay tests verifying artifact determinism.
- Mandatory review checkpoints for sensitive actions.

---

## Success Metrics

- Task completion rate without human intervention.
- Time-to-artifact.
- Developer trust feedback score.
- Cost per completed agent workflow.
- Frequency of rollback or blocked execution due to safety mechanisms.

---

## 6-Month Execution Timeline

### Month 1

- Architecture, research, infra setup.

### Month 2

- Editor integration + single agent + file read/write.

### Month 3

- Terminal adapter + artifact system + UI layer.

### Month 4

- Browser automation + model routing.

### Month 5

- Single-user hardening, restore drills, and performance tuning.

### Month 6

- Single-user release candidate, tutorials, and onboarding pipeline.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-------------|
| Hallucinated code changes | Require artifacts + test enforcement |
| Data leakage | Sandboxing, scoped permissions |
| Model cost scaling | Local LLM fallback + batching |
| Developer distrust | Clear action visibility + reversible edits |

---

## Implementation Checklist

- [ ] IDE host + UI shell
- [ ] Agent execution runtime
- [ ] Filesystem + terminal adapters
- [ ] Browser automation adapter
- [ ] Artifact API + viewer
- [ ] Audit logging + policy engine
- [ ] Model router + fallback logic
- [ ] Preview docs + onboarding
- [x] Single-user reliability gates (restore drill, failure recovery, deterministic replay)

### Reliability Development Slices (Implemented 2026-02-23)

| Slice | Feature | Status |
|-------|---------|--------|
| S1 | Restore Drill Runner | ✅ Implemented |
| S2 | Replay Consistency Diagnostics | ✅ Implemented |
| S3 | Recovery Smoke Diagnostics | ✅ Implemented |
| S4 | Reliability History/Trends | ✅ Implemented |
| S5 | Run All Reliability Checks | ✅ Implemented |
| S6 | Reliability Report Export (JSON/MD) | ✅ Implemented |
| S7 | Docs Alignment | ✅ Implemented |
| S8 | Hardening Pass | 🟡 In Progress |

#### API Endpoints Added

- `POST /v1/diagnostics/restore-drill/start` - Start restore drill
- `GET /v1/diagnostics/restore-drill/latest` - Get latest drill result
- `GET /v1/diagnostics/restore-drill/:id` - Get drill result by ID
- `POST /v1/diagnostics/replay-consistency/start` - Start replay consistency check
- `GET /v1/diagnostics/replay-consistency/latest` - Get latest consistency result
- `POST /v1/diagnostics/recovery-smoke/start` - Start recovery smoke test
- `GET /v1/diagnostics/recovery-smoke/latest` - Get latest smoke test result
- `GET /v1/diagnostics/reliability-gates` - Get current reliability gates
- `GET /v1/diagnostics/reliability-history` - Get reliability check history
- `GET /v1/diagnostics/reliability-report/export?format=json|md` - Export reliability report

Reliability runbook:

- [docs/RELIABILITY_DIAGNOSTICS.md](./docs/RELIABILITY_DIAGNOSTICS.md)
- [docs/DEVELOPMENT_CONTINUATION_GUIDE.md](./docs/DEVELOPMENT_CONTINUATION_GUIDE.md)

S8 hardening progress (current):

- Added concurrent-run guards for restore drill, replay consistency, and recovery smoke (`409 Conflict` when already running).
- Added strict UUID validation for `GET /v1/diagnostics/restore-drill/:id`.
- Tightened restore drill route matching to avoid accepting extra path segments.
- Normalized diagnostic synthetic-task creation failures to client errors (`400`) rather than server errors (`500`).

Deferred after single-user release:

- [ ] Multi-agent orchestration
- [ ] Marketplace and ecosystem distribution
- [ ] Enterprise controls (RBAC, SSO, compliance)

---

## Final Notes

Start small—prove reliable, verifiable, trustworthy AI execution inside a development environment. Then expand agents, platforms, languages, and enterprise adoption. The winning differentiator isn’t autonomy—it’s **confidence, clarity, and control**.
