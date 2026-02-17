# Artifact Viewer

Minimalist white-space 3D artifact experience with:

- High-fidelity WebGL rendering (Three.js + glTF)
- Rotate/zoom interaction with smooth orbit controls
- 3D-anchored hotspots with occlusion fade
- Guided narrative tour with cinematic camera moves
- Kiosk-ready showcase mode that auto-plays tours and rotates artifacts
- Optional idle reset (append `?idle=120`) that snaps back to the featured artifact/preset after inactivity
- Visual presets (`White`, `Sand`, `Sky`) for instant scene mood changes
- Installable PWA shell (manifest + service worker) with update detection hooks
- Toolbar network status badge + browser install prompt integration when supported
- Low load mode toggle (reduced device pixel ratio + shadows off) for kiosk stability on constrained hardware
- Adaptive render throttling that slows viewer frame work after idle periods to reduce kiosk thermals while preserving immediate interaction wake-up
- Respects `prefers-reduced-motion` (UI motion reduced and camera/tour transitions shortened) for accessibility reviews
- Side-by-side compare mode with synchronized camera control
- Compare mode remembers your last partner per artifact plus your sync toggle preference so kiosk docents can reopen it without reconfiguring pairings
- Artifact search across names, categories, tags, and story metadata
- Story panel per artifact (curated narrative + references)
- Deep-link sharing (`artifact`, `hotspot`, `tour`, `autoplay`, `cam`, `compare`, `sync`, `q`, `sort`, `view`, `preset`, `showcase`) with Web Share API + clipboard fallback for mobile visitors
- Artifact library with category filters
- Gallery sorting (`Featured`, `Newest`, `Popularity`, `A-Z`)
- Event analytics pipeline (batched client events with optional backend endpoint)
- Tour autoplay + in-session progress restore per artifact
- Search result highlights across gallery cards, hotspot lists, and story paragraphs so docents immediately see why a match appeared
- Keyboard shortcuts (`Cmd/Ctrl+K` focus search, `T` tour, `H` hotspots, `C` compare, `S` story/inspect, `A` autoplay, `P` preset, `M` showcase, arrows for tour steps)
- Keyboard-friendly hotspot list with Arrow/Home/End navigation and Enter/Space activation so kiosks stay operable without a mouse
- Live session insights panel (views, hotspot engagement, compare sessions, compare partner leaderboard, tour usage, shares) with auto-refreshing server metrics
- Diagnostics in the insights panel (renderer status, render-loop mode/throttle stats, + recent client errors) with a copyable export so kiosks can report failures without devtools
- Insights delta badges that show metric movement since the previous server poll
- Insights sparkline mini-charts that show the last N server polls per metric for quick trend reading
- Shortcut help overlay (`?` to open/close, `Esc` to dismiss)
- In-app Curator Editor (`Curator` button) for title/hook/story/hotspots overrides
- Open anonymous moderation queue (`Moderation` button) with approve/reject/restore
- Side-by-side moderation diff preview with syntax-highlighted JSON, inline field callouts, and reviewed decision log with rejection notes
- Public recent updates feed sourced from revision history

## Run

```bash
npm install
npm run assets:pull
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Verify

```bash
npm run assets:check
npm test
npm run smoke:api
npm run smoke:preview:full
npm run smoke:kiosk # optional (requires Google Chrome installed)
npm run build && npm run preview:full # optional (serves dist/ with /api proxied to the local API)
```

## CI Runner

- GitHub Actions CI is configured for `self-hosted` runners.
- Setup and registration steps: `SELF_HOSTED_RUNNER.md`

## Notes

- Models are loaded locally from `public/models`.
- URLs are updated in place so any current view can be shared directly.
- Build output is split with a dedicated Three.js vendor chunk for better browser caching.
- `Popularity` sort uses persistent analytics counters when API is available (fallback: in-session metrics).
- API store writes are serialized to protect analytics and CMS data from concurrent request clobbering.

## Kiosk Idle Reset

Append `?idle=<seconds>` to the app URL to enable an inactivity reset (minimum 10 seconds; values below are clamped). The idle timer restarts on any pointer, touch, or keyboard activity. When it fires, the viewer:

- Returns to the highest-ranked featured artifact and the `White` preset.
- Clears search queries, category filters, compare mode, tours, showcase mode, and custom camera poses.
- Reopens the hotspot view so the first interpretive note is in focus.

Example: `https://localhost:5173/?idle=180` resets the kiosk three minutes after the last interaction so unattended sessions never stay stranded on obscure states.

