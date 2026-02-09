# Clone Feature Tracker

## Context Sources
- README and docs
- TODO/FIXME markers in code
- Test and build failures
- Gaps found during codebase exploration

## Candidate Features To Do
- [ ] `viewer-snapshot` (P2): Add a "Snapshot" action that downloads a PNG of the active canvas (and, in compare mode, supports capturing both panes) for exhibit reports and docent training materials.
- [ ] `playwright-kiosk-smoke` (P2): Add a scripted browser smoke flow that verifies gallery search, hotspot keyboard navigation, compare mode + sync, and tour controls in one run (`npm run smoke:kiosk`).
- [ ] `accessibility-audit` (P2): Tighten overlay and modal accessibility (focus trap, focus restore, aria attributes, keyboard reachability) and add regression checks for keyboard-only kiosk flows.
- [ ] `analytics-retention-policy` (P2): Add configurable retention (events + submissions) so long-running kiosks do not bloat the JSON store indefinitely.
- [ ] `preview-full-stack` (P3): Add a `npm run preview:full` path that runs API + preview together so maintainers can validate production build behavior without relying on `vite` dev proxying.
- [ ] `webgl-context-loss-recovery` (P3): Detect WebGL context loss and show a recovery overlay (reload / retry / low-load suggestion) so kiosks do not silently freeze.
- [ ] `artifact-data-validate` (P3): Add catalog validation in `npm test` (unique ids, referenced `modelUrl` exists, hotspots/tour ids consistent) to prevent runtime surprises.
- [ ] `model-diagnostics` (P3): Add a lightweight diagnostics panel (triangle/mesh counts, texture count/size, renderer capabilities, WebGL context hints) to shorten model QA loops.
- [ ] `ar-entrypoint` (P3): Add an optional "View in AR" entry point for mobile devices (Android Scene Viewer, iOS Quick Look) when models are compatible.

## Implemented
- 2026-02-09 · `viewer-low-load-toggle`: Added a persistent toolbar toggle + `L` keyboard shortcut for low-load mode (reduced DPR + shadows off), persisted the preference via local storage, and documented the capability. Evidence: `index.html`, `src/main.js`, `README.md`, `npm test`, `npm run build`.
- 2026-02-09 · `curator-client-validation`: Added Curator Editor client-side counters + validity indicators (length/range/URL protocol), and sanitized curator payloads using shared CMS rules so submissions match server behavior before moderation. Evidence: `shared/cms.js`, `src/main.js`, `src/style.css`, `server/index.js`, `npm test`, `npm run build`.
- 2026-02-09 · `viewer-load-retry`: Added retry controls directly in the loading overlays and introduced a "Low load" render mode (reduced DPR + shadows off) to recover from flaky loads on kiosk hardware. Evidence: `index.html`, `src/main.js`, `src/style.css`, `src/viewer.js`, `npm run build`.
- 2026-02-09 · `asset-bundling-health`: Added `npm run assets:check` and wired it into `npm run build` so missing `public/models/*.glb` files fail fast in local and CI builds. Evidence: `scripts/check-assets.mjs`, `package.json`, `README.md`, `npm run assets:check`, `npm run build`.
- 2026-02-09 · `insights-export`: Added a "Copy metrics" action in the insights panel that exports a concise text summary to the clipboard for docent reports. Evidence: `src/main.js`, `src/style.css`, `npm run build`.
- 2026-02-09 · `ci-github-actions`: Added a minimal GitHub Actions workflow that runs `npm test` + `npm run build` on pushes/PRs so the repo stays production-ready. Evidence: `.github/workflows/ci.yml`, GitHub Actions run `21815851401`.
- 2026-02-09 · `insights-sparkline-history`: Captured a rolling history of server poll snapshots and rendered per-metric sparklines in the insights panel so trend direction is visible at a glance. Evidence: `src/main.js`, `src/style.css`, `README.md`, `npm run build`.
- 2026-02-09 · `cms-input-guards`: Enforced URL/protocol allowlists plus max field lengths on CMS overrides and moderation reasons, dropping unsafe `javascript:` links and clamping runaway payloads. Evidence: `server/index.js`, `server/index.test.js`, `npm test`, `npm run smoke:api`.
- 2026-02-08 · `store-concurrency-guard`: Replaced per-request file loading with an in-memory store plus serialized mutation queue, and fixed data directory creation to respect custom `API_STORE_PATH` values. Evidence: `server/index.js`, `npm test`, `npm run smoke:api`.
- 2026-02-08 · `server-regression-tests`: Added Node integration coverage for parallel analytics ingest and CMS approve/delete/restore flows (including auth checks) by launching the real API process. Evidence: `server/index.test.js`, `package.json`, `npm test`.
- 2026-02-08 · `insights-trend-deltas`: Added per-metric delta badges in the insights panel and snapshot diffing logic so kiosk staff can see change since the previous poll. Evidence: `src/main.js`, `src/style.css`, `README.md`, `npm run build`.
- 2026-02-08 · `api-smoke-script`: Added a maintainers' smoke command that boots the API on a temporary port/store and validates health + analytics endpoints with real HTTP calls. Evidence: `scripts/smoke-api.mjs`, `package.json`, `npm run smoke:api`.
- 2026-02-08 · `docs-and-tracker-sync`: Updated runbook docs for verification commands and captured cycle outcomes/backlog updates in the tracker. Evidence: `README.md`, `CLONE_FEATURES.md`.
- 2026-02-08 · `compare-sync-memory`: Persisted compare partners per artifact and the sync toggle preference in local storage, respected deep links without clobbering user overrides, refreshed idle reset and docs so compare mode reopens in the last-used configuration. Evidence: `src/main.js`, `README.md`, `npm run build`.
- 2026-02-08 · `compare-insights`: Added compare session tracking, a top partner leaderboard, and analytics plumbing so the insights panel reflects how often visitors pair each artifact. Evidence: `src/main.js`, `src/style.css`, `server/index.js`, `README.md`, `npm run build`.
- 2026-02-08 · `moderation-diff-highlights`: Rebuilt the moderation diff viewer with syntax-highlighted JSON, inline field callouts, and before/after summaries so reviewers can decide faster without parsing raw blobs. Evidence: `index.html`, `src/main.js`, `src/style.css`, `README.md`, `npm run build`.
- 2026-02-08 · `search-highlight`: Added semantic `<mark>`-based highlighting hooked into the normalized search index so gallery chips, hotspot lists, and story paragraphs immediately show why a query matched. Evidence: `src/main.js`, `src/style.css`, `README.md`, `npm run build`.
- 2026-02-08 · `search-rich-metadata`: Expanded gallery search to use a normalized, diacritic-insensitive index that includes story body, references, hotspot metadata, and keywords for each artifact. Evidence: `src/main.js`, `npm run build`.
- 2026-02-08 · `share-native`: Added Web Share API handling (with clipboard backup) that flushes the deep-link URL before launching native share sheets, tracks share outcomes, and updates docs. Evidence: `src/main.js`, `README.md`, `server/index.js`, `npm run build`.
- 2026-02-08 · `search-shortcut`: Added Cmd/Ctrl+K focus handling with platform-aware hinting, cross-panel closing, analytics tracking, and refreshed docs/styles so kiosk operators can jump into artifact search instantly. Evidence: `index.html`, `src/main.js`, `src/style.css`, `README.md`, `npm run build`.
- 2026-02-08 · `kiosk-idle-reset`: Introduced a configurable `?idle=` URL param that watches keyboard, pointer, and touch activity to snap kiosks back to the featured artifact, default preset, and hotspot view after inactivity. Evidence: `src/main.js`, `README.md`, `npm run build`.
- 2026-02-08 · `hotspot-keyboard-nav`: Rebuilt the hotspot list with a roving tab index, ARIA listbox semantics, and Arrow/Home/End keyboard handling so kiosk visitors can inspect hotspots without a mouse. Evidence: `src/main.js`, `README.md`, `npm run build`.
- 2026-02-08 · `insights-live-refresh`: Added a visibility-aware 30s polling loop (plus tab-focus refresh trigger) for `/api/analytics/counters`, wired the results into `state.serverMetrics`, and documented the behavior so kiosk insights never drift during long sessions. Evidence: `src/main.js`, `README.md`, `npm run build`.

