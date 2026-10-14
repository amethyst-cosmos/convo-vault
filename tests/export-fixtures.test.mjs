import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { buildOutputObjectIndex } = require("../tools/advanced-pdf/assets.js");
const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");
const fixturesDir = path.join(repoRoot, "tests", "fixtures");
const outputDir = path.join(repoRoot, "tmp", "tests", "export-fixtures");

const cases = JSON.parse(
  await readFile(path.join(fixturesDir, "export-regression-cases.json"), "utf8")
);

const allowedCoverageTags = new Set([
  "unicode",
  "mixed-language",
  "latin-accents",
  "spanish",
  "italian",
  "french",
  "cjk",
  "japanese",
  "korean",
  "chinese",
  "emoji",
  "table",
  "code-block",
  "explicit-language",
  "rtl",
  "arabic",
  "hebrew",
  "mixed-direction",
  "output-matrix",
  "math",
  "advanced-math",
  "mermaid",
  "sequence-diagram",
  "state-diagram",
  "er-diagram",
  "unsupported-diagram",
  "chart",
  "bar-chart",
  "line-chart",
  "remote-image",
  "gif",
  "file-attachment",
  "video",
  "audio",
  "interactive",
  "citation",
  "degradation"
]);

test("export fixture manifest is self-consistent", async () => {
  assert.ok(cases.length >= 3);
  const names = new Set();

  for (const fixtureCase of cases) {
    assert.match(fixtureCase.name, /^[a-z0-9-]+$/);
    assert.equal(names.has(fixtureCase.name), false, `Duplicate fixture name: ${fixtureCase.name}`);
    names.add(fixtureCase.name);

    assert.match(fixtureCase.payload, /\.payload\.json$/);
    assert.equal(typeof fixtureCase.purpose, "string");
    assert.ok(fixtureCase.purpose.length >= 20);
    assert.ok(Array.isArray(fixtureCase.coverage));
    assert.ok(fixtureCase.coverage.length > 0);
    for (const tag of fixtureCase.coverage) {
      assert.ok(allowedCoverageTags.has(tag), `Unknown coverage tag in ${fixtureCase.name}: ${tag}`);
    }

    assert.ok(Array.isArray(fixtureCase.mustContain));
    assert.ok(fixtureCase.mustContain.length > 0);
    assert.ok(Array.isArray(fixtureCase.sourceMustContain || []));
    assert.ok(Array.isArray(fixtureCase.mustRenderContain || []));
    assert.ok(Array.isArray(fixtureCase.mustNotContain));
    for (const expected of [...fixtureCase.mustContain, ...(fixtureCase.sourceMustContain || [])]) {
      assert.equal(typeof expected, "string", `${fixtureCase.name} mustContain entry type`);
      assert.ok(expected.length > 0, `${fixtureCase.name} mustContain entry is empty`);
    }
    for (const forbidden of fixtureCase.mustNotContain) {
      assert.equal(typeof forbidden, "string", `${fixtureCase.name} mustNotContain entry type`);
      assert.ok(forbidden.length > 0, `${fixtureCase.name} mustNotContain entry is empty`);
    }

    const payload = await loadFixturePayload(fixtureCase);
    const payloadText = collectPayloadText(payload);
    const expectedLang = normalizeDocumentLanguage(payload.language || payload.locale || payload.documentLanguage);
    assert.equal(fixtureCase.expectedLang || "und", expectedLang);

    const expectedCounts = fixtureCase.expectedCounts || {};
    assertExpectedCountsShape(fixtureCase.name, expectedCounts);
    assert.equal(payload.messages.length, expectedCounts.messages, `${fixtureCase.name} message count`);
    assert.deepEqual(countRoles(payload.messages), expectedCounts.roles, `${fixtureCase.name} role counts`);
    assert.equal(countQaPairs(payload.messages), expectedCounts.qaPairs, `${fixtureCase.name} QA pair count`);
    assert.equal(countCodeBlocks(payload.messages), expectedCounts.codeBlocks, `${fixtureCase.name} code block count`);
    assert.equal(countMarkdownTables(payload.messages), expectedCounts.tables, `${fixtureCase.name} table count`);
    if (fixtureCase.expectedOutputObjects) {
      assertOutputObjectCounts(
        buildOutputObjectIndex(payload).counts,
        fixtureCase.expectedOutputObjects,
        fixtureCase.name
      );
    }

    for (const expected of [...fixtureCase.mustContain, ...(fixtureCase.sourceMustContain || [])]) {
      assert.ok(
        payloadText.includes(expected),
        `Fixture ${fixtureCase.name} mustContain is absent from source payload: ${expected}`
      );
    }

    for (const forbidden of fixtureCase.mustNotContain) {
      assert.ok(
        !payloadText.includes(forbidden),
        `Fixture ${fixtureCase.name} source payload already contains forbidden output: ${forbidden}`
      );
    }
  }
});

