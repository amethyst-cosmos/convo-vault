import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { writeDebugPack } from "../cli/lib/debug-pack.mjs";
import { readZip } from "../cli/lib/zip-reader.mjs";
import { createZipFromDirectory } from "../scripts/lib/simple-zip.mjs";

test("public debug pack exports aggregate counts and excludes all source material", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "convo-vault-debug-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const source = path.join(dir, "source");
  await mkdir(source);
  const privateValue = "private-example@example.test";
  await writeFile(path.join(source, "personal.conversation.json"), JSON.stringify({ messageCount: 10, title: privateValue, source: privateValue }));
  await writeFile(path.join(source, "personal.assets.manifest.json"), JSON.stringify({
    assets: [{ kind: "image", storage: "local-cache", sourceUrl: privateValue }, { kind: "image", storage: "reference-only", label: privateValue }],
    fileDownload: { requested: true, total: 1, stored: 0, failed: 1, error: privateValue },
    outputObjectCounts: { degraded: 1 }
  }));
  await writeFile(path.join(source, "personal.md"), privateValue);

  const bundlePath = path.join(dir, "personal.zip");
  await createZipFromDirectory(source, bundlePath);
  const destination = path.join(dir, "public.zip");
  await writeDebugPack(destination, { version: "0.17.1", checks: { browserDetected: true }, bundlePath });
  const pack = readZip(destination);
  assert.deepEqual(pack.entries.map((entry) => entry.name), ["diagnostics.json"]);
  const json = pack.data(pack.entries[0]).toString("utf8");
  assert.ok(!json.includes(privateValue) && !json.includes("personal") && !json.includes(dir));
  assert.deepEqual(JSON.parse(json).export, {
    messages: 10,
    images: { total: 2, embedded: 1, referenceOnly: 1 },
    files: { requested: true, total: 1, stored: 0, failed: 1 },
    degradedObjects: 1
  });
});
