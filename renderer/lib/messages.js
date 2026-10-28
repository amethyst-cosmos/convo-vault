const fs = require("fs");
const path = require("path");
const { CJK_STRONG_CLOSE, CJK_STRONG_OPEN, extractMarkdownFootnotes, hashFootnoteId, protectCjkStrongRuns } = require("./markdown.js");
const { escapeAttr, escapeHtml } = require("./util.js");
const { renderAttachmentLead } = require("./images.js");
const { getProvider } = require("./provider.js");
const { cleanMarkdownForHtml, formatRole, formatTurnHeading, formatTurnNumber, getMessageAnchorId, getTocLabel, stripAttachmentOnlyLines } = require("./text.js");

const ASSET_DIR = path.resolve(__dirname, "..", "static");

const AVATAR_IMAGES = {
  user: loadPngDataUri("user.png"),
  assistant: loadPngDataUri("artificial-intelligence.png"),
  grok: loadSvgDataUri("grok-avatar.svg"),
  gemini: loadSvgDataUri("gemini-avatar.svg")
};

function renderMessage(md, message, index, imageRegistry) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const anchorId = getMessageAnchorId(message, index);
  const time = message.timestamp ? `<time>${escapeHtml(message.timestamp)}</time>` : "";
  const turnHeading = renderTurnHeading(message, index);
  const messageMarkdown = isUser ? stripAttachmentOnlyLines(message.markdown) : message.markdown;
  const content = messageMarkdown.trim() ? renderMessageMarkdown(md, messageMarkdown, imageRegistry, anchorId) : "";
  const thinking = isAssistant && message.thinkingMarkdown
    ? renderThinking(md, message.thinkingMarkdown, imageRegistry)
    : "";

  if (isUser) {
    return `<article id="${escapeAttr(anchorId)}" class="message user-message" data-turn-number="${escapeAttr(message.turnNumber)}">
      <div class="user-stack">
        ${turnHeading}
        ${renderAttachmentLead(message.markdown, imageRegistry)}
        ${content ? `<div class="bubble user-bubble">${content}</div>` : ""}
        ${renderMessageMeta(message, index, time)}
      </div>
    </article>`;
  }

  return `<article id="${escapeAttr(anchorId)}" class="message assistant-message" data-turn-number="${escapeAttr(message.turnNumber)}">
    <div class="assistant-intro">
      ${turnHeading}
      ${renderMessageMeta(message, index, time)}
      ${thinking}
    </div>
    <div class="assistant-content">${renderAssistantBody(message, content)}</div>
  </article>`;
}

// DIL answers are drawn from ChatGPT's compiled UI program by dil-runtime.js;
// the Markdown rendering stays in the page and shows if the program fails.
function renderAssistantBody(message, content) {
  const blocks = Array.isArray(message.dil) ? message.dil.filter((block) => block && typeof block.code === "string") : [];

  if (!blocks.length) {
    return content;
  }

  const roots = blocks.map((block) => `<div class="dil-root"></div><script type="application/json">${serializeScriptJson(block)}</script>`).join("");
  return `<div class="dil-message">${roots}<div class="dil-fallback">${content}</div></div>`;
}

function serializeScriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

// One muted line per message: avatar, speaker, turn number, and time. The
// turn heading above stays in the DOM (visually hidden) for PDF accessibility.
function renderMessageMeta(message, index, time) {
  const isUser = message.role === "user";
  const speaker = isUser ? "" : `<span class="meta-speaker">${escapeHtml(formatRole(message.role, message.provider))}</span>`;
  const number = `<span class="meta-turn">#${escapeHtml(String(formatTurnNumber(message, index)).replace(/^Turn\s+/, ""))}</span>`;
  const details = [speaker, number, time].filter(Boolean).join('<span class="meta-dot">·</span>');
  return isUser
    ? `<div class="message-meta user-meta"><span class="meta-text">${details}</span>${renderUserAvatar()}</div>`
    : `<div class="message-meta assistant-meta">${renderAssistantAvatar(message.provider)}<span class="meta-text">${details}</span></div>`;
}

function renderTurnHeading(message, index) {
  return `<h2 class="turn-heading ${message.role === "user" ? "user-turn-heading" : "assistant-turn-heading"}">${escapeHtml(formatTurnHeading(message, index))}</h2>`;
}

