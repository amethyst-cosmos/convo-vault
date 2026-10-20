import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const {
  buildAssetManifest,
  buildOutputObjectIndex,
  dedupeEmbeddedImageAssets,
  externalizeEmbeddedImageAssets
} = require("../renderer/lib/assets.js");

test("asset manifest deduplicates cached AI image bytes and references user files", async () => {
  const cacheRoot = await mkdtemp(path.join(os.tmpdir(), "convo-vault-assets-"));
  const onePixelPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
  const payload = {
    title: "Asset test",
    source: "https://chatgpt.com/c/test",
    exportedAt: "2026-07-09T00:00:00.000Z",
    captureMode: "fast",
    messages: [
      {
        id: "assistant-1",
        role: "assistant",
        turnNumber: 1,
        markdown: `![generated image](${onePixelPng})`
      },
      {
        id: "assistant-2",
        role: "assistant",
        turnNumber: 2,
        markdown: `![generated image again](${onePixelPng})`
      },
      {
        id: "user-1",
        role: "user",
        turnNumber: 3,
        markdown: "[File: notes.pdf](https://example.test/notes.pdf)"
      }
    ]
  };

  const manifest = buildAssetManifest(payload, { cacheRoot });
  const cachedImages = manifest.assets.filter((asset) => asset.storage === "local-cache");
  const fileReferences = manifest.assets.filter((asset) => asset.kind === "file");

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.conversation.captureMode, "fast");
  assert.equal(cachedImages.length, 1);
  assert.equal(cachedImages[0].origin, "ai-generated");
  assert.equal(cachedImages[0].references.length, 2);
  assert.equal(fileReferences.length, 1);
  assert.equal(fileReferences[0].storage, "reference-only");

  const cachedImagePath = path.join(cacheRoot, cachedImages[0].cachePath);
  assert.equal((await stat(cachedImagePath)).isFile(), true);
  assert.equal((await readFile(cachedImagePath)).length, cachedImages[0].sizeBytes);
});

test("asset manifest detects image bytes when the data URI MIME is generic", async () => {
  const cacheRoot = await mkdtemp(path.join(os.tmpdir(), "convo-vault-assets-sniff-"));
  const genericPng = "data:application/octet-stream;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
  const payload = {
    title: "Generic image MIME test",
    messages: [{
      id: "user-image",
      role: "user",
      turnNumber: 1,
      markdown: `![Uploaded image](${genericPng})`
    }]
  };

  const manifest = buildAssetManifest(payload, { cacheRoot });
  const image = manifest.assets.find((asset) => asset.storage === "local-cache");

  assert.equal(image.kind, "image");
  assert.equal(image.mimeType, "image/png");
  assert.match(image.cachePath, /\.png$/);
  assert.equal((await stat(path.join(cacheRoot, image.cachePath))).isFile(), true);
});

test("staged local images render from files and remain portable bundle references", async () => {
  const cacheRoot = await mkdtemp(path.join(os.tmpdir(), "convo-vault-assets-staged-"));
  const source = "sediment://file_00000000aaaaaaaaaaaaaaaaaaaaaaaa";
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const sourceKey = createHash("sha256").update(source).digest("hex");
  const cachePath = `assets/sha256/${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${sha256}.png`;
  const absolutePath = path.join(cacheRoot, ...cachePath.split("/"));
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, bytes);
  const localImageAssets = [{
    sourceKey,
    sha256,
    mimeType: "image/png",
    sizeBytes: bytes.length,
    cachePath,
    renderUrl: `render-assets/${sha256}.png`
  }];
  const payload = {
    title: "Staged image",
    messages: [{
      id: "user-staged-image",
      role: "user",
      turnNumber: 1,
      markdown: `![Staged image](${source})`
    }]
  };

  const manifest = buildAssetManifest(payload, { cacheRoot, localImageAssets });
  const renderPayload = dedupeEmbeddedImageAssets(payload, manifest, {
    localImageAssets,
    renderLocalFiles: true
  });
  const bundlePayload = externalizeEmbeddedImageAssets(payload, manifest, { localImageAssets });
  const image = manifest.assets.find((asset) => asset.kind === "image");

  assert.equal(image.sha256, sha256);
  assert.equal(image.storage, "local-cache");
  assert.equal(manifest.outputObjectCounts.degraded, 0);
  assert.equal(manifest.outputObjectCounts.total, 1);
  assert.equal(renderPayload.messages[0].markdown, `![Staged image](render-assets/${sha256}.png)`);
  assert.equal(bundlePayload.messages[0].markdown, `![Staged image](${cachePath})`);
});

