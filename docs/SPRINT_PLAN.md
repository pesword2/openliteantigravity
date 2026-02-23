# Open-Antigravity 30-Day Sprint Plan

**Generated:** 2026-02-23  
**Project:** open-antigravity - Agent-First Development Environment  
**Mode:** Single-User MVP

---

## SPRINT GOALS

### Primary Objective
Complete single-user MVP with reliable agent execution, marketplace features, and editor integration.

### Success Metrics
- Task completion rate without human intervention
- Time-to-artifact
- Developer trust feedback score
- All health endpoints returning 200

---

## WEEKLY PLAN

### Week 1: Marketplace & Plugin Hardening

| Day | Work Package | Deliverable | Proof Gate |
|-----|--------------|-------------|------------|
| 1-2 | **WP1.1**: Marketplace source expansion | Manifest URL import + checksum metadata | `GET /v1/plugins/marketplace` returns signed manifests |
| 3-4 | **WP1.2**: Plugin lifecycle hardening | Persist marketplace install metadata | Install metadata visible in plugin detail |
| 5 | **WP1.3**: Uninstall/reinstall UX | UI shows uninstall option | Marketplace list shows uninstall button |

**Dependencies:** None (current features)  
**Risk Level:** Medium

---

### Week 2: Monaco Editor Integration

| Day | Work Package | Deliverable | Proof Gate |
|-----|--------------|-------------|------------|
| 6-7 | **WP2.1**: Monaco-in-web setup | Monaco panel loads in webview | Editor visible at `/` |
| 8-9 | **WP2.2**: File API wiring | Open/save via Monaco | Can edit and save files |
| 10 | **WP2.3**: Integration testing | E2E flow test | Open → Edit → Save → Verify |

**Dependencies:** WP1.1, WP1.2  
**Risk Level:** High (Monaco complexity)

---

### Week 3: Reliability & Hardening

| Day | Work Package | Deliverable | Proof Gate |
|-----|--------------|-------------|------------|
| 11-12 | **WP3.1**: Complete S8 hardening | All concurrent-run guards active | 409 on duplicate diagnostic runs |
| 13-14 | **WP3.2**: Restore drill verification | Full restore test | `/v1/diagnostics/restore-drill/latest` passes |
| 15 | **WP3.3**: Recovery smoke test | Queue pause/resume/cancel | Smoke test completes successfully |

**Dependencies:** WP2.1  
**Risk Level:** Low

---

### Week 4: Integration & Polish

| Day | Work Package | Deliverable | Proof Gate |
|-----|--------------|-------------|------------|
| 16-18 | **WP4.1**: Agent sidebar + terminal | Agent executes commands | Command output returned |
| 19-20 | **WP4.2**: Artifact system UI | Plans, logs, diffs visible | Artifacts displayed in web UI |
| 21-22 | **WP4.3**: Model switching | Switch between providers | OpenAI/Anthropic/Google work |
| 23-25 | **WP4.4**: E2E user journey | Complete plan→execute→verify | Full loop functional |
| 26-28 | **WP4.5**: Docs cleanup | README normalization | No encoding artifacts |
| 29-30 | **WP4.6**: Final smoke tests | All health checks pass | Deploy to VPS |

**Dependencies:** WP3.1, WP3.2, WP3.3  
**Risk Level:** Medium

---

## PROOF GATES

| Gate | Endpoint | Expected Result |
|------|----------|-----------------|
| Health Gate | `GET /health` | 200 on ports 3000, 4000 |
| Marketplace Gate | `GET /v1/plugins/marketplace` | Plugin list returned |
| Install Gate | `POST /v1/plugins/marketplace/install` | Plugin installed |
| Editor Gate | Web UI | Monaco loads and saves |
| Agent Gate | `POST /v1/tasks` | Task executes |
| Reliability Gate | `GET /v1/diagnostics/reliability-gates` | All gates pass |

---

## RISKS

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Monaco integration complexity | High | Medium | Use Monaco CDN wrapper, minimal config |
| VPS deployment failures | Medium | High | Test locally with docker-compose first |
| Model API key issues | Low | High | Support local fallback models |
| Browser compatibility | Low | Medium | Test on Chrome, Firefox, Edge |

---

## DE-SCOPE OPTIONS

If behind schedule, defer in order:

1. ~~Docs cleanup~~ (manual later)
2. Multi-provider model switching (single provider)
3. Artifact verification signatures
4. Advanced terminal features

---

## RESUME COMMANDS

```powershell
# Local development
cd D:\open-antigravity
docker-compose up -d

# Connect to VPS (from HANDOFF_LATEST.md)
powershell -ExecutionPolicy Bypass -File .\scripts\vps_connect.ps1 -Sync -Deploy -UseSudo

# Health checks
curl http://localhost:3000/health   # Web
curl http://localhost:4000/health   # Orchestrator
```

---

## CURRENT STATE (from TONIGHT_SUMMARY.md)

### Completed
- ✅ VPS workflow stabilization
- ✅ Plugin registry backend (catalog, update, healthcheck)
- ✅ Plugin dashboard UX (update, healthcheck, status)
- ✅ Phase 4 local marketplace (GET/POST endpoints)
- ✅ Manager View marketplace UI
- ✅ Deploy and smoke-test on VPS

### In Progress
- 🟡 S8 Hardening Pass (concurrent-run guards, UUID validation)

### Recommended Next Tasks (from handoff)
1. Marketplace source expansion (manifest URL import + checksum)
2. Plugin lifecycle hardening (persist install metadata)
3. Monaco-in-web integration slice
4. Docs cleanup (README encoding)

---

*This sprint plan aligns with the ROADMAP.md Phase priorities: single-user UX depth → reliability hardening → multi-user expansion*