## Asset Pipeline

Pull models into local hosting:

```bash
npm run assets:pull
```

The pull script downloads source GLBs and saves:

- `public/models/temple-sentinel.glb`
- `public/models/heritage-optics.glb`
- `public/models/ritual-lantern.glb`

## API Server

The API runs with frontend in `npm run dev`.

- API default URL: `http://localhost:8787`
- Health check: `GET /api/health`
- Analytics ingest: `POST /api/analytics/ingest`
- Analytics counters: `GET /api/analytics/counters`
- CMS overrides read: `GET /api/cms/overrides`
- CMS moderation stats summary: `GET /api/cms/stats`
- CMS submissions create/update: `PUT /api/cms/overrides/:artifactId` (queued, not instantly live)
- CMS submissions create/delete request: `DELETE /api/cms/overrides/:artifactId` (queued, not instantly live)
- CMS pending queue: `GET /api/cms/submissions?status=pending`
- CMS pending queue with override payload: `GET /api/cms/submissions?status=pending&include=override`
- CMS approve submission: `POST /api/cms/submissions/:submissionId/approve`
- CMS reject submission: `POST /api/cms/submissions/:submissionId/reject`
- CMS revisions by artifact: `GET /api/cms/revisions/:artifactId`
- CMS restore revision: `POST /api/cms/revisions/:artifactId/:revisionId/restore`
- CMS recent updates feed: `GET /api/cms/recent-updates?limit=12`

Curator editor supports:

- Artifact metadata (`title`, `hook`, `keywords`, `releaseYear`, `featuredRank`)
- Story content (`title`, `summary`, `body`, `references`)
- Hotspot copy (`label`, `title`, `body`, `reference`) keyed by hotspot id

Moderation flow:

1. Curator submits anonymous change request.
2. Request appears in pending moderation queue.
3. Moderator reviews side-by-side diff, then approves/rejects (rejections require a note).
4. Approved changes become live and create a revision snapshot.
5. Any revision can be restored.

Local persistent file:

- `server/data/store.local.json` (gitignored)
- Example seed: `server/data/store.example.json`

## Analytics

Client events are captured in batches for: artifact views, load success/failure, search, filters, hotspots, tours, compare mode, sync toggles, share clicks, and story/reference interactions. When the analytics API is reachable, the viewer now re-pulls `/api/analytics/counters` every ~30 seconds (and whenever the tab regains focus) so the in-app insights panel reflects near-real-time kiosk activity without manual refreshes.

Compare pairings emit `compare_pair_recorded` events that track how often an artifact is used as the primary anchor in compare mode and which secondary artifacts get paired the most. These fuel the compare session counter and the new top compare partners list surfaced inside the insights panel.

Snapshot capture (`Snapshot` button or `X`) downloads a PNG of the current viewer state (single pane or side-by-side compare) for docent notes and exhibit reporting.

Optional environment variables:

```bash
VITE_ANALYTICS_ENDPOINT=/api/analytics/ingest
VITE_ANALYTICS_DEBUG=1
API_PORT=8787
ADMIN_TOKEN=your-secret-token
API_STORE_PATH=/absolute/path/to/store.json
API_ANALYTICS_STORE_EVENTS=1
API_ANALYTICS_EVENTS_MAX=3000
API_ANALYTICS_EVENT_RETENTION_DAYS=0
API_CMS_SUBMISSIONS_MAX=3000
API_CMS_SUBMISSIONS_RETENTION_DAYS=0
API_CMS_REVISIONS_MAX=300
API_CMS_REVISIONS_RETENTION_DAYS=0
```

If `VITE_ANALYTICS_ENDPOINT` is unset, it defaults to `/api/analytics/ingest`.
