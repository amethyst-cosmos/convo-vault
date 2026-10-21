const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Transform } = require("stream");
const { pipeline } = require("stream/promises");
const { pathToFileURL } = require("url");
const { EXPORT_SESSION_TTL_MS, MAX_EXPORT_ASSET_BYTES, getCacheRoot } = require("./config");
const { sendJson } = require("./http-utils");

const exportSessions = new Map();

function handleCreateExportSession(response) {
  const sessionId = crypto.randomBytes(24).toString("hex");
  const session = {
    id: sessionId,
    createdAt: Date.now(),
    expiresAt: Date.now() + EXPORT_SESSION_TTL_MS,
    totalBytes: 0,
    assetsBySourceKey: new Map(),
    filesBySourceKey: new Map()
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

async function handleExportSessionAsset(request, response, sessionId, sourceKey, options = {}) {
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
    const asset = await stageExportSessionAsset(request, session, sourceKey, options);
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

async function stageExportSessionAsset(request, session, sourceKey, options = {}) {
  const isFile = options.kind === "file";
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

  const mimeType = isFile
    ? String(request.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase() || "application/octet-stream"
    : detectUploadedImageMime(prefix, request.headers["content-type"]);
  if (!isFile && !mimeType.startsWith("image/")) {
    fs.rmSync(tempPath, { force: true });
    const error = new Error(`Export asset is not a supported image (${mimeType || "unknown type"}).`);
    error.statusCode = 415;
    throw error;
  }

  const sha256 = digest.digest("hex");
  const extension = isFile ? "bin" : extensionFromImageMime(mimeType);
  const cachePath = path.posix.join(
    "assets",
    isFile ? "files-store" : "sha256",
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
  (isFile ? session.filesBySourceKey : session.assetsBySourceKey).set(sourceKey, asset);
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

module.exports = {
  exportSessions,
  extensionFromImageMime,
  getActiveExportSession,
  handleCreateExportSession,
  handleDeleteExportSession,
  handleExportSessionAsset
};
