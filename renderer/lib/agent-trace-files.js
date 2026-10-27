// Builds the bundle's agent-trace files from the per-message traces the
// extension captured (extension/content/agent-trace.js, version 2).
//
// agent-trace.json keeps every event with full content, for analysing how
// ChatGPT worked. agent-trace.md is the readable chronological view; long tool
// output there is cut and points back to the JSON event.

const MD_OUTPUT_LIMIT = 2000;
const MD_INPUT_LIMIT = 4000;
const { getProvider } = require("./provider.js");

const HIDDEN_INPUT_NOTE = "ChatGPT stores web.run and functions.* calls with empty text, so search queries and those arguments are not recoverable; queries appear only when a search result group names them.";

function buildAgentTraceFile(payload) {
  const turns = collectTraceTurns(payload.messages || []);
  return {
    schema: "convo-vault/agent-trace",
    version: 2,
    conversation: {
      title: payload.title || `${getProvider(payload).name} Conversation`,
      source: payload.source || "",
      exportedAt: payload.exportedAt || "",
      exporterVersion: payload.exporterVersion || ""
    },
    notes: [
      `Events follow ${getProvider(payload).name}'s conversation order; offsetSeconds counts from the first event of the turn.`,
      `thought events are ${getProvider(payload).name}'s stored reasoning summaries, not hidden chain-of-thought.`,
      HIDDEN_INPUT_NOTE
    ],
    turns,
    sources: buildSourceIndex(turns)
  };
}

function collectTraceTurns(messages) {
  const turns = [];
  let prompt = null;

  messages.forEach((message, index) => {
    if (message.role === "user") {
      prompt = message;
      return;
    }
    const trace = message.agentTrace;
    if (message.role !== "assistant" || trace?.version !== 2 || !trace.events?.length) {
      return;
    }
    turns.push({
      turnNumber: message.turnNumber || index + 1,
      messageId: message.id || "",
      timestamp: message.timestamp || "",
      prompt: String(prompt?.markdown || ""),
      ...trace
    });
  });

  return turns;
}

function buildSourceIndex(turns) {
  const byUrl = new Map();
  for (const turn of turns) {
    for (const source of turn.sources || []) {
      const entry = byUrl.get(source.url) || { url: source.url, title: source.title, domain: source.domain, turns: [], cited: false };
      if (!entry.turns.includes(turn.turnNumber)) entry.turns.push(turn.turnNumber);
      entry.cited = entry.cited || Boolean(source.cited);
      byUrl.set(source.url, entry);
    }
  }
  return [...byUrl.values()];
}

function buildAgentTraceMarkdown(traceFile) {
  const { conversation, turns, sources } = traceFile;
  const lines = [
    `# Agent trace: ${conversation.title}`,
    "",
    `> Exported ${conversation.exportedAt || ""} · Convo Vault ${conversation.exporterVersion || ""} · ${turns.length} answers with a recorded process · ${sources.length} sources`,
    `> Full content of every event is in the matching \`.agent-trace.json\` (turns[].events[]). ${HIDDEN_INPUT_NOTE}`,
    ""
  ];

  if (!turns.length) {
    lines.push("*No thinking or tool activity was recorded for this conversation.*");
    return lines.join("\n");
  }

  turns.forEach((turn, turnIndex) => {
    const model = turn.model ? [turn.model.resolvedSlug || turn.model.slug, turn.model.thinkingEffort].filter(Boolean).join(" · ") : "";
    lines.push(`## Turn ${turn.turnNumber}${model ? ` · ${model}` : ""}${turn.durationSeconds ? ` · ${formatDuration(turn.durationSeconds)}` : ""}`, "");
    if (turn.prompt) {
      lines.push(...quote(`**Prompt:** ${truncate(turn.prompt.replace(/\s+/g, " "), 400)}`), "");
    }
    const stats = turn.stats || {};
    lines.push(`${stats.thoughts || 0} thoughts · ${stats.notes || 0} notes · ${stats.toolCalls || 0} tool calls · ${stats.toolResults || 0} tool results · ${stats.sources || 0} sources (${stats.citedSources || 0} cited)`, "");

    for (const event of turn.events) {
      lines.push(...renderEvent(event, turnIndex));
    }

    if (turn.sources?.length) {
      lines.push("", "**Sources seen in this turn**", "");
      for (const source of turn.sources) {
        lines.push(`- ${source.cited ? "✅ " : ""}[${escapeLabel(source.title || source.url)}](${source.url})${source.domain ? ` · ${source.domain}` : ""}`);
      }
    }
    lines.push("", "---", "");
  });

  lines.push("## Source index", "", "| Source | Turns | Cited |", "| --- | --- | --- |");
  for (const source of sources) {
    lines.push(`| [${escapeLabel(source.title || source.url).replace(/\|/g, "\\|")}](${source.url}) | ${source.turns.join(", ")} | ${source.cited ? "yes" : ""} |`);
  }

  return lines.join("\n");
}

