const MarkdownIt = require("markdown-it");
const hljs = require("highlight.js");
const { normalizeEmbeddedImageSource } = require("./assets.js");
const { installMathRules } = require("./math.js");
const { isChartLanguage, renderChartBlock } = require("./charts.js");
const { renderMermaidDiagram } = require("./mermaid.js");
const { escapeAttr, escapeHtml } = require("./util.js");
const { isRenderableImageSource, renderRemoteMediaCard } = require("./images.js");
const { normalizeLanguage, shouldShowCodeLabel } = require("./text.js");

const CJK_STRONG_OPEN = "CVSTRONGOPENX";

const CJK_STRONG_CLOSE = "CVSTRONGCLOSEX";

function createMarkdownRenderer() {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: false,
    breaks: true,
    highlight(code, language) {
      const lang = normalizeLanguage(language);
      return lang && hljs.getLanguage(lang)
        ? hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
        : hljs.highlightAuto(code).value;
    }
  });

  installMathRules(md);

  const defaultFence = md.renderer.rules.fence || renderFenceFallback;
  const defaultLinkOpen = md.renderer.rules.link_open || renderToken;
  md.renderer.rules.fence = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const language = normalizeLanguage(String(token.info || "").trim().split(/\s+/)[0]);

    if (language === "mermaid") {
      return renderMermaidDiagram(token.content || "");
    }

    if (isChartLanguage(language)) {
      return renderChartBlock(token.content || "", language);
    }

    // ChatGPT writing blocks hold prose meant to be copied; ChatGPT shows them
    // as a formatted card, not as source code.
    if (language === "writing") {
      return `<section class="writing-block"><div class="writing-label">Writing</div><div class="writing-body">${md.render(token.content || "", env)}</div></section>`;
    }

    // Labelled blocks are assembled here so the label sits above a single
    // <pre>; returning the label from highlight() made markdown-it wrap the
    // whole fragment in a second <pre>.
    const highlighted = options.highlight(token.content || "", language);
    const label = shouldShowCodeLabel(language) ? `<div class="code-label">${escapeHtml(language)}</div>` : "";
    return `${label}<pre class="hljs"><code>${highlighted}</code></pre>\n`;
  };

  md.renderer.rules.link_open = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const hrefIndex = token.attrIndex("href");
    if (hrefIndex >= 0) {
      const href = token.attrs[hrefIndex][1];
      const label = tokens[index + 1]?.content || href;
      const objectLink = getObjectLinkDetails(label, href);
      token.attrSet("href", href);
      token.attrSet("target", "_blank");
      token.attrSet("rel", "noopener noreferrer");
      if (objectLink) {
        token.attrJoin("class", `object-link ${objectLink.className}`);
        token.attrSet("data-object-kind", objectLink.badge);
      }
    }
    return defaultLinkOpen(tokens, index, options, env, self);
  };

  md.renderer.rules.image = (tokens, index, options, env) => {
    const token = tokens[index];
    const source = token.attrGet("src") || "";
    const embeddedSrc = normalizeEmbeddedImageSource(source);
    const src = embeddedSrc || source;
    const alt = token.content || token.attrGet("alt") || "image";
    if (!isRenderableImageSource(src)) {
      return renderRemoteMediaCard(src, alt);
    }

    return `<figure class="inline-image"><img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}"><figcaption>${escapeHtml(alt)}</figcaption></figure>`;
  };

  return md;
}

function renderFenceFallback(tokens, index) {
  const token = tokens[index];
  const language = normalizeLanguage(String(token.info || "").trim().split(/\s+/)[0]);
  const label = shouldShowCodeLabel(language) ? `<div class="code-label">${escapeHtml(language)}</div>` : "";
  return `${label}<pre class="hljs"><code>${escapeHtml(token.content || "")}</code></pre>`;
}

function renderToken(tokens, index, options, env, self) {
  return self.renderToken(tokens, index, options);
}

