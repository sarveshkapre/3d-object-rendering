# Artifact Viewer

Minimalist white-space 3D artifact experience with:

- High-fidelity WebGL rendering (Three.js + glTF)
- Rotate/zoom interaction with smooth orbit controls
- 3D-anchored hotspots with occlusion fade
- Guided narrative tour with cinematic camera moves
- Deep-link sharing (`artifact`, `hotspot`, `tour`, `cam`)
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