for (const fixtureCase of cases) {
  test(`advanced PDF HTML renderer preserves fixture text: ${fixtureCase.name}`, async () => {
    const fixturePath = path.join(fixturesDir, fixtureCase.payload);
    const htmlPath = path.join(outputDir, `${fixtureCase.name}.html`);

    await mkdir(outputDir, { recursive: true });
    await execFileAsync(process.execPath, [
      path.join(repoRoot, "tools", "advanced-pdf", "render.js"),
      fixturePath,
      "--html",
      htmlPath,
      "--html-only"
    ], {
      cwd: repoRoot,
      encoding: "utf8"
    });

    const html = await readFile(htmlPath, "utf8");

    assert.match(html, new RegExp(`<html lang="${escapeRegExp(fixtureCase.expectedLang || "und")}">`));
    assert.match(html, /Noto Sans CJK JP/);
    assert.match(html, /Noto Sans CJK KR/);
    assert.match(html, /Noto Sans Arabic/);
    assert.match(html, /Noto Sans Hebrew/);
    assert.match(html, /Malgun Gothic/);
    assert.match(html, /class="markdown-body" dir="auto"/);

    for (const expected of fixtureCase.mustContain) {
      assert.ok(
        html.includes(expected),
        `Expected ${fixtureCase.name} HTML to contain: ${expected}`
      );
    }

    for (const expected of fixtureCase.mustRenderContain || []) {
      assert.ok(
        html.includes(expected),
        `Expected ${fixtureCase.name} rendered HTML to contain: ${expected}`
      );
    }

    for (const forbidden of fixtureCase.mustNotContain || []) {
      assert.ok(
        !html.includes(forbidden),
        `Expected ${fixtureCase.name} HTML not to contain: ${forbidden}`
      );
    }
  });
}

