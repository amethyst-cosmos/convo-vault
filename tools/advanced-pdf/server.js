#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const { spawn } = require("child_process");
const { Transform } = require("stream");
const { pipeline } = require("stream/promises");
const { pathToFileURL } = require("url");
const {
  buildAssetManifest,
  dedupeEmbeddedImageAssets,
  externalizeEmbeddedImageAssets
} = require("./assets");
const {
  buildMarkdownDocument,
  normalizePayload,
  writeDataSidecars
} = require("./bundle-content");

const HOST = "127.0.0.1";
const PORT = Number(process.env.CGCE_ADVANCED_PDF_PORT || 38474);
const MAX_BODY_BYTES = Number(process.env.CGCE_ADVANCED_PDF_MAX_BODY_BYTES || 256 * 1024 * 1024);
const MAX_EXPORT_ASSET_BYTES = Number(process.env.CGCE_MAX_EXPORT_ASSET_BYTES || 128 * 1024 * 1024);
const LOCAL_API_TOKEN_HEADER = "x-convo-vault-token";
const LOCAL_API_TOKEN = String(process.env.CGCE_LOCAL_API_TOKEN || "").trim();
const ROOT_DIR = path.resolve(__dirname, "..", "..");
const WORK_DIR = path.join(ROOT_DIR, "tmp", "advanced-pdf-server");
const RENDER_SCRIPT = path.join(__dirname, "render.js");
const DEFAULT_CACHE_ROOT = path.join(ROOT_DIR, ".convo-vault");
const BUNDLE_DOWNLOAD_TTL_MS = 10 * 60 * 1000;
const EXPORT_SESSION_TTL_MS = 30 * 60 * 1000;
const EXPORT_JOB_TTL_MS = 30 * 60 * 1000;
const EXPORT_JOB_ID_PATTERN = /^[a-f0-9]{48}$/;
const preparedBundleDownloads = new Map();
const exportSessions = new Map();
// Export jobs let a local program (the CLI or an agent skill) ask the extension
// to export a conversation without anyone touching the selector panel.
const exportJobs = new Map();

fs.mkdirSync(WORK_DIR, { recursive: true });

// The CLI starts the renderer on demand and sets this so it exits by itself once
// nothing has used it for a while. 0 keeps it running (the popup's Copy Start).
const IDLE_EXIT_MS = Number(process.env.CGCE_IDLE_EXIT_MS || 0);
let activeRequests = 0;
let lastActivityAt = Date.now();

const server = http.createServer((request, response) => {
  activeRequests += 1;
  lastActivityAt = Date.now();
  response.on("close", () => {
    activeRequests -= 1;
    lastActivityAt = Date.now();
  });
  handleRequest(request, response).catch((error) => {
    sendJson(response, 500, {
      ok: false,
      error: error.message || String(error)
    });
  });
});

if (IDLE_EXIT_MS > 0) {
  setInterval(() => {
    if (activeRequests === 0 && Date.now() - lastActivityAt >= IDLE_EXIT_MS) {
      console.log(`[advanced-pdf-server] Idle for ${Math.round(IDLE_EXIT_MS / 1000)}s, exiting.`);
      process.exit(0);
    }
  }, Math.max(250, Math.min(30_000, IDLE_EXIT_MS / 2))).unref();
}

server.listen(PORT, HOST, () => {
  console.log(`[advanced-pdf-server] Listening on http://${HOST}:${PORT}`);
  console.log(`[advanced-pdf-server] Local API token: ${LOCAL_API_TOKEN ? "required" : "not configured; browser-origin requests will be rejected"}`);
  console.log("[advanced-pdf-server] Endpoints: GET /health, POST /shutdown, POST /jobs, GET /jobs/:id, POST /export-sessions, PUT /export-sessions/:id/assets/:sourceKey, DELETE /export-sessions/:id, POST /prepare-render-bundle, GET /download-bundle/:id");
});