function renderUserAvatar() {
  return `<div class="avatar user-avatar" aria-label="User">
    ${renderAvatarImage(AVATAR_IMAGES.user, "User")}
  </div>`;
}

function renderAssistantAvatar(providerId) {
  const provider = getProvider(providerId);
  return `<div class="assistant-avatar" aria-label="Assistant">
    ${renderAvatarImage(AVATAR_IMAGES[provider.id] || AVATAR_IMAGES.assistant, provider.name)}
  </div>`;
}

function renderAvatarImage(src, alt) {
  return src
    ? `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}">`
    : `<span class="avatar-fallback">${escapeHtml(alt.slice(0, 2))}</span>`;
}

function renderThinking(md, thinkingMarkdown, imageRegistry) {
  return `<section class="thinking">
    <h3>Thinking</h3>
    <div class="thinking-body markdown-body" dir="auto">${md.render(cleanMarkdownForHtml(thinkingMarkdown), { imageRegistry })}</div>
  </section>`;
}

function renderMessageMarkdown(md, markdown, imageRegistry, anchorPrefix = "message") {
  const cleaned = cleanMarkdownForHtml(markdown || "_No text content found._");
  const { body, footnotes } = extractMarkdownFootnotes(cleaned);
  // Definitions with the same text (one page cited several times) share a number.
  const sources = [];
  const numbers = new Map();
  for (const footnote of footnotes) {
    let number = sources.indexOf(footnote.text) + 1;
    if (!number) {
      sources.push(footnote.text);
      number = sources.length;
    }
    numbers.set(footnote.id, number);
  }
  const placeholder = (id) => `CVFOOTNOTEREF${hashFootnoteId(id)}X`;
  // Adjacent references that resolve to the same source collapse to one.
  const withPlaceholders = body.replace(/(?:\[\^[^\]\s]+\])+/g, (run) => {
    const seen = new Set();
    return [...run.matchAll(/\[\^([^\]\s]+)\]/g)].map(([match, id]) => {
      if (!numbers.has(id)) {
        return match;
      }
      if (seen.has(numbers.get(id))) {
        return "";
      }
      seen.add(numbers.get(id));
      return placeholder(id);
    }).join("");
  });
  let html = md.render(protectCjkStrongRuns(withPlaceholders), { imageRegistry });

  for (const [id, number] of numbers) {
    html = html.split(placeholder(id)).join(
      `<sup class="footnote-ref"><a href="#${escapeAttr(`${anchorPrefix}-fn-${number}`)}">${number}</a></sup>`
    );
  }

  html = html
    .replace(/<\/sup>(\s*)<sup class="footnote-ref">/g, '</sup><sup class="footnote-sep">,</sup><sup class="footnote-ref">')
    .split(CJK_STRONG_OPEN).join("<strong>")
    .split(CJK_STRONG_CLOSE).join("</strong>");

  const list = sources.length
    ? `<section class="footnotes"><ol>${sources.map((text, index) => `<li id="${escapeAttr(`${anchorPrefix}-fn-${index + 1}`)}">${md.renderInline(text, { imageRegistry })}</li>`).join("")}</ol></section>`
    : "";
  return `<div class="markdown-body" dir="auto">${html}${list}</div>`;
}

// The contents list one row per prompt; answers are reached by reading on.
// A conversation that opens with an assistant message keeps that row too.
function buildTocRows(messages) {
  const rows = [];

  messages.forEach((message, index) => {
    if (message.role !== "user" && !(index === 0 && message.role === "assistant")) {
      return;
    }

    rows.push({
      id: getMessageAnchorId(message, index),
      kind: message.role || "message",
      number: formatTurnNumber(message, index).replace(/^Turn\s+/, ""),
      label: getTocLabel(messages, message, index).replace(/^Turn\s+\d+\.\s*/, "")
    });
  });

  return rows;
}

function loadSvgDataUri(filename) {
  try {
    const text = fs.readFileSync(path.join(ASSET_DIR, filename), "utf8");
    return `data:image/svg+xml;base64,${Buffer.from(text).toString("base64")}`;
  } catch (_) {
    return "";
  }
}

function loadPngDataUri(filename) {
  try {
    const bytes = fs.readFileSync(path.join(ASSET_DIR, filename));
    return `data:image/png;base64,${bytes.toString("base64")}`;
  } catch (_) {
    return "";
  }
}

module.exports = {
  buildTocRows,
  renderMessage
};
