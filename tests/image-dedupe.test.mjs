import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildContentScript } from "../scripts/lib/content-build.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("DOM image markdown deduplicates ChatGPT asset layers by stable file id", async () => {
  const source = await buildContentScript(repoRoot);
  const functions = source.match(/  function dedupeMarkdownImageReferences[\s\S]+?(?=\n  function countEmbeddedMarkdownImages)/)?.[0];
  assert.ok(functions, "Expected image dedupe helpers in the content source");

  const context = vm.createContext({
    cleanMarkdown(value) {
      return String(value || "").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    },
    location: { href: "https://chatgpt.com/c/example" },
    URL
  });
  vm.runInContext(`${functions}\nglobalThis.__dedupeImages = dedupeMarkdownImageReferences;`, context);

  const firstA = "https://chatgpt.com/backend-api/estuary/content?id=file_abc&sig=one&v=0";
  const firstB = "https://chatgpt.com/backend-api/estuary/content?id=file_abc&sig=two&v=0";
  const second = "https://chatgpt.com/backend-api/estuary/content?id=file_xyz&sig=three&v=0";
  const thumbnail = "https://chatgpt.com/backend-api/files/file_abc/thumbnail";
  const note = "<!-- Image base64 embedding is temporarily disabled during scanning to avoid page side effects. -->";
  const markdown = [
    `![first main](${firstA})`,
    note,
    `![first preview](${firstB})`,
    note,
    `![first thumbnail](${thumbnail})`,
    note,
    `![second main](${second})`,
    note,
    "## Intentional reuse",
    `![first reused](${firstA})`
  ].join("\n\n");

  const deduped = context.__dedupeImages(markdown);

  assert.equal((deduped.match(/!\[[^\]]*]\(/g) || []).length, 4);
  assert.match(deduped, /first main/);
  assert.match(deduped, /first thumbnail/);
  assert.match(deduped, /second main/);
  assert.match(deduped, /Intentional reuse[\s\S]*first reused/);
  assert.doesNotMatch(deduped, /first preview|sig=two/);
});
