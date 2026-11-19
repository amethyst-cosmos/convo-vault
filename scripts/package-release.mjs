#!/usr/bin/env node

// Builds dist/convo-vault-<version>.zip: the extension, the CLI, the local
// renderer and the agent skill in one folder that runs after `setup`.

import { promises as fs } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createZipFromDirectory } from "./lib/simple-zip.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outFlag = process.argv.indexOf("--out-dir");
const outRoot = path.resolve(repoRoot, outFlag > -1 ? process.argv[outFlag + 1] : "dist");
const version = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8")).version;
const packageName = `convo-vault-${version}`;

// Paths copied as-is; directories skip dependency and scratch folders.
const include = [
  "README.md",
  "README.zh-CN.md",
  "CHANGELOG.md",
  "CHANGELOG.zh-CN.md",
  "INSTALL.md",
  "INSTALL.zh-CN.md",
  "LICENSE",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "package.json",
  "docs/images",
  "cli",
  "scripts",
  "skills",
  "extension",
  "renderer"
];
const skipNames = new Set(["node_modules", "tmp", ".DS_Store"]);

const stagingRoot = path.join(outRoot, ".package-staging");
const stagingDir = path.join(stagingRoot, packageName);
const zipPath = path.join(outRoot, `${packageName}.zip`);

// The setup command loads this prebuilt copy into the browser.
const build = spawnSync(process.execPath, [path.join(repoRoot, "scripts", "build-extension.mjs"), "--out-dir", outRoot], { stdio: "ignore" });
if (build.status !== 0) throw new Error("Building the extension failed.");

await fs.rm(stagingRoot, { recursive: true, force: true });
await fs.mkdir(stagingDir, { recursive: true });

for (const entry of include) {
  await copyEntry(path.join(repoRoot, entry), path.join(stagingDir, entry));
}

await copyEntry(path.join(outRoot, "convo-vault-extension"), path.join(stagingDir, "dist", "convo-vault-extension"));

await fs.rm(zipPath, { force: true });
await createZipFromDirectory(stagingRoot, zipPath);
if (process.argv.includes("--mcpb")) await createMcpBundle();
await fs.rm(stagingRoot, { recursive: true, force: true });

const { size } = await fs.stat(zipPath);
console.log(`Release package: ${zipPath} (${(size / 1024 / 1024).toFixed(1)} MB)`);
console.log("Unzip it, then run: node cli/convo-vault.mjs setup");

async function createMcpBundle() {
  // Use a flat production dependency tree so the archive is portable and
  // unpacking doesn't have to recreate pnpm's local symlinks.
  const install = spawnSync("pnpm", ["install", "--prod", "--frozen-lockfile", "--config.node-linker=hoisted"], {
    cwd: path.join(stagingDir, "renderer"),
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (install.status !== 0) throw new Error("Could not install the MCP bundle's renderer dependencies.");

  const manifest = {
    manifest_version: "0.3",
    name: "convo-vault",
    display_name: "Convo Vault",
    version,
    description: "Export ChatGPT, Grok and Gemini chats to Markdown, PDF and structured files on your computer.",
    author: { name: "amethyst-cosmos", url: "https://github.com/amethyst-cosmos" },
    repository: { type: "git", url: "https://github.com/amethyst-cosmos/convo-vault" },
    homepage: "https://github.com/amethyst-cosmos/convo-vault",
    icon: "extension/icons/icon-128.png",
    license: "MIT",
    server: {
      type: "node",
      entry_point: "cli/mcp-server.mjs",
      mcp_config: { command: "node", args: ["${__dirname}/cli/mcp-server.mjs"] }
    },
    compatibility: { platforms: ["darwin", "win32", "linux"], runtimes: { node: ">=20" } }
  };
  await fs.writeFile(path.join(stagingDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  // The runtime imports the packages directly. pnpm's command shims can be
  // platform-specific and may point to files through symlinks.
  await fs.rm(path.join(stagingDir, "renderer", "node_modules", ".bin"), { recursive: true, force: true });
  const bundlePath = path.join(outRoot, `${packageName}.mcpb`);
  await createZipFromDirectory(stagingDir, bundlePath);
  console.log(`MCP bundle: ${bundlePath}`);
}

async function copyEntry(source, destination) {
  const stat = await fs.stat(source);

  if (stat.isDirectory()) {
    await fs.mkdir(destination, { recursive: true });
    for (const child of await fs.readdir(source)) {
      if (!skipNames.has(child)) await copyEntry(path.join(source, child), path.join(destination, child));
    }
    return;
  }

  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
}
