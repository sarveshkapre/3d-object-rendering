# Product Roadmap

## Product Goal
- Keep 3d-object-rendering production-ready. Current focus: Artifact Viewer. Find the highest-impact pending work, implement it, test it, and push to main.

## Definition Of Done
- Core feature set delivered for primary workflows.
- UI/UX polished for repeated real usage.
- No open critical reliability issues.
- Verification commands pass and are documented.
- Documentation is current and complete.

## Milestones
- M1 Foundation
- M2 Core Features
- M3 Bug Fixing And Refactor
- M4 UI/UX Improvement
- M5 Stabilization And Release Readiness

## Current Milestone
- M5 Stabilization And Release Readiness

## Brainstorming Queue
- Keep a broad queue of aligned candidates across features, bugs, refactor, UI/UX, docs, and test hardening.

## Pending Features
- Add API store schema versioning + migration helper for long-lived kiosk installs.
- Add analytics ingest request-size/rate guardrails with explicit 429 handling strategy.
- Add optional QR share panel for kiosk handoff flows (no auth required).

## Delivered Features
- 2026-02-17: Added `/api/cms/stats` queue/revision summary endpoint and moderation overlay stats tiles.
- 2026-02-17: Added adaptive server-metrics polling backoff + freshness diagnostics in insights/export.
- 2026-02-17: Added PWA manifest, icons, service worker cache layer, SW registration/update notices, and online/offline + install controls.

## Risks And Blockers
- Track blockers and mitigation plans.
