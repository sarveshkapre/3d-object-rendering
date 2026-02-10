import "./style.css";
import { artifacts, artifactMap, categories } from "./data/artifacts.js";
import { createAnalyticsTracker } from "./analytics.js";
import { ArtifactViewer } from "./viewer.js";
import { CMS_LIMITS, sanitizeOverridePayload, sanitizeReferenceUrl } from "../shared/cms.js";

const SESSION_PROGRESS_STORAGE_KEY = "artifact_viewer_progress";
const SESSION_METRICS_STORAGE_KEY = "artifact_viewer_metrics";
const COMPARE_PREFS_STORAGE_KEY = "artifact_viewer_compare_prefs_v1";
const LOW_LOAD_PREFS_STORAGE_KEY = "artifact_viewer_low_load_v1";
const TOUR_AUTOPLAY_DELAY_MS = 4600;
const VISUAL_PRESETS = ["white", "sand", "sky"];
const VISUAL_PRESET_LABELS = {
  white: "White",
  sand: "Sand",
  sky: "Sky"
};
const MIN_IDLE_RESET_MS = 10000;
const DEFAULT_IDLE_RESET_MS = 0;
const SERVER_METRICS_REFRESH_INTERVAL_MS = 30000;
const SERVER_METRICS_HISTORY_LIMIT = 24;
const CLIENT_ERROR_LOG_LIMIT = 25;
const CLIENT_ERROR_MESSAGE_MAX = 240;
const CLIENT_ERROR_TRACK_LIMIT = 12;
const CLIENT_ERROR_DEDUPE_WINDOW_MS = 1500;
const INSIGHTS_METRIC_DEFINITIONS = [
  { key: "views", label: "Views" },
  { key: "hotspotOpens", label: "Hotspot Opens" },
  { key: "tourStarts", label: "Tour Starts" },
  { key: "tourLastStepReached", label: "Tour Last Step" },
  { key: "shares", label: "Shares" },
  { key: "compareSessions", label: "Compare Sessions" },
  { key: "compareViews", label: "Compare Views" }
];
let lastIdlePointerMoveTs = 0;
let serverMetricsPollTimer = null;
let clientErrorTelemetryBound = false;
let reducedMotionListenerBound = false;

function loadLowLoadPreference() {
  try {
    if (typeof localStorage === "undefined") {
      return false;
    }
    const raw = localStorage.getItem(LOW_LOAD_PREFS_STORAGE_KEY);
    if (!raw) {
      return false;
    }
    return raw === "1" || raw === "true";
  } catch (error) {
    return false;
  }
}

function setPreferredLowLoadMode(enabled) {
  try {
    if (typeof localStorage === "undefined") {
      return;
    }
    if (enabled) {
      localStorage.setItem(LOW_LOAD_PREFS_STORAGE_KEY, "1");
      return;
    }
    localStorage.removeItem(LOW_LOAD_PREFS_STORAGE_KEY);
  } catch (error) {
    // Ignore storage write failures (Safari private mode, quota).
  }
}

function sanitizeSingleLine(value, maxLen = CLIENT_ERROR_MESSAGE_MAX) {
  const raw = typeof value === "string" ? value : value == null ? "" : String(value);
  const compact = raw.replaceAll("\n", " ").replaceAll("\r", " ").replace(/\s+/g, " ").trim();
  if (!Number.isFinite(maxLen) || maxLen <= 0) {
    return compact;
  }
  return compact.length > maxLen ? `${compact.slice(0, Math.max(0, maxLen - 1))}…` : compact;
}

function formatThrownValue(value) {
  if (value instanceof Error) {
    const name = value.name ? String(value.name) : "Error";
    const message = value.message ? String(value.message) : "";
    return sanitizeSingleLine(message ? `${name}: ${message}` : name);
  }
  return sanitizeSingleLine(value);
}

function recordClientError(kind, message, options = {}) {
  const safeKind = sanitizeSingleLine(kind, 40) || "error";
  const safeMessage = sanitizeSingleLine(message) || "unknown";
  const artifactId = options.artifactId ?? state.currentArtifactId ?? null;
  const signature = `${safeKind}|${safeMessage}|${artifactId ?? ""}`;
  const now = Date.now();

  if (signature === state.clientErrorLastSignature && now - state.clientErrorLastAt < CLIENT_ERROR_DEDUPE_WINDOW_MS) {
    return;
  }

  state.clientErrorLastSignature = signature;
  state.clientErrorLastAt = now;

  state.clientErrorSeq += 1;
  state.clientErrorLog.push({
    id: state.clientErrorSeq,
    ts: now,
    kind: safeKind,
    message: safeMessage,
    artifactId
  });

  if (state.clientErrorLog.length > CLIENT_ERROR_LOG_LIMIT) {
    state.clientErrorLog.splice(0, state.clientErrorLog.length - CLIENT_ERROR_LOG_LIMIT);
  }

  if (state.clientErrorsTracked < CLIENT_ERROR_TRACK_LIMIT) {
    state.clientErrorsTracked += 1;
    trackEvent("client_error_captured", {
      artifactId,
      kind: safeKind,
      message: safeMessage,
      webgl: primaryViewer.webglAvailable ? "available" : "unavailable"
    });
  }

  if (state.currentArtifactId) {
    renderInsightsPanel();
  }
}

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

function getPrefersReducedMotion() {
  try {
    return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch (error) {
    return false;
  }
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
  loadingActions: document.getElementById("loadingActions"),
  loadingRetryBtn: document.getElementById("loadingRetryBtn"),
  loadingRetryLowBtn: document.getElementById("loadingRetryLowBtn"),
  loadingOverlayCompare: document.getElementById("loadingOverlayCompare"),
  loadingBarCompare: document.getElementById("loadingBarCompare"),
  loadingTextCompare: document.getElementById("loadingTextCompare"),
  loadingActionsCompare: document.getElementById("loadingActionsCompare"),
  loadingRetryBtnCompare: document.getElementById("loadingRetryBtnCompare"),
  loadingRetryLowBtnCompare: document.getElementById("loadingRetryLowBtnCompare"),
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
  lowLoadBtn: document.getElementById("lowLoadBtn"),
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
  moderationDiffCallouts: document.getElementById("moderationDiffCallouts"),
  moderationDiffBefore: document.getElementById("moderationDiffBefore"),
  moderationDiffAfter: document.getElementById("moderationDiffAfter"),
  moderationDecisionsList: document.getElementById("moderationDecisionsList"),
  moderationRevisionsList: document.getElementById("moderationRevisionsList"),
  moderationStatus: document.getElementById("moderationStatus"),
  shortcutsBtn: document.getElementById("shortcutsBtn"),
  shortcutsModal: document.getElementById("shortcutsModal"),
  shortcutsCloseBtn: document.getElementById("shortcutsCloseBtn"),
  fullscreenBtn: document.getElementById("fullscreenBtn"),
  snapshotBtn: document.getElementById("snapshotBtn"),
  shareBtn: document.getElementById("shareBtn"),
  listToggleBtn: document.getElementById("listToggleBtn"),
  storyToggleBtn: document.getElementById("storyToggleBtn"),
  toast: document.getElementById("toast"),
  webglRecoveryModal: document.getElementById("webglRecoveryModal"),
  webglRecoveryCloseBtn: document.getElementById("webglRecoveryCloseBtn"),
  webglRecoveryMessage: document.getElementById("webglRecoveryMessage"),
  webglRecoveryReloadBtn: document.getElementById("webglRecoveryReloadBtn"),
  webglRecoveryLowReloadBtn: document.getElementById("webglRecoveryLowReloadBtn"),
  rendererStatusBtn: document.getElementById("rendererStatusBtn"),
  rendererStatusModal: document.getElementById("rendererStatusModal"),
  rendererStatusCloseBtn: document.getElementById("rendererStatusCloseBtn"),
  rendererStatusMessage: document.getElementById("rendererStatusMessage"),
  rendererStatusDetails: document.getElementById("rendererStatusDetails")
};

const parsedUrlState = parseUrlState();
const idleResetTimeoutMs = parsedUrlState.idleResetMs ?? DEFAULT_IDLE_RESET_MS;
const baseArtifactsById = Object.fromEntries(artifacts.map((artifact) => [artifact.id, structuredClone(artifact)]));
const artifactSearchIndex = new Map();
const comparePreferences = loadComparePreferences();
const lowLoadPreference = loadLowLoadPreference();

const state = {
  currentCategory: "all",
  searchQuery: parsedUrlState.searchQuery,
  sortMode: parsedUrlState.sortMode,
  currentArtifactId: null,
  compareArtifactId: getInitialCompareArtifactId(parsedUrlState.compareArtifactId),
  compareEnabled: parsedUrlState.compareEnabled,
  compareSync: parsedUrlState.syncSpecified ? parsedUrlState.compareSync : comparePreferences.syncEnabled,
  compareReady: false,
  comparePreferences,
  comparePinnedFromUrl: Boolean(parsedUrlState.compareArtifactId && artifactMap.has(parsedUrlState.compareArtifactId)),
  visualPreset: parsedUrlState.visualPreset,
  activeDetailView: parsedUrlState.detailView,
  hotspotData: [],
  selectedHotspot: null,
  pendingHotspotFocus: null,
  tourActive: false,
  tourIndex: 0,
  tourTotal: 0,
  tourCaption: "",
  urlUpdateTimer: null,
  toastTimer: null,
  pendingState: parsedUrlState,
  cameraSyncLock: false,
  lowLoadMode: lowLoadPreference,
  primaryLoading: false,
  compareLoading: false,
  primaryLoadError: "",
  compareLoadError: "",
  primaryLastFailedArtifactId: null,
  compareLastFailedArtifactId: null,
  isRestoringState: false,
  searchTrackTimer: null,
  tourAutoPlay: parsedUrlState.tourAutoPlay,
  tourAutoPlayTimer: null,
  showcaseActive: false,
  showcaseRequested: parsedUrlState.showcaseActive,
  showcaseTimer: null,
  shortcutPlatform: detectShortcutPlatform(),
  prefersReducedMotion: getPrefersReducedMotion(),
  showcasePreviousAutoplay: parsedUrlState.tourAutoPlay,
  sessionProgress: loadSessionProgress(),
  sessionMetrics: loadSessionMetrics(),
  serverMetrics: {},
  serverMetricDeltas: {},
  lastServerMetricsSnapshot: null,
  serverMetricsHistory: [],
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
  shortcutsReturnFocus: null,
  webglRecoveryOpen: false,
  webglRecoveryPane: null,
  webglRecoveryReturnFocus: null,
  rendererStatusOpen: false,
  rendererStatusReturnFocus: null,
  curatorReturnFocus: null,
  moderationReturnFocus: null,
  clientErrorLog: [],
  clientErrorSeq: 0,
  clientErrorLastSignature: "",
  clientErrorLastAt: 0,
  clientErrorsTracked: 0,
  previousTourState: {
    active: false,
    index: null
  },
  idleResetTimeoutMs,
  idleResetEnabled: idleResetTimeoutMs >= MIN_IDLE_RESET_MS,
  idleResetTimer: null,
  idleResetLastActiveAt: Date.now(),
  idleResetActive: false,
  idleResetListenersBound: false
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

primaryViewer.setLowLoadMode(state.lowLoadMode);
compareViewer.setLowLoadMode(state.lowLoadMode);
compareViewer.setHotspotVisibility(false);
primaryViewer.setReducedMotion(state.prefersReducedMotion);
compareViewer.setReducedMotion(state.prefersReducedMotion);

document.documentElement.dataset.webgl = primaryViewer.webglAvailable ? "available" : "unavailable";

registerWebglRecoveryHandlers();
initialize();

function registerWebglRecoveryHandlers() {
  const attach = (viewer, canvas, pane) => {
    if (!canvas) {
      return;
    }

    canvas.addEventListener(
      "webglcontextlost",
      (event) => {
        // Prevent the default behavior so a restore event can fire.
        event.preventDefault();
        viewer.handleContextLost?.();
        document.documentElement.dataset.webgl = "unavailable";
        updateRendererStatusUI();
        setWebglRecoveryOpen(true, { source: "webgl", pane });
        showToast("Rendering interrupted. Reload recommended.");
        trackEvent("webgl_context_lost", {
          pane,
          artifactId: state.currentArtifactId,
          compareEnabled: state.compareEnabled
        });
      },
      { passive: false }
    );

    canvas.addEventListener("webglcontextrestored", () => {
      trackEvent("webgl_context_restored", {
        pane,
        artifactId: state.currentArtifactId,
        compareEnabled: state.compareEnabled
      });
    });
  };

  attach(primaryViewer, elements.canvas, "primary");
  attach(compareViewer, elements.canvasCompare, "compare");
}

function initialize() {
  registerReducedMotionListener();
  registerClientErrorTelemetry();
  updateRendererStatusUI();
  elements.searchInput.value = state.searchQuery;
  elements.sortSelect.value = state.sortMode;
  updateSearchShortcutHint();
  if (!primaryViewer.webglAvailable) {
    showToast("WebGL unavailable. Viewer running in fallback mode.");
  }
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
  registerIdleResetListeners();
  setDetailView(state.activeDetailView, { skipUrlUpdate: true });
  setCompareModeUI(state.compareEnabled);

  const fallbackArtifactId = artifacts[0].id;
  const artifactId = artifactMap.has(state.pendingState.artifactId)
    ? state.pendingState.artifactId
    : fallbackArtifactId;

  handleResize();
  void bootstrap(artifactId);
}

function registerClientErrorTelemetry() {
  if (clientErrorTelemetryBound) {
    return;
  }
  clientErrorTelemetryBound = true;

  window.addEventListener(
    "error",
    (event) => {
      if (event instanceof ErrorEvent) {
        const message = event.error ? formatThrownValue(event.error) : sanitizeSingleLine(event.message || "error");
        recordClientError("window_error", message, { artifactId: state.currentArtifactId });
        return;
      }

      const target = event && event.target ? event.target : null;
      const tag = target && typeof target.tagName === "string" ? target.tagName.toLowerCase() : "resource";
      recordClientError("resource_error", `Failed to load ${tag}`, { artifactId: state.currentArtifactId });
    },
    true
  );

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event ? event.reason : null;
    recordClientError("unhandled_rejection", formatThrownValue(reason), { artifactId: state.currentArtifactId });
  });
}

