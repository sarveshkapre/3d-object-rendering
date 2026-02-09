import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeOverridePayload, sanitizeModerationReason } from "../shared/cms.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.API_PORT || 8787);
const adminToken = process.env.ADMIN_TOKEN || "";
const storePath = process.env.API_STORE_PATH || resolve(__dirname, "data/store.local.json");

const BASE_STORE = {
  overrides: {},
  submissions: [],
  revisions: {},
  analytics: {
    events: [],
    artifacts: {}
  }
};
let storeCache = null;
let storeLoadPromise = null;
let storeMutationQueue = Promise.resolve();

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

function createId(prefix) {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

function parseAuthToken(req) {
  const header = req.headers.authorization || "";
  const [type, token] = header.split(" ");
  if (type?.toLowerCase() !== "bearer") {
    return "";
  }
  return token || "";
}

function checkModerationAuth(req, res) {
  if (!adminToken) {
    return true;
  }

  if (parseAuthToken(req) !== adminToken) {
    json(res, 401, {
      ok: false,
      error: "unauthorized"
    });
    return false;
  }

  return true;
}

function createArtifactCounter(seed = {}) {
  return {
    views: Number(seed.views || 0),
    hotspotOpens: Number(seed.hotspotOpens || 0),
    tourStarts: Number(seed.tourStarts || 0),
    tourLastStepReached: Number(seed.tourLastStepReached || 0),
    shares: Number(seed.shares || 0),
    compareViews: Number(seed.compareViews || 0),
    compareSessions: Number(seed.compareSessions || 0),
    hotspotCounts:
      typeof seed.hotspotCounts === "object" && seed.hotspotCounts ? { ...seed.hotspotCounts } : {},
    comparePartnerCounts:
      typeof seed.comparePartnerCounts === "object" && seed.comparePartnerCounts ? { ...seed.comparePartnerCounts } : {}
  };
}

function mergeOverride(existing, update) {
  const next = { ...existing };
  const allowed = ["title", "hook", "keywords", "story", "releaseYear", "featuredRank", "hotspots"];

  for (const key of allowed) {
    if (update[key] !== undefined) {
      next[key] = update[key];
    }
  }

  if (Array.isArray(next.keywords)) {
    next.keywords = next.keywords.filter((entry) => typeof entry === "string");
  }

  if (next.story && typeof next.story === "object") {
    const references = Array.isArray(next.story.references)
      ? next.story.references
          .filter((entry) => entry && typeof entry.label === "string" && typeof entry.url === "string")
          .map((entry) => ({ label: entry.label, url: entry.url }))
      : [];

    const body = Array.isArray(next.story.body) ? next.story.body.filter((entry) => typeof entry === "string") : [];

    next.story = {
      title: typeof next.story.title === "string" ? next.story.title : "",
      summary: typeof next.story.summary === "string" ? next.story.summary : "",
      body,
      references
    };
  }

  if (Array.isArray(next.hotspots)) {
    next.hotspots = next.hotspots
      .filter((entry) => entry && typeof entry.id === "string")
      .map((entry) => ({
        id: entry.id,
        label: typeof entry.label === "string" ? entry.label : "",
        title: typeof entry.title === "string" ? entry.title : "",
        body: typeof entry.body === "string" ? entry.body : "",
        reference: typeof entry.reference === "string" ? entry.reference : undefined
      }));
  }

  if (Object.prototype.hasOwnProperty.call(next, "releaseYear") && typeof next.releaseYear !== "number") {
    next.releaseYear = null;
  }

  if (Object.prototype.hasOwnProperty.call(next, "featuredRank") && typeof next.featuredRank !== "number") {
    next.featuredRank = null;
  }

  return next;
}

function normalizeStore(parsed) {
  return {
    overrides: typeof parsed.overrides === "object" && parsed.overrides ? parsed.overrides : {},
    submissions: Array.isArray(parsed.submissions)
      ? parsed.submissions.map((entry) => ({
          id: typeof entry.id === "string" ? entry.id : createId("sub"),
          artifactId: typeof entry.artifactId === "string" ? entry.artifactId : "",
          operation: entry.operation === "delete" ? "delete" : "upsert",
          override: entry.override && typeof entry.override === "object" ? entry.override : null,
          status: ["pending", "approved", "rejected"].includes(entry.status) ? entry.status : "pending",
          reason: typeof entry.reason === "string" ? entry.reason : "",
          createdAt: typeof entry.createdAt === "string" ? entry.createdAt : new Date().toISOString(),
          reviewedAt: typeof entry.reviewedAt === "string" ? entry.reviewedAt : null
        }))
      : [],
    revisions: typeof parsed.revisions === "object" && parsed.revisions ? parsed.revisions : {},
    analytics: {
      events: Array.isArray(parsed.analytics?.events) ? parsed.analytics.events : [],
      artifacts: typeof parsed.analytics?.artifacts === "object" && parsed.analytics?.artifacts ? parsed.analytics.artifacts : {}
    }
  };
}

async function loadStore() {
  if (storeCache) {
    return storeCache;
  }

  if (storeLoadPromise) {
    return storeLoadPromise;
  }

  storeLoadPromise = (async () => {
    await mkdir(dirname(storePath), { recursive: true });

    try {
      const raw = await readFile(storePath, "utf-8");
      const parsed = JSON.parse(raw);
      storeCache = normalizeStore(parsed);
    } catch {
      storeCache = structuredClone(BASE_STORE);
      await writeFile(storePath, JSON.stringify(storeCache, null, 2));
    }

    return storeCache;
  })();

  return storeLoadPromise;
}

async function persistStore() {
  if (!storeCache) {
    return;
  }
  await writeFile(storePath, JSON.stringify(storeCache, null, 2));
}

function queueStoreMutation(mutator) {
  const runMutation = async () => {
    const store = await loadStore();
    const result = await mutator(store);
    await persistStore();
    return result;
  };

  const task = storeMutationQueue.then(runMutation, runMutation);
  storeMutationQueue = task.then(
    () => undefined,
    () => undefined
  );
  return task;
}

async function getStoreSnapshot() {
  await storeMutationQueue;
  return await loadStore();
}

async function parseRequestBody(req) {
  return await new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      chunks.push(chunk);
      size += chunk.length;
      if (size > 5 * 1024 * 1024) {
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
  } else if (eventName === "share_link_copied" || eventName === "share_action_recorded") {
    existing.shares += 1;
  } else if (eventName === "compare_artifact_viewed") {
    existing.compareViews += 1;
  } else if (eventName === "compare_pair_recorded") {
    existing.compareSessions += 1;
    if (payload.compareArtifactId && typeof payload.compareArtifactId === "string") {
      const partnerId = payload.compareArtifactId;
      const current = existing.comparePartnerCounts[partnerId] || 0;
      existing.comparePartnerCounts[partnerId] = current + 1;
    }
  }

  store.analytics.artifacts[artifactId] = existing;
}

function appendRevision(store, artifactId, revision) {
  const current = Array.isArray(store.revisions[artifactId]) ? store.revisions[artifactId] : [];
  store.revisions[artifactId] = [revision, ...current].slice(0, 300);
}

function createSubmission({ artifactId, operation, override }) {
  return {
    id: createId("sub"),
    artifactId,
    operation,
    override,
    status: "pending",
    reason: "",
    createdAt: new Date().toISOString(),
    reviewedAt: null
  };
}

function getSubmissionPreview(submission, options = {}) {
  const preview = {
    id: submission.id,
    artifactId: submission.artifactId,
    operation: submission.operation,
    status: submission.status,
    reason: submission.reason,
    createdAt: submission.createdAt,
    reviewedAt: submission.reviewedAt
  };

  if (options.includeOverride) {
    preview.override = submission.override;
  }

  return preview;
}

function getRecentUpdates(store, options = {}) {
  const limit = Number.isFinite(options.limit) ? Math.max(1, Math.min(100, Number(options.limit))) : 20;
  const all = [];

  for (const [artifactId, revisions] of Object.entries(store.revisions)) {
    if (!Array.isArray(revisions)) {
      continue;
    }

    for (const revision of revisions) {
      if (!revision || typeof revision !== "object") {
        continue;
      }

      all.push({
        id: typeof revision.id === "string" ? revision.id : createId("rev"),
        artifactId: typeof revision.artifactId === "string" ? revision.artifactId : artifactId,
        action: typeof revision.action === "string" ? revision.action : "unknown",
        operation: typeof revision.operation === "string" ? revision.operation : "",
        reason: typeof revision.reason === "string" ? revision.reason : "",
        createdAt: typeof revision.createdAt === "string" ? revision.createdAt : new Date().toISOString()
      });
    }
  }

  return all
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, limit);
}

