import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
      // keep retrying until timeout
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 120));
  }
  throw new Error(`Timed out waiting for ${url}/api/health`);
}

let apiProcess = null;
let tempDir = "";

try {
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  tempDir = await mkdtemp(join(tmpdir(), "artifact-viewer-smoke-"));
  const storePath = join(tempDir, "store.json");

  apiProcess = spawn(process.execPath, ["server/index.js"], {
    env: {
      ...process.env,
      API_PORT: String(port),
      API_STORE_PATH: storePath
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  apiProcess.stdout.pipe(process.stdout);
  apiProcess.stderr.pipe(process.stderr);

  await waitForHealth(baseUrl);

  const healthResponse = await fetch(`${baseUrl}/api/health`);
  if (!healthResponse.ok) {
    throw new Error(`Health check failed with status ${healthResponse.status}`);
  }
  console.log("smoke: health endpoint ok");

  const ingestResponse = await fetch(`${baseUrl}/api/analytics/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      events: [
        {
          event: "artifact_viewed",
          payload: { artifactId: "smoke-artifact" }
        }
      ]
    })
  });

  if (!ingestResponse.ok) {
    throw new Error(`Analytics ingest failed with status ${ingestResponse.status}`);
  }
  console.log("smoke: analytics ingest ok");

  const countersResponse = await fetch(`${baseUrl}/api/analytics/counters`);
  if (!countersResponse.ok) {
    throw new Error(`Counters read failed with status ${countersResponse.status}`);
  }
  const countersPayload = await countersResponse.json();
  const views = countersPayload.artifacts?.["smoke-artifact"]?.views ?? 0;
  if (views !== 1) {
    throw new Error(`Expected 1 view in counters, received ${views}`);
  }
  console.log("smoke: counters endpoint ok");
} catch (error) {
  console.error("smoke: failed", error);
  process.exitCode = 1;
} finally {
  if (apiProcess && !apiProcess.killed) {
    await new Promise((resolveExit) => {
      apiProcess.once("exit", () => resolveExit());
      apiProcess.kill("SIGTERM");
    });
  }

  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
}
