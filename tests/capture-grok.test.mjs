import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";

const repoRoot = path.resolve(import.meta.dirname, "..");
const read = (file) => readFile(path.join(repoRoot, "extension", "content", file), "utf8");
const CONVERSATION_ID = "8cf3ca89-1360-4ff5-ba2c-5133f69e1a23";

const card = (name, args) => `<xai:tool_usage_card> <xai:tool_usage_card_id>x</xai:tool_usage_card_id> <xai:tool_name>${name}</xai:tool_name> <xai:tool_args><![CDATA[${JSON.stringify({ args })}]]></xai:tool_args> </xai:tool_usage_card>`;
const cite = (n) => `<grok:render card_id="c${n}" card_type="citation_card" type="render_inline_citation"><argument name="citation_id">${n}</argument></grok:render>`;
const human = (id, parent, time, message, extra = {}) => ({ responseId: id, sender: "human", parentResponseId: parent, createTime: time, message, ...extra });
const grok = (id, parent, time, message, extra = {}) => ({ responseId: id, sender: "assistant", parentResponseId: parent, createTime: time, message, ...extra });

// Loads capture-grok.js into a page that is grok.com, with a fake Grok API: `api` maps
// "METHOD path" to a JSON answer or a status number.
async function loadGrok(api) {
  const requests = [];
  const context = vm.createContext({
    location: { hostname: "grok.com", origin: "https://grok.com", pathname: `/c/${CONVERSATION_ID}`, search: "?rid=abc" },
    URL,
    URLSearchParams,
    document: { title: "Grok", querySelector: () => null },
    truncatePreview: (value, max) => String(value).slice(0, max),
    AbortController,
    window: { setTimeout, clearTimeout },
    fetch: async (url, options = {}) => {
      const { pathname } = new URL(url);
      const key = `${options.method || "GET"} ${pathname.replace(CONVERSATION_ID, "<id>")}`;
      requests.push({ key, body: options.body ? JSON.parse(options.body) : null, credentials: options.credentials });
      const answer = api[key];
      return typeof answer === "number" || answer === undefined
        ? { ok: false, status: answer || 404 }
        : { ok: true, status: 200, json: async () => (typeof answer === "function" ? answer(options) : answer) };
    }
  });
  const source = [await read("provider.js"), await read("capture-validation.js"), await read("date-format.js"), await read("capture-fast.js"), await read("capture-grok.js")].join("\n");
  vm.runInContext(`${source}\nglobalThis.__grok = { collect: collectGrokConversationMessages, title: () => lastApiConversationTitle };`, context);
  return { collect: context.__grok.collect, title: context.__grok.title, requests };
}

function conversation(responses, overrides = {}) {
  return {
    "GET /rest/app-chat/conversations_v2/<id>": { conversation: { conversationId: CONVERSATION_ID, title: "Claude Pro Subscription Price" } },
    "GET /rest/app-chat/conversations/<id>/response-node": {
      responseNodes: responses.map(({ responseId, sender, parentResponseId }) => ({ responseId, sender, parentResponseId })),
      inflightResponses: []
    },
    "POST /rest/app-chat/conversations/<id>/load-responses": (options) => {
      const wanted = new Set(JSON.parse(options.body).responseIds);
      return { responses: responses.filter((response) => wanted.has(response.responseId)) };
    },
    ...overrides
  };
}

const standard = () => [
  human("u1", "", "2026-07-29T10:00:00.000Z", "How much is Claude Pro?"),
  grok("a1", "u1", "2026-07-29T10:00:06.000Z", `Pro is **$20**.${cite(2)} Annual is cheaper.${cite(2)}${cite(0)} See the table.<grok:render card_id="z" type="render_searched_image"><argument name="image_id">3</argument></grok:render>`, {
    webSearchResults: [{ url: "https://a.example/plans", title: "Plans [2026]" }, { url: "https://b.example/x", title: "X" }, { url: "https://www.claude.com/pricing", title: "Pricing | Claude" }],
    thinkingStartTime: "2026-07-29T10:00:00.000Z",
    thinkingEndTime: "2026-07-29T10:01:05.000Z",
    steps: [{ text: ["Thinking about your request"] }, { text: [card("WebSearch", { query: "Claude AI subscription plans pricing" })] }, { text: [card("OpenPage", { url: "https://www.claude.com/pricing" })] }, { text: [card("Calculator", { expression: "20*12" })] }]
  }),
  human("u2", "a1", "2026-07-29T10:05:00.000Z", "And Max?", { fileAttachmentsMetadata: [{ fileName: "plans.pdf" }, { fileName: "plans.pdf" }] }),
  grok("a2", "u2", "2026-07-29T10:05:03.000Z", "Max is $100 or $200.")
];