function getObjectLinkDetails(label, href) {
  const text = String(label || "");
  const url = String(href || "");
  const fileName = extractObjectLinkFileName(text, url);

  if (/^\s*(Interactive|Dashboard|Canvas|App|Prototype|Site)\s*:/i.test(text)) {
    return { badge: "APP", className: "object-interactive-link" };
  }

  if (/^\s*(Source|Citation|Reference)\s*:/i.test(text)) {
    return { badge: "SRC", className: "object-source-link" };
  }

  if (!fileName) {
    return null;
  }

  const extension = fileName.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toUpperCase() || "FILE";
  if (["MP4", "MOV", "WEBM", "M4V"].includes(extension)) {
    return { badge: "VID", className: "object-media-link" };
  }
  if (["MP3", "WAV", "M4A", "AAC", "OGG"].includes(extension)) {
    return { badge: "AUD", className: "object-media-link" };
  }
  if (["XLSX", "XLS", "CSV", "TSV"].includes(extension)) {
    return { badge: extension.slice(0, 4), className: "object-file-link" };
  }
  if (["PPTX", "PPT"].includes(extension)) {
    return { badge: "PPT", className: "object-file-link" };
  }
  if (["PDF", "DOC", "DOCX", "TXT", "MD"].includes(extension)) {
    return { badge: extension.slice(0, 4), className: "object-file-link" };
  }

  return { badge: extension.slice(0, 4), className: "object-file-link" };
}

function extractObjectLinkFileName(label, href) {
  const combined = `${label || ""} ${href || ""}`;
  const match = combined.match(/[^\\/:*?"<>|\n\r]{1,140}\.(?:pdf|docx?|xlsx?|pptx?|csv|tsv|txt|md|json|zip|rar|7z|mov|mp4|webm|m4v|mp3|wav|m4a|aac|ogg)\b/i);
  return match?.[0] || "";
}

/**
 * CommonMark rejects **bold** whose delimiter touches punctuation on the
 * inside and a letter on the outside, which is common in Chinese text
 * ("把**状态（Paid）**的"). ChatGPT renders those runs as bold, so they are
 * swapped for placeholders that become <strong> after rendering. Runs that
 * CommonMark accepts, code spans, and fenced code are left unchanged.
 */
function protectCjkStrongRuns(markdown) {
  let fence = "";

  return String(markdown || "").split("\n").map((line) => {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);

    if (fenceMatch) {
      fence = fence ? (line.trim().startsWith(fence) ? "" : fence) : fenceMatch[1];
      return line;
    }

    if (fence || !line.includes("**")) {
      return line;
    }

    return line.split(/(`+[^`]*`+)/).map((segment, index) => (index % 2 === 1
      ? segment
      : segment.replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, (match, content, offset, text) => {
        const before = text[offset - 1] || " ";
        const after = text[offset + match.length] || " ";
        const openOk = !isPunctuationChar(content[0]) || /\s/.test(before) || isPunctuationChar(before);
        const closeOk = !isPunctuationChar(content[content.length - 1]) || /\s/.test(after) || isPunctuationChar(after);
        return openOk && closeOk ? match : `${CJK_STRONG_OPEN}${content}${CJK_STRONG_CLOSE}`;
      }))).join("");
  }).join("\n");
}

function isPunctuationChar(char) {
  return /[\p{P}\p{S}]/u.test(String(char || ""));
}

/**
 * Splits Markdown footnote definitions ([^id]: text) from the body. Lines in
 * fenced code blocks are left untouched.
 */
function extractMarkdownFootnotes(markdown) {
  const footnotes = [];
  const seen = new Set();
  const lines = [];
  let fence = "";

  for (const line of String(markdown || "").split("\n")) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);

    if (fenceMatch) {
      fence = fence ? (line.trim().startsWith(fence) ? "" : fence) : fenceMatch[1];
      lines.push(line);
      continue;
    }

    const definition = !fence && line.match(/^\[\^([^\]\s]+)\]:\s*(.*)$/);

    if (definition) {
      if (!seen.has(definition[1])) {
        seen.add(definition[1]);
        footnotes.push({ id: definition[1], text: definition[2] });
      }
      continue;
    }

    lines.push(line);
  }

  return { body: lines.join("\n").trim(), footnotes };
}

function hashFootnoteId(id) {
  return Array.from(String(id)).map((char) => char.codePointAt(0).toString(36)).join("");
}

module.exports = {
  CJK_STRONG_CLOSE,
  CJK_STRONG_OPEN,
  createMarkdownRenderer,
  extractMarkdownFootnotes,
  hashFootnoteId,
  protectCjkStrongRuns
};
