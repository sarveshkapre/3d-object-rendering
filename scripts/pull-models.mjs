import { mkdir, writeFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const outputDir = resolve(projectRoot, "public/models");

const assets = [
  {
    id: "temple-sentinel",
    source:
      "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb",
    output: "temple-sentinel.glb"
  },
  {
    id: "heritage-optics",
    source:
      "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/AntiqueCamera/glTF-Binary/AntiqueCamera.glb",
    output: "heritage-optics.glb"
  },
  {
    id: "ritual-lantern",
    source:
      "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Lantern/glTF-Binary/Lantern.glb",
    output: "ritual-lantern.glb"
  }
];

await mkdir(outputDir, { recursive: true });

for (const asset of assets) {
  const outputPath = resolve(outputDir, asset.output);

  try {
    await access(outputPath, constants.F_OK);
    console.log(`skip ${asset.id} (${asset.output} already exists)`);
    continue;
  } catch {
    // Continue to fetch.
  }

  console.log(`download ${asset.id}`);
  const response = await fetch(asset.source);

  if (!response.ok) {
    throw new Error(`failed to fetch ${asset.source} (${response.status})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, buffer);
  console.log(`saved ${asset.output} (${Math.round(buffer.byteLength / 1024)} KB)`);
}

console.log("models ready in public/models");
