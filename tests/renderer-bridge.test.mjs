import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("background renderer bridge preserves the serialized request and downloads the prepared ZIP", async () => {
  const backgroundSource = await readFile(path.join(repoRoot, "extension", "background.js"), "utf8");
  const runtimeMessageEvent = createEvent();
  const runtimeConnectEvent = createEvent();
  const fetchCalls = [];
  const downloadCalls = [];
  const preparedId = "a".repeat(48);

  const chrome = {
    runtime: {
      id: "renderer-bridge-test",
      lastError: null,
      onMessage: runtimeMessageEvent,
      onConnect: runtimeConnectEvent
    },
    storage: {
      local: {
        get(_keys, callback) {
          callback({
            convoVaultSettings: {
              backendToken: "test-local-token",
              port: 65530
            }
          });
        }
      }
    },
    downloads: {
      download(options, callback) {
        downloadCalls.push(options);
        callback(73);
      }
    }
  };

  const context = {
    chrome,
    console,
    URL,
    TextEncoder,
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval: () => {},
    fetch: async (url, options) => {
      fetchCalls.push({ url, options });
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => JSON.stringify({
          ok: true,
          filename: "sample-conversation.zip",
          downloadPath: `/download-bundle/${preparedId}`,
          bundleFiles: "sample.md,sample.pdf,sample.payload.json",
          bundleSize: 4096,
          assetCount: 4,
          rendererTimings: { zipCreated: 125 }
        })
      };
    }
  };

  vm.runInNewContext(backgroundSource, context, { filename: "background.js" });
  assert.equal(runtimeConnectEvent.listeners.length, 1);

  const port = createPort();
  runtimeConnectEvent.emit(port);

  const serializedBody = JSON.stringify({
    exportPayload: { messages: [{ id: "u1", role: "user", markdown: "完整内容" }] },
    fileName: "sample-conversation.zip"
  });
  const splitAt = Math.floor(serializedBody.length / 2);
  const totalBytes = new TextEncoder().encode(serializedBody).byteLength;

  port.onMessage.emit({
    type: "START",
    totalCharacters: serializedBody.length,
    totalBytes
  });
  port.onMessage.emit({ type: "CHUNK", data: serializedBody.slice(0, splitAt) });
  port.onMessage.emit({ type: "CHUNK", data: serializedBody.slice(splitAt) });
  port.onMessage.emit({ type: "END" });

  await waitFor(() => port.sent.some((message) => message.type === "RESULT"));

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, "http://127.0.0.1:38474/prepare-render-bundle");
  assert.equal(fetchCalls[0].options.body, serializedBody);
  assert.equal(fetchCalls[0].options.headers["X-Convo-Vault-Token"], "test-local-token");

  assert.equal(downloadCalls.length, 1);
  assert.equal(downloadCalls[0].url, `http://127.0.0.1:38474/download-bundle/${preparedId}`);
  assert.equal(downloadCalls[0].filename, "sample-conversation.zip");
  assert.equal(downloadCalls[0].conflictAction, "uniquify");
  assert.equal(downloadCalls[0].saveAs, false);

  const result = port.sent.find((message) => message.type === "RESULT")?.result;
  assert.equal(result.ok, true);
  assert.equal(result.filename, "sample-conversation.zip");
  assert.equal(result.bundleFiles, "sample.md,sample.pdf,sample.payload.json");
  assert.equal(result.assetCount, 4);
  assert.equal(result.browserDownloadId, 73);
});

