import "./style.css";
import { artifacts, artifactMap, categories } from "./data/artifacts.js";
import { createAnalyticsTracker } from "./analytics.js";
import { ArtifactViewer } from "./viewer.js";

const elements = {
  stage: document.getElementById("stage"),
  canvas: document.getElementById("viewport"),
  canvasCompare: document.getElementById("viewportCompare"),
  hotspotLayer: document.getElementById("hotspotLayer"),
  hotspotLayerCompare: document.getElementById("hotspotLayerCompare"),
  loadingOverlay: document.getElementById("loadingOverlay"),
  loadingBar: document.getElementById("loadingBar"),
  loadingText: document.getElementById("loadingText"),
  loadingOverlayCompare: document.getElementById("loadingOverlayCompare"),
  loadingBarCompare: document.getElementById("loadingBarCompare"),
  loadingTextCompare: document.getElementById("loadingTextCompare"),
  searchInput: document.getElementById("artifactSearchInput"),
  filterBar: document.getElementById("filterBar"),
  galleryList: document.getElementById("galleryList"),
  comparePane: document.getElementById("comparePane"),
  comparePaneTitle: document.getElementById("comparePaneTitle"),
  compareHud: document.getElementById("compareHud"),
  compareArtifactList: document.getElementById("compareArtifactList"),
  artifactTitle: document.getElementById("artifactTitle"),
  artifactHook: document.getElementById("artifactHook"),
  hotspotListPanel: document.getElementById("hotspotListPanel"),
  storyPanel: document.getElementById("storyPanel"),
  storyKicker: document.getElementById("storyKicker"),
  storyTitle: document.getElementById("storyTitle"),
  storySummary: document.getElementById("storySummary"),
  storyBody: document.getElementById("storyBody"),
  storyReferences: document.getElementById("storyReferences"),
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
  compareBtn: document.getElementById("compareBtn"),
  syncBtn: document.getElementById("syncBtn"),
  fullscreenBtn: document.getElementById("fullscreenBtn"),
  shareBtn: document.getElementById("shareBtn"),
  listToggleBtn: document.getElementById("listToggleBtn"),
  storyToggleBtn: document.getElementById("storyToggleBtn"),
  toast: document.getElementById("toast")
};

const parsedUrlState = parseUrlState();

const state = {
  currentCategory: "all",
  searchQuery: parsedUrlState.searchQuery,
  currentArtifactId: null,
  compareArtifactId: getInitialCompareArtifactId(parsedUrlState.compareArtifactId),
  compareEnabled: parsedUrlState.compareEnabled,
  compareSync: parsedUrlState.compareSync,
  compareReady: false,
  activeDetailView: parsedUrlState.detailView,
  hotspotData: [],
  selectedHotspot: null,
  tourActive: false,
  tourIndex: 0,
  tourTotal: 0,
  tourCaption: "",
  urlUpdateTimer: null,
  toastTimer: null,
  pendingState: parsedUrlState,
  cameraSyncLock: false,
  primaryLoading: false,
  compareLoading: false,
  isRestoringState: false,
  searchTrackTimer: null,
  previousTourState: {
    active: false,
    index: null
  }
};

const analytics = createAnalyticsTracker({
  endpoint: import.meta.env.VITE_ANALYTICS_ENDPOINT ?? "",
  debug: import.meta.env.DEV || import.meta.env.VITE_ANALYTICS_DEBUG === "1"
});

