# Clone Feature Tracker

## Context Sources
- README and docs
- TODO/FIXME markers in code
- Test and build failures
- Gaps found during codebase exploration

## Candidate Features To Do
- `share-native`: Add Web Share API fallback (with clipboard backup) so mobile visitors can broadcast current artifact context with fewer taps.
- `search-shortcut`: Provide Cmd/Ctrl+K shortcut plus inline helper copy to jump into the artifact search input instantly.
- `compare-insights`: Extend the insights panel with compare views + primary/secondary artifact usage to highlight gallery pairing behavior.

## Implemented
- 2026-02-08 · `search-rich-metadata`: Expanded gallery search to use a normalized, diacritic-insensitive index that includes story body, references, hotspot metadata, and keywords for each artifact. Evidence: `src/main.js`, `npm run build`.

## Insights
- Search previously ignored story body and hotspot text, so users could not find artifacts using narrative-specific keywords; caching normalized search vectors also unlocks future ranking experiments without re-parsing data every render.

## Notes
- This file is maintained by the autonomous clone loop.
