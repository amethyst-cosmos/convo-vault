import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readZip } from "../scripts/lib/zip-reader.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("release package holds the extension, CLI, renderer and skill without dependencies", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "convo-vault-package-"));
  const { version } = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));

  try {
    const result = spawnSync(process.execPath, [path.join(repoRoot, "scripts", "package-release.mjs"), "--out-dir", outDir], {
      cwd: repoRoot,
      encoding: "utf8"
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const names = readZip(path.join(outDir, `convo-vault-${version}.zip`)).entries.map((entry) => entry.name);
    const root = `convo-vault-${version}`;

    for (const expected of [
      "README.md",
      "dist/convo-vault-extension/manifest.json",
      "dist/convo-vault-extension/content.js",
      "scripts/convo-vault.mjs",
      "skills/convo-vault/SKILL.md",
      "tools/advanced-pdf/server.js",
      "tools/advanced-pdf/package.json"
    ]) {
      assert.ok(names.includes(`${root}/${expected}`), `missing ${expected}`);
    }

    assert.ok(!names.some((name) => name.includes("node_modules")), "node_modules must not ship");
    assert.ok(!names.some((name) => name.includes("/tests/")), "tests must not ship");
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