test("bundle payload externalizes and deduplicates repeated embedded image layers", async () => {
  const cacheRoot = await mkdtemp(path.join(os.tmpdir(), "convo-vault-assets-externalized-"));
  const first = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
  const second = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
  const payload = {
    title: "Layered generated images",
    messages: [{
      id: "assistant-gallery",
      role: "assistant",
      turnNumber: 1,
      markdown: [
        `![first main](${first})`,
        `![first preview](${first})`,
        `![first blur](${first})`,
        `![second main](${second})`,
        `![second preview](${second})`,
        "## Intentional reuse",
        `![first reused](${first})`
      ].join("\n\n")
    }]
  };

  const manifest = buildAssetManifest(payload, { cacheRoot });
  const renderPayload = dedupeEmbeddedImageAssets(payload, manifest);
  const externalized = externalizeEmbeddedImageAssets(payload, manifest);
  const markdown = externalized.messages[0].markdown;
  const renderMarkdown = renderPayload.messages[0].markdown;

  assert.equal(manifest.assets.filter((asset) => asset.storage === "local-cache").length, 2);
  assert.equal(manifest.outputObjectCounts.total, 6);
  assert.equal((renderMarkdown.match(/data:image\//g) || []).length, 3);
  assert.match(renderMarkdown, /Intentional reuse[\s\S]*first reused/);
  assert.doesNotMatch(renderMarkdown, /first preview|first blur|second preview/);
  assert.equal((markdown.match(/!\[[^\]]*]\(assets\/sha256\//g) || []).length, 3);
  assert.doesNotMatch(markdown, /data:image\//);
  assert.match(markdown, /Intentional reuse[\s\S]*first reused/);
  assert.doesNotMatch(markdown, /first preview|first blur|second preview/);
});

test("output object index classifies static, reference, and degraded export objects", () => {
  const payload = {
    title: "Output objects",
    messages: [
      {
        id: "assistant-output",
        role: "assistant",
        turnNumber: 1,
        markdown: [
          "Inline formula: \\(x + y\\).",
          "",
          "$$",
          "x = y + z",
          "$$",
          "",
          "```mermaid",
          "sequenceDiagram",
          "  A->>B: hello",
          "```",
          "",
          "```mermaid",
          "erDiagram",
          "  USER ||--o{ FILE : owns",
          "```",
          "",
          "![remote](https://example.test/remote.png)",
          "![animated](https://example.test/animated.gif)",
          "[File: report.pdf](https://example.test/report.pdf)",
          "[File: model.xlsx](https://example.test/model.xlsx)",
          "[File: demo.mp4](https://example.test/demo.mp4)",
          "[Interactive: Dashboard](https://example.test/dashboard)",
          "[Source: Docs](https://example.test/docs)"
        ].join("\n")
      }
    ]
  };

  const index = buildOutputObjectIndex(payload);

  assert.equal(index.counts.total, 11);
  assert.equal(index.counts.degraded, 4);
  assert.deepEqual(index.counts.byKind, {
    math: 2,
    diagram: 2,
    image: 1,
    gif: 1,
    document: 1,
    spreadsheet: 1,
    video: 1,
    interactive: 1,
    citation: 1
  });
  assert.equal(index.counts.byDegradationReason["remote-image-reference-only"], 1);
  assert.equal(index.counts.byDegradationReason["animated-media-static-poster"], 1);
  assert.equal(index.counts.byDegradationReason["media-not-playable-in-pdf"], 1);
  assert.equal(index.counts.byDegradationReason["interactive-content-static-record"], 1);
  assert.ok(index.objects.every((object) => object.objectId && object.messageId === "assistant-output"));
});

test("sediment asset pointer with hash correctly extracts file ID", async () => {
  const pointer = "sediment://5b41352fcf08b9f#file_00000000968881fa85680179ee957d99#p_0.4394d890bd.jpg";
  const fileMatch = pointer.match(/(file_[a-f0-9]{32}|file-[a-zA-Z0-9_-]+)/i);
  assert.equal(fileMatch?.[1], "file_00000000968881fa85680179ee957d99");
});
