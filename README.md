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

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Notes

- Models are loaded from the Khronos public sample model repository.
- URLs are updated in place so any current view can be shared directly.
- Build output is split with a dedicated Three.js vendor chunk for better browser caching.
- `Popularity` sort is based on in-session engagement (views, hotspots, tours, shares).

## Analytics

Client events are captured in batches for: artifact views, load success/failure, search, filters, hotspots, tours, compare mode, sync toggles, share clicks, and story/reference interactions.

Optional environment variables:

```bash
VITE_ANALYTICS_ENDPOINT=https://your-endpoint.example.com/ingest
VITE_ANALYTICS_DEBUG=1
```

When `VITE_ANALYTICS_ENDPOINT` is not set, events are stored locally on `window.__artifactAnalytics` for inspection.
