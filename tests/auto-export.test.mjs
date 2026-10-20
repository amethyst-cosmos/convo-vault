import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";

const repoRoot = path.resolve(import.meta.dirname, "..");
const source = await readFile(path.join(repoRoot, "extension", "content", "auto-export.js"), "utf8");
const JOB_ID = "a".repeat(48);

function load({ claim, collect, exportMessages, hash = `#convo-vault-job=${JOB_ID}` }) {
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
    normalizeCaptureMode: (mode) => (["fast", "hybrid", "full"].includes(mode) ? mode : "fast"),
    formatCaptureMode: (mode) => mode,
    messageExtractor: { collect },
    exportSelectedMessages: exportMessages
  };
  vm.runInNewContext(source, sandbox);
  return { sent, location, listeners };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

test("auto export claims the job, strips the hash, exports, then closes the tab", async () => {
  let exportOptions = null;
  const harness = load({
    claim: { ok: true, options: { captureMode: "fast", allowIncomplete: false, closeTab: true } },
    collect: async () => ({ messages: [{ id: "m1" }], captureMode: "fast", completeness: { complete: true } }),
    exportMessages: async (messages, options) => { exportOptions = options; return { ok: true }; }
  });
  await settle();

  assert.equal(harness.location.hash, "");
  assert.deepEqual(harness.sent.map((message) => message.action), ["claim", "status", "status", "close-tab"]);
  assert.equal(exportOptions.jobId, JOB_ID);
  assert.equal(exportOptions.allowIncomplete, false);
  assert.equal(exportOptions.completeness.complete, true);
});

test("auto export reports the integrity gate error and keeps the tab open", async () => {
  const harness = load({
    claim: { ok: true, options: { captureMode: "fast", closeTab: true } },
    collect: async () => ({ messages: [{ id: "m1" }], captureMode: "fast", completeness: { complete: false } }),
    exportMessages: async () => { throw new Error("Capture is incomplete and normal export is blocked."); }
  });
  await settle();

  const last = harness.sent.at(-1);
  assert.equal(last.action, "status");
  assert.equal(last.state, "error");
  assert.match(last.message, /incomplete/);
  assert.ok(!harness.sent.some((message) => message.action === "close-tab"));
});

test("auto export does nothing without a job id or when the claim fails", async () => {
  const noHash = load({ hash: "", claim: { ok: true }, collect: async () => { throw new Error("no"); }, exportMessages: async () => {} });
  await settle();
  assert.equal(noHash.sent.length, 0);

  let collected = false;
  const refused = load({ claim: { ok: false, error: "claimed" }, collect: async () => { collected = true; }, exportMessages: async () => {} });
  await settle();
  assert.deepEqual(refused.sent.map((message) => message.action), ["claim"]);
  assert.equal(collected, false);
});

test("a ping job only reports that the extension answers and closes the tab", async () => {
  let collected = false;
  const harness = load({
    claim: { ok: true, options: { ping: true, closeTab: true } },
    collect: async () => { collected = true; },
    exportMessages: async () => {}
  });
  await settle();

  assert.deepEqual(harness.sent.map((message) => message.action), ["claim", "status", "close-tab"]);
  assert.equal(collected, false);
});

test("a data-only job skips the PDF when exporting", async () => {
  let exportOptions = null;
  load({
    claim: { ok: true, options: { captureMode: "fast", pdf: false, closeTab: true } },
    collect: async () => ({ messages: [{ id: "m1" }], captureMode: "fast", completeness: { complete: true } }),
    exportMessages: async (messages, options) => { exportOptions = options; return { ok: true }; }
  });
  await settle();

  assert.equal(exportOptions.skipPdf, true);
});
