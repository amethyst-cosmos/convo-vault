import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("cross-platform extension build creates loadable folder and zip", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "convo-vault-build-"));
  const rootPackage = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));

  try {
    const result = spawnSync(process.execPath, [
      path.join(repoRoot, "scripts", "build-extension.mjs"),
      "--out-dir",
      tempDir
    ], {
      cwd: repoRoot,
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);

    const extensionDir = path.join(tempDir, "convo-vault-extension");
    const zipPath = path.join(tempDir, "convo-vault-extension.zip");
    const manifest = JSON.parse(await readFile(path.join(extensionDir, "manifest.json"), "utf8"));
    const zipHeader = await readFile(zipPath);

    assert.equal(manifest.name, "Convo Vault");
    assert.equal(manifest.version, rootPackage.version);
    assert.equal((await stat(path.join(extensionDir, "content.js"))).isFile(), true);
    assert.equal((await stat(path.join(extensionDir, "icons", "icon-128.png"))).isFile(), true);
    assert.equal(zipHeader.subarray(0, 2).toString("utf8"), "PK");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
