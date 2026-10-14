import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("project version is synchronized", async () => {
  const rootPackage = await readJson("package.json");
  const manifest = await readJson("manifest.json");
  const backendPackage = await readJson(path.join("tools", "advanced-pdf", "package.json"));
  const content = await readFile(path.join(repoRoot, "content.js"), "utf8");

  assert.equal(rootPackage.version, "0.9.1");
  assert.equal(manifest.version, rootPackage.version);
  assert.equal(backendPackage.version, rootPackage.version);
  assert.match(content, new RegExp(`EXPORTER_VERSION = "${escapeRegExp(rootPackage.version)}"`));
});

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(repoRoot, relativePath), "utf8"));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