function registerReducedMotionListener() {
  if (reducedMotionListenerBound || !window.matchMedia) {
    return;
  }
  reducedMotionListenerBound = true;

  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  const handler = (event) => {
    state.prefersReducedMotion = Boolean(event.matches);
    primaryViewer.setReducedMotion(state.prefersReducedMotion);
    compareViewer.setReducedMotion(state.prefersReducedMotion);
    renderInsightsPanel();
    trackEvent("reduced_motion_changed", { enabled: state.prefersReducedMotion });
  };

  try {
    media.addEventListener("change", handler);
  } catch (error) {
    media.addListener(handler);
  }
}

function updateRendererStatusUI() {
  if (!elements.rendererStatusBtn || !elements.rendererStatusModal) {
    return;
  }

  const unavailable = !primaryViewer.webglAvailable;
  elements.rendererStatusBtn.hidden = !unavailable;
  elements.rendererStatusBtn.textContent = unavailable ? "3D Off" : "3D On";

  if (unavailable) {
    const reason = primaryViewer.webglUnavailableReason ? sanitizeSingleLine(primaryViewer.webglUnavailableReason, 160) : "unknown";
    if (elements.rendererStatusMessage) {
      elements.rendererStatusMessage.textContent = `WebGL could not be initialized, so the viewer is running in fallback mode (${reason}).`;
    }
    if (elements.rendererStatusDetails) {
      elements.rendererStatusDetails.innerHTML = `
        <strong>What still works</strong>
        <ul>
          <li>Gallery browsing, search, filters, share links, and session insights.</li>
          <li>Hotspot list, story panel, guided tours, and curator/moderation tools.</li>
        </ul>
        <strong>What changes</strong>
        <ul>
          <li>3D rendering is disabled and the canvas will not display the model.</li>
          <li>Snapshots export placeholder imagery.</li>
        </ul>
      `;
    }
    return;
  }

  if (state.rendererStatusOpen) {
    setRendererStatusOpen(false, { source: "auto" });
  }
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

  ensureValidCompareArtifact({ respectPin: true });
  await loadCompareArtifact(state.compareArtifactId, {
    syncFromPrimary: true,
    source: "bootstrap"
  });
}

function bindEvents() {
  window.addEventListener("resize", handleResize);
  document.addEventListener("keydown", handleKeydown);

  elements.webglRecoveryCloseBtn.addEventListener("click", () => {
    setWebglRecoveryOpen(false, { source: "ui" });
  });

  elements.webglRecoveryReloadBtn.addEventListener("click", () => {
    trackEvent("webgl_recovery_reload_clicked", { pane: state.webglRecoveryPane ?? "unknown" });
    window.location.reload();
  });

  elements.webglRecoveryLowReloadBtn.addEventListener("click", () => {
    setPreferredLowLoadMode(true);
    trackEvent("webgl_recovery_low_load_reload_clicked", { pane: state.webglRecoveryPane ?? "unknown" });
    window.location.reload();
  });

  elements.webglRecoveryModal.addEventListener("click", (event) => {
    if (event.target === elements.webglRecoveryModal) {
      setWebglRecoveryOpen(false, { source: "overlay" });
    }
  });

  if (elements.rendererStatusBtn) {
    elements.rendererStatusBtn.addEventListener("click", () => {
      setRendererStatusOpen(true, { source: "ui" });
    });
  }

  if (elements.rendererStatusCloseBtn) {
    elements.rendererStatusCloseBtn.addEventListener("click", () => {
      setRendererStatusOpen(false, { source: "ui" });
    });
  }

  if (elements.rendererStatusModal) {
    elements.rendererStatusModal.addEventListener("click", (event) => {
      if (event.target === elements.rendererStatusModal) {
        setRendererStatusOpen(false, { source: "overlay" });
      }
    });
  }

  elements.searchInput.addEventListener("input", () => {
    state.searchQuery = elements.searchInput.value.trim();
    renderGallery();
    renderHotspotList();
    renderStoryPanel();
    renderHotspotCard();
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
    state.comparePinnedFromUrl = false;
    ensureValidCompareArtifact({ respectPin: false });
    setCompareModeUI(true);
    await loadCompareArtifact(state.compareArtifactId, { syncFromPrimary: true, source: "compare_toggle" });
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
    state.comparePinnedFromUrl = false;
    setPreferredCompareSync(state.compareSync);
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

  elements.lowLoadBtn.addEventListener("click", () => {
    haltShowcaseForManualInteraction("low_load_toggle");
    setLowLoadMode(!state.lowLoadMode, { source: "ui" });
  });

  elements.showcaseBtn.addEventListener("click", () => {
    setShowcaseActive(!state.showcaseActive, { source: "ui" });
  });

  elements.loadingRetryBtn.addEventListener("click", () => {
    const artifactId = state.primaryLastFailedArtifactId ?? state.currentArtifactId;
    if (!artifactId) {
      return;
    }
    clearLoadingOverlayError("primary");
    void loadArtifact(artifactId, { restoreFromUrl: false, source: "load_retry" });
    trackEvent("artifact_load_retry_clicked", { artifactId, mode: "normal" });
  });

  elements.loadingRetryLowBtn.addEventListener("click", () => {
    const artifactId = state.primaryLastFailedArtifactId ?? state.currentArtifactId;
    if (!artifactId) {
      return;
    }
    setLowLoadMode(true, { source: "load_retry_low" });
    clearLoadingOverlayError("primary");
    void loadArtifact(artifactId, { restoreFromUrl: false, source: "load_retry_low" });
    trackEvent("artifact_load_retry_clicked", { artifactId, mode: "low_load" });
  });

  elements.loadingRetryBtnCompare.addEventListener("click", () => {
    const artifactId = state.compareLastFailedArtifactId ?? state.compareArtifactId;
    if (!artifactId) {
      return;
    }
    clearLoadingOverlayError("compare");
    void loadCompareArtifact(artifactId, { source: "compare_load_retry" });
    trackEvent("compare_load_retry_clicked", { compareArtifactId: artifactId, mode: "normal" });
  });

  elements.loadingRetryLowBtnCompare.addEventListener("click", () => {
    const artifactId = state.compareLastFailedArtifactId ?? state.compareArtifactId;
    if (!artifactId) {
      return;
    }
    setLowLoadMode(true, { source: "compare_load_retry_low" });
    clearLoadingOverlayError("compare");
    void loadCompareArtifact(artifactId, { source: "compare_load_retry_low" });
    trackEvent("compare_load_retry_clicked", { compareArtifactId: artifactId, mode: "low_load" });
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

  const curatorValidationFields = [
    elements.curatorTitleInput,
    elements.curatorHookInput,
    elements.curatorKeywordsInput,
    elements.curatorYearInput,
    elements.curatorRankInput,
    elements.curatorStoryTitleInput,
    elements.curatorStorySummaryInput,
    elements.curatorStoryBodyInput,
    elements.curatorStoryReferencesInput
  ].filter(Boolean);

  curatorValidationFields.forEach((field) => {
    field.addEventListener("input", () => {
      refreshCuratorValidation();
    });
  });

  elements.curatorHotspotsList.addEventListener("input", () => {
    refreshCuratorValidation();
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
    setDetailView("hotspots", { focusHotspotList: true });
  });

  elements.storyToggleBtn.addEventListener("click", () => {
    setDetailView("story");
  });

  elements.hotspotListPanel.addEventListener("keydown", handleHotspotListKeydown);

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

  elements.snapshotBtn.addEventListener("click", () => {
    void captureSnapshot({ source: "ui" });
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

  elements.insightsContent.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const button = target.closest("button[data-action]");
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const action = button.dataset.action;
    const artifactId = state.currentArtifactId;

    if (action === "clear-errors") {
      state.clientErrorLog = [];
      state.clientErrorLastSignature = "";
      state.clientErrorLastAt = 0;
      renderInsightsPanel();
      showToast("Diagnostics cleared");
      trackEvent("diagnostics_cleared", { artifactId });
      return;
    }

    const payload =
      action === "copy-diagnostics"
        ? formatDiagnosticsExportText(artifactId)
        : action === "copy-insights"
          ? formatInsightsExportText(artifactId)
          : "";

    if (!payload) {
      showToast(action === "copy-diagnostics" ? "No diagnostics to copy" : "No metrics to copy");
      return;
    }

    try {
      await navigator.clipboard.writeText(payload);
      showToast(action === "copy-diagnostics" ? "Diagnostics copied" : "Metrics copied");
      if (action === "copy-diagnostics") {
        trackEvent("diagnostics_export_copied", {
          artifactId,
          webgl: primaryViewer.webglAvailable ? "available" : "unavailable"
        });
      } else {
        trackEvent("insights_export_copied", {
          artifactId,
          source: state.serverMetrics[artifactId] ? "server" : "session"
        });
      }
    } catch (error) {
      showToast("Clipboard unavailable");
      const reason = String(error && error.message ? error.message : "unknown");
      trackEvent(action === "copy-diagnostics" ? "diagnostics_export_failed" : "insights_export_failed", {
        artifactId,
        reason
      });
    }
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
    clearIdleResetTimer();
    stopServerMetricsPolling();
    analytics.shutdown();
  });

  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      state.shortcutPlatform = detectShortcutPlatform();
      updateSearchShortcutHint();
      touchIdleReset();
      void refreshServerMetrics({ silent: true });
      return;
    }
    clearIdleResetTimer();
  });
}

function setLowLoadMode(enabled, options = {}) {
  const next = Boolean(enabled);
  if (state.lowLoadMode === next) {
    return;
  }

  state.lowLoadMode = next;
  setPreferredLowLoadMode(state.lowLoadMode);
  primaryViewer.setLowLoadMode(state.lowLoadMode);
  compareViewer.setLowLoadMode(state.lowLoadMode);
  updateHeaderControls();

  if (!options.skipToast) {
    showToast(state.lowLoadMode ? "Low load mode on" : "Low load mode off");
  }

  if (!options.skipTrack) {
    trackEvent("viewer_low_load_toggled", {
      enabled: state.lowLoadMode,
      source: options.source ?? "unknown"
    });
  }
}

function setLoadingOverlayError(which, message, artifactId) {
  if (which === "compare") {
    state.compareLoadError = message;
    state.compareLastFailedArtifactId = artifactId ?? null;
    elements.loadingTextCompare.textContent = message;
    elements.loadingActionsCompare.hidden = false;
    const track = elements.loadingOverlayCompare.querySelector(".loading-track");
    if (track instanceof HTMLElement) {
      track.hidden = true;
    }
    setCompareLoading(false);
    return;
  }

  state.primaryLoadError = message;
  state.primaryLastFailedArtifactId = artifactId ?? null;
  elements.loadingText.textContent = message;
  elements.loadingActions.hidden = false;
  const track = elements.loadingOverlay.querySelector(".loading-track");
  if (track instanceof HTMLElement) {
    track.hidden = true;
  }
  setPrimaryLoading(false);
}

function clearLoadingOverlayError(which) {
  if (which === "compare") {
    state.compareLoadError = "";
    elements.loadingActionsCompare.hidden = true;
    const track = elements.loadingOverlayCompare.querySelector(".loading-track");
    if (track instanceof HTMLElement) {
      track.hidden = false;
    }
    return;
  }

  state.primaryLoadError = "";
  elements.loadingActions.hidden = true;
  const track = elements.loadingOverlay.querySelector(".loading-track");
  if (track instanceof HTMLElement) {
    track.hidden = false;
  }
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
  if (!options.restoreFromUrl && state.comparePinnedFromUrl) {
    state.comparePinnedFromUrl = false;
  }
  ensureValidCompareArtifact({ respectPin: options.restoreFromUrl });
  state.selectedHotspot = null;
  state.tourActive = false;
  state.previousTourState = { active: false, index: null };
  clearTourAutoplay();

  renderGallery();
  renderCompareList();
  clearLoadingOverlayError("primary");
  elements.loadingText.textContent = "Preparing artifact…";
  setPrimaryLoading(true);

  try {
    await primaryViewer.loadArtifact(artifact);
    clearLoadingOverlayError("primary");
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
      ensureValidCompareArtifact({ respectPin: options.restoreFromUrl });
      await loadCompareArtifact(state.compareArtifactId, { syncFromPrimary: true, source: "primary_changed" });
    }

    renderHotspotCard();
    updateHeaderControls();
    scheduleUrlUpdate();
  } catch (error) {
    showToast("Model failed to load. Retry from the loading overlay.");
    recordClientError("artifact_load_failed", formatThrownValue(error), { artifactId });
    trackEvent("artifact_load_failed", {
      artifactId,
      durationMs: Math.round(performance.now() - loadStartedAt),
      reason: sanitizeSingleLine(error && error.message ? error.message : "unknown", 160)
    });
    console.error(error);
    setLoadingOverlayError("primary", "Model failed to load.", artifactId);
  } finally {
    if (!state.primaryLoadError) {
      window.setTimeout(() => setPrimaryLoading(false), 220);
    }
  }

  refreshArtifactSearchIndexes();
}