const server = createServer(async (req, res) => {
  const method = req.method || "GET";
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (method === "OPTIONS") {
    json(res, 204, {});
    return;
  }

  if (method === "GET" && url.pathname === "/api/health") {
    json(res, 200, {
      ok: true,
      now: new Date().toISOString(),
      adminProtected: Boolean(adminToken)
    });
    return;
  }

  if (method === "GET" && url.pathname === "/api/analytics/counters") {
    const store = await getStoreSnapshot();
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

      if (normalizedEvents.length) {
        await queueStoreMutation((store) => {
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
        });
      }

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
    const store = await getStoreSnapshot();
    json(res, 200, { overrides: store.overrides });
    return;
  }

  if (method === "GET" && url.pathname === "/api/cms/submissions") {
    const store = await getStoreSnapshot();
    const statusFilter = url.searchParams.get("status") || "pending";
    const includeOverride = url.searchParams.get("include") === "override";
    const submissions = store.submissions
      .filter((submission) => statusFilter === "all" || submission.status === statusFilter)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .map((submission) => getSubmissionPreview(submission, { includeOverride }));

    json(res, 200, {
      submissions
    });
    return;
  }

  if (method === "GET" && url.pathname === "/api/cms/recent-updates") {
    const store = await getStoreSnapshot();
    const limit = Number(url.searchParams.get("limit") || 20);
    const updates = getRecentUpdates(store, { limit });

    json(res, 200, {
      updates
    });
    return;
  }

  if (method === "GET" && url.pathname.startsWith("/api/cms/revisions/")) {
    const store = await getStoreSnapshot();
    const artifactId = decodeURIComponent(url.pathname.replace("/api/cms/revisions/", "")).trim();
    const revisions = Array.isArray(store.revisions[artifactId]) ? store.revisions[artifactId] : [];

    json(res, 200, {
      artifactId,
      revisions
    });
    return;
  }

  if (method === "PUT" && url.pathname.startsWith("/api/cms/overrides/")) {
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
      const override = sanitizeOverridePayload(mergeOverride({}, body));
      const submission = await queueStoreMutation((store) => {
        const nextSubmission = createSubmission({
          artifactId,
          operation: "upsert",
          override
        });

        store.submissions.push(nextSubmission);
        if (store.submissions.length > 3000) {
          store.submissions = store.submissions.slice(-3000);
        }

        return nextSubmission;
      });

      json(res, 200, {
        ok: true,
        submission: getSubmissionPreview(submission)
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
    const artifactId = decodeURIComponent(url.pathname.replace("/api/cms/overrides/", "")).trim();
    if (!artifactId) {
      json(res, 400, {
        ok: false,
        error: "artifact_id_required"
      });
      return;
    }

    const submission = createSubmission({
      artifactId,
      operation: "delete",
      override: null
    });

    await queueStoreMutation((store) => {
      store.submissions.push(submission);
      if (store.submissions.length > 3000) {
        store.submissions = store.submissions.slice(-3000);
      }
    });

    json(res, 200, {
      ok: true,
      submission: getSubmissionPreview(submission)
    });
    return;
  }

  if (method === "POST" && url.pathname.startsWith("/api/cms/submissions/") && url.pathname.endsWith("/approve")) {
    if (!checkModerationAuth(req, res)) {
      return;
    }

    const submissionId = decodeURIComponent(url.pathname.replace("/api/cms/submissions/", "").replace("/approve", "")).trim();
    const body = await parseRequestBody(req).catch(() => ({}));
    const reason = sanitizeModerationReason(typeof body.reason === "string" ? body.reason : "");
    const result = await queueStoreMutation((store) => {
      const submission = store.submissions.find((item) => item.id === submissionId);
      if (!submission || submission.status !== "pending") {
        return {
          ok: false,
          error: "pending_submission_not_found"
        };
      }

      const beforeOverride = store.overrides[submission.artifactId] ? structuredClone(store.overrides[submission.artifactId]) : null;
      let afterOverride = null;

      if (submission.operation === "delete") {
        delete store.overrides[submission.artifactId];
      } else {
        const merged = mergeOverride(beforeOverride ?? {}, submission.override ?? {});
        const sanitized = sanitizeOverridePayload(merged);
        store.overrides[submission.artifactId] = sanitized;
        afterOverride = structuredClone(sanitized);
      }

      submission.status = "approved";
      submission.reason = reason;
      submission.reviewedAt = new Date().toISOString();

      appendRevision(store, submission.artifactId, {
        id: createId("rev"),
        artifactId: submission.artifactId,
        action: "approve_submission",
        submissionId: submission.id,
        operation: submission.operation,
        reason,
        before: beforeOverride,
        after: afterOverride,
        createdAt: new Date().toISOString()
      });

      return {
        ok: true,
        submission: getSubmissionPreview(submission),
        override: afterOverride
      };
    });

    if (!result.ok) {
      json(res, 404, {
        ok: false,
        error: result.error
      });
      return;
    }

    json(res, 200, {
      ok: true,
      submission: result.submission,
      override: result.override
    });
    return;
  }

  if (method === "POST" && url.pathname.startsWith("/api/cms/submissions/") && url.pathname.endsWith("/reject")) {
    if (!checkModerationAuth(req, res)) {
      return;
    }

    const submissionId = decodeURIComponent(url.pathname.replace("/api/cms/submissions/", "").replace("/reject", "")).trim();
    const body = await parseRequestBody(req).catch(() => ({}));
    const reason = sanitizeModerationReason(typeof body.reason === "string" ? body.reason : "");
    const result = await queueStoreMutation((store) => {
      const submission = store.submissions.find((item) => item.id === submissionId);
      if (!submission || submission.status !== "pending") {
        return {
          ok: false,
          error: "pending_submission_not_found"
        };
      }

      submission.status = "rejected";
      submission.reason = reason;
      submission.reviewedAt = new Date().toISOString();

      return {
        ok: true,
        submission: getSubmissionPreview(submission)
      };
    });

    if (!result.ok) {
      json(res, 404, {
        ok: false,
        error: result.error
      });
      return;
    }

    json(res, 200, {
      ok: true,
      submission: result.submission
    });
    return;
  }

  if (method === "POST" && url.pathname.startsWith("/api/cms/revisions/") && url.pathname.endsWith("/restore")) {
    if (!checkModerationAuth(req, res)) {
      return;
    }

    const pathWithoutPrefix = url.pathname.replace("/api/cms/revisions/", "").replace("/restore", "");
    const [artifactIdRaw, revisionIdRaw] = pathWithoutPrefix.split("/");
    const artifactId = decodeURIComponent(artifactIdRaw || "").trim();
    const revisionId = decodeURIComponent(revisionIdRaw || "").trim();
    const body = await parseRequestBody(req).catch(() => ({}));
    const reason = sanitizeModerationReason(typeof body.reason === "string" ? body.reason : "");
    const result = await queueStoreMutation((store) => {
      const revisions = Array.isArray(store.revisions[artifactId]) ? store.revisions[artifactId] : [];
      const revision = revisions.find((entry) => entry.id === revisionId);

      if (!revision) {
        return {
          ok: false,
          error: "revision_not_found"
        };
      }

      const beforeOverride = store.overrides[artifactId] ? structuredClone(store.overrides[artifactId]) : null;
      const afterOverride = revision.after ? structuredClone(sanitizeOverridePayload(revision.after)) : null;

      if (afterOverride) {
        store.overrides[artifactId] = afterOverride;
      } else {
        delete store.overrides[artifactId];
      }

      appendRevision(store, artifactId, {
        id: createId("rev"),
        artifactId,
        action: "restore_revision",
        sourceRevisionId: revisionId,
        reason,
        before: beforeOverride,
        after: afterOverride,
        createdAt: new Date().toISOString()
      });

      return {
        ok: true,
        artifactId,
        revisionId,
        override: afterOverride
      };
    });

    if (!result.ok) {
      json(res, 404, {
        ok: false,
        error: result.error
      });
      return;
    }

    json(res, 200, {
      ok: true,
      artifactId: result.artifactId,
      revisionId: result.revisionId,
      override: result.override
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
