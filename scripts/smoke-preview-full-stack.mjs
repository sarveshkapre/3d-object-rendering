import { spawn } from "node:child_process";
import net from "node:net";

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("port_unavailable")));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function waitForHttpOk(url, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 30000;
  const start = Date.now();
  let lastError = null;

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { method: "GET", cache: "no-store" });
      if (response.ok) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }

  throw lastError || new Error("timeout");
}

function spawnProcess(label, command, args, options) {
  const child = spawn(command, args, {
    ...options,
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[${label}] ${chunk}`);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[${label}] ${chunk}`);
  });

  return child;
}

let previewProc = null;

async function main() {
  const rootDir = new URL("..", import.meta.url).pathname;
  const apiPort = await getAvailablePort();
  const webPort = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${webPort}`;

  const env = {
    ...process.env,
    API_PORT: String(apiPort),
    PREVIEW_PORT: String(webPort)
  };

  const cleanup = async (exitCode) => {
    if (previewProc && !previewProc.killed) {
      await new Promise((resolveExit) => {
        previewProc.once("exit", () => resolveExit());
        previewProc.kill("SIGTERM");
      });
    }
    previewProc = null;
    if (typeof exitCode === "number") {
      process.exit(exitCode);
    }
  };

  process.on("SIGINT", () => void cleanup(130));
  process.on("SIGTERM", () => void cleanup(143));

  try {
    previewProc = spawnProcess("preview:full", "node", ["scripts/preview-full-stack.mjs"], { cwd: rootDir, env });

    const htmlResponse = await waitForHttpOk(`${baseUrl}/`, { timeoutMs: 45000 });
    const html = await htmlResponse.text();
    if (!html.includes("<title>Artifact Viewer</title>")) {
      throw new Error("preview_html_missing_title");
    }
    console.log("smoke: preview / ok");

    const healthResponse = await waitForHttpOk(`${baseUrl}/api/health`, { timeoutMs: 45000 });
    const payload = await healthResponse.json().catch(() => null);
    if (!payload || payload.ok !== true) {
      throw new Error("preview_api_health_unexpected");
    }
    console.log("smoke: preview /api/health ok");
  } catch (error) {
    console.error("smoke:preview:full failed", error);
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
}

await main();