const primaryViewer = new ArtifactViewer({
  canvas: elements.canvas,
  hotspotLayer: elements.hotspotLayer,
  callbacks: {
    onLoadProgress: (value) => {
      const progress = Math.round(Math.max(0, Math.min(100, value * 100)));
      elements.loadingBar.style.width = `${progress}%`;
      elements.loadingText.textContent = progress < 100 ? `Streaming geometry ${progress}%` : "Finalizing artifact...";
    },
    onArtifactLoad: ({ artifact }) => {
      elements.artifactTitle.textContent = artifact.title;
      elements.artifactHook.textContent = artifact.hook;
      state.selectedHotspot = null;
      renderStoryPanel();
      renderHotspotList();
      renderGallery();
      renderCompareList();
      updateHeaderControls();
      trackEvent("artifact_viewed", {
        artifactId: artifact.id,
        category: artifact.category,
        detailView: state.activeDetailView
      });
    },
    onHotspotData: (hotspots) => {
      state.hotspotData = hotspots;
      renderHotspotList();
    },
    onHotspotSelect: ({ hotspot, tourActive, tourIndex, tourTotal, tourCaption }) => {
      const previousHotspotId = state.selectedHotspot?.id ?? null;
      state.selectedHotspot = hotspot;
      state.tourActive = tourActive;
      state.tourIndex = tourIndex;
      state.tourTotal = tourTotal;
      state.tourCaption = tourCaption;

      if (!state.isRestoringState && state.activeDetailView !== "hotspots") {
        setDetailView("hotspots", { skipUrlUpdate: true });
      }

      renderHotspotCard();
      renderHotspotList();
      updateHeaderControls();
      scheduleUrlUpdate();

      if (previousHotspotId !== hotspot.id) {
        trackEvent("hotspot_opened", {
          artifactId: state.currentArtifactId,
          hotspotId: hotspot.id,
          hotspotLabel: hotspot.label,
          viaTour: state.tourActive
        });
      }
    },
    onTourStateChange: ({ active, index, total, caption }) => {
      const previousTourState = { ...state.previousTourState };
      state.tourActive = active;
      state.tourIndex = index;
      state.tourTotal = total;
      state.tourCaption = caption ?? "";

      if (active && state.activeDetailView !== "hotspots") {
        setDetailView("hotspots", { skipUrlUpdate: true });
      }

      renderHotspotCard();
      updateHeaderControls();
      scheduleUrlUpdate();

      if (!previousTourState.active && active) {
        trackEvent("tour_started", {
          artifactId: state.currentArtifactId,
          totalSteps: total
        });
      }

      if (active && previousTourState.index !== index) {
        trackEvent("tour_step_viewed", {
          artifactId: state.currentArtifactId,
          step: index + 1,
          totalSteps: total
        });

        if (index === total - 1) {
          trackEvent("tour_last_step_reached", {
            artifactId: state.currentArtifactId,
            totalSteps: total
          });
        }
      }

      if (previousTourState.active && !active) {
        trackEvent("tour_stopped", {
          artifactId: state.currentArtifactId,
          lastStep: previousTourState.index === null ? null : previousTourState.index + 1
        });
      }

      state.previousTourState = {
        active,
        index
      };
    },
    onHotspotVisibilityChange: () => {
      updateHeaderControls();
      scheduleUrlUpdate();
      trackEvent("hotspots_visibility_changed", {
        artifactId: state.currentArtifactId,
        visible: primaryViewer.hotspotsEnabled
      });
    },
    onCameraChange: () => {
      handleViewerCameraChange("primary");
    }
  }
});

const compareViewer = new ArtifactViewer({
  canvas: elements.canvasCompare,
  hotspotLayer: elements.hotspotLayerCompare,
  callbacks: {
    onLoadProgress: (value) => {
      const progress = Math.round(Math.max(0, Math.min(100, value * 100)));
      elements.loadingBarCompare.style.width = `${progress}%`;
      elements.loadingTextCompare.textContent = progress < 100 ? `Streaming geometry ${progress}%` : "Finalizing artifact...";
    },
    onArtifactLoad: ({ artifact }) => {
      elements.comparePaneTitle.textContent = artifact.title;
      trackEvent("compare_artifact_viewed", {
        primaryArtifactId: state.currentArtifactId,
        compareArtifactId: artifact.id
      });
    },
    onCameraChange: () => {
      handleViewerCameraChange("compare");
    }
  }
});

