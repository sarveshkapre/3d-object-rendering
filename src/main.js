import "./style.css";
import { artifacts, artifactMap, categories } from "./data/artifacts.js";
import { createAnalyticsTracker } from "./analytics.js";
import { ArtifactViewer } from "./viewer.js";

const SESSION_PROGRESS_STORAGE_KEY = "artifact_viewer_progress";
const SESSION_METRICS_STORAGE_KEY = "artifact_viewer_metrics";
const TOUR_AUTOPLAY_DELAY_MS = 4600;
const VISUAL_PRESETS = ["white", "sand", "sky"];
const VISUAL_PRESET_LABELS = {
  white: "White",
  sand: "Sand",
  sky: "Sky"
};

function detectShortcutPlatform() {
  if (typeof navigator === "undefined") {
    return "other";
  }

  const platformSource =
    navigator.userAgentData?.platform ||
    navigator.platform ||
    (navigator.userAgent && navigator.userAgent.split(")")[0]) ||
    "";
  const normalized = platformSource.toLowerCase();
  if (normalized.includes("mac")) {
    return "mac";
  }
  if (normalized.includes("win")) {
    return "windows";
  }
  if (normalized.includes("linux")) {
    return "linux";
  }
  return "other";
}

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
  searchShortcutHint: document.getElementById("searchShortcutHint"),
  searchShortcutModifier: document.getElementById("searchShortcutModifier"),
  searchShortcutAlt: document.getElementById("searchShortcutAlt"),
  sortSelect: document.getElementById("artifactSortSelect"),
  galleryStats: document.getElementById("galleryStats"),
  filterBar: document.getElementById("filterBar"),
  galleryList: document.getElementById("galleryList"),
  insightsPanel: document.getElementById("insightsPanel"),
  insightsContent: document.getElementById("insightsContent"),
  updatesPanel: document.getElementById("updatesPanel"),
  updatesContent: document.getElementById("updatesContent"),
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
  tourAutoBtn: document.getElementById("tourAutoBtn"),
  tourProgress: document.getElementById("tourProgress"),
  resetBtn: document.getElementById("resetBtn"),
  hotspotToggleBtn: document.getElementById("hotspotToggleBtn"),
  tourBtn: document.getElementById("tourBtn"),
  compareBtn: document.getElementById("compareBtn"),
  syncBtn: document.getElementById("syncBtn"),
  presetBtn: document.getElementById("presetBtn"),
  showcaseBtn: document.getElementById("showcaseBtn"),
  curatorBtn: document.getElementById("curatorBtn"),
  moderationBtn: document.getElementById("moderationBtn"),
  curatorModal: document.getElementById("curatorModal"),
  curatorForm: document.getElementById("curatorForm"),
  curatorCloseBtn: document.getElementById("curatorCloseBtn"),
  curatorArtifactSelect: document.getElementById("curatorArtifactSelect"),
  curatorTokenInput: document.getElementById("curatorTokenInput"),
  curatorTitleInput: document.getElementById("curatorTitleInput"),
  curatorHookInput: document.getElementById("curatorHookInput"),
  curatorKeywordsInput: document.getElementById("curatorKeywordsInput"),
  curatorYearInput: document.getElementById("curatorYearInput"),
  curatorRankInput: document.getElementById("curatorRankInput"),
  curatorStoryTitleInput: document.getElementById("curatorStoryTitleInput"),
  curatorStorySummaryInput: document.getElementById("curatorStorySummaryInput"),
  curatorStoryBodyInput: document.getElementById("curatorStoryBodyInput"),
  curatorStoryReferencesInput: document.getElementById("curatorStoryReferencesInput"),
  curatorHotspotsList: document.getElementById("curatorHotspotsList"),
  curatorResetBtn: document.getElementById("curatorResetBtn"),
  curatorDeleteBtn: document.getElementById("curatorDeleteBtn"),
  curatorSaveBtn: document.getElementById("curatorSaveBtn"),
  curatorStatus: document.getElementById("curatorStatus"),
  moderationModal: document.getElementById("moderationModal"),
  moderationCloseBtn: document.getElementById("moderationCloseBtn"),
  moderationTokenInput: document.getElementById("moderationTokenInput"),
  moderationReasonInput: document.getElementById("moderationReasonInput"),
  moderationArtifactSelect: document.getElementById("moderationArtifactSelect"),
  moderationRefreshBtn: document.getElementById("moderationRefreshBtn"),
  moderationPendingList: document.getElementById("moderationPendingList"),
  moderationDiffSummary: document.getElementById("moderationDiffSummary"),
  moderationDiffBefore: document.getElementById("moderationDiffBefore"),
  moderationDiffAfter: document.getElementById("moderationDiffAfter"),
  moderationDecisionsList: document.getElementById("moderationDecisionsList"),
  moderationRevisionsList: document.getElementById("moderationRevisionsList"),
  moderationStatus: document.getElementById("moderationStatus"),
  shortcutsBtn: document.getElementById("shortcutsBtn"),
  shortcutsModal: document.getElementById("shortcutsModal"),
  shortcutsCloseBtn: document.getElementById("shortcutsCloseBtn"),
  fullscreenBtn: document.getElementById("fullscreenBtn"),
  shareBtn: document.getElementById("shareBtn"),
  listToggleBtn: document.getElementById("listToggleBtn"),
  storyToggleBtn: document.getElementById("storyToggleBtn"),
  toast: document.getElementById("toast")
};

const parsedUrlState = parseUrlState();
const baseArtifactsById = Object.fromEntries(artifacts.map((artifact) => [artifact.id, structuredClone(artifact)]));
const artifactSearchIndex = new Map();

const state = {
  currentCategory: "all",
  searchQuery: parsedUrlState.searchQuery,
  sortMode: parsedUrlState.sortMode,
  currentArtifactId: null,
  compareArtifactId: getInitialCompareArtifactId(parsedUrlState.compareArtifactId),
  compareEnabled: parsedUrlState.compareEnabled,
  compareSync: parsedUrlState.compareSync,
  compareReady: false,
  visualPreset: parsedUrlState.visualPreset,
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
  tourAutoPlay: parsedUrlState.tourAutoPlay,
  tourAutoPlayTimer: null,
  showcaseActive: false,
  showcaseRequested: parsedUrlState.showcaseActive,
  showcaseTimer: null,
  shortcutPlatform: detectShortcutPlatform(),
  showcasePreviousAutoplay: parsedUrlState.tourAutoPlay,
  sessionProgress: loadSessionProgress(),
  sessionMetrics: loadSessionMetrics(),
  serverMetrics: {},
  recentUpdates: [],
  cmsOverrides: {},
  curatorOpen: false,
  curatorArtifactId: null,
  curatorToken: "",
  curatorWorkingHotspots: [],
  moderationOpen: false,
  moderationToken: "",
  moderationReason: "",
  moderationArtifactId: null,
  moderationSubmissions: [],
  moderationSelectedSubmissionId: null,
  moderationRecentDecisions: [],
  moderationRevisions: [],
  shortcutsOpen: false,
  previousTourState: {
    active: false,
    index: null
  }
};

const analytics = createAnalyticsTracker({
  endpoint: import.meta.env.VITE_ANALYTICS_ENDPOINT ?? "/api/analytics/ingest",
  debug: import.meta.env.DEV || import.meta.env.VITE_ANALYTICS_DEBUG === "1"
});