async function handleRequest(request, response) {
  setCorsHeaders(request, response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url || "/", `http://${HOST}:${PORT}`);

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, {
      ok: true,
      renderer: "advanced-local-chrome",
      version: readPackageVersion(),
      authRequired: Boolean(LOCAL_API_TOKEN),
      capabilities: ["jobs"],
      cacheRoot: getCacheRoot()
    });
    return;
  }

  // Jobs are driven by local programs (no browser Origin) and claimed by the
  // extension, so they sit before the token gate and carry their own checks.
  if (url.pathname === "/jobs" || url.pathname.startsWith("/jobs/")) {
    if (await handleJobRequest(request, response, url)) {
      return;
    }
  }

  if (request.method === "GET" && url.pathname.startsWith("/download-bundle/")) {
    handlePreparedBundleDownload(url, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/shutdown" && isLocalProcessRequest(request)) {
    handleShutdown(response);
    return;
  }

  if (!isLocalApiAuthorized(request)) {
    sendJson(response, 401, {
      ok: false,
      error: "Missing or invalid local API token."
    });
    return;
  }

  // Export sessions are intentionally below the token gate: only the authenticated
  // extension background may stage local assets on this loopback-only service.
  if (request.method === "POST" && url.pathname === "/export-sessions") {
    handleCreateExportSession(response);
    return;
  }

  const exportAssetMatch = url.pathname.match(/^\/export-sessions\/([a-f0-9]{48})\/assets\/([a-f0-9]{64})$/);
  if (request.method === "PUT" && exportAssetMatch) {
    await handleExportSessionAsset(request, response, exportAssetMatch[1], exportAssetMatch[2]);
    return;
  }

  const exportSessionMatch = url.pathname.match(/^\/export-sessions\/([a-f0-9]{48})$/);
  if (request.method === "DELETE" && exportSessionMatch) {
    handleDeleteExportSession(response, exportSessionMatch[1]);
    return;
  }

  if (request.method === "POST" && url.pathname === "/shutdown") {
    handleShutdown(response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/prepare-render-bundle") {
    await handlePrepareRenderBundle(request, response);
    return;
  }

  sendJson(response, 404, {
    ok: false,
    error: "Not found"
  });
}

/**
 * Routes /jobs requests. Returns false when the request is not a job route so
 * the caller can continue with the normal token-gated routes.
 */
async function handleJobRequest(request, response, url) {
  const jobMatch = url.pathname.match(/^\/jobs\/([a-f0-9]{48})(?:\/(claim|status|bundle))?$/);

  if (url.pathname === "/jobs") {
    if (request.method !== "POST") return false;
    if (!isLocalProcessRequest(request)) {
      sendJson(response, 403, { ok: false, error: "Jobs can only be created by local programs." });
      return true;
    }
    const body = await readJsonBody(request);
    sendJson(response, 200, createExportJob(body));
    return true;
  }

  if (!jobMatch) {
    return false;
  }

  const [, jobId, action] = jobMatch;
  pruneExportJobs();
  const job = exportJobs.get(jobId);

  if (!job) {
    sendJson(response, 404, { ok: false, error: "Export job was not found or has expired." });
    return true;
  }

  if (request.method === "POST" && action === "claim") {
    // Only the extension may claim: page scripts cannot forge a chrome-extension Origin.
    if (!String(request.headers.origin || "").toLowerCase().startsWith("chrome-extension://")) {
      sendJson(response, 403, { ok: false, error: "Only the Convo Vault extension can claim a job." });
      return true;
    }
    if (job.state !== "waiting") {
      sendJson(response, 409, { ok: false, error: "This export job was already claimed." });
      return true;
    }
    updateExportJob(job, "claimed", "Extension picked up the job.");
    sendJson(response, 200, { ok: true, options: job.options, token: LOCAL_API_TOKEN });
    return true;
  }

  if (request.method === "POST" && action === "status") {
    if (!isLocalApiAuthorized(request)) {
      sendJson(response, 401, { ok: false, error: "Missing or invalid local API token." });
      return true;
    }
    const body = await readJsonBody(request);
    const state = body?.state === "error" ? "error" : "working";
    updateExportJob(job, state, String(body?.message || "").slice(0, 2000));
    sendJson(response, 200, { ok: true });
    return true;
  }

  if (request.method === "GET" && !action) {
    if (!isLocalProcessRequest(request) && !isLocalApiAuthorized(request)) {
      sendJson(response, 403, { ok: false, error: "Jobs can only be read by local programs." });
      return true;
    }
    sendJson(response, 200, describeExportJob(job));
    return true;
  }

  if (request.method === "GET" && action === "bundle") {
    if (!isLocalProcessRequest(request)) {
      sendJson(response, 403, { ok: false, error: "Bundles can only be read by local programs." });
      return true;
    }
    if (job.state !== "done" || !job.result?.zipPath || !fs.existsSync(job.result.zipPath)) {
      sendJson(response, 409, { ok: false, error: "The export bundle is not ready." });
      return true;
    }
    response.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Length": job.result.size,
      "Content-Disposition": makeContentDisposition(job.result.filename),
      "Cache-Control": "no-store, max-age=0"
    });
    fs.createReadStream(job.result.zipPath).pipe(response);
    return true;
  }

  return false;
}

function createExportJob(body) {
  const jobId = crypto.randomBytes(24).toString("hex");
  const captureMode = ["fast", "hybrid", "full"].includes(body?.captureMode) ? body.captureMode : "fast";
  const job = {
    id: jobId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    state: "waiting",
    message: "Waiting for the browser extension to pick up the job.",
    options: {
      captureMode,
      allowIncomplete: body?.allowIncomplete === true,
      closeTab: body?.closeTab !== false,
      // A ping job only proves the extension is installed and answering.
      ping: body?.ping === true,
      // false skips the PDF: a data-only bundle needs no headless Chrome.
      pdf: body?.pdf !== false
    },
    result: null
  };
  exportJobs.set(jobId, job);
  return { ok: true, jobId, options: job.options };
}

