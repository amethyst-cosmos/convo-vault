import { constants, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createZipFromDirectory } from "../../scripts/lib/simple-zip.mjs";
import { readZip } from "./zip-reader.mjs";

export async function writeDebugPack(destination, { version, checks, bundlePath }) {
  // Construct the report from known fields. Never copy files or free text from
  // the export, logs, configuration, or browser profile into a shareable pack.
  const report = {
    schemaVersion: 1,
    productVersion: version,
    runtime: { platform: process.platform, architecture: process.arch, node: process.versions.node },
    checks: {
      rendererDependenciesInstalled: checks.rendererDependenciesInstalled,
      rendererRunning: checks.rendererRunning,
      rendererSupportsJobs: checks.rendererSupportsJobs,
      extensionBuildCurrent: checks.extensionBuildCurrent,
      browserDetected: checks.browserDetected,
      egoLiteDetected: checks.egoLiteDetected
    },
    ...(bundlePath ? { export: summarizeExport(bundlePath) } : {})
  };

  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "convo-vault-debug-"));
  try {
    const content = path.join(temp, "content");
    await fs.mkdir(content);
    await fs.writeFile(path.join(content, "diagnostics.json"), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    const zipPath = path.join(temp, "debug.zip");
    await createZipFromDirectory(content, zipPath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(zipPath, destination, constants.COPYFILE_EXCL);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

function summarizeExport(bundlePath) {
  const zip = readZip(bundlePath);
  function readReport(suffix) {
    const entry = zip.entries.find((item) => !item.name.includes("/") && item.name.endsWith(suffix));
    if (!entry || entry.uncompressedSize > 64 * 1024 * 1024) {
      throw new Error(`Expected a Convo Vault export with a readable ${suffix} report.`);
    }
    return JSON.parse(zip.data(entry).toString("utf8"));
  }

  const conversation = readReport(".conversation.json");
  const manifest = readReport(".assets.manifest.json");
  const images = (Array.isArray(manifest.assets) ? manifest.assets : []).filter((item) => item?.kind === "image");
  const embedded = images.filter((item) => item.storage === "local-cache").length;
  return {
    messages: count(conversation.messageCount),
    images: { total: images.length, embedded, referenceOnly: images.length - embedded },
    files: {
      requested: manifest.fileDownload?.requested === true,
      total: count(manifest.fileDownload?.total),
      stored: count(manifest.fileDownload?.stored),
      failed: count(manifest.fileDownload?.failed)
    },
    degradedObjects: count(manifest.outputObjectCounts?.degraded)
  };
}

function count(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
