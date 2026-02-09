import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

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

async function waitForHealth(baseUrl, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/health`, { cache: "no-store" });
      if (response.ok) {
        return;
      }
    } catch {
      // keep polling
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 120));
  }
  throw new Error(`Timed out waiting for API health at ${baseUrl}`);
}

async function requestJson(baseUrl, pathname, options = {}) {
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
  return { response, body };
}

async function withServer(envOverrides, run) {
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const tempDir = await mkdtemp(join(tmpdir(), "artifact-viewer-api-retention-"));
  const storePath = join(tempDir, "store.json");

  const apiProcess = spawn(process.execPath, ["server/index.js"], {
    env: {
      ...process.env,
      API_PORT: String(port),
      API_STORE_PATH: storePath,
      ...envOverrides
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

  try {
    await run({ baseUrl });
  } finally {
    if (!apiProcess.killed) {
      const exited = new Promise((resolveExit) => apiProcess.once("exit", () => resolveExit()));
      apiProcess.kill("SIGTERM");
      await exited;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("analytics retention: allow disabling raw event storage", async () => {
  await withServer(
    {
      API_ANALYTICS_STORE_EVENTS: "0",
      API_ANALYTICS_EVENTS_MAX: "3000"
    },
    async ({ baseUrl }) => {
      const artifactId = "artifact-retention-events-off";
      const ingested = await requestJson(baseUrl, "/api/analytics/ingest", {
        method: "POST",
        body: {
          events: [
            { event: "artifact_viewed", payload: { artifactId } },
            { event: "hotspot_opened", payload: { artifactId, hotspotId: "h1" } }
          ]
        }
      });
      assert.equal(ingested.response.status, 200);
      assert.equal(ingested.body.ok, true);

      const counters = await requestJson(baseUrl, "/api/analytics/counters");
      assert.equal(counters.response.status, 200);
      assert.equal(counters.body.eventsStored, 0);
      assert.equal(counters.body.artifacts[artifactId].views, 1);
      assert.equal(counters.body.artifacts[artifactId].hotspotOpens, 1);
    }
  );
});

test("analytics retention: max events cap is configurable", async () => {
  await withServer(
    {
      API_ANALYTICS_STORE_EVENTS: "1",
      API_ANALYTICS_EVENTS_MAX: "10"
    },
    async ({ baseUrl }) => {
      const artifactId = "artifact-retention-events-max";
      const writes = Array.from({ length: 12 }, () =>
        requestJson(baseUrl, "/api/analytics/ingest", {
          method: "POST",
          body: { events: [{ event: "artifact_viewed", payload: { artifactId } }] }
        })
      );
      await Promise.all(writes);

      const counters = await requestJson(baseUrl, "/api/analytics/counters");
      assert.equal(counters.response.status, 200);
      assert.equal(counters.body.eventsStored, 10);
      assert.equal(counters.body.artifacts[artifactId].views, 12);
    }
  );
});

test("cms retention: submissions cap is configurable", async () => {
  await withServer(
    {
      API_CMS_SUBMISSIONS_MAX: "2"
    },
    async ({ baseUrl }) => {
      const created = [];
      for (let i = 0; i < 3; i += 1) {
        const response = await requestJson(baseUrl, `/api/cms/overrides/artifact-retention-${i}`, {
          method: "PUT",
          body: { title: `Title ${i}` }
        });
        assert.equal(response.response.status, 200);
        created.push(response.body.submission.id);
      }

      const submissions = await requestJson(baseUrl, "/api/cms/submissions?status=pending");
      assert.equal(submissions.response.status, 200);
      assert.equal(submissions.body.submissions.length, 2);
      assert.equal(submissions.body.submissions.some((entry) => entry.id === created[0]), false);
      assert.equal(submissions.body.submissions.some((entry) => entry.id === created[2]), true);
    }
  );
});

