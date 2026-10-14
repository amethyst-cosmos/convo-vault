import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";

const repoRoot = path.resolve(import.meta.dirname, "..");
const S = "";
const D = "";
const E = "";

test("inline tokens render entities, links, image groups, and unknown tokens as portable Markdown", async () => {
  const markup = await loadMarkupModule();
  const context = markup.createChatGptMarkupContext();
  const rendered = markup.renderChatGptInlineTokens([
    `Use ${S}entity${D}["software","LM Studio","Local model runner"]${E} today.`,
    `Read ${S}url${D}Official site${D}https://example.com/docs${E}.`,
    `${S}image_group${D}{"query":["desk lamp","reading lamp"],"layout":"carousel"}${E}`,
    `${S}future_widget${D}{"x":1}${D}Visible label${E}`
  ].join("\n"), context);

  assert.equal(rendered, [
    "Use LM Studio today.",
    "Read [Official site](https://example.com/docs).",
    "*[Image search: desk lamp; reading lamp]*",
    "Visible label"
  ].join("\n"));
  assert.deepEqual({ ...context.unknownTokenCounts }, { future_widget: 1 });
});

test("citations resolve from 2026 search result groups and number footnotes once per source", async () => {
  const markup = await loadMarkupModule();
  const sources = markup.buildCitationSourceIndex([
    {
      metadata: {
        search_result_groups: [{
          domain: "example.com",
          entries: [
            { url: "https://example.com/a", title: "Source A", ref_id: { turn_index: 42, ref_type: "search", ref_index: 0 } },
            { url: "https://example.com/b", title: "Source B", ref_id: { turn_index: 42, ref_type: "search", ref_index: 1 } }
          ]
        }]
      }
    }
  ]);
  const context = markup.createChatGptMarkupContext({ citationSources: sources });
  const rendered = markup.renderChatGptInlineTokens(
    `One.${S}cite${D}turn42search0${E} Two.${S}cite${D}turn42search1${D}turn42search0${E} Gone.${S}cite${D}turn42view9${E}`,
    context
  );

  assert.equal(rendered, "One.[^1] Two.[^2][^1] Gone.");
  assert.equal(markup.formatChatGptFootnotes(context), [
    "[^1]: [Source A](https://example.com/a)",
    "[^2]: [Source B](https://example.com/b)"
  ].join("\n"));
  assert.deepEqual([...context.unresolvedCitationRefs], ["turn42view9"]);
});

test("citations resolve from legacy grouped_webpages content references", async () => {
  const markup = await loadMarkupModule();
  const sources = markup.buildCitationSourceIndex([{
    metadata: {
      content_references: [{
        type: "grouped_webpages",
        matched_text: `${S}cite${D}turn0search3${E}`,
        items: [{
          title: "Legacy source",
          url: "https://legacy.example/page",
          refs: [{ turn_index: 0, ref_type: "search", ref_index: 3 }]
        }]
      }]
    }
  }]);
  const context = markup.createChatGptMarkupContext({ citationSources: sources, footnoteOffset: 2 });

  assert.equal(markup.renderChatGptInlineTokens(`Fact${S}cite${D}turn0search3${E}`, context), "Fact[^3]");
  assert.equal(markup.formatChatGptFootnotes(context), "[^3]: [Legacy source](https://legacy.example/page)");
});

test("writing block directives become fenced Markdown blocks", async () => {
  const markup = await loadMarkupModule();
  const rendered = markup.renderChatGptWritingBlocks([
    "Send this:",
    "",
    ":::writing{variant=\"standard\" id=\"123\"}",
    "Please read `plan.md` and start.",
    "",
    "Use **only** P0.",
    ":::",
    "",
    "Done."
  ].join("\n"));

  assert.equal(rendered, [
    "Send this:",
    "",
    "```markdown",
    "Please read `plan.md` and start.",
    "",
    "Use **only** P0.",
    "```",
    "",
    "Done."
  ].join("\n"));
});

test("DIL source degrades to static Markdown and leaves code fences untouched", async () => {
  const markup = await loadMarkupModule();
  const rendered = markup.renderDilSourceAsMarkdown([
    "Intro **bold** text.",
    "",
    "{@body const [chip,setChip] = DIL.useState(\"unknown\")}",
    "<box border radius=\"xl\" padding={3}>",
    "  <title size=\"lg\"><Entity category=\"software\" value=\"LM Studio\"/></title>",
    "  <badge color=\"success\">Recommended</badge>",
    "  <icon name=\"arrow-down\"/>",
    "  <text color=\"secondary\">See <Link url=\"https://example.com\" title=\"docs\"/><Cite ref=\"turn1search0\"/></text>",
    "  <radio-group value={chip} onChange={setChip}>",
    "    <radio value=\"a\">Option A</radio>",
    "  </radio-group>",
    "  <button onClick={()=>GenUI.copy(\"x > y\")}>Copy</button>",
    "</box>",
    "",
    "```html",
    "<box>keep me</box>",
    "```"
  ].join("\n"));

  const [prose] = rendered.split("```html");
  assert.doesNotMatch(prose, /<\/?(?:box|title|badge|icon|text|radio|button|Entity|Link|Cite)\b/);
  assert.doesNotMatch(prose, /^ {4}/m);
  assert.doesNotMatch(rendered, /@body|DIL\.useState|GenUI/);
  assert.match(rendered, /Intro \*\*bold\*\* text\./);
  assert.match(rendered, /\*\*LM Studio\*\*/);
  assert.match(rendered, /\(Recommended\)/);
  assert.match(rendered, /↓/);
  assert.match(rendered, /See \[docs\]\(https:\/\/example\.com\)/);
  assert.match(rendered, /- Option A/);
  assert.match(rendered, /\[Copy\]/);
  assert.match(rendered, /```html\n<box>keep me<\/box>\n```/);
});

