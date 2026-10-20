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

  assert.equal(rootPackage.version, "0.11.0");
  assert.equal(manifest.version, rootPackage.version);
  assert.equal(backendPackage.version, rootPackage.version);
  assert.match(content, new RegExp(`EXPORTER_VERSION = "${escapeRegExp(rootPackage.version)}"`));
});

test("docs carry the project version", async () => {
  const { version } = await readJson("package.json");
  const popup = await readFile(path.join(repoRoot, "popup.html"), "utf8");
  const readme = await readFile(path.join(repoRoot, "README.md"), "utf8");
  const readmeZh = await readFile(path.join(repoRoot, "README.zh-CN.md"), "utf8");
  const changelog = await readFile(path.join(repoRoot, "CHANGELOG.md"), "utf8");
  const changelogZh = await readFile(path.join(repoRoot, "CHANGELOG.zh-CN.md"), "utf8");

  assert.ok(popup.includes(`v${version}`), "popup.html version");
  assert.ok(readme.includes(`Current version: \`${version}\``), "README.md current version");
  assert.ok(readme.includes(`version-${version}-`), "README.md badge");
  assert.ok(readmeZh.includes(`当前版本：\`${version}\``), "README.zh-CN.md current version");
  assert.ok(readmeZh.includes(`version-${version}-`), "README.zh-CN.md badge");
  assert.match(changelog, new RegExp(`^## ${escapeRegExp(version)}$`, "m"), "CHANGELOG.md entry");
  assert.match(changelogZh, new RegExp(`^## ${escapeRegExp(version)}$`, "m"), "CHANGELOG.zh-CN.md entry");
});

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(repoRoot, relativePath), "utf8"));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
