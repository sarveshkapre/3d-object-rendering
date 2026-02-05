# Artifact Viewer

Minimalist white-space 3D artifact experience with:

- High-fidelity WebGL rendering (Three.js + glTF)
- Rotate/zoom interaction with smooth orbit controls
- 3D-anchored hotspots with occlusion fade
- Guided narrative tour with cinematic camera moves
- Side-by-side compare mode with synchronized camera control
- Artifact search across names, categories, tags, and story metadata
- Story panel per artifact (curated narrative + references)
- Deep-link sharing (`artifact`, `hotspot`, `tour`, `cam`, `compare`, `sync`, `q`, `view`)
- Artifact library with category filters

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