function updateExportJob(job, state, message) {
  job.state = state;
  job.updatedAt = Date.now();
  if (message) {
    job.message = message;
  }
}

function completeExportJob(jobId, result) {
  const job = EXPORT_JOB_ID_PATTERN.test(String(jobId || "")) ? exportJobs.get(jobId) : null;
  if (!job) return;
  job.result = result;
  updateExportJob(job, "done", `Exported ${result.filename}.`);
}

function describeExportJob(job) {
  return {
    ok: true,
    jobId: job.id,
    state: job.state,
    message: job.message,
    ageMs: Date.now() - job.createdAt,
    idleMs: Date.now() - job.updatedAt,
    options: job.options,
    result: job.result
      ? {
        filename: job.result.filename,
        size: job.result.size,
        bundleFiles: job.result.bundleFiles,
        assetCount: job.result.assetCount,
        assetStats: job.result.assetStats
      }
      : null
  };
}

function pruneExportJobs() {
  const cutoff = Date.now() - EXPORT_JOB_TTL_MS;
  for (const [jobId, job] of exportJobs) {
    if (job.updatedAt < cutoff) {
      exportJobs.delete(jobId);
    }
  }
}

// A request from a program on this machine, not from a web page: browsers always
// label their requests with an Origin or Sec-Fetch-Site header, plain HTTP clients
// do not. The Host check blocks DNS-rebinding pages.
function isLocalProcessRequest(request) {
  if (request.headers.origin || request.headers["sec-fetch-site"]) {
    return false;
  }
  const host = String(request.headers.host || "").toLowerCase();
  return host === `127.0.0.1:${PORT}` || host === `localhost:${PORT}`;
}

function handleShutdown(response) {
  sendJson(response, 200, {
    ok: true,
    shuttingDown: true
  });

  console.log("[advanced-pdf-server] Shutdown requested.");
  setTimeout(() => {
    server.close(() => {
      process.exit(0);
    });
  }, 150);
}

function handleCreateExportSession(response) {
  const sessionId = crypto.randomBytes(24).toString("hex");
  const session = {
    id: sessionId,
    createdAt: Date.now(),
    expiresAt: Date.now() + EXPORT_SESSION_TTL_MS,
    totalBytes: 0,
    assetsBySourceKey: new Map()
  };
  exportSessions.set(sessionId, session);
  scheduleExportSessionExpiry(sessionId);

  sendJson(response, 200, {
    ok: true,
    sessionId,
    expiresAt: new Date(session.expiresAt).toISOString(),
    maxAssetBytes: MAX_EXPORT_ASSET_BYTES
  });
}

async function handleExportSessionAsset(request, response, sessionId, sourceKey) {
  const session = getActiveExportSession(sessionId);

  if (!session) {
    sendJson(response, 410, {
      ok: false,
      error: "Export session is missing or expired."
    });
    return;
  }

  const declaredLength = Number(request.headers["content-length"] || 0);
  if (declaredLength > MAX_EXPORT_ASSET_BYTES) {
    sendJson(response, 413, {
      ok: false,
      error: `Export asset exceeds the ${MAX_EXPORT_ASSET_BYTES} byte per-file limit.`
    });
    return;
  }

  try {
    const asset = await stageExportSessionAsset(request, session, sourceKey);
    sendJson(response, 200, {
      ok: true,
      sourceKey: asset.sourceKey,
      sha256: asset.sha256,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      cachePath: asset.cachePath,
      reused: asset.reused
    });
  } catch (error) {
    sendJson(response, error?.statusCode || 500, {
      ok: false,
      error: error.message || String(error)
    });
  }
}

function handleDeleteExportSession(response, sessionId) {
  const existed = exportSessions.delete(sessionId);
  sendJson(response, 200, {
    ok: true,
    deleted: existed
  });
}

