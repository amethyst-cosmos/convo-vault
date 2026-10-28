const fs = require("fs");
const path = require("path");
const { buildTocRows, renderMessage } = require("./messages.js");
const { createMarkdownRenderer } = require("./markdown.js");
const { escapeAttr, escapeHtml, formatDateTime } = require("./util.js");
const { buildPaginationScript } = require("./pagination.js");
const { buildImageRegistry } = require("./images.js");
const { normalizeMessage } = require("./text.js");
const { getProvider } = require("./provider.js");
const RENDER_CSS = fs.readFileSync(path.join(__dirname, "..", "static", "render.css"), "utf8");

const DIL_RUNTIME = fs.readFileSync(path.join(__dirname, "dil-runtime.js"), "utf8");

// The page runs ChatGPT's compiled DIL code, so it may load only local files and
// inline resources; no request can leave the machine.
const PAGE_CONTENT_SECURITY_POLICY = "default-src 'none'; img-src file: data: blob:; font-src file: data:; style-src 'unsafe-inline'; script-src 'unsafe-inline' 'unsafe-eval'";

function buildDocumentHtml(payload) {
  const md = createMarkdownRenderer();
  const provider = getProvider(payload);
  const messages = payload.messages.map((message, index) => normalizeMessage({ ...message, provider: provider.id }, index));
  const exportedAt = formatDateTime(payload.exportedAt);
  const imageRegistry = buildImageRegistry(messages);
  const tocRows = buildTocRows(messages);
  const documentLanguage = normalizeDocumentLanguage(payload.language || payload.locale || payload.documentLanguage);

  return `<!doctype html>
<html lang="${escapeAttr(documentLanguage)}">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="${PAGE_CONTENT_SECURITY_POLICY}">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(payload.title)}</title>
  <style>${RENDER_CSS}</style>
</head>
<body>
  ${renderIntroPages(payload, messages, exportedAt, tocRows)}

  <main class="conversation">
    ${messages.map((message, index) => renderMessage(md, message, index, imageRegistry)).join("\n")}
  </main>

  <script>${DIL_RUNTIME}</script>
  <script>${buildPaginationScript()}</script>
</body>
</html>`;
}

function normalizeDocumentLanguage(value) {
  const language = String(value || "").trim();

  if (/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(language)) {
    return language;
  }

  return "und";
}

// The prompt index is one multi-column flow; Chrome fills each page's two
// columns in order, so row height never has to be predicted.
function renderIntroPages(payload, messages, exportedAt, tocRows) {
  return `<section class="intro-sheet intro-sheet-first page-break-after">
      ${renderCoverCard(payload, messages, exportedAt)}
      ${renderTocCard(tocRows)}
    </section>`;
}

function renderCoverCard(payload, messages, exportedAt) {
  const prompts = messages.filter((message) => message.role === "user").length;
  return `<header class="cover-card">
    <div class="cover-eyebrow">${escapeHtml(getProvider(payload).name)} conversation</div>
    <h1>${escapeHtml(payload.title)}</h1>
    <p class="cover-meta">${escapeHtml(exportedAt)}<span class="meta-dot">·</span>${prompts} prompts<span class="meta-dot">·</span>${messages.length} messages</p>
    ${payload.source ? `<p class="source"><a href="${escapeAttr(payload.source)}">${escapeHtml(payload.source)}</a></p>` : ""}
  </header>`;
}

function renderTocCard(rows) {
  return `<section class="toc">
    <h2>Prompts</h2>
    <div class="toc-grid">
      ${rows.map((row) => renderTocRow(row)).join("")}
    </div>
  </section>`;
}

function renderTocRow(row) {
  return `
        <a class="toc-row ${row.kind}" href="#${escapeAttr(row.id)}">
          <span class="toc-number">${escapeHtml(row.number)}</span>
          <span class="toc-label" dir="auto">${escapeHtml(row.label)}</span>
        </a>`;
}

module.exports = {
  buildDocumentHtml
};
