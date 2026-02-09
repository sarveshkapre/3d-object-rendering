import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import { extname, join, resolve } from "node:path";

function getAvailablePort() {
  return new Promise((resolvePort, reject) => {
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
      server.close(() => resolvePort(port));
    });
  });
}

async function waitForHttpOk(url, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 30000;
  const start = Date.now();
  let lastError = null;

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok) {
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }

  throw lastError || new Error("timeout");
}

function getContentType(pathname) {
  const ext = extname(pathname).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".glb") return "model/gltf-binary";
  if (ext === ".woff2") return "font/woff2";
  if (ext === ".map") return "application/json; charset=utf-8";
  return "application/octet-stream";
}

async function fileExists(pathname) {
  try {
    await access(pathname);
    return true;
  } catch {
    return false;
  }
}

function isProbablySpaRoute(pathname) {
  if (!pathname || pathname === "/") return true;
  return !pathname.includes(".");
}

async function readRequestBody(req) {
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
    req.on("end", () => resolveBody(chunks.length ? Buffer.concat(chunks) : null));
    req.on("error", (error) => reject(error));
  });
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

async function proxyApiRequest(req, res, apiBaseUrl) {
  const targetUrl = new URL(req.url || "/", apiBaseUrl);

  const headers = { ...req.headers };
  delete headers.connection;
  delete headers.host;

  let body = null;
  if (!["GET", "HEAD"].includes((req.method || "GET").toUpperCase())) {
    body = await readRequestBody(req);
  }

  const response = await fetch(targetUrl, {
    method: req.method || "GET",
    headers,
    body: body ?? undefined
  });

  const outHeaders = {};
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "transfer-encoding") {
      return;
    }
    outHeaders[key] = value;
  });

  res.writeHead(response.status, outHeaders);
  const buffer = Buffer.from(await response.arrayBuffer());
  res.end(buffer);
}

async function main() {
  const rootDir = new URL("..", import.meta.url).pathname;
  const distDir = resolve(rootDir, "dist");
  const indexPath = join(distDir, "index.html");

  const distExists = await fileExists(indexPath);
  if (!distExists) {
    console.error("preview:full missing dist/ output. Run `npm run build` first.");
    process.exitCode = 1;
    return;
  }

  const apiPort = process.env.API_PORT ? Number(process.env.API_PORT) : await getAvailablePort();
  const webPort = process.env.PREVIEW_PORT ? Number(process.env.PREVIEW_PORT) : await getAvailablePort();
  const apiBaseUrl = `http://127.0.0.1:${apiPort}`;

  const env = {
    ...process.env,
    API_PORT: String(apiPort)
  };

  let apiProc = null;
  let webServer = null;

  const cleanup = async () => {
    if (webServer) {
      try {
        await new Promise((resolveClose) => webServer.close(() => resolveClose()));
      } catch {
        // ignore
      }
      webServer = null;
    }

    if (apiProc) {
      apiProc.kill("SIGTERM");
      apiProc = null;
    }
  };

  process.on("SIGINT", () => {
    void cleanup().finally(() => process.exit(130));
  });
  process.on("SIGTERM", () => {
    void cleanup().finally(() => process.exit(143));
  });

  try {
    apiProc = spawnProcess("api", "node", ["server/index.js"], { cwd: rootDir, env });
    await waitForHttpOk(`${apiBaseUrl}/api/health`, { timeoutMs: 30000 });

    webServer = http.createServer(async (req, res) => {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const pathname = url.pathname || "/";

      if (pathname.startsWith("/api/")) {
        try {
          await proxyApiRequest(req, res, apiBaseUrl);
        } catch (error) {
          res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ok: false, error: String(error && error.message ? error.message : error) }));
        }
        return;
      }

      const decoded = decodeURIComponent(pathname);
      const relative = decoded.replace(/^\//, "");
      const candidate = resolve(distDir, relative || "index.html");

      // Prevent path traversal: ensure resolved path stays within distDir.
      if (!candidate.startsWith(distDir)) {
        res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
        res.end("bad request");
        return;
      }

      let filePath = candidate;
      if (!(await fileExists(filePath))) {
        if (isProbablySpaRoute(decoded)) {
          filePath = indexPath;
        } else {
          res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
          res.end("not found");
          return;
        }
      }

      res.writeHead(200, {
        "content-type": getContentType(filePath),
        "cache-control": "no-store"
      });
      createReadStream(filePath).pipe(res);
    });

    await new Promise((resolveListen, rejectListen) => {
      webServer.once("error", rejectListen);
      webServer.listen(webPort, "127.0.0.1", () => resolveListen());
    });

    console.log(`preview:full ready at http://127.0.0.1:${webPort} (api proxied to ${apiBaseUrl})`);
  } catch (error) {
    console.error("preview:full failed", error);
    process.exitCode = 1;
    await cleanup();
  }
}

await main();