function renderEvent(event, turnIndex) {
  const time = event.offsetSeconds != null ? `+${event.offsetSeconds}s` : "";
  const head = (icon, label, detail = "") => `${event.seq}. \`${time}\` ${icon} **${label}**${detail ? ` — ${detail}` : ""}`;
  const pointer = `turns[${turnIndex}].events[${event.seq - 1}]`;

  switch (event.kind) {
    case "thought":
      return [head("🧠", "Thought", event.summary ? `**${event.summary}**` : ""), ...(event.content ? indent(event.content) : [])];
    case "note":
      return [head("💬", "Note", event.channel ? `\`${event.channel}\`` : ""), ...indent(event.text)];
    case "recap":
      return [head("⏱️", "Recap", event.text)];
    case "answer":
      return [head("✅", "Answer", `${event.chars} characters (see the conversation Markdown)`)];
    case "tool_call": {
      const queries = event.queries?.length ? ` · queries: ${event.queries.map((query) => `\`${query}\``).join(", ")}` : "";
      const lines = [head("🔧", `Call \`${event.tool}\``, `${event.title || ""}${queries}${event.inputHidden ? " · input not stored by ChatGPT" : ""}`)];
      if (event.input) lines.push(...fenced(event.input, event.language || (event.arguments ? "json" : ""), MD_INPUT_LIMIT, pointer));
      return lines;
    }
    case "tool_result": {
      const detail = [
        event.title,
        event.callSeq ? `for call ${event.callSeq}` : "",
        event.status ? `status ${event.status}` : "",
        event.output ? `${event.output.length} characters` : "",
        event.sources?.length ? `${event.sources.length} sources` : "",
        event.images?.length ? `${event.images.length} images` : ""
      ].filter(Boolean).join(" · ");
      const lines = [head("↩️", `Result \`${event.tool || "tool"}\``, detail)];
      if (event.queries?.length) lines.push(`   - queries: ${event.queries.map((query) => `\`${query}\``).join(", ")}`);
      for (const source of event.sources || []) {
        lines.push(`   - [${escapeLabel(source.title || source.url)}](${source.url})${source.snippet ? ` — ${truncate(source.snippet.replace(/\s+/g, " "), 160)}` : ""}`);
      }
      if (event.output) lines.push(...fenced(event.output, "text", MD_OUTPUT_LIMIT, pointer));
      return lines;
    }
    default:
      return [head("•", event.kind, [event.role, event.recipient, event.contentType].filter(Boolean).join(" · ")), ...(event.text ? fenced(event.text, "text", MD_OUTPUT_LIMIT, pointer) : [])];
  }
}

function fenced(text, language, limit, pointer) {
  const body = text.length > limit ? `${text.slice(0, limit)}\n… [${text.length - limit} more characters in ${pointer}]` : text;
  const longestRun = Math.max(2, ...(body.match(/`+/g) || []).map((run) => run.length));
  const fence = "`".repeat(longestRun + 1);
  return [`   ${fence}${language || ""}`, ...body.split("\n").map((line) => `   ${line}`), `   ${fence}`];
}

function indent(text) {
  return String(text).split("\n").map((line) => `   ${line}`);
}

function quote(text) {
  return String(text).split("\n").map((line) => `> ${line}`);
}

function truncate(text, limit) {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function escapeLabel(text) {
  return String(text).replace(/[[\]\\]/g, "\\$&");
}

function formatDuration(seconds) {
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
}

module.exports = {
  buildAgentTraceFile,
  buildAgentTraceMarkdown
};
