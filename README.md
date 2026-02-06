# Artifact Viewer

Minimalist white-space 3D artifact experience with:

- High-fidelity WebGL rendering (Three.js + glTF)
- Rotate/zoom interaction with smooth orbit controls
- 3D-anchored hotspots with occlusion fade
- Guided narrative tour with cinematic camera moves
- Side-by-side compare mode with synchronized camera control
- Artifact search across names, categories, tags, and story metadata
- Story panel per artifact (curated narrative + references)
- Deep-link sharing (`artifact`, `hotspot`, `tour`, `autoplay`, `cam`, `compare`, `sync`, `q`, `sort`, `view`)
- Artifact library with category filters
- Gallery sorting (`Featured`, `Newest`, `Popularity`, `A-Z`)
- Event analytics pipeline (batched client events with optional backend endpoint)
- Tour autoplay + in-session progress restore per artifact
- Keyboard shortcuts (`T` tour, `H` hotspots, `C` compare, `S` story/inspect, `A` autoplay, arrows for tour steps)
- Live session insights panel (views, hotspot engagement, tour usage, shares, top hotspots)
- Shortcut help overlay (`?` to open/close, `Esc` to dismiss)
- In-app Curator Editor (`Curator` button) for title/hook/story/hotspots overrides
- Open anonymous moderation queue (`Moderation` button) with approve/reject/restore
- Side-by-side moderation diff preview and reviewed decision log with rejection notes
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

## Notes

- Models are loaded locally from `public/models`.
- URLs are updated in place so any current view can be shared directly.
- Build output is split with a dedicated Three.js vendor chunk for better browser caching.
- `Popularity` sort uses persistent analytics counters when API is available (fallback: in-session metrics).

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

Client events are captured in batches for: artifact views, load success/failure, search, filters, hotspots, tours, compare mode, sync toggles, share clicks, and story/reference interactions.

Optional environment variables:

```bash
VITE_ANALYTICS_ENDPOINT=/api/analytics/ingest
VITE_ANALYTICS_DEBUG=1
API_PORT=8787
ADMIN_TOKEN=your-secret-token
API_STORE_PATH=/absolute/path/to/store.json
```

If `VITE_ANALYTICS_ENDPOINT` is unset, it defaults to `/api/analytics/ingest`.