test("background renderer bridge stages image bytes outside the control JSON", async () => {
  const backgroundSource = await readFile(path.join(repoRoot, "extension", "background.js"), "utf8");
  const runtimeMessageEvent = createEvent();
  const runtimeConnectEvent = createEvent();
  const fetchCalls = [];
  const downloadCalls = [];
  const preparedId = "b".repeat(48);
  const sessionId = "c".repeat(48);
  const imageUrl = "https://assets.example.test/generated-image.png";
  const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

  const chrome = {
    runtime: {
      id: "renderer-bridge-image-test",
      lastError: null,
      onMessage: runtimeMessageEvent,
      onConnect: runtimeConnectEvent
    },
    storage: {
      local: {
        get(_keys, callback) {
          callback({ convoVaultSettings: { backendToken: "image-token" } });
        }
      }
    },
    downloads: {
      download(options, callback) {
        downloadCalls.push(options);
        callback(91);
      }
    }
  };
  const responseHeaders = (values = {}) => ({
    get(name) {
      return values[String(name).toLowerCase()] || null;
    }
  });
  const context = {
    AbortController,
    Blob,
    URL,
    TextEncoder,
    Uint8Array,
    atob,
    btoa,
    chrome,
    console,
    crypto: webcrypto,
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval: () => {},
    fetch: async (url, options = {}) => {
      fetchCalls.push({ url, options });

      if (url === imageUrl) {
        return {
          ok: true,
          status: 200,
          headers: responseHeaders({ "content-type": "image/png" }),
          blob: async () => new Blob([imageBytes], { type: "image/png" })
        };
      }

      if (url === "http://127.0.0.1:38474/export-sessions") {
        return jsonResponse({ ok: true, sessionId });
      }

      if (String(url).startsWith(`http://127.0.0.1:38474/export-sessions/${sessionId}/assets/`)) {
        assert.equal(options.method, "PUT");
        assert.equal(options.body instanceof Blob, true);
        assert.equal(options.body.size, imageBytes.length);
        return jsonResponse({
          ok: true,
          sha256: "d".repeat(64),
          reused: false
        });
      }

      if (url === "http://127.0.0.1:38474/prepare-render-bundle") {
        return jsonResponse({
          ok: true,
          filename: "staged-images.zip",
          downloadPath: `/download-bundle/${preparedId}`,
          bundleFiles: "sample.md,sample.pdf,sample.payload.json",
          bundleSize: 2048,
          assetCount: 1,
          assetStats: { imagesEmbedded: 1, imagesFailed: 0 },
          rendererTimings: { zipCreated: 75 }
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }
  };

  vm.runInNewContext(backgroundSource, context, { filename: "background.js" });
  const port = createPort();
  runtimeConnectEvent.emit(port);
  const serializedBody = JSON.stringify({
    exportPayload: {
      source: "https://chatgpt.com/c/staged-image-test",
      assetStats: { imagesEmbedded: 0, imagesFailed: 0, imagesSkipped: 0 },
      messages: [{
        id: "u-image",
        role: "user",
        markdown: `![Generated image](${imageUrl})`,
        thinkingMarkdown: ""
      }]
    },
    fileName: "staged-images.zip"
  });
  const totalBytes = new TextEncoder().encode(serializedBody).byteLength;

  port.onMessage.emit({ type: "START", totalCharacters: serializedBody.length, totalBytes });
  port.onMessage.emit({ type: "CHUNK", data: serializedBody });
  port.onMessage.emit({ type: "END" });
  await waitFor(() => port.sent.some((message) => message.type === "RESULT"));

  const prepareCall = fetchCalls.find((call) => call.url === "http://127.0.0.1:38474/prepare-render-bundle");
  const preparedBody = JSON.parse(prepareCall.options.body);
  assert.equal(preparedBody.exportSessionId, sessionId);
  assert.equal(preparedBody.exportPayload.messages[0].markdown, `![Generated image](${imageUrl})`);
  assert.equal(preparedBody.exportPayload.assetStats.imagesEmbedded, 1);
  assert.equal(preparedBody.exportPayload.assetStats.imagesFailed, 0);
  assert.doesNotMatch(prepareCall.options.body, /data:image\/png;base64/);
  assert.equal(downloadCalls.length, 1);
  assert.equal(port.sent.find((message) => message.type === "RESULT")?.result?.assetStats?.imagesEmbedded, 1);
});

test("background renderer bridge stages page-downloaded ChatGPT file images without refetching", async () => {
  const backgroundSource = await readFile(path.join(repoRoot, "extension", "background.js"), "utf8");
  const runtimeConnectEvent = createEvent();
  const fetchCalls = [];
  const stagedBodies = [];
  const sessionId = "e".repeat(48);
  const downloaded = "file-service://file-downloaded";
  const failed = "sediment://file_failed";
  const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 8, 7]);
  const dataUri = `data:image/png;base64,${Buffer.from(imageBytes).toString("base64")}`;
  const chrome = {
    runtime: { id: "page-image-test", lastError: null, onMessage: createEvent(), onConnect: runtimeConnectEvent },
    storage: { local: { get(_keys, callback) { callback({ convoVaultSettings: { backendToken: "token" } }); } } },
    downloads: { download(_options, callback) { callback(5); } }
  };
  const context = {
    AbortController, Blob, URL, TextEncoder, Uint8Array, atob, btoa, chrome, console,
    crypto: webcrypto, setTimeout, clearTimeout, setInterval: () => 1, clearInterval: () => {},
    fetch: async (url, options = {}) => {
      fetchCalls.push(String(url));
      if (url === "http://127.0.0.1:38474/export-sessions") {
        return jsonResponse({ ok: true, sessionId });
      }
      if (String(url).startsWith(`http://127.0.0.1:38474/export-sessions/${sessionId}/assets/`)) {
        stagedBodies.push(options.body);
        return jsonResponse({ ok: true, sha256: "f".repeat(64), reused: false });
      }
      if (url === "http://127.0.0.1:38474/prepare-render-bundle") {
        return jsonResponse({ ok: true, filename: "page-images.zip", downloadPath: `/download-bundle/${"9".repeat(48)}`, assetStats: JSON.parse(options.body).exportPayload.assetStats });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }
  };

  vm.runInNewContext(backgroundSource, context, { filename: "background.js" });
  const port = createPort();
  runtimeConnectEvent.emit(port);
  const serializedBody = JSON.stringify({
    exportPayload: {
      source: "https://chatgpt.com/c/page-images",
      assetStats: {},
      messages: [{ id: "u1", role: "user", markdown: `![Image](${downloaded})\n\n![Image](${failed})`, thinkingMarkdown: "" }]
    },
    fileName: "page-images.zip",
    pageImages: { [downloaded]: dataUri },
    pageImageFailures: { [failed]: "file download lookup HTTP 404" }
  });

  port.onMessage.emit({ type: "START", totalCharacters: serializedBody.length, totalBytes: serializedBody.length });
  port.onMessage.emit({ type: "CHUNK", data: serializedBody });
  port.onMessage.emit({ type: "END" });
  await waitFor(() => port.sent.some((message) => message.type === "RESULT"));

  assert.equal(fetchCalls.some((url) => url.includes("chatgpt.com")), false);
  assert.equal(stagedBodies.length, 1);
  assert.equal(stagedBodies[0].size, imageBytes.length);
  const result = port.sent.find((message) => message.type === "RESULT").result;
  assert.equal(result.assetStats.imagesEmbedded, 1);
  assert.equal(result.assetStats.imagesFailed, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result.assetStats.imageFailureSamples)), ["page download failed: file download lookup HTTP 404"]);
});