compareViewer.setHotspotVisibility(false);

initialize();

function initialize() {
  elements.searchInput.value = state.searchQuery;

  trackEvent("session_started", {
    sessionId: analytics.getSessionId(),
    compareFromUrl: state.compareEnabled,
    detailView: state.activeDetailView,
    hasSearchQuery: Boolean(state.searchQuery)
  });

  renderFilters();
  renderGallery();
  renderCompareList();
  bindEvents();
  setDetailView(state.activeDetailView, { skipUrlUpdate: true });
  setCompareModeUI(state.compareEnabled);

  const fallbackArtifactId = artifacts[0].id;
  const artifactId = artifactMap.has(state.pendingState.artifactId)
    ? state.pendingState.artifactId
    : fallbackArtifactId;

  handleResize();
  void bootstrap(artifactId);
}

async function bootstrap(artifactId) {
  await loadArtifact(artifactId, { restoreFromUrl: true, skipCompareReload: true });

  if (!state.compareEnabled) {
    return;
  }

  ensureValidCompareArtifact();
  await loadCompareArtifact(state.compareArtifactId, {
    syncFromPrimary: true
  });
}

function bindEvents() {
  window.addEventListener("resize", handleResize);

  elements.searchInput.addEventListener("input", () => {
    state.searchQuery = elements.searchInput.value.trim();
    renderGallery();
    scheduleUrlUpdate();

    window.clearTimeout(state.searchTrackTimer);
    state.searchTrackTimer = window.setTimeout(() => {
      trackEvent("search_updated", {
        query: state.searchQuery,
        results: getVisibleArtifacts().length
      });
    }, 380);
  });

  elements.resetBtn.addEventListener("click", () => {
    primaryViewer.resetView();
    if (state.compareEnabled && state.compareReady && !state.compareSync) {
      compareViewer.resetView();
    }
    showToast("Camera reset");
    trackEvent("camera_reset", {
      artifactId: state.currentArtifactId,
      compareEnabled: state.compareEnabled
    });
  });

  elements.hotspotToggleBtn.addEventListener("click", () => {
    primaryViewer.toggleHotspots();
  });

  elements.tourBtn.addEventListener("click", () => {
    if (state.tourActive) {
      primaryViewer.stopTour();
      showToast("Tour paused");
      return;
    }

    setDetailView("hotspots", { skipUrlUpdate: true });
    primaryViewer.startTour(0);
  });

  elements.compareBtn.addEventListener("click", async () => {
    if (state.compareEnabled) {
      state.compareEnabled = false;
      state.compareReady = false;
      setCompareModeUI(false);
      scheduleUrlUpdate();
      trackEvent("compare_toggled", {
        enabled: false,
        primaryArtifactId: state.currentArtifactId
      });
      return;
    }

    state.compareEnabled = true;
    state.compareSync = true;
    ensureValidCompareArtifact();
    setCompareModeUI(true);
    await loadCompareArtifact(state.compareArtifactId, { syncFromPrimary: true });
    scheduleUrlUpdate();
    trackEvent("compare_toggled", {
      enabled: true,
      primaryArtifactId: state.currentArtifactId,
      compareArtifactId: state.compareArtifactId
    });
  });

  elements.syncBtn.addEventListener("click", () => {
    if (!state.compareEnabled) {
      return;
    }

    state.compareSync = !state.compareSync;
    updateHeaderControls();

    if (state.compareSync && state.compareReady) {
      compareViewer.applyCameraPose(primaryViewer.getCameraPose(), { emitCameraChange: false });
    }

    scheduleUrlUpdate();
    trackEvent("compare_sync_toggled", {
      enabled: state.compareSync
    });
  });

  elements.listToggleBtn.addEventListener("click", () => {
    setDetailView("hotspots");
  });

  elements.storyToggleBtn.addEventListener("click", () => {
    setDetailView("story");
  });

  elements.prevStepBtn.addEventListener("click", () => primaryViewer.previousTourStep());
  elements.nextStepBtn.addEventListener("click", () => primaryViewer.nextTourStep());

  elements.fullscreenBtn.addEventListener("click", async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      elements.fullscreenBtn.textContent = "Exit Fullscreen";
      trackEvent("fullscreen_toggled", { enabled: true });
      return;
    }

    await document.exitFullscreen();
    elements.fullscreenBtn.textContent = "Fullscreen";
    trackEvent("fullscreen_toggled", { enabled: false });
  });

  document.addEventListener("fullscreenchange", () => {
    elements.fullscreenBtn.textContent = document.fullscreenElement ? "Exit Fullscreen" : "Fullscreen";
  });

  elements.shareBtn.addEventListener("click", async () => {
    const url = window.location.href;

    try {
      await navigator.clipboard.writeText(url);
      showToast("Share link copied");
      trackEvent("share_link_copied", {
        artifactId: state.currentArtifactId,
        compareEnabled: state.compareEnabled
      });
    } catch {
      showToast("Clipboard unavailable. URL updated in address bar.");
      trackEvent("share_link_copy_failed", {
        artifactId: state.currentArtifactId
      });
    }
  });

  elements.hotspotLink.addEventListener("click", () => {
    const hotspotId = state.selectedHotspot?.id ?? null;
    trackEvent("hotspot_reference_opened", {
      artifactId: state.currentArtifactId,
      hotspotId
    });
  });

  elements.storyReferences.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLAnchorElement)) {
      return;
    }

    trackEvent("story_reference_opened", {
      artifactId: state.currentArtifactId,
      href: target.href
    });
  });

  window.addEventListener("beforeunload", () => {
    analytics.shutdown();
  });
}