test("advanced PDF renderer renders CJK bold, merged footnotes, and avatars in message meta", async () => {
  const payloadPath = path.join(outputDir, "reading-layout.payload.json");
  const htmlPath = path.join(outputDir, "reading-layout.html");
  const payload = {
    title: "Reading layout regression",
    exportedAt: "2026-10-14T00:00:00.000Z",
    language: "zh",
    messages: [{
      id: "user-1",
      role: "user",
      turnNumber: 1,
      markdown: "需要整理吗？"
    }, {
      id: "assistant-1",
      role: "assistant",
      turnNumber: 2,
      markdown: [
        "是否需要我把**工时表各个状态（Draft、Paid）**的含义整理成表？",
        "",
        "第一点。[^1][^2] 第二点。[^3]",
        "",
        "[^1]: [Get certified](https://example.test/certified)",
        "[^2]: [Get certified](https://example.test/certified)",
        "[^3]: [Fees](https://example.test/fees)"
      ].join("\n")
    }]
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(payloadPath, JSON.stringify(payload), "utf8");
  await execFileAsync(process.execPath, [
    path.join(repoRoot, "tools", "advanced-pdf", "render.js"),
    payloadPath,
    "--html",
    htmlPath,
    "--html-only"
  ], { cwd: repoRoot, encoding: "utf8" });

  const html = await readFile(htmlPath, "utf8");

  assert.match(html, /我把<strong>工时表各个状态（Draft、Paid）<\/strong>的含义/);
  assert.doesNotMatch(html, /CVSTRONG|CVFOOTNOTEREF/);
  // [^1] and [^2] cite the same page: one number, one list entry.
  assert.match(html, /第一点。<sup class="footnote-ref"><a href="#[^"]+-fn-1">1<\/a><\/sup> 第二点。<sup class="footnote-ref"><a href="#[^"]+-fn-2">2<\/a><\/sup>/);
  assert.equal((html.match(/<li id="[^"]+-fn-\d+">/g) || []).length, 2);
  assert.match(html, /class="message-meta user-meta"><span class="meta-text">[\s\S]*?<\/span><div class="avatar user-avatar"/);
  assert.match(html, /class="message-meta assistant-meta"><div class="assistant-avatar"/);
});

test("advanced PDF renderer keeps attachments after prose, embedded images, and single line breaks", async () => {
  const payloadPath = path.join(outputDir, "attachment-linebreak.payload.json");
  const htmlPath = path.join(outputDir, "attachment-linebreak.html");
  const genericPng = "data:application/octet-stream;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
  const payload = {
    title: "Attachment and line break regression",
    exportedAt: "2026-07-24T00:00:00.000Z",
    language: "zh",
    messages: [{
      id: "user-1",
      role: "user",
      turnNumber: 1,
      markdown: [
        "正文第一行",
        "正文第二行",
        "",
        "[File: 金融面试问题.pptx]",
        `![Uploaded image 1](${genericPng})`,
        `![Uploaded image 2](${genericPng})`,
        `![Uploaded image 3](${genericPng})`,
        `![Uploaded image 4](${genericPng})`,
        `![Uploaded image 5](${genericPng})`
      ].join("\n")
    }, {
      id: "assistant-1",
      role: "assistant",
      turnNumber: 2,
      thinkingMarkdown: "正在整理内容。",
      markdown: "整理完成。"
    }, {
      id: "assistant-images",
      role: "assistant",
      turnNumber: 3,
      preview: `![Image](${genericPng.slice(0, 48)}...)`,
      markdown: `![Generated image](${genericPng})`
    }]
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(payloadPath, JSON.stringify(payload), "utf8");
  await execFileAsync(process.execPath, [
    path.join(repoRoot, "tools", "advanced-pdf", "render.js"),
    payloadPath,
    "--html",
    htmlPath,
    "--html-only"
  ], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  const html = await readFile(htmlPath, "utf8");

  assert.match(html, /金融面试问题\.pptx/);
  assert.match(html, /attachment-card file/);
  assert.match(html, /<p>正文第一行<br>\s*正文第二行<\/p>/);
  assert.match(html, /assistant-intro[\s\S]*<section class="thinking">/);
  assert.match(html, /\.assistant-intro \{[\s\S]*break-inside: avoid;/);
  assert.doesNotMatch(html, /Image Attachments/);
  assert.match(html, /class="user-attachments image-grid" data-image-count="5"/);
  assert.equal((html.match(/class="attachment-card image with-thumb image-preview-card"/g) || []).length, 5);
  // The prompt index lists prompts only; answers follow them in the body.
  assert.match(html, /<span class="toc-number">01<\/span>\s*<span class="toc-label" dir="auto">正文第一行/);
  assert.doesNotMatch(html, /class="toc-label"[^>]*>[^<]*data:application/);
  assert.match(html, /data:image\/png;base64,/);
});

async function loadFixturePayload(fixtureCase) {
  return JSON.parse(await readFile(path.join(fixturesDir, fixtureCase.payload), "utf8"));
}

function collectPayloadText(payload) {
  return [
    payload.title || "",
    payload.source || "",
    ...(payload.messages || []).flatMap((message) => [
      message.markdown || "",
      message.thinkingMarkdown || "",
      message.preview || ""
    ])
  ].join("\n");
}

function normalizeDocumentLanguage(value) {
  const language = String(value || "").trim();
  return /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(language) ? language : "und";
}

function countRoles(messages) {
  return messages.reduce((result, message) => {
    const role = message.role || "unknown";
    result[role] = (result[role] || 0) + 1;
    return result;
  }, {});
}

function countQaPairs(messages) {
  let count = 0;
  for (let index = 0; index < messages.length; index += 1) {
    if (messages[index]?.role === "user" && messages[index + 1]?.role === "assistant") {
      count += 1;
    }
  }
  return count;
}

function countCodeBlocks(messages) {
  return messages.reduce((sum, message) => {
    const source = `${message.markdown || ""}\n${message.thinkingMarkdown || ""}`;
    return sum + Math.floor((source.match(/```/g) || []).length / 2);
  }, 0);
}

function countMarkdownTables(messages) {
  return messages.reduce((sum, message) => {
    const lines = String(message.markdown || "").split(/\r?\n/);
    let count = 0;

    for (let index = 0; index < lines.length - 1; index += 1) {
      if (/\|/.test(lines[index]) && /^\s*\|?\s*:?-{3,}.*\|/.test(lines[index + 1])) {
        count += 1;
      }
    }

    return sum + count;
  }, 0);
}

function assertExpectedCountsShape(name, expectedCounts) {
  const integerFields = ["messages", "qaPairs", "codeBlocks", "tables"];

  for (const field of integerFields) {
    assert.equal(Number.isInteger(expectedCounts[field]), true, `${name} expectedCounts.${field}`);
    assert.ok(expectedCounts[field] >= 0, `${name} expectedCounts.${field} is negative`);
  }

  assert.equal(typeof expectedCounts.roles, "object", `${name} expectedCounts.roles`);
  assert.ok(expectedCounts.roles !== null, `${name} expectedCounts.roles`);

  let roleTotal = 0;
  for (const [role, count] of Object.entries(expectedCounts.roles)) {
    assert.match(role, /^[a-z]+$/, `${name} role key`);
    assert.equal(Number.isInteger(count), true, `${name} role count: ${role}`);
    assert.ok(count >= 0, `${name} role count is negative: ${role}`);
    roleTotal += count;
  }

  assert.equal(roleTotal, expectedCounts.messages, `${name} role total`);
  assert.ok(expectedCounts.qaPairs <= Math.floor(expectedCounts.messages / 2), `${name} impossible QA pair count`);
}

function assertOutputObjectCounts(actual, expected, name) {
  assert.equal(actual.total, expected.total, `${name} output object total`);
  assert.equal(actual.degraded, expected.degraded, `${name} degraded output object total`);
  assert.deepEqual(actual.byKind, expected.byKind, `${name} output object kind counts`);
  assert.deepEqual(actual.byRenderStatus, expected.byRenderStatus, `${name} output object render status counts`);
  assert.deepEqual(actual.byDegradationReason, expected.byDegradationReason, `${name} output object degradation counts`);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
