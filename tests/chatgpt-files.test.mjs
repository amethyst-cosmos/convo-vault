import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";

const repoRoot = path.resolve(import.meta.dirname, "..");
const source = await readFile(path.join(repoRoot, "extension", "content", "chatgpt-files.js"), "utf8");

// The module shares the content script's scope, so the helpers it calls are stubbed.
function load(routes) {
  const requests = [];
  const sandbox = {
    location: { origin: "https://chatgpt.com" },
    URL,
    URLSearchParams,
    Promise,
    Date,
    Number,
    String,
    Array,
    Set,
    Map,
    Object,
    Error,
    Blob,
    setTimeout: (fn) => { fn(); return 0; },
    isDilMessage: () => false,
    getDilFallbackMarkdown: () => "",
    getApiAttachmentObjects: (message) => message?.metadata?.attachments || [],
    getChatGptAccessToken: async () => "token",
    getCurrentConversationId: () => "conv-1",
    blobToDataUri: async (blob) => `data:${blob.type || "application/octet-stream"};base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}`,
    fetchWithTimeout: async (url) => {
      requests.push(url);
      const handler = routes.find((route) => url.includes(route.match));
      if (!handler) throw new Error(`unexpected request ${url}`);
      return handler.reply(url);
    }
  };
  vm.runInNewContext(`${source}\nthis.api = { collectApiFileRefs, downloadChatGptFiles };`, sandbox);
  return { api: sandbox.api, requests };
}

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const bytes = (body, type = "application/octet-stream") => new Response(body, { status: 200, headers: { "content-type": type } });

test("collectApiFileRefs lists uploads and sandbox files but not images", () => {
  const { api } = load([]);
  const refs = api.collectApiFileRefs({
    id: "m1",
    metadata: {
      attachments: [
        { id: "file_aaa", name: "报告.docx", mime_type: "application/msword", size: 12 },
        { id: "file_img", name: "shot.png", mime_type: "image/png", size: 5 }
      ]
    },
    content: { parts: ["Done: [out file.docx](sandbox:/mnt/data/out%20file.docx) and [again](sandbox:/mnt/data/out%20file.docx#x)"] }
  });

  assert.deepEqual(JSON.parse(JSON.stringify(refs.map((ref) => [ref.kind, ref.key, ref.name]))), [
    ["upload", "upload:file_aaa", "报告.docx"],
    ["generated", "generated:m1:/mnt/data/out file.docx", "out file.docx"],
    ["generated", "generated:m1:/mnt/data/out file.docx", "out file.docx"]
  ]);
  assert.equal(refs[0].sizeBytes, 12);
  assert.equal(refs[1].sandboxPath, "/mnt/data/out file.docx");
});

test("downloadChatGptFiles stores what it can and gives every failure its own reason", async () => {
  const { api, requests } = load([
    { match: "/files/download/file_ok", reply: () => json(200, { status: "success", download_url: "/dl/ok", file_size_bytes: 3 }) },
    { match: "/dl/ok", reply: () => bytes("abc", "application/msword") },
    { match: "/files/download/file_gone", reply: () => json(404, { detail: { code: "conversation_not_found", message: "x" } }) },
    { match: "/interpreter/download", reply: () => json(404, { detail: "Library file not found" }) },
    { match: "/files/download/file_big", reply: () => json(200, { status: "success", download_url: "/dl/big", file_size_bytes: 80 * 1024 * 1024 }) }
  ]);
  const ref = (key, extra) => ({ key, kind: "upload", name: key, messageId: "m", ...extra });
  const messages = [{
    fileRefs: [
      ref("upload:file_ok", { fileId: "file_ok" }),
      ref("upload:file_gone", { fileId: "file_gone" }),
      ref("upload:file_big", { fileId: "file_big" }),
      ref("generated:m:/mnt/data/a.docx", { kind: "generated", messageId: "m", sandboxPath: "/mnt/data/a.docx" })
    ]
  }, {
    fileRefs: [ref("upload:file_ok", { fileId: "file_ok" })]
  }];

  const result = await api.downloadChatGptFiles(messages, {});

  assert.deepEqual(Object.keys(result.files), ["upload:file_ok"]);
  assert.equal(result.files["upload:file_ok"], `data:application/msword;base64,${Buffer.from("abc").toString("base64")}`);
  assert.equal(result.failures["upload:file_gone"], "lookup HTTP 404 (conversation_not_found)");
  assert.equal(result.failures["generated:m:/mnt/data/a.docx"], "lookup HTTP 404 (Library file not found)");
  assert.match(result.failures["upload:file_big"], /^skipped: 80 MB is over the 64 MB limit per file/);
  assert.equal(requests.filter((url) => url.includes("/files/download/file_ok")).length, 1, "a file referenced twice is fetched once");
  assert.ok(requests.some((url) => url.includes("/interpreter/download") && url.includes("sandbox_path=%2Fmnt%2Fdata%2Fa.docx") && url.includes("message_id=m")));
});

test("a server error is retried once, then reported", async () => {
  let calls = 0;
  const { api } = load([
    { match: "/files/download/file_flaky", reply: () => { calls += 1; return json(503, {}); } }
  ]);
  const result = await api.downloadChatGptFiles([{ fileRefs: [{ key: "upload:file_flaky", kind: "upload", fileId: "file_flaky", name: "x" }] }], {});

  assert.equal(calls, 2);
  assert.equal(result.failures["upload:file_flaky"], "lookup HTTP 503");
});
