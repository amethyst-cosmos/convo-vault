import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("message units expose role and ChatGPT message ids from the 2026-10 DOM", async () => {
  const dom = await loadDomModule();
  const turn = el({ "data-turn-key": "u1" }, [
    el({ "data-chatgpt-search-unit-key": "fallback-turn-3:0:user", "data-chatgpt-search-message-ids": "u1" }, [
      el({ "data-user-message-bubble": "true" })
    ]),
    el({ "data-chatgpt-search-unit-key": "fallback-turn-3:2:assistant", "data-chatgpt-search-message-ids": "a1 a1" }, [
      el({ "data-conversation-role": "assistant" }),
      el({ "data-chatgpt-selection-message-id": "a1-final" }, [
        el({ "data-markdown-text-style": "assistant-message" })
      ])
    ])
  ]);
  const [userUnit, assistantUnit] = turn.children;

  assert.deepEqual(plain(dom.getChatGptMessageUnitInfo(userUnit)), {
    role: "user",
    messageIds: ["u1"],
    unitKey: "fallback-turn-3:0:user",
    turnKey: "u1"
  });
  assert.deepEqual(plain(dom.getChatGptMessageUnitInfo(assistantUnit).messageIds), ["a1", "a1-final"]);
  assert.equal(dom.getChatGptMessageUnitBody(userUnit, "user"), userUnit.children[0]);
  assert.equal(dom.getChatGptMessageUnitBody(assistantUnit, "assistant"), assistantUnit.children[1].children[0]);
  assert.equal(dom.getChatGptMessageUnitInfo(el({ "data-message-author-role": "user" })), null);
});

test("DOM order registry keeps conversation order across virtualized scroll batches", async () => {
  const dom = await loadDomModule();
  const registry = dom.createDomOrderRegistry();

  // Walking down: batches overlap at their edges.
  registry.observe(["m3", "m4", "m5"]);
  registry.observe(["m5", "m6", "m7"]);
  // A recovery pass mounts earlier messages after the walk.
  registry.observe(["m1", "m2", "m3"]);

  assert.deepEqual(["m1", "m2", "m3", "m4", "m5", "m6", "m7"].map((id) => registry.rank(id)), [1, 2, 3, 4, 5, 6, 7]);
  assert.ok(Number.isNaN(registry.rank("missing")));
});

test("manifest order renumbers DOM messages and keeps unknown messages beside their neighbours", async () => {
  const dom = await loadDomModule();
  const manifest = {
    entries: [
      { identity: "message:u1" },
      { identity: "reply:a1" },
      { identity: "message:u2" },
      { identity: "reply:a2" }
    ],
    nodeIdentity: new Map([["u1", "message:u1"], ["a1", "reply:a1"], ["u2", "message:u2"], ["a2", "reply:a2"]])
  };
  const messages = [
    { sourceMessageId: "u2", order: 1 },
    { sourceMessageId: "a2", order: 2 },
    { sourceMessageId: "", order: 3 },
    { sourceMessageId: "u1", order: 4 },
    { sourceMessageId: "a1", order: 5 }
  ];

  const ordered = dom.applyManifestOrder(messages, manifest);

  assert.deepEqual(ordered.map((message) => message.sourceMessageId), ["u1", "a1", "u2", "a2", ""]);
  assert.deepEqual(ordered.map((message) => message.order), [1, 2, 3, 4, 5]);
});

async function loadDomModule() {
  const source = (await Promise.all([
    "chatgpt-dom.js",
    "conversation-manifest.js"
  ].map((file) => readFile(path.join(repoRoot, "extension", "content", file), "utf8")))).join("\n");
  const context = vm.createContext({
    makeFence: () => "```",
    uniqueStrings: (values) => [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))]
  });
  vm.runInContext(`${source}\nglobalThis.__domTest = {
    applyManifestOrder,
    createDomOrderRegistry,
    getChatGptMessageUnitBody,
    getChatGptMessageUnitInfo
  };`, context);
  return context.__domTest;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

// Minimal element supporting the attribute selectors used by chatgpt-dom.js:
// [name], [name='value'], [name="value"], and comma-separated lists.
function el(attributes = {}, children = []) {
  const node = {
    attributes,
    children,
    parentElement: null,
    getAttribute: (name) => (name in attributes ? String(attributes[name]) : null),
    hasAttribute: (name) => name in attributes,
    matches: (selector) => selector.split(",").some((part) => matchesSimple(node, part.trim())),
    closest(selector) {
      for (let current = node; current; current = current.parentElement) {
        if (current.matches(selector)) return current;
      }
      return null;
    },
    querySelectorAll(selector) {
      const found = [];
      const visit = (current) => {
        for (const child of current.children) {
          if (child.matches(selector)) found.push(child);
          visit(child);
        }
      };
      visit(node);
      return found;
    },
    querySelector(selector) {
      return node.querySelectorAll(selector)[0] || null;
    }
  };
  children.forEach((child) => {
    child.parentElement = node;
  });
  return node;
}

function matchesSimple(node, selector) {
  const match = selector.match(/^\[([\w-]+)(?:([$^*]?=)['"]?([^'"\]]*)['"]?)?\]$/);
  if (!match) return false;
  const [, name, operator, expected] = match;
  if (!(name in node.attributes)) return false;
  if (!operator) return true;
  const actual = String(node.attributes[name]);
  if (operator === "=") return actual === expected;
  if (operator === "$=") return actual.endsWith(expected);
  if (operator === "^=") return actual.startsWith(expected);
  return actual.includes(expected);
}