async function stageExportSessionAsset(request, session, sourceKey) {
  const cacheRoot = getCacheRoot();
  const uploadRoot = path.join(cacheRoot, "tmp", "export-assets");
  fs.mkdirSync(uploadRoot, { recursive: true });
  assertExportAssetDiskSpace(cacheRoot, Number(request.headers["content-length"] || 0));

  const tempPath = path.join(uploadRoot, `${session.id}-${sourceKey}-${crypto.randomBytes(8).toString("hex")}.part`);
  const digest = crypto.createHash("sha256");
  let totalBytes = 0;
  let prefix = Buffer.alloc(0);
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      totalBytes += chunk.length;

      if (totalBytes > MAX_EXPORT_ASSET_BYTES) {
        const error = new Error(`Export asset exceeds the ${MAX_EXPORT_ASSET_BYTES} byte per-file limit.`);
        error.statusCode = 413;
        callback(error);
        return;
      }

      digest.update(chunk);
      if (prefix.length < 512) {
        prefix = Buffer.concat([prefix, chunk.subarray(0, 512 - prefix.length)]);
      }
      callback(null, chunk);
    }
  });

  try {
    await pipeline(request, meter, fs.createWriteStream(tempPath, { flags: "wx" }));
  } catch (error) {
    fs.rmSync(tempPath, { force: true });
    throw error;
  }

  if (!totalBytes) {
    fs.rmSync(tempPath, { force: true });
    const error = new Error("Export asset upload was empty.");
    error.statusCode = 400;
    throw error;
  }

  const mimeType = detectUploadedImageMime(prefix, request.headers["content-type"]);
  if (!mimeType.startsWith("image/")) {
    fs.rmSync(tempPath, { force: true });
    const error = new Error(`Export asset is not a supported image (${mimeType || "unknown type"}).`);
    error.statusCode = 415;
    throw error;
  }

  const sha256 = digest.digest("hex");
  const extension = extensionFromImageMime(mimeType);
  const cachePath = path.posix.join(
    "assets",
    "sha256",
    sha256.slice(0, 2),
    sha256.slice(2, 4),
    `${sha256}.${extension}`
  );
  const absolutePath = path.join(cacheRoot, ...cachePath.split("/"));
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const reused = fs.existsSync(absolutePath);

  if (reused) {
    fs.rmSync(tempPath, { force: true });
  } else {
    fs.renameSync(tempPath, absolutePath);
  }

  const asset = {
    sourceKey,
    sha256,
    mimeType,
    sizeBytes: totalBytes,
    cachePath,
    absolutePath,
    fileUrl: pathToFileURL(absolutePath).href,
    reused
  };
  session.assetsBySourceKey.set(sourceKey, asset);
  session.totalBytes += totalBytes;
  session.expiresAt = Date.now() + EXPORT_SESSION_TTL_MS;
  return asset;
}

function assertExportAssetDiskSpace(cacheRoot, declaredLength) {
  if (!declaredLength || typeof fs.statfsSync !== "function") {
    return;
  }

  const stats = fs.statfsSync(cacheRoot);
  const available = Number(stats.bavail) * Number(stats.bsize);
  const reserve = 256 * 1024 * 1024;

  if (available < declaredLength + reserve) {
    const error = new Error(`Not enough free disk space to stage this asset. Available: ${available} bytes.`);
    error.statusCode = 507;
    throw error;
  }
}