refreshArtifactSearchIndexes();

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
      if (!state.curatorArtifactId) {
        state.curatorArtifactId = artifact.id;
      }
      if (!state.moderationArtifactId) {
        state.moderationArtifactId = artifact.id;
      }
      renderCuratorArtifactOptions();
      renderModerationArtifactOptions();
      if (state.curatorOpen && state.curatorArtifactId === artifact.id) {
        populateCuratorForm(artifact.id);
      }
      renderStoryPanel();
      renderHotspotList();
      renderGallery();
      renderCompareList();
      renderInsightsPanel();
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
      saveProgressForCurrentArtifact();

      if (state.tourActive && state.tourAutoPlay) {
        scheduleTourAutoplay();
      }

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

      if (active && state.tourAutoPlay) {
        scheduleTourAutoplay();
      } else {
        clearTourAutoplay();
      }

      state.previousTourState = {
        active,
        index
      };
      saveProgressForCurrentArtifact();
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
        artifactId: artifact.id,
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
  elements.sortSelect.value = state.sortMode;
  updateSearchShortcutHint();
  state.curatorArtifactId = parsedUrlState.artifactId && artifactMap.has(parsedUrlState.artifactId) ? parsedUrlState.artifactId : artifacts[0]?.id ?? null;
  state.moderationArtifactId = state.curatorArtifactId;
  renderCuratorArtifactOptions();
  renderModerationArtifactOptions();

  trackEvent("session_started", {
    sessionId: analytics.getSessionId(),
    compareFromUrl: state.compareEnabled,
    detailView: state.activeDetailView,
    hasSearchQuery: Boolean(state.searchQuery),
    sortMode: state.sortMode,
    visualPreset: state.visualPreset,
    showcaseFromUrl: state.showcaseRequested
  });

  renderFilters();
  renderGallery();
  renderCompareList();
  renderInsightsPanel();
  renderRecentUpdatesPanel();
  applyVisualPreset(state.visualPreset, { skipTrack: true, skipUrlUpdate: true });
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
  await loadServerData();
  await loadArtifact(artifactId, { restoreFromUrl: true, skipCompareReload: true });

  if (state.showcaseRequested) {
    setShowcaseActive(true, { source: "url", skipTrack: true });
  }

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
  document.addEventListener("keydown", handleKeydown);

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

  elements.sortSelect.addEventListener("change", () => {
    state.sortMode = elements.sortSelect.value;
    renderGallery();
    scheduleUrlUpdate();
    trackEvent("gallery_sort_changed", {
      sortMode: state.sortMode,
      results: getRankedArtifacts().length
    });
  });

  elements.resetBtn.addEventListener("click", () => {
    haltShowcaseForManualInteraction("camera_reset");
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
    haltShowcaseForManualInteraction("toggle_hotspots");
    primaryViewer.toggleHotspots();
  });

  elements.tourBtn.addEventListener("click", () => {
    haltShowcaseForManualInteraction("tour_toggle");
    if (state.tourActive) {
      primaryViewer.stopTour();
      showToast("Tour paused");
      return;
    }

    setDetailView("hotspots", { skipUrlUpdate: true });
    primaryViewer.startTour(0);
  });

  elements.compareBtn.addEventListener("click", async () => {
    haltShowcaseForManualInteraction("compare_toggle");
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
    haltShowcaseForManualInteraction("compare_sync_toggle");
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

  elements.presetBtn.addEventListener("click", () => {
    cycleVisualPreset("ui");
  });

  elements.showcaseBtn.addEventListener("click", () => {
    setShowcaseActive(!state.showcaseActive, { source: "ui" });
  });

  elements.curatorBtn.addEventListener("click", () => {
    setCuratorOpen(!state.curatorOpen, { source: "ui" });
  });

  elements.curatorCloseBtn.addEventListener("click", () => {
    setCuratorOpen(false, { source: "ui" });
  });

  elements.curatorModal.addEventListener("click", (event) => {
    if (event.target === elements.curatorModal) {
      setCuratorOpen(false, { source: "overlay" });
    }
  });

  elements.curatorArtifactSelect.addEventListener("change", () => {
    state.curatorArtifactId = elements.curatorArtifactSelect.value;
    populateCuratorForm(state.curatorArtifactId);
  });

  elements.curatorTokenInput.addEventListener("input", () => {
    state.curatorToken = elements.curatorTokenInput.value;
  });

  elements.curatorResetBtn.addEventListener("click", () => {
    populateCuratorForm(state.curatorArtifactId);
    setCuratorStatus("Reset to current artifact content.", "success");
  });

  elements.curatorDeleteBtn.addEventListener("click", async () => {
    await deleteCuratorOverride(state.curatorArtifactId);
  });

  elements.curatorForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveCuratorOverride(state.curatorArtifactId);
  });

  elements.moderationBtn.addEventListener("click", () => {
    setModerationOpen(!state.moderationOpen, { source: "ui" });
  });

  elements.moderationCloseBtn.addEventListener("click", () => {
    setModerationOpen(false, { source: "ui" });
  });

  elements.moderationModal.addEventListener("click", (event) => {
    if (event.target === elements.moderationModal) {
      setModerationOpen(false, { source: "overlay" });
    }
  });

  elements.moderationTokenInput.addEventListener("input", () => {
    state.moderationToken = elements.moderationTokenInput.value;
  });

  elements.moderationReasonInput.addEventListener("input", () => {
    state.moderationReason = elements.moderationReasonInput.value;
  });

  elements.moderationArtifactSelect.addEventListener("change", async () => {
    state.moderationArtifactId = elements.moderationArtifactSelect.value;
    await loadModerationRevisions(state.moderationArtifactId);
  });

  elements.moderationRefreshBtn.addEventListener("click", async () => {
    await loadModerationData();
    setModerationStatus("Moderation queue refreshed.", "success");
  });

  elements.moderationPendingList.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const button = target.closest("button[data-action]");
    if (!(button instanceof HTMLButtonElement)) {
      const row = target.closest("[data-select-submission]");
      if (row instanceof HTMLElement && row.dataset.selectSubmission) {
        selectModerationSubmission(row.dataset.selectSubmission);
      }
      return;
    }

    const submissionId = button.dataset.submissionId;
    if (!submissionId) {
      return;
    }

    if (button.dataset.action === "preview") {
      selectModerationSubmission(submissionId);
      return;
    }

    if (button.dataset.action === "approve") {
      await approveSubmission(submissionId);
      return;
    }

    if (button.dataset.action === "reject") {
      await rejectSubmission(submissionId);
    }
  });

  elements.moderationRevisionsList.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }

    const revisionId = target.dataset.revisionId;
    if (!revisionId) {
      return;
    }

    if (target.dataset.action === "restore") {
      await restoreRevision(revisionId);
    }
  });

  elements.shortcutsBtn.addEventListener("click", () => {
    setShortcutsOpen(!state.shortcutsOpen, { source: "ui" });
  });

  elements.shortcutsCloseBtn.addEventListener("click", () => {
    setShortcutsOpen(false, { source: "ui" });
  });

  elements.shortcutsModal.addEventListener("click", (event) => {
    if (event.target === elements.shortcutsModal) {
      setShortcutsOpen(false, { source: "overlay" });
    }
  });

  elements.listToggleBtn.addEventListener("click", () => {
    setDetailView("hotspots");
  });

  elements.storyToggleBtn.addEventListener("click", () => {
    setDetailView("story");
  });

  elements.prevStepBtn.addEventListener("click", () => primaryViewer.previousTourStep());
  elements.nextStepBtn.addEventListener("click", () => primaryViewer.nextTourStep());
  elements.tourAutoBtn.addEventListener("click", () => {
    setTourAutoplay(!state.tourAutoPlay, { source: "ui" });
  });

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

  elements.shareBtn.addEventListener("click", () => {
    void shareCurrentView();
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

  elements.updatesContent.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const button = target.closest("button[data-update-artifact-id]");
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const artifactId = button.dataset.updateArtifactId;
    if (!artifactId || !artifactMap.has(artifactId)) {
      return;
    }

    trackEvent("recent_update_opened", { artifactId });
    void loadArtifact(artifactId, { restoreFromUrl: false });
  });

  window.addEventListener("beforeunload", () => {
    clearShowcaseTimer();
    analytics.shutdown();
  });

  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      state.shortcutPlatform = detectShortcutPlatform();
      updateSearchShortcutHint();
    }
  });
}

async function loadArtifact(artifactId, options = {}) {
  const artifact = artifactMap.get(artifactId);
  if (!artifact) {
    return;
  }

  if (state.showcaseActive && !options.fromShowcase) {
    setShowcaseActive(false, {
      source: options.source ?? "manual_navigation",
      skipToast: true
    });
  }
  const loadStartedAt = performance.now();

  state.currentArtifactId = artifactId;
  state.selectedHotspot = null;
  state.tourActive = false;
  state.previousTourState = { active: false, index: null };
  clearTourAutoplay();

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
    if (state.curatorOpen && state.curatorArtifactId === artifactId) {
      populateCuratorForm(artifactId);
    }

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
        sortMode: state.sortMode,
        detailView: state.activeDetailView,
        tourAutoPlay: state.tourAutoPlay
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

  refreshArtifactSearchIndexes();
}

async function loadServerData() {
  const [overridesResult, countersResult, updatesResult] = await Promise.allSettled([
    fetch("/api/cms/overrides"),
    fetch("/api/analytics/counters"),
    fetch("/api/cms/recent-updates?limit=12")
  ]);

  if (overridesResult.status === "fulfilled" && overridesResult.value.ok) {
    const payload = await overridesResult.value.json();
    state.cmsOverrides = payload.overrides ?? {};
    applyOverrides(state.cmsOverrides);
  }

  if (countersResult.status === "fulfilled" && countersResult.value.ok) {
    const payload = await countersResult.value.json();
    state.serverMetrics = payload.artifacts ?? {};
  }

  if (updatesResult.status === "fulfilled" && updatesResult.value.ok) {
    const payload = await updatesResult.value.json();
    state.recentUpdates = Array.isArray(payload.updates) ? payload.updates : [];
  }

  renderCuratorArtifactOptions();
  renderGallery();
  renderInsightsPanel();
  renderRecentUpdatesPanel();
}

