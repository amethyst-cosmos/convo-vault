#!/usr/bin/env node

// Builds the loadable extension folder (and a zip) from extension/.
// The content script is generated: extension/content/index.js plus its includes.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildContentScript } from "./lib/content-build.mjs";
import { createZipFromDirectory } from "./lib/simple-zip.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(repoRoot, "extension");
const options = parseArgs(process.argv.slice(2));
const outRoot = path.resolve(repoRoot, options.outDir || "dist");
const extensionDir = path.join(outRoot, "convo-vault-extension");
const zipPath = path.join(outRoot, "convo-vault-extension.zip");

// Files copied as they are, relative to extension/.
const copiedFiles = [
  "manifest.json",
  "background.js",
  "popup/popup.html",
  "popup/popup.css",
  "popup/popup.js",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "icons/icon-128.png"
];

// The folder is updated in place, never deleted: a browser that has it loaded
// disables the extension when its manifest disappears, even for a moment.
await fs.mkdir(extensionDir, { recursive: true });
const written = new Set();

for (const file of copiedFiles.filter((name) => name !== "manifest.json")) {
  try {
    await writeAtomically(file, await fs.readFile(path.join(sourceDir, file)));
  } catch {
    throw new Error(`Missing or unreadable extension file: ${path.join(sourceDir, file)}`);
  }
}

await writeAtomically("content.js", await buildContentScript(repoRoot));
await writeAtomically("manifest.json", await fs.readFile(path.join(sourceDir, "manifest.json")));
await removeStaleFiles(extensionDir);

await fs.rm(zipPath, { force: true });
await createZipFromDirectory(extensionDir, zipPath);

console.log(`Extension folder: ${extensionDir}`);
console.log(`Extension zip:    ${zipPath}`);
console.log("");
console.log("Chrome development mode still uses Load unpacked with the extension folder.");
console.log("Use the zip for sharing or archiving; unzip it before Load unpacked if needed.");

// Writes next to the target and renames, so a reader never sees half a file.
async function writeAtomically(relativePath, data) {
  const destination = path.join(extensionDir, relativePath);
  const temporary = `${destination}.tmp`;
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(temporary, data);
  await fs.rename(temporary, destination);
  written.add(path.resolve(destination));
}

async function removeStaleFiles(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await removeStaleFiles(entryPath);
      if (!(await fs.readdir(entryPath)).length) await fs.rmdir(entryPath);
    } else if (!written.has(path.resolve(entryPath))) {
      await fs.rm(entryPath);
    }
  }
}

function parseArgs(args) {
  const parsed = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--out-dir" || arg === "--outDir") {
      parsed.outDir = args[index + 1];
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}
