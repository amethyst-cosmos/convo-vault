"use strict";

const translations = require("./decision-path-translations");
const { normalizeExportLocale } = require("./export-locale");

const LABELS = {
  zh: {
    title: "思考路线",
    scope: "按记录顺序分段。进度说明与摘要来自平台，工具摘录来自已保存的结果。事件先后只能说明顺序。",
    coverage: (covered, total) => `${total} 条回答中，${covered} 条有可排列的过程记录。`,
    empty: "这份导出没有可排列的进度说明、思考摘要或工具活动。可以查看原对话中的解法。",
    turns: "有过程记录的回答",
    turn: "Turn",
    prompt: "原问题",
    starting: "前置活动",
    note: "进度说明",
    thought: "思考摘要",
    titleOnly: "仅标题",
    activity: "工具活动",
    earlier: (count) => `另有 ${count} 条摘要见完整轨迹。`,
    tools: (calls, results) => `${calls} 次调用，${results} 条结果记录`,
    excerpt: "结果摘录",
    answer: "查看最终回答",
    trace: "查看完整轨迹"
  },
  en: {
    title: "Decision path",
    scope: "Steps follow the captured order. Progress notes and summaries come from the provider. Tool excerpts come from saved results. Event order alone shows sequence.",
    coverage: (covered, total) => `${covered} of ${total} answers have recorded activity to review.`,
    empty: "This export has no captured progress notes, reasoning summaries, or tool activity to arrange. The conversation contains the original answers.",
    turns: "Answers with recorded activity",
    turn: "Turn",
    prompt: "Original prompt",
    starting: "Earlier activity",
    note: "Progress note",
    thought: "Reasoning summary",
    titleOnly: "title only",
    activity: "Tool activity",
    earlier: (count) => `See the full trace for ${count} additional summaries.`,
    tools: (calls, results) => `${calls} calls, ${results} results`,
    excerpt: "Result excerpt",
    answer: "Read the final answer",
    trace: "Open the full trace"
  },
  ...translations
};

function buildDecisionPathMarkdown(trace, baseName, labelLocale) {
  const sample = `${trace.conversation.title} ${trace.turns[0]?.prompt?.slice(0, 240) || ""}`;
  const labels = getLabels(labelLocale, sample);
  const fileStem = encodeURIComponent(baseName).replace(/[()]/g, (char) => char === "(" ? "%28" : "%29");
  const traceFile = `${fileStem}.agent-trace.md`;
  const conversationFile = `${fileStem}.md`;
  const turns = trace.turns.map((turn, index) => ({
    turn,
    anchor: `agent-trace-turn-${index + 1}`,
    steps: buildSteps(turn.events)
  })).filter(({ steps }) => steps.length > 0);

  const lines = [
    `# ${labels.title} · ${plainExcerpt(trace.conversation.title, 160)}`,
    "",
    labels.scope,
    "",
    labels.coverage(turns.length, trace.coverage.answers),
    ""
  ];

  if (!turns.length) {
    lines.push(labels.empty, "", `[${labels.answer}](${conversationFile})`);
    return lines.join("\n");
  }

  lines.push(`## ${labels.turns}`, "");
  for (const { turn, anchor } of turns) {
    lines.push(`- [${labels.turn} ${turn.turnNumber}](#${anchor})`);
  }

  for (const { turn, anchor, steps } of turns) {
    lines.push("", `<a id="${anchor}"></a>`, `## ${labels.turn} ${turn.turnNumber}`, "");
    if (turn.prompt) lines.push(`**${labels.prompt}** ${plainExcerpt(turn.prompt, 220)}`, "");
    for (const step of steps) renderStep(lines, step, labels, `${traceFile}#${anchor}`);
    const responseAnchor = `turn-${String(turn.turnNumber).padStart(2, "0")}---response`;
    lines.push(
      `[${labels.answer}](${conversationFile}#${responseAnchor}) · [${labels.trace}](${traceFile}#${anchor})`,
      ""
    );
  }
  return lines.join("\n");
}