## Insights
- Compare mode muscle memory matters: curators hated reselecting the same A/B pair whenever the page reloaded, so storing the last partner per artifact (plus sync preference) removes the friction that made kiosk demos feel clunky between sessions.
- Moderators were copy-pasting JSON into external diff tools; adding inline callouts with syntax highlight keeps them inside the app and shrinks approval decisions to seconds instead of minutes.
- Visitors who filter via search need confirmation of why a given artifact surfaced; highlighting the explicit matches kept docents oriented during kiosk rehearsals and helps ADA reviewers rely on text context rather than color-only cues.
- Search previously ignored story body and hotspot text, so users could not find artifacts using narrative-specific keywords; caching normalized search vectors also unlocks future ranking experiments without re-parsing data every render.
- Native share sheets are far more reliable on iOS/Android kiosks; moving share orchestration into a single helper ensured clipboard fallback still works for desktop visitors while metrics continue to synchronize with the API.
- Visitors frequently scan the gallery list for new artifacts between tours, so giving them a universal Cmd/Ctrl+K accelerator (and a hint that updates per platform) reduces kiosk friction and increases the likelihood that search terms get logged for future curation.
- Idle reset behavior needs to be configurable because some kiosks run fully unattended while others have docents; exposing the timer via `?idle=` keeps deployments flexible without adding admin UI.
- Hotspot keyboard access previously failed because focus stayed behind hidden elements; roving tab indexes keep the list operable for ADA/Section 508 reviews and stop kiosks from forcing users back to the mouse.
- Analytics counters were previously captured only at load, so kiosks drifted from actual server totals after long runs; background refresh tied to the Page Visibility API keeps numbers trustworthy without hammering hidden tabs.
- Compare pair telemetry needed to live next to the rest of the kiosk insights; surfacing pair counts and partner rankings keeps docents informed when visitors repeatedly contrast the same artifacts.
- Concurrent API writes are common when kiosks run for long sessions; serializing store mutations and proving it with parallel-ingest tests prevents subtle data loss that would otherwise invalidate popularity and moderation analytics.
- Delta badges are the smallest useful trend surface for operators: they add immediate directional context without consuming panel space needed for hotspot and compare leaderboards.
- A dedicated `smoke:api` command shortens maintainer feedback loops by validating service boot + analytics ingestion in seconds without touching persistent local data.
- CMS links are user-controlled input: server-side URL allowlisting prevents the story/reference UI from ever persisting `javascript:` links into stored overrides.
- Market scan (untrusted): Parity expectations for modern web-based 3D viewers include annotations/hotspots, shareable camera state, guided tours, environment/lighting controls, snapshot capture, diagnostics/inspectors, and optional AR entry points. Sources: https://smithsonian.github.io/dpo-voyager/explorer/overview/ , https://3d.si.edu/voyager-story-standalone , https://developer.chrome.com/blog/model-viewer-ar , https://doc.babylonjs.com/toolsAndResources/sandbox/ , https://sketchfab.com/developers/viewer

## Notes
- This file is maintained by the autonomous clone loop.