function applyOverrides(overrides) {
  for (const artifact of artifacts) {
    const base = baseArtifactsById[artifact.id];
    if (base) {
      Object.assign(artifact, structuredClone(base));
    }

    const override = overrides[artifact.id];
    if (!override || typeof override !== "object") {
      continue;
    }

    if (typeof override.title === "string" && override.title.trim()) {
      artifact.title = override.title.trim();
    }

    if (typeof override.hook === "string" && override.hook.trim()) {
      artifact.hook = override.hook.trim();
    }

    if (Array.isArray(override.keywords)) {
      artifact.keywords = override.keywords.filter((entry) => typeof entry === "string");
    }

    if (Number.isFinite(override.releaseYear)) {
      artifact.releaseYear = Number(override.releaseYear);
    }

    if (Number.isFinite(override.featuredRank)) {
      artifact.featuredRank = Number(override.featuredRank);
    }

    if (override.story && typeof override.story === "object") {
      artifact.story = {
        ...artifact.story,
        ...override.story
      };
    }

    if (Array.isArray(override.hotspots)) {
      const byId = new Map((artifact.hotspots ?? []).map((hotspot) => [hotspot.id, hotspot]));
      artifact.hotspots = override.hotspots.map((hotspot) => {
        const source = byId.get(hotspot.id) ?? {};
        return {
          ...source,
          ...hotspot
        };
      });
    }
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
  const {
    hotspotId,
    tourStep,
    cameraPose,
    detailView,
    tourAutoPlay,
    viewSpecified,
    hotspotSpecified,
    tourSpecified,
    autoplaySpecified
  } = state.pendingState;
  const artifactProgress = state.sessionProgress?.[state.currentArtifactId] ?? null;

  const initialDetailView = viewSpecified ? detailView : artifactProgress?.detailView ?? detailView;
  const initialAutoplay = autoplaySpecified ? tourAutoPlay : artifactProgress?.tourAutoPlay ?? tourAutoPlay;
  setDetailView(initialDetailView, { skipUrlUpdate: true });
  setTourAutoplay(initialAutoplay, { skipUrlUpdate: true, skipTrack: true, source: "restore" });

  if (cameraPose) {
    primaryViewer.applyCameraPose(cameraPose);
  }

  if (tourSpecified && Number.isInteger(tourStep)) {
    primaryViewer.startTour(tourStep);
    return;
  }

  if (hotspotSpecified && hotspotId) {
    primaryViewer.selectHotspot(hotspotId, { focus: true });
    return;
  }

  if (artifactProgress?.tourActive && Number.isInteger(artifactProgress.tourIndex)) {
    primaryViewer.startTour(artifactProgress.tourIndex);
    return;
  }

  if (artifactProgress?.hotspotId) {
    primaryViewer.selectHotspot(artifactProgress.hotspotId, { focus: false });
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

  saveProgressForCurrentArtifact();

  if (!options.skipUrlUpdate) {
    scheduleUrlUpdate();
  }
}

function updateDetailToggleUI() {
  const inHotspotView = state.activeDetailView === "hotspots";
  elements.listToggleBtn.classList.toggle("is-active", inHotspotView);
  elements.storyToggleBtn.classList.toggle("is-active", !inHotspotView);
}

function renderCuratorArtifactOptions() {
  const optionsMarkup = artifacts
    .map((artifact) => `<option value="${escapeHtml(artifact.id)}">${escapeHtml(artifact.title)}</option>`)
    .join("");

  elements.curatorArtifactSelect.innerHTML = optionsMarkup;

  if (state.curatorArtifactId && artifactMap.has(state.curatorArtifactId)) {
    elements.curatorArtifactSelect.value = state.curatorArtifactId;
  } else if (artifacts[0]) {
    state.curatorArtifactId = artifacts[0].id;
    elements.curatorArtifactSelect.value = artifacts[0].id;
  }
}

function renderModerationArtifactOptions() {
  const optionsMarkup = artifacts
    .map((artifact) => `<option value="${escapeHtml(artifact.id)}">${escapeHtml(artifact.title)}</option>`)
    .join("");

  elements.moderationArtifactSelect.innerHTML = optionsMarkup;

  if (state.moderationArtifactId && artifactMap.has(state.moderationArtifactId)) {
    elements.moderationArtifactSelect.value = state.moderationArtifactId;
  } else if (artifacts[0]) {
    state.moderationArtifactId = artifacts[0].id;
    elements.moderationArtifactSelect.value = artifacts[0].id;
  }
}

function setModerationOpen(open, options = {}) {
  state.moderationOpen = Boolean(open);
  elements.moderationModal.hidden = !state.moderationOpen;

  if (state.moderationOpen) {
    haltShowcaseForManualInteraction("open_moderation");
    if (state.shortcutsOpen) {
      setShortcutsOpen(false, { skipTrack: true });
    }
    if (state.curatorOpen) {
      setCuratorOpen(false, { skipTrack: true });
    }

    state.moderationArtifactId = state.currentArtifactId ?? state.moderationArtifactId ?? artifacts[0]?.id ?? null;
    renderModerationArtifactOptions();
    elements.moderationTokenInput.value = state.moderationToken;
    elements.moderationReasonInput.value = state.moderationReason;
    void loadModerationData();
    elements.moderationCloseBtn.focus();
  } else {
    elements.moderationBtn.focus();
  }

  if (!options.skipTrack) {
    trackEvent("moderation_overlay_toggled", {
      open: state.moderationOpen,
      source: options.source ?? "unknown"
    });
  }
}

function setModerationStatus(message, tone = "neutral") {
  elements.moderationStatus.textContent = message;
  elements.moderationStatus.classList.toggle("is-error", tone === "error");
  elements.moderationStatus.classList.toggle("is-success", tone === "success");
}

function getModerationHeaders() {
  const headers = {
    "content-type": "application/json"
  };

  const token = state.moderationToken.trim() || state.curatorToken.trim();
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  return headers;
}

async function loadModerationData() {
  const [pendingResult, allResult] = await Promise.allSettled([
    fetch("/api/cms/submissions?status=pending&include=override"),
    fetch("/api/cms/submissions?status=all")
  ]);

  if (pendingResult.status !== "fulfilled" || !pendingResult.value.ok) {
    setModerationStatus("Failed to load pending submissions.", "error");
    return;
  }

  const submissionsPayload = await pendingResult.value.json();
  state.moderationSubmissions = Array.isArray(submissionsPayload.submissions) ? submissionsPayload.submissions : [];
  if (
    !state.moderationSubmissions.length ||
    !state.moderationSubmissions.some((submission) => submission.id === state.moderationSelectedSubmissionId)
  ) {
    state.moderationSelectedSubmissionId = state.moderationSubmissions[0]?.id ?? null;
  }

  if (allResult.status === "fulfilled" && allResult.value.ok) {
    const allPayload = await allResult.value.json();
    const allSubmissions = Array.isArray(allPayload.submissions) ? allPayload.submissions : [];
    state.moderationRecentDecisions = allSubmissions
      .filter((submission) => submission.status === "approved" || submission.status === "rejected")
      .sort((left, right) => new Date(right.reviewedAt || right.createdAt).getTime() - new Date(left.reviewedAt || left.createdAt).getTime())
      .slice(0, 16);
  } else {
    state.moderationRecentDecisions = [];
  }

  renderModerationPendingList();
  renderModerationDiffPanel();
  renderModerationDecisionsList();
  await loadModerationRevisions(state.moderationArtifactId, { silent: true });
  setModerationStatus("Queue loaded.", "neutral");
}

async function loadModerationRevisions(artifactId, options = {}) {
  if (!artifactId) {
    state.moderationRevisions = [];
    renderModerationRevisions();
    return;
  }

  const response = await fetch(`/api/cms/revisions/${encodeURIComponent(artifactId)}`);
  if (!response.ok) {
    if (!options.silent) {
      setModerationStatus("Failed to load revisions.", "error");
    }
    return;
  }

  const payload = await response.json();
  state.moderationRevisions = Array.isArray(payload.revisions) ? payload.revisions : [];
  renderModerationRevisions();
}

function renderModerationPendingList() {
  if (!state.moderationSubmissions.length) {
    elements.moderationPendingList.innerHTML = '<p class="insights-empty">No pending submissions.</p>';
    renderModerationDiffPanel();
    return;
  }

  elements.moderationPendingList.innerHTML = state.moderationSubmissions
    .map((submission) => {
      const preview = submission.operation === "delete" ? "Delete live override" : "Update override";
      const selectedClass = submission.id === state.moderationSelectedSubmissionId ? "is-selected" : "";
      const diff = getSubmissionDiffModel(submission);
      const changedFieldsText = diff.changedPaths.length ? `${diff.changedPaths.length} changed fields` : "No effective changes";
      return `
        <div class="curator-hotspot ${selectedClass}" data-select-submission="${escapeHtml(submission.id)}">
          <p class="curator-hotspot-title">${escapeHtml(submission.id)}</p>
          <p class="moderation-meta">
            <strong>${escapeHtml(submission.artifactId)}</strong> · ${escapeHtml(preview)}<br />
            ${escapeHtml(new Date(submission.createdAt).toLocaleString())}<br />
            ${escapeHtml(changedFieldsText)}
          </p>
          <div class="moderation-actions">
            <button class="chip-btn" data-action="preview" data-submission-id="${escapeHtml(submission.id)}" type="button">Preview Diff</button>
            <button class="chip-btn is-active" data-action="approve" data-submission-id="${escapeHtml(submission.id)}" type="button">Approve</button>
            <button class="chip-btn" data-action="reject" data-submission-id="${escapeHtml(submission.id)}" type="button">Reject</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function selectModerationSubmission(submissionId) {
  if (!submissionId) {
    return;
  }

  state.moderationSelectedSubmissionId = submissionId;
  renderModerationPendingList();
  renderModerationDiffPanel();
}

function renderModerationDiffPanel() {
  if (!state.moderationSubmissions.length) {
    elements.moderationDiffSummary.textContent = "No pending submission selected.";
    elements.moderationDiffBefore.textContent = "{}";
    elements.moderationDiffAfter.textContent = "{}";
    return;
  }

  const selected =
    state.moderationSubmissions.find((submission) => submission.id === state.moderationSelectedSubmissionId) ?? state.moderationSubmissions[0];
  if (!selected) {
    elements.moderationDiffSummary.textContent = "No pending submission selected.";
    elements.moderationDiffBefore.textContent = "{}";
    elements.moderationDiffAfter.textContent = "{}";
    return;
  }

  const diff = getSubmissionDiffModel(selected);
  const changedFields = diff.changedPaths.length ? diff.changedPaths.join(", ") : "No effective field change";
  elements.moderationDiffSummary.textContent = `${selected.artifactId} · ${selected.operation} · ${changedFields}`;
  elements.moderationDiffBefore.textContent = formatJsonCode(diff.beforeOverride);
  elements.moderationDiffAfter.textContent = formatJsonCode(diff.afterOverride);
}

function renderModerationDecisionsList() {
  if (!state.moderationRecentDecisions.length) {
    elements.moderationDecisionsList.innerHTML = '<p class="insights-empty">No reviewed submissions yet.</p>';
    return;
  }

  elements.moderationDecisionsList.innerHTML = state.moderationRecentDecisions
    .map((submission) => {
      const statusLabel = submission.status === "rejected" ? "Rejected" : "Approved";
      const reason = submission.reason?.trim() ? submission.reason.trim() : "No moderation note.";
      const reviewedAt = submission.reviewedAt || submission.createdAt;

      return `
        <div class="curator-hotspot">
          <p class="curator-hotspot-title">${escapeHtml(submission.id)}</p>
          <p class="moderation-meta">
            <strong>${escapeHtml(submission.artifactId)}</strong> · ${escapeHtml(statusLabel)}<br />
            ${escapeHtml(reason)}<br />
            ${escapeHtml(new Date(reviewedAt).toLocaleString())}
          </p>
        </div>
      `;
    })
    .join("");
}

function renderModerationRevisions() {
  if (!state.moderationRevisions.length) {
    elements.moderationRevisionsList.innerHTML = '<p class="insights-empty">No revisions for this artifact yet.</p>';
    return;
  }

  elements.moderationRevisionsList.innerHTML = state.moderationRevisions
    .map((revision) => {
      const actionLabel = revision.action === "restore_revision" ? "Restored" : "Approved submission";
      const reason = revision.reason?.trim() ? revision.reason.trim() : "No moderation note.";
      return `
        <div class="curator-hotspot">
          <p class="curator-hotspot-title">${escapeHtml(revision.id)}</p>
          <p class="moderation-meta">
            ${escapeHtml(actionLabel)} · ${escapeHtml(new Date(revision.createdAt).toLocaleString())}<br />
            ${escapeHtml(reason)}
          </p>
          <div class="moderation-actions">
            <button class="chip-btn" data-action="restore" data-revision-id="${escapeHtml(revision.id)}" type="button">Restore This</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function getSubmissionDiffModel(submission) {
  const beforeOverride = state.cmsOverrides[submission.artifactId] ? structuredClone(state.cmsOverrides[submission.artifactId]) : null;
  const afterOverride =
    submission.operation === "delete" ? null : applySubmissionPreviewOverride(beforeOverride ?? {}, submission.override ?? {});
  const changedPaths = collectDiffPaths(beforeOverride ?? {}, afterOverride ?? {});

  return {
    beforeOverride,
    afterOverride,
    changedPaths
  };
}

function applySubmissionPreviewOverride(existing, update) {
  const next = { ...existing };
  const allowed = ["title", "hook", "keywords", "story", "releaseYear", "featuredRank", "hotspots"];

  for (const key of allowed) {
    if (update[key] !== undefined) {
      next[key] = update[key];
    }
  }

  return next;
}

function collectDiffPaths(before, after, prefix = "") {
  if (before === after) {
    return [];
  }

  if (Array.isArray(before) || Array.isArray(after)) {
    const beforeEncoded = JSON.stringify(before ?? null);
    const afterEncoded = JSON.stringify(after ?? null);
    return beforeEncoded === afterEncoded ? [] : [prefix || "(root)"];
  }

  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const paths = [];

    for (const key of keys) {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      paths.push(...collectDiffPaths(before[key], after[key], nextPrefix));
    }

    return paths;
  }

  const beforeEncoded = JSON.stringify(before ?? null);
  const afterEncoded = JSON.stringify(after ?? null);
  return beforeEncoded === afterEncoded ? [] : [prefix || "(root)"];
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatJsonCode(value) {
  return JSON.stringify(value ?? null, null, 2);
}

async function approveSubmission(submissionId) {
  const submission = state.moderationSubmissions.find((item) => item.id === submissionId);
  if (!submission) {
    return;
  }

  setModerationStatus("Approving submission...", "neutral");
  elements.moderationRefreshBtn.disabled = true;

  try {
    const response = await fetch(`/api/cms/submissions/${encodeURIComponent(submissionId)}/approve`, {
      method: "POST",
      headers: getModerationHeaders(),
      body: JSON.stringify({ reason: state.moderationReason.trim() || undefined })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "request_failed" }));
      throw new Error(error.error || `request_failed_${response.status}`);
    }

    await loadServerData();
    await loadModerationData();
    if (submission.artifactId === state.currentArtifactId) {
      await loadArtifact(state.currentArtifactId, { restoreFromUrl: false, skipCompareReload: !state.compareEnabled });
    }

    setModerationStatus("Submission approved and published.", "success");
    trackEvent("moderation_submission_approved", {
      artifactId: submission.artifactId,
      submissionId
    });
  } catch (error) {
    setModerationStatus(`Approval failed: ${error.message}`, "error");
  } finally {
    elements.moderationRefreshBtn.disabled = false;
  }
}

async function rejectSubmission(submissionId) {
  const submission = state.moderationSubmissions.find((item) => item.id === submissionId);
  if (!submission) {
    return;
  }

  const reason = state.moderationReason.trim();
  if (!reason) {
    setModerationStatus("Rejection requires a review note.", "error");
    return;
  }

  setModerationStatus("Rejecting submission...", "neutral");
  elements.moderationRefreshBtn.disabled = true;

  try {
    const response = await fetch(`/api/cms/submissions/${encodeURIComponent(submissionId)}/reject`, {
      method: "POST",
      headers: getModerationHeaders(),
      body: JSON.stringify({ reason })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "request_failed" }));
      throw new Error(error.error || `request_failed_${response.status}`);
    }

    await loadModerationData();
    setModerationStatus("Submission rejected.", "success");
    trackEvent("moderation_submission_rejected", {
      artifactId: submission.artifactId,
      submissionId
    });
  } catch (error) {
    setModerationStatus(`Rejection failed: ${error.message}`, "error");
  } finally {
    elements.moderationRefreshBtn.disabled = false;
  }
}

async function restoreRevision(revisionId) {
  if (!state.moderationArtifactId) {
    return;
  }

  setModerationStatus("Restoring revision...", "neutral");
  elements.moderationRefreshBtn.disabled = true;

  try {
    const response = await fetch(
      `/api/cms/revisions/${encodeURIComponent(state.moderationArtifactId)}/${encodeURIComponent(revisionId)}/restore`,
      {
        method: "POST",
        headers: getModerationHeaders(),
        body: JSON.stringify({ reason: state.moderationReason.trim() || undefined })
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "request_failed" }));
      throw new Error(error.error || `request_failed_${response.status}`);
    }

    await loadServerData();
    await loadModerationData();
    if (state.moderationArtifactId === state.currentArtifactId) {
      await loadArtifact(state.currentArtifactId, { restoreFromUrl: false, skipCompareReload: !state.compareEnabled });
    }

    setModerationStatus("Revision restored successfully.", "success");
    trackEvent("moderation_revision_restored", {
      artifactId: state.moderationArtifactId,
      revisionId
    });
  } catch (error) {
    setModerationStatus(`Restore failed: ${error.message}`, "error");
  } finally {
    elements.moderationRefreshBtn.disabled = false;
  }
}

