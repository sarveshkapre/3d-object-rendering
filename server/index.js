import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.API_PORT || 8787);
const adminToken = process.env.ADMIN_TOKEN || "";
const storePath = process.env.API_STORE_PATH || resolve(__dirname, "data/store.local.json");

const BASE_STORE = {
  overrides: {},
  analytics: {
    events: [],
    artifacts: {}
  }
};

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,authorization"
  });
  res.end(body);
}

async function ensureStore() {
  await mkdir(resolve(__dirname, "data"), { recursive: true });

  try {
    const raw = await readFile(storePath, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      overrides: parsed.overrides ?? {},
      analytics: {
        events: Array.isArray(parsed.analytics?.events) ? parsed.analytics.events : [],
        artifacts: typeof parsed.analytics?.artifacts === "object" && parsed.analytics?.artifacts ? parsed.analytics.artifacts : {}
      }
    };
  } catch {
    await writeFile(storePath, JSON.stringify(BASE_STORE, null, 2));
    return structuredClone(BASE_STORE);
  }
}

async function saveStore(store) {
  await writeFile(storePath, JSON.stringify(store, null, 2));
}

function parseAuthToken(req) {
  const header = req.headers.authorization || "";
  const [type, token] = header.split(" ");
  if (type?.toLowerCase() !== "bearer") {
    return "";
  }
  return token || "";
}

function createArtifactCounter(seed = {}) {
  return {
    views: Number(seed.views || 0),
    hotspotOpens: Number(seed.hotspotOpens || 0),
    tourStarts: Number(seed.tourStarts || 0),
    tourLastStepReached: Number(seed.tourLastStepReached || 0),
    shares: Number(seed.shares || 0),
    compareViews: Number(seed.compareViews || 0),
    hotspotCounts: typeof seed.hotspotCounts === "object" && seed.hotspotCounts ? seed.hotspotCounts : {}
  };
}

async function parseRequestBody(req) {
  return await new Promise((resolveBody, reject) => {
    const chunks = [];

    req.on("data", (chunk) => {
      chunks.push(chunk);
      if (chunks.reduce((sum, item) => sum + item.length, 0) > 5 * 1024 * 1024) {
        reject(new Error("payload_too_large"));
      }
    });

    req.on("end", () => {
      if (!chunks.length) {
        resolveBody({});
        return;
      }

      try {
        const raw = Buffer.concat(chunks).toString("utf-8");
        resolveBody(JSON.parse(raw));
      } catch {
        reject(new Error("invalid_json"));
      }
    });

    req.on("error", (error) => reject(error));
  });
}

function applyAnalyticsEvent(store, event) {
  const eventName = event?.event;
  const payload = event?.payload ?? {};
  const artifactId = payload.artifactId;

  if (!artifactId || typeof artifactId !== "string") {
    return;
  }

  const existing = createArtifactCounter(store.analytics.artifacts[artifactId]);

  if (eventName === "artifact_viewed") {
    existing.views += 1;
  } else if (eventName === "hotspot_opened") {
    existing.hotspotOpens += 1;
    if (payload.hotspotId && typeof payload.hotspotId === "string") {
      existing.hotspotCounts[payload.hotspotId] = (existing.hotspotCounts[payload.hotspotId] || 0) + 1;
    }
  } else if (eventName === "tour_started") {
    existing.tourStarts += 1;
  } else if (eventName === "tour_last_step_reached") {
    existing.tourLastStepReached += 1;
  } else if (eventName === "share_link_copied") {
    existing.shares += 1;
  } else if (eventName === "compare_artifact_viewed") {
    existing.compareViews += 1;
  }

  store.analytics.artifacts[artifactId] = existing;
}

function mergeOverride(existing, update) {
  const next = { ...existing };
  const allowed = ["title", "hook", "keywords", "story", "releaseYear", "featuredRank"];

  for (const key of allowed) {
    if (update[key] !== undefined) {
      next[key] = update[key];
    }
  }

  return next;
}

const server = createServer(async (req, res) => {
  const method = req.method || "GET";
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (method === "OPTIONS") {
    json(res, 204, {});
    return;
  }

  const store = await ensureStore();

  if (method === "GET" && url.pathname === "/api/health") {
    json(res, 200, {
      ok: true,
      now: new Date().toISOString(),
      adminProtected: Boolean(adminToken)
    });
    return;
  }

  if (method === "GET" && url.pathname === "/api/analytics/counters") {
    json(res, 200, {
      artifacts: store.analytics.artifacts,
      eventsStored: store.analytics.events.length
    });
    return;
  }

  if (method === "POST" && url.pathname === "/api/analytics/ingest") {
    try {
      const body = await parseRequestBody(req);
      const events = Array.isArray(body.events) ? body.events : [];

      const normalizedEvents = events
        .map((event) => ({
          event: typeof event?.event === "string" ? event.event : "",
          at: typeof event?.at === "string" ? event.at : new Date().toISOString(),
          payload: typeof event?.payload === "object" && event?.payload ? event.payload : {}
        }))
        .filter((event) => Boolean(event.event));

      for (const event of normalizedEvents) {
        applyAnalyticsEvent(store, event);
      }

      store.analytics.events.push(
        ...normalizedEvents.map((event) => ({
          ...event,
          receivedAt: new Date().toISOString()
        }))
      );

      if (store.analytics.events.length > 3000) {
        store.analytics.events = store.analytics.events.slice(-3000);
      }

      await saveStore(store);

      json(res, 200, {
        ok: true,
        ingested: normalizedEvents.length
      });
    } catch (error) {
      json(res, 400, {
        ok: false,
        error: error.message
      });
    }
    return;
  }

  if (method === "GET" && url.pathname === "/api/cms/overrides") {
    json(res, 200, { overrides: store.overrides });
    return;
  }

  if (method === "PUT" && url.pathname.startsWith("/api/cms/overrides/")) {
    if (adminToken && parseAuthToken(req) !== adminToken) {
      json(res, 401, {
        ok: false,
        error: "unauthorized"
      });
      return;
    }

    const artifactId = decodeURIComponent(url.pathname.replace("/api/cms/overrides/", "")).trim();
    if (!artifactId) {
      json(res, 400, {
        ok: false,
        error: "artifact_id_required"
      });
      return;
    }

    try {
      const body = await parseRequestBody(req);
      const nextOverride = mergeOverride(store.overrides[artifactId] ?? {}, body);
      store.overrides[artifactId] = nextOverride;
      await saveStore(store);

      json(res, 200, {
        ok: true,
        artifactId,
        override: nextOverride
      });
    } catch (error) {
      json(res, 400, {
        ok: false,
        error: error.message
      });
    }
    return;
  }

  if (method === "DELETE" && url.pathname.startsWith("/api/cms/overrides/")) {
    if (adminToken && parseAuthToken(req) !== adminToken) {
      json(res, 401, {
        ok: false,
        error: "unauthorized"
      });
      return;
    }

    const artifactId = decodeURIComponent(url.pathname.replace("/api/cms/overrides/", "")).trim();
    delete store.overrides[artifactId];
    await saveStore(store);

    json(res, 200, {
      ok: true,
      artifactId
    });
    return;
  }

  json(res, 404, {
    ok: false,
    error: "not_found"
  });
});

server.listen(port, () => {
  console.log(`api server listening on http://localhost:${port}`);
});
