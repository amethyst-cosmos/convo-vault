import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";
import { PAGE_BRIDGE_SOURCE, createBackground } from "../cli/lib/ego-lite-driver.mjs";
import { findBrowser, listInstalledBrowsers } from "../cli/lib/browser.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const backgroundSource = await readFile(path.join(repoRoot, "extension", "background.js"), "utf8");
const JOB_ID = "a".repeat(48);
const PAGE_URL = "https://chatgpt.com/c/68738d5b-2e70-8002-8388-c76fdaea3f72";

// The page side of the bridge, in a sandbox standing in for the chat page.
function loadPageBridge() {
  const window = {};
  vm.runInContext(PAGE_BRIDGE_SOURCE, vm.createContext({ window, JSON }));
  return window.__convoVaultBridge;
}

// Moves messages between the page bridge and background.js until neither side has anything left.
// Both directions go through JSON, as page.evaluate() carries them.
async function relay(bridge, background) {
  for (let round = 0; round < 50; round += 1) {
    const outgoing = JSON.parse(JSON.stringify(bridge.drain(1024 * 1024)));
    for (const item of outgoing) await background.receive(item);
    const deliveries = JSON.parse(JSON.stringify(background.takeDeliveries()));
    bridge.deliver(deliveries);
    if (!outgoing.length && !deliveries.length && !background.busy()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("The relay did not settle.");
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

test("ego lite is a browser choice, tried first when installed", () => {
  assert.equal(findBrowser("ego")?.egoLite, true);
  assert.equal(findBrowser("ego lite")?.name, "ego lite");
  assert.equal(findBrowser("chrome")?.egoLite, undefined);

  const saved = process.env.CONVO_VAULT_EGO_BROWSER;
  try {
    process.env.CONVO_VAULT_EGO_BROWSER = "/opt/ego/ego-browser";
    assert.equal(listInstalledBrowsers()[0]?.name, "ego lite");
    process.env.CONVO_VAULT_EGO_BROWSER = "";
    assert.equal(listInstalledBrowsers().some((browser) => browser.egoLite), false);
  } finally {
    if (saved === undefined) delete process.env.CONVO_VAULT_EGO_BROWSER;
    else process.env.CONVO_VAULT_EGO_BROWSER = saved;
  }
});

test("a job message from the page reaches background.js and its answer comes back", async () => {
  const requests = [];
  const background = createBackground(backgroundSource, {
    pageUrl: PAGE_URL,
    fetchImpl: async (url, init = {}) => {
      requests.push({ url: String(url), method: init.method, headers: init.headers || {} });
      return jsonResponse({ ok: true, token: "renderer-token", options: { closeTab: true } });
    }
  });
  const bridge = loadPageBridge();

  let answer;
  bridge.chrome.runtime.sendMessage({ type: "CONVO_VAULT_JOB", action: "claim", jobId: JOB_ID }, (response) => { answer = response; });
  await relay(bridge, background);

  assert.deepEqual(answer, { ok: true, options: { closeTab: true } });
  assert.equal(requests[0].url, `http://127.0.0.1:38474/jobs/${JOB_ID}/claim`);
  // The claim token is kept for the next requests, as the extension keeps it in chrome.storage.
  assert.equal(background.storage.convoVaultSettings.backendToken, "renderer-token");

  bridge.chrome.runtime.sendMessage({ type: "CONVO_VAULT_JOB", action: "status", jobId: JOB_ID, state: "working", message: "Reading" }, (response) => { answer = response; });
  await relay(bridge, background);
  assert.deepEqual(answer, { ok: true });
  assert.equal(requests[1].headers["X-Convo-Vault-Token"], "renderer-token");
});

test("close-tab from the page closes the ego lite page", async () => {
  let closed = false;
  const background = createBackground(backgroundSource, { pageUrl: PAGE_URL, onCloseTab: () => { closed = true; }, fetchImpl: async () => jsonResponse({ ok: true }) });
  const bridge = loadPageBridge();

  bridge.chrome.runtime.sendMessage({ type: "CONVO_VAULT_JOB", action: "close-tab", jobId: JOB_ID }, () => {});
  await relay(bridge, background);
  assert.equal(closed, true);
});

test("an export body streamed over the port becomes one prepare-render-bundle request", async () => {
  const prepared = [];
  const background = createBackground(backgroundSource, {
    pageUrl: PAGE_URL,
    fetchImpl: async (url, init = {}) => {
      if (String(url).endsWith("/prepare-render-bundle")) {
        prepared.push(JSON.parse(init.body));
        return jsonResponse({ ok: true, filename: "chat.zip", downloadPath: "/download-bundle/x", bundleFiles: "md,pdf" });
      }
      return jsonResponse({ ok: false }, 500);
    }
  });
  const bridge = loadPageBridge();
  const body = JSON.stringify({ jobId: JOB_ID, fileName: "chat.zip", exportPayload: { messages: [{ markdown: "x".repeat(3000) }] }, pageImages: {} });

  const port = bridge.chrome.runtime.connect({ name: "CONVO_VAULT_LOCAL_RENDERER_BUNDLE" });
  let result;
  let disconnected = false;
  port.onMessage.addListener((message) => { if (message.type === "RESULT") result = message.result; });
  port.onDisconnect.addListener(() => { disconnected = true; });
  port.postMessage({ type: "START", totalCharacters: body.length, totalBytes: new TextEncoder().encode(body).byteLength });
  for (let offset = 0; offset < body.length; offset += 1000) port.postMessage({ type: "CHUNK", data: body.slice(offset, offset + 1000) });
  port.postMessage({ type: "END" });
  await relay(bridge, background);

  assert.equal(result.ok, true);
  assert.equal(result.filename, "chat.zip");
  // A job's bundle is collected by the CLI, never downloaded by the browser.
  assert.equal(result.browserDownloadId, null);
  assert.equal(prepared.length, 1);
  assert.equal(prepared[0].jobId, JOB_ID);
  assert.equal(prepared[0].exportPayload.messages[0].markdown.length, 3000);
  assert.equal(disconnected, true);
});

test("the page bridge hands over its outbox in bounded rounds", () => {
  const bridge = loadPageBridge();
  for (let index = 0; index < 5; index += 1) bridge.chrome.runtime.sendMessage({ data: "y".repeat(400) });

  const first = bridge.drain(1000);
  const rest = bridge.drain(1_000_000);
  assert.equal(first.length, 2);
  assert.equal(rest.length, 3);
  // An item larger than the bound still goes, alone.
  bridge.chrome.runtime.sendMessage({ data: "z".repeat(5000) });
  assert.equal(bridge.drain(1000).length, 1);
});
