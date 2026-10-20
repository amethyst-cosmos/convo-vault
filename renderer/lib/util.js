

function escapeSvgText(value) {
  return escapeHtml(value).replace(/\n/g, " ");
}

function sanitizeFilename(value) {
  return cleanText(value)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 96) || "chatgpt-conversation";
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "turn";
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function formatDateTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return cleanText(value);
  }

  return date.toLocaleString();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

module.exports = {
  cleanText,
  escapeAttr,
  escapeHtml,
  escapeSvgText,
  formatDateTime,
  sanitizeFilename,
  slugify
};
