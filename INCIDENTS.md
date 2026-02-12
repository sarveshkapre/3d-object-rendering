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

- Date: 2026-02-10
- Trigger: Automation attempted to stage and commit changes using concurrent git commands.
- Impact: `git commit` failed with `.git/index.lock` and blocked shipping until commands were re-run.
- Root Cause: Git uses an index lock to serialize writes; running `git add` and `git commit` concurrently causes a lock collision.
- Fix: Re-ran git operations sequentially (stage, then commit, then push).
- Prevention Rule: Never parallelize git commands; keep `git add` / `git commit` / `git push` serialized in automation.
- Evidence: Error `fatal: Unable to create '.git/index.lock': File exists`, followed by a successful sequential commit and push.
- Commit: 00824ef
- Confidence: high

### 2026-02-12T20:01:40Z | Codex execution failure
- Date: 2026-02-12T20:01:40Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260212-101456-3d-object-rendering-cycle-2.log
- Commit: pending
- Confidence: medium

### 2026-02-12T20:05:07Z | Codex execution failure
- Date: 2026-02-12T20:05:07Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260212-101456-3d-object-rendering-cycle-3.log
- Commit: pending
- Confidence: medium

### 2026-02-12T20:08:38Z | Codex execution failure
- Date: 2026-02-12T20:08:38Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260212-101456-3d-object-rendering-cycle-4.log
- Commit: pending
- Confidence: medium

### 2026-02-12T20:12:05Z | Codex execution failure
- Date: 2026-02-12T20:12:05Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260212-101456-3d-object-rendering-cycle-5.log
- Commit: pending
- Confidence: medium

### 2026-02-12T20:15:37Z | Codex execution failure
- Date: 2026-02-12T20:15:37Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260212-101456-3d-object-rendering-cycle-6.log
- Commit: pending
- Confidence: medium