async function loadArtifact(artifactId, options = {}) {
  const artifact = artifactMap.get(artifactId);
  if (!artifact) {
    return;
  }
  const loadStartedAt = performance.now();

  state.currentArtifactId = artifactId;
  state.selectedHotspot = null;
  state.tourActive = false;

  renderGallery();
  renderCompareList();
  setPrimaryLoading(true);

  try {
    await primaryViewer.loadArtifact(artifact);
    trackEvent("artifact_load_succeeded", {
      artifactId,
      durationMs: Math.round(performance.now() - loadStartedAt)
    });
    renderStoryPanel();

    if (options.restoreFromUrl) {
      state.isRestoringState = true;
      restoreFromUrlState();
      state.isRestoringState = false;

      state.pendingState = {
        artifactId: state.currentArtifactId,
        hotspotId: null,
        tourStep: null,
        cameraPose: null,
        compareArtifactId: state.compareArtifactId,
        compareEnabled: state.compareEnabled,
        compareSync: state.compareSync,
        searchQuery: state.searchQuery,
        detailView: state.activeDetailView
      };
    } else {
      const first = state.hotspotData[0];
      if (first) {
        primaryViewer.selectHotspot(first.id, { focus: false });
      }
    }

    if (state.compareEnabled && !options.skipCompareReload) {
      ensureValidCompareArtifact();
      await loadCompareArtifact(state.compareArtifactId, { syncFromPrimary: true });
    }

    renderHotspotCard();
    updateHeaderControls();
    scheduleUrlUpdate();
  } catch (error) {
    showToast("Model failed to load. Try another artifact.");
    trackEvent("artifact_load_failed", {
      artifactId,
      durationMs: Math.round(performance.now() - loadStartedAt)
    });
    console.error(error);
  } finally {
    window.setTimeout(() => setPrimaryLoading(false), 220);
  }
}