function detectUploadedImageMime(prefix, declaredType) {
  const claimed = String(declaredType || "").split(";", 1)[0].trim().toLowerCase();

  if (prefix.length >= 8 && prefix.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (prefix.length >= 3 && prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff) {
    return "image/jpeg";
  }
  if (prefix.subarray(0, 6).toString("ascii") === "GIF87a" || prefix.subarray(0, 6).toString("ascii") === "GIF89a") {
    return "image/gif";
  }
  if (prefix.length >= 12 && prefix.subarray(0, 4).toString("ascii") === "RIFF" && prefix.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  if (/^\s*<svg[\s>]/i.test(prefix.toString("utf8"))) {
    return "image/svg+xml";
  }

  return claimed.startsWith("image/") ? claimed : "application/octet-stream";
}

function extensionFromImageMime(mimeType) {
  const normalized = String(mimeType || "").toLowerCase();
  if (normalized.includes("jpeg")) return "jpg";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";
  if (normalized.includes("svg")) return "svg";
  return "png";
}

function getActiveExportSession(sessionId) {
  const session = exportSessions.get(String(sessionId || ""));
  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    exportSessions.delete(session.id);
    return null;
  }

  return session;
}

function scheduleExportSessionExpiry(sessionId) {
  const timer = setTimeout(() => {
    const session = exportSessions.get(sessionId);
    if (!session) {
      return;
    }

    if (session.expiresAt <= Date.now()) {
      exportSessions.delete(sessionId);
      return;
    }

    scheduleExportSessionExpiry(sessionId);
  }, EXPORT_SESSION_TTL_MS);
  timer.unref?.();
}

async function handlePrepareRenderBundle(request, response) {
  const body = await readJsonBody(request);
  const artifact = await buildRenderBundleArtifact(body);

  if (!artifact.ok) {
    sendRenderBundleError(response, artifact);
    return;
  }

  const downloadId = crypto.randomBytes(24).toString("hex");
  const expiresAt = Date.now() + BUNDLE_DOWNLOAD_TTL_MS;
  preparedBundleDownloads.set(downloadId, {
    zipPath: artifact.zipPath,
    filename: artifact.filename,
    size: artifact.bundleSize,
    expiresAt
  });

  const expirationTimer = setTimeout(() => {
    expirePreparedBundleDownload(downloadId);
  }, BUNDLE_DOWNLOAD_TTL_MS);
  expirationTimer.unref?.();

  completeExportJob(body?.jobId, {
    zipPath: artifact.zipPath,
    filename: artifact.filename,
    size: artifact.bundleSize,
    bundleFiles: artifact.bundleFiles,
    assetCount: artifact.assetCount,
    assetStats: artifact.assetStats
  });

  sendJson(response, 200, {
    ok: true,
    filename: artifact.filename,
    downloadPath: `/download-bundle/${downloadId}`,
    expiresAt: new Date(expiresAt).toISOString(),
    bundleFiles: artifact.bundleFiles,
    bundleSize: artifact.bundleSize,
    assetCount: artifact.assetCount,
    assetStats: artifact.assetStats,
    rendererTimings: artifact.rendererTimings
  });

  if (artifact.exportSessionId) {
    exportSessions.delete(artifact.exportSessionId);
  }
}

async function buildRenderBundleArtifact(body) {
  const timings = createTimings();
  const payload = normalizePayload(body);
  const exportSessionId = String(body?.exportSessionId || "").trim();
  const exportSession = exportSessionId ? getActiveExportSession(exportSessionId) : null;
  const localImageAssets = exportSession ? [...exportSession.assetsBySourceKey.values()] : [];
  timings.mark("payloadNormalized");

  if (exportSessionId && !exportSession) {
    return {
      ok: false,
      statusCode: 410,
      error: "Export asset session is missing or expired."
    };
  }

  if (!payload.messages.length) {
    return {
      ok: false,
      statusCode: 400,
      error: "No messages were provided."
    };
  }

  const baseName = sanitizeFilename(
    stripExtension(body.fileName, "zip")
      || payload.title
      || "chatgpt-conversation"
  );
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const requestDir = path.join(WORK_DIR, id);
  fs.mkdirSync(requestDir, { recursive: true });

  const renderLocalImageAssets = materializeRenderImageAssets(localImageAssets, requestDir);

  const jsonPath = path.join(requestDir, `${baseName}.payload.json`);
  const renderJsonPath = path.join(requestDir, `${baseName}.render.payload.json`);
  const htmlPath = path.join(requestDir, `${baseName}.html`);
  const pdfPath = path.join(requestDir, `${baseName}.pdf`);
  const markdownPath = path.join(requestDir, `${baseName}.md`);
  const assetManifestPath = path.join(requestDir, `${baseName}.assets.manifest.json`);

  const cacheRoot = getCacheRoot();
  const assetManifest = buildAssetManifest(payload, { cacheRoot, localImageAssets: renderLocalImageAssets });
  const renderPayload = dedupeEmbeddedImageAssets(payload, assetManifest, {
    localImageAssets: renderLocalImageAssets,
    renderLocalFiles: true
  });
  const bundlePayload = externalizeEmbeddedImageAssets(payload, assetManifest, {
    localImageAssets
  });
  timings.mark("assetsPrepared");

  fs.writeFileSync(renderJsonPath, JSON.stringify(renderPayload), "utf8");
  fs.writeFileSync(jsonPath, JSON.stringify(bundlePayload, null, 2), "utf8");
  fs.writeFileSync(markdownPath, buildMarkdownDocument(bundlePayload), "utf8");
  timings.mark("documentsWritten");
  fs.writeFileSync(assetManifestPath, JSON.stringify(assetManifest, null, 2), "utf8");
  timings.mark("assetManifestWritten");
  const dataFiles = writeDataSidecars(requestDir, baseName, bundlePayload, {
    localImageAssets: assetManifest.assets
  });
  timings.mark("dataSidecarsWritten");

  const skipPdf = body?.skipPdf === true;
  const result = skipPdf
    ? { ok: true }
    : await runRenderer({
      jsonPath: renderJsonPath,
      htmlPath,
      pdfPath,
      baseName
    });
  timings.mark("pdfRendered");

  if (!result.ok) {
    return {
      ok: false,
      statusCode: 500,
      error: "Renderer failed.",
      stdout: result.stdout.slice(-4000),
      stderr: result.stderr.slice(-4000)
    };
  }

  const bundleEntries = [
    {
      name: `${baseName}.md`,
      path: markdownPath
    },
    ...(skipPdf ? [] : [{
      name: `${baseName}.pdf`,
      path: pdfPath
    }]),
    {
      name: `${baseName}.payload.json`,
      path: jsonPath
    },
    {
      name: `${baseName}.assets.manifest.json`,
      path: assetManifestPath
    },
    ...dataFiles.map((filePath) => ({
      name: path.basename(filePath),
      path: filePath
    })),
    ...buildBundleAssetEntries(assetManifest, cacheRoot)
  ];
  const zipPath = path.join(requestDir, `${baseName}.bundle.zip`);
  const bundleSize = await createZipArchiveFile(bundleEntries, zipPath);
  timings.mark("zipCreated");
  const filename = `${baseName}.zip`;

  return {
    ok: true,
    zipPath,
    bundleSize,
    filename,
    bundleFiles: bundleEntries.map((entry) => entry.name).join(","),
    assetCount: assetManifest.counts.total,
    assetStats: body?.exportPayload?.assetStats || body?.payload?.assetStats || body?.assetStats || null,
    exportSessionId,
    htmlPath,
    requestDir,
    rendererTimings: timings.toJSON()
  };
}

function materializeRenderImageAssets(localImageAssets, requestDir) {
  if (!localImageAssets.length) {
    return [];
  }

  const renderAssetDir = path.join(requestDir, "render-assets");
  fs.mkdirSync(renderAssetDir, { recursive: true });

  return localImageAssets.map((asset) => {
    const extension = extensionFromImageMime(asset.mimeType);
    const filename = `${asset.sha256}.${extension}`;
    const destination = path.join(renderAssetDir, filename);

    if (!fs.existsSync(destination)) {
      try {
        fs.linkSync(asset.absolutePath, destination);
      } catch (error) {
        if (!["EXDEV", "EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) {
          throw error;
        }
        fs.copyFileSync(asset.absolutePath, destination, fs.constants.COPYFILE_EXCL);
      }
    }

    return {
      ...asset,
      renderUrl: `render-assets/${filename}`
    };
  });
}

function sendRenderBundleError(response, artifact) {
  sendJson(response, artifact.statusCode || 500, {
    ok: false,
    error: artifact.error || "Bundle renderer failed.",
    ...(artifact.stdout ? { stdout: artifact.stdout } : {}),
    ...(artifact.stderr ? { stderr: artifact.stderr } : {})
  });
}

function handlePreparedBundleDownload(url, response) {
  const encodedId = url.pathname.slice("/download-bundle/".length);
  let downloadId = "";

  try {
    downloadId = decodeURIComponent(encodedId);
  } catch (_) {
    sendJson(response, 400, { ok: false, error: "Invalid bundle download address." });
    return;
  }

  if (!/^[a-f0-9]{48}$/.test(downloadId)) {
    sendJson(response, 404, { ok: false, error: "Prepared bundle was not found." });
    return;
  }

  const prepared = preparedBundleDownloads.get(downloadId);

  if (!prepared) {
    sendJson(response, 404, { ok: false, error: "Prepared bundle was not found or has expired." });
    return;
  }

  if (prepared.expiresAt <= Date.now()) {
    expirePreparedBundleDownload(downloadId);
    sendJson(response, 410, { ok: false, error: "Prepared bundle has expired." });
    return;
  }

  if (!fs.existsSync(prepared.zipPath)) {
    preparedBundleDownloads.delete(downloadId);
    sendJson(response, 410, { ok: false, error: "Prepared bundle file is no longer available." });
    return;
  }

  response.writeHead(200, {
    "Content-Type": "application/zip",
    "Content-Length": prepared.size,
    "Content-Disposition": makeContentDisposition(prepared.filename),
    "Cache-Control": "no-store, max-age=0",
    "X-Content-Type-Options": "nosniff"
  });

  const stream = fs.createReadStream(prepared.zipPath);
  stream.on("error", (error) => {
    if (!response.headersSent) {
      sendJson(response, 500, { ok: false, error: error.message || String(error) });
      return;
    }
    response.destroy(error);
  });
  stream.pipe(response);
}

function expirePreparedBundleDownload(downloadId) {
  const prepared = preparedBundleDownloads.get(downloadId);
  if (!prepared) {
    return;
  }

  preparedBundleDownloads.delete(downloadId);
  try {
    fs.unlinkSync(prepared.zipPath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn(`[advanced-pdf-server] Could not remove expired prepared bundle: ${error.message || error}`);
    }
  }
}

function buildBundleAssetEntries(assetManifest, cacheRoot) {
  const root = path.resolve(cacheRoot || ".");
  const prefix = `${root}${path.sep}`;
  const seen = new Set();
  const entries = [];

  for (const asset of assetManifest?.assets || []) {
    const entryName = String(asset?.cachePath || "").replace(/\\/g, "/");

    if (asset?.storage !== "local-cache" || !entryName || seen.has(entryName)) {
      continue;
    }

    const absolutePath = path.resolve(root, entryName);
    if (!absolutePath.startsWith(prefix) || !fs.existsSync(absolutePath)) {
      continue;
    }

    seen.add(entryName);
    entries.push({
      name: entryName,
      path: absolutePath
    });
  }

  return entries;
}


async function createZipArchiveFile(entries, outputPath) {
  if (entries.length > 0xffff) {
    throw new Error(`ZIP contains too many entries for the portable archive writer: ${entries.length}.`);
  }

  const centralParts = [];
  const temporaryPaths = new Set();
  let offset = 0;
  const output = await fs.promises.open(outputPath, "wx");

  try {
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const name = normalizeZipEntryName(entry.name);
      const nameBytes = Buffer.from(name, "utf8");
      const prepared = await prepareZipFileEntry(entry.path, name, outputPath, index);

      if (prepared.temporaryPath) {
        temporaryPaths.add(prepared.temporaryPath);
      }

      assertClassicZipRange(prepared.uncompressedSize, "ZIP entry uncompressed size");
      assertClassicZipRange(prepared.compressedSize, "ZIP entry compressed size");
      assertClassicZipRange(offset, "ZIP local header offset");
      const { dosTime, dosDate } = getDosDateTime(prepared.modifiedAt);
      const localHeader = Buffer.alloc(30 + nameBytes.length);

      localHeader.writeUInt32LE(0x04034b50, 0);
      localHeader.writeUInt16LE(20, 4);
      localHeader.writeUInt16LE(0x0800, 6);
      localHeader.writeUInt16LE(prepared.compressionMethod, 8);
      localHeader.writeUInt16LE(dosTime, 10);
      localHeader.writeUInt16LE(dosDate, 12);
      localHeader.writeUInt32LE(prepared.checksum, 14);
      localHeader.writeUInt32LE(prepared.compressedSize, 18);
      localHeader.writeUInt32LE(prepared.uncompressedSize, 22);
      localHeader.writeUInt16LE(nameBytes.length, 26);
      localHeader.writeUInt16LE(0, 28);
      nameBytes.copy(localHeader, 30);

      const centralHeader = Buffer.alloc(46 + nameBytes.length);
      centralHeader.writeUInt32LE(0x02014b50, 0);
      centralHeader.writeUInt16LE(20, 4);
      centralHeader.writeUInt16LE(20, 6);
      centralHeader.writeUInt16LE(0x0800, 8);
      centralHeader.writeUInt16LE(prepared.compressionMethod, 10);
      centralHeader.writeUInt16LE(dosTime, 12);
      centralHeader.writeUInt16LE(dosDate, 14);
      centralHeader.writeUInt32LE(prepared.checksum, 16);
      centralHeader.writeUInt32LE(prepared.compressedSize, 20);
      centralHeader.writeUInt32LE(prepared.uncompressedSize, 24);
      centralHeader.writeUInt16LE(nameBytes.length, 28);
      centralHeader.writeUInt16LE(0, 30);
      centralHeader.writeUInt16LE(0, 32);
      centralHeader.writeUInt16LE(0, 34);
      centralHeader.writeUInt16LE(0, 36);
      centralHeader.writeUInt32LE(0, 38);
      centralHeader.writeUInt32LE(offset, 42);
      nameBytes.copy(centralHeader, 46);

      await output.write(localHeader);
      await appendFileToHandle(output, prepared.dataPath);
      centralParts.push(centralHeader);
      offset += localHeader.length + prepared.compressedSize;

      if (prepared.temporaryPath) {
        fs.rmSync(prepared.temporaryPath, { force: true });
        temporaryPaths.delete(prepared.temporaryPath);
      }
    }

    const centralDirectory = Buffer.concat(centralParts);
    assertClassicZipRange(offset, "ZIP central directory offset");
    assertClassicZipRange(centralDirectory.length, "ZIP central directory size");
    const endRecord = Buffer.alloc(22);

    endRecord.writeUInt32LE(0x06054b50, 0);
    endRecord.writeUInt16LE(0, 4);
    endRecord.writeUInt16LE(0, 6);
    endRecord.writeUInt16LE(entries.length, 8);
    endRecord.writeUInt16LE(entries.length, 10);
    endRecord.writeUInt32LE(centralDirectory.length, 12);
    endRecord.writeUInt32LE(offset, 16);
    endRecord.writeUInt16LE(0, 20);

    await output.write(centralDirectory);
    await output.write(endRecord);
  } catch (error) {
    await output.close().catch(() => {});
    fs.rmSync(outputPath, { force: true });
    throw error;
  } finally {
    for (const temporaryPath of temporaryPaths) {
      fs.rmSync(temporaryPath, { force: true });
    }
  }

  await output.close();
  return fs.statSync(outputPath).size;
}

async function prepareZipFileEntry(filePath, name, outputPath, index) {
  const stats = fs.statSync(filePath);

  if (!stats.isFile()) {
    throw new Error(`ZIP source is not a file: ${filePath}`);
  }

  if (shouldDeflateZipEntry(name, stats.size)) {
    const temporaryPath = `${outputPath}.${index}.deflate`;
    let crc = 0xffffffff;
    let uncompressedSize = 0;
    const meter = new Transform({
      transform(chunk, _encoding, callback) {
        crc = updateCrc32(crc, chunk);
        uncompressedSize += chunk.length;
        callback(null, chunk);
      }
    });
    await pipeline(
      fs.createReadStream(filePath),
      meter,
      zlib.createDeflateRaw({ level: 6 }),
      fs.createWriteStream(temporaryPath, { flags: "wx" })
    );
    const compressedSize = fs.statSync(temporaryPath).size;

    if (compressedSize < uncompressedSize) {
      return {
        checksum: (crc ^ 0xffffffff) >>> 0,
        compressedSize,
        uncompressedSize,
        compressionMethod: 8,
        dataPath: temporaryPath,
        temporaryPath,
        modifiedAt: stats.mtime
      };
    }

    fs.rmSync(temporaryPath, { force: true });
  }

  const inspected = await inspectZipFile(filePath);
  return {
    ...inspected,
    compressedSize: inspected.uncompressedSize,
    compressionMethod: 0,
    dataPath: filePath,
    temporaryPath: "",
    modifiedAt: stats.mtime
  };
}

async function inspectZipFile(filePath) {
  let crc = 0xffffffff;
  let uncompressedSize = 0;

  for await (const chunk of fs.createReadStream(filePath)) {
    crc = updateCrc32(crc, chunk);
    uncompressedSize += chunk.length;
  }

  return {
    checksum: (crc ^ 0xffffffff) >>> 0,
    uncompressedSize
  };
}

async function appendFileToHandle(output, filePath) {
  for await (const chunk of fs.createReadStream(filePath)) {
    await output.write(chunk);
  }
}

function shouldDeflateZipEntry(name, size) {
  return size >= 256 && /\.(?:json|jsonl|md|txt|csv|tsv|html|xml|svg)$/i.test(String(name || ""));
}

function assertClassicZipRange(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error(`${label} exceeds the 4 GiB portable ZIP limit. ZIP64 support is required for this archive.`);
  }
}

