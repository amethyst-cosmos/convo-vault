const { normalizeEmbeddedImageSource } = require("./assets.js");
const { escapeAttr, escapeHtml } = require("./util.js");

function renderAttachmentLead(markdown, imageRegistry) {
  const attachments = extractLeadingAttachments(markdown);

  if (!attachments.length) {
    return "";
  }

  const imageCount = attachments.filter((item) => item.type === "image").length;
  const layoutClass = imageCount === 1 ? "single-image" : imageCount > 1 ? "image-grid" : "files-only";

  return `<div class="user-attachments ${layoutClass}" data-image-count="${imageCount}">${attachments.map((item, index) => {
    const typeClass = item.type === "file" ? "file" : "image";
    const imageSrc = item.type === "image" ? (normalizeEmbeddedImageSource(item.url) || item.url) : "";
    const asset = item.type === "image"
      ? imageRegistry?.bySrc?.get(item.url) || imageRegistry?.bySrc?.get(imageSrc)
      : null;
    const content = asset
      ? `<span class="attachment-thumb"><img src="${escapeAttr(imageSrc)}" alt="${escapeAttr(item.label)}"></span>`
      : `<span class="attachment-icon">${item.type === "file" ? getFileExtensionLabel(item.label) : "IMG"}</span>`;
    const card = `<span class="attachment-card ${typeClass} ${asset ? "with-thumb image-preview-card" : ""}">
      ${content}
      <span class="attachment-name">${escapeHtml(item.label || `${item.type === "image" ? "Image" : "Attachment"} ${index + 1}`)}</span>
    </span>`;
    return card;
  }).join("")}</div>`;
}

function extractLeadingAttachments(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const result = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || /^<!--[\s\S]*-->$/.test(trimmed)) {
      continue;
    }

    const image = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    const file = trimmed.match(/^\[File:\s*([^\]]+)\](?:\(([^)]+)\))?$/i);

    if (image) {
      result.push({ type: "image", label: image[1] || "Image", url: image[2] || "" });
    } else if (file) {
      result.push({ type: "file", label: file[1] || "Attachment" });
    }

  }

  return result;
}

function buildImageRegistry(messages) {
  const bySrc = new Map();
  const items = [];

  messages.forEach((message, messageIndex) => {
    for (const image of extractMarkdownImages(`${message.markdown || ""}\n${message.thinkingMarkdown || ""}`)) {
      const src = normalizeEmbeddedImageSource(image.src)
        || (isSafeRenderAssetSource(image.src) ? image.src : "");
      if (!src || bySrc.has(src)) {
        continue;
      }

      const item = {
        id: `asset-image-${items.length + 1}`,
        src,
        alt: image.alt || `Image ${items.length + 1}`,
        messageNumber: messageIndex + 1
      };
      bySrc.set(image.src, item);
      bySrc.set(src, item);
      items.push(item);
    }
  });

  return { bySrc, items };
}

function isRenderableImageSource(value) {
  const source = String(value || "");
  return source.startsWith("data:image/") || isSafeRenderAssetSource(source);
}

function isSafeRenderAssetSource(value) {
  return /^render-assets\/[a-f0-9]{64}\.(?:png|jpe?g|gif|webp|svg)$/i.test(String(value || ""));
}

function extractMarkdownImages(markdown) {
  const images = [];
  const pattern = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match;

  while ((match = pattern.exec(String(markdown || "")))) {
    images.push({
      alt: match[1] || "image",
      src: match[2] || ""
    });
  }

  return images;
}

function renderRemoteMediaCard(src, alt) {
  const kind = /\.gif(?:$|[?#])/i.test(src) ? "GIF" : "IMG";
  const note = kind === "GIF"
    ? "Animated media is preserved as a reference; PDF output is static."
    : "Remote image reference preserved; embed when local bytes are available.";
  return `<a class="remote-media-card" href="${escapeAttr(src)}" target="_blank" rel="noopener noreferrer">
    <span class="remote-media-kind">${kind}</span>
    <span class="remote-media-main">
      <span class="remote-media-label">${escapeHtml(alt || "Image")}</span>
      <span class="remote-media-note">${escapeHtml(note)}</span>
    </span>
  </a>`;
}

function getFileExtensionLabel(filename) {
  const extension = String(filename || "")
    .split(/[?#]/)[0]
    .match(/\.([a-z0-9]{1,5})$/i)?.[1];
  return (extension || "FILE").slice(0, 4).toUpperCase();
}

module.exports = {
  buildImageRegistry,
  extractLeadingAttachments,
  isRenderableImageSource,
  renderAttachmentLead,
  renderRemoteMediaCard
};
