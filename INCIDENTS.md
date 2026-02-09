# Incidents And Learnings

## Entry Schema
- Date
- Trigger
- Impact
- Root Cause
- Fix
- Prevention Rule
- Evidence
- Commit
- Confidence

## Entries
- Date: 2026-02-09
- Trigger: `npm run smoke:kiosk` Playwright flow could not click `Inspect` because a hidden moderation overlay intercepted pointer events.
- Impact: Overlay state could become effectively "always on" in environments where `.shortcuts-modal` overrides the browser `[hidden]` behavior; kiosk flows become unclickable.
- Root Cause: CSS set `.shortcuts-modal { display: grid; }` with higher specificity than the UA `[hidden] { display: none; }`, so toggling the `hidden` attribute did not reliably remove overlays from layout and hit-testing.
- Fix: Added an explicit `[hidden] { display: none !important; }` rule in `src/style.css`.
- Prevention Rule: When UI state depends on `hidden`, always include a project-level `[hidden]` rule (or explicit `.modal[hidden]` rules) and keep a browser smoke check that exercises basic clicks with overlays closed.
- Evidence: `KEEP_SMOKE_ARTIFACTS=1 npm run smoke:kiosk` passed after fix.
- Commit: 3735822
- Confidence: high
