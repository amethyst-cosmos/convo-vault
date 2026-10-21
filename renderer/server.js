#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const { HOST, LOCAL_API_TOKEN, PORT, WORK_DIR, getCacheRoot, readPackageVersion } = require("./lib/config");
const { handlePrepareRenderBundle, handlePreparedBundleDownload } = require("./lib/bundle");
const { handleCreateExportSession, handleDeleteExportSession, handleExportSessionAsset } = require("./lib/export-sessions");
const { handleJobRequest } = require("./lib/jobs");
const { isLocalApiAuthorized, isLocalProcessRequest, sendJson, setCorsHeaders } = require("./lib/http-utils");

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
      console.log(`[renderer] Idle for ${Math.round(IDLE_EXIT_MS / 1000)}s, exiting.`);
      process.exit(0);
    }
  }, Math.max(250, Math.min(30_000, IDLE_EXIT_MS / 2))).unref();
}

server.listen(PORT, HOST, () => {
  console.log(`[renderer] Listening on http://${HOST}:${PORT}`);
  console.log(`[renderer] Local API token: ${LOCAL_API_TOKEN ? "required" : "not configured; browser-origin requests will be rejected"}`);
  console.log("[renderer] Endpoints: GET /health, POST /shutdown, POST /jobs, GET /jobs/:id, POST /export-sessions, PUT /export-sessions/:id/assets/:sourceKey, PUT /export-sessions/:id/files/:key, DELETE /export-sessions/:id, POST /prepare-render-bundle, GET /download-bundle/:id");
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

  const exportFileMatch = url.pathname.match(/^\/export-sessions\/([a-f0-9]{48})\/files\/([a-f0-9]{64})$/);
  if (request.method === "PUT" && exportFileMatch) {
    await handleExportSessionAsset(request, response, exportFileMatch[1], exportFileMatch[2], { kind: "file" });
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

function handleShutdown(response) {
  sendJson(response, 200, {
    ok: true,
    shuttingDown: true
  });

  console.log("[renderer] Shutdown requested.");
  setTimeout(() => {
    server.close(() => {
      process.exit(0);
    });
  }, 150);
}
