import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readZip } from "../cli/lib/zip-reader.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("release package holds the prebuilt extension, CLI, renderer runtime and skill", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "convo-vault-package-"));
  const { version } = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));

  try {
    const result = spawnSync(process.execPath, [path.join(repoRoot, "scripts", "package-release.mjs"), "--out-dir", outDir], {
      cwd: repoRoot,
      encoding: "utf8"
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const zipPath = path.join(outDir, `convo-vault-${version}.zip`);
    const names = readZip(zipPath).entries.map((entry) => entry.name);
    const root = `convo-vault-${version}`;
    const sha256 = createHash("sha256").update(await readFile(zipPath)).digest("hex");
    assert.equal(await readFile(`${zipPath}.sha256`, "utf8"), `${sha256}  ${root}.zip\n`);

    for (const expected of [
      "README.md",
      "dist/convo-vault-extension/manifest.json",
      "dist/convo-vault-extension/content.js",
      "cli/convo-vault.mjs",
      "skills/convo-vault-skill/SKILL.md",
      "renderer/server.js",
      "renderer/package.json",
      "renderer/node_modules/markdown-it/package.json",
      "renderer/node_modules/playwright-core/package.json",
      "renderer/node_modules/highlight.js/package.json"
    ]) {
      assert.ok(names.includes(`${root}/${expected}`), `missing ${expected}`);
    }

    assert.ok(!names.some((name) => name.startsWith(`${root}/tests/`)), "project tests must not ship");
    assert.ok(!names.some((name) => name.includes("/node_modules/.bin/")), "platform-specific shims must not ship");
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
