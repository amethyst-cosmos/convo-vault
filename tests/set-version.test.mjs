import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { CHANGELOG_PLACEHOLDER, setVersion } from "../scripts/set-version.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const FILES = [
  "package.json",
  "package-lock.json",
  "renderer/package.json",
  "extension/manifest.json",
  "extension/content/index.js",
  "extension/popup/popup.html",
  "README.md",
  "README.zh-CN.md",
  "CHANGELOG.md",
  "CHANGELOG.zh-CN.md"
];

async function copyProject(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "convo-vault-set-version-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  for (const file of FILES) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await cp(path.join(repoRoot, file), path.join(root, file));
  }

  return root;
}

const read = (root, file) => readFile(path.join(root, file), "utf8");

test("set-version writes the new version into every file that carries it", async (t) => {
  const root = await copyProject(t);
  const changed = await setVersion(root, "9.8.7");

  for (const file of ["package.json", "renderer/package.json", "extension/manifest.json"]) {
    assert.equal(JSON.parse(await read(root, file)).version, "9.8.7", file);
  }
  const lock = JSON.parse(await read(root, "package-lock.json"));
  assert.equal(lock.version, "9.8.7");
  assert.equal(lock.packages[""].version, "9.8.7");
  assert.match(await read(root, "extension/content/index.js"), /EXPORTER_VERSION = "9\.8\.7"/);
  assert.match(await read(root, "extension/popup/popup.html"), />v9\.8\.7</);
  assert.match(await read(root, "README.md"), /Current version: `9\.8\.7`/);
  assert.match(await read(root, "README.md"), /badge\/version-9\.8\.7-/);
  assert.match(await read(root, "README.zh-CN.md"), /当前版本：`9\.8\.7`/);
  assert.match(await read(root, "README.zh-CN.md"), /badge\/version-9\.8\.7-/);
  assert.ok(changed.length >= FILES.length - 1, changed.join(", "));
});

test("set-version adds an empty entry to both changelogs once, above the newest one", async (t) => {
  const root = await copyProject(t);
  await setVersion(root, "9.8.7");
  await setVersion(root, "9.8.7");

  for (const file of ["CHANGELOG.md", "CHANGELOG.zh-CN.md"]) {
    const text = await read(root, file);
    assert.equal(text.match(/^## 9\.8\.7$/gm).length, 1, file);
    assert.equal(text.split(CHANGELOG_PLACEHOLDER).length - 1, 1, `${file} placeholder`);
    assert.ok(text.indexOf("## 9.8.7") < text.search(/^## 0\./m), `${file}: new entry comes first`);
  }
});

test("set-version leaves an existing changelog entry alone and rejects a bad version", async (t) => {
  const root = await copyProject(t);
  const { version } = JSON.parse(await read(root, "package.json"));
  const before = await read(root, "CHANGELOG.md");

  await setVersion(root, version);

  assert.equal(await read(root, "CHANGELOG.md"), before);
  assert.ok(!(await read(root, "CHANGELOG.md")).includes(CHANGELOG_PLACEHOLDER));
  await assert.rejects(() => setVersion(root, "1.2"), /not a version/);
  await assert.rejects(() => setVersion(root, "v1.2.3"), /not a version/);
});