function normalizeZipEntryName(name) {
  return String(name || "file")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\.\.(?:\/|$)/g, "")
    || "file";
}

function getDosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  return {
    dosTime: (hours << 11) | (minutes << 5) | seconds,
    dosDate: ((year - 1980) << 9) | (month << 5) | day
  };
}

function updateCrc32(crc, buffer) {
  for (let index = 0; index < buffer.length; index += 1) {
    crc = CRC32_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }
  return crc;
}

function createCrc32Table() {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
}

const CRC32_TABLE = createCrc32Table();

function runRenderer({ jsonPath, htmlPath, pdfPath, baseName }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [
      RENDER_SCRIPT,
      jsonPath,
      "--out",
      pdfPath,
      "--html",
      htmlPath,
      "--name",
      baseName
    ], {
      cwd: ROOT_DIR,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      resolve({
        ok: code === 0 && fs.existsSync(pdfPath),
        code,
        stdout,
        stderr
      });
    });
  });
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    request.on("data", (chunk) => {
      total += chunk.length;

      if (total > MAX_BODY_BYTES) {
        reject(new Error(`Request body is too large. Limit is ${MAX_BODY_BYTES} bytes.`));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });

    request.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new Error(`Invalid JSON body: ${error.message || error}`));
      }
    });

    request.on("error", reject);
  });
}

