const SESSION_STORAGE_KEY = "artifact_viewer_session_id";

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  const random = Math.random().toString(36).slice(2, 12);
  return `sess_${Date.now().toString(36)}_${random}`;
}

function getSessionId() {
  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) {
      return existing;
    }

    const id = createId();
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, id);
    return id;
  } catch {
    return createId();
  }
}

function sanitizePayload(payload) {
  const result = {};

  for (const [key, value] of Object.entries(payload ?? {})) {
    if (value === undefined) {
      continue;
    }

    if (typeof value === "string") {
      result[key] = value.slice(0, 280);
      continue;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      result[key] = value;
      continue;
    }

    if (value === null) {
      result[key] = null;
      continue;
    }

    if (Array.isArray(value)) {
      result[key] = value.slice(0, 20).map((entry) => (typeof entry === "string" ? entry.slice(0, 100) : entry));
    }
  }

  return result;
}

export function createAnalyticsTracker(options = {}) {
  const endpoint = options.endpoint ?? "";
  const debug = Boolean(options.debug);
  const flushIntervalMs = options.flushIntervalMs ?? 8000;
  const batchSize = options.batchSize ?? 20;
  const maxQueueSize = options.maxQueueSize ?? 200;

  const sessionId = getSessionId();
  const queue = [];

  let flushTimer = null;
  let flushing = false;

  function writeDebug(...args) {
    if (!debug) {
      return;
    }
    console.debug("[analytics]", ...args);
  }

  function appendLocalBatch(batch) {
    const existing = Array.isArray(window.__artifactAnalytics) ? window.__artifactAnalytics : [];
    window.__artifactAnalytics = [...existing, ...batch].slice(-500);
  }

  async function flush(options = {}) {
    if (flushing || queue.length === 0) {
      return;
    }

    flushing = true;
    const batch = queue.splice(0, batchSize);

    const payload = {
      app: options.app ?? "artifact-viewer",
      version: options.version ?? "dev",
      sessionId,
      sentAt: new Date().toISOString(),
      page: {
        href: window.location.href,
        path: window.location.pathname
      },
      events: batch
    };

    if (!endpoint) {
      appendLocalBatch(batch);
      writeDebug("captured locally", batch);
      flushing = false;
      return;
    }

    const body = JSON.stringify(payload);

    try {
      const shouldUseBeacon = options.useBeacon === true && typeof navigator.sendBeacon === "function";
      if (shouldUseBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        const sent = navigator.sendBeacon(endpoint, blob);
        if (sent) {
          flushing = false;
          return;
        }
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: options.useBeacon === true
      });

      if (!response.ok) {
        throw new Error(`analytics endpoint returned ${response.status}`);
      }
    } catch (error) {
      queue.unshift(...batch);
      writeDebug("flush failed", error);
    } finally {
      flushing = false;
    }
  }

  function track(eventName, payload = {}) {
    if (!eventName) {
      return;
    }

    const event = {
      event: eventName,
      at: new Date().toISOString(),
      payload: sanitizePayload(payload)
    };

    queue.push(event);

    if (queue.length > maxQueueSize) {
      queue.splice(0, queue.length - maxQueueSize);
    }

    writeDebug(event);

    if (queue.length >= batchSize) {
      void flush();
    }
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "hidden") {
      void flush({ useBeacon: true });
    }
  }

  function start() {
    flushTimer = window.setInterval(() => {
      void flush();
    }, flushIntervalMs);

    window.addEventListener("pagehide", () => {
      void flush({ useBeacon: true });
    });
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }

  function shutdown() {
    if (flushTimer) {
      window.clearInterval(flushTimer);
      flushTimer = null;
    }

    document.removeEventListener("visibilitychange", handleVisibilityChange);
    void flush({ useBeacon: true });
  }

  start();

  return {
    track,
    flush,
    shutdown,
    getSessionId: () => sessionId,
    getQueueSize: () => queue.length
  };
}
