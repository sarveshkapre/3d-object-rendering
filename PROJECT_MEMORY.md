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
- 2026-02-10 | Add `smoke:preview:full` to validate production `dist/` + `/api` proxy in one command | Maintainers need a repeatable full-stack verification path that exercises the real `preview:full` server | `npm run smoke:preview:full` | (pending) | high | trusted
- 2026-02-10 | Run `smoke:api` in CI | Unit tests do not guarantee the API boots and serves real HTTP responses; a fast smoke step catches regressions early | `npm run smoke:api` | (pending) | high | trusted
- 2026-02-09 | Add WebGL context loss recovery overlay + stop rendering on loss | Kiosk sessions can freeze silently on context loss; prompt for reload and avoid noisy render loops | `npm run build`, `npm run smoke:kiosk` | b3b3f41 | high | trusted
- 2026-02-09 | Add `preview:full` to serve `dist/` with `/api` proxy | Validating production builds requires same-origin API; a local proxy server makes this a one-command workflow | `npm run build` + preview:full smoke curl | 91e891a | high | trusted
- 2026-02-09 | Make API retention configurable and allow disabling raw event storage | Keep long-running kiosk stores bounded and reduce disk churn while preserving counters | `npm test`, `npm run smoke:api` | 534fb7d | high | trusted
- 2026-02-09 | Add artifact catalog validation to tests | Catch data consistency mistakes (ids/categories/tours/hotspots) before they ship | `npm test` | 8a266ee | high | trusted
- 2026-02-09 | Add CMS input guards (length clamps + URL protocol allowlist) | Prevent stored `javascript:` links and unbounded text from entering the viewer via curator tooling | `npm test`, `npm run smoke:api` | ea8b8b1 | high | trusted
- 2026-02-09 | Add insights sparklines from server poll history | Deltas alone hide longer-term direction; sparklines make trends readable in kiosk ops | `npm run build` | 13c383e | high | trusted
- 2026-02-09 | Add GitHub Actions CI (test + build) | Ensure production readiness is continuously validated on pushes | GitHub Actions run `21815851401` passed | 078d4fc | high | trusted
- 2026-02-09 | Share CMS sanitization rules across server + Curator UI and surface client-side validation | Reduce curator surprise and keep moderation payloads aligned with what the server will store | `npm test`, `npm run build`, CI `21823772145` | 750d7ee | high | trusted
- 2026-02-09 | Add loading overlay retry + low-load render mode | Prevent kiosk sessions from getting stranded after transient model load failures | `npm run build`, CI `21823901570` | d2975c7 | high | trusted
- 2026-02-09 | Add `assets:check` and run it as part of `npm run build` | Fail fast if deployments ship without the referenced GLBs | `npm run assets:check`, `npm run build`, CI `21823929667` | 402b120 | high | trusted
- 2026-02-09 | Add "Copy metrics" export from insights panel | Give docents a one-click reporting path without screenshots | `npm run build`, CI `21823978445` | 9f9dff7 | medium | trusted
- 2026-02-09 | Add persistent low-load toggle + keyboard shortcut | Let operators explicitly trade fidelity for stability without waiting for load failures | `npm test`, `npm run build` | 89f6630 | high | trusted
- 2026-02-09 | Add snapshot capture export | Enable a reliable PNG capture path for docent reporting (single and compare modes) | `npm test`, `npm run build` | 4f5c50b | high | trusted
- 2026-02-09 | Add kiosk browser smoke script | Catch regressions across core kiosk flows with a runnable, end-to-end browser script | `npm run smoke:kiosk` | 83404b6 | medium | trusted
- 2026-02-09 | Fall back gracefully when WebGL is unavailable | Prevent total app failure on constrained/locked-down devices; keep narrative UX usable and make smoke automation reliable | `npm run smoke:kiosk`, `npm run build` | 3735822 | high | trusted

## Mistakes And Fixes
- Template: YYYY-MM-DD | Issue | Root cause | Fix | Prevention rule | Commit | Confidence
- 2026-02-09 | `hidden` overlays intercepted clicks in some browsers | `.shortcuts-modal { display: grid; }` overrode the UA `[hidden] { display: none; }` rule due to higher specificity | Add explicit `[hidden] { display: none !important; }` in app CSS | Always define an explicit `[hidden]` rule when using `hidden` for stateful overlays; cover with a browser smoke check | 3735822 | high

## Known Risks
- WebGL fallback mode positions hotspot dots heuristically (no camera projection) and exports placeholder snapshot imagery; consider surfacing a clearer UI badge and/or a dedicated "renderer unavailable" panel if this shows up in real deployments.
- WebGL context loss recovery currently prompts for reload (no in-place renderer re-init); acceptable for kiosks, but consider implementing an in-app restart path if reload is operationally expensive.

## Next Prioritized Tasks
- 2026-02-09 scoring (1-5; higher is better except risk where lower is better):
  - `accessibility-audit`: impact 4, effort 3, strategic fit 5, differentiation 3, risk 2, confidence 3
  - `smoke-preview-full-stack`: impact 3, effort 1, strategic fit 4, differentiation 1, risk 1, confidence 3
  - `model-diagnostics`: impact 3, effort 3, strategic fit 3, differentiation 2, risk 2, confidence 2
  - `ar-entrypoint`: impact 3, effort 3, strategic fit 3, differentiation 3, risk 2, confidence 2
  - `api-store-migrations`: impact 2, effort 2, strategic fit 3, differentiation 1, risk 2, confidence 2
  - `viewer-error-telemetry`: impact 2, effort 2, strategic fit 3, differentiation 2, risk 2, confidence 2

## Verification Evidence
- Template: YYYY-MM-DD | Command | Key output | Status (pass/fail)
- 2026-02-10 | `npm test` | `pass 7` | pass
- 2026-02-10 | `npm run smoke:api` | health + ingest + counters ok | pass
- 2026-02-10 | `npm run smoke:preview:full` | `preview / ok`, `preview /api/health ok` | pass
- 2026-02-09 | `npm test` | `pass 3` | pass
- 2026-02-09 | `npm run smoke:api` | health + ingest + counters ok | pass
- 2026-02-09 | `npm run build` | vite build ok | pass
- 2026-02-09 | `npm run preview -- --host 127.0.0.1 --port 4173` + `curl -I http://127.0.0.1:4173/` | `HTTP/1.1 200 OK` | pass
- 2026-02-09 | GitHub Actions workflow `ci` | run `21815851401` passed | pass
- 2026-02-09 | `npm run assets:check` | `assets:check ok (3 referenced models)` | pass
- 2026-02-09 | GitHub Actions workflow `ci` | runs `21823772145`, `21823901570`, `21823929667`, `21823978445` passed | pass
- 2026-02-09 | `KEEP_SMOKE_ARTIFACTS=1 npm run smoke:kiosk` | `smoke:kiosk ok` | pass
- 2026-02-09 | `npm test` | `pass 7` | pass
- 2026-02-09 | `npm run build` | vite build ok | pass
- 2026-02-09 | `npm run smoke:api` | health + ingest + counters ok | pass
- 2026-02-09 | `KEEP_SMOKE_ARTIFACTS=0 npm run smoke:kiosk` | `smoke:kiosk ok` | pass
- 2026-02-09 | `API_PORT=<free> PREVIEW_PORT=<free> node scripts/preview-full-stack.mjs` + `curl -I http://127.0.0.1:$PREVIEW_PORT/` + `curl http://127.0.0.1:$PREVIEW_PORT/api/health` | `HTTP/1.1 200 OK`, `{ ok: true }` | pass

## Historical Summary
- Keep compact summaries of older entries here when file compaction runs.