function setCorsHeaders(request, response) {
  const origin = request.headers.origin || "*";
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Convo-Vault-Token, x-convo-vault-token, Authorization, authorization, *");
  response.setHeader("Access-Control-Allow-Private-Network", "true");
  response.setHeader("Access-Control-Max-Age", "86400");
  response.setHeader("Access-Control-Expose-Headers", [
    "Content-Disposition",
    "X-PDF-Engine",
    "X-Markdown-Engine",
    "X-Data-Engine",
    "X-Renderer-HTML",
    "X-Data-Dir",
    "X-Data-Files",
    "X-Page-Count",
    "X-Capture-Warning",
    "X-Asset-Count",
    "X-Bundle-Timings"
  ].join(", "));
}

function isLocalApiAuthorized(request) {
  if (!LOCAL_API_TOKEN) {
    const origin = String(request.headers.origin || "").toLowerCase();
    if (!origin) return true;
    return (
      origin === "https://chatgpt.com"
      || origin === "https://gemini.google.com"
      || origin.startsWith("chrome-extension://")
      || origin.startsWith("moz-extension://")
      || origin === "http://localhost:38474"
      || origin === "http://127.0.0.1:38474"
    );
  }

  const providedToken = String(request.headers[LOCAL_API_TOKEN_HEADER] || "").trim();
  return timingSafeEqualText(providedToken, LOCAL_API_TOKEN);
}