test("Fast builder exports DIL fallback Markdown with resolved citations instead of component source", async () => {
  const fast = await loadFastModule();
  const messages = fast.buildMessagesFromConversationApi({
    messages: [
      apiMessage("u1", "user", "Compare runners"),
      apiMessage("a1-search", "assistant", "", { recipient: "web.run", content_type: "code" }),
      apiMessage("t1", "tool", "", {
        metadata: {
          search_result_groups: [{
            domain: "example.com",
            entries: [{ url: "https://example.com/runner", title: "Runner docs", ref_id: { turn_index: 7, ref_type: "search", ref_index: 0 } }]
          }]
        }
      }),
      apiMessage("a1", "assistant", "<box><text>Pick <Entity category=\"software\" value=\"Runner\"/></text></box>", {
        channel: "final",
        end_turn: true,
        metadata: {
          model_dil_v2: {
            fallbackMarkdown: `Pick ${S}entity${D}["software","Runner"]${E}.${S}cite${D}turn7search0${E}\n\n[Download plan](sandbox:/mnt/data/plan.md)`
          }
        }
      })
    ],
    page_info: { has_previous_page: false }
  });

  assert.equal(messages.length, 2);
  assert.equal(messages[1].markdown, [
    "Pick Runner.[^1]",
    "",
    "[Download plan](sandbox:/mnt/data/plan.md)",
    "",
    "📥 **Generated File**: [Download plan](sandbox:/mnt/data/plan.md)",
    "",
    "[^1]: [Runner docs](https://example.com/runner)"
  ].join("\n"));
  assert.doesNotMatch(messages[1].markdown, /<box|<text|<Entity/);
});

test("Fast builder keeps a final answer whose text looks like JSON", async () => {
  const fast = await loadFastModule();
  const messages = fast.buildMessagesFromConversationApi({
    messages: [
      apiMessage("u1", "user", "Return the config as JSON"),
      apiMessage("a1", "assistant", "{\"port\": 8080}", { channel: "final", end_turn: true })
    ],
    page_info: { has_previous_page: false }
  });

  assert.deepEqual(Array.from(messages, (message) => message.markdown), [
    "Return the config as JSON",
    "{\"port\": 8080}"
  ]);
});

async function loadMarkupModule() {
  const source = await readFile(path.join(repoRoot, "src", "content", "chatgpt-markup.js"), "utf8");
  const context = vm.createContext({ makeFence });
  vm.runInContext(`${source}\nglobalThis.__markupTest = {
    buildCitationSourceIndex,
    createChatGptMarkupContext,
    formatChatGptFootnotes,
    renderChatGptInlineTokens,
    renderChatGptWritingBlocks,
    renderDilSourceAsMarkdown
  };`, context);
  return context.__markupTest;
}

async function loadFastModule() {
  const source = (await Promise.all([
    "chatgpt-markup.js",
    "conversation-manifest.js",
    "capture-fast.js"
  ].map((file) => readFile(path.join(repoRoot, "src", "content", file), "utf8")))).join("\n");
  const context = vm.createContext({
    cleanMarkdown: (value) => String(value || "").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim(),
    countMarkdownImages: (value) => (String(value || "").match(/!\[[^\]]*]\(/g) || []).length,
    formatConversationTimestamp: () => "",
    getCodeBlockDiagnostics: () => [],
    makeFence,
    sanitizeFileAttachmentName: (value) => String(value || "").trim(),
    filenameFromUrl: (value) => String(value || "").split("/").filter(Boolean).pop() || "",
    truncatePreview: (value, maxLength) => String(value || "").slice(0, maxLength),
    uniqueStrings: (values) => [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))]
  });
  vm.runInContext(`${source}\nglobalThis.__fastTest = { buildMessagesFromConversationApi };`, context);
  return context.__fastTest;
}

function apiMessage(id, role, text, options = {}) {
  return {
    id,
    author: { role },
    content: { content_type: options.content_type || "text", parts: [text] },
    channel: options.channel ?? null,
    recipient: options.recipient || "all",
    end_turn: options.end_turn ?? null,
    metadata: options.metadata || {}
  };
}

function makeFence(code) {
  const longestRun = Math.max(0, ...[...String(code).matchAll(/`+/g)].map((match) => match[0].length));
  return "`".repeat(Math.max(3, longestRun + 1));
}
