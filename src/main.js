import "./style.css";
import { artifacts, artifactMap, categories } from "./data/artifacts.js";
import { ArtifactViewer } from "./viewer.js";

const elements = {
  canvas: document.getElementById("viewport"),
  loadingOverlay: document.getElementById("loadingOverlay"),
  loadingBar: document.getElementById("loadingBar"),
  loadingText: document.getElementById("loadingText"),
  hotspotLayer: document.getElementById("hotspotLayer"),
  filterBar: document.getElementById("filterBar"),
  galleryList: document.getElementById("galleryList"),
  artifactTitle: document.getElementById("artifactTitle"),
  artifactHook: document.getElementById("artifactHook"),
  hotspotListPanel: document.getElementById("hotspotListPanel"),
  hotspotCard: document.getElementById("hotspotCard"),
  hotspotKicker: document.getElementById("hotspotKicker"),
  hotspotTitle: document.getElementById("hotspotTitle"),
  hotspotBody: document.getElementById("hotspotBody"),
  hotspotLink: document.getElementById("hotspotLink"),
  tourStepper: document.getElementById("tourStepper"),
  prevStepBtn: document.getElementById("prevStepBtn"),
  nextStepBtn: document.getElementById("nextStepBtn"),
  tourProgress: document.getElementById("tourProgress"),
  resetBtn: document.getElementById("resetBtn"),
  hotspotToggleBtn: document.getElementById("hotspotToggleBtn"),
  tourBtn: document.getElementById("tourBtn"),
  fullscreenBtn: document.getElementById("fullscreenBtn"),
  shareBtn: document.getElementById("shareBtn"),
  listToggleBtn: document.getElementById("listToggleBtn"),
  toast: document.getElementById("toast")
};

const state = {
  currentCategory: "all",
  currentArtifactId: null,
  hotspotData: [],
  selectedHotspot: null,
  tourActive: false,
  tourIndex: 0,
  tourTotal: 0,
  tourCaption: "",
  urlUpdateTimer: null,
  toastTimer: null,
  loading: false,
  pendingState: parseUrlState()
};

const viewer = new ArtifactViewer({
  canvas: elements.canvas,
  hotspotLayer: elements.hotspotLayer,
  callbacks: {
    onLoadProgress: (value) => {
      const progress = Math.round(Math.max(0, Math.min(100, value * 100)));
      elements.loadingBar.style.width = `${progress}%`;
      elements.loadingText.textContent = progress < 100 ? `Streaming geometry ${progress}%` : "Finalizing artifact…";
    },
    onArtifactLoad: ({ artifact }) => {
      elements.artifactTitle.textContent = artifact.title;
      elements.artifactHook.textContent = artifact.hook;
      state.selectedHotspot = null;
      renderHotspotList();
      updateHeaderControls();
    },
    onHotspotData: (hotspots) => {
      state.hotspotData = hotspots;
      renderHotspotList();
    },
    onHotspotSelect: ({ hotspot, tourActive, tourIndex, tourTotal, tourCaption }) => {
      state.selectedHotspot = hotspot;
      state.tourActive = tourActive;
      state.tourIndex = tourIndex;
      state.tourTotal = tourTotal;
      state.tourCaption = tourCaption;
      renderHotspotCard();
      renderHotspotList();
      updateHeaderControls();
      scheduleUrlUpdate();
    },
    onTourStateChange: ({ active, index, total, caption }) => {
      state.tourActive = active;
      state.tourIndex = index;
      state.tourTotal = total;
      state.tourCaption = caption ?? "";
      renderHotspotCard();
      updateHeaderControls();
      scheduleUrlUpdate();
    },
    onHotspotVisibilityChange: () => {
      updateHeaderControls();
      scheduleUrlUpdate();
    },
    onCameraChange: () => {
      scheduleUrlUpdate();
    }
  }
});

initialize();

function initialize() {
  renderFilters();
  renderGallery();
  bindEvents();

  const fallbackArtifactId = artifacts[0].id;
  const artifactId = artifactMap.has(state.pendingState.artifactId)
    ? state.pendingState.artifactId
    : fallbackArtifactId;

  loadArtifact(artifactId, { restoreFromUrl: true });
  handleResize();
}

