import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("manifest classifies interrupted, unanswered, and answered prompts from raw API nodes", async () => {
  const api = await loadManifestModule();
  const data = linearConversation([
    user("u1", "First question"),
    assistant("a1", "First answer", { channel: "final", end_turn: true }),
    user("u2", "Second question"),
    assistant("a2-stopped", "", { metadata: { finish_details: { type: "interrupted", reason: "client_stopped" } } }),
    user("u3", "Question asked again"),
    user("u4", "Question without any stored reply"),
    assistant("a4-search", "", { recipient: "web.run", content_type: "code" }),
    tool("t4", "search results"),
    assistant("a4", "Answer after a search", { channel: "final", end_turn: true }),
    system("s5", "hidden setup", { metadata: { is_visually_hidden_from_conversation: true } }),
    user("u5", "Question that only produced reasoning"),
    thoughts("a5-thoughts", "Considering the request")
  ]);

  const manifest = api.buildConversationManifest(data);

  assert.deepEqual(Array.from(manifest.entries, (entry) => entry.identity), [
    "message:u1",
    "reply:a1",
    "message:u2",
    "message:u3",
    "message:u4",
    "reply:a4-search",
    "message:u5",
    "reply:a5-thoughts"
  ]);
  assert.deepEqual(Array.from(manifest.entries, (entry) => entry.status), [
    "prompt",
    "answer",
    "prompt",
    "prompt",
    "prompt",
    "answer",
    "prompt",
    "thinking-only"
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(manifest.gaps.map((gap) => [gap.userNodeId, gap.status]))), [
    ["u2", "interrupted"],
    ["u3", "no-reply"]
  ]);
  assert.match(manifest.gaps[0].reason, /client_stopped/);
  assert.equal(manifest.counts.user, 5);
  assert.equal(manifest.counts.assistant, 3);
  assert.equal(manifest.counts.hiddenNodes, 1);
});

test("manifest counts DIL fallback Markdown and tool images as answer content", async () => {
  const api = await loadManifestModule();
  const data = linearConversation([
    user("u1", "Show a layout"),
    assistant("a1", "<box><text>source</text></box>", {
      channel: "final",
      metadata: { model_dil_v2: { fallbackMarkdown: "Rendered layout" } }
    }),
    user("u2", "Draw a picture"),
    tool("t2", "", { parts: [{ content_type: "image_asset_pointer", asset_pointer: "sediment://file_abc" }] }),
    user("u3", "Say nothing"),
    assistant("a3", "", { channel: "commentary" })
  ]);

  const manifest = api.buildConversationManifest(data);

  assert.deepEqual(Array.from(manifest.entries, (entry) => entry.identity), [
    "message:u1",
    "reply:a1",
    "message:u2",
    "reply:t2",
    "message:u3"
  ]);
  assert.deepEqual(Array.from(manifest.gaps, (gap) => gap.status), ["empty"]);
});

test("manifest completeness passes a complete export and explains same-role adjacencies", async () => {
  const api = await loadManifestModule();
  const manifest = api.buildConversationManifest(linearConversation([
    user("u1", "Q1"),
    assistant("a1", "A1", { channel: "final" }),
    user("u2", "Q2"),
    assistant("a2-stopped", "", { metadata: { finish_details: { type: "interrupted", reason: "client_stopped" } } }),
    user("u3", "Q3"),
    user("u4", "Q4"),
    assistant("a4", "A4", { channel: "final" })
  ]));
  const exported = [
    exportedMessage("user", "u1"),
    exportedMessage("assistant", "a1"),
    exportedMessage("user", "u2"),
    exportedMessage("user", "u3"),
    exportedMessage("user", "u4"),
    exportedMessage("assistant", "a4")
  ];

  const report = api.buildManifestCompletenessReport(exported, manifest, { captureMode: "fast" });

  assert.equal(report.complete, true);
  assert.equal(report.expectedSource, "conversation-api-manifest");
  assert.deepEqual(JSON.parse(JSON.stringify(report.issues)), []);
  assert.equal(report.captured.uniqueIdentities, 6);
  assert.equal(report.expected.uniqueIdentities, 6);
  const adjacency = report.warnings.find((warning) => warning.code === "same-role-adjacency");
  assert.match(adjacency.message, /no reply for 2 prompt\(s\) \(1 stopped before any content, 1 with no stored reply\)/);
});

