import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";

const repoRoot = path.resolve(import.meta.dirname, "..");
const source = await readFile(path.join(repoRoot, "extension", "content", "auto-export.js"), "utf8");
const JOB_ID = "a".repeat(48);

function load({ claim, exportConversation, listConversations, hash = `#convo-vault-job=${JOB_ID}` }) {
  const sent = [];
  const contexts = [];
  const listeners = {};
  const location = { hash, pathname: "/c/abc12345", search: "?x=1" };
  const sandbox = {
    location,
    history: { state: null, replaceState: (_s, _t, url) => { location.hash = url.includes("#") ? url.slice(url.indexOf("#")) : ""; } },
    window: { addEventListener: (name, handler) => { listeners[name] = handler; } },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage: (message, callback) => {
          sent.push(message);
          callback(message.action === "claim" ? (typeof claim === "function" ? claim(message) : claim) : { ok: true });
        }
      }
    },
    URLSearchParams,
    EXPORTER_VERSION: "9.8.7",
    console,
    Date,
    Promise,
    exportCurrentConversation: exportConversation,
    listConversations,
    setActiveExportContext: (context) => { contexts.push(context); }
  };
  vm.runInNewContext(source, sandbox);
  return { sent, location, listeners, contexts };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

test("auto export claims the job, strips the hash, exports, then closes the tab", async () => {
  let exportOptions = null;
  const harness = load({
    claim: { ok: true, options: { allowIncomplete: false, closeTab: true } },
    exportConversation: async (options) => { exportOptions = options; return { ok: true }; }
  });
  await settle();

  assert.equal(harness.location.hash, "");
  assert.deepEqual(harness.sent.map((message) => message.action), ["claim", "status", "close-tab"]);
  assert.equal(exportOptions.jobId, JOB_ID);
  assert.equal(exportOptions.allowIncomplete, false);
  assert.equal(exportOptions.skipPdf, false);
});

test("auto export reports the integrity gate error and keeps the tab open", async () => {
  const harness = load({
    claim: { ok: true, options: { closeTab: true } },
    exportConversation: async () => { throw new Error("Capture is incomplete and normal export is blocked."); }
  });
  await settle();

  const last = harness.sent.at(-1);
  assert.equal(last.action, "status");
  assert.equal(last.state, "error");
  assert.match(last.message, /incomplete/);
  assert.ok(!harness.sent.some((message) => message.action === "close-tab"));
});

test("auto export does nothing without a job id or when the claim fails", async () => {
  const noHash = load({ hash: "", claim: { ok: true }, exportConversation: async () => { throw new Error("no"); } });
  await settle();
  assert.equal(noHash.sent.length, 0);

  let exported = false;
  const refused = load({ claim: { ok: false, error: "claimed" }, exportConversation: async () => { exported = true; } });
  await settle();
  assert.deepEqual(refused.sent.map((message) => message.action), ["claim"]);
  assert.equal(exported, false);
});

test("a ping job only reports that the extension answers and closes the tab", async () => {
  let exported = false;
  const harness = load({
    claim: { ok: true, options: { ping: true, closeTab: true } },
    exportConversation: async () => { exported = true; }
  });
  await settle();

  assert.deepEqual(harness.sent.map((message) => message.action), ["claim", "status", "close-tab"]);
  assert.equal(harness.sent[1].message, "Extension 9.8.7 is installed and responding.", "the reply carries the extension version");
  assert.equal(exported, false);
});

test("a data-only job skips the PDF when exporting", async () => {
  let exportOptions = null;
  load({
    claim: { ok: true, options: { pdf: false, closeTab: true } },
    exportConversation: async (options) => { exportOptions = options; return { ok: true }; }
  });
  await settle();

  assert.equal(exportOptions.skipPdf, true);
});

test("files are downloaded only when the job asks for them", async () => {
  const seen = [];
  for (const options of [{ closeTab: true }, { closeTab: true, files: true }]) {
    load({
      claim: { ok: true, options },
      exportConversation: async (exportOptions) => { seen.push(exportOptions.downloadFiles); return { ok: true }; }
    });
    await settle();
  }

  assert.deepEqual(seen, [false, true]);
});

test("a reload job closes its tab and asks the extension to reload without exporting", async () => {
  let exported = false;
  const harness = load({
    claim: { ok: true, options: { reload: true, closeTab: true } },
    exportConversation: async () => { exported = true; }
  });
  await settle();

  assert.deepEqual(harness.sent.map((message) => message.action), ["claim", "status", "close-tab", "reload-extension"]);
  assert.equal(exported, false);
});

const JOB_B = "b".repeat(48);
const JOB_C = "c".repeat(48);

test("a batch runs every job in one tab, each for its own conversation, and closes the tab once at the end", async () => {
  const exported = [];
  const harness = load({
    hash: `#convo-vault-job=${JOB_ID},${JOB_B},${JOB_C}`,
    claim: (message) => ({
      ok: true,
      options: { conversationId: `conv-${message.jobId[0]}-12345`, closeTab: message.jobId === JOB_C, files: message.jobId === JOB_B }
    }),
    exportConversation: async (options) => { exported.push({ jobId: options.jobId[0], files: options.downloadFiles }); return { ok: true }; }
  });
  await settle();

  assert.equal(harness.location.hash, "");
  assert.deepEqual(exported, [{ jobId: "a", files: false }, { jobId: "b", files: true }, { jobId: "c", files: false }]);
  assert.deepEqual(
    harness.contexts.filter(Boolean).map((context) => context.conversationId),
    ["conv-a-12345", "conv-b-12345", "conv-c-12345"],
    "each export names its own conversation"
  );
  assert.equal(harness.contexts.at(-1), null, "the context is cleared afterwards");
  assert.equal(harness.sent.filter((message) => message.action === "close-tab").length, 1);
  assert.equal(harness.sent.at(-1).action, "close-tab");
});

test("a failed conversation in a batch is reported and the next one still runs", async () => {
  const exported = [];
  const harness = load({
    hash: `#convo-vault-job=${JOB_ID},${JOB_B}`,
    claim: { ok: true, options: { conversationId: "conv-12345", closeTab: true } },
    exportConversation: async (options) => {
      exported.push(options.jobId[0]);
      if (options.jobId === JOB_ID) throw new Error("Capture is incomplete");
      return { ok: true };
    }
  });
  await settle();

  assert.deepEqual(exported, ["a", "b"]);
  assert.ok(harness.sent.some((message) => message.state === "error" && /incomplete/.test(message.message)));
});

test("a list job sends the conversation list back as a result", async () => {
  const harness = load({
    claim: { ok: true, options: { closeTab: true, list: { project: "Research", limit: 50 } } },
    listConversations: async (request) => ({ conversations: [{ id: "x", title: request.project }], notes: [] }),
    exportConversation: async () => { throw new Error("a list job must not export"); }
  });
  await settle();

  const result = harness.sent.find((message) => message.action === "result");
  assert.deepEqual(result.data.conversations, [{ id: "x", title: "Research" }]);
  assert.equal(harness.sent.at(-1).action, "close-tab");
});