test("a Grok conversation becomes ordered messages with footnotes, a thinking trace and the real title", async () => {
  const { collect, title, requests } = await loadGrok(conversation(standard()));

  const result = await collect(null, {});
  const [u1, a1, u2, a2] = result.messages;

  assert.deepEqual(Array.from(result.messages, (message) => message.role), ["user", "assistant", "user", "assistant"]);
  assert.deepEqual(Array.from(result.messages, (message) => message.turnNumber), [1, 2, 3, 4]);
  assert.equal(u1.markdown, "How much is Claude Pro?");
  assert.match(a1.markdown, /^Pro is \*\*\$20\*\*\.\[\^1\] Annual is cheaper\.\[\^1\]\[\^2\] See the table\./, "the same page is one footnote");
  assert.ok(!a1.markdown.includes("grok:render"), "Grok's widget tags are gone");
  assert.match(a1.markdown, /\[\^1\]: \[Pricing \| Claude\]\(https:\/\/www\.claude\.com\/pricing\)/);
  assert.match(a1.markdown, /\[\^2\]: \[Plans 2026\]\(https:\/\/a\.example\/plans\)/);
  assert.match(a1.thinkingMarkdown, /Worked for 1m 5s/);
  assert.match(a1.thinkingMarkdown, /🧠 \*\*推理思考\*\*: Thinking about your request/);
  assert.match(a1.thinkingMarkdown, /🔍 \*\*网页搜索\*\*: Claude AI subscription plans pricing/);
  assert.match(a1.thinkingMarkdown, /🌐 \*\*打开网页\*\*: https:\/\/www\.claude\.com\/pricing/);
  assert.match(a1.thinkingMarkdown, /🔧 \*\*调用工具\*\*: Calculator 20\*12/);
  assert.equal(u2.markdown, "And Max?\n\n📎 **Attachment**: plans.pdf");
  assert.equal(a2.thinkingMarkdown, "");
  assert.ok(a1.timestamp && a1.sourceMessageId === "a1");
  assert.equal(title(), "Claude Pro Subscription Price");
  assert.equal(result.completeness.complete, true);
  assert.ok(requests.every((request) => request.credentials === "include"), "the session cookies are used, no token");
});

test("a response that does not come back stops the export", async () => {
  const responses = standard();
  const { collect } = await loadGrok(conversation(responses, {
    "POST /rest/app-chat/conversations/<id>/load-responses": { responses: responses.filter((response) => response.responseId !== "a2") }
  }));

  const result = await collect(null, {});

  assert.equal(result.messages.length, 3);
  assert.equal(result.completeness.complete, false);
  assert.match(result.completeness.issues[0].message, /did not return 1 of 4 messages/);
});

test("a response still being written, or an unfinished one, blocks the export", async () => {
  const inflight = await loadGrok(conversation(standard(), {
    "GET /rest/app-chat/conversations/<id>/response-node": { responseNodes: standard().map(({ responseId, sender, parentResponseId }) => ({ responseId, sender, parentResponseId })), inflightResponses: [{ responseId: "a3" }] }
  }));
  assert.match((await inflight.collect(null, {})).completeness.issues[0].message, /still writing/);

  const responses = standard();
  responses[3].partial = true;
  const partial = await loadGrok(conversation(responses));
  assert.match((await partial.collect(null, {})).completeness.issues[0].message, /unfinished/);
});

test("a regenerated answer follows the newest branch and says the others were skipped", async () => {
  const responses = [
    human("u1", "", "2026-07-29T10:00:00.000Z", "Question"),
    grok("a-old", "u1", "2026-07-29T10:00:05.000Z", "First answer"),
    grok("a-new", "u1", "2026-07-29T10:02:00.000Z", "Regenerated answer"),
    human("u2", "a-new", "2026-07-29T10:03:00.000Z", "Follow-up"),
    grok("a2", "u2", "2026-07-29T10:03:05.000Z", "Follow-up answer")
  ];
  const { collect } = await loadGrok(conversation(responses));

  const result = await collect(null, {});

  assert.deepEqual(Array.from(result.messages, (message) => message.markdown), ["Question", "Regenerated answer", "Follow-up", "Follow-up answer"]);
  assert.equal(result.completeness.complete, true, "an alternative branch is a warning, not a gap");
  assert.match(result.completeness.warnings[0].message, /1 alternative response/);
});

test("responses are asked for in batches, and a Grok error names the route without the conversation id", async () => {
  const many = [];
  let parent = "";
  for (let index = 0; index < 120; index += 1) {
    const id = `r${index}`;
    many.push(index % 2 ? grok(id, parent, `2026-07-29T10:${String(index % 60).padStart(2, "0")}:00.000Z`, `answer ${index}`) : human(id, parent, `2026-07-29T10:${String(index % 60).padStart(2, "0")}:00.000Z`, `question ${index}`));
    parent = id;
  }
  const loaded = await loadGrok(conversation(many));
  const result = await loaded.collect(null, {});
  const loads = loaded.requests.filter((request) => request.key.startsWith("POST"));

  assert.equal(result.messages.length, 120);
  assert.deepEqual(loads.map((request) => request.body.responseIds.length), [50, 50, 20]);

  const denied = await loadGrok({ "GET /rest/app-chat/conversations_v2/<id>": 401 });
  await assert.rejects(() => denied.collect(null, {}), (error) => /HTTP 401 for \/rest\/app-chat\/conversations_v2\/<id>/.test(error.message) && !error.message.includes(CONVERSATION_ID));
});
