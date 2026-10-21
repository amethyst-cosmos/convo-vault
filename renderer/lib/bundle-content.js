"use strict";

// Builds the text artifacts of an export bundle from a normalized payload:
// the conversation Markdown, the data sidecars (conversation, messages,
// QA pairs, topics, entities, agent trace, summary), and their files.
// Pure functions except writeDataSidecars, which writes into a directory.

const fs = require("fs");
const path = require("path");
const { buildOutputObjectIndex } = require("./assets");
const { buildAgentTraceFile, buildAgentTraceMarkdown } = require("./agent-trace-files");

function normalizePayload(body) {
  const payload = body.exportPayload || body.payload || body;
  const messages = Array.isArray(payload.messages)
    ? payload.messages.map((message, index) => normalizePayloadMessage(message, index))
    : [];

  return {
    schemaVersion: payload.schemaVersion || 1,
    exporterVersion: payload.exporterVersion || "",
    title: payload.title || "ChatGPT Conversation",
    source: payload.source || "",
    exportedAt: payload.exportedAt || new Date().toISOString(),
    language: payload.language || payload.locale || payload.documentLanguage || "",
    captureMode: payload.captureMode || "",
    messageCount: payload.messageCount || messages.length,
    ...(payload.fileDownload && typeof payload.fileDownload === "object" ? { fileDownload: payload.fileDownload } : {}),
    messages
  };
}

function normalizePayloadMessage(message, index) {
  const turnNumber = normalizeTurnNumber(message?.turnNumber, index);

  return {
    ...message,
    id: message?.id || `message-${turnNumber}`,
    role: String(message?.role || "unknown").toLowerCase(),
    turnNumber,
    order: message?.order ?? message?.conversationOrder ?? index,
    conversationOrder: message?.conversationOrder ?? message?.order ?? index,
    timestamp: message?.timestamp || "",
    preview: message?.preview || "",
    markdown: String(message?.markdown || ""),
    thinkingMarkdown: String(message?.thinkingMarkdown || ""),
    sourceMessageId: message?.sourceMessageId || "",
    codeBlockCount: message?.codeBlockCount || 0,
    fileCount: message?.fileCount || 0,
    imageCount: message?.imageCount || 0,
    imagesEmbedded: message?.imagesEmbedded || 0,
    imagesFailed: message?.imagesFailed || 0
  };
}

function normalizeTurnNumber(value, index) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : index + 1;
}

function writeDataSidecars(directory, baseName, payload, options = {}) {
  const bundle = buildDataBundle(payload, options);
  const dataJson = JSON.stringify({
    ok: bundle.ok,
    conversation: bundle.conversation,
    messages: bundle.messages,
    qaPairs: bundle.qaPairs,
    outputObjects: bundle.outputObjects,
    outputObjectCounts: bundle.outputObjectCounts,
    topics: bundle.topics,
    entities: bundle.entities
  }, null, 2);
  const files = [
    [`${baseName}.data.json`, dataJson],
    [`${baseName}.conversation.json`, JSON.stringify(bundle.conversation, null, 2)],
    [`${baseName}.agent-trace.json`, JSON.stringify(bundle.agentTrace, null, 2)],
    [`${baseName}.agent-trace.md`, bundle.agentTraceMarkdown],
    [`${baseName}.messages.jsonl`, bundle.messagesJsonl],
    [`${baseName}.qa-pairs.json`, JSON.stringify(bundle.qaPairs, null, 2)],
    [`${baseName}.topics.json`, JSON.stringify(bundle.topics, null, 2)],
    [`${baseName}.entities.json`, JSON.stringify(bundle.entities, null, 2)],
    [`${baseName}.summary.md`, bundle.summaryMarkdown]
  ];

  return files.map(([name, content]) => {
    const filePath = path.join(directory, name);
    fs.writeFileSync(filePath, content.endsWith("\n") ? content : `${content}\n`, "utf8");
    return filePath;
  });
}

