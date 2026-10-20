import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readZip } from "../scripts/lib/zip-reader.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const fixturesDir = path.join(repoRoot, "tests", "fixtures");
const cases = JSON.parse(
  await readFile(path.join(fixturesDir, "export-regression-cases.json"), "utf8")
);
const { buildDataBundle, buildMarkdownDocument, normalizePayload } = createRequire(import.meta.url)(
  path.join(repoRoot, "renderer", "bundle-content.js")
);

test("bundle Markdown and data builders preserve export fixture text", async () => {
  for (const fixtureCase of cases) {
    const payload = JSON.parse(await readFile(path.join(fixturesDir, fixtureCase.payload), "utf8"));
    const normalized = normalizePayload({ exportPayload: payload });

    const markdown = buildMarkdownDocument(normalized);
    assertFixtureText(markdown, fixtureCase, "markdown");
    assert.ok(
      markdown.includes(`**Messages:** ${fixtureCase.expectedCounts.messages}`),
      `Expected ${fixtureCase.name} markdown to report message count`
    );

    const data = buildDataBundle(normalized);
    assertFixtureText(collectDataText(data), fixtureCase, "data");
    assertFixtureData(data, fixtureCase);
  }
});

test("agent trace files keep every event in order and the full output only in JSON", () => {
  const longOutput = `${"x".repeat(2500)}END`;
  const trace = {
    version: 2,
    model: { slug: "gpt-6-thinking", resolvedSlug: "gpt-6-thinking", thinkingEffort: "extended", cotVersion: "v5" },
    durationSeconds: 75,
    stats: { events: 5, thoughts: 1, notes: 0, toolCalls: 2, toolResults: 2, hiddenInputs: 1, sources: 1, citedSources: 1 },
    events: [
      { seq: 1, nodeId: "t1", offsetSeconds: 0, kind: "thought", summary: "Plan", content: "Search first.", finished: true },
      { seq: 2, nodeId: "w1", offsetSeconds: 1.5, kind: "tool_call", tool: "web.run", title: "正在搜索网页", input: "", inputHidden: true },
      { seq: 3, nodeId: "w2", offsetSeconds: 2, kind: "tool_result", tool: "web.run", callSeq: 2, title: "正在搜索 1 个网站", output: "", sources: [{ url: "https://example.test/a", title: "Source A", domain: "example.test", snippet: "About A" }] },
      { seq: 4, nodeId: "c1", offsetSeconds: 3, kind: "tool_call", tool: "api_tool.call_tool", title: "Read repo", input: "{\"path\":\"/GitHub/fetch\"}", arguments: { path: "/GitHub/fetch" }, inputHidden: false },
      { seq: 5, nodeId: "r1", offsetSeconds: 4, kind: "tool_result", tool: "api_tool.call_tool", callSeq: 4, output: longOutput }
    ],
    sources: [{ url: "https://example.test/a", title: "Source A", domain: "example.test", refIds: [], seenAt: [3], cited: true }],
    citations: [],
    memories: []
  };
  const normalized = normalizePayload({
    exportPayload: {
      title: "Trace",
      exporterVersion: "0.9.5",
      messages: [
        { id: "u1", role: "user", turnNumber: 1, markdown: "Find a repo" },
        { id: "a1", role: "assistant", turnNumber: 2, markdown: "Use A.", agentTrace: trace }
      ]
    }
  });

  const data = buildDataBundle(normalized);

  assert.equal(data.agentTrace.version, 2);
  assert.equal(data.agentTrace.turns.length, 1);
  assert.equal(data.agentTrace.turns[0].prompt, "Find a repo");
  assert.equal(data.agentTrace.turns[0].events[4].output, longOutput);
  assert.deepEqual(data.agentTrace.sources, [{ url: "https://example.test/a", title: "Source A", domain: "example.test", turns: [2], cited: true }]);
  // Data messages carry only the counts; the trace has one home.
  assert.equal(data.messages[1].agentTrace, undefined);
  assert.equal(data.messages[1].agentTraceStats.toolCalls, 2);

  const markdown = data.agentTraceMarkdown;
  assert.match(markdown, /## Turn 2 · gpt-6-thinking · extended · 1m 15s/);
  assert.ok(markdown.indexOf("🧠 **Thought**") < markdown.indexOf("🔧 **Call `web.run`**"));
  assert.match(markdown, /2\. `\+1\.5s` 🔧 \*\*Call `web\.run`\*\* — 正在搜索网页 · input not stored by ChatGPT/);
  assert.match(markdown, /↩️ \*\*Result `web\.run`\*\* — 正在搜索 1 个网站 · for call 2 · 1 sources/);
  assert.match(markdown, /\.\.\. \[503 more characters in turns\[0\]\.events\[4\]\]|… \[503 more characters in turns\[0\]\.events\[4\]\]/);
  assert.doesNotMatch(markdown, /END/);
  assert.match(markdown, /\| \[Source A\]\(https:\/\/example\.test\/a\) \| 2 \| yes \|/);
});

test("backend renderer prepares and serves export bundles", async (t) => {
  const port = await getAvailablePort();
  const token = `fixture-token-${process.pid}-${Date.now()}`;
  const cacheRoot = await mkdtemp(path.join(os.tmpdir(), "convo-vault-backend-cache-"));
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "convo-vault-backend-output-"));
  const server = spawn(process.execPath, [
    path.join(repoRoot, "renderer", "server.js")
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      CGCE_ADVANCED_PDF_PORT: String(port),
      CGCE_LOCAL_API_TOKEN: token,
      CGCE_CACHE_DIR: cacheRoot
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  server.stdout.setEncoding("utf8");
  server.stderr.setEncoding("utf8");
  server.stdout.on("data", (chunk) => { stdout += chunk; });
  server.stderr.on("data", (chunk) => { stderr += chunk; });

  t.after(async () => {
    try {
      await fetch(`http://127.0.0.1:${port}/shutdown`, {
        method: "POST",
        headers: { "X-Convo-Vault-Token": token }
      });
    } catch (_) {
      server.kill();
    }
    await rm(cacheRoot, { recursive: true, force: true });
    await rm(outputRoot, { recursive: true, force: true });
  });

  await waitForHealth(port, token, () => `${stdout}\n${stderr}`);

  const bundleFixture = cases[0];
  const bundlePayload = JSON.parse(await readFile(path.join(fixturesDir, bundleFixture.payload), "utf8"));
  const bundleBaseName = `${bundleFixture.name}.fixture`;
  const preparedResponse = await fetch(`http://127.0.0.1:${port}/prepare-render-bundle`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Convo-Vault-Token": token
    },
    body: JSON.stringify({
      exportPayload: bundlePayload,
      fileName: `${bundleBaseName}.zip`
    })
  });
  const prepared = await preparedResponse.json();
  assert.equal(preparedResponse.ok, true, `prepare-render-bundle failed: ${JSON.stringify(prepared)}`);
  assert.equal(prepared.ok, true);
  assert.match(prepared.downloadPath, /^\/download-bundle\/[a-f0-9]{48}$/);
  assert.equal(prepared.filename, `${bundleBaseName}.zip`);

  const bundleFiles = String(prepared.bundleFiles || "").split(",").filter(Boolean);
  const expectedBundleSuffixes = [
    ".md",
    ".pdf",
    ".payload.json",
    ".assets.manifest.json",
    ".data.json",
    ".conversation.json",
    ".agent-trace.json",
    ".agent-trace.md",
    ".messages.jsonl",
    ".qa-pairs.json",
    ".topics.json",
    ".entities.json",
    ".summary.md"
  ];
  assert.equal(bundleFiles.length, expectedBundleSuffixes.length);
  for (const suffix of expectedBundleSuffixes) {
    assert.ok(bundleFiles.some((file) => file.endsWith(suffix)), `Prepared bundle must keep ${suffix}`);
  }

  const downloadResponse = await fetch(`http://127.0.0.1:${port}${prepared.downloadPath}`);
  const downloadBytes = Buffer.from(await downloadResponse.arrayBuffer());
  assert.equal(downloadResponse.ok, true);
  assert.equal(downloadResponse.headers.get("content-type"), "application/zip");
  assert.equal(Number(downloadResponse.headers.get("content-length")), downloadBytes.length);
  assert.equal(downloadBytes.readUInt32LE(0), 0x04034b50, "Prepared download must be a ZIP archive");
  assert.equal(downloadBytes.length, prepared.bundleSize);

  const stagedSource = "sediment://file_00000000bbbbbbbbbbbbbbbbbbbbbbbb";
  const stagedBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");
  const stagedSha = createHash("sha256").update(stagedBytes).digest("hex");
  const sourceKey = createHash("sha256").update(stagedSource).digest("hex");
  const sessionResponse = await fetch(`http://127.0.0.1:${port}/export-sessions`, {
    method: "POST",
    headers: { "X-Convo-Vault-Token": token }
  });
  const session = await sessionResponse.json();
  assert.equal(sessionResponse.ok, true);
  assert.match(session.sessionId, /^[a-f0-9]{48}$/);

  const assetResponse = await fetch(`http://127.0.0.1:${port}/export-sessions/${session.sessionId}/assets/${sourceKey}`, {
    method: "PUT",
    headers: {
      "Content-Type": "image/png",
      "X-Convo-Vault-Token": token
    },
    body: stagedBytes
  });
  const stagedAsset = await assetResponse.json();
  assert.equal(assetResponse.ok, true, JSON.stringify(stagedAsset));
  assert.equal(stagedAsset.sha256, stagedSha);

  const stagedPayload = {
    schemaVersion: 1,
    exporterVersion: "0.8.5",
    title: "Staged local asset fixture",
    source: "https://chatgpt.com/c/staged-local-asset",
    exportedAt: "2026-08-30T00:00:00.000Z",
    captureMode: "fast",
    messageCount: 2,
    assetStats: { imagesEmbedded: 1, imagesFailed: 0, imagesSkipped: 0 },
    messages: [
      {
        id: "staged-user",
        role: "user",
        turnNumber: 1,
        markdown: `![Staged local image](${stagedSource})`,
        thinkingMarkdown: ""
      },
      {
        id: "staged-assistant",
        role: "assistant",
        turnNumber: 2,
        markdown: "The staged image remains portable.",
        thinkingMarkdown: "> Thinking summary"
      }
    ]
  };
  const stagedPrepareResponse = await fetch(`http://127.0.0.1:${port}/prepare-render-bundle`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Convo-Vault-Token": token
    },
    body: JSON.stringify({
      exportPayload: stagedPayload,
      exportSessionId: session.sessionId,
      fileName: "staged-local-asset.fixture.zip"
    })
  });
  const stagedPrepared = await stagedPrepareResponse.json();
  assert.equal(stagedPrepareResponse.ok, true, JSON.stringify(stagedPrepared));
  assert.equal(stagedPrepared.assetStats.imagesEmbedded, 1);

  const stagedDownload = await fetch(`http://127.0.0.1:${port}${stagedPrepared.downloadPath}`);
  const stagedZipBytes = Buffer.from(await stagedDownload.arrayBuffer());
  const stagedZipPath = path.join(outputRoot, "staged-local-asset.fixture.zip");
  await writeFile(stagedZipPath, stagedZipBytes);
  const stagedZip = readZip(stagedZipPath);
  const stagedEntries = new Map(stagedZip.entries.map((entry) => [entry.name, entry]));
  const stagedPayloadEntry = [...stagedEntries.keys()].find((name) => name.endsWith(".payload.json"));
  const stagedManifestEntry = [...stagedEntries.keys()].find((name) => name.endsWith(".assets.manifest.json"));
  const stagedDataEntry = [...stagedEntries.keys()].find((name) => name.endsWith(".data.json"));
  const stagedConversationEntry = [...stagedEntries.keys()].find((name) => name.endsWith(".conversation.json"));
  const stagedPdfEntry = [...stagedEntries.keys()].find((name) => name.endsWith(".pdf"));
  const stagedAssetEntry = [...stagedEntries.keys()].find((name) => name === `assets/sha256/${stagedSha.slice(0, 2)}/${stagedSha.slice(2, 4)}/${stagedSha}.png`);

  assert.ok(stagedPayloadEntry);
  assert.ok(stagedManifestEntry);
  assert.ok(stagedDataEntry);
  assert.ok(stagedConversationEntry);
  assert.ok(stagedPdfEntry);
  assert.ok(stagedAssetEntry);
  assert.equal(stagedEntries.get(stagedPayloadEntry).method, 8, "JSON entries should use Deflate");
  assert.equal(stagedEntries.get(stagedPdfEntry).method, 0, "PDF entries should remain stored");
  assert.equal(stagedEntries.get(stagedAssetEntry).method, 0, "PNG entries should remain stored");

  const portablePayload = JSON.parse(stagedZip.data(stagedEntries.get(stagedPayloadEntry)).toString("utf8"));
  const portableManifest = JSON.parse(stagedZip.data(stagedEntries.get(stagedManifestEntry)).toString("utf8"));
  const portableData = JSON.parse(stagedZip.data(stagedEntries.get(stagedDataEntry)).toString("utf8"));
  const portableConversation = JSON.parse(stagedZip.data(stagedEntries.get(stagedConversationEntry)).toString("utf8"));
  assert.match(portablePayload.messages[0].markdown, new RegExp(`assets/sha256/.+/${stagedSha}\\.png`));
  assert.doesNotMatch(portablePayload.messages[0].markdown, /data:image|sediment:/);
  assert.equal(portableManifest.assets.find((asset) => asset.sha256 === stagedSha)?.storage, "local-cache");
  assert.equal(portableManifest.outputObjectCounts.total, 1);
  assert.equal(portableManifest.outputObjectCounts.degraded, 0);
  assert.deepEqual(portableData.outputObjectCounts, portableManifest.outputObjectCounts);
  assert.equal(portableConversation.outputObjectCount, 1);
  assert.equal(portableConversation.degradedObjectCount, 0);
  assert.equal(createHash("sha256").update(stagedZip.data(stagedEntries.get(stagedAssetEntry))).digest("hex"), stagedSha);
  assert.equal(stagedZip.data(stagedEntries.get(stagedPdfEntry)).subarray(0, 4).toString("ascii"), "%PDF");
});

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(address.port);
      });
    });
  });
}

