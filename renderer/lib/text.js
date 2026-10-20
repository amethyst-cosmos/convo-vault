const { slugify } = require("./util.js");
const { extractLeadingAttachments } = require("./images.js");

function normalizeMessage(message, index) {
  const turnNumber = normalizeTurnNumber(message.turnNumber, index);

  return {
    ...message,
    id: message.id || `message-${index + 1}`,
    role: String(message.role || "message").toLowerCase(),
    turnNumber,
    markdown: String(message.markdown || ""),
    thinkingMarkdown: String(message.thinkingMarkdown || "")
  };
}

function normalizeTurnNumber(value, index) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : index + 1;
}

function getMessageAnchorId(message, index) {
  return `message-${index + 1}-${slugify(message.id || message.role || "turn")}`;
}

function getMessageLabel(message, index) {
  const markdownSource = stripAttachmentOnlyLines(cleanMarkdownForHtml(message.markdown || ""));
  const attachmentDescription = describeAttachmentOnlyMessage(message);
  if (!markdownSource && attachmentDescription) {
    return `${formatTurnNumber(message, index)}. ${attachmentDescription}`;
  }
  const source = markdownSource || cleanMarkdownForHtml(message.preview || message.thinkingMarkdown || "");
  const text = stripMarkdown(source).replace(/\s+/g, " ").trim();
  return `${formatTurnNumber(message, index)}. ${text.slice(0, 82) || attachmentDescription || formatRole(message.role)}`;
}

// An image-only prompt says nothing by itself; its answer names the content.
function getTocLabel(messages, message, index) {
  const label = getMessageLabel(message, index);
  const next = messages[index + 1];
  const isAttachmentOnly = message.role === "user"
    && !stripAttachmentOnlyLines(cleanMarkdownForHtml(message.markdown || ""))
    && describeAttachmentOnlyMessage(message);

  if (!isAttachmentOnly || next?.role !== "assistant") {
    return label;
  }

  const imageCount = extractLeadingAttachments(message.markdown).filter((item) => item.type === "image").length;
  const answer = stripMarkdown(cleanMarkdownForHtml(next.markdown || "")).replace(/\s+/g, " ").trim().slice(0, 70);
  const prefix = imageCount === 1 ? "[image]" : `[${imageCount} images]`;
  return `${formatTurnNumber(message, index)}. ${prefix} ${answer}`;
}

function describeAttachmentOnlyMessage(message) {
  const attachments = extractLeadingAttachments(message.markdown);
  const imageCount = attachments.filter((item) => item.type === "image").length;
  const fileCount = attachments.filter((item) => item.type === "file").length;
  const owner = message.role === "assistant" ? "Assistant" : "User";

  if (imageCount && fileCount) return `${owner} attachments: ${imageCount} image${imageCount === 1 ? "" : "s"}, ${fileCount} file${fileCount === 1 ? "" : "s"}`;
  if (imageCount) return `${owner} ${imageCount === 1 ? "image" : `${imageCount} images`}`;
  if (fileCount) return `${owner} ${fileCount === 1 ? "file attachment" : `${fileCount} file attachments`}`;
  return "";
}

function getThinkingLabel(markdown) {
  const firstHeading = String(markdown || "").split(/\r?\n/).find((line) => /^\s*(?:[-*+]\s+)?#{0,6}\s*\S/.test(line));
  return stripMarkdown(firstHeading || markdown).replace(/\s+/g, " ").trim().slice(0, 86) || "Thinking";
}

function formatRole(role) {
  const value = String(role || "Message").toLowerCase();
  if (value === "assistant") return "ChatGPT";
  if (value === "user") return "User";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatTurnNumber(message, index) {
  const number = Number(message?.turnNumber);
  const value = Number.isFinite(number) && number > 0 ? Math.floor(number) : index + 1;
  return `Turn ${String(value).padStart(2, "0")}`;
}

function formatTurnHeading(message, index) {
  return `${formatTurnNumber(message, index)} - ${formatRole(message.role)}`;
}

function cleanMarkdownForHtml(markdown) {
  return compactMarkdownSourceLinks(String(markdown || "")
    .replace(/\r\n?/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/[\uE000-\uF8FF]*cite(?:[\uE000-\uF8FF]+turn[0-9A-Za-z_-]+)+[\uE000-\uF8FF]*/gi, "")
    .replace(/[\uE000-\uF8FF]+/g, "")
    .replace(/!\[(image-\d+|Image-\d+)\]\((https?:\/\/[^)]+)\)\s*/gi, "")
    .replace(/\[Image:\s*([^\]]+)\]\((https?:\/\/[^)]+)\)/gi, "[$1]($2)")
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

  if (!value) return compactUrlLabel(url);
  if (/^https?:\/\//i.test(value)) return compactUrlLabel(value);
  return value;
}

function compactUrlLabel(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "") || url;
  } catch {
    return String(url || "").slice(0, 80);
  }
}

function escapeMarkdownLinkLabel(text) {
  return String(text || "").replace(/[[\]\\]/g, "\\$&");
}

function stripAttachmentOnlyLines(markdown) {
  return String(markdown || "")
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return !(/^!\[[^\]]*]\([^)]+\)$/.test(trimmed) || /^\[File:\s*[^\]]+]/i.test(trimmed));
    })
    .join("\n")
    .trim();
}

function stripMarkdown(markdown) {
  return String(markdown || "")
    .replace(/```[\s\S]*?```/g, " code ")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_`~|-]/g, " ")
    .replace(/\s+/g, " ");
}

function normalizeLanguage(language) {
  const value = String(language || "").trim().toLowerCase();
  const aliases = {
    js: "javascript",
    ts: "typescript",
    py: "python",
    sh: "bash",
    shell: "bash",
    ps: "powershell",
    ps1: "powershell",
    yml: "yaml"
  };
  return aliases[value] || value;
}

function shouldShowCodeLabel(language) {
  return Boolean(language) && !["text", "txt", "plain", "plaintext"].includes(language);
}

module.exports = {
  cleanMarkdownForHtml,
  describeAttachmentOnlyMessage,
  formatRole,
  formatTurnHeading,
  formatTurnNumber,
  getMessageAnchorId,
  getTocLabel,
  normalizeLanguage,
  normalizeMessage,
  shouldShowCodeLabel,
  stripAttachmentOnlyLines,
  stripMarkdown
};