function getLabels(language, sample) {
  const tag = normalizeExportLocale(language);
  if (tag) {
    const locale = new Intl.Locale(tag);
    if (locale.language === "zh" && locale.maximize().script === "Hant") return LABELS["zh-Hant"];
    return Object.hasOwn(LABELS, locale.language) ? LABELS[locale.language] : LABELS.en;
  }
  // Old archives may have no UI language. Only use unambiguous script hints for their labels.
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(sample)) return LABELS.ja;
  if (/\p{Script=Hangul}/u.test(sample)) return LABELS.ko;
  if (/\p{Script=Han}/u.test(sample)) return LABELS.zh;
  return LABELS.en;
}

function buildSteps(events) {
  const records = events.map((event, index) => ({ ...event, position: index + 1 }));
  const hasNotes = records.some(({ kind, text }) => kind === "note" && text?.trim());
  const steps = [];
  let step = { marker: null, activity: [] };
  for (const event of records) {
    const thought = event.kind === "thought" && (event.summary?.trim() || event.content?.trim());
    const note = event.kind === "note" && event.text?.trim();
    if (note || (!hasNotes && thought)) {
      if (step.marker || step.activity.length) steps.push(step);
      step = { marker: event, activity: [] };
    } else if (thought || event.kind === "tool_call" || event.kind === "tool_result") {
      step.activity.push(event);
    }
  }
  if (step.marker || step.activity.length) steps.push(step);
  return steps;
}

function renderStep(lines, { marker, activity }, labels, anchor) {
  const link = (event) => `[#${event.seq ?? event.position}](${anchor}-event-${event.position})`;
  if (marker) {
    const label = marker.kind === "note" ? labels.note : labels.thought;
    lines.push(`### ${label} · ${link(marker)}`, "");
    lines.push(`> ${describeMarker(marker, labels)}`, "");
  } else {
    const label = activity.some(({ kind }) => kind === "thought") ? labels.starting : labels.activity;
    lines.push(`### ${label}`, "");
  }

  const thoughts = activity.filter(({ kind }) => kind === "thought");
  const selectedThoughts = thoughts.length > 3 ? [thoughts[0], ...thoughts.slice(-2)] : thoughts;
  const calls = activity.filter(({ kind }) => kind === "tool_call");
  const results = activity.filter(({ kind }) => kind === "tool_result");
  const tools = activity.filter(({ kind }) => kind === "tool_call" || kind === "tool_result");
  if (tools.length) {
    const first = tools[0];
    const last = tools.at(-1);
    const refs = first === last ? link(first) : `${link(first)}–${link(last)}`;
    const names = [...new Set(tools.map(({ tool }) => tool).filter(Boolean))].map((tool) => plainExcerpt(tool, 70));
    const description = [labels.tools(calls.length, results.length), ...names, refs].join(" · ");
    lines.push(`${marker || thoughts.length ? `**${labels.activity}** ` : ""}${description}`, "");
  }

  const excerpts = results.filter(hasResultExcerpt).slice(-2);
  const observations = [...selectedThoughts, ...excerpts].sort((left, right) => left.position - right.position);
  for (const event of observations) {
    const isThought = event.kind === "thought";
    const label = isThought ? labels.thought : labels.excerpt;
    const text = isThought ? describeMarker(event, labels) : plainExcerpt(event.output, 240);
    lines.push(`- ${label} ${link(event)} ${text}`);
  }
  if (selectedThoughts.length < thoughts.length) lines.push(`- ${labels.earlier(thoughts.length - selectedThoughts.length)}`);
  if (observations.length) lines.push("");
}

function hasResultExcerpt({ tool, output }) {
  return tool !== "bio" && typeof output === "string" && output.length <= 240 &&
    Boolean(output.trim()) && !/^<<[^<>]+>>$/.test(output.trim());
}

function describeMarker(event, labels) {
  if (event.kind === "note") return plainExcerpt(event.text, 480);
  const title = event.summary?.trim();
  const content = event.content?.trim();
  if (!content) return `${plainExcerpt(title, 160)} (${labels.titleOnly})`;
  return plainExcerpt(title && title !== content ? `${title} — ${content}` : content, 280);
}

function plainExcerpt(text, limit) {
  const compact = String(text || "").replace(/!?\[([^\]]*)\]\([^\n]*?\)/g, "$1").replace(/\s+/g, " ").trim();
  const excerpt = compact.length > limit ? `${compact.slice(0, limit)}…` : compact;
  return excerpt.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char])
    .replace(/[\\`*_\[\]|]/g, "\\$&");
}

module.exports = { buildDecisionPathMarkdown };
