import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const ADMIN_TOKEN = "test-admin-token";

let apiProcess = null;
let baseUrl = "";
let tempDir = "";
let storePath = "";

async function getAvailablePort() {
  return await new Promise((resolvePort, reject) => {
    const server = createNetServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolvePort(port);
      });
    });
  });
}

async function waitForHealth(url, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${url}/api/health`, { cache: "no-store" });
      if (response.ok) {
        return;
      }
    } catch {
      // Continue polling until timeout.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 120));
  }
  throw new Error(`Timed out waiting for API health at ${url}`);
}

async function requestJson(pathname, options = {}) {
  const headers = {
    ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
    ...(options.headers ?? {})
  };
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  const body = await response.json();
  return {
    response,
    body
  };
}

async function startServer() {
  const port = await getAvailablePort();
  tempDir = await mkdtemp(join(tmpdir(), "artifact-viewer-api-test-"));
  storePath = join(tempDir, "store.json");
  baseUrl = `http://127.0.0.1:${port}`;

  apiProcess = spawn(process.execPath, ["server/index.js"], {
    env: {
      ...process.env,
      API_PORT: String(port),
      API_STORE_PATH: storePath,
      ADMIN_TOKEN
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let bootOutput = "";
  apiProcess.stdout.on("data", (chunk) => {
    bootOutput += chunk.toString();
  });
  apiProcess.stderr.on("data", (chunk) => {
    bootOutput += chunk.toString();
  });

  apiProcess.once("exit", (code, signal) => {
    if (code !== 0 && signal !== "SIGTERM") {
      console.error(`API server exited early with code=${code} signal=${signal}\n${bootOutput}`);
    }
  });

  await waitForHealth(baseUrl);
}

async function stopServer() {
  if (apiProcess && !apiProcess.killed) {
    const processToStop = apiProcess;
    const exited = new Promise((resolveExit) => {
      processToStop.once("exit", () => resolveExit());
    });
    processToStop.kill("SIGTERM");
    await exited;
  }
  apiProcess = null;

  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test.before(async () => {
  await startServer();
});

test.after(async () => {
  await stopServer();
});

test("analytics counters accumulate parallel ingests", async () => {
  const artifactId = "artifact-concurrency";
  const parallelWrites = 30;

  const writes = Array.from({ length: parallelWrites }, (_, index) =>
    requestJson("/api/analytics/ingest", {
      method: "POST",
      body: {
        events: [
          {
            event: "artifact_viewed",
            payload: { artifactId }
          },
          {
            event: "hotspot_opened",
            payload: {
              artifactId,
              hotspotId: `hotspot-${index % 3}`
            }
          }
        ]
      }
    })
  );

  const responses = await Promise.all(writes);
  for (const { response, body } of responses) {
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.ingested, 2);
  }

  const counters = await requestJson("/api/analytics/counters");
  assert.equal(counters.response.status, 200);
  assert.equal(counters.body.artifacts[artifactId].views, parallelWrites);
  assert.equal(counters.body.artifacts[artifactId].hotspotOpens, parallelWrites);
  assert.ok(counters.body.eventsStored >= parallelWrites * 2);
});

test("cms submission approve/delete/restore lifecycle works with auth", async () => {
  const artifactId = "artifact-cms";
  const overridePayload = {
    title: "Recovered Artifact Title",
    hook: "A preserved lifecycle test artifact."
  };

  const createSubmission = await requestJson(`/api/cms/overrides/${artifactId}`, {
    method: "PUT",
    body: overridePayload
  });
  assert.equal(createSubmission.response.status, 200);
  assert.equal(createSubmission.body.ok, true);
  const submissionId = createSubmission.body.submission.id;
  assert.ok(submissionId);

  const pending = await requestJson("/api/cms/submissions?status=pending&include=override");
  assert.equal(pending.response.status, 200);
  assert.ok(pending.body.submissions.some((entry) => entry.id === submissionId));

  const unauthorizedApprove = await requestJson(`/api/cms/submissions/${submissionId}/approve`, {
    method: "POST",
    body: { reason: "should fail without token" }
  });
  assert.equal(unauthorizedApprove.response.status, 401);

  const approved = await requestJson(`/api/cms/submissions/${submissionId}/approve`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${ADMIN_TOKEN}`
    },
    body: { reason: "approved in test" }
  });
  assert.equal(approved.response.status, 200);
  assert.equal(approved.body.ok, true);
  assert.equal(approved.body.override.title, overridePayload.title);

  const liveOverrides = await requestJson("/api/cms/overrides");
  assert.equal(liveOverrides.response.status, 200);
  assert.equal(liveOverrides.body.overrides[artifactId].title, overridePayload.title);

  const deleteSubmission = await requestJson(`/api/cms/overrides/${artifactId}`, {
    method: "DELETE"
  });
  assert.equal(deleteSubmission.response.status, 200);
  const deleteSubmissionId = deleteSubmission.body.submission.id;

  const deleteApproved = await requestJson(`/api/cms/submissions/${deleteSubmissionId}/approve`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${ADMIN_TOKEN}`
    },
    body: { reason: "approve delete in test" }
  });
  assert.equal(deleteApproved.response.status, 200);

  const removedOverrides = await requestJson("/api/cms/overrides");
  assert.equal(removedOverrides.response.status, 200);
  assert.equal(removedOverrides.body.overrides[artifactId], undefined);

  const revisionsResponse = await requestJson(`/api/cms/revisions/${artifactId}`);
  assert.equal(revisionsResponse.response.status, 200);
  const revisionToRestore = revisionsResponse.body.revisions.find(
    (revision) => revision.action === "approve_submission" && revision.operation === "upsert" && revision.after?.title === overridePayload.title
  );
  assert.ok(revisionToRestore);

  const restored = await requestJson(`/api/cms/revisions/${artifactId}/${revisionToRestore.id}/restore`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${ADMIN_TOKEN}`
    },
    body: { reason: "restore in test" }
  });
  assert.equal(restored.response.status, 200);
  assert.equal(restored.body.override.title, overridePayload.title);

  const restoredOverrides = await requestJson("/api/cms/overrides");
  assert.equal(restoredOverrides.response.status, 200);
  assert.equal(restoredOverrides.body.overrides[artifactId].title, overridePayload.title);
});