function timingSafeEqualText(left, right) {
  const leftBytes = Buffer.from(String(left || ""), "utf8");
  const rightBytes = Buffer.from(String(right || ""), "utf8");

  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBytes, rightBytes);
}

function sendJson(response, statusCode, payload) {
  const body = Buffer.from(JSON.stringify(payload, null, 2), "utf8");
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length
  });
  response.end(body);
}

function makeContentDisposition(filename) {
  const fallback = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function createTimings() {
  const startedAt = Date.now();
  const marks = {};

  return {
    mark(name) {
      marks[name] = Date.now() - startedAt;
    },
    toJSON() {
      return {
        totalMs: Date.now() - startedAt,
        marks
      };
    }
  };
}

function stripExtension(filename, extension) {
  return String(filename || "").replace(new RegExp(`\\.${extension}$`, "i"), "");
}

function sanitizeFilename(value) {
  return String(value || "chatgpt-conversation")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 96) || "chatgpt-conversation";
}

function readPackageVersion() {
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
    return packageJson.version || "";
  } catch (_) {
    return "";
  }
}

function getCacheRoot() {
  const cacheRoot = process.env.CGCE_CACHE_DIR || DEFAULT_CACHE_ROOT;
  fs.mkdirSync(cacheRoot, { recursive: true });
  return cacheRoot;
}
