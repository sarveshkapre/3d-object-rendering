# Clone Feature Tracker

## Context Sources
- README and docs
- TODO/FIXME markers in code
- Test and build failures
- Gaps found during codebase exploration

## Candidate Features To Do
- `compare-insights`: Extend the insights panel with compare views + primary/secondary artifact usage to highlight gallery pairing behavior.
- `hotspot-keyboard-nav`: Add roving tab-index and arrow key support so hotspot lists are operable without a mouse (matches kiosk accessibility goals).

## Implemented
- 2026-02-08 · `search-rich-metadata`: Expanded gallery search to use a normalized, diacritic-insensitive index that includes story body, references, hotspot metadata, and keywords for each artifact. Evidence: `src/main.js`, `npm run build`.
- 2026-02-08 · `share-native`: Added Web Share API handling (with clipboard backup) that flushes the deep-link URL before launching native share sheets, tracks share outcomes, and updates docs. Evidence: `src/main.js`, `README.md`, `server/index.js`, `npm run build`.
- 2026-02-08 · `search-shortcut`: Added Cmd/Ctrl+K focus handling with platform-aware hinting, cross-panel closing, analytics tracking, and refreshed docs/styles so kiosk operators can jump into artifact search instantly. Evidence: `index.html`, `src/main.js`, `src/style.css`, `README.md`, `npm run build`.
- 2026-02-08 · `kiosk-idle-reset`: Introduced a configurable `?idle=` URL param that watches keyboard, pointer, and touch activity to snap kiosks back to the featured artifact, default preset, and hotspot view after inactivity. Evidence: `src/main.js`, `README.md`, `npm run build`.

## Insights
- Search previously ignored story body and hotspot text, so users could not find artifacts using narrative-specific keywords; caching normalized search vectors also unlocks future ranking experiments without re-parsing data every render.
- Native share sheets are far more reliable on iOS/Android kiosks; moving share orchestration into a single helper ensured clipboard fallback still works for desktop visitors while metrics continue to synchronize with the API.
- Visitors frequently scan the gallery list for new artifacts between tours, so giving them a universal Cmd/Ctrl+K accelerator (and a hint that updates per platform) reduces kiosk friction and increases the likelihood that search terms get logged for future curation.
- Idle reset behavior needs to be configurable because some kiosks run fully unattended while others have docents; exposing the timer via `?idle=` keeps deployments flexible without adding admin UI.

## Notes
- This file is maintained by the autonomous clone loop.
