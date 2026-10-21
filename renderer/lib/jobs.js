const fs = require("fs");
const crypto = require("crypto");
const { EXPORT_JOB_ID_PATTERN, EXPORT_JOB_TTL_MS, LOCAL_API_TOKEN } = require("./config");
const { isLocalApiAuthorized, isLocalProcessRequest, makeContentDisposition, readJsonBody, sendJson } = require("./http-utils");

// Export jobs let a local program (the CLI or an agent skill) ask the extension
// to export a conversation without anyone touching the selector panel.
const exportJobs = new Map();

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
  const job = {
    id: jobId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    state: "waiting",
    message: "Waiting for the browser extension to pick up the job.",
    options: {
      allowIncomplete: body?.allowIncomplete === true,
      closeTab: body?.closeTab !== false,
      // A ping job only proves the extension is installed and answering.
      ping: body?.ping === true,
      // Makes the extension reload itself, so a rebuilt extension takes effect without clicking.
      reload: body?.reload === true,
      // false skips the PDF: a data-only bundle needs no headless Chrome.
      pdf: body?.pdf !== false,
      // true downloads uploaded and generated files into assets/files/; off by default.
      files: body?.files === true
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

module.exports = {
  completeExportJob,
  handleJobRequest
};
