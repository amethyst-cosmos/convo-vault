import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";

const repoRoot = path.resolve(import.meta.dirname, "..");
const read = (file) => readFile(path.join(repoRoot, "extension", "content", file), "utf8");

const PROJECT_ID = `g-p-${"6911465a6f688191899dd2472df837c0"}`;
const conv = (n, title, extra = {}) => ({ id: `00000000-0000-4000-8000-00000000000${n}`, title, update_time: 1_700_000_000 + n, ...extra });

// Loads conversation-list.js with a fake ChatGPT: `routes` maps a path prefix to a JSON answer (or a status).
async function loadList({ routes, links = [] }) {
  const requested = [];
  const context = vm.createContext({
    location: { origin: "https://chatgpt.com" },
    URL,
    getChatGptAccessToken: async () => "token",
    fetchWithTimeout: async (url) => {
      const { pathname, search } = new URL(url);
      requested.push(pathname + search);
      const key = Object.keys(routes).find((prefix) => (pathname + search).startsWith(prefix));
      const answer = key ? routes[key] : 404;
      const body = typeof answer === "function" ? answer(pathname + search) : answer;
      return typeof body === "number" ? { ok: false, status: body } : { ok: true, status: 200, json: async () => body };
    },
    document: {
      querySelectorAll: (selector) => links.filter((link) => selector.includes(link.kind)).map((link) => ({
        getAttribute: () => link.href,
        textContent: link.text
      }))
    }
  });
  vm.runInContext(`${await read("conversation-list.js")}\nglobalThis.__list = { listConversations };`, context);
  return { list: context.__list.listConversations, requested };
}

test("a project is found by name, then its conversations are read page by page", async () => {
  const { list, requested } = await loadList({
    routes: {
      "/backend-api/gizmos/snorlax/sidebar": { items: [{ gizmo: { gizmo: { id: PROJECT_ID, display: { name: "Working" } } }, conversations: { items: [] } }] },
      [`/backend-api/gizmos/${PROJECT_ID}/conversations?cursor=0`]: { items: [conv(1, "解读商业合作邀请"), conv(2, "二手衣物测量广告整理")], cursor: "2" },
      [`/backend-api/gizmos/${PROJECT_ID}/conversations?cursor=2`]: { items: [conv(3, "制作PPT第一页")], cursor: null }
    }
  });

  const result = await list({ project: "working" });

  assert.equal(result.source, "api");
  assert.deepEqual({ ...result.project }, { id: PROJECT_ID, name: "Working" });
  assert.deepEqual(Array.from(result.conversations, (item) => item.title), ["制作PPT第一页", "二手衣物测量广告整理", "解读商业合作邀请"], "newest first");
  assert.ok(result.conversations.every((item) => item.projectId === PROJECT_ID));
  assert.equal(requested.filter((url) => url.includes("cursor=")).length, 2);
});

test("a project link or id skips the project lookup", async () => {
  const { list, requested } = await loadList({
    routes: { [`/backend-api/gizmos/${PROJECT_ID}/conversations`]: { items: [conv(1, "Only one")] } }
  });

  const result = await list({ project: `https://chatgpt.com/g/${PROJECT_ID}-working/project` });

  assert.equal(result.project.id, PROJECT_ID);
  assert.equal(result.conversations.length, 1);
  assert.ok(!requested.some((url) => url.includes("sidebar")));
});

test("an unknown project names the projects that were seen", async () => {
  const { list } = await loadList({
    routes: { "/backend-api/gizmos/snorlax/sidebar": { items: [{ id: PROJECT_ID, name: "Working" }] } }
  });

  await assert.rejects(() => list({ project: "Nope" }), /No project named "Nope".*Working/);
});

test("when the project API fails the links on the page are used, and the note says so", async () => {
  const { list } = await loadList({
    routes: {},
    links: [
      { kind: "g-p-", href: `/g/${PROJECT_ID}-working/project`, text: "Working" },
      { kind: "/c/", href: `/g/${PROJECT_ID}-working/c/00000000-0000-4000-8000-000000000009`, text: " 制作PPT第一页 " }
    ]
  });

  const result = await list({ project: "Working" });

  assert.equal(result.source, "page");
  assert.equal(result.conversations[0].title, "制作PPT第一页");
  assert.ok(result.notes.some((note) => /links on this page/.test(note)));
});

test("without a project the account's recent conversations are listed, whatever the field names around them", async () => {
  const { list, requested } = await loadList({
    routes: { "/backend-api/conversations?": { items: [conv(1, "One"), conv(2, "Two", { title: null })], total: 2 } }
  });

  const result = await list({ limit: 5 });

  assert.equal(result.project, null);
  assert.deepEqual(Array.from(result.conversations, (item) => item.title).sort(), ["", "One"].sort());
  assert.match(requested[0], /offset=0&limit=100/);
});

test("the title of the conversation comes from the API, not from a tab that still says New chat", async () => {
  const context = vm.createContext({
    document: { title: "新聊天", querySelector: () => null },
    location: { href: "https://chatgpt.com/c/page-conversation-1", origin: "https://chatgpt.com", pathname: "/c/page-conversation-1", search: "" },
    getElementText: () => "",
    URLSearchParams,
    URL
  });
  const fast = await read("capture-fast.js");
  const pageUtils = await read("page-utils.js");
  vm.runInContext(`${fast}\n${pageUtils}`, context);
  const run = (code) => vm.runInContext(code, context);

  assert.equal(run("getConversationTitle()"), "新聊天", "no API title yet: the old behaviour");

  run(`lastApiConversationTitle = cleanApiConversationTitle("制作PPT第一页")`);
  assert.equal(run("getConversationTitle()"), "制作PPT第一页");

  run(`lastApiConversationTitle = cleanApiConversationTitle("New chat")`);
  assert.equal(run("getConversationTitle()"), "新聊天", "a placeholder from the API is ignored");

  run(`setActiveExportContext({ conversationId: "other-conversation-1" })`);
  assert.equal(run("getConversationTitle()"), "ChatGPT Conversation", "a batch never borrows the tab's title for another conversation");
  assert.equal(run("getExportSourceUrl()"), "https://chatgpt.com/c/other-conversation-1");
  assert.equal(run("getCurrentConversationId()"), "other-conversation-1");

  run(`setActiveExportContext(null)`);
  assert.equal(run("getCurrentConversationId()"), "page-conversation-1");
});