function buildDataBundle(payload, options = {}) {
  const messages = payload.messages.map((message, index) => buildDataMessage(message, index));
  const outputObjectIndex = buildOutputObjectIndex(payload, {
    localImageAssets: options.localImageAssets
  });
  const agentTrace = buildAgentTraceFile(payload);
  const conversation = {
    schemaVersion: 1,
    exporterVersion: payload.exporterVersion || "",
    title: payload.title || "ChatGPT Conversation",
    source: payload.source || "",
    exportedAt: payload.exportedAt || new Date().toISOString(),
    generatedAt: new Date().toISOString(),
    language: payload.language || "",
    captureMode: payload.captureMode || "",
    messageCount: messages.length,
    roles: countBy(messages, (message) => message.role),
    thinkingCount: messages.filter((message) => message.thinkingMarkdown).length,
    imageCount: messages.reduce((sum, message) => sum + (message.counts?.images || 0), 0),
    fileCount: messages.reduce((sum, message) => sum + (message.counts?.files || 0), 0),
    outputObjectCount: outputObjectIndex.counts.total,
    degradedObjectCount: outputObjectIndex.counts.degraded
  };
  const qaPairs = buildQaPairs(messages);
  const topics = buildTopics(messages);
  const entities = buildEntities(messages);

  return {
    ok: true,
    conversation,
    messages,
    qaPairs,
    agentTrace,
    agentTraceMarkdown: buildAgentTraceMarkdown(agentTrace),
    outputObjects: outputObjectIndex.objects,
    outputObjectCounts: outputObjectIndex.counts,
    topics,
    entities,
    messagesJsonl: messages.map((message) => JSON.stringify(message)).join("\n") + "\n",
    summaryMarkdown: buildSummaryMarkdown(conversation, qaPairs, topics, entities)
  };
}

function buildDataMessage(message, index) {
  const markdown = normalizeMarkdown(message.markdown || "");
  const thinkingMarkdown = normalizeMarkdown(message.thinkingMarkdown || "");
  const plainText = stripMarkdown(`${markdown}\n${thinkingMarkdown}`);

  return {
    id: message.id || `message-${index + 1}`,
    turnNumber: normalizeTurnNumber(message.turnNumber, index),
    role: message.role || "unknown",
    timestamp: message.timestamp || "",
    sourceMessageId: message.sourceMessageId || "",
    conversationOrder: message.conversationOrder ?? message.order ?? index,
    preview: cleanPreview(message.preview || plainText),
    text: plainText,
    markdown,
    thinkingMarkdown,
    // The full trace lives in agent-trace.json; messages keep only its counts.
    agentTraceStats: message.agentTrace?.stats || null,
    counts: {
      codeBlocks: message.codeBlockCount || countCodeBlocks(markdown, thinkingMarkdown),
      files: message.fileCount || extractFiles(markdown).length,
      images: message.imageCount || extractImages(markdown).length,
      links: extractLinks(`${markdown}\n${thinkingMarkdown}`).length
    }
  };
}

function buildQaPairs(messages) {
  const pairs = [];

  for (let index = 0; index < messages.length; index += 1) {
    const question = messages[index];
    const answer = messages[index + 1];

    if (question?.role !== "user" || answer?.role !== "assistant") {
      continue;
    }

    pairs.push({
      id: `qa-${pairs.length + 1}`,
      questionTurnNumber: question.turnNumber,
      answerTurnNumber: answer.turnNumber,
      questionPreview: cleanPreview(question.text),
      answerPreview: cleanPreview(answer.text),
      questionMessageId: question.id,
      answerMessageId: answer.id,
      timestamp: question.timestamp || answer.timestamp || ""
    });
  }

  return pairs;
}

function buildTopics(messages) {
  return messages.map((message) => ({
    id: `topic-turn-${message.turnNumber}`,
    turnNumber: message.turnNumber,
    role: message.role,
    title: cleanPreview(message.text, 72) || formatRole(message.role),
    hasThinking: Boolean(message.thinkingMarkdown),
    counts: message.counts
  }));
}