async function loadServerData() {
  const [overridesResult, updatesResult] = await Promise.allSettled([
    fetch("/api/cms/overrides"),
    fetch("/api/cms/recent-updates?limit=12")
  ]);

  if (overridesResult.status === "fulfilled" && overridesResult.value.ok) {
    const payload = await overridesResult.value.json();
    state.cmsOverrides = payload.overrides ?? {};
    applyOverrides(state.cmsOverrides);
  }

  await refreshServerMetrics({ silent: true });

  if (updatesResult.status === "fulfilled" && updatesResult.value.ok) {
    const payload = await updatesResult.value.json();
    state.recentUpdates = Array.isArray(payload.updates) ? payload.updates : [];
  }

  renderCuratorArtifactOptions();
  renderGallery();
  renderInsightsPanel();
  renderRecentUpdatesPanel();
  startServerMetricsPolling();
}

async function refreshServerMetrics(options = {}) {
  try {
    const response = await fetch("/api/analytics/counters", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`server returned ${response.status}`);
    }
    const payload = await response.json();
    const nextMetrics = payload.artifacts ?? {};
    const previousSnapshot = state.lastServerMetricsSnapshot;
    state.serverMetricDeltas = previousSnapshot ? computeServerMetricDeltas(previousSnapshot, nextMetrics) : {};
    const nextSnapshot = cloneServerMetricsSnapshot(nextMetrics);
    state.lastServerMetricsSnapshot = nextSnapshot;
    recordServerMetricsHistory(nextSnapshot);
    state.serverMetrics = nextMetrics;
    if (state.currentArtifactId) {
      renderInsightsPanel();
    }
    return true;
  } catch (error) {
    if (!options.silent) {
      console.warn("Failed to refresh server metrics", error);
    }
    return false;
  }
}

function startServerMetricsPolling() {
  if (!Number.isFinite(SERVER_METRICS_REFRESH_INTERVAL_MS) || SERVER_METRICS_REFRESH_INTERVAL_MS <= 0) {
    return;
  }

  stopServerMetricsPolling();

  serverMetricsPollTimer = window.setInterval(() => {
    if (document.visibilityState === "hidden") {
      return;
    }
    void refreshServerMetrics({ silent: true });
  }, SERVER_METRICS_REFRESH_INTERVAL_MS);
}

function stopServerMetricsPolling() {
  if (!serverMetricsPollTimer) {
    return;
  }
  window.clearInterval(serverMetricsPollTimer);
  serverMetricsPollTimer = null;
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
  const compareSource = options.source ?? "compare_mode";

  state.compareArtifactId = artifactId;
  state.compareReady = false;
  renderCompareList();
  clearLoadingOverlayError("compare");
  elements.loadingTextCompare.textContent = "Preparing comparison artifact…";
  setCompareLoading(true);

  try {
    await compareViewer.loadArtifact(artifact);
    clearLoadingOverlayError("compare");
    trackEvent("compare_load_succeeded", {
      compareArtifactId: artifactId,
      durationMs: Math.round(performance.now() - loadStartedAt)
    });
    compareViewer.setHotspotVisibility(false);
    state.compareReady = true;

    if (options.syncFromPrimary && state.compareSync) {
      compareViewer.applyCameraPose(primaryViewer.getCameraPose(), { emitCameraChange: false });
    }
    if (state.currentArtifactId) {
      recordComparePair(state.currentArtifactId, artifactId, { source: compareSource });
    }

    scheduleUrlUpdate();
  } catch (error) {
    showToast("Comparison artifact failed to load. Retry from the loading overlay.");
    recordClientError("compare_load_failed", formatThrownValue(error), { artifactId });
    trackEvent("compare_load_failed", {
      compareArtifactId: artifactId,
      durationMs: Math.round(performance.now() - loadStartedAt),
      reason: sanitizeSingleLine(error && error.message ? error.message : "unknown", 160)
    });
    console.error(error);
    setLoadingOverlayError("compare", "Comparison model failed to load.", artifactId);
  } finally {
    if (!state.compareLoadError) {
      window.setTimeout(() => setCompareLoading(false), 220);
    }
  }
}

