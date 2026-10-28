import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";

const repoRoot = path.resolve(import.meta.dirname, "..");
const read = (file) => readFile(path.join(repoRoot, "extension", "content", file), "utf8");
const ROBOT = "https://assets.grok.com/users/e001d77b/generated/356f44f8/image.jpg";

// provider.js with the helpers it uses in the real build: a fake page fetch, blobToDataUri and the URL extractor.
async function loadProvider(hostname, answers = []) {
  const calls = [];
  const context = vm.createContext({
    location: { hostname, origin: `https://${hostname}`, pathname: "/" },
    BUNDLE_IMAGE_DOWNLOAD_TIMEOUT_MS: 20000,
    uniqueStrings: (values) => [...new Set(values)],
    blobToDataUri: async (blob) => `data:${blob.type};base64,${blob.bytes}`,
    fetchWithTimeout: async (url, options) => {
      calls.push({ url, cache: options.cache, credentials: options.credentials });
      const answer = answers[Math.min(calls.length - 1, answers.length - 1)];
      return {
        ok: answer.status === 200,
        status: answer.status,
        headers: { get: () => answer.type ?? "image/jpeg" },
        blob: async () => ({ type: answer.type ?? "image/jpeg", bytes: "QUJD" })
      };
    }
  });
  vm.runInContext(`${await read("capture-validation.js")}\n${await read("provider.js")}\nfunction getGeminiPageImages() { return { "https://gemini.google.com/__convo_vault_image/1": "data:image/png;base64,REVG" }; }\nglobalThis.__p = { download: downloadProviderPageImages, id: getProviderId };`, context);
  return { download: context.__p.download, id: context.__p.id, calls };
}

const messages = [
  { markdown: `Here.\n\n![Generated Image](${ROBOT})\n\n![Chart](https://example.com/chart.png)`, thinkingMarkdown: "" },
  { markdown: `![Again](${ROBOT})`, thinkingMarkdown: "" }
];

test("Grok pictures are fetched by the page, with its session, once each, and nothing else is touched", async () => {
  const p = await loadProvider("grok.com", [{ status: 200 }]);

  const result = await p.download(messages, {});

  assert.deepEqual({ ...result.images }, { [ROBOT]: "data:image/jpeg;base64,QUJD" });
  assert.deepEqual({ ...result.failures }, {});
  assert.deepEqual(p.calls.map((call) => [call.url, call.cache, call.credentials]), [[ROBOT, "default", "include"]]);
});

test("a Grok picture refused once is asked for again past the browser's cache, and a second refusal is a failure", async () => {
  const retry = await loadProvider("grok.com", [{ status: 403 }, { status: 200 }]);
  assert.deepEqual(Object.keys((await retry.download(messages, {})).images), [ROBOT]);
  assert.deepEqual(retry.calls.map((call) => call.cache), ["default", "reload"]);

  const refused = await loadProvider("grok.com", [{ status: 403 }]);
  const result = await refused.download(messages, {});
  assert.deepEqual({ ...result.images }, {});
  assert.deepEqual({ ...result.failures }, { [ROBOT]: "image download HTTP 403" });

  const html = await loadProvider("grok.com", [{ status: 200, type: "text/html" }]);
  assert.match((await html.download(messages, {})).failures[ROBOT], /returned text\/html/);
});

test("Gemini hands over the pictures it drew, ChatGPT is left to its own downloader", async () => {
  const gemini = await loadProvider("gemini.google.com", [{ status: 200 }]);
  assert.deepEqual({ ...(await gemini.download(messages, {})).images }, { "https://gemini.google.com/__convo_vault_image/1": "data:image/png;base64,REVG" });
  assert.equal(gemini.calls.length, 0);

  const chatgpt = await loadProvider("chatgpt.com", [{ status: 200 }]);
  assert.deepEqual({ ...(await chatgpt.download(messages, {})).images }, {});
  assert.equal(chatgpt.calls.length, 0);
  assert.equal(chatgpt.id(), "chatgpt");
});
