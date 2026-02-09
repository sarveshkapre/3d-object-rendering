# Project Memory

## Objective
- Keep 3d-object-rendering production-ready. Current focus: Artifact Viewer. Find the highest-impact pending work, implement it, test it, and push to main.

## Architecture Snapshot
- Frontend: Vite + vanilla JS + Three.js viewer (`src/viewer.js`) with Artifact Viewer shell in `src/main.js`.
- Backend: Node HTTP server (`server/index.js`) with JSON file store for analytics + CMS submissions/overrides/revisions.

## Open Problems
- None urgent as of 2026-02-09; remaining work is mostly UX polish + hardening + automated smoke coverage.

## Recent Decisions
- Template: YYYY-MM-DD | Decision | Why | Evidence (tests/logs) | Commit | Confidence (high/medium/low) | Trust (trusted/untrusted)
- 2026-02-09 | Add CMS input guards (length clamps + URL protocol allowlist) | Prevent stored `javascript:` links and unbounded text from entering the viewer via curator tooling | `npm test`, `npm run smoke:api` | ea8b8b1 | high | trusted
- 2026-02-09 | Add insights sparklines from server poll history | Deltas alone hide longer-term direction; sparklines make trends readable in kiosk ops | `npm run build` | 13c383e | high | trusted
- 2026-02-09 | Add GitHub Actions CI (test + build) | Ensure production readiness is continuously validated on pushes | GitHub Actions run `21815851401` passed | 078d4fc | high | trusted

## Mistakes And Fixes
- Template: YYYY-MM-DD | Issue | Root cause | Fix | Prevention rule | Commit | Confidence

## Known Risks
- CMS validation exists server-side, but Curator UI does not yet show field-level validation feedback; users may be surprised when URLs are dropped/clamped.

## Next Prioritized Tasks
- 2026-02-09 scoring (1-5; higher is better except risk where lower is better):
  - `playwright-kiosk-smoke`: impact 5, effort 3, strategic fit 5, differentiation 2, risk 2, confidence 3
  - `curator-client-validation`: impact 4, effort 2, strategic fit 5, differentiation 2, risk 2, confidence 4
  - `viewer-load-retry`: impact 4, effort 2, strategic fit 4, differentiation 2, risk 2, confidence 4
  - `accessibility-audit`: impact 4, effort 3, strategic fit 5, differentiation 3, risk 2, confidence 3
  - `asset-bundling-health`: impact 3, effort 2, strategic fit 4, differentiation 1, risk 1, confidence 4

## Verification Evidence
- Template: YYYY-MM-DD | Command | Key output | Status (pass/fail)
- 2026-02-09 | `npm test` | `pass 3` | pass
- 2026-02-09 | `npm run smoke:api` | health + ingest + counters ok | pass
- 2026-02-09 | `npm run build` | vite build ok | pass
- 2026-02-09 | `npm run preview -- --host 127.0.0.1 --port 4173` + `curl -I http://127.0.0.1:4173/` | `HTTP/1.1 200 OK` | pass
- 2026-02-09 | GitHub Actions workflow `ci` | run `21815851401` passed | pass

## Historical Summary
- Keep compact summaries of older entries here when file compaction runs.
