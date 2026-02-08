# Clone Feature Tracker

## Context Sources
- README and docs
- TODO/FIXME markers in code
- Test and build failures
- Gaps found during codebase exploration

## Candidate Features To Do
- `moderation-diff-highlights`: Layer syntax-highlighted diffs and inline field callouts into the moderation panel so reviewers can confirm changes faster than scanning raw JSON blobs.
- `insights-trendlines`: Attach small sparklines or delta indicators to the insights chips so kiosk staff can see whether engagement metrics are trending up or down between server polls.

## Implemented
- 2026-02-08 · `compare-sync-memory`: Persisted compare partners per artifact and the sync toggle preference in local storage, respected deep links without clobbering user overrides, refreshed idle reset and docs so compare mode reopens in the last-used configuration. Evidence: `src/main.js`, `README.md`, `npm run build`.
- 2026-02-08 · `compare-insights`: Added compare session tracking, a top partner leaderboard, and analytics plumbing so the insights panel reflects how often visitors pair each artifact. Evidence: `src/main.js`, `src/style.css`, `server/index.js`, `README.md`, `npm run build`.
- 2026-02-08 · `search-highlight`: Added semantic `<mark>`-based highlighting hooked into the normalized search index so gallery chips, hotspot lists, and story paragraphs immediately show why a query matched. Evidence: `src/main.js`, `src/style.css`, `README.md`, `npm run build`.
- 2026-02-08 · `search-rich-metadata`: Expanded gallery search to use a normalized, diacritic-insensitive index that includes story body, references, hotspot metadata, and keywords for each artifact. Evidence: `src/main.js`, `npm run build`.
- 2026-02-08 · `share-native`: Added Web Share API handling (with clipboard backup) that flushes the deep-link URL before launching native share sheets, tracks share outcomes, and updates docs. Evidence: `src/main.js`, `README.md`, `server/index.js`, `npm run build`.
- 2026-02-08 · `search-shortcut`: Added Cmd/Ctrl+K focus handling with platform-aware hinting, cross-panel closing, analytics tracking, and refreshed docs/styles so kiosk operators can jump into artifact search instantly. Evidence: `index.html`, `src/main.js`, `src/style.css`, `README.md`, `npm run build`.
- 2026-02-08 · `kiosk-idle-reset`: Introduced a configurable `?idle=` URL param that watches keyboard, pointer, and touch activity to snap kiosks back to the featured artifact, default preset, and hotspot view after inactivity. Evidence: `src/main.js`, `README.md`, `npm run build`.
- 2026-02-08 · `hotspot-keyboard-nav`: Rebuilt the hotspot list with a roving tab index, ARIA listbox semantics, and Arrow/Home/End keyboard handling so kiosk visitors can inspect hotspots without a mouse. Evidence: `src/main.js`, `README.md`, `npm run build`.
- 2026-02-08 · `insights-live-refresh`: Added a visibility-aware 30s polling loop (plus tab-focus refresh trigger) for `/api/analytics/counters`, wired the results into `state.serverMetrics`, and documented the behavior so kiosk insights never drift during long sessions. Evidence: `src/main.js`, `README.md`, `npm run build`.

## Insights
- Compare mode muscle memory matters: curators hated reselecting the same A/B pair whenever the page reloaded, so storing the last partner per artifact (plus sync preference) removes the friction that made kiosk demos feel clunky between sessions.
- Visitors who filter via search need confirmation of why a given artifact surfaced; highlighting the explicit matches kept docents oriented during kiosk rehearsals and helps ADA reviewers rely on text context rather than color-only cues.
- Search previously ignored story body and hotspot text, so users could not find artifacts using narrative-specific keywords; caching normalized search vectors also unlocks future ranking experiments without re-parsing data every render.
- Native share sheets are far more reliable on iOS/Android kiosks; moving share orchestration into a single helper ensured clipboard fallback still works for desktop visitors while metrics continue to synchronize with the API.
- Visitors frequently scan the gallery list for new artifacts between tours, so giving them a universal Cmd/Ctrl+K accelerator (and a hint that updates per platform) reduces kiosk friction and increases the likelihood that search terms get logged for future curation.
- Idle reset behavior needs to be configurable because some kiosks run fully unattended while others have docents; exposing the timer via `?idle=` keeps deployments flexible without adding admin UI.
- Hotspot keyboard access previously failed because focus stayed behind hidden elements; roving tab indexes keep the list operable for ADA/Section 508 reviews and stop kiosks from forcing users back to the mouse.
- Analytics counters were previously captured only at load, so kiosks drifted from actual server totals after long runs; background refresh tied to the Page Visibility API keeps numbers trustworthy without hammering hidden tabs.
- Compare pair telemetry needed to live next to the rest of the kiosk insights; surfacing pair counts and partner rankings keeps docents informed when visitors repeatedly contrast the same artifacts.

## Notes
- This file is maintained by the autonomous clone loop.