async function waitForHealth(port, token, getLogs) {
  const deadline = Date.now() + 8000;
  let lastError = "";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        headers: { "X-Convo-Vault-Token": token }
      });
      if (response.ok) return;
      lastError = `${response.status} ${await response.text()}`;
    } catch (error) {
      lastError = error.message || String(error);
    }

    await delay(150);
  }

  throw new Error(`Backend fixture server did not become healthy: ${lastError}\n${getLogs()}`);
}

function assertFixtureText(output, fixtureCase, label) {
  for (const expected of fixtureCase.mustContain) {
    assert.ok(
      output.includes(expected),
      `Expected ${fixtureCase.name} ${label} output to contain: ${expected}`
    );
  }

  for (const forbidden of fixtureCase.mustNotContain || []) {
    assert.ok(
      !output.includes(forbidden),
      `Expected ${fixtureCase.name} ${label} output not to contain: ${forbidden}`
    );
  }
}

function assertFixtureData(data, fixtureCase) {
  const expectedCounts = fixtureCase.expectedCounts || {};

  assert.equal(data.ok, true, `${fixtureCase.name} data ok`);
  assert.equal(data.messages.length, expectedCounts.messages, `${fixtureCase.name} data message array length`);
  assert.equal(data.conversation.messageCount, expectedCounts.messages, `${fixtureCase.name} data message count`);
  assert.deepEqual(data.conversation.roles, expectedCounts.roles, `${fixtureCase.name} data role counts`);
  assert.equal(data.conversation.language || "und", fixtureCase.expectedLang || "und", `${fixtureCase.name} data language`);
  assert.equal(data.qaPairs.length, expectedCounts.qaPairs, `${fixtureCase.name} data QA pairs`);
  for (const message of data.messages) {
    assert.ok(message.id, `${fixtureCase.name} data message id`);
    assert.ok(message.turnNumber > 0, `${fixtureCase.name} data turn number`);
    assert.ok(expectedCounts.roles[message.role] > 0, `${fixtureCase.name} data known role: ${message.role}`);
  }

  const codeBlocks = data.messages.reduce((sum, message) => {
    return sum + (message.counts?.codeBlocks || 0);
  }, 0);
  assert.equal(codeBlocks, expectedCounts.codeBlocks, `${fixtureCase.name} data code blocks`);

  if (fixtureCase.expectedOutputObjects) {
    assert.equal(data.conversation.outputObjectCount, fixtureCase.expectedOutputObjects.total, `${fixtureCase.name} data output object count`);
    assert.equal(data.conversation.degradedObjectCount, fixtureCase.expectedOutputObjects.degraded, `${fixtureCase.name} data degraded object count`);
    assert.equal(data.outputObjects.length, fixtureCase.expectedOutputObjects.total, `${fixtureCase.name} data output object array length`);
    assert.deepEqual(data.outputObjectCounts, {
      total: fixtureCase.expectedOutputObjects.total,
      degraded: fixtureCase.expectedOutputObjects.degraded,
      byKind: fixtureCase.expectedOutputObjects.byKind,
      byRenderStatus: fixtureCase.expectedOutputObjects.byRenderStatus,
      byDegradationReason: fixtureCase.expectedOutputObjects.byDegradationReason
    }, `${fixtureCase.name} data output object counts`);
    for (const object of data.outputObjects) {
      assert.ok(object.objectId, `${fixtureCase.name} data output object id`);
      assert.ok(object.kind, `${fixtureCase.name} data output object kind`);
      assert.ok(object.renderStatus, `${fixtureCase.name} data output object render status`);
      assert.ok(object.messageId, `${fixtureCase.name} data output object message id`);
      assert.ok(object.turnNumber > 0, `${fixtureCase.name} data output object turn`);
      if (object.degraded) {
        assert.ok(object.degradationReason, `${fixtureCase.name} degraded output object reason`);
      }
    }
  }
}

function collectDataText(data) {
  return [
    data.conversation?.title || "",
    data.conversation?.source || "",
    ...(data.messages || []).flatMap((message) => [
      message.markdown || "",
      message.thinkingMarkdown || "",
      message.preview || "",
      message.text || ""
    ])
  ].join("\n");
}
