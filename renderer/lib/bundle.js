const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { buildAssetManifest, dedupeEmbeddedImageAssets, externalizeEmbeddedImageAssets } = require("./assets");
const { buildMarkdownDocument, normalizePayload, writeDataSidecars } = require("./bundle-content");
const { BUNDLE_DOWNLOAD_TTL_MS, RENDER_SCRIPT, ROOT_DIR, WORK_DIR, getCacheRoot } = require("./config");
const { exportSessions, extensionFromImageMime, getActiveExportSession } = require("./export-sessions");
const { completeExportJob } = require("./jobs");
const { makeContentDisposition, readJsonBody, sendJson } = require("./http-utils");
const { createZipArchiveFile } = require("./zip");

const preparedBundleDownloads = new Map();

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
      console.warn(`[renderer] Could not remove expired prepared bundle: ${error.message || error}`);
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

module.exports = {
  handlePrepareRenderBundle,
  handlePreparedBundleDownload
};