async function loadCompareArtifact(artifactId, options = {}) {
  if (!state.compareEnabled) {
    return;
  }

  const artifact = artifactMap.get(artifactId);
  if (!artifact) {
    return;
  }
  const loadStartedAt = performance.now();

  state.compareArtifactId = artifactId;
  state.compareReady = false;
  renderCompareList();
  setCompareLoading(true);

  try {
    await compareViewer.loadArtifact(artifact);
    trackEvent("compare_load_succeeded", {
      compareArtifactId: artifactId,
      durationMs: Math.round(performance.now() - loadStartedAt)
    });
    compareViewer.setHotspotVisibility(false);
    state.compareReady = true;

    if (options.syncFromPrimary && state.compareSync) {
      compareViewer.applyCameraPose(primaryViewer.getCameraPose(), { emitCameraChange: false });
    }

    scheduleUrlUpdate();
  } catch (error) {
    showToast("Comparison artifact failed to load.");
    trackEvent("compare_load_failed", {
      compareArtifactId: artifactId,
      durationMs: Math.round(performance.now() - loadStartedAt)
    });
    console.error(error);
  } finally {
    window.setTimeout(() => setCompareLoading(false), 220);
  }
}

function ensureValidCompareArtifact() {
  if (!state.currentArtifactId) {
    return;
  }

  if (!artifactMap.has(state.compareArtifactId) || state.compareArtifactId === state.currentArtifactId) {
    const alternative = artifacts.find((artifact) => artifact.id !== state.currentArtifactId);
    state.compareArtifactId = alternative?.id ?? state.currentArtifactId;
  }
}

function restoreFromUrlState() {
  const { hotspotId, tourStep, cameraPose, detailView } = state.pendingState;

  setDetailView(detailView, { skipUrlUpdate: true });

  if (cameraPose) {
    primaryViewer.applyCameraPose(cameraPose);
  }

  if (Number.isInteger(tourStep)) {
    primaryViewer.startTour(tourStep);
    return;
  }

  if (hotspotId) {
    primaryViewer.selectHotspot(hotspotId, { focus: true });
    return;
  }

  const first = state.hotspotData[0];
  if (first) {
    primaryViewer.selectHotspot(first.id, { focus: false });
  }
}

function setDetailView(view, options = {}) {
  const normalizedView = view === "story" ? "story" : "hotspots";
  const previousView = state.activeDetailView;
  state.activeDetailView = normalizedView;

  const showStory = normalizedView === "story";
  elements.storyPanel.hidden = !showStory;
  elements.hotspotListPanel.hidden = showStory;

  if (showStory) {
    elements.hotspotCard.hidden = true;
  } else {
    renderHotspotCard();
  }

  updateDetailToggleUI();

  if (previousView !== normalizedView && state.currentArtifactId) {
    trackEvent("detail_view_changed", {
      artifactId: state.currentArtifactId,
      view: normalizedView
    });
  }

  if (!options.skipUrlUpdate) {
    scheduleUrlUpdate();
  }
}

function updateDetailToggleUI() {
  const inHotspotView = state.activeDetailView === "hotspots";
  elements.listToggleBtn.classList.toggle("is-active", inHotspotView);
  elements.storyToggleBtn.classList.toggle("is-active", !inHotspotView);
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
      trackEvent("category_filter_changed", {
        category: category.id,
        searchQuery: state.searchQuery,
        results: getVisibleArtifacts().length
      });
    });

    elements.filterBar.appendChild(button);
  });
}

function renderGallery() {
  elements.galleryList.innerHTML = "";
  const visibleArtifacts = getVisibleArtifacts();

  if (!visibleArtifacts.length) {
    elements.galleryList.innerHTML = '<p class="empty-state">No artifacts match this search.</p>';
    return;
  }

  visibleArtifacts.forEach((artifact) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "artifact-chip";
    button.classList.toggle("is-active", artifact.id === state.currentArtifactId);

    const keywordText = (artifact.keywords ?? []).slice(0, 3).join(" · ");

    button.innerHTML = `
      <span class="artifact-chip-title">${escapeHtml(artifact.title)}</span>
      <span class="artifact-chip-meta">${escapeHtml(artifact.category)}</span>
      <span class="artifact-chip-hook">${escapeHtml(artifact.hook)}</span>
      <span class="artifact-chip-tags">${escapeHtml(keywordText)}</span>
    `;

    button.addEventListener("click", () => {
      trackEvent("artifact_selected_from_gallery", {
        artifactId: artifact.id,
        fromCategory: state.currentCategory,
        searchQuery: state.searchQuery
      });
      void loadArtifact(artifact.id, { restoreFromUrl: false });
    });

    elements.galleryList.appendChild(button);
  });
}

