const fs = require("fs");
const path = require("path");

const HOST = "127.0.0.1";

const PORT = Number(process.env.CGCE_ADVANCED_PDF_PORT || 38474);

const MAX_BODY_BYTES = Number(process.env.CGCE_ADVANCED_PDF_MAX_BODY_BYTES || 256 * 1024 * 1024);

const MAX_EXPORT_ASSET_BYTES = Number(process.env.CGCE_MAX_EXPORT_ASSET_BYTES || 128 * 1024 * 1024);

const LOCAL_API_TOKEN_HEADER = "x-convo-vault-token";

const LOCAL_API_TOKEN = String(process.env.CGCE_LOCAL_API_TOKEN || "").trim();

const ROOT_DIR = path.resolve(__dirname, "..", "..");

const WORK_DIR = path.join(ROOT_DIR, "tmp", "renderer-server");

const RENDER_SCRIPT = path.join(__dirname, "..", "render.js");

const DEFAULT_CACHE_ROOT = path.join(ROOT_DIR, ".convo-vault");

const BUNDLE_DOWNLOAD_TTL_MS = 10 * 60 * 1000;

const EXPORT_SESSION_TTL_MS = 30 * 60 * 1000;

const EXPORT_JOB_TTL_MS = 30 * 60 * 1000;

const EXPORT_JOB_ID_PATTERN = /^[a-f0-9]{48}$/;

function readPackageVersion() {
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
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

module.exports = {
  BUNDLE_DOWNLOAD_TTL_MS,
  EXPORT_JOB_ID_PATTERN,
  EXPORT_JOB_TTL_MS,
  EXPORT_SESSION_TTL_MS,
  HOST,
  LOCAL_API_TOKEN,
  LOCAL_API_TOKEN_HEADER,
  MAX_BODY_BYTES,
  MAX_EXPORT_ASSET_BYTES,
  PORT,
  RENDER_SCRIPT,
  ROOT_DIR,
  WORK_DIR,
  getCacheRoot,
  readPackageVersion
};