function bindEvents() {
  window.addEventListener("resize", handleResize);

  elements.resetBtn.addEventListener("click", () => {
    viewer.resetView();
    showToast("Camera reset");
  });

  elements.hotspotToggleBtn.addEventListener("click", () => {
    viewer.toggleHotspots();
  });

  elements.tourBtn.addEventListener("click", () => {
    if (state.tourActive) {
      viewer.stopTour();
      showToast("Tour paused");
      return;
    }
    viewer.startTour(0);
  });

  elements.prevStepBtn.addEventListener("click", () => viewer.previousTourStep());
  elements.nextStepBtn.addEventListener("click", () => viewer.nextTourStep());

  elements.listToggleBtn.addEventListener("click", () => {
    const willShow = elements.hotspotListPanel.classList.toggle("is-collapsed") === false;
    elements.listToggleBtn.setAttribute("aria-expanded", String(willShow));
    elements.listToggleBtn.textContent = willShow ? "Hotspot List" : "Show Hotspots";
  });

  elements.fullscreenBtn.addEventListener("click", async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      elements.fullscreenBtn.textContent = "Exit Fullscreen";
      return;
    }

    await document.exitFullscreen();
    elements.fullscreenBtn.textContent = "Fullscreen";
  });

  document.addEventListener("fullscreenchange", () => {
    elements.fullscreenBtn.textContent = document.fullscreenElement ? "Exit Fullscreen" : "Fullscreen";
  });

  elements.shareBtn.addEventListener("click", async () => {
    const url = window.location.href;

    try {
      await navigator.clipboard.writeText(url);
      showToast("Share link copied");
    } catch {
      showToast("Clipboard unavailable. URL updated in address bar.");
    }
  });
}

async function loadArtifact(artifactId, options = {}) {
  const artifact = artifactMap.get(artifactId);
  if (!artifact) {
    return;
  }

  state.currentArtifactId = artifactId;
  state.selectedHotspot = null;
  state.tourActive = false;

  renderGallery();
  setLoadingState(true);

  try {
    await viewer.loadArtifact(artifact);

    if (options.restoreFromUrl) {
      restoreFromUrlState();
      state.pendingState = {
        artifactId: state.currentArtifactId,
        hotspotId: null,
        tourStep: null,
        cameraPose: null
      };
    } else {
      const first = state.hotspotData[0];
      if (first) {
        viewer.selectHotspot(first.id, { focus: false });
      }
    }

    renderHotspotCard();
    updateHeaderControls();
    scheduleUrlUpdate();
  } catch (error) {
    showToast("Model failed to load. Try another artifact.");
    console.error(error);
  } finally {
    window.setTimeout(() => setLoadingState(false), 220);
  }
}

function restoreFromUrlState() {
  const { hotspotId, tourStep, cameraPose } = state.pendingState;

  if (cameraPose) {
    viewer.applyCameraPose(cameraPose);
  }

  if (Number.isInteger(tourStep)) {
    viewer.startTour(tourStep);
    return;
  }

  if (hotspotId) {
    viewer.selectHotspot(hotspotId, { focus: true });
    return;
  }

  const first = state.hotspotData[0];
  if (first) {
    viewer.selectHotspot(first.id, { focus: false });
  }
}

function renderFilters() {
  elements.filterBar.innerHTML = "";

  categories.forEach((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip-btn";
    button.textContent = category.label;
    button.classList.toggle("is-active", category.id === state.currentCategory);

    button.addEventListener("click", () => {
      state.currentCategory = category.id;
      renderFilters();
      renderGallery();
    });

    elements.filterBar.appendChild(button);
  });
}

function renderGallery() {
  elements.galleryList.innerHTML = "";

  const visibleArtifacts = artifacts.filter((artifact) => {
    if (state.currentCategory === "all") {
      return true;
    }
    return artifact.category === state.currentCategory;
  });

  visibleArtifacts.forEach((artifact) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "artifact-chip";
    button.classList.toggle("is-active", artifact.id === state.currentArtifactId);

    button.innerHTML = `
      <span class="artifact-chip-title">${artifact.title}</span>
      <span class="artifact-chip-meta">${artifact.category}</span>
      <span class="artifact-chip-hook">${artifact.hook}</span>
    `;

    button.addEventListener("click", () => {
      loadArtifact(artifact.id, { restoreFromUrl: false });
    });

    elements.galleryList.appendChild(button);
  });
}