function buildEntities(messages) {
  const combined = messages.map((message) => `${message.markdown}\n${message.thinkingMarkdown}`).join("\n");
  return {
    urls: uniqueStrings(extractLinks(combined).map((link) => link.url)),
    files: uniqueStrings(extractFiles(combined)),
    images: uniqueStrings(extractImages(combined).map((image) => image.alt || image.src).filter(Boolean)),
    emails: uniqueMatches(combined, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi),
    dates: uniqueMatches(combined, /\b(?:\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/g),
    organizations: uniqueStrings([
      ...uniqueMatches(combined, /\b[A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*){1,5}\b/g),
      ...uniqueMatches(combined, /[\u4e00-\u9fffA-Za-z0-9]{2,24}(?:公司|学校|大学|学院|集团|Solutions|Limited|Ltd)\b/g)
    ]).slice(0, 120)
  };
}

function buildSummaryMarkdown(conversation, qaPairs, topics, entities) {
  const lines = [
    `# ${conversation.title}`,
    "",
    `- Capture mode: ${conversation.captureMode || "unknown"}`,
    `- Messages: ${conversation.messageCount}`,
    `- QA pairs: ${qaPairs.length}`,
    `- Thinking messages: ${conversation.thinkingCount}`,
    `- Images: ${conversation.imageCount}`,
    `- Files: ${conversation.fileCount}`,
    `- Output objects: ${conversation.outputObjectCount || 0}`,
    `- Degraded objects: ${conversation.degradedObjectCount || 0}`,
    ""
  ];

  if (conversation.source) {
    lines.push(`Source: ${conversation.source}`, "");
  }

  lines.push("## Topic Index", "");
  topics.slice(0, 80).forEach((topic) => {
    lines.push(`- Turn ${String(topic.turnNumber).padStart(2, "0")} (${topic.role}): ${topic.title}`);
  });

  lines.push("", "## Entities", "");
  for (const [key, values] of Object.entries(entities)) {
    if (values.length) {
      lines.push(`- ${key}: ${values.slice(0, 20).join(", ")}`);
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}

function countBy(items, getKey) {
  return items.reduce((result, item) => {
    const key = getKey(item) || "unknown";
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {});
}

function buildMarkdownDocument(payload) {
  const lines = [
    `# ${payload.title || "ChatGPT Conversation"}`,
    "",
    `**Exporter:** Convo Vault ${payload.exporterVersion || ""}`.trim(),
    `**Exported:** ${formatMarkdownDateTime(payload.exportedAt)}`,
    `**Messages:** ${payload.messages.length}`,
    ""
  ];

  if (payload.source) {
    lines.splice(lines.length - 1, 0, `**Link:** [${payload.source}](${payload.source})`);
  }

  payload.messages.forEach((message, index) => {
    const role = formatRole(message.role);
    const heading = role === "User" ? "Prompt" : role === "Assistant" ? "Response" : role;
    lines.push(`## Turn ${String(normalizeTurnNumber(message.turnNumber, index)).padStart(2, "0")} - ${heading}`, "");

    if (isDisplayableTimestamp(message.timestamp)) {
      lines.push(message.timestamp, "");
    }

    if (message.thinkingMarkdown) {
      lines.push("### Thinking", "", normalizeMarkdown(message.thinkingMarkdown), "");
    }

    lines.push(normalizeMarkdown(message.markdown || "_No text content found._"), "");
  });

  return lines.join("\n").replace(/\n{4,}/g, "\n\n\n").trimEnd() + "\n";
}

function normalizeMarkdown(markdown) {
  return compactMarkdownSourceLinks(String(markdown || "")
    .replace(/\r\n?/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim());
}

function compactMarkdownSourceLinks(markdown) {
  return stripFaviconMarkdownImages(markdown)
    .replace(/\[!\\?\[[^\]\n]*\\?\]\([^)]+\)\s*([^\]]*?)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, url) => {
      const cleanLabel = cleanMarkdownLinkLabel(label, url);
      return cleanLabel ? `[${escapeMarkdownLinkLabel(cleanLabel)}](${url})` : url;
    })
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, url) => {
      const cleanLabel = cleanMarkdownLinkLabel(label, url);
      return cleanLabel ? `[${escapeMarkdownLinkLabel(cleanLabel)}](${url})` : url;
    });
}