test("background renderer bridge stages page-downloaded files and records the ones the renderer refuses", async () => {
  const backgroundSource = await readFile(path.join(repoRoot, "extension", "background.js"), "utf8");
  const runtimeConnectEvent = createEvent();
  const stagedFiles = [];
  const prepareBodies = [];
  const sessionId = "a".repeat(48);
  const csv = "upload:file_csv";
  const doc = "generated:m1:/mnt/data/out.docx";
  const csvUri = `data:text/csv;charset=utf-8;base64,${Buffer.from("a,b\n1,2\n").toString("base64")}`;
  const docUri = `data:application/msword;base64,${Buffer.from("doc bytes").toString("base64")}`;
  const keyHash = async (key) => Buffer.from(await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(key))).toString("hex");
  const refused = await keyHash(doc);
  const chrome = {
    runtime: { id: "page-file-test", lastError: null, onMessage: createEvent(), onConnect: runtimeConnectEvent },
    storage: { local: { get(_keys, callback) { callback({ convoVaultSettings: { backendToken: "token" } }); } } },
    downloads: { download(_options, callback) { callback(5); } }
  };
  const context = {
    AbortController, Blob, URL, TextEncoder, Uint8Array, atob, btoa, chrome, console,
    crypto: webcrypto, setTimeout, clearTimeout, setInterval: () => 1, clearInterval: () => {},
    fetch: async (url, options = {}) => {
      if (url === "http://127.0.0.1:38474/export-sessions") {
        return jsonResponse({ ok: true, sessionId });
      }
      if (String(url).startsWith(`http://127.0.0.1:38474/export-sessions/${sessionId}/files/`)) {
        stagedFiles.push({ key: String(url).split("/").pop(), type: options.body.type, size: options.body.size });
        return String(url).endsWith(refused)
          ? jsonResponse({ ok: false, error: "Not enough free disk space" }, 507)
          : jsonResponse({ ok: true, sha256: "f".repeat(64) });
      }
      if (url === "http://127.0.0.1:38474/prepare-render-bundle") {
        prepareBodies.push(JSON.parse(options.body));
        return jsonResponse({ ok: true, filename: "files.zip", downloadPath: `/download-bundle/${"9".repeat(48)}` });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }
  };

  vm.runInNewContext(backgroundSource, context, { filename: "background.js" });
  const port = createPort();
  runtimeConnectEvent.emit(port);
  const serializedBody = JSON.stringify({
    exportPayload: {
      source: "https://chatgpt.com/c/page-files",
      assetStats: {},
      fileDownload: { requested: true, failures: { "upload:file_gone": "lookup HTTP 404 (conversation_not_found)" } },
      messages: [{ id: "u1", role: "user", markdown: "no images", thinkingMarkdown: "" }]
    },
    fileName: "files.zip",
    pageFiles: { [csv]: csvUri, [doc]: docUri }
  });

  port.onMessage.emit({ type: "START", totalCharacters: serializedBody.length, totalBytes: serializedBody.length });
  port.onMessage.emit({ type: "CHUNK", data: serializedBody });
  port.onMessage.emit({ type: "END" });
  await waitFor(() => port.sent.some((message) => message.type === "RESULT"));

  assert.equal(port.sent.find((message) => message.type === "RESULT").result.ok, true);
  assert.deepEqual(stagedFiles.map((file) => file.type).sort(), ["application/msword", "text/csv"], "type parameters are dropped, bytes are sent as blobs");
  const prepared = prepareBodies[0];
  assert.equal(prepared.exportSessionId, sessionId);
  assert.equal(prepared.pageFiles, undefined, "file bytes stay out of the control JSON");
  assert.equal(prepared.exportPayload.fileDownload.failures["upload:file_gone"], "lookup HTTP 404 (conversation_not_found)");
  assert.match(prepared.exportPayload.fileDownload.failures[doc], /could not be stored: Not enough free disk space/);
  assert.equal(prepared.exportPayload.fileDownload.failures[csv], undefined);
});

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify(body)
  };
}

function createEvent() {
  const listeners = [];
  return {
    listeners,
    addListener(listener) {
      listeners.push(listener);
    },
    removeListener(listener) {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    },
    emit(...args) {
      for (const listener of [...listeners]) listener(...args);
    }
  };
}

function createPort() {
  const onMessage = createEvent();
  const onDisconnect = createEvent();
  return {
    name: "CONVO_VAULT_LOCAL_RENDERER_BUNDLE",
    sender: { tab: { url: "https://chatgpt.com/c/test-conversation" } },
    onMessage,
    onDisconnect,
    sent: [],
    disconnected: false,
    postMessage(message) {
      this.sent.push(message);
    },
    disconnect() {
      if (this.disconnected) return;
      this.disconnected = true;
      onDisconnect.emit();
    }
  };
}

async function waitFor(predicate) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Timed out waiting for background renderer bridge result.");
}