function setCuratorOpen(open, options = {}) {
  state.curatorOpen = Boolean(open);
  elements.curatorModal.hidden = !state.curatorOpen;

  if (state.curatorOpen) {
    haltShowcaseForManualInteraction("open_curator");
    if (state.shortcutsOpen) {
      setShortcutsOpen(false, { skipTrack: true });
    }
    if (state.moderationOpen) {
      setModerationOpen(false, { skipTrack: true });
    }
    if (!state.curatorArtifactId) {
      state.curatorArtifactId = state.currentArtifactId ?? artifacts[0]?.id ?? null;
    }
    renderCuratorArtifactOptions();
    populateCuratorForm(state.curatorArtifactId);
    elements.curatorArtifactSelect.focus();
  } else {
    elements.curatorBtn.focus();
  }

  if (!options.skipTrack) {
    trackEvent("curator_overlay_toggled", {
      open: state.curatorOpen,
      source: options.source ?? "unknown"
    });
  }
}

function setCuratorStatus(message, tone = "neutral") {
  elements.curatorStatus.textContent = message;
  elements.curatorStatus.classList.toggle("is-error", tone === "error");
  elements.curatorStatus.classList.toggle("is-success", tone === "success");
}

function setCuratorBusy(isBusy) {
  elements.curatorSaveBtn.disabled = isBusy;
  elements.curatorDeleteBtn.disabled = isBusy;
  elements.curatorResetBtn.disabled = isBusy;
}

