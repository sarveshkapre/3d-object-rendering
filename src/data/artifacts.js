export const categories = [
  { id: "all", label: "All" },
  { id: "heritage", label: "Heritage" },
  { id: "engineering", label: "Engineering" },
  { id: "design", label: "Design" }
];

export const artifacts = [
  {
    id: "temple-sentinel",
    title: "Temple Sentinel Relic",
    hook: "A weathered guardian fragment inspired by South Asian stone monument craftsmanship.",
    category: "heritage",
    keywords: ["temple", "stone", "carving", "relic", "architecture", "heritage"],
    story: {
      title: "Stone Memory and Sacred Geometry",
      summary: "This object is presented as a monument fragment to study rhythm, weathering, and structural storytelling in carved stone traditions.",
      body: [
        "Temple architecture often operates as narrative sculpture. Surfaces are not merely decorative; they encode cosmology, regional craft habits, and historical repair marks.",
        "The ridged crown and frontal plane in this artifact mimic the compositional pattern used in many monumental facades: a dominant symbolic center with repeated edge details that guide visual movement.",
        "Weathering is preserved intentionally in this presentation. Pits, erosion, and discoloration act as archival traces that help viewers read material age, climate exposure, and restoration decisions over time."
      ],
      references: [
        { label: "Indian Architecture Overview", url: "https://en.wikipedia.org/wiki/Indian_architecture" },
        { label: "Temple Architecture in India", url: "https://en.wikipedia.org/wiki/Indian_temple_architecture" }
      ]
    },
    modelUrl:
      "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb",
    modelRotation: [0, Math.PI * 1.2, 0],
    hotspotTitle: "Interpretive Notes",
    hotspots: [
      {
        id: "crown-band",
        label: "Crown Band",
        title: "Crown Band Geometry",
        body: "The upper crest carries repeated ridges similar to hand-carved temple cornice rhythms used to create visual cadence.",
        norm: [0.05, 0.86, 0.15],
        focus: { theta: 10, phi: 48, radius: 1.15 },
        reference: "https://en.wikipedia.org/wiki/Indian_architecture"
      },
      {
        id: "frontal-plate",
        label: "Frontal Plate",
        title: "Frontal Narrative Face",
        body: "The central plate acts like a narrative surface, analogous to relief zones where iconography and motifs are concentrated.",
        norm: [0.26, 0.2, 0.88],
        focus: { theta: 2, phi: 65, radius: 1.1 }
      },
      {
        id: "weathering",
        label: "Weathering",
        title: "Weathering Signature",
        body: "Surface pitting and oxidation are intentionally retained to preserve material memory instead of over-restoring details.",
        norm: [-0.42, -0.05, 0.35],
        focus: { theta: -42, phi: 56, radius: 1.3 }
      },
      {
        id: "neck-joint",
        label: "Joint Plane",
        title: "Structural Joinery",
        body: "The lower edge reveals a join line that explains how decorative shells can interface with a hidden support layer.",
        norm: [-0.06, -0.78, 0.24],
        focus: { theta: -4, phi: 86, radius: 1.2 }
      },
      {
        id: "rear-shell",
        label: "Rear Shell",
        title: "Rear Massing",
        body: "The broad back volume balances the silhouette, mirroring how temple massing often uses strong rear buttressing.",
        norm: [0.03, 0.22, -0.92],
        focus: { theta: 180, phi: 62, radius: 1.12 }
      },
      {
        id: "ornament-line",
        label: "Ornament Line",
        title: "Ornament Transition",
        body: "A narrow trim line transitions from smooth to rough stone, creating contrast that guides the eye across the form.",
        norm: [0.56, -0.12, 0.46],
        focus: { theta: 38, phi: 62, radius: 1.2 }
      }
    ],
    tour: [
      { hotspotId: "crown-band", caption: "Start with the crown where the silhouette language is established." },
      { hotspotId: "frontal-plate", caption: "Move to the storytelling face used for symbolic emphasis." },
      { hotspotId: "ornament-line", caption: "Inspect trim transitions that separate crafted and weathered zones." },
      { hotspotId: "weathering", caption: "Read the weathering patterns like a time map." },
      { hotspotId: "rear-shell", caption: "Rotate behind to study counterweight and volume management." },
      { hotspotId: "neck-joint", caption: "Finish at the structural seam and assembly logic." }
    ]
  },
  {
    id: "heritage-optics",
    title: "Heritage Optical Camera",
    hook: "An instrument-scale study of machining, control ergonomics, and analog optical storytelling.",
    category: "engineering",
    keywords: ["camera", "optics", "lens", "analog", "engineering", "machining"],
    story: {
      title: "Precision as a User Interface",
      summary: "The camera is framed as a mechanical ecosystem where optics, tactile controls, and serviceability define reliability in the field.",
      body: [
        "Before digital abstraction, image quality depended on direct physical interaction with the instrument. Focus rings, shutter paths, and framing windows were all user-facing mechanical decisions.",
        "This artifact highlights the relationship between tolerance and trust. The lens stack controls light behavior while trigger and damping mechanisms reduce vibration that can blur long exposures.",
        "The rear service plate and base mount reveal maintainability priorities. Precision products survive because they can be calibrated, repaired, and stabilized without compromising optical alignment."
      ],
      references: [
        { label: "Camera Fundamentals", url: "https://en.wikipedia.org/wiki/Camera" },
        { label: "Lens Design Principles", url: "https://en.wikipedia.org/wiki/Camera_lens" }
      ]
    },
    modelUrl:
      "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/AntiqueCamera/glTF-Binary/AntiqueCamera.glb",
    modelRotation: [0, Math.PI * 0.75, 0],
    hotspotTitle: "Engineering Notes",
    hotspots: [
      {
        id: "primary-lens",
        label: "Primary Lens",
        title: "Primary Optical Stack",
        body: "The front assembly concentrates precision grinding and coating decisions that define contrast and flare behavior.",
        norm: [0.02, 0.08, 0.95],
        focus: { theta: -3, phi: 64, radius: 1.08 }
      },
      {
        id: "focus-ring",
        label: "Focus Ring",
        title: "Tactile Focus Ring",
        body: "Knurled geometry increases grip and enables incremental control when dialing focal distance manually.",
        norm: [0.28, -0.16, 0.7],
        focus: { theta: 24, phi: 73, radius: 1.18 }
      },
      {
        id: "viewfinder",
        label: "Viewfinder",
        title: "Framing Window",
        body: "The top viewfinder demonstrates the pre-digital framing workflow where composition happened before exposure feedback.",
        norm: [-0.14, 0.82, 0.26],
        focus: { theta: -12, phi: 48, radius: 1.14 }
      },
      {
        id: "shutter-control",
        label: "Shutter Control",
        title: "Shutter Trigger Path",
        body: "Mechanical linkage from trigger to curtains is tuned to minimize vibration and preserve sharpness.",
        norm: [-0.58, 0.18, 0.23],
        focus: { theta: -52, phi: 62, radius: 1.15 }
      },
      {
        id: "back-plate",
        label: "Back Plate",
        title: "Service Access Plate",
        body: "Rear paneling exposes service philosophy: disassemble quickly, recalibrate precisely, and re-seal against dust.",
        norm: [-0.02, 0.04, -0.93],
        focus: { theta: 179, phi: 68, radius: 1.2 }
      },
      {
        id: "base-mount",
        label: "Base Mount",
        title: "Tripod Interface",
        body: "The bottom mount transfers weight through the centerline, stabilizing long exposures in low-light conditions.",
        norm: [0.0, -0.82, 0.04],
        focus: { theta: 7, phi: 88, radius: 1.2 },
        reference: "https://en.wikipedia.org/wiki/Camera"
      }
    ],
    tour: [
      { hotspotId: "primary-lens", caption: "Open on optics where image quality starts." },
      { hotspotId: "focus-ring", caption: "Check user-facing control ergonomics." },
      { hotspotId: "viewfinder", caption: "Move upward into compositional instrumentation." },
      { hotspotId: "shutter-control", caption: "Study the trigger mechanism side profile." },
      { hotspotId: "back-plate", caption: "Rotate to rear service architecture." },
      { hotspotId: "base-mount", caption: "End at the structural stability anchor." }
    ]
  },
  {
    id: "ritual-lantern",
    title: "Ritual Lantern",
    hook: "A luminous object study balancing metalwork ornament, glass diffusion, and ceremonial function.",
    category: "design",
    keywords: ["lantern", "ritual", "lighting", "metalwork", "glass", "design"],
    story: {
      title: "Light as Material and Atmosphere",
      summary: "The lantern is treated as a design system that combines ritual symbolism with practical requirements for transport, ventilation, and diffusion.",
      body: [
        "Lantern design is a negotiation between atmosphere and engineering. Designers shape perceived warmth through material choices while preserving airflow and structural integrity.",
        "The handle loop and cage crown create a recognizable silhouette that communicates function instantly. This is classic object language: form that teaches without text.",
        "The diffusion core and base socket illustrate performance constraints. Light must be softened for comfort while the body remains stable, serviceable, and safe during repeated handling."
      ],
      references: [
        { label: "Lantern Typologies", url: "https://en.wikipedia.org/wiki/Lantern" },
        { label: "Lighting Design Basics", url: "https://en.wikipedia.org/wiki/Lighting" }
      ]
    },
    modelUrl:
      "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Lantern/glTF-Binary/Lantern.glb",
    modelRotation: [0, Math.PI * 0.9, 0],
    hotspotTitle: "Design Notes",
    hotspots: [
      {
        id: "cage-top",
        label: "Cage Crown",
        title: "Cage Crown Detailing",
        body: "Top lattice members lighten visual mass while protecting the internal lighting chamber.",
        norm: [0.02, 0.89, 0.14],
        focus: { theta: 6, phi: 44, radius: 1.17 }
      },
      {
        id: "handle-loop",
        label: "Handle Loop",
        title: "Carry Loop Geometry",
        body: "The loop ratio balances finger comfort, hanging stability, and silhouette recognizability.",
        norm: [0.47, 0.74, 0.28],
        focus: { theta: 42, phi: 55, radius: 1.18 }
      },
      {
        id: "glass-core",
        label: "Glass Core",
        title: "Diffusion Core",
        body: "The central chamber uses translucent material to spread light evenly and avoid harsh glare points.",
        norm: [0.0, -0.02, 0.58],
        focus: { theta: 0, phi: 68, radius: 1.08 }
      },
      {
        id: "metal-fillet",
        label: "Metal Fillet",
        title: "Fillet Transitions",
        body: "Curved transitions reduce stress concentrations where bars connect to the ring assembly.",
        norm: [-0.46, -0.24, 0.34],
        focus: { theta: -45, phi: 74, radius: 1.2 }
      },
      {
        id: "base-socket",
        label: "Base Socket",
        title: "Base Socket",
        body: "The bottom socket keeps center of gravity low while allowing ventilation and maintenance access.",
        norm: [0.0, -0.88, 0.04],
        focus: { theta: 2, phi: 87, radius: 1.18 },
        reference: "https://en.wikipedia.org/wiki/Lantern"
      },
      {
        id: "rear-frame",
        label: "Rear Frame",
        title: "Rear Frame Integrity",
        body: "Rear struts lock the frame under movement, preserving alignment through repeated handling cycles.",
        norm: [0.05, 0.16, -0.92],
        focus: { theta: 182, phi: 66, radius: 1.15 }
      }
    ],
    tour: [
      { hotspotId: "cage-top", caption: "Start with the protective crown and lattice rhythm." },
      { hotspotId: "handle-loop", caption: "Inspect transport ergonomics and balance." },
      { hotspotId: "glass-core", caption: "Center on diffusion performance." },
      { hotspotId: "metal-fillet", caption: "Zoom into structural transitions." },
      { hotspotId: "rear-frame", caption: "Rotate behind for frame reinforcement." },
      { hotspotId: "base-socket", caption: "Close at the stability and maintenance base." }
    ]
  }
];

export const artifactMap = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
