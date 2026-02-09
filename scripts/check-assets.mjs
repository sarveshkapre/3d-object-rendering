import { access, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { artifacts } from "../src/data/artifacts.js";

const scriptDir = resolve(fileURLToPath(new URL(".", import.meta.url)));
const rootDir = resolve(scriptDir, "..");
const publicDir = resolve(rootDir, "public");

function formatList(values) {
  return values.map((value) => `- ${value}`).join("\n");
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const expectedModelUrls = artifacts
    .map((artifact) => ({ id: artifact.id, modelUrl: artifact.modelUrl }))
    .filter((entry) => typeof entry.modelUrl === "string" && entry.modelUrl.trim());

  const invalidUrls = expectedModelUrls.filter((entry) => !entry.modelUrl.startsWith("/models/"));
  if (invalidUrls.length) {
    console.error("Asset check failed: modelUrl must start with /models/ for local hosting.\n");
    console.error(formatList(invalidUrls.map((entry) => `${entry.id}: ${entry.modelUrl}`)));
    process.exitCode = 1;
    return;
  }

  const missing = [];
  for (const entry of expectedModelUrls) {
    const relativePath = entry.modelUrl.replace(/^\//, "");
    const assetPath = resolve(publicDir, relativePath);
    const ok = await fileExists(assetPath);
    if (!ok) {
      missing.push(`${entry.id}: ${entry.modelUrl}`);
    }
  }

  const modelsDir = resolve(publicDir, "models");
  const diskModels = await readdir(modelsDir).catch(() => []);
  const referencedNames = new Set(
    expectedModelUrls.map((entry) => entry.modelUrl.split("/").pop()).filter(Boolean)
  );
  const unused = diskModels.filter((name) => name.endsWith(".glb") && !referencedNames.has(name));

  if (missing.length) {
    console.error("Asset check failed: missing referenced model files.\n");
    console.error(formatList(missing));
    console.error("\nFix:");
    console.error("- Ensure the files exist under public/models");
    console.error("- Or run: npm run assets:pull");
    process.exitCode = 1;
    return;
  }

  if (unused.length) {
    console.warn("Asset check warning: unreferenced model files found in public/models:\n");
    console.warn(formatList(unused));
  }

  console.log(`assets:check ok (${expectedModelUrls.length} referenced models)`);
}

await main();
