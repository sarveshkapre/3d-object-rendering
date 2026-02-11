import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
      const response = await fetch(url, { method: "GET" });
      if (response.ok) {
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
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

async function main() {
  const rootDir = new URL("..", import.meta.url).pathname;
  const apiPort = await getAvailablePort();
  const webPort = await getAvailablePort();
  const tempDir = await mkdtemp(join(tmpdir(), "artifact-viewer-kiosk-smoke-"));
  const storePath = join(tempDir, "store.json");
  const keepArtifacts = process.env.KEEP_SMOKE_ARTIFACTS === "1";

  const env = {
    ...process.env,
    API_PORT: String(apiPort),
    API_STORE_PATH: storePath
  };

  let apiProc = null;
  let viteProc = null;
  let browser = null;

  const cleanup = async () => {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore
      }
      browser = null;
    }

    if (viteProc) {
      viteProc.kill("SIGTERM");
      viteProc = null;
    }

    if (apiProc) {
      apiProc.kill("SIGTERM");
      apiProc = null;
    }

    if (!keepArtifacts) {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
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
    await waitForHttpOk(`http://127.0.0.1:${apiPort}/api/health`, { timeoutMs: 30000 });

    viteProc = spawnProcess(
      "vite",
      "npx",
      ["vite", "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"],
      { cwd: rootDir, env }
    );
    await waitForHttpOk(`http://127.0.0.1:${webPort}/`, { timeoutMs: 45000 });

    let playwright;
    try {
      playwright = await import("playwright-core");
    } catch (error) {
      throw new Error(
        "playwright_unavailable: install dev deps via `npm install` and ensure `playwright-core` is present."
      );
    }

    const channel = process.env.PLAYWRIGHT_CHANNEL || "chrome";
    const headless = process.env.HEADFUL !== "1";
    const slowMo = Number(process.env.SLOWMO || 0) || 0;

    browser = await playwright.chromium.launch({
      channel,
      headless,
      slowMo,
      args: ["--use-gl=swiftshader", "--disable-dev-shm-usage"]
    });

    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();

    const consoleErrors = [];
    page.on("pageerror", (error) => {
      consoleErrors.push(`pageerror: ${String(error && error.message ? error.message : error)}`);
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(`console.error: ${message.text()}`);
      }
    });

    try {
      await page.goto(`http://127.0.0.1:${webPort}/`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".artifact-chip", { timeout: 60000, state: "attached" });

      await page.locator(".artifact-chip").first().click();
      await page.waitForFunction(
        () => {
          const selected = document.querySelector(".artifact-chip.is-active");
          const title = document.getElementById("artifactTitle")?.textContent?.trim();
          return Boolean(selected && title);
        },
        null,
        { timeout: 60000 }
      );

      await page.waitForSelector(".hotspot-dot", { timeout: 60000, state: "attached" });
      await page.waitForFunction(
        () => {
          const text = document.getElementById("insightsContent")?.textContent || "";
          return text.includes("Render Loop") && text.includes("Throttle");
        },
        null,
        { timeout: 30000 }
      );

      // Accessibility regression: modal focus should be trapped and restored to the opener.
      await page.locator("#shortcutsBtn").focus();
      await page.keyboard.press("?");
      await page.waitForFunction(
        () => {
          const modal = document.getElementById("shortcutsModal");
          return Boolean(modal && modal.hidden === false);
        },
        null,
        { timeout: 30000 }
      );
      await page.waitForFunction(() => document.activeElement?.id === "shortcutsCloseBtn", null, { timeout: 10000 });
      for (let i = 0; i < 6; i += 1) {
        await page.keyboard.press("Tab");
      }
      await page.waitForFunction(
        () => {
          const modal = document.getElementById("shortcutsModal");
          return Boolean(modal && modal.contains(document.activeElement));
        },
        null,
        { timeout: 10000 }
      );
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => document.getElementById("shortcutsModal")?.hidden === true, null, { timeout: 30000 });
      await page.waitForFunction(() => document.activeElement?.id === "shortcutsBtn", null, { timeout: 10000 });

      await page.locator("#curatorBtn").focus();
      await page.click("#curatorBtn");
      await page.waitForFunction(() => document.getElementById("curatorModal")?.hidden === false, null, { timeout: 30000 });
      await page.keyboard.down("Shift");
      await page.keyboard.press("Tab");
      await page.keyboard.up("Shift");
      await page.waitForFunction(
        () => Boolean(document.getElementById("curatorModal")?.contains(document.activeElement)),
        null,
        { timeout: 10000 }
      );
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => document.getElementById("curatorModal")?.hidden === true, null, { timeout: 30000 });
      await page.waitForFunction(() => document.activeElement?.id === "curatorBtn", null, { timeout: 10000 });

      await page.locator("#moderationBtn").focus();
      await page.click("#moderationBtn");
      await page.waitForFunction(() => document.getElementById("moderationModal")?.hidden === false, null, { timeout: 30000 });
      await page.keyboard.down("Shift");
      await page.keyboard.press("Tab");
      await page.keyboard.up("Shift");
      await page.waitForFunction(
        () => Boolean(document.getElementById("moderationModal")?.contains(document.activeElement)),
        null,
        { timeout: 10000 }
      );
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => document.getElementById("moderationModal")?.hidden === true, null, { timeout: 30000 });
      await page.waitForFunction(() => document.activeElement?.id === "moderationBtn", null, { timeout: 10000 });

      await page.keyboard.press("h");
      await page.waitForSelector(".hotspot-dot.is-hidden", { timeout: 30000 });
      await page.keyboard.press("h");
      await page.waitForSelector(".hotspot-dot:not(.is-hidden)", { timeout: 30000 });

      await page.click("#listToggleBtn");
      await page.waitForSelector(".hotspot-list-item", { timeout: 30000 });

      await page.locator(".hotspot-list-item").first().focus();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await page.waitForFunction(
        () => {
          const card = document.getElementById("hotspotCard");
          return card && card.hidden === false;
        },
        null,
        { timeout: 30000 }
      );

      await page.click("#compareBtn");
      await page.waitForFunction(
        () => {
          const pane = document.getElementById("comparePane");
          return pane && pane.getAttribute("aria-hidden") === "false";
        },
        null,
        { timeout: 30000 }
      );
      await page.locator(".compare-chip").nth(1).click();
      await page.waitForFunction(() => Boolean(document.getElementById("comparePaneTitle")?.textContent?.trim()), null, {
        timeout: 60000
      });

      await page.click("#syncBtn");
      await page.click("#tourBtn");
      await page.waitForFunction(
        () => {
          const stepper = document.getElementById("tourStepper");
          return stepper && stepper.hidden === false;
        },
        null,
        { timeout: 30000 }
      );
      await page.click("#nextStepBtn");

      const downloadEvent = page.waitForEvent("download", { timeout: 30000 });
      await page.click("#snapshotBtn");
      const download = await downloadEvent;
      const downloadPath = await download.path();
      if (!downloadPath) {
        throw new Error("snapshot_download_missing");
      }
    } catch (error) {
      if (keepArtifacts) {
        try {
          await page.screenshot({ path: join(tempDir, "failure.png"), fullPage: true });
          const html = await page.content();
          await writeFile(join(tempDir, "failure.html"), html, "utf8");
        } catch {
          // ignore
        }
      }

      const filtered = consoleErrors.filter((message) => {
        if (message.includes("Failed to load resource") || message.includes("404 (Not Found)")) {
          return false;
        }
        if (message.includes("THREE.WebGLRenderer: A WebGL context could not be created")) {
          return false;
        }
        return true;
      });
      if (filtered.length) {
        console.error(`console errors: ${filtered.slice(0, 10).join(" | ")}`);
      }
      throw error;
    }

    const filteredErrors = consoleErrors.filter((message) => {
      if (message.includes("Failed to load resource") || message.includes("404 (Not Found)")) {
        return false;
      }
      if (message.includes("THREE.WebGLRenderer: A WebGL context could not be created")) {
        return false;
      }
      return true;
    });
    if (filteredErrors.length) {
      throw new Error(`console_errors_detected: ${filteredErrors.slice(0, 5).join(" | ")}`);
    }

    console.log("smoke:kiosk ok");
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error(`smoke:kiosk failed: ${String(error && error.message ? error.message : error)}`);
  process.exit(1);
});
