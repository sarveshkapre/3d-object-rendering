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
- 2026-02-09 | Share CMS sanitization rules across server + Curator UI and surface client-side validation | Reduce curator surprise and keep moderation payloads aligned with what the server will store | `npm test`, `npm run build`, CI `21823772145` | 750d7ee | high | trusted
- 2026-02-09 | Add loading overlay retry + low-load render mode | Prevent kiosk sessions from getting stranded after transient model load failures | `npm run build`, CI `21823901570` | d2975c7 | high | trusted
- 2026-02-09 | Add `assets:check` and run it as part of `npm run build` | Fail fast if deployments ship without the referenced GLBs | `npm run assets:check`, `npm run build`, CI `21823929667` | 402b120 | high | trusted
- 2026-02-09 | Add "Copy metrics" export from insights panel | Give docents a one-click reporting path without screenshots | `npm run build`, CI `21823978445` | 9f9dff7 | medium | trusted

## Mistakes And Fixes
- Template: YYYY-MM-DD | Issue | Root cause | Fix | Prevention rule | Commit | Confidence

## Known Risks
- Low-load mode is currently activated via the retry overlay; there is no persistent UI toggle to return to high-quality rendering in-session.

## Next Prioritized Tasks
- 2026-02-09 scoring (1-5; higher is better except risk where lower is better):
  - `playwright-kiosk-smoke`: impact 5, effort 3, strategic fit 5, differentiation 2, risk 2, confidence 3
  - `accessibility-audit`: impact 4, effort 3, strategic fit 5, differentiation 3, risk 2, confidence 3
  - `viewer-snapshot`: impact 3, effort 2, strategic fit 4, differentiation 2, risk 1, confidence 3
  - `ar-entrypoint`: impact 3, effort 3, strategic fit 3, differentiation 3, risk 2, confidence 2
  - `analytics-retention-policy`: impact 3, effort 2, strategic fit 4, differentiation 1, risk 2, confidence 3

## Verification Evidence
- Template: YYYY-MM-DD | Command | Key output | Status (pass/fail)
- 2026-02-09 | `npm test` | `pass 3` | pass
- 2026-02-09 | `npm run smoke:api` | health + ingest + counters ok | pass
- 2026-02-09 | `npm run build` | vite build ok | pass
- 2026-02-09 | `npm run preview -- --host 127.0.0.1 --port 4173` + `curl -I http://127.0.0.1:4173/` | `HTTP/1.1 200 OK` | pass
- 2026-02-09 | GitHub Actions workflow `ci` | run `21815851401` passed | pass
- 2026-02-09 | `npm run assets:check` | `assets:check ok (3 referenced models)` | pass
- 2026-02-09 | GitHub Actions workflow `ci` | runs `21823772145`, `21823901570`, `21823929667`, `21823978445` passed | pass

## Historical Summary
- Keep compact summaries of older entries here when file compaction runs.
