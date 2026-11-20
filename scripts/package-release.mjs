#!/usr/bin/env node

// Builds a portable release with the CLI, prebuilt extension and renderer.

import { existsSync, promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
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

const zipPath = path.join(outRoot, `${packageName}.zip`);

// The setup command loads this prebuilt copy into the browser.
const build = spawnSync(process.execPath, [path.join(repoRoot, "scripts", "build-extension.mjs"), "--out-dir", outRoot], { stdio: "ignore" });
if (build.status !== 0) throw new Error("Building the extension failed.");

const stagingRoot = await fs.mkdtemp(path.join(outRoot, ".package-staging-"));
const stagingDir = path.join(stagingRoot, packageName);
try {
  for (const entry of include) {
    await copyEntry(path.join(repoRoot, entry), path.join(stagingDir, entry));
  }
  await copyEntry(path.join(outRoot, "convo-vault-extension"), path.join(stagingDir, "dist", "convo-vault-extension"));
  await copyRuntimeDependencies(path.join(repoRoot, "renderer"), path.join(stagingDir, "renderer"));
  await createZipFromDirectory(stagingRoot, zipPath);
  const digest = createHash("sha256").update(await fs.readFile(zipPath)).digest("hex");
  await fs.writeFile(`${zipPath}.sha256`, `${digest}  ${path.basename(zipPath)}\n`);
  if (process.argv.includes("--mcpb")) await createMcpBundle();
} finally {
  await fs.rm(stagingRoot, { recursive: true, force: true });
}

const { size } = await fs.stat(zipPath);
console.log(`Release package: ${zipPath} (${(size / 1024 / 1024).toFixed(1)} MB)`);
console.log("Unzip it, then run: node cli/convo-vault.mjs setup --verify --no-open");

async function copyRuntimeDependencies(source, destination, ancestors = []) {
  // Copy the locked dependencies installed by the build, resolving pnpm's
  // symlinks into normal folders that also work after unzipping on Windows.
  const manifest = path.join(source, "package.json");
  const { dependencies = {} } = JSON.parse(await fs.readFile(manifest, "utf8"));
  const requireFromPackage = createRequire(manifest);
  for (const name of Object.keys(dependencies)) {
    const installed = requireFromPackage.resolve.paths(name)?.map((dir) => path.join(dir, name, "package.json")).find(existsSync);
    if (!installed) throw new Error(`Renderer dependency ${name} is missing. Run pnpm install --frozen-lockfile in renderer first.`);

    const packageDir = path.dirname(await fs.realpath(installed));
    if (ancestors.includes(packageDir)) continue; // Node can find this dependency in a parent.
    const target = path.join(destination, "node_modules", name);
    await copyEntry(packageDir, target);
    await copyRuntimeDependencies(packageDir, target, [...ancestors, packageDir]);
  }
}

async function createMcpBundle() {
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