function populateCuratorForm(artifactId) {
  const artifact = artifactMap.get(artifactId);
  if (!artifact) {
    return;
  }

  elements.curatorArtifactSelect.value = artifactId;
  elements.curatorTokenInput.value = state.curatorToken;
  elements.curatorTitleInput.value = artifact.title ?? "";
  elements.curatorHookInput.value = artifact.hook ?? "";
  elements.curatorKeywordsInput.value = Array.isArray(artifact.keywords) ? artifact.keywords.join(", ") : "";
  elements.curatorYearInput.value = Number.isFinite(artifact.releaseYear) ? String(artifact.releaseYear) : "";
  elements.curatorRankInput.value = Number.isFinite(artifact.featuredRank) ? String(artifact.featuredRank) : "";
  elements.curatorStoryTitleInput.value = artifact.story?.title ?? "";
  elements.curatorStorySummaryInput.value = artifact.story?.summary ?? "";
  elements.curatorStoryBodyInput.value = Array.isArray(artifact.story?.body) ? artifact.story.body.join("\n") : "";
  elements.curatorStoryReferencesInput.value = Array.isArray(artifact.story?.references)
    ? artifact.story.references.map((reference) => `${reference.label ?? ""} | ${reference.url ?? ""}`).join("\n")
    : "";

  state.curatorWorkingHotspots = Array.isArray(artifact.hotspots)
    ? artifact.hotspots.map((hotspot) => ({
        id: hotspot.id,
        label: hotspot.label ?? "",
        title: hotspot.title ?? "",
        body: hotspot.body ?? "",
        reference: hotspot.reference ?? ""
      }))
    : [];

  renderCuratorHotspotsEditor();

  const hasOverride = Boolean(state.cmsOverrides[artifactId]);
  if (hasOverride) {
    setCuratorStatus("Editing currently live override content.", "success");
  } else {
    setCuratorStatus("No live override yet. Submission will enter moderation queue.", "neutral");
  }
}

function renderCuratorHotspotsEditor() {
  if (!state.curatorWorkingHotspots.length) {
    elements.curatorHotspotsList.innerHTML = '<p class="insights-empty">No hotspots available for this artifact.</p>';
    return;
  }

  elements.curatorHotspotsList.innerHTML = state.curatorWorkingHotspots
    .map(
      (hotspot) => `
        <div class="curator-hotspot" data-hotspot-id="${escapeHtml(hotspot.id)}">
          <p class="curator-hotspot-title">${escapeHtml(hotspot.id)}</p>
          <label class="curator-field">
            <span>Label</span>
            <input class="search-input curator-hotspot-label" type="text" value="${escapeHtml(hotspot.label)}" />
          </label>
          <label class="curator-field">
            <span>Title</span>
            <input class="search-input curator-hotspot-title-input" type="text" value="${escapeHtml(hotspot.title)}" />
          </label>
          <label class="curator-field">
            <span>Body</span>
            <textarea class="curator-textarea curator-hotspot-body" rows="3">${escapeHtml(hotspot.body)}</textarea>
          </label>
          <label class="curator-field">
            <span>Reference URL</span>
            <input class="search-input curator-hotspot-reference" type="text" value="${escapeHtml(hotspot.reference ?? "")}" />
          </label>
        </div>
      `
    )
    .join("");
}

function collectCuratorHotspots() {
  const nodes = Array.from(elements.curatorHotspotsList.querySelectorAll("[data-hotspot-id]"));

  return nodes.map((node) => {
    const id = node.getAttribute("data-hotspot-id") ?? "";
    const source = artifactMap.get(state.curatorArtifactId)?.hotspots?.find((item) => item.id === id);
    return {
      ...(source ?? { id }),
      id,
      label: node.querySelector(".curator-hotspot-label")?.value?.trim() ?? "",
      title: node.querySelector(".curator-hotspot-title-input")?.value?.trim() ?? "",
      body: node.querySelector(".curator-hotspot-body")?.value?.trim() ?? "",
      reference: node.querySelector(".curator-hotspot-reference")?.value?.trim() || undefined
    };
  });
}

function collectCuratorPayload() {
  const yearRaw = elements.curatorYearInput.value.trim();
  const rankRaw = elements.curatorRankInput.value.trim();
  const parsedYear = Number(yearRaw);
  const parsedRank = Number(rankRaw);

  const keywords = elements.curatorKeywordsInput.value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const storyBody = elements.curatorStoryBodyInput.value
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const storyReferences = elements.curatorStoryReferencesInput.value
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [labelPart, urlPart] = entry.split("|");
      return {
        label: (labelPart ?? "").trim(),
        url: (urlPart ?? "").trim()
      };
    })
    .filter((entry) => entry.label && entry.url);

  return {
    title: elements.curatorTitleInput.value.trim(),
    hook: elements.curatorHookInput.value.trim(),
    keywords,
    releaseYear: yearRaw && Number.isFinite(parsedYear) ? parsedYear : null,
    featuredRank: rankRaw && Number.isFinite(parsedRank) ? parsedRank : null,
    story: {
      title: elements.curatorStoryTitleInput.value.trim(),
      summary: elements.curatorStorySummaryInput.value.trim(),
      body: storyBody,
      references: storyReferences
    },
    hotspots: collectCuratorHotspots()
  };
}

function getCuratorHeaders() {
  const headers = {
    "content-type": "application/json"
  };

  const token = state.curatorToken.trim();
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  return headers;
}

async function saveCuratorOverride(artifactId) {
  if (!artifactId) {
    setCuratorStatus("Select an artifact first.", "error");
    return;
  }

  setCuratorBusy(true);
  setCuratorStatus("Submitting override to moderation queue...", "neutral");

  try {
    const payload = collectCuratorPayload();
    const response = await fetch(`/api/cms/overrides/${encodeURIComponent(artifactId)}`, {
      method: "PUT",
      headers: getCuratorHeaders(),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "request_failed" }));
      throw new Error(error.error || `request_failed_${response.status}`);
    }

    const data = await response.json();
    if (state.moderationOpen) {
      await loadModerationData();
    }

    setCuratorStatus(`Submitted for review (${data.submission?.id ?? "queued"}).`, "success");
    trackEvent("curator_submission_created", {
      artifactId,
      submissionId: data.submission?.id ?? null
    });
  } catch (error) {
    setCuratorStatus(`Submit failed: ${error.message}`, "error");
  } finally {
    setCuratorBusy(false);
  }
}

async function deleteCuratorOverride(artifactId) {
  if (!artifactId) {
    setCuratorStatus("Select an artifact first.", "error");
    return;
  }

  setCuratorBusy(true);
  setCuratorStatus("Submitting delete request to moderation queue...", "neutral");

  try {
    const response = await fetch(`/api/cms/overrides/${encodeURIComponent(artifactId)}`, {
      method: "DELETE",
      headers: getCuratorHeaders()
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "request_failed" }));
      throw new Error(error.error || `request_failed_${response.status}`);
    }

    const data = await response.json();
    if (state.moderationOpen) {
      await loadModerationData();
    }

    setCuratorStatus(`Delete request submitted (${data.submission?.id ?? "queued"}).`, "success");
    trackEvent("curator_delete_submission_created", {
      artifactId,
      submissionId: data.submission?.id ?? null
    });
  } catch (error) {
    setCuratorStatus(`Delete request failed: ${error.message}`, "error");
  } finally {
    setCuratorBusy(false);
  }
}