function renderCompareList() {
  elements.compareArtifactList.innerHTML = "";

  artifacts.forEach((artifact) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "compare-chip";
    button.textContent = artifact.title;

    const isPrimaryArtifact = artifact.id === state.currentArtifactId;
    const isSelected = artifact.id === state.compareArtifactId;

    button.classList.toggle("is-primary", isPrimaryArtifact);
    button.classList.toggle("is-active", isSelected);
    button.disabled = isPrimaryArtifact;

    button.addEventListener("click", async () => {
      if (!state.compareEnabled || artifact.id === state.currentArtifactId) {
        return;
      }
      trackEvent("compare_artifact_selected", {
        primaryArtifactId: state.currentArtifactId,
        compareArtifactId: artifact.id
      });
      await loadCompareArtifact(artifact.id, { syncFromPrimary: true });
    });

    elements.compareArtifactList.appendChild(button);
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
            <span class="hotspot-list-label">${escapeHtml(hotspot.label)}</span>
            <span class="hotspot-list-title">${escapeHtml(hotspot.title)}</span>
          </span>
        </button>
      `;
    })
    .join("");

  elements.hotspotListPanel.innerHTML = `
    <p class="panel-label">${escapeHtml(artifact.hotspotTitle)}</p>
    <div class="hotspot-list">${itemsMarkup || '<p class="empty-state">No hotspot data</p>'}</div>
  `;

  elements.hotspotListPanel.querySelectorAll("[data-hotspot-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const hotspotId = button.dataset.hotspotId;
      setDetailView("hotspots", { skipUrlUpdate: true });
      primaryViewer.selectHotspot(hotspotId, { focus: true });
    });
  });
}

function renderStoryPanel() {
  const artifact = artifactMap.get(state.currentArtifactId);
  if (!artifact?.story) {
    elements.storyKicker.textContent = "Story";
    elements.storyTitle.textContent = "Story unavailable";
    elements.storySummary.textContent = "This artifact does not include narrative content yet.";
    elements.storyBody.innerHTML = "";
    elements.storyReferences.innerHTML = "";
    return;
  }

  const { story } = artifact;
  elements.storyKicker.textContent = `${artifact.category.toUpperCase()} STORY`;
  elements.storyTitle.textContent = story.title;
  elements.storySummary.textContent = story.summary;

  elements.storyBody.innerHTML = (story.body ?? [])
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");

  if (!story.references?.length) {
    elements.storyReferences.innerHTML = "";
    return;
  }

  elements.storyReferences.innerHTML = `
    <p class="story-reference-title">References</p>
    <div class="story-reference-list">
      ${story.references
        .map(
          (reference) =>
            `<a class="story-reference-link" href="${escapeHtml(reference.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(reference.label)}</a>`
        )
        .join("")}
    </div>
  `;
}

function renderHotspotCard() {
  const artifact = artifactMap.get(state.currentArtifactId);
  const hotspot = state.selectedHotspot;

  if (state.activeDetailView !== "hotspots" || !artifact || !hotspot) {
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
  elements.hotspotToggleBtn.textContent = primaryViewer.hotspotsEnabled ? "Hide Hotspots" : "Show Hotspots";
  elements.compareBtn.textContent = state.compareEnabled ? "Exit Compare" : "Compare";
  elements.syncBtn.hidden = !state.compareEnabled;
  elements.syncBtn.textContent = state.compareSync ? "Sync On" : "Sync Off";
}

function setCompareModeUI(enabled) {
  elements.stage.classList.toggle("is-compare", enabled);
  elements.comparePane.setAttribute("aria-hidden", String(!enabled));
  elements.compareHud.hidden = !enabled;
  updateHeaderControls();
  handleResize();
}

function setPrimaryLoading(loading) {
  state.primaryLoading = loading;
  elements.loadingOverlay.classList.toggle("is-visible", loading);
  elements.loadingOverlay.setAttribute("aria-hidden", String(!loading));
  if (loading) {
    elements.loadingBar.style.width = "2%";
  }
}

function setCompareLoading(loading) {
  state.compareLoading = loading;
  elements.loadingOverlayCompare.classList.toggle("is-visible", loading);
  elements.loadingOverlayCompare.setAttribute("aria-hidden", String(!loading));
  if (loading) {
    elements.loadingBarCompare.style.width = "2%";
  }
}

function handleViewerCameraChange(source) {
  scheduleUrlUpdate();

  if (!state.compareEnabled || !state.compareSync || !state.compareReady || state.cameraSyncLock) {
    return;
  }

  const sourceViewer = source === "primary" ? primaryViewer : compareViewer;
  const targetViewer = source === "primary" ? compareViewer : primaryViewer;

  state.cameraSyncLock = true;
  targetViewer.applyCameraPose(sourceViewer.getCameraPose(), { emitCameraChange: false });
  state.cameraSyncLock = false;
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
  primaryViewer.resize(elements.canvas.clientWidth, elements.canvas.clientHeight);
  compareViewer.resize(elements.canvasCompare.clientWidth, elements.canvasCompare.clientHeight);
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

  if (state.activeDetailView === "story") {
    params.set("view", "story");
  }

  if (state.searchQuery) {
    params.set("q", state.searchQuery);
  }

  const cameraPose = primaryViewer.getCameraPose();
  params.set("cam", serializeCameraPose(cameraPose));

  if (state.compareEnabled && state.compareArtifactId) {
    params.set("compare", state.compareArtifactId);
    params.set("sync", state.compareSync ? "1" : "0");
  }

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
  const compareArtifactId = params.get("compare");
  const detailView = params.get("view") === "story" ? "story" : "hotspots";

  return {
    artifactId,
    hotspotId,
    tourStep: Number.isInteger(tourStep) ? tourStep : null,
    cameraPose,
    compareArtifactId,
    compareEnabled: Boolean(compareArtifactId && artifactMap.has(compareArtifactId)),
    compareSync: params.get("sync") !== "0",
    searchQuery: params.get("q")?.trim() ?? "",
    detailView
  };
}

function getInitialCompareArtifactId(parsedCompareArtifactId) {
  if (parsedCompareArtifactId && artifactMap.has(parsedCompareArtifactId)) {
    return parsedCompareArtifactId;
  }

  if (artifacts.length > 1) {
    return artifacts[1].id;
  }

  return artifacts[0]?.id ?? null;
}

function getVisibleArtifacts() {
  const query = state.searchQuery.trim().toLowerCase();

  return artifacts.filter((artifact) => {
    if (state.currentCategory !== "all" && artifact.category !== state.currentCategory) {
      return false;
    }

    if (!query) {
      return true;
    }

    const searchHaystack = [
      artifact.title,
      artifact.hook,
      artifact.category,
      ...(artifact.keywords ?? []),
      artifact.story?.title ?? "",
      artifact.story?.summary ?? ""
    ]
      .join(" ")
      .toLowerCase();

    return searchHaystack.includes(query);
  });
}

function trackEvent(eventName, payload = {}) {
  analytics.track(eventName, {
    artifactId: state.currentArtifactId,
    compareArtifactId: state.compareEnabled ? state.compareArtifactId : null,
    detailView: state.activeDetailView,
    ...payload
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
