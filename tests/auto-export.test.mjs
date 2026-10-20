import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";

const repoRoot = path.resolve(import.meta.dirname, "..");
const source = await readFile(path.join(repoRoot, "extension", "content", "auto-export.js"), "utf8");
const JOB_ID = "a".repeat(48);

function load({ claim, exportConversation, hash = `#convo-vault-job=${JOB_ID}` }) {
  const sent = [];
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
          callback(message.action === "claim" ? claim : { ok: true });
        }
      }
    },
    URLSearchParams,
    console,
    Date,
    Promise,
    exportCurrentConversation: exportConversation
  };
  vm.runInNewContext(source, sandbox);
  return { sent, location, listeners };
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
  assert.equal(exportOptions.domThinking, false);
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
