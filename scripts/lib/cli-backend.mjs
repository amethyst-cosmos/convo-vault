import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, openSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const BACKEND_URL = `http://127.0.0.1:${Number(process.env.CGCE_ADVANCED_PDF_PORT) || 38474}`;

export function backendDependenciesInstalled() {
  return existsSync(path.join(repoRoot, "tools", "advanced-pdf", "node_modules", "markdown-it"));
}

export async function getHealth() {
  try {
    const response = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(1500) });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

/** Makes sure a renderer that understands export jobs is listening; starts one if not. */
export async function ensureBackend(log) {
  let health = await getHealth();

  if (health) {
    if (!health.capabilities?.includes("jobs")) {
      const stop = process.platform === "win32"
        ? "Get-NetTCPConnection -LocalPort 38474 | ForEach-Object { Stop-Process -Id $_.OwningProcess }"
        : "lsof -ti tcp:38474 | xargs kill";
      throw new Error(`A renderer started before this update is still running on ${BACKEND_URL} and cannot run export jobs. Stop it (${stop}) and export again; the next export starts a new one.`);
    }
    return health;
  }

  if (!backendDependenciesInstalled()) {
    throw new Error("Renderer dependencies are not installed. Run: node scripts/convo-vault.mjs setup");
  }

  log("Starting the local renderer...");
  const cacheDir = path.join(repoRoot, ".convo-vault");
  mkdirSync(cacheDir, { recursive: true });
  const logFile = openSync(path.join(cacheDir, "backend.log"), "a");
  const child = spawn(process.execPath, [path.join(repoRoot, "tools", "advanced-pdf", "server.js")], {
    cwd: repoRoot,
    detached: true,
    stdio: ["ignore", logFile, logFile],
    windowsHide: true,
    env: {
      ...process.env,
      CGCE_CACHE_DIR: cacheDir,
      CGCE_LOCAL_API_TOKEN: randomBytes(32).toString("hex")
    }
  });
  child.unref();

  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    health = await getHealth();
    if (health) return health;
  }

  throw new Error(`The local renderer did not start. See ${path.join(cacheDir, "backend.log")}.`);
}

export async function stopBackend() {
  try {
    const response = await fetch(`${BACKEND_URL}/shutdown`, { method: "POST" });
    return response.ok;
  } catch {
    return false;
  }
}

async function api(route, init = {}) {
  const response = await fetch(`${BACKEND_URL}${route}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers }
  });
  return response;
}

export async function createJob(options) {
  const response = await api("/jobs", { method: "POST", body: JSON.stringify(options) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    throw new Error(result.error || `Could not create an export job (${response.status}).`);
  }
  return result.jobId;
}

export async function getJob(jobId) {
  const response = await api(`/jobs/${jobId}`);
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    throw new Error(result.error || `Export job lookup failed (${response.status}).`);
  }
  return result;
}

export async function downloadJobBundle(jobId) {
  const response = await api(`/jobs/${jobId}/bundle`);
  if (!response.ok) {
    throw new Error(`Could not download the bundle (${response.status}).`);
  }
  return Buffer.from(await response.arrayBuffer());
}