function renderHotspotList() {
  const artifact = artifactMap.get(state.currentArtifactId);
  if (!artifact) {
    elements.hotspotListPanel.innerHTML = "";
    return;
  }

  const selectedId = state.selectedHotspot?.id ?? "";

  const itemsMarkup = state.hotspotData
    .map((hotspot, index) => {
      const selectedClass = selectedId === hotspot.id ? "is-active" : "";
      return `
        <button class="hotspot-list-item ${selectedClass}" type="button" data-hotspot-id="${hotspot.id}">
          <span class="hotspot-list-index">${String(index + 1).padStart(2, "0")}</span>
          <span class="hotspot-list-copy">
            <span class="hotspot-list-label">${hotspot.label}</span>
            <span class="hotspot-list-title">${hotspot.title}</span>
          </span>
        </button>
      `;
    })
    .join("");

  elements.hotspotListPanel.innerHTML = `
    <p class="panel-label">${artifact.hotspotTitle}</p>
    <div class="hotspot-list">${itemsMarkup || '<p class="empty-state">No hotspot data</p>'}</div>
  `;

  elements.hotspotListPanel.querySelectorAll("[data-hotspot-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const hotspotId = button.dataset.hotspotId;
      viewer.selectHotspot(hotspotId, { focus: true });
    });
  });
}

function renderHotspotCard() {
  const artifact = artifactMap.get(state.currentArtifactId);
  const hotspot = state.selectedHotspot;

  if (!artifact || !hotspot) {
    elements.hotspotCard.hidden = true;
    return;
  }

  elements.hotspotCard.hidden = false;
  elements.hotspotKicker.textContent = state.tourActive
    ? `Guided Tour · Step ${state.tourIndex + 1}/${state.tourTotal}`
    : artifact.hotspotTitle;
  elements.hotspotTitle.textContent = hotspot.title;
  elements.hotspotBody.textContent = state.tourActive && state.tourCaption
    ? `${state.tourCaption} ${hotspot.body}`
    : hotspot.body;

  if (hotspot.reference) {
    elements.hotspotLink.href = hotspot.reference;
    elements.hotspotLink.hidden = false;
  } else {
    elements.hotspotLink.hidden = true;
    elements.hotspotLink.removeAttribute("href");
  }

  elements.tourStepper.hidden = !state.tourActive;
  elements.tourProgress.textContent = `${state.tourIndex + 1}/${state.tourTotal}`;
}

function updateHeaderControls() {
  elements.tourBtn.textContent = state.tourActive ? "Exit Tour" : "Start Tour";
  elements.hotspotToggleBtn.textContent = viewer.hotspotsEnabled ? "Hide Hotspots" : "Show Hotspots";
}

function setLoadingState(loading) {
  state.loading = loading;
  elements.loadingOverlay.classList.toggle("is-visible", loading);
  elements.loadingOverlay.setAttribute("aria-hidden", String(!loading));
  if (loading) {
    elements.loadingBar.style.width = "2%";
  }
}

function showToast(message) {
  elements.toast.hidden = false;
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");

  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("is-visible");
    window.setTimeout(() => {
      elements.toast.hidden = true;
    }, 160);
  }, 1300);
}

function handleResize() {
  const width = elements.canvas.clientWidth;
  const height = elements.canvas.clientHeight;
  viewer.resize(width, height);
}

function scheduleUrlUpdate() {
  window.clearTimeout(state.urlUpdateTimer);
  state.urlUpdateTimer = window.setTimeout(updateUrlState, 220);
}

function updateUrlState() {
  if (!state.currentArtifactId) {
    return;
  }

  const params = new URLSearchParams();
  params.set("artifact", state.currentArtifactId);

  if (state.selectedHotspot?.id) {
    params.set("hotspot", state.selectedHotspot.id);
  }

  if (state.tourActive) {
    params.set("tour", String(state.tourIndex));
  }

  const cameraPose = viewer.getCameraPose();
  params.set("cam", serializeCameraPose(cameraPose));

  const nextUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, "", nextUrl);
}

function serializeCameraPose(cameraPose) {
  return [...cameraPose.position, ...cameraPose.target].join(",");
}

function parseCameraPose(raw) {
  if (!raw) {
    return null;
  }

  const numbers = raw
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((value) => Number.isFinite(value));

  if (numbers.length !== 6) {
    return null;
  }

  return {
    position: numbers.slice(0, 3),
    target: numbers.slice(3, 6)
  };
}

function parseUrlState() {
  const params = new URLSearchParams(window.location.search);
  const artifactId = params.get("artifact");
  const hotspotId = params.get("hotspot");
  const tourStepRaw = params.get("tour");
  const tourStep = tourStepRaw === null ? null : Number(tourStepRaw);
  const cameraPose = parseCameraPose(params.get("cam"));

  return {
    artifactId,
    hotspotId,
    tourStep: Number.isInteger(tourStep) ? tourStep : null,
    cameraPose
  };
}
