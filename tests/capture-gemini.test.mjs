import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";

const repoRoot = path.resolve(import.meta.dirname, "..");
const read = (file) => readFile(path.join(repoRoot, "extension", "content", file), "utf8");

// ---- a small HTML parser: enough of the DOM (nodeType, tagName, childNodes, getAttribute, textContent) ----
const VOID = new Set(["br", "img", "hr", "input"]);
const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&nbsp;": " ", "&#39;": "'" };
const decode = (text) => text.replace(/&(?:amp|lt|gt|quot|nbsp|#39);/g, (entity) => ENTITIES[entity]);

function parse(html) {
  const root = element("root", {});
  const stack = [root];
  const pattern = /<(\/?)([a-z][a-z0-9-]*)((?:\s+[a-z-]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/gi;
  let match;

  while ((match = pattern.exec(html))) {
    const [, closing, name, rawAttributes, selfClosing, text] = match;
    const top = stack[stack.length - 1];

    if (text !== undefined) {
      top.childNodes.push({ nodeType: 3, textContent: decode(text), parentNode: top });
    } else if (closing) {
      stack.pop();
    } else {
      const attributes = {};
      for (const [, key, value] of rawAttributes.matchAll(/([a-z-]+)(?:="([^"]*)")?/gi)) attributes[key] = decode(value ?? "");
      const node = element(name, attributes);
      node.parentNode = top;
      top.childNodes.push(node);
      if (!VOID.has(name) && !selfClosing) stack.push(node);
    }
  }

  return root.childNodes[0];
}

function element(name, attributes) {
  const node = {
    nodeType: 1,
    tagName: name.toUpperCase(),
    attributes,
    childNodes: [],
    parentNode: null,
    getAttribute: (key) => (key in attributes ? attributes[key] : null)
  };
  Object.defineProperty(node, "textContent", {
    get: () => node.childNodes.map((child) => child.textContent).join("")
  });
  return node;
}

// ---- the module, with the page edge replaceable ----
async function loadGemini({ pathname = "/app/ee7a64284d74cdd1" } = {}) {
  const context = vm.createContext({
    location: { hostname: "gemini.google.com", origin: "https://gemini.google.com", pathname, search: "" },
    document: { title: "Google Gemini" },
    window: { setTimeout, clearTimeout },
    URL, URLSearchParams, Date, Promise,
    truncatePreview: (value, max) => String(value).slice(0, max)
  });
  vm.runInContext(`${await read("provider.js")}\n${await read("capture-fast.js")}\n${await read("capture-gemini.js")}\nglobalThis.__g = {
    collect: collectGeminiConversationMessages, id: getGeminiConversationId, md: geminiHtmlToMarkdown,
    turn: extractGeminiTurn, user: geminiUserMarkdown, title: () => lastApiConversationTitle,
    set(name, value) { globalThis[name] = value; }
  };`, context);
  return context.__g;
}

const turnHtml = (id, user, reply) => `<div class="conversation-container" id="${id}"><user-query><div class="query-text"><h5 class="screen-reader-user-query-label"><span>You said</span>${user}</h5><p class="query-text-line">${user}</p></div></user-query><model-response><message-content><div class="markdown">${reply}</div></message-content></model-response></div>`;

test("headings, emphasis, links, quotes, rules and Gemini's own odd bold come out as Markdown", async () => {
  const g = await loadGemini();
  const html = parse('<div class="markdown"><h3>1. 标题</h3><p>这类软件被称为“提词器”<b>或</b>“助手”，见 <a href="https://example.com/a">example</a>。 <i>斜体</i> <s>划掉</s></p><blockquote><p>注意</p><p>第二段</p></blockquote><hr><p>末尾</p></div>');

  assert.equal(g.md(html), [
    "### 1. 标题",
    "",
    "这类软件被称为“提词器”**或**“助手”，见 [example](https://example.com/a)。 *斜体* ~~划掉~~",
    "",
    "> 注意",
    ">",
    "> 第二段",
    "",
    "---",
    "",
    "末尾"
  ].join("\n"));
});

test("nested lists keep their depth, numbers and wrapped lines", async () => {
  const g = await loadGemini();
  const html = parse('<div><ul><li><b>A</b>：一<ul><li>a1</li><li>a2</li></ul></li><li>B</li></ul><ol><li>第一步</li><li>第二步<ol><li>细分</li></ol></li></ol></div>');

  assert.equal(g.md(html), ["- **A**：一", "  - a1", "  - a2", "- B", "", "1. 第一步", "2. 第二步", "   1. 细分"].join("\n"));
});

test("code blocks keep their language and any backticks inside, inline code is fenced safely", async () => {
  const g = await loadGemini();
  const block = parse('<div><p>用 <code>npm test</code> 或 <code>a`b</code>：</p><code-block><div class="code-block-decoration"><span>JavaScript</span><button>copy</button></div><pre><code>const a = `x`;\nconsole.log(a);\n</code></pre></code-block><pre><code class="language-py">print(1)</code></pre></div>');

  assert.equal(g.md(block), [
    "用 `npm test` 或 ``a`b``：",
    "",
    "```javascript",
    "const a = `x`;",
    "console.log(a);",
    "```",
    "",
    "```py",
    "print(1)",
    "```"
  ].join("\n"));
});

test("tables become GFM tables, math keeps its LaTeX, images become links, controls and hidden labels vanish", async () => {
  const g = await loadGemini();
  const html = parse('<div><table-block><table><tr><th>项目</th><th>价格</th></tr><tr><td>A | B</td><td>$20</td></tr></table></table-block><p>面积 <span class="math-inline" data-math="\\pi r^2">πr²</span></p><div class="math-block" data-math="E=mc^2">E=mc²</div><img src="https://lh3.googleusercontent.com/x" alt="图表"><p>文字<button>copy</button><mat-icon>content_copy</mat-icon><span class="cdk-visually-hidden">Gemini said</span></p></div>');

  assert.equal(g.md(html), [
    "| 项目 | 价格 |",
    "| --- | --- |",
    "| A \\| B | $20 |",
    "",
    "面积 $\\pi r^2$",
    "",
    "$$",
    "E=mc^2",
    "$$",
    "",
    "🖼️ **图表** (link, not downloaded): https://lh3.googleusercontent.com/x",
    "",
    "文字"
  ].join("\n"));
});

test("a prompt is rebuilt from its lines and numbered list, without the screen reader copy of itself", async () => {
  const g = await loadGemini();
  const prompt = parse('<user-query><div class="file-preview-container"><div class="file-name">plans.pdf</div><div class="file-name">plans.pdf</div></div><div class="query-text"><h5 class="screen-reader-user-query-label"><span>You said</span>duplicate text duplicate text</h5><ol class="query-numbered-list"><li class="query-numbered-item">专门针对工具</li></ol><p class="query-text-line">这类工具在后台运行</p><p class="query-text-line"><br></p><p class="query-text-line">Offer IN：国内流行</p><p class="query-text-line">这几个都是免费的吗？</p></div></user-query>');

  assert.equal(g.user(prompt), "1. 专门针对工具  \n这类工具在后台运行\n\nOffer IN：国内流行  \n这几个都是免费的吗？\n\n📎 **Attachment**: plans.pdf");
  assert.ok(!g.user(prompt).includes("duplicate"));
});

test("a turn is a prompt and its reply, and the conversation id comes from /app, /u/N/app or /gem", async () => {
  const g = await loadGemini();
  const turn = g.turn(parse(turnHtml("c1", "你好", "<p>世界</p><p>第二段</p>")), 0);

  assert.deepEqual({ ...turn }, { index: 0, id: "c1", user: "你好", assistant: "世界\n\n第二段", generating: false });
  assert.equal(g.id(), "ee7a64284d74cdd1");
  assert.equal((await loadGemini({ pathname: "/u/1/app/aabbccdd11223344" })).id(), "aabbccdd11223344");
  assert.equal((await loadGemini({ pathname: "/gem/storybook/aabbccdd11223344" })).id(), "aabbccdd11223344");
  assert.equal((await loadGemini({ pathname: "/app" })).id(), "");
});

// ---- the whole capture against a pretend page that loads older turns when scrolled ----
function pretendPage(g, { totals, replyFor = () => "<p>reply</p>", title = "共享屏幕隐形提词器推荐 - Google Gemini", generating = false }) {
  const all = Array.from({ length: Math.max(...totals) }, (_, index) => parse(turnHtml(`t${index + 1}`, `prompt ${index + 1}`, replyFor(index))));
  let round = 0;
  g.set("geminiSleep", async () => {});
  g.set("geminiWaitFor", async () => {});
  g.set("geminiScrollOlderIntoView", () => { round += 1; });
  g.set("geminiListTurns", () => all.slice(all.length - (totals[Math.min(round, totals.length - 1)] ?? totals.at(-1))));
  g.set("geminiPageTitle", () => title.replace(/\s*-\s*Google Gemini\s*$/i, ""));
  g.set("geminiIsGenerating", () => generating);
  return all;
}

test("older turns are scrolled in until the count stops growing, then every turn is exported in order", async () => {
  const g = await loadGemini();
  pretendPage(g, { totals: [2, 4, 6, 6, 6, 6, 6] });

  const result = await g.collect(null, {});

  assert.equal(result.messages.length, 12);
  assert.deepEqual(Array.from(result.messages.slice(0, 4), (message) => `${message.role}:${message.markdown}`), ["user:prompt 1", "assistant:reply", "user:prompt 2", "assistant:reply"]);
  assert.deepEqual(Array.from(result.messages, (message) => message.turnNumber), Array.from({ length: 12 }, (_, i) => i + 1));
  assert.equal(g.title(), "共享屏幕隐形提词器推荐");
  assert.equal(result.completeness.complete, true);
  assert.ok(result.completeness.warnings.some((warning) => warning.code === "no-message-count"));
  assert.ok(result.completeness.warnings.some((warning) => warning.code === "thinking-not-captured"));
});

test("a prompt without a reply, a reply still being written, or turns the page dropped block the export", async () => {
  const unanswered = await loadGemini();
  pretendPage(unanswered, { totals: [3, 3, 3, 3], replyFor: (index) => (index === 2 ? "" : "<p>ok</p>") });
  assert.match((await unanswered.collect(null, {})).completeness.issues[0].message, /1 prompt\(s\) have no reply/);

  const writing = await loadGemini();
  pretendPage(writing, { totals: [2, 2, 2, 2], generating: true });
  assert.match((await writing.collect(null, {})).completeness.issues[0].message, /still writing/);

  const dropped = await loadGemini();
  pretendPage(dropped, { totals: [4, 6, 3, 3, 3, 3] });
  const result = await dropped.collect(null, {});
  assert.equal(result.completeness.complete, false);
  assert.match(result.completeness.issues[0].message, /dropped older turns while loading \(6 seen, 3 left\)/);
});

test("a conversation that never stops growing hits the scroll limit and says so, a placeholder title is ignored", async () => {
  const g = await loadGemini();
  pretendPage(g, { totals: Array.from({ length: 90 }, (_, index) => index + 1), title: "Google Gemini" });

  const result = await g.collect(null, {});

  assert.ok(result.completeness.warnings.some((warning) => warning.code === "load-limit"));
  assert.equal(g.title(), "", "the placeholder is not used as a title");
});