function ensureValidCompareArtifact(options = {}) {
  if (!state.currentArtifactId) {
    return;
  }

  const respectPin = options.respectPin === true;
  const pinnedActive = respectPin && state.comparePinnedFromUrl;
  const currentPartner = state.compareArtifactId;
  const currentValid = artifactMap.has(currentPartner) && currentPartner !== state.currentArtifactId;

  if (pinnedActive) {
    if (currentValid) {
      return;
    }
    state.comparePinnedFromUrl = false;
  }

  let nextPartner = currentValid ? currentPartner : null;

  if (!nextPartner) {
    const preferred = getPreferredComparePartner(state.currentArtifactId);
    if (preferred && preferred !== state.currentArtifactId) {
      nextPartner = preferred;
    }
  }

  if (!nextPartner || !artifactMap.has(nextPartner) || nextPartner === state.currentArtifactId) {
    nextPartner = artifacts.find((artifact) => artifact.id !== state.currentArtifactId)?.id ?? state.currentArtifactId;
  }

  state.compareArtifactId = nextPartner;
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
  const skipTrack = options.skipTrack === true;

  const showStory = normalizedView === "story";
  elements.storyPanel.hidden = !showStory;
  elements.hotspotListPanel.hidden = showStory;

  if (showStory) {
    elements.hotspotCard.hidden = true;
  } else {
    renderHotspotCard();
  }

  updateDetailToggleUI();

  if (normalizedView === "hotspots" && options.focusHotspotList) {
    const fallbackHotspotId = state.selectedHotspot?.id ?? state.hotspotData[0]?.id ?? null;
    queueHotspotListFocus(fallbackHotspotId, { fallbackToFirst: true });
    syncHotspotListKeyboardState();
  }

  if (!skipTrack && previousView !== normalizedView && state.currentArtifactId) {
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

function ensureCuratorFieldCounter(field) {
  if (!(field instanceof HTMLElement)) {
    return { label: null, counter: null };
  }

  const label = field.closest("label.curator-field");
  if (!(label instanceof HTMLLabelElement)) {
    return { label: null, counter: null };
  }

  const head = label.querySelector(":scope > span");
  if (!(head instanceof HTMLSpanElement)) {
    return { label, counter: null };
  }

  let counter = head.querySelector(".curator-counter");
  if (!(counter instanceof HTMLElement)) {
    counter = document.createElement("span");
    counter.className = "curator-counter";
    head.appendChild(counter);
  }

  return { label, counter };
}

function setCuratorFieldIndicator(field, text, options = {}) {
  const { label, counter } = ensureCuratorFieldCounter(field);
  if (!label || !counter) {
    return;
  }

  const invalid = options.invalid === true;
  counter.textContent = text ?? "";
  counter.classList.toggle("is-invalid", invalid);
  label.classList.toggle("is-invalid", invalid);
}

function refreshCuratorValidation() {
  if (!state.curatorOpen) {
    return;
  }

  const updateMaxLen = (field, max) => {
    if (!(field instanceof HTMLInputElement) && !(field instanceof HTMLTextAreaElement)) {
      return;
    }
    const trimmed = field.value.trim();
    const length = trimmed.length;
    const invalid = Boolean(trimmed) && length > max;
    setCuratorFieldIndicator(field, `${length}/${max}`, { invalid });
  };

  const updateNumericRange = (field, min, max) => {
    if (!(field instanceof HTMLInputElement)) {
      return;
    }
    const raw = field.value.trim();
    if (!raw) {
      setCuratorFieldIndicator(field, `${min}-${max}`, { invalid: false });
      return;
    }
    const value = Number(raw);
    const invalid = !Number.isFinite(value) || value < min || value > max;
    setCuratorFieldIndicator(field, `${min}-${max}`, { invalid });
  };

  updateMaxLen(elements.curatorTitleInput, CMS_LIMITS.titleMax);
  updateMaxLen(elements.curatorHookInput, CMS_LIMITS.hookMax);
  updateMaxLen(elements.curatorStoryTitleInput, CMS_LIMITS.storyTitleMax);
  updateMaxLen(elements.curatorStorySummaryInput, CMS_LIMITS.storySummaryMax);

  updateNumericRange(elements.curatorYearInput, CMS_LIMITS.releaseYearMin, CMS_LIMITS.releaseYearMax);
  updateNumericRange(elements.curatorRankInput, CMS_LIMITS.featuredRankMin, CMS_LIMITS.featuredRankMax);

  const keywordTokens = elements.curatorKeywordsInput.value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const tooManyKeywords = keywordTokens.length > CMS_LIMITS.keywordsMaxCount;
  const keywordTooLong = keywordTokens.some((token) => token.length > CMS_LIMITS.keywordMax);
  setCuratorFieldIndicator(elements.curatorKeywordsInput, `${keywordTokens.length}/${CMS_LIMITS.keywordsMaxCount}`, {
    invalid: tooManyKeywords || keywordTooLong
  });

  const storyLines = elements.curatorStoryBodyInput.value
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const tooManyParagraphs = storyLines.length > CMS_LIMITS.storyParagraphsMax;
  const paragraphTooLong = storyLines.some((line) => line.length > CMS_LIMITS.storyParagraphMax);
  setCuratorFieldIndicator(
    elements.curatorStoryBodyInput,
    `${storyLines.length}/${CMS_LIMITS.storyParagraphsMax} lines`,
    { invalid: tooManyParagraphs || paragraphTooLong }
  );

  const referenceLines = elements.curatorStoryReferencesInput.value
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
  let invalidReferences = 0;
  const parsedReferences = referenceLines
    .map((line) => {
      const [labelPart, urlPart] = line.split("|");
      const label = (labelPart ?? "").trim();
      const url = (urlPart ?? "").trim();
      if (!label || !url) {
        invalidReferences += 1;
        return null;
      }
      const sanitizedUrl = sanitizeReferenceUrl(url);
      if (!sanitizedUrl) {
        invalidReferences += 1;
        return null;
      }
      if (label.length > CMS_LIMITS.referenceLabelMax || url.length > CMS_LIMITS.referenceUrlMax) {
        invalidReferences += 1;
      }
      return { label, url: sanitizedUrl };
    })
    .filter(Boolean);
  const tooManyReferences = parsedReferences.length > CMS_LIMITS.storyReferencesMax;
  setCuratorFieldIndicator(
    elements.curatorStoryReferencesInput,
    `${parsedReferences.length}/${CMS_LIMITS.storyReferencesMax} refs`,
    { invalid: tooManyReferences || invalidReferences > 0 }
  );

  const hotspotRows = Array.from(elements.curatorHotspotsList.querySelectorAll("[data-hotspot-id]"));
  hotspotRows.forEach((row) => {
    const label = row.querySelector(".curator-hotspot-label");
    const title = row.querySelector(".curator-hotspot-title-input");
    const body = row.querySelector(".curator-hotspot-body");
    const reference = row.querySelector(".curator-hotspot-reference");

    updateMaxLen(label, CMS_LIMITS.hotspotLabelMax);
    updateMaxLen(title, CMS_LIMITS.hotspotTitleMax);
    updateMaxLen(body, CMS_LIMITS.hotspotBodyMax);

    if (reference instanceof HTMLInputElement) {
      const raw = reference.value.trim();
      const invalid = Boolean(raw) && !sanitizeReferenceUrl(raw);
      setCuratorFieldIndicator(reference, "url", { invalid });
    }
  });
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
    state.moderationReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    haltShowcaseForManualInteraction("open_moderation");
    if (state.shortcutsOpen) {
      setShortcutsOpen(false, { skipTrack: true, returnFocus: false });
    }
    if (state.curatorOpen) {
      setCuratorOpen(false, { skipTrack: true, returnFocus: false });
    }

    state.moderationArtifactId = state.currentArtifactId ?? state.moderationArtifactId ?? artifacts[0]?.id ?? null;
    renderModerationArtifactOptions();
    elements.moderationTokenInput.value = state.moderationToken;
    elements.moderationReasonInput.value = state.moderationReason;
    void loadModerationData();
    elements.moderationCloseBtn.focus();
  } else if (options.returnFocus !== false) {
    const returnTo = state.moderationReturnFocus;
    state.moderationReturnFocus = null;
    restoreFocus(returnTo, elements.moderationBtn);
  } else {
    state.moderationReturnFocus = null;
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
      const changedFieldsText = diff.entries.length ? `${diff.entries.length} field${diff.entries.length === 1 ? "" : "s"} touched` : "No effective changes";
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
    if (elements.moderationDiffCallouts) {
      elements.moderationDiffCallouts.innerHTML = '<p class="insights-empty">No effective field changes.</p>';
    }
    return;
  }

  const selected =
    state.moderationSubmissions.find((submission) => submission.id === state.moderationSelectedSubmissionId) ?? state.moderationSubmissions[0];
  if (!selected) {
    elements.moderationDiffSummary.textContent = "No pending submission selected.";
    elements.moderationDiffBefore.textContent = "{}";
    elements.moderationDiffAfter.textContent = "{}";
    if (elements.moderationDiffCallouts) {
      elements.moderationDiffCallouts.innerHTML = '<p class="insights-empty">No effective field changes.</p>';
    }
    return;
  }

  const diff = getSubmissionDiffModel(selected);
  const changedLabel = diff.entries.length
    ? `${diff.entries.length} field${diff.entries.length === 1 ? "" : "s"} touched`
    : "No effective field change";
  elements.moderationDiffSummary.textContent = `${selected.artifactId} · ${selected.operation} · ${changedLabel}`;
  elements.moderationDiffBefore.innerHTML = formatJsonDiffHtml(diff.beforeOverride, diff.entries, { view: "before" });
  elements.moderationDiffAfter.innerHTML = formatJsonDiffHtml(diff.afterOverride, diff.entries, { view: "after" });
  renderModerationDiffCallouts(diff);
}

function renderModerationDiffCallouts(diffModel) {
  if (!elements.moderationDiffCallouts) {
    return;
  }

  if (!diffModel.entries.length) {
    elements.moderationDiffCallouts.innerHTML = '<p class="insights-empty">No effective field changes.</p>';
    return;
  }

  const sortedEntries = [...diffModel.entries].sort((a, b) => {
    const typeOrder = { updated: 0, added: 1, removed: 2 };
    const orderDelta = (typeOrder[a.type] ?? 3) - (typeOrder[b.type] ?? 3);
    if (orderDelta !== 0) {
      return orderDelta;
    }
    return a.path.localeCompare(b.path);
  });

  elements.moderationDiffCallouts.innerHTML = sortedEntries
    .map((entry) => {
      const beforeValue = getValueAtPath(diffModel.beforeOverride, entry.path);
      const afterValue = getValueAtPath(diffModel.afterOverride, entry.path);
      const typeLabel = entry.type === "added" ? "Added" : entry.type === "removed" ? "Removed" : "Updated";
      const icon = entry.type === "added" ? "+" : entry.type === "removed" ? "−" : "Δ";
      const beforeMarkup =
        entry.type !== "added"
          ? `<p class="moderation-callout-value"><span>Before:</span> ${escapeHtml(formatValuePreview(beforeValue))}</p>`
          : "";
      const afterMarkup =
        entry.type !== "removed"
          ? `<p class="moderation-callout-value"><span>${entry.type === "added" ? "New Value" : "After"}:</span> ${escapeHtml(
              formatValuePreview(afterValue)
            )}</p>`
          : "";

      return `
        <div class="moderation-callout diff-${entry.type}">
          <div class="moderation-callout-head">
            <span class="moderation-callout-icon">${icon}</span>
            <span class="moderation-callout-type">${escapeHtml(typeLabel)}</span>
            <span class="moderation-callout-path">${escapeHtml(entry.path)}</span>
          </div>
          ${beforeMarkup}
          ${afterMarkup}
        </div>
      `;
    })
    .join("");
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
  const beforeOverride = state.cmsOverrides[submission.artifactId] ? structuredClone(state.cmsOverrides[submission.artifactId]) : undefined;
  const afterOverride =
    submission.operation === "delete" ? undefined : applySubmissionPreviewOverride(beforeOverride ?? {}, submission.override ?? {});
  const entries = dedupeDiffEntries(collectDiffEntries(beforeOverride, afterOverride));

  return {
    beforeOverride,
    afterOverride,
    entries
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

function collectDiffEntries(before, after, path = "(root)") {
  const entries = [];
  const beforeExists = before !== undefined;
  const afterExists = after !== undefined;

  if (before === after) {
    return entries;
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    const maxLength = Math.max(before.length, after.length);
    if (before.length !== after.length) {
      entries.push({ path, type: "updated" });
    }
    for (let index = 0; index < maxLength; index += 1) {
      const childPath = makeChildPath(path, index, true);
      if (index >= before.length) {
        entries.push({ path: childPath, type: "added" });
        entries.push(...collectDiffEntries(undefined, after[index], childPath));
        continue;
      }
      if (index >= after.length) {
        entries.push({ path: childPath, type: "removed" });
        entries.push(...collectDiffEntries(before[index], undefined, childPath));
        continue;
      }
      entries.push(...collectDiffEntries(before[index], after[index], childPath));
    }
    return entries;
  }

  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      const childPath = makeChildPath(path, key, false);
      if (!Object.prototype.hasOwnProperty.call(after, key)) {
        entries.push({ path: childPath, type: "removed" });
        entries.push(...collectDiffEntries(before[key], undefined, childPath));
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(before, key)) {
        entries.push({ path: childPath, type: "added" });
        entries.push(...collectDiffEntries(undefined, after[key], childPath));
        continue;
      }
      entries.push(...collectDiffEntries(before[key], after[key], childPath));
    }
    return entries;
  }

  if (!beforeExists && afterExists) {
    entries.push({ path, type: "added" });
    if (Array.isArray(after)) {
      after.forEach((value, index) => {
        const childPath = makeChildPath(path, index, true);
        entries.push(...collectDiffEntries(undefined, value, childPath));
      });
    } else if (isPlainObject(after)) {
      for (const key of Object.keys(after)) {
        const childPath = makeChildPath(path, key, false);
        entries.push(...collectDiffEntries(undefined, after[key], childPath));
      }
    }
    return entries;
  }

  if (beforeExists && !afterExists) {
    entries.push({ path, type: "removed" });
    if (Array.isArray(before)) {
      before.forEach((value, index) => {
        const childPath = makeChildPath(path, index, true);
        entries.push(...collectDiffEntries(value, undefined, childPath));
      });
    } else if (isPlainObject(before)) {
      for (const key of Object.keys(before)) {
        const childPath = makeChildPath(path, key, false);
        entries.push(...collectDiffEntries(before[key], undefined, childPath));
      }
    }
    return entries;
  }

  const beforeEncoded = JSON.stringify(before ?? null);
  const afterEncoded = JSON.stringify(after ?? null);
  if (beforeEncoded !== afterEncoded) {
    entries.push({ path, type: "updated" });
  }
  return entries;
}

function dedupeDiffEntries(entries = []) {
  const seen = new Map();
  for (const entry of entries) {
    if (!entry || !entry.path || !entry.type) {
      continue;
    }
    const key = `${entry.path}__${entry.type}`;
    if (!seen.has(key)) {
      seen.set(key, entry);
    }
  }
  return Array.from(seen.values());
}

function makeChildPath(parentPath, key, isArray) {
  if (!parentPath || parentPath === "(root)") {
    return isArray ? `[${key}]` : String(key);
  }
  return isArray ? `${parentPath}[${key}]` : `${parentPath}.${key}`;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatJsonDiffHtml(value, diffEntries, options = {}) {
  const view = options.view === "after" ? "after" : "before";
  const entries = Array.isArray(diffEntries) ? diffEntries : [];
  const lines = renderJsonLines(value ?? null, "(root)", 0);
  const highlightLookup = createDiffHighlightLookup(entries, view);

  return lines
    .map((line) => {
      const highlight = highlightLookup.get(line.path);
      const content = line.text;
      if (!highlight) {
        return content;
      }
      return `<span class="diff-line diff-${highlight}">${content}</span>`;
    })
    .join("\n");
}

function createDiffHighlightLookup(entries, view) {
  const lookup = new Map();
  for (const entry of entries) {
    if (!entry || !entry.path || !entry.type) {
      continue;
    }
    if (view === "before" && entry.type === "added") {
      continue;
    }
    if (view === "after" && entry.type === "removed") {
      continue;
    }
    if (!lookup.has(entry.path) || entry.type === "updated") {
      lookup.set(entry.path, entry.type);
    }
  }
  return lookup;
}

function renderJsonLines(value, path, depth) {
  const indentUnit = "  ";
  const indent = indentUnit.repeat(depth);

  if (Array.isArray(value)) {
    if (!value.length) {
      return [{ path, text: `${indent}[]` }];
    }
    const lines = [{ path, text: `${indent}[` }];
    value.forEach((entry, index) => {
      const childPath = makeChildPath(path, index, true);
      const childLines = renderJsonLines(entry, childPath, depth + 1);
      lines.push(...childLines);
      if (index < value.length - 1) {
        lines[lines.length - 1].text += ",";
      }
    });
    lines.push({ path, text: `${indent}]` });
    return lines;
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (!entries.length) {
      return [{ path, text: `${indent}{}` }];
    }
    const lines = [{ path, text: `${indent}{` }];
    entries.forEach(([key, childValue], index) => {
      const childPath = makeChildPath(path, key, false);
      const childLines = renderJsonLines(childValue, childPath, depth + 1);
      if (!childLines.length) {
        lines.push({
          path: childPath,
          text: `${indent}${indentUnit}${formatJsonKey(key)}: ${formatPrimitiveValue(childValue)}`
        });
      } else {
        const firstLine = childLines[0];
        const trimmed = firstLine.text.trimStart();
        firstLine.text = `${indent}${indentUnit}${formatJsonKey(key)}: ${trimmed}`;
        lines.push(...childLines);
      }
      if (index < entries.length - 1) {
        lines[lines.length - 1].text += ",";
      }
    });
    lines.push({ path, text: `${indent}}` });
    return lines;
  }

  return [{ path, text: `${indent}${formatPrimitiveValue(value)}` }];
}

function formatJsonKey(key) {
  return `<span class="token-key">"${escapeHtml(key)}"</span>`;
}

function formatPrimitiveValue(value) {
  if (typeof value === "string") {
    return `<span class="token-string">${escapeHtml(JSON.stringify(value))}</span>`;
  }
  if (typeof value === "number") {
    return `<span class="token-number">${escapeHtml(String(value))}</span>`;
  }
  if (typeof value === "boolean") {
    return `<span class="token-boolean">${value ? "true" : "false"}</span>`;
  }
  if (value === null || value === undefined) {
    return `<span class="token-null">null</span>`;
  }
  if (Array.isArray(value)) {
    return `<span class="token-hint">Array(${value.length})</span>`;
  }
  if (isPlainObject(value)) {
    return `<span class="token-hint">Object(${Object.keys(value).length})</span>`;
  }
  return `<span class="token-string">${escapeHtml(JSON.stringify(value))}</span>`;
}

function getValueAtPath(source, path) {
  if (path === "(root)") {
    return source;
  }

  const tokenRegex = /([^[.\]]+)|\[(\d+)\]/g;
  let current = source;
  let match;

  while ((match = tokenRegex.exec(path))) {
    if (current === undefined || current === null) {
      return undefined;
    }
    if (match[1] !== undefined) {
      current = current[match[1]];
    } else if (match[2] !== undefined) {
      const index = Number(match[2]);
      current = Array.isArray(current) ? current[index] : undefined;
    }
  }

  return current;
}

function formatValuePreview(value) {
  if (value === undefined) {
    return "—";
  }
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return `Array (${value.length})`;
  }
  if (isPlainObject(value)) {
    return `Object (${Object.keys(value).length} keys)`;
  }
  if (typeof value === "string") {
    const normalized = value.length > 120 ? `${value.slice(0, 117)}…` : value;
    return `"${normalized}"`;
  }
  return String(value);
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
    state.curatorReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    haltShowcaseForManualInteraction("open_curator");
    if (state.shortcutsOpen) {
      setShortcutsOpen(false, { skipTrack: true, returnFocus: false });
    }
    if (state.moderationOpen) {
      setModerationOpen(false, { skipTrack: true, returnFocus: false });
    }
    if (!state.curatorArtifactId) {
      state.curatorArtifactId = state.currentArtifactId ?? artifacts[0]?.id ?? null;
    }
    renderCuratorArtifactOptions();
    populateCuratorForm(state.curatorArtifactId);
    refreshCuratorValidation();
    elements.curatorArtifactSelect.focus();
  } else if (options.returnFocus !== false) {
    const returnTo = state.curatorReturnFocus;
    state.curatorReturnFocus = null;
    restoreFocus(returnTo, elements.curatorBtn);
  } else {
    state.curatorReturnFocus = null;
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
  refreshCuratorValidation();

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

  refreshCuratorValidation();
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
  refreshCuratorValidation();

  try {
    const rawPayload = collectCuratorPayload();
    const payload = sanitizeOverridePayload(rawPayload);
    const adjusted = JSON.stringify(payload) !== JSON.stringify(rawPayload);
    setCuratorStatus(
      adjusted
        ? "Submitting override (fields trimmed/invalid URLs dropped to match CMS limits)..."
        : "Submitting override to moderation queue...",
      "neutral"
    );
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
    state.shortcutsReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    haltShowcaseForManualInteraction("open_shortcuts");
    if (state.curatorOpen) {
      setCuratorOpen(false, { skipTrack: true, returnFocus: false });
    }
    if (state.moderationOpen) {
      setModerationOpen(false, { skipTrack: true, returnFocus: false });
    }
    elements.shortcutsCloseBtn.focus();
  } else if (options.returnFocus !== false) {
    const returnTo = state.shortcutsReturnFocus;
    state.shortcutsReturnFocus = null;
    restoreFocus(returnTo, elements.shortcutsBtn);
  } else {
    state.shortcutsReturnFocus = null;
  }

  if (!options.skipTrack) {
    trackEvent("shortcuts_overlay_toggled", {
      open: state.shortcutsOpen,
      source: options.source ?? "unknown"
    });
  }
}

function setWebglRecoveryOpen(open, options = {}) {
  state.webglRecoveryOpen = Boolean(open);
  state.webglRecoveryPane = options.pane ?? state.webglRecoveryPane;
  elements.webglRecoveryModal.hidden = !state.webglRecoveryOpen;

  if (state.webglRecoveryOpen) {
    haltShowcaseForManualInteraction("webgl_recovery_open");
    if (state.curatorOpen) {
      setCuratorOpen(false, { skipTrack: true, returnFocus: false });
    }
    if (state.moderationOpen) {
      setModerationOpen(false, { skipTrack: true, returnFocus: false });
    }
    if (state.shortcutsOpen) {
      setShortcutsOpen(false, { skipTrack: true, returnFocus: false });
    }

    state.webglRecoveryReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const paneLabel = state.webglRecoveryPane === "compare" ? "Comparison" : "Primary";
    elements.webglRecoveryMessage.textContent = `${paneLabel} WebGL rendering was interrupted. Reload the viewer to restore 3D rendering. You can also enable Low Load mode before reloading for kiosk stability.`;
    elements.webglRecoveryReloadBtn.focus();
  } else {
    const returnTo = state.webglRecoveryReturnFocus;
    state.webglRecoveryReturnFocus = null;
    state.webglRecoveryPane = null;
    if (returnTo && typeof returnTo.focus === "function") {
      returnTo.focus();
    } else {
      elements.snapshotBtn.focus();
    }
  }

  trackEvent("webgl_recovery_overlay_toggled", {
    open: state.webglRecoveryOpen,
    source: options.source ?? "unknown",
    pane: state.webglRecoveryPane ?? "unknown"
  });
}

function setRendererStatusOpen(open, options = {}) {
  if (!elements.rendererStatusModal) {
    return;
  }

  state.rendererStatusOpen = Boolean(open);
  elements.rendererStatusModal.hidden = !state.rendererStatusOpen;

  if (state.rendererStatusOpen) {
    haltShowcaseForManualInteraction("renderer_status_open");
    if (state.webglRecoveryOpen) {
      setWebglRecoveryOpen(false, { source: "renderer_status" });
    }
    if (state.curatorOpen) {
      setCuratorOpen(false, { skipTrack: true, returnFocus: false });
    }
    if (state.moderationOpen) {
      setModerationOpen(false, { skipTrack: true, returnFocus: false });
    }
    if (state.shortcutsOpen) {
      setShortcutsOpen(false, { skipTrack: true, returnFocus: false });
    }

    state.rendererStatusReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    updateRendererStatusUI();
    elements.rendererStatusCloseBtn?.focus();
  } else if (options.returnFocus !== false) {
    const returnTo = state.rendererStatusReturnFocus;
    state.rendererStatusReturnFocus = null;
    restoreFocus(returnTo, elements.rendererStatusBtn);
  } else {
    state.rendererStatusReturnFocus = null;
  }

  if (!options.skipTrack) {
    trackEvent("renderer_status_overlay_toggled", {
      open: state.rendererStatusOpen,
      webgl: primaryViewer.webglAvailable ? "available" : "unavailable",
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
  const searchTokens = getActiveSearchTokens();

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
    const titleHtml = highlightText(artifact.title, searchTokens);
    const categoryHtml = highlightText(artifact.category, searchTokens);
    const hookHtml = highlightText(artifact.hook, searchTokens);
    const tagsHtml = highlightText(keywordText, searchTokens);

    button.innerHTML = `
      <span class="artifact-chip-title">${titleHtml}</span>
      <span class="artifact-chip-meta">${categoryHtml}</span>
      <span class="artifact-chip-hook">${hookHtml}</span>
      <span class="artifact-chip-tags">${tagsHtml}</span>
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
      state.comparePinnedFromUrl = false;
      trackEvent("compare_artifact_selected", {
        primaryArtifactId: state.currentArtifactId,
        compareArtifactId: artifact.id
      });
      await loadCompareArtifact(artifact.id, { syncFromPrimary: true, source: "compare_select" });
    });

    elements.compareArtifactList.appendChild(button);
  });
}

function renderHotspotList() {
  const artifact = artifactMap.get(state.currentArtifactId);
  if (!artifact) {
    elements.hotspotListPanel.innerHTML = "";
    state.pendingHotspotFocus = null;
    return;
  }

  const searchTokens = getActiveSearchTokens();

  if (!state.hotspotData.length) {
    elements.hotspotListPanel.innerHTML = `
      <p class="panel-label">${escapeHtml(artifact.hotspotTitle)}</p>
      <p class="empty-state">No hotspot data</p>
    `;
    state.pendingHotspotFocus = null;
    return;
  }

  const setSize = state.hotspotData.length;
  const itemsMarkup = state.hotspotData
    .map((hotspot, index) => {
      const selectedClass = state.selectedHotspot?.id === hotspot.id ? "is-active" : "";
      const labelHtml = highlightText(hotspot.label, searchTokens);
      const titleHtml = highlightText(hotspot.title, searchTokens);
      return `
        <button
          class="hotspot-list-item ${selectedClass}"
          type="button"
          data-hotspot-id="${hotspot.id}"
          aria-posinset="${index + 1}"
          aria-setsize="${setSize}"
        >
          <span class="hotspot-list-index">${String(index + 1).padStart(2, "0")}</span>
          <span class="hotspot-list-copy">
            <span class="hotspot-list-label">${labelHtml}</span>
            <span class="hotspot-list-title">${titleHtml}</span>
          </span>
        </button>
      `;
    })
    .join("");

  const listLabel = `${artifact.hotspotTitle} hotspots`;
  elements.hotspotListPanel.innerHTML = `
    <p class="panel-label">${escapeHtml(artifact.hotspotTitle)}</p>
    <div class="hotspot-list" role="listbox" aria-label="${escapeHtml(listLabel)}">
      ${itemsMarkup}
    </div>
  `;

  elements.hotspotListPanel.querySelectorAll("[data-hotspot-id]").forEach((button, index) => {
    button.dataset.hotspotIndex = String(index);
    button.addEventListener("click", () => {
      const hotspotId = button.dataset.hotspotId;
      if (!hotspotId) {
        return;
      }
      queueHotspotListFocus(hotspotId);
      setDetailView("hotspots", { skipUrlUpdate: true });
      primaryViewer.selectHotspot(hotspotId, { focus: true });
    });
  });

  syncHotspotListKeyboardState();
}

function getHotspotListButtons() {
  return Array.from(elements.hotspotListPanel.querySelectorAll("[data-hotspot-id]"));
}

function queueHotspotListFocus(targetId, options = {}) {
  state.pendingHotspotFocus = {
    targetId: targetId ?? null,
    fallbackToFirst: options.fallbackToFirst === true
  };
}

function syncHotspotListKeyboardState() {
  const buttons = getHotspotListButtons();
  if (!buttons.length) {
    state.pendingHotspotFocus = null;
    return;
  }

  const selectedId = state.selectedHotspot?.id ?? null;
  let activeButton = selectedId ? buttons.find((button) => button.dataset.hotspotId === selectedId) ?? null : null;
  if (!activeButton) {
    activeButton = buttons[0];
  }

  buttons.forEach((button) => {
    const isActive = button === activeButton;
    button.tabIndex = isActive ? 0 : -1;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  const pendingFocus = state.pendingHotspotFocus;
  if (pendingFocus) {
    let focusButton = null;
    if (pendingFocus.targetId) {
      focusButton = buttons.find((button) => button.dataset.hotspotId === pendingFocus.targetId) ?? null;
    }
    if (!focusButton && pendingFocus.fallbackToFirst) {
      focusButton = buttons[0];
    }
    if (focusButton) {
      focusButton.focus();
    }
    state.pendingHotspotFocus = null;
  }
}

function renderStoryPanel() {
  const artifact = artifactMap.get(state.currentArtifactId);
  const searchTokens = getActiveSearchTokens();
  if (!artifact?.story) {
    elements.storyKicker.textContent = "Story";
    elements.storyTitle.innerHTML = "Story unavailable";
    elements.storySummary.innerHTML = "This artifact does not include narrative content yet.";
    elements.storyBody.innerHTML = "";
    elements.storyReferences.innerHTML = "";
    return;
  }

  const { story } = artifact;
  elements.storyKicker.textContent = `${artifact.category.toUpperCase()} STORY`;
  elements.storyTitle.innerHTML = highlightText(story.title, searchTokens);
  elements.storySummary.innerHTML = highlightText(story.summary, searchTokens);

  elements.storyBody.innerHTML = (story.body ?? [])
    .map((paragraph) => `<p>${highlightText(paragraph, searchTokens)}</p>`)
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
            `<a class="story-reference-link" href="${escapeHtml(reference.url)}" target="_blank" rel="noreferrer noopener">${highlightText(reference.label, searchTokens)}</a>`
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
  const comparePartnerEntries = Object.entries(artifactMetrics.comparePartnerCounts ?? {});
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
  const topComparePartners = comparePartnerEntries
    .sort(([, leftCount], [, rightCount]) => rightCount - leftCount)
    .slice(0, 3)
    .map(([partnerId, count]) => {
      const partner = artifactMap.get(partnerId);
      return {
        label: partner?.title ?? partnerId,
        count
      };
    });

  const metricItems = INSIGHTS_METRIC_DEFINITIONS.map((definition) => ({
    ...definition,
    value: artifactMetrics[definition.key] ?? 0,
    delta: getMetricDeltaForArtifact(state.currentArtifactId, definition.key)
  }));

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

  const topCompareMarkup = topComparePartners.length
    ? topComparePartners
        .map(
          (entry) => `
            <li class="insights-top-item">
              <span>${escapeHtml(entry.label)}</span>
              <strong>${entry.count}</strong>
            </li>
          `
        )
        .join("")
    : '<li class="insights-top-item is-empty"><span>No compare pairings yet</span><strong>0</strong></li>';

  const rendererStatusLabel = primaryViewer.webglAvailable ? "Available" : "Unavailable";
  const rendererReason = !primaryViewer.webglAvailable && primaryViewer.webglUnavailableReason
    ? String(primaryViewer.webglUnavailableReason)
    : "";
  const primaryLoadLabel = state.primaryLoadError ? "Error" : state.primaryLoading ? "Loading" : "OK";
  const compareLoadLabel = !state.compareEnabled
    ? "N/A"
    : state.compareLoadError
      ? "Error"
      : state.compareLoading
        ? "Loading"
        : state.compareReady
          ? "OK"
          : "Pending";
  const recentErrors = state.clientErrorLog.slice(-5).reverse();
  const errorsMarkup = recentErrors.length
    ? `<ol class="diagnostics-errors">
        ${recentErrors
          .map((entry) => {
            const ts = new Date(entry.ts);
            const timeLabel = ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
            return `<li><time datetime="${escapeHtml(ts.toISOString())}">${escapeHtml(timeLabel)}</time>${escapeHtml(
              `${entry.kind}: ${entry.message}`
            )}</li>`;
          })
          .join("")}
      </ol>`
    : '<p class="insights-empty">No client errors captured this session.</p>';

  const fallbackHelp = !primaryViewer.webglAvailable
    ? `<p class="insights-empty">Fallback mode keeps gallery, hotspots, tours, story, share, and CMS tools usable. 3D rendering is disabled and snapshots will contain placeholders.</p>`
    : "";

  elements.insightsContent.innerHTML = `
    <div class="insights-actions">
      <button class="chip-btn" type="button" data-action="copy-insights">Copy metrics</button>
      <button class="chip-btn" type="button" data-action="copy-diagnostics">Copy diagnostics</button>
      ${state.clientErrorLog.length ? '<button class="chip-btn" type="button" data-action="clear-errors">Clear</button>' : ""}
    </div>
    <div class="insights-grid">
      ${metricItems
        .map(
          (item) => {
            const hasDelta = Number.isFinite(item.delta);
            const delta = hasDelta ? Number(item.delta) : null;
            const deltaTone = delta > 0 ? "is-up" : delta < 0 ? "is-down" : "is-flat";
            const deltaPrefix = delta > 0 ? "+" : "";
            const deltaLabel = hasDelta ? `${deltaPrefix}${delta}` : "";
            const deltaAriaLabel = hasDelta ? `Delta ${deltaLabel} since last server poll` : "";
            const sparkline = renderMetricSparkline(state.currentArtifactId, item.key);
            return `
            <div class="insight-chip">
              <span class="insight-label">${escapeHtml(item.label)}</span>
              <strong class="insight-value">${item.value}</strong>
              <span
                class="insight-delta ${hasDelta ? `${deltaTone} is-visible` : "is-hidden"}"
                ${deltaAriaLabel ? `aria-label="${escapeHtml(deltaAriaLabel)}"` : 'aria-hidden="true"'}
              >
                ${hasDelta ? escapeHtml(deltaLabel) : ""}
              </span>
              ${sparkline}
            </div>
          `;
          }
        )
        .join("")}
    </div>
    <div class="insights-list-grid">
      <section class="insights-top-card">
        <p class="insights-top-label">Top Hotspots</p>
        <ol class="insights-top-list">${topHotspotMarkup}</ol>
      </section>
      <section class="insights-top-card">
        <p class="insights-top-label">Top Compare Partners</p>
        <ol class="insights-top-list">${topCompareMarkup}</ol>
      </section>
      <section class="insights-top-card is-wide">
        <p class="insights-top-label">Diagnostics</p>
        <div class="diagnostics-grid">
          <p class="diagnostics-item"><span>Renderer</span><strong>${escapeHtml(rendererStatusLabel)}</strong></p>
          <p class="diagnostics-item"><span>Reason</span><strong>${escapeHtml(rendererReason || "N/A")}</strong></p>
          <p class="diagnostics-item"><span>Primary Load</span><strong>${escapeHtml(primaryLoadLabel)}</strong></p>
          <p class="diagnostics-item"><span>Compare Load</span><strong>${escapeHtml(compareLoadLabel)}</strong></p>
          <p class="diagnostics-item"><span>Reduced Motion</span><strong>${escapeHtml(state.prefersReducedMotion ? "On" : "Off")}</strong></p>
          <p class="diagnostics-item"><span>Errors</span><strong>${state.clientErrorLog.length}</strong></p>
        </div>
        ${fallbackHelp}
        ${errorsMarkup}
      </section>
    </div>
  `;
}

function formatInsightsExportText(artifactId) {
  if (!artifactId) {
    return "";
  }

  const artifact = artifactMap.get(artifactId);
  const metrics = getDisplayMetricsForArtifact(artifactId);
  const source = state.serverMetrics[artifactId] ? "server" : "session";

  const lines = [];
  lines.push("Artifact Viewer · Session Insights");
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push(`Artifact: ${artifact?.title ?? artifactId} (${artifactId})`);
  lines.push(`Metrics source: ${source}`);
  lines.push("");

  INSIGHTS_METRIC_DEFINITIONS.forEach((definition) => {
    const value = metrics[definition.key] ?? 0;
    lines.push(`${definition.label}: ${value}`);
  });

  const topHotspots = Object.entries(metrics.hotspotCounts ?? {})
    .sort(([, left], [, right]) => right - left)
    .slice(0, 5)
    .map(([hotspotId, count]) => {
      const hotspot = artifact?.hotspots?.find((item) => item.id === hotspotId);
      return `${hotspot?.label ?? hotspotId}: ${count}`;
    });
  if (topHotspots.length) {
    lines.push("");
    lines.push("Top hotspots:");
    topHotspots.forEach((line) => lines.push(`- ${line}`));
  }

  const topPartners = Object.entries(metrics.comparePartnerCounts ?? {})
    .sort(([, left], [, right]) => right - left)
    .slice(0, 5)
    .map(([partnerId, count]) => `${artifactMap.get(partnerId)?.title ?? partnerId}: ${count}`);
  if (topPartners.length) {
    lines.push("");
    lines.push("Top compare partners:");
    topPartners.forEach((line) => lines.push(`- ${line}`));
  }

  return lines.join("\n");
}

function formatDiagnosticsExportText(artifactId) {
  const artifact = artifactId ? artifactMap.get(artifactId) : null;
  const lines = [];
  lines.push("Artifact Viewer · Diagnostics");
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  if (artifactId) {
    lines.push(`Artifact: ${artifact?.title ?? artifactId} (${artifactId})`);
  }
  lines.push(`Renderer: ${primaryViewer.webglAvailable ? "available" : "unavailable"}`);
  if (!primaryViewer.webglAvailable) {
    lines.push(`Renderer reason: ${primaryViewer.webglUnavailableReason ?? "unknown"}`);
  }
  lines.push(`Reduced motion: ${state.prefersReducedMotion ? "on" : "off"}`);
  lines.push(`Primary load: ${state.primaryLoadError ? "error" : state.primaryLoading ? "loading" : "ok"}`);
  lines.push(
    `Compare load: ${
      !state.compareEnabled ? "n/a" : state.compareLoadError ? "error" : state.compareLoading ? "loading" : state.compareReady ? "ok" : "pending"
    }`
  );
  lines.push(`Client errors captured: ${state.clientErrorLog.length}`);
  lines.push("");

  if (state.clientErrorLog.length) {
    lines.push("Recent client errors:");
    state.clientErrorLog
      .slice(-20)
      .forEach((entry) =>
        lines.push(
          `- ${new Date(entry.ts).toLocaleString()} | ${String(entry.kind)} | ${String(entry.message)}${entry.artifactId ? ` | ${entry.artifactId}` : ""}`
        )
      );
  } else {
    lines.push("No client errors captured this session.");
  }

  return lines.join("\n");
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
  const searchTokens = getActiveSearchTokens();

  if (state.activeDetailView !== "hotspots" || !artifact || !hotspot) {
    elements.hotspotCard.hidden = true;
    return;
  }

  elements.hotspotCard.hidden = false;
  elements.hotspotKicker.textContent = state.tourActive
    ? `Guided Tour · Step ${state.tourIndex + 1}/${state.tourTotal}`
    : artifact.hotspotTitle;
  elements.hotspotTitle.innerHTML = highlightText(hotspot.title, searchTokens);
  const hotspotBodyText = state.tourActive && state.tourCaption ? `${state.tourCaption} ${hotspot.body}` : hotspot.body;
  elements.hotspotBody.innerHTML = highlightText(hotspotBodyText, searchTokens);

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

function handleHotspotListKeydown(event) {
  if (state.activeDetailView !== "hotspots") {
    return;
  }

  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const button = target.closest("button[data-hotspot-id]");
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  const buttons = getHotspotListButtons();
  if (!buttons.length) {
    return;
  }

  const currentIndex = buttons.findIndex((entry) => entry === button);
  if (currentIndex < 0) {
    return;
  }

  const key = event.key;
  let nextIndex = null;

  if (key === "ArrowDown" || key === "ArrowRight") {
    nextIndex = Math.min(currentIndex + 1, buttons.length - 1);
  } else if (key === "ArrowUp" || key === "ArrowLeft") {
    nextIndex = Math.max(currentIndex - 1, 0);
  } else if (key === "Home") {
    nextIndex = 0;
  } else if (key === "End") {
    nextIndex = buttons.length - 1;
  } else if (key === "Enter" || key === " ") {
    event.preventDefault();
    const hotspotId = button.dataset.hotspotId;
    if (hotspotId) {
      queueHotspotListFocus(hotspotId);
      primaryViewer.selectHotspot(hotspotId, { focus: true });
    }
    return;
  } else {
    return;
  }

  event.preventDefault();
  if (nextIndex === currentIndex) {
    return;
  }

  const nextButton = buttons[nextIndex];
  if (!nextButton) {
    return;
  }

  const hotspotId = nextButton.dataset.hotspotId;
  if (!hotspotId) {
    return;
  }

  queueHotspotListFocus(hotspotId);
  primaryViewer.selectHotspot(hotspotId, { focus: true });
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
      setCuratorOpen(false, { skipTrack: true, returnFocus: false });
    }
    if (state.moderationOpen) {
      setModerationOpen(false, { skipTrack: true, returnFocus: false });
    }
    if (state.shortcutsOpen) {
      setShortcutsOpen(false, { skipTrack: true, returnFocus: false });
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
  elements.lowLoadBtn.textContent = state.lowLoadMode ? "Low Load On" : "Low Load Off";
  elements.lowLoadBtn.classList.toggle("is-active", state.lowLoadMode);
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
  state.primaryLoading = Boolean(loading);
  const visible = state.primaryLoading || Boolean(state.primaryLoadError);
  elements.loadingOverlay.classList.toggle("is-visible", visible);
  elements.loadingOverlay.setAttribute("aria-hidden", String(!visible));

  const track = elements.loadingOverlay.querySelector(".loading-track");
  if (track instanceof HTMLElement) {
    track.hidden = !state.primaryLoading && Boolean(state.primaryLoadError);
  }

  if (elements.loadingActions) {
    elements.loadingActions.hidden = !state.primaryLoadError;
  }

  if (state.primaryLoading) {
    elements.loadingBar.style.width = "2%";
  }
}

function setCompareLoading(loading) {
  state.compareLoading = Boolean(loading);
  const visible = state.compareLoading || Boolean(state.compareLoadError);
  elements.loadingOverlayCompare.classList.toggle("is-visible", visible);
  elements.loadingOverlayCompare.setAttribute("aria-hidden", String(!visible));

  const track = elements.loadingOverlayCompare.querySelector(".loading-track");
  if (track instanceof HTMLElement) {
    track.hidden = !state.compareLoading && Boolean(state.compareLoadError);
  }

  if (elements.loadingActionsCompare) {
    elements.loadingActionsCompare.hidden = !state.compareLoadError;
  }

  if (state.compareLoading) {
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
    const requested = options.behavior ?? (state.prefersReducedMotion ? "auto" : "smooth");
    const behavior = requested === "instant" ? "auto" : requested;
    input.scrollIntoView({ behavior, block: "center" });
  }

  input.focus();
  if (typeof input.select === "function") {
    input.select();
  }

  return !wasFocused;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

function getFocusableElements(container) {
  if (!container) {
    return [];
  }

  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter((node) => {
    if (!(node instanceof HTMLElement)) {
      return false;
    }
    if (node.getAttribute("aria-hidden") === "true") {
      return false;
    }
    if (node.hidden) {
      return false;
    }
    // Avoid trapping focus on elements that are not actually rendered.
    if (typeof node.getClientRects === "function" && node.getClientRects().length === 0) {
      return false;
    }
    return true;
  });
}

function trapFocusWithin(container, event) {
  if (!(event instanceof KeyboardEvent) || event.key !== "Tab") {
    return;
  }

  const focusables = getFocusableElements(container);
  if (!focusables.length) {
    event.preventDefault();
    return;
  }

  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const inContainer = active ? container.contains(active) : false;
  const index = inContainer ? focusables.indexOf(active) : -1;

  const nextIndex = event.shiftKey ? index - 1 : index + 1;
  const wrappedIndex = (() => {
    if (index === -1) {
      return event.shiftKey ? focusables.length - 1 : 0;
    }
    if (nextIndex < 0) {
      return focusables.length - 1;
    }
    if (nextIndex >= focusables.length) {
      return 0;
    }
    return nextIndex;
  })();

  event.preventDefault();
  focusables[wrappedIndex]?.focus();
}

function getOpenModalFocusContainer() {
  if (state.webglRecoveryOpen) {
    return elements.webglRecoveryModal?.querySelector(".shortcuts-card") ?? null;
  }
  if (state.rendererStatusOpen) {
    return elements.rendererStatusModal?.querySelector(".shortcuts-card") ?? null;
  }
  if (state.moderationOpen) {
    return elements.moderationModal?.querySelector(".shortcuts-card") ?? null;
  }
  if (state.curatorOpen) {
    return elements.curatorForm ?? null;
  }
  if (state.shortcutsOpen) {
    return elements.shortcutsModal?.querySelector(".shortcuts-card") ?? null;
  }
  return null;
}

function restoreFocus(returnTo, fallback) {
  if (returnTo && typeof returnTo.focus === "function" && returnTo.isConnected) {
    returnTo.focus();
    return true;
  }
  if (fallback && typeof fallback.focus === "function") {
    fallback.focus();
    return true;
  }
  return false;
}

function handleKeydown(event) {
  touchIdleReset();
  const normalizedKey = event.key.toLowerCase();
  const isSearchShortcut = normalizedKey === "k" && (event.metaKey || event.ctrlKey);
  if (isSearchShortcut) {
    event.preventDefault();
    haltShowcaseForManualInteraction("keyboard_search");
    if (state.shortcutsOpen) {
      setShortcutsOpen(false, { source: "keyboard", skipTrack: true, returnFocus: false });
    }
    if (state.webglRecoveryOpen) {
      setWebglRecoveryOpen(false, { source: "keyboard" });
    }
    if (state.rendererStatusOpen) {
      setRendererStatusOpen(false, { source: "keyboard" });
    }
    if (state.curatorOpen) {
      setCuratorOpen(false, { source: "keyboard", skipTrack: true, returnFocus: false });
    }
    if (state.moderationOpen) {
      setModerationOpen(false, { source: "keyboard", skipTrack: true, returnFocus: false });
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

  if (event.key === "Tab") {
    const container = getOpenModalFocusContainer();
    if (container) {
      trapFocusWithin(container, event);
      return;
    }
  }

  if (event.key === "Escape") {
    if (state.webglRecoveryOpen) {
      event.preventDefault();
      setWebglRecoveryOpen(false, { source: "keyboard" });
      trackEvent("keyboard_shortcut_used", { key: "Escape", action: "close_webgl_recovery" });
      return;
    }

    if (state.rendererStatusOpen) {
      event.preventDefault();
      setRendererStatusOpen(false, { source: "keyboard" });
      trackEvent("keyboard_shortcut_used", { key: "Escape", action: "close_renderer_status" });
      return;
    }

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

  if (state.webglRecoveryOpen) {
    return;
  }

  if (state.rendererStatusOpen) {
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
    setDetailView(nextView, { focusHotspotList: nextView === "hotspots" });
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

  if (key === "l") {
    event.preventDefault();
    haltShowcaseForManualInteraction("keyboard_l");
    setLowLoadMode(!state.lowLoadMode, { source: "keyboard" });
    trackEvent("keyboard_shortcut_used", { key: "l", action: "toggle_low_load" });
    return;
  }

  if (key === "m") {
    event.preventDefault();
    setShowcaseActive(!state.showcaseActive, { source: "keyboard" });
    trackEvent("keyboard_shortcut_used", { key: "m", action: "toggle_showcase" });
    return;
  }

  if (key === "x") {
    event.preventDefault();
    haltShowcaseForManualInteraction("keyboard_x");
    void captureSnapshot({ source: "keyboard" });
    trackEvent("keyboard_shortcut_used", { key: "x", action: "download_snapshot" });
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

function registerIdleResetListeners() {
  if (!state.idleResetEnabled || state.idleResetListenersBound) {
    return;
  }

  state.idleResetListenersBound = true;

  const interactionHandler = () => {
    touchIdleReset();
  };

  ["pointerdown", "pointerup", "click"].forEach((eventName) => {
    window.addEventListener(eventName, interactionHandler, { passive: true });
  });
  window.addEventListener("touchstart", interactionHandler, { passive: true });
  window.addEventListener("touchend", interactionHandler, { passive: true });
  window.addEventListener("wheel", interactionHandler, { passive: true });
  window.addEventListener("pointermove", handleIdlePointerMove, { passive: true });

  scheduleIdleReset();
}

function handleIdlePointerMove() {
  const now = Date.now();
  if (now - lastIdlePointerMoveTs < 140) {
    return;
  }
  lastIdlePointerMoveTs = now;
  touchIdleReset();
}

function touchIdleReset() {
  if (!state.idleResetEnabled) {
    return;
  }
  state.idleResetActive = false;
  state.idleResetLastActiveAt = Date.now();
  scheduleIdleReset();
}

function clearIdleResetTimer() {
  if (state.idleResetTimer) {
    window.clearTimeout(state.idleResetTimer);
    state.idleResetTimer = null;
  }
}

function scheduleIdleReset() {
  clearIdleResetTimer();
  if (!state.idleResetEnabled || document.visibilityState === "hidden") {
    return;
  }

  state.idleResetTimer = window.setTimeout(() => {
    void runIdleReset();
  }, state.idleResetTimeoutMs);
}

async function runIdleReset() {
  if (!state.idleResetEnabled) {
    return;
  }

  const now = Date.now();
  const idleDuration = now - state.idleResetLastActiveAt;
  if (idleDuration < state.idleResetTimeoutMs || state.primaryLoading) {
    scheduleIdleReset();
    return;
  }

  if (state.idleResetActive) {
    scheduleIdleReset();
    return;
  }

  state.idleResetActive = true;
  state.idleResetLastActiveAt = now;
  const previousArtifactId = state.currentArtifactId;
  await resetViewerForIdle();
  trackEvent("idle_reset_triggered", {
    artifactId: previousArtifactId,
    timeoutMs: state.idleResetTimeoutMs,
    targetArtifactId: state.currentArtifactId
  });
  scheduleIdleReset();
}

async function resetViewerForIdle() {
  const defaultArtifactId = getDefaultFeaturedArtifactId();
  if (!defaultArtifactId) {
    return;
  }

  if (state.curatorOpen) {
    setCuratorOpen(false, { skipTrack: true, returnFocus: false });
  }
  if (state.moderationOpen) {
    setModerationOpen(false, { skipTrack: true, returnFocus: false });
  }
  if (state.shortcutsOpen) {
    setShortcutsOpen(false, { skipTrack: true, returnFocus: false });
  }

  if (state.showcaseActive) {
    setShowcaseActive(false, { source: "idle_reset", skipTrack: true });
  }
  state.showcaseRequested = false;

  if (state.searchQuery) {
    state.searchQuery = "";
    if (elements.searchInput) {
      elements.searchInput.value = "";
    }
  }

  if (state.currentCategory !== "all") {
    state.currentCategory = "all";
    renderFilters();
  }

  if (state.sortMode !== "featured") {
    state.sortMode = "featured";
    if (elements.sortSelect) {
      elements.sortSelect.value = "featured";
    }
  }

  if (state.activeDetailView !== "hotspots") {
    setDetailView("hotspots", { skipUrlUpdate: true, skipTrack: true });
  }

  if (state.tourAutoPlay) {
    setTourAutoplay(false, { skipTrack: true, skipUrlUpdate: true, source: "idle_reset" });
  }

  if (state.compareEnabled) {
    state.compareEnabled = false;
    state.compareReady = false;
    setCompareModeUI(false);
  }
  state.comparePinnedFromUrl = false;

  if (state.visualPreset !== "white") {
    applyVisualPreset("white", { skipTrack: true, skipUrlUpdate: true });
  }

  if (state.tourActive) {
    primaryViewer.stopTour();
  }

  const artifactChanged = state.currentArtifactId !== defaultArtifactId;
  if (artifactChanged) {
    await loadArtifact(defaultArtifactId, { restoreFromUrl: false, source: "idle_reset", skipCompareReload: true });
  } else {
    ensureValidCompareArtifact({ respectPin: false });
    primaryViewer.resetView();
    const firstHotspot = state.hotspotData[0];
    if (firstHotspot) {
      primaryViewer.selectHotspot(firstHotspot.id, { focus: false });
    } else {
      renderHotspotCard();
    }
    renderGallery();
    renderCompareList();
    renderInsightsPanel();
  }

  showToast("Reset after idle");
  scheduleUrlUpdate();
}

function getDefaultFeaturedArtifactId() {
  if (!artifacts.length) {
    return null;
  }

  const sorted = [...artifacts].sort((left, right) => {
    return (left.featuredRank ?? 999) - (right.featuredRank ?? 999);
  });

  return sorted[0]?.id ?? artifacts[0].id;
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

  if (state.idleResetEnabled) {
    params.set("idle", String(Math.round(state.idleResetTimeoutMs / 1000)));
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

function formatSnapshotTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(
    date.getMinutes()
  )}${pad(date.getSeconds())}`;
}

function sanitizeFilename(value) {
  const base = String(value || "snapshot").trim();
  const cleaned = base
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "snapshot";
}

function canvasToBlob(canvas, mimeType = "image/png") {
  return new Promise((resolve, reject) => {
    if (!(canvas instanceof HTMLCanvasElement)) {
      reject(new Error("snapshot_canvas_invalid"));
      return;
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("snapshot_blob_unavailable"));
        return;
      }
      resolve(blob);
    }, mimeType);
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function captureSnapshot(options = {}) {
  if (!state.currentArtifactId) {
    showToast("Snapshot unavailable");
    return;
  }

  const snapshotButton = elements.snapshotBtn;
  const previousLabel = snapshotButton?.textContent ?? "Snapshot";
  if (snapshotButton) {
    snapshotButton.disabled = true;
    snapshotButton.textContent = "Snapshotting...";
  }

  try {
    const includeCompare = Boolean(state.compareEnabled && state.compareReady && state.compareArtifactId);
    const primaryCanvas = primaryViewer.captureSnapshotCanvas({ maxEdge: 2400 });

    let outputCanvas = primaryCanvas;
    if (includeCompare) {
      const compareCanvas = compareViewer.captureSnapshotCanvas({ maxEdge: 2400 });
      const combined = document.createElement("canvas");
      combined.width = primaryCanvas.width + compareCanvas.width;
      combined.height = Math.max(primaryCanvas.height, compareCanvas.height);
      const ctx = combined.getContext("2d");
      if (!ctx) {
        throw new Error("snapshot_ctx_unavailable");
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, combined.width, combined.height);

      const leftOffsetY = Math.round((combined.height - primaryCanvas.height) / 2);
      const rightOffsetY = Math.round((combined.height - compareCanvas.height) / 2);
      ctx.drawImage(primaryCanvas, 0, leftOffsetY);
      ctx.drawImage(compareCanvas, primaryCanvas.width, rightOffsetY);
      outputCanvas = combined;
    }

    const blob = await canvasToBlob(outputCanvas);
    const primaryTitle = artifactMap.get(state.currentArtifactId)?.title ?? state.currentArtifactId;
    const compareTitle = includeCompare && state.compareArtifactId ? artifactMap.get(state.compareArtifactId)?.title ?? state.compareArtifactId : null;
    const filenameParts = [sanitizeFilename(primaryTitle)];
    if (compareTitle) {
      filenameParts.push("vs", sanitizeFilename(compareTitle));
    }
    filenameParts.push(formatSnapshotTimestamp());
    const filename = `${filenameParts.join("-")}.png`;

    downloadBlob(blob, filename);
    showToast("Snapshot downloaded");
    trackEvent("viewer_snapshot_captured", {
      artifactId: state.currentArtifactId,
      compareEnabled: includeCompare,
      compareArtifactId: includeCompare ? state.compareArtifactId : null,
      lowLoadMode: state.lowLoadMode,
      source: options.source ?? "unknown"
    });
  } catch (error) {
    showToast("Snapshot failed");
    trackEvent("viewer_snapshot_failed", {
      artifactId: state.currentArtifactId,
      reason: String(error && error.message ? error.message : "unknown"),
      source: options.source ?? "unknown"
    });
  } finally {
    if (snapshotButton) {
      snapshotButton.disabled = false;
      snapshotButton.textContent = previousLabel;
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

function parseIdleResetParam(rawValue) {
  if (rawValue === null || rawValue === "") {
    return DEFAULT_IDLE_RESET_MS;
  }

  const seconds = Number(rawValue);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return DEFAULT_IDLE_RESET_MS;
  }

  return Math.max(MIN_IDLE_RESET_MS, Math.round(seconds * 1000));
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
  const idleResetMs = parseIdleResetParam(params.get("idle"));
  const syncSpecified = params.has("sync");
  const compareSync = syncSpecified ? params.get("sync") !== "0" : true;

  return {
    artifactId,
    hotspotId,
    tourStep: Number.isInteger(tourStep) ? tourStep : null,
    cameraPose,
    compareArtifactId,
    compareEnabled: Boolean(compareArtifactId && artifactMap.has(compareArtifactId)),
    compareSync,
    syncSpecified,
    searchQuery: params.get("q")?.trim() ?? "",
    sortMode,
    visualPreset,
    showcaseActive,
    detailView,
    tourAutoPlay,
    idleResetMs,
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

function loadComparePreferences() {
  const fallback = {
    syncEnabled: true,
    artifactPartners: {}
  };

  if (typeof window === "undefined" || !window.localStorage) {
    return {
      syncEnabled: fallback.syncEnabled,
      artifactPartners: {}
    };
  }

  try {
    const raw = window.localStorage.getItem(COMPARE_PREFS_STORAGE_KEY);
    if (!raw) {
      return {
        syncEnabled: fallback.syncEnabled,
        artifactPartners: {}
      };
    }
    const parsed = JSON.parse(raw);
    const artifactPartners =
      typeof parsed.artifactPartners === "object" && parsed.artifactPartners
        ? Object.fromEntries(
            Object.entries(parsed.artifactPartners).filter(
              ([key, value]) => typeof key === "string" && typeof value === "string"
            )
          )
        : {};

    return {
      syncEnabled: typeof parsed.syncEnabled === "boolean" ? parsed.syncEnabled : fallback.syncEnabled,
      artifactPartners
    };
  } catch {
    return {
      syncEnabled: fallback.syncEnabled,
      artifactPartners: {}
    };
  }
}

function persistComparePreferences(preferences) {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(
      COMPARE_PREFS_STORAGE_KEY,
      JSON.stringify({
        syncEnabled: Boolean(preferences.syncEnabled),
        artifactPartners: preferences.artifactPartners ?? {}
      })
    );
  } catch {
    // Ignore storage quota issues.
  }
}

function getPreferredComparePartner(primaryArtifactId) {
  if (!primaryArtifactId) {
    return null;
  }
  const partnerId = state.comparePreferences.artifactPartners?.[primaryArtifactId];
  if (!partnerId || partnerId === primaryArtifactId || !artifactMap.has(partnerId)) {
    if (state.comparePreferences.artifactPartners?.[primaryArtifactId]) {
      delete state.comparePreferences.artifactPartners[primaryArtifactId];
      persistComparePreferences(state.comparePreferences);
    }
    return null;
  }
  return partnerId;
}

function setPreferredComparePartner(primaryArtifactId, partnerId) {
  if (
    !primaryArtifactId ||
    !partnerId ||
    primaryArtifactId === partnerId ||
    !artifactMap.has(primaryArtifactId) ||
    !artifactMap.has(partnerId)
  ) {
    return;
  }
  if (!state.comparePreferences.artifactPartners) {
    state.comparePreferences.artifactPartners = {};
  }
  state.comparePreferences.artifactPartners[primaryArtifactId] = partnerId;
  persistComparePreferences(state.comparePreferences);
}

function setPreferredCompareSync(enabled) {
  state.comparePreferences.syncEnabled = Boolean(enabled);
  persistComparePreferences(state.comparePreferences);
}

function createEmptyMetricsRecord() {
  return {
    views: 0,
    hotspotOpens: 0,
    tourStarts: 0,
    tourLastStepReached: 0,
    shares: 0,
    compareViews: 0,
    compareSessions: 0,
    hotspotCounts: {},
    comparePartnerCounts: {}
  };
}

function ensureMetricsShape(record) {
  if (!record || typeof record !== "object") {
    return createEmptyMetricsRecord();
  }

  record.views = Number(record.views) || 0;
  record.hotspotOpens = Number(record.hotspotOpens) || 0;
  record.tourStarts = Number(record.tourStarts) || 0;
  record.tourLastStepReached = Number(record.tourLastStepReached) || 0;
  record.shares = Number(record.shares) || 0;
  record.compareViews = Number(record.compareViews) || 0;
  record.compareSessions = Number(record.compareSessions) || 0;

  if (!record.hotspotCounts || typeof record.hotspotCounts !== "object") {
    record.hotspotCounts = {};
  }

  if (!record.comparePartnerCounts || typeof record.comparePartnerCounts !== "object") {
    record.comparePartnerCounts = {};
  }

  return record;
}

function cloneServerMetricsSnapshot(metricsByArtifact = {}) {
  const snapshot = {};
  for (const [artifactId, metrics] of Object.entries(metricsByArtifact ?? {})) {
    snapshot[artifactId] = ensureMetricsShape({
      ...createEmptyMetricsRecord(),
      ...(metrics && typeof metrics === "object" ? metrics : {})
    });
  }
  return snapshot;
}

function recordServerMetricsHistory(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return;
  }

  if (!Array.isArray(state.serverMetricsHistory)) {
    state.serverMetricsHistory = [];
  }

  state.serverMetricsHistory.push({
    at: Date.now(),
    snapshot
  });

  if (state.serverMetricsHistory.length > SERVER_METRICS_HISTORY_LIMIT) {
    state.serverMetricsHistory.splice(0, state.serverMetricsHistory.length - SERVER_METRICS_HISTORY_LIMIT);
  }
}

function getServerMetricSeries(artifactId, metricKey) {
  if (!artifactId || !metricKey) {
    return [];
  }

  const history = Array.isArray(state.serverMetricsHistory) ? state.serverMetricsHistory : [];
  if (!history.length) {
    return [];
  }

  return history.map((entry) => {
    const metrics = entry?.snapshot?.[artifactId];
    if (!metrics || typeof metrics !== "object") {
      return 0;
    }
    const value = Number(metrics[metricKey] ?? 0);
    return Number.isFinite(value) ? value : 0;
  });
}

function renderSparklineSvg(values, options = {}) {
  const series = Array.isArray(values) ? values.slice(-SERVER_METRICS_HISTORY_LIMIT) : [];
  if (series.length < 2) {
    return "";
  }

  const width = 60;
  const height = 18;
  const pad = 1.5;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min;
  const stepX = series.length > 1 ? (width - pad * 2) / (series.length - 1) : 0;

  const points = series.map((value, index) => {
    const x = pad + stepX * index;
    const ratio = range === 0 ? 0.5 : (value - min) / range;
    const y = pad + (height - pad * 2) * (1 - ratio);
    return { x, y };
  });

  const d = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ");

  const toneClass = options.toneClass ? ` ${options.toneClass}` : "";
  return `
    <svg class="sparkline${toneClass}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path class="sparkline-path" d="${d}"></path>
    </svg>
  `;
}

function renderMetricSparkline(artifactId, metricKey) {
  const series = getServerMetricSeries(artifactId, metricKey);
  if (series.length < 2) {
    return "";
  }

  const prev = series[series.length - 2] ?? 0;
  const last = series[series.length - 1] ?? 0;
  const toneClass = last > prev ? "is-up" : last < prev ? "is-down" : "is-flat";
  const svg = renderSparklineSvg(series, { toneClass });
  if (!svg) {
    return "";
  }

  return `<span class="insight-sparkline" aria-hidden="true">${svg}</span>`;
}

function computeServerMetricDeltas(previousSnapshot = {}, nextMetrics = {}) {
  const deltas = {};
  const nextSnapshot = cloneServerMetricsSnapshot(nextMetrics);
  const artifactIds = new Set([...Object.keys(previousSnapshot), ...Object.keys(nextSnapshot)]);

  artifactIds.forEach((artifactId) => {
    const previous = ensureMetricsShape({
      ...createEmptyMetricsRecord(),
      ...(previousSnapshot[artifactId] ?? {})
    });
    const next = ensureMetricsShape({
      ...createEmptyMetricsRecord(),
      ...(nextSnapshot[artifactId] ?? {})
    });

    const metricDeltas = {};
    INSIGHTS_METRIC_DEFINITIONS.forEach((definition) => {
      metricDeltas[definition.key] = (next[definition.key] ?? 0) - (previous[definition.key] ?? 0);
    });
    deltas[artifactId] = metricDeltas;
  });

  return deltas;
}

function getMetricDeltaForArtifact(artifactId, metricKey) {
  if (!artifactId || !metricKey) {
    return null;
  }

  const artifactDeltas = state.serverMetricDeltas[artifactId];
  if (!artifactDeltas || !Object.prototype.hasOwnProperty.call(artifactDeltas, metricKey)) {
    return null;
  }

  const value = Number(artifactDeltas[metricKey]);
  return Number.isFinite(value) ? value : null;
}

function getArtifactMetrics(artifactId) {
  if (!artifactId) {
    return createEmptyMetricsRecord();
  }

  if (!state.sessionMetrics.artifacts[artifactId]) {
    state.sessionMetrics.artifacts[artifactId] = createEmptyMetricsRecord();
  }

  return ensureMetricsShape(state.sessionMetrics.artifacts[artifactId]);
}

function getDisplayMetricsForArtifact(artifactId) {
  const serverMetrics = state.serverMetrics[artifactId];
  if (serverMetrics && typeof serverMetrics === "object") {
    return ensureMetricsShape({ ...createEmptyMetricsRecord(), ...serverMetrics });
  }
  if (state.sessionMetrics.artifacts[artifactId]) {
    return ensureMetricsShape(state.sessionMetrics.artifacts[artifactId]);
  }
  return createEmptyMetricsRecord();
}

function applyMetricEventToRecord(record, eventName, details = {}) {
  if (!record) {
    return false;
  }

  ensureMetricsShape(record);

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

  if (eventName === "compare_pair_recorded") {
    record.compareSessions += 1;
    if (details.compareArtifactId) {
      const partnerId = details.compareArtifactId;
      record.comparePartnerCounts[partnerId] = (record.comparePartnerCounts[partnerId] ?? 0) + 1;
    }
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
  const compareArtifactId = payload.compareArtifactId ?? (state.compareEnabled ? state.compareArtifactId : null);
  updateSessionMetrics(eventName, {
    artifactId,
    hotspotId: payload.hotspotId ?? null,
    compareArtifactId
  });

  analytics.track(eventName, {
    artifactId: state.currentArtifactId,
    compareArtifactId: state.compareEnabled ? state.compareArtifactId : null,
    detailView: state.activeDetailView,
    ...payload
  });
}

function recordComparePair(primaryArtifactId, compareArtifactId, options = {}) {
  if (!primaryArtifactId || !compareArtifactId || primaryArtifactId === compareArtifactId) {
    return;
  }

  if (!artifactMap.has(primaryArtifactId) || !artifactMap.has(compareArtifactId)) {
    return;
  }

  const source = options.source ?? "compare_mode";
  trackEvent("compare_pair_recorded", {
    artifactId: primaryArtifactId,
    compareArtifactId,
    compareSource: source
  });
  setPreferredComparePartner(primaryArtifactId, compareArtifactId);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getActiveSearchTokens() {
  const normalized = normalizeSearchText(state.searchQuery);
  if (!normalized) {
    return [];
  }
  const seen = new Set();
  const tokens = [];
  normalized
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean)
    .forEach((token) => {
      if (seen.has(token)) {
        return;
      }
      seen.add(token);
      tokens.push(token);
    });
  return tokens.slice(0, 6);
}

function highlightText(value, tokens = []) {
  const text = String(value ?? "");
  if (!text) {
    return "";
  }
  if (!tokens.length) {
    return escapeHtml(text);
  }

  const ranges = buildHighlightRanges(text, tokens);
  if (!ranges.length) {
    return escapeHtml(text);
  }

  let cursor = 0;
  let html = "";
  ranges.forEach(([start, end]) => {
    if (start > cursor) {
      html += escapeHtml(text.slice(cursor, start));
    }
    html += `<mark class="search-highlight">${escapeHtml(text.slice(start, end))}</mark>`;
    cursor = end;
  });

  if (cursor < text.length) {
    html += escapeHtml(text.slice(cursor));
  }

  return html;
}

function buildHighlightRanges(text, tokens) {
  const lookup = createNormalizedLookup(text);
  if (!lookup.normalized.length) {
    return [];
  }

  const ranges = [];
  tokens.forEach((token) => {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      return;
    }
    let searchIndex = 0;
    while (searchIndex < lookup.normalized.length) {
      const matchIndex = lookup.normalized.indexOf(normalizedToken, searchIndex);
      if (matchIndex === -1) {
        break;
      }
      const start = lookup.indexMap[matchIndex] ?? 0;
      const lastMapIndex = matchIndex + normalizedToken.length - 1;
      const lastStart = lookup.indexMap[lastMapIndex] ?? start;
      const end = lastStart + getCodePointLengthAt(text, lastStart);
      ranges.push([start, end]);
      searchIndex = matchIndex + normalizedToken.length;
    }
  });

  return mergeHighlightRanges(ranges);
}

function createNormalizedLookup(text) {
  const normalizedChars = [];
  const indexMap = [];
  let offset = 0;
  for (const char of text) {
    const normalized = char.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    for (const normalizedChar of normalized.toLowerCase()) {
      normalizedChars.push(normalizedChar);
      indexMap.push(offset);
    }
    offset += char.length;
  }
  return {
    normalized: normalizedChars.join(""),
    indexMap
  };
}

function mergeHighlightRanges(ranges) {
  if (!ranges.length) {
    return [];
  }
  const sorted = ranges
    .map(([start, end]) => [Math.max(0, start), Math.max(start, end)])
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const merged = [];
  sorted.forEach(([start, end]) => {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push([start, end]);
      return;
    }
    if (start <= last[1]) {
      last[1] = Math.max(last[1], end);
      return;
    }
    merged.push([start, end]);
  });
  return merged;
}

function getCodePointLengthAt(text, index) {
  const code = text.codePointAt(index);
  if (!code) {
    return 1;
  }
  return code > 0xffff ? 2 : 1;
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