function stripFaviconMarkdownImages(markdown) {
  return String(markdown || "")
    .replace(/!\\?\[[^\]\n]*\\?\]\((https?:\/\/[^)]*(?:google\.com\/s2\/favicons|favicon)[^)]*)\)\s*/gi, "");
}

function cleanMarkdownLinkLabel(label, url = "") {
  const value = String(label || "")
    .replace(/!\\?\[[^\]\n]*\\?\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, " ")
    .replace(/\\?\[?image-\d+\\?]?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!value) return compactUrl(url);
  if (/^https?:\/\//i.test(value)) return compactUrl(value);
  return value;
}

function escapeMarkdownLinkLabel(text) {
  return String(text || "").replace(/[[\]\\]/g, "\\$&");
}

function stripMarkdown(markdown) {
  return String(markdown || "")
    .replace(/```[\s\S]*?```/g, " code ")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_`~|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanPreview(text, maxLength = 140) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 1))}...` : value;
}

function countCodeBlocks(...parts) {
  return parts.reduce((count, value) => {
    const fenceCount = (String(value || "").match(/```/g) || []).length;
    return count + Math.floor(fenceCount / 2);
  }, 0);
}

function extractLinks(markdown) {
  const links = [];
  const source = String(markdown || "");
  const markdownPattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  const barePattern = /\bhttps?:\/\/[^\s)]+/g;
  let match;

  while ((match = markdownPattern.exec(source))) {
    links.push({ label: cleanPreview(match[1], 100), url: stripTrailingPunctuation(match[2]) });
  }

  while ((match = barePattern.exec(source))) {
    const url = stripTrailingPunctuation(match[0]);
    if (!links.some((link) => link.url === url)) {
      links.push({ label: compactUrl(url), url });
    }
  }

  return links;
}

function extractImages(markdown) {
  const images = [];
  const pattern = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match;

  while ((match = pattern.exec(String(markdown || "")))) {
    images.push({
      alt: cleanPreview(match[1] || "Image", 120),
      src: match[2] || ""
    });
  }

  return images;
}

function extractFiles(markdown) {
  const files = [];
  const source = String(markdown || "");
  const attachmentPattern = /\[File:\s*([^\]]+)\]/gi;
  const filenamePattern = /[^\\/:*?"<>|\n\r]{1,140}\.(?:pdf|docx?|xlsx?|pptx?|csv|tsv|txt|md|json|zip|rar|7z|mov|mp4|mp3|wav)\b/gi;
  let match;

  while ((match = attachmentPattern.exec(source))) {
    files.push(cleanPreview(match[1], 160));
  }

  while ((match = filenamePattern.exec(source))) {
    files.push(cleanPreview(match[0], 160));
  }

  return uniqueStrings(files);
}

function uniqueMatches(text, pattern) {
  return uniqueStrings([...String(text || "").matchAll(pattern)].map((match) => cleanPreview(match[0], 160)));
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const text = String(value || "").trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(text);
  }

  return result;
}

function stripTrailingPunctuation(value) {
  return String(value || "").replace(/[),.;!?，。；！？]+$/g, "");
}

function compactUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return cleanPreview(url, 80);
  }
}

function formatRole(role) {
  const value = String(role || "Message").toLowerCase();
  if (value === "assistant") return "Assistant";
  if (value === "user") return "User";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatMarkdownDateTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value || "");
  }

  return date.toLocaleString();
}

function isDisplayableTimestamp(value) {
  const text = String(value || "").trim();

  if (!text) {
    return false;
  }

  return /^\d{1,2}\/\d{1,2}\/\d{4},?\s+\d{1,2}:\d{2}(?::\d{2})?/.test(text)
    || /^\d{4}-\d{2}-\d{2}[T\s]\d{1,2}:\d{2}/.test(text)
    || /^[A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4},?\s+\d{1,2}:\d{2}/.test(text);
}

module.exports = {
  buildDataBundle,
  buildMarkdownDocument,
  normalizePayload,
  writeDataSidecars
};
