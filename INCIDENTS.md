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

### 2026-02-12T20:19:04Z | Codex execution failure
- Date: 2026-02-12T20:19:04Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260212-101456-3d-object-rendering-cycle-7.log
- Commit: pending
- Confidence: medium

### 2026-02-12T20:22:31Z | Codex execution failure
- Date: 2026-02-12T20:22:31Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260212-101456-3d-object-rendering-cycle-8.log
- Commit: pending
- Confidence: medium

### 2026-02-12T20:26:11Z | Codex execution failure
- Date: 2026-02-12T20:26:11Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260212-101456-3d-object-rendering-cycle-9.log
- Commit: pending
- Confidence: medium

### 2026-02-12T20:29:41Z | Codex execution failure
- Date: 2026-02-12T20:29:41Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260212-101456-3d-object-rendering-cycle-10.log
- Commit: pending
- Confidence: medium

### 2026-02-12T20:33:09Z | Codex execution failure
- Date: 2026-02-12T20:33:09Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260212-101456-3d-object-rendering-cycle-11.log
- Commit: pending
- Confidence: medium

### 2026-02-12T20:36:37Z | Codex execution failure
- Date: 2026-02-12T20:36:37Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260212-101456-3d-object-rendering-cycle-12.log
- Commit: pending
- Confidence: medium

### 2026-02-12T20:40:05Z | Codex execution failure
- Date: 2026-02-12T20:40:05Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260212-101456-3d-object-rendering-cycle-13.log
- Commit: pending
- Confidence: medium

### 2026-02-12T20:43:33Z | Codex execution failure
- Date: 2026-02-12T20:43:33Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260212-101456-3d-object-rendering-cycle-14.log
- Commit: pending
- Confidence: medium

### 2026-02-12T20:47:07Z | Codex execution failure
- Date: 2026-02-12T20:47:07Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260212-101456-3d-object-rendering-cycle-15.log
- Commit: pending
- Confidence: medium

### 2026-02-12T20:50:36Z | Codex execution failure
- Date: 2026-02-12T20:50:36Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260212-101456-3d-object-rendering-cycle-16.log
- Commit: pending
- Confidence: medium

### 2026-02-12T20:54:12Z | Codex execution failure
- Date: 2026-02-12T20:54:12Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260212-101456-3d-object-rendering-cycle-17.log
- Commit: pending
- Confidence: medium

### 2026-02-12T20:57:41Z | Codex execution failure
- Date: 2026-02-12T20:57:41Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260212-101456-3d-object-rendering-cycle-18.log
- Commit: pending
- Confidence: medium

### 2026-02-12T21:01:08Z | Codex execution failure
- Date: 2026-02-12T21:01:08Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260212-101456-3d-object-rendering-cycle-19.log
- Commit: pending
- Confidence: medium

### 2026-02-12T21:04:36Z | Codex execution failure
- Date: 2026-02-12T21:04:36Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260212-101456-3d-object-rendering-cycle-20.log
- Commit: pending
- Confidence: medium

### 2026-02-12T21:08:08Z | Codex execution failure
- Date: 2026-02-12T21:08:08Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260212-101456-3d-object-rendering-cycle-21.log
- Commit: pending
- Confidence: medium

### 2026-02-12T21:11:40Z | Codex execution failure
- Date: 2026-02-12T21:11:40Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260212-101456-3d-object-rendering-cycle-22.log
- Commit: pending
- Confidence: medium

### 2026-02-12T21:15:12Z | Codex execution failure
- Date: 2026-02-12T21:15:12Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260212-101456-3d-object-rendering-cycle-23.log
- Commit: pending
- Confidence: medium

### 2026-02-12T21:18:41Z | Codex execution failure
- Date: 2026-02-12T21:18:41Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260212-101456-3d-object-rendering-cycle-24.log
- Commit: pending
- Confidence: medium

### 2026-02-12T21:21:56Z | Codex execution failure
- Date: 2026-02-12T21:21:56Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260212-101456-3d-object-rendering-cycle-25.log
- Commit: pending
- Confidence: medium

### 2026-02-12T21:25:12Z | Codex execution failure
- Date: 2026-02-12T21:25:12Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260212-101456-3d-object-rendering-cycle-26.log
- Commit: pending
- Confidence: medium

### 2026-02-12T21:28:31Z | Codex execution failure
- Date: 2026-02-12T21:28:31Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260212-101456-3d-object-rendering-cycle-27.log
- Commit: pending
- Confidence: medium

### 2026-02-12T21:31:53Z | Codex execution failure
- Date: 2026-02-12T21:31:53Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260212-101456-3d-object-rendering-cycle-28.log
- Commit: pending
- Confidence: medium

### 2026-02-12T21:35:22Z | Codex execution failure
- Date: 2026-02-12T21:35:22Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260212-101456-3d-object-rendering-cycle-29.log
- Commit: pending
- Confidence: medium

### 2026-02-12T21:38:55Z | Codex execution failure
- Date: 2026-02-12T21:38:55Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260212-101456-3d-object-rendering-cycle-30.log
- Commit: pending
- Confidence: medium

### 2026-02-17T01:42:01Z | Codex execution failure
- Date: 2026-02-17T01:42:01Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260216-144104-3d-object-rendering-cycle-2.log
- Commit: pending
- Confidence: medium

### 2026-02-17T01:45:05Z | Codex execution failure
- Date: 2026-02-17T01:45:05Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260216-144104-3d-object-rendering-cycle-3.log
- Commit: pending
- Confidence: medium

### 2026-02-17T01:48:13Z | Codex execution failure
- Date: 2026-02-17T01:48:13Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260216-144104-3d-object-rendering-cycle-4.log
- Commit: pending
- Confidence: medium

### 2026-02-17T01:52:14Z | Codex execution failure
- Date: 2026-02-17T01:52:14Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260216-144104-3d-object-rendering-cycle-5.log
- Commit: pending
- Confidence: medium

### 2026-02-17T01:55:17Z | Codex execution failure
- Date: 2026-02-17T01:55:17Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260216-144104-3d-object-rendering-cycle-6.log
- Commit: pending
- Confidence: medium

### 2026-02-17T01:58:37Z | Codex execution failure
- Date: 2026-02-17T01:58:37Z
- Trigger: Codex execution failure
- Impact: Repo session did not complete cleanly
- Root Cause: codex exec returned a non-zero status
- Fix: Captured failure logs and kept repository in a recoverable state
- Prevention Rule: Re-run with same pass context and inspect pass log before retrying
- Evidence: pass_log=logs/20260216-144104-3d-object-rendering-cycle-7.log
- Commit: pending
- Confidence: medium