function setShortcutsOpen(open, options = {}) {
  state.shortcutsOpen = Boolean(open);
  elements.shortcutsModal.hidden = !state.shortcutsOpen;

  if (state.shortcutsOpen) {
    haltShowcaseForManualInteraction("open_shortcuts");
    if (state.curatorOpen) {
      setCuratorOpen(false, { skipTrack: true });
    }
    if (state.moderationOpen) {
      setModerationOpen(false, { skipTrack: true });
    }
    elements.shortcutsCloseBtn.focus();
  } else {
    elements.shortcutsBtn.focus();
  }

  if (!options.skipTrack) {
    trackEvent("shortcuts_overlay_toggled", {
      open: state.shortcutsOpen,
      source: options.source ?? "unknown"
    });
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
  const visibleArtifacts = getRankedArtifacts();
  const totalArtifacts = artifacts.length;
  elements.galleryStats.textContent = `${visibleArtifacts.length} of ${totalArtifacts} artifacts`;

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

function renderInsightsPanel() {
  if (!state.currentArtifactId) {
    elements.insightsContent.innerHTML = '<p class="insights-empty">Load an artifact to start session insights.</p>';
    return;
  }

  const artifact = artifactMap.get(state.currentArtifactId);
  const artifactMetrics = getDisplayMetricsForArtifact(state.currentArtifactId);
  const hotspotEntries = Object.entries(artifactMetrics.hotspotCounts ?? {});
  const topHotspots = hotspotEntries
    .sort(([, leftCount], [, rightCount]) => rightCount - leftCount)
    .slice(0, 3)
    .map(([hotspotId, count]) => {
      const hotspot = artifact?.hotspots?.find((item) => item.id === hotspotId);
      return {
        label: hotspot?.label ?? hotspotId,
        count
      };
    });

  const metricItems = [
    { label: "Views", value: artifactMetrics.views },
    { label: "Hotspot Opens", value: artifactMetrics.hotspotOpens },
    { label: "Tour Starts", value: artifactMetrics.tourStarts },
    { label: "Tour Last Step", value: artifactMetrics.tourLastStepReached },
    { label: "Shares", value: artifactMetrics.shares }
  ];

  const topHotspotMarkup = topHotspots.length
    ? topHotspots
        .map(
          (entry) => `
            <li class="insights-top-item">
              <span>${escapeHtml(entry.label)}</span>
              <strong>${entry.count}</strong>
            </li>
          `
        )
        .join("")
    : '<li class="insights-top-item is-empty"><span>No hotspot interactions yet</span><strong>0</strong></li>';

  elements.insightsContent.innerHTML = `
    <div class="insights-grid">
      ${metricItems
        .map(
          (item) => `
            <div class="insight-chip">
              <span class="insight-label">${escapeHtml(item.label)}</span>
              <strong class="insight-value">${item.value}</strong>
            </div>
          `
        )
        .join("")}
    </div>
    <p class="insights-top-label">Top Hotspots</p>
    <ol class="insights-top-list">${topHotspotMarkup}</ol>
  `;
}

function renderRecentUpdatesPanel() {
  if (!Array.isArray(state.recentUpdates) || !state.recentUpdates.length) {
    elements.updatesContent.innerHTML = '<p class="insights-empty">No published updates yet.</p>';
    return;
  }

  elements.updatesContent.innerHTML = `
    <ol class="updates-list">
      ${state.recentUpdates
        .slice(0, 10)
        .map((update) => {
          const action =
            update.action === "restore_revision"
              ? "Restored Revision"
              : update.operation === "delete"
                ? "Approved Delete"
                : "Approved Update";

          const note = update.reason ? ` - ${update.reason}` : "";
          return `
            <li>
              <button class="update-item" type="button" data-update-artifact-id="${escapeHtml(update.artifactId)}">
                <span class="update-item-meta">${escapeHtml(update.artifactId)} · ${escapeHtml(action)}</span>
                <span>${escapeHtml(note || "Published change")}</span>
                <span class="update-item-time">${escapeHtml(new Date(update.createdAt).toLocaleString())}</span>
              </button>
            </li>
          `;
        })
        .join("")}
    </ol>
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

function updateTourAutoplayUI() {
  elements.tourAutoBtn.textContent = state.tourAutoPlay ? "Auto On" : "Auto Off";
  elements.tourAutoBtn.classList.toggle("is-active", state.tourAutoPlay);
  elements.tourAutoBtn.disabled = !state.tourActive;
}

function setTourAutoplay(enabled, options = {}) {
  state.tourAutoPlay = Boolean(enabled);
  updateTourAutoplayUI();
  saveProgressForCurrentArtifact();

  if (state.tourAutoPlay && state.tourActive) {
    scheduleTourAutoplay();
  } else {
    clearTourAutoplay();
  }

  if (!options.skipTrack) {
    trackEvent("tour_autoplay_toggled", {
      enabled: state.tourAutoPlay,
      source: options.source ?? "unknown"
    });
  }

  if (!options.skipUrlUpdate) {
    scheduleUrlUpdate();
  }
}

function clearTourAutoplay() {
  if (!state.tourAutoPlayTimer) {
    return;
  }
  window.clearTimeout(state.tourAutoPlayTimer);
  state.tourAutoPlayTimer = null;
}

function scheduleTourAutoplay() {
  clearTourAutoplay();

  if (!state.tourAutoPlay || !state.tourActive || state.tourTotal < 2) {
    return;
  }

  state.tourAutoPlayTimer = window.setTimeout(() => {
    const wasLastStep = state.tourIndex === state.tourTotal - 1;
    primaryViewer.nextTourStep();

    if (wasLastStep) {
      trackEvent("tour_loop_completed", {
        artifactId: state.currentArtifactId,
        totalSteps: state.tourTotal
      });
    }

    scheduleTourAutoplay();
  }, TOUR_AUTOPLAY_DELAY_MS);
}

function normalizeVisualPreset(value) {
  return VISUAL_PRESETS.includes(value) ? value : "white";
}

function applyVisualPreset(presetId, options = {}) {
  const normalizedPreset = normalizeVisualPreset(presetId);
  const previousPreset = state.visualPreset;
  state.visualPreset = normalizedPreset;

  primaryViewer.setVisualPreset(normalizedPreset);
  compareViewer.setVisualPreset(normalizedPreset);
  updateHeaderControls();

  if (previousPreset !== normalizedPreset && !options.skipTrack) {
    trackEvent("visual_preset_changed", {
      preset: normalizedPreset,
      source: options.source ?? "unknown"
    });
  }

  if (!options.skipUrlUpdate) {
    scheduleUrlUpdate();
  }
}

function cycleVisualPreset(source = "unknown") {
  const currentIndex = VISUAL_PRESETS.indexOf(state.visualPreset);
  const nextPreset = VISUAL_PRESETS[(Math.max(0, currentIndex) + 1) % VISUAL_PRESETS.length];
  applyVisualPreset(nextPreset, { source });
  showToast(`Preset: ${VISUAL_PRESET_LABELS[nextPreset] ?? nextPreset}`);
}

function clearShowcaseTimer() {
  if (!state.showcaseTimer) {
    return;
  }

  window.clearTimeout(state.showcaseTimer);
  state.showcaseTimer = null;
}

function haltShowcaseForManualInteraction(source) {
  if (!state.showcaseActive) {
    return;
  }

  setShowcaseActive(false, {
    source: source ?? "manual_interaction",
    skipToast: true
  });
}

function setShowcaseActive(enabled, options = {}) {
  const nextState = Boolean(enabled);
  if (state.showcaseActive === nextState) {
    return;
  }

  state.showcaseActive = nextState;

  if (state.showcaseActive) {
    state.showcasePreviousAutoplay = state.tourAutoPlay;
    if (state.curatorOpen) {
      setCuratorOpen(false, { skipTrack: true });
    }
    if (state.moderationOpen) {
      setModerationOpen(false, { skipTrack: true });
    }
    if (state.shortcutsOpen) {
      setShortcutsOpen(false, { skipTrack: true });
    }
    if (state.compareEnabled) {
      state.compareEnabled = false;
      state.compareReady = false;
      setCompareModeUI(false);
    }

    setDetailView("hotspots", { skipUrlUpdate: true });
    if (!state.tourActive) {
      primaryViewer.startTour(0);
    }
    setTourAutoplay(true, { source: "showcase", skipTrack: true, skipUrlUpdate: true });
    scheduleShowcaseAdvance();

    if (!options.skipToast) {
      showToast("Showcase mode on");
    }
  } else {
    clearShowcaseTimer();
    setTourAutoplay(state.showcasePreviousAutoplay, { source: "showcase", skipTrack: true, skipUrlUpdate: true });
    if (!options.skipToast) {
      showToast("Showcase mode off");
    }
  }

  updateHeaderControls();
  scheduleUrlUpdate();

  if (!options.skipTrack) {
    trackEvent("showcase_toggled", {
      enabled: state.showcaseActive,
      source: options.source ?? "unknown"
    });
  }
}

function scheduleShowcaseAdvance() {
  clearShowcaseTimer();
  if (!state.showcaseActive) {
    return;
  }

  const currentArtifact = artifactMap.get(state.currentArtifactId);
  const stepCount = Math.max(1, currentArtifact?.tour?.length ?? 1);
  const dwellMs = Math.max(16000, stepCount * TOUR_AUTOPLAY_DELAY_MS + 1200);

  state.showcaseTimer = window.setTimeout(() => {
    void advanceShowcaseArtifact();
  }, dwellMs);
}

async function advanceShowcaseArtifact() {
  if (!state.showcaseActive) {
    return;
  }

  const orderedArtifacts = getRankedArtifacts();
  if (!orderedArtifacts.length) {
    scheduleShowcaseAdvance();
    return;
  }

  const currentIndex = orderedArtifacts.findIndex((artifact) => artifact.id === state.currentArtifactId);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextArtifact = orderedArtifacts[(safeIndex + 1) % orderedArtifacts.length];
  if (!nextArtifact) {
    scheduleShowcaseAdvance();
    return;
  }

  await loadArtifact(nextArtifact.id, { restoreFromUrl: false, fromShowcase: true, source: "showcase_advance" });
  primaryViewer.startTour(0);
  setTourAutoplay(true, { source: "showcase", skipTrack: true, skipUrlUpdate: true });
  scheduleShowcaseAdvance();

  trackEvent("showcase_artifact_advanced", {
    artifactId: nextArtifact.id,
    position: safeIndex + 2,
    total: orderedArtifacts.length
  });
}

function updateHeaderControls() {
  elements.tourBtn.textContent = state.tourActive ? "Exit Tour" : "Start Tour";
  elements.hotspotToggleBtn.textContent = primaryViewer.hotspotsEnabled ? "Hide Hotspots" : "Show Hotspots";
  elements.compareBtn.textContent = state.compareEnabled ? "Exit Compare" : "Compare";
  elements.syncBtn.hidden = !state.compareEnabled;
  elements.syncBtn.textContent = state.compareSync ? "Sync On" : "Sync Off";
  elements.presetBtn.textContent = `Preset: ${VISUAL_PRESET_LABELS[state.visualPreset] ?? state.visualPreset}`;
  elements.showcaseBtn.textContent = state.showcaseActive ? "Showcase On" : "Showcase Off";
  elements.showcaseBtn.classList.toggle("is-active", state.showcaseActive);
  updateTourAutoplayUI();
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

function getSearchShortcutDescriptor(platform) {
  if (platform === "mac") {
    return {
      modifierLabel: "⌘",
      modifierName: "Command",
      altText: "Ctrl+K on Windows/Linux",
      ariaShortcuts: "Meta+K Control+K"
    };
  }

  return {
    modifierLabel: "Ctrl",
    modifierName: "Control",
    altText: "Cmd+K on macOS",
    ariaShortcuts: "Control+K Meta+K"
  };
}

function updateSearchShortcutHint() {
  const modifierEl = elements.searchShortcutModifier;
  const altEl = elements.searchShortcutAlt;
  const input = elements.searchInput;
  if (!modifierEl || !input) {
    return;
  }

  const descriptor = getSearchShortcutDescriptor(state.shortcutPlatform);
  modifierEl.textContent = descriptor.modifierLabel;
  modifierEl.setAttribute("aria-label", descriptor.modifierName);
  if (altEl) {
    altEl.textContent = descriptor.altText;
    altEl.hidden = !descriptor.altText;
  }
  input.setAttribute("aria-keyshortcuts", descriptor.ariaShortcuts);
}

function focusSearchInput(options = {}) {
  const input = elements.searchInput;
  if (!input) {
    return false;
  }

  const wasFocused = document.activeElement === input;

  if (typeof input.scrollIntoView === "function" && options.scroll !== false) {
    input.scrollIntoView({ behavior: options.behavior ?? "smooth", block: "center" });
  }

  input.focus();
  if (typeof input.select === "function") {
    input.select();
  }

  return !wasFocused;
}

function handleKeydown(event) {
  const normalizedKey = event.key.toLowerCase();
  const isSearchShortcut = normalizedKey === "k" && (event.metaKey || event.ctrlKey);
  if (isSearchShortcut) {
    event.preventDefault();
    haltShowcaseForManualInteraction("keyboard_search");
    if (state.shortcutsOpen) {
      setShortcutsOpen(false, { source: "keyboard", skipTrack: true });
    }
    if (state.curatorOpen) {
      setCuratorOpen(false, { source: "keyboard", skipTrack: true });
    }
    if (state.moderationOpen) {
      setModerationOpen(false, { source: "keyboard", skipTrack: true });
    }

    const focused = focusSearchInput({ behavior: "instant" });
    trackEvent("search_shortcut_used", {
      modifier: event.metaKey ? "meta" : "control",
      platform: state.shortcutPlatform,
      alreadyFocused: !focused,
      results: getVisibleArtifacts().length
    });
    return;
  }

  if (event.key === "Escape") {
    if (state.moderationOpen) {
      event.preventDefault();
      setModerationOpen(false, { source: "keyboard" });
      trackEvent("keyboard_shortcut_used", { key: "Escape", action: "close_moderation" });
      return;
    }

    if (state.curatorOpen) {
      event.preventDefault();
      setCuratorOpen(false, { source: "keyboard" });
      trackEvent("keyboard_shortcut_used", { key: "Escape", action: "close_curator" });
      return;
    }

    if (state.shortcutsOpen) {
      event.preventDefault();
      setShortcutsOpen(false, { source: "keyboard" });
      trackEvent("keyboard_shortcut_used", { key: "Escape", action: "close_shortcuts" });
      return;
    }

    if (state.showcaseActive) {
      event.preventDefault();
      setShowcaseActive(false, { source: "keyboard" });
      trackEvent("keyboard_shortcut_used", { key: "Escape", action: "stop_showcase" });
      return;
    }
  }

  const target = event.target;
  const isTypingTarget =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable);

  if (isTypingTarget) {
    return;
  }

  if (event.key === "?") {
    if (state.curatorOpen || state.moderationOpen) {
      return;
    }
    event.preventDefault();
    setShortcutsOpen(!state.shortcutsOpen, { source: "keyboard" });
    trackEvent("keyboard_shortcut_used", { key: "?", action: "toggle_shortcuts" });
    return;
  }

  if (state.curatorOpen) {
    return;
  }

  if (state.moderationOpen) {
    return;
  }

  if (state.shortcutsOpen) {
    return;
  }

  const key = normalizedKey;

  if (key === "h") {
    event.preventDefault();
    haltShowcaseForManualInteraction("keyboard_h");
    primaryViewer.toggleHotspots();
    trackEvent("keyboard_shortcut_used", { key: "h", action: "toggle_hotspots" });
    return;
  }

  if (key === "t") {
    event.preventDefault();
    haltShowcaseForManualInteraction("keyboard_t");
    elements.tourBtn.click();
    trackEvent("keyboard_shortcut_used", { key: "t", action: "toggle_tour" });
    return;
  }

  if (key === "c") {
    event.preventDefault();
    haltShowcaseForManualInteraction("keyboard_c");
    elements.compareBtn.click();
    trackEvent("keyboard_shortcut_used", { key: "c", action: "toggle_compare" });
    return;
  }

  if (key === "s") {
    event.preventDefault();
    haltShowcaseForManualInteraction("keyboard_s");
    const nextView = state.activeDetailView === "story" ? "hotspots" : "story";
    setDetailView(nextView);
    trackEvent("keyboard_shortcut_used", { key: "s", action: "toggle_story" });
    return;
  }

  if (key === "a" && state.tourActive) {
    event.preventDefault();
    haltShowcaseForManualInteraction("keyboard_a");
    setTourAutoplay(!state.tourAutoPlay, { source: "keyboard" });
    trackEvent("keyboard_shortcut_used", { key: "a", action: "toggle_tour_autoplay" });
    return;
  }

  if (key === "p") {
    event.preventDefault();
    cycleVisualPreset("keyboard");
    trackEvent("keyboard_shortcut_used", { key: "p", action: "cycle_visual_preset" });
    return;
  }

  if (key === "m") {
    event.preventDefault();
    setShowcaseActive(!state.showcaseActive, { source: "keyboard" });
    trackEvent("keyboard_shortcut_used", { key: "m", action: "toggle_showcase" });
    return;
  }

  if (event.key === "ArrowRight" && state.tourActive) {
    event.preventDefault();
    haltShowcaseForManualInteraction("keyboard_arrow_right");
    primaryViewer.nextTourStep();
    trackEvent("keyboard_shortcut_used", { key: "ArrowRight", action: "tour_next" });
    return;
  }

  if (event.key === "ArrowLeft" && state.tourActive) {
    event.preventDefault();
    haltShowcaseForManualInteraction("keyboard_arrow_left");
    primaryViewer.previousTourStep();
    trackEvent("keyboard_shortcut_used", { key: "ArrowLeft", action: "tour_previous" });
  }
}

function saveProgressForCurrentArtifact() {
  if (!state.currentArtifactId) {
    return;
  }

  state.sessionProgress[state.currentArtifactId] = {
    hotspotId: state.selectedHotspot?.id ?? null,
    tourActive: state.tourActive,
    tourIndex: state.tourActive ? state.tourIndex : null,
    detailView: state.activeDetailView,
    tourAutoPlay: state.tourAutoPlay,
    updatedAt: Date.now()
  };

  persistSessionProgress(state.sessionProgress);
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

function flushPendingUrlUpdate() {
  if (state.urlUpdateTimer) {
    window.clearTimeout(state.urlUpdateTimer);
    state.urlUpdateTimer = null;
  }
  updateUrlState();
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

  if (state.tourAutoPlay) {
    params.set("autoplay", "1");
  }

  if (state.activeDetailView === "story") {
    params.set("view", "story");
  }

  if (state.searchQuery) {
    params.set("q", state.searchQuery);
  }

  if (state.sortMode !== "featured") {
    params.set("sort", state.sortMode);
  }

  if (state.visualPreset !== "white") {
    params.set("preset", state.visualPreset);
  }

  if (state.showcaseActive) {
    params.set("showcase", "1");
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

async function shareCurrentView(options = {}) {
  const urlBeforeShare = window.location.href;
  if (!options.skipUrlRefresh) {
    flushPendingUrlUpdate();
  }

  const shareUrl = new URL(window.location.href);
  const artifactTitle = elements.artifactTitle?.textContent?.trim();
  const shareTitle = document.title || "Artifact Viewer";
  const shareText = artifactTitle ? `${artifactTitle} · Artifact Viewer` : shareTitle;
  const payload = {
    title: shareTitle,
    text: shareText,
    url: shareUrl.toString()
  };

  const canUseNavigatorShare =
    typeof navigator.share === "function" &&
    (typeof navigator.canShare !== "function" || navigator.canShare(payload));

  if (canUseNavigatorShare) {
    try {
      await navigator.share(payload);
      trackEvent("share_native_success", {
        artifactId: state.currentArtifactId,
        compareEnabled: state.compareEnabled
      });
      trackEvent("share_action_recorded", {
        artifactId: state.currentArtifactId,
        mechanism: "native"
      });
      showToast("Shared via native sheet");
      return;
    } catch (error) {
      if (error?.name === "AbortError") {
        trackEvent("share_native_cancelled", {
          artifactId: state.currentArtifactId
        });
        return;
      }

      trackEvent("share_native_failed", {
        artifactId: state.currentArtifactId,
        reason: String(error && error.message ? error.message : "unknown")
      });
    }
  }

  const finalUrl = payload.url;

  try {
    await navigator.clipboard.writeText(finalUrl);
    showToast("Share link copied");
    trackEvent("share_link_copied", {
      artifactId: state.currentArtifactId,
      compareEnabled: state.compareEnabled
    });
  } catch {
    trackEvent("share_link_copy_failed", {
      artifactId: state.currentArtifactId
    });
    showToast("Clipboard unavailable. URL updated in address bar.");
    if (options.restoreUrl === true) {
      window.history.replaceState({}, "", urlBeforeShare);
    }
  }
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

function normalizeSortMode(value) {
  const supportedSorts = new Set(["featured", "newest", "popular", "alpha"]);
  return supportedSorts.has(value) ? value : "featured";
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
  const tourAutoPlay = params.get("autoplay") === "1";
  const sortMode = normalizeSortMode(params.get("sort"));
  const visualPreset = normalizeVisualPreset(params.get("preset"));
  const showcaseActive = params.get("showcase") === "1";

  return {
    artifactId,
    hotspotId,
    tourStep: Number.isInteger(tourStep) ? tourStep : null,
    cameraPose,
    compareArtifactId,
    compareEnabled: Boolean(compareArtifactId && artifactMap.has(compareArtifactId)),
    compareSync: params.get("sync") !== "0",
    searchQuery: params.get("q")?.trim() ?? "",
    sortMode,
    visualPreset,
    showcaseActive,
    detailView,
    tourAutoPlay,
    viewSpecified: params.has("view"),
    hotspotSpecified: params.has("hotspot"),
    tourSpecified: params.has("tour"),
    autoplaySpecified: params.has("autoplay")
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

function loadSessionProgress() {
  try {
    const raw = window.sessionStorage.getItem(SESSION_PROGRESS_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return parsed;
  } catch {
    return {};
  }
}

function persistSessionProgress(progress) {
  try {
    window.sessionStorage.setItem(SESSION_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Ignore storage quota and availability failures.
  }
}

function loadSessionMetrics() {
  const fallback = {
    startedAt: Date.now(),
    artifacts: {}
  };

  try {
    const raw = window.sessionStorage.getItem(SESSION_METRICS_STORAGE_KEY);
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return fallback;
    }

    return {
      startedAt: Number(parsed.startedAt) || fallback.startedAt,
      artifacts: typeof parsed.artifacts === "object" && parsed.artifacts ? parsed.artifacts : {}
    };
  } catch {
    return fallback;
  }
}

function persistSessionMetrics(metrics) {
  try {
    window.sessionStorage.setItem(SESSION_METRICS_STORAGE_KEY, JSON.stringify(metrics));
  } catch {
    // Ignore storage quota and availability failures.
  }
}

function getArtifactMetrics(artifactId) {
  const base = {
    views: 0,
    hotspotOpens: 0,
    tourStarts: 0,
    tourLastStepReached: 0,
    shares: 0,
    compareViews: 0,
    hotspotCounts: {}
  };

  if (!artifactId) {
    return base;
  }

  return state.sessionMetrics.artifacts[artifactId] ?? base;
}

function getDisplayMetricsForArtifact(artifactId) {
  const serverMetrics = state.serverMetrics[artifactId];
  if (serverMetrics && typeof serverMetrics === "object") {
    return serverMetrics;
  }
  return getArtifactMetrics(artifactId);
}

function applyMetricEventToRecord(record, eventName, details = {}) {
  if (eventName === "artifact_viewed") {
    record.views += 1;
    return true;
  }

  if (eventName === "hotspot_opened") {
    record.hotspotOpens += 1;
    if (details.hotspotId) {
      record.hotspotCounts[details.hotspotId] = (record.hotspotCounts[details.hotspotId] ?? 0) + 1;
    }
    return true;
  }

  if (eventName === "tour_started") {
    record.tourStarts += 1;
    return true;
  }

  if (eventName === "tour_last_step_reached") {
    record.tourLastStepReached += 1;
    return true;
  }

  if (eventName === "share_link_copied" || eventName === "share_action_recorded") {
    record.shares += 1;
    return true;
  }

  if (eventName === "compare_artifact_viewed") {
    record.compareViews += 1;
    return true;
  }

  return false;
}

function updateSessionMetrics(eventName, details = {}) {
  const artifactId = details.artifactId;
  if (!artifactId || !artifactMap.has(artifactId)) {
    return;
  }

  const metrics = getArtifactMetrics(artifactId);
  const changed = applyMetricEventToRecord(metrics, eventName, details);
  if (!changed) {
    return;
  }

  state.sessionMetrics.artifacts[artifactId] = metrics;
  persistSessionMetrics(state.sessionMetrics);

  if (state.serverMetrics[artifactId]) {
    const serverRecord = state.serverMetrics[artifactId];
    applyMetricEventToRecord(serverRecord, eventName, details);
    state.serverMetrics[artifactId] = serverRecord;
  }

  if (artifactId === state.currentArtifactId) {
    renderInsightsPanel();
  }
}

function getVisibleArtifacts() {
  const normalizedQuery = normalizeSearchText(state.searchQuery);

  return artifacts.filter((artifact) => {
    if (state.currentCategory !== "all" && artifact.category !== state.currentCategory) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    let haystack = artifactSearchIndex.get(artifact.id);
    if (!haystack) {
      haystack = buildArtifactSearchText(artifact);
      artifactSearchIndex.set(artifact.id, haystack);
    }

    return haystack.includes(normalizedQuery);
  });
}

function getRankedArtifacts() {
  const visibleArtifacts = getVisibleArtifacts();

  const sortedArtifacts = [...visibleArtifacts];

  sortedArtifacts.sort((left, right) => {
    if (state.sortMode === "newest") {
      return (right.releaseYear ?? 0) - (left.releaseYear ?? 0);
    }

    if (state.sortMode === "popular") {
      const rightScore = getArtifactPopularityScore(right.id);
      const leftScore = getArtifactPopularityScore(left.id);
      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }
      return left.title.localeCompare(right.title);
    }

    if (state.sortMode === "alpha") {
      return left.title.localeCompare(right.title);
    }

    return (left.featuredRank ?? 999) - (right.featuredRank ?? 999);
  });

  return sortedArtifacts;
}

function getArtifactPopularityScore(artifactId) {
  const metrics = getDisplayMetricsForArtifact(artifactId);
  return metrics.views + metrics.hotspotOpens * 2 + metrics.tourStarts * 3 + metrics.tourLastStepReached * 4 + metrics.shares * 5;
}

function trackEvent(eventName, payload = {}) {
  const artifactId = payload.artifactId ?? state.currentArtifactId;
  updateSessionMetrics(eventName, {
    artifactId,
    hotspotId: payload.hotspotId ?? null
  });

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

function normalizeSearchText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildArtifactSearchText(artifact) {
  if (!artifact) {
    return "";
  }

  const storyBody = Array.isArray(artifact.story?.body) ? artifact.story.body : [];
  const storyReferences = Array.isArray(artifact.story?.references)
    ? artifact.story.references.flatMap((reference) => [reference.label, reference.url])
    : [];

  const hotspotText = Array.isArray(artifact.hotspots)
    ? artifact.hotspots.flatMap((hotspot) => [hotspot.id, hotspot.label, hotspot.title, hotspot.body, hotspot.reference ?? ""])
    : [];

  const raw = [
    artifact.id,
    artifact.title,
    artifact.hook,
    artifact.category,
    ...(artifact.keywords ?? []),
    artifact.story?.title ?? "",
    artifact.story?.summary ?? "",
    ...storyBody,
    ...storyReferences,
    ...hotspotText
  ]
    .filter(Boolean)
    .join(" ");

  return normalizeSearchText(raw);
}

function refreshArtifactSearchIndexes(artifactIds = artifacts.map((artifact) => artifact.id)) {
  artifactIds.forEach((artifactId) => {
    const artifact = artifactMap.get(artifactId);
    if (!artifact) {
      artifactSearchIndex.delete(artifactId);
      return;
    }
    artifactSearchIndex.set(artifactId, buildArtifactSearchText(artifact));
  });
}