test("manifest completeness rejects an exporter that drops or reorders messages", async () => {
  const api = await loadManifestModule();
  const manifest = api.buildConversationManifest(linearConversation([
    user("u1", "Q1"),
    assistant("a1", "A1", { channel: "final" }),
    user("u2", "Q2"),
    assistant("a2", "{\"looks\": \"like json\"}", { channel: "final" })
  ]));

  // An exporter that silently filtered a2 as an internal payload.
  const dropped = api.buildManifestCompletenessReport([
    exportedMessage("user", "u1"),
    exportedMessage("assistant", "a1"),
    exportedMessage("user", "u2")
  ], manifest, { captureMode: "fast" });

  assert.equal(dropped.complete, false);
  assert.equal(dropped.requiresOverride, true);
  assert.ok(dropped.issues.some((issue) => issue.code === "missing-identities"));
  assert.ok(dropped.issues.some((issue) => issue.code === "missing-assistant-messages"));
  assert.deepEqual(JSON.parse(JSON.stringify(dropped.missingIdentities)), ["reply:a2"]);

  const reordered = api.buildManifestCompletenessReport([
    exportedMessage("user", "u2"),
    exportedMessage("assistant", "a2"),
    exportedMessage("user", "u1"),
    exportedMessage("assistant", "a1")
  ], manifest, { captureMode: "full" });

  assert.equal(reordered.complete, false);
  assert.ok(reordered.issues.some((issue) => issue.code === "order-mismatch"));
});

test("manifest completeness matches DOM messages by any ChatGPT message id of the reply", async () => {
  const api = await loadManifestModule();
  const manifest = api.buildConversationManifest(linearConversation([
    user("u1", "Q1"),
    assistant("a1-search", "", { recipient: "web.run" }),
    tool("t1", "results"),
    assistant("a1", "A1", { channel: "final" })
  ]));
  const domMessages = [
    { ...exportedMessage("user", "u1") },
    { role: "assistant", sourceMessageId: "", sourceMessageIds: ["a1"], markdown: "A1" },
    { role: "assistant", sourceMessageId: "", markdown: "page chrome" }
  ];

  const report = api.buildManifestCompletenessReport(domMessages, manifest, { captureMode: "full" });

  assert.equal(report.complete, true);
  assert.ok(report.warnings.some((warning) => warning.code === "unmatched-messages"));
});

async function loadManifestModule() {
  const source = (await Promise.all([
    "conversation-manifest.js",
    "agent-trace.js",
    "chatgpt-files.js",
    "capture-fast.js"
  ].map((file) => readFile(path.join(repoRoot, "extension", "content", file), "utf8")))).join("\n");
  const context = vm.createContext({
    normalizeCaptureMode(value) {
      const mode = String(value || "").toLowerCase();
      return ["fast", "full", "hybrid"].includes(mode) ? mode : "full";
    },
    truncatePreview(value, maxLength) {
      const text = String(value || "");
      return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
    },
    getRoleSequenceDiagnostics(messages) {
      const sameRolePairs = [];
      for (let index = 1; index < messages.length; index += 1) {
        if (messages[index].role === messages[index - 1].role) {
          sameRolePairs.push({ role: messages[index].role });
        }
      }
      return {
        userMessages: messages.filter((message) => message.role === "user").length,
        assistantMessages: messages.filter((message) => message.role === "assistant").length,
        sameRolePairs
      };
    },
    getCaptureImageCompletenessStats() {
      return { references: 0, uniqueIdentities: 0, embedded: 0, deferred: 0, failures: 0 };
    }
  });
  vm.runInContext(`${source}\nglobalThis.__manifestTest = { buildConversationManifest, buildManifestCompletenessReport };`, context);
  return context.__manifestTest;
}

function linearConversation(messages) {
  return { messages, page_info: { has_previous_page: false } };
}

function user(id, text) {
  return message(id, "user", text);
}

function assistant(id, text, options = {}) {
  return message(id, "assistant", text, options);
}

function tool(id, text, options = {}) {
  return message(id, "tool", text, options);
}

function system(id, text, options = {}) {
  return message(id, "system", text, options);
}

function thoughts(id, summary) {
  return {
    id,
    author: { role: "assistant" },
    content: { content_type: "thoughts", thoughts: [{ summary, content: "" }] },
    channel: "analysis",
    recipient: "all",
    metadata: {}
  };
}

function message(id, role, text, options = {}) {
  return {
    id,
    author: { role },
    content: {
      content_type: options.content_type || "text",
      parts: options.parts || [text]
    },
    channel: options.channel ?? null,
    recipient: options.recipient || "all",
    end_turn: options.end_turn ?? null,
    metadata: options.metadata || {}
  };
}

function exportedMessage(role, id) {
  return { role, sourceMessageId: id, markdown: `${role} ${id}` };
}
