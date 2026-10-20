#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverScript = path.join(repoRoot, "renderer", "server.js");
const options = parseArgs(process.argv.slice(2));
const port = normalizePort(options.port || process.env.CGCE_ADVANCED_PDF_PORT);
const cacheDir = path.resolve(repoRoot, options.cacheDir || process.env.CGCE_CACHE_DIR || ".convo-vault");
const browserPath = options.browserPath || process.env.CGCE_RENDER_BROWSER_PATH || "";
const localApiToken = String(process.env.CGCE_LOCAL_API_TOKEN || "").trim();
const env = {
  ...process.env,
  CGCE_CACHE_DIR: cacheDir,
  CGCE_ADVANCED_PDF_PORT: String(port)
};

if (browserPath) {
  env.CGCE_RENDER_BROWSER_PATH = browserPath;
} else {
  delete env.CGCE_RENDER_BROWSER_PATH;
}

if (localApiToken) {
  env.CGCE_LOCAL_API_TOKEN = localApiToken;
} else {
  delete env.CGCE_LOCAL_API_TOKEN;
}

mkdirSync(cacheDir, { recursive: true });

if (options.detached) {
  const child = spawn(process.execPath, [serverScript], {
    cwd: repoRoot,
    detached: true,
    env,
    stdio: "ignore",
    windowsHide: true
  });

  child.unref();
  console.log(`Started Convo Vault local backend process: ${child.pid}`);
  console.log(`Health: http://127.0.0.1:${port}/health`);
  console.log(`Auth: ${localApiToken ? "token required" : "not configured; browser-origin requests rejected"}`);
  process.exit(0);
}

console.log("Starting Convo Vault local backend");
console.log(`Repo:      ${repoRoot}`);
console.log(`Cache:     ${cacheDir}`);
console.log(`Endpoint:  http://127.0.0.1:${port}`);
console.log(`Auth:      ${localApiToken ? "token required" : "not configured; browser-origin requests rejected"}`);

if (browserPath) {
  console.log(`Browser:   ${browserPath}`);
}

console.log("");
console.log("Keep this terminal open while exporting. Press Ctrl+C to stop.");
console.log("");

const child = spawn(process.execPath, [serverScript], {
  cwd: repoRoot,
  env,
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

function normalizePort(value) {
  const portNumber = Number(value || 38474);
  return Number.isFinite(portNumber) && portNumber >= 1024 && portNumber <= 65535
    ? Math.floor(portNumber)
    : 38474;
}

function parseArgs(args) {
  const parsed = {
    cacheDir: "",
    port: "",
    browserPath: "",
    detached: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--detached") {
      parsed.detached = true;
      continue;
    }

    if (arg === "--port") {
      parsed.port = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--cache-dir" || arg === "--cacheDir") {
      parsed.cacheDir = args[index + 1] || "";
      index += 1;
      continue;
    }

    if (arg === "--browser-path" || arg === "--browserPath") {
      parsed.browserPath = args[index + 1] || "";
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}
