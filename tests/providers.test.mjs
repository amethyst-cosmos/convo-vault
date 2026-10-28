import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";

const repoRoot = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const { buildDocumentHtml } = require("../renderer/lib/document.js");
const { buildDataBundle, buildMarkdownDocument, normalizePayload } = require("../renderer/lib/bundle-content.js");
const { buildPdfOutlineItems } = require("../renderer/lib/pdf.js");
const { buildAgentTraceFile } = require("../renderer/lib/agent-trace-files.js");

const messages = [
  { id: "u1", role: "user", turnNumber: 1, markdown: "Question?" },
  { id: "a1", role: "assistant", turnNumber: 2, markdown: "Answer.[^1]\n\n[^1]: [Source](https://example.com)" }
];
const payload = (provider) => ({ title: "Sample", source: "https://grok.com/c/x", exportedAt: "2026-01-01T00:00:00Z", ...(provider ? { provider } : {}), messages });
// The page text without the scripts and styles that quote ChatGPT's own code.
const visible = (html) => html.replace(/<script>[\s\S]*?<\/script>/g, "").replace(/<style>[\s\S]*?<\/style>/g, "");

test("a Grok export says Grok on the cover, on the answers and in the outline, with Grok's avatar", () => {
  const html = buildDocumentHtml(payload("grok"));

  assert.match(html, /cover-eyebrow">Grok conversation</);
  assert.match(html, /meta-speaker">Grok</);
  assert.match(html, /Turn 02 - Grok/);
  assert.match(html, /<img src="data:image\/svg\+xml;base64,[^"]+" alt="Grok">/, "an avatar of its own, not ChatGPT's");
  assert.ok(!/ChatGPT/.test(visible(html)), "nothing in the page says ChatGPT");
  assert.ok(buildPdfOutlineItems(messages, "grok").some((item) => /Grok/.test(item.title)), "the outline names Grok");
  assert.ok(buildPdfOutlineItems(messages, "grok").every((item) => !/ChatGPT/.test(item.title)));
});

test("an export without a provider is still a ChatGPT export, exactly as before", () => {
  const html = buildDocumentHtml(payload());

  assert.match(html, /cover-eyebrow">ChatGPT conversation</);
  assert.match(html, /meta-speaker">ChatGPT</);
  assert.match(html, /alt="ChatGPT"/);
  assert.ok(!/Grok/.test(visible(html)));
  assert.ok(!/Grok/.test(JSON.stringify(buildPdfOutlineItems(messages))));
});

test("the data files carry the provider and name an untitled Grok conversation by it", () => {
  const untitled = { ...payload("grok"), title: "" };

  assert.equal(normalizePayload(untitled).provider, "grok");
  assert.equal(normalizePayload(untitled).title, "Grok Conversation");
  assert.match(buildMarkdownDocument(normalizePayload(untitled)), /^# Grok Conversation/m);
  assert.equal(normalizePayload({ ...payload(), title: "" }).title, "ChatGPT Conversation");
  assert.equal(buildAgentTraceFile(untitled).conversation.title, "Grok Conversation");
  assert.match(buildAgentTraceFile(untitled).notes[0], /^Events follow Grok's/);
  assert.match(buildAgentTraceFile(untitled).notes[1], /^thought events are Grok's/);
  assert.equal(typeof buildDataBundle, "function");
});

test("the content script runs on ChatGPT, Grok and Gemini, and nowhere else", async () => {
  const manifest = JSON.parse(await readFile(path.join(repoRoot, "extension", "manifest.json"), "utf8"));

  for (const site of ["https://grok.com/*", "https://gemini.google.com/*"]) {
    assert.ok(manifest.host_permissions.includes(site), site);
  }
  assert.deepEqual([...manifest.content_scripts[0].matches].sort(), [
    "https://chat.openai.com/*",
    "https://chatgpt.com/*",
    "https://gemini.google.com/*",
    "https://grok.com/*"
  ]);
});

test("a Gemini export says Gemini on the cover, the answers and the outline, with its own avatar", () => {
  const html = buildDocumentHtml(payload("gemini"));

  assert.match(html, /cover-eyebrow">Gemini conversation</);
  assert.match(html, /meta-speaker">Gemini</);
  assert.match(html, /Turn 02 - Gemini/);
  assert.match(html, /<img src="data:image\/svg\+xml;base64,[^"]+" alt="Gemini">/);
  assert.ok(!/ChatGPT|Grok/.test(visible(html)), "nothing in the page names another site");
  assert.ok(buildPdfOutlineItems(messages, "gemini").some((item) => /Gemini/.test(item.title)));
  assert.equal(normalizePayload({ ...payload("gemini"), title: "" }).title, "Gemini Conversation");
});

test("the background accepts export jobs from a Grok tab and still refuses other sites", async () => {
  const source = await readFile(path.join(repoRoot, "extension", "background.js"), "utf8");
  const messageListeners = [];
  const context = {
    chrome: {
      runtime: { id: "test", lastError: null, onMessage: { addListener: (listener) => messageListeners.push(listener) }, onConnect: { addListener() {} } },
      storage: { local: { get: (_keys, callback) => callback({}) } }
    },
    console, URL, TextEncoder, setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {},
    fetch: async () => ({ ok: true, status: 200, text: async () => "{}" })
  };
  vm.runInNewContext(source, context, { filename: "background.js" });
  const handle = (url) => messageListeners[0]({ type: "CONVO_VAULT_JOB", jobId: "bad" }, { tab: { url } }, () => {});

  assert.equal(handle("https://grok.com/c/8cf3ca89-1360-4ff5-ba2c-5133f69e1a23"), true);
  assert.equal(handle("https://chatgpt.com/c/abc"), true);
  assert.equal(handle("https://gemini.google.com/app/ee7a64284d74cdd1"), true);
  assert.equal(handle("https://evil.example/c/abc"), false);
  assert.equal(handle("https://gemini.google.com.evil.example/app/abc"), false);
  assert.equal(handle("https://grok.com.evil.example/c/abc"), false);
});
