const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DATA_URI_RE = /^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,([a-z0-9+/=\r\n]+)$/i;
const GENERIC_BINARY_MIME_TYPES = new Set([
  "",
  "application/octet-stream",
  "application/x-binary",
  "binary/octet-stream"
]);
const MARKDOWN_IMAGE_RE = /!\[([^\]]*)]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const MARKDOWN_LINK_RE = /\[([^\]]+)]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const FILE_LINK_RE = /\[File:\s*([^\]]+)](?:\(([^)\s]+)\))?/gi;
const FILENAME_RE = /[^\\/:*?"<>|\n\r]{1,140}\.(?:pdf|docx?|xlsx?|pptx?|csv|tsv|txt|md|json|zip|rar|7z|mov|mp4|mp3|wav)\b/gi;
const MERMAID_FENCE_RE = /```mermaid\s*([\s\S]*?)```/gi;
const CHART_FENCE_RE = /```(?:chart|chart-json|vega-lite|vegalite)\s*([\s\S]*?)```/gi;
const DISPLAY_MATH_RE = /\$\$([\s\S]+?)\$\$/g;
const INLINE_MATH_RE = /\\\(([\s\S]+?)\\\)/g;
const SUPPORTED_DIAGRAM_TYPES = new Set(["flowchart", "graph", "sequencediagram", "erdiagram", "statediagram", "statediagram-v2"]);

function buildAssetManifest(payload, options = {}) {
  const cacheRoot = options.cacheRoot || process.env.CGCE_CACHE_DIR || "";
  const assetRoot = cacheRoot ? path.join(cacheRoot, "assets") : "";
  const localImageAssetMap = createLocalImageAssetMap(options.localImageAssets);
  const assetsById = new Map();
  const embeddedAssetCache = new Map();
  const dataUriCache = new Map();
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  const outputObjectIndex = buildOutputObjectIndex(payload, { dataUriCache, localImageAssetMap });

  if (assetRoot) {
    fs.mkdirSync(assetRoot, { recursive: true });
  }

  for (const message of messages) {
    collectMessageImageAssets(message, "markdown", assetRoot, assetsById, embeddedAssetCache, dataUriCache, localImageAssetMap);
    collectMessageImageAssets(message, "thinkingMarkdown", assetRoot, assetsById, embeddedAssetCache, dataUriCache, localImageAssetMap);
    collectMessageFileAssets(message, "markdown", assetsById);
    collectMessageFileAssets(message, "thinkingMarkdown", assetsById);
  }

  const assets = [...assetsById.values()].sort((a, b) => a.assetId.localeCompare(b.assetId));
  const counts = assets.reduce((result, asset) => {
    result.total += 1;
    result.byKind[asset.kind] = (result.byKind[asset.kind] || 0) + 1;
    result.byOrigin[asset.origin] = (result.byOrigin[asset.origin] || 0) + 1;
    result.byStorage[asset.storage] = (result.byStorage[asset.storage] || 0) + 1;
    return result;
  }, {
    total: 0,
    byKind: {},
    byOrigin: {},
    byStorage: {}
  });

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    conversation: {
      title: payload?.title || "ChatGPT Conversation",
      source: payload?.source || "",
      exportedAt: payload?.exportedAt || "",
      captureMode: payload?.captureMode || ""
    },
    policy: {
      userUploads: "metadata-thumbnail-original-optional",
      aiGenerated: "preserve-original-when-available",
      remoteReferences: "reference-only-until-fetch-enabled",
      dedupe: "sha256"
    },
    assetStore: {
      type: "local-cache",
      rootHint: ".convo-vault/assets",
      pathStyle: "sha256-prefix"
    },
    counts,
    assets,
    outputObjectCounts: outputObjectIndex.counts,
    outputObjects: outputObjectIndex.objects
  };
}

function externalizeEmbeddedImageAssets(payload, assetManifest, options = {}) {
  return rewriteEmbeddedImageAssets(payload, assetManifest, { ...options, externalize: true });
}

function dedupeEmbeddedImageAssets(payload, assetManifest, options = {}) {
  return rewriteEmbeddedImageAssets(payload, assetManifest, { ...options, externalize: false });
}

function rewriteEmbeddedImageAssets(payload, assetManifest, options = {}) {
  const localImageAssetMap = createLocalImageAssetMap(options.localImageAssets);
  const assetsBySha = new Map((assetManifest?.assets || [])
    .filter((asset) => asset?.sha256 && asset?.cachePath)
    .map((asset) => [asset.sha256, asset]));
  const replacementCache = new Map();
  const messages = (Array.isArray(payload?.messages) ? payload.messages : []).map((message) => {
    return {
      ...message,
      markdown: rewriteMarkdownImages(message?.markdown, assetsBySha, replacementCache, localImageAssetMap, options),
      thinkingMarkdown: rewriteMarkdownImages(message?.thinkingMarkdown, assetsBySha, replacementCache, localImageAssetMap, options)
    };
  });

  return {
    ...payload,
    messages
  };
}

function rewriteMarkdownImages(markdown, assetsBySha, replacementCache, localImageAssetMap, options = {}) {
  const imagePattern = new RegExp(MARKDOWN_IMAGE_RE.source, MARKDOWN_IMAGE_RE.flags);
  const source = String(markdown || "");
  const seenAssets = new Set();
  let previousMatchEnd = 0;
  const replaced = source.replace(imagePattern, (match, alt, src, offset) => {
    if (hasSubstantiveImageGap(source.slice(previousMatchEnd, offset))) {
      seenAssets.clear();
    }
    previousMatchEnd = offset + match.length;
    let replacement = replacementCache.get(src);

    if (replacement === undefined) {
      const localAsset = resolveLocalImageAsset(src, localImageAssetMap);
      const dataUri = parseDataUri(src);
      const asset = localAsset?.sha256
        ? assetsBySha.get(localAsset.sha256) || null
        : dataUri?.mimeType.startsWith("image/")
          ? assetsBySha.get(hashBuffer(dataUri.bytes)) || null
          : null;
      replacement = { asset, localAsset };
      replacementCache.set(src, replacement);
    }

    const { asset, localAsset } = replacement;
    if (!asset?.cachePath) {
      return match;
    }

    if (seenAssets.has(asset.assetId)) {
      return "";
    }

    seenAssets.add(asset.assetId);
    if (options.externalize) {
      return `![${alt || "Image"}](${asset.cachePath})`;
    }

    const renderUrl = localAsset?.renderUrl || localAsset?.fileUrl;
    if (options.renderLocalFiles && renderUrl) {
      return `![${alt || "Image"}](${renderUrl})`;
    }

    return match;
  });

  return replaced
    .replace(/\s*<!-- Image base64 embedding is temporarily disabled during scanning to avoid page side effects\. -->\s*/g, "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hasSubstantiveImageGap(value) {
  return Boolean(String(value || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim());
}

function buildOutputObjectIndex(payload, options = {}) {
  const objectsById = new Map();
  const dataUriCache = options.dataUriCache || new Map();
  const localImageAssetMap = options.localImageAssetMap || createLocalImageAssetMap(options.localImageAssets);
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];

  for (const message of messages) {
    collectOutputObjects(message, "markdown", objectsById, dataUriCache, localImageAssetMap);
    collectOutputObjects(message, "thinkingMarkdown", objectsById, dataUriCache, localImageAssetMap);
  }

  const objects = [...objectsById.values()].sort((a, b) => a.objectId.localeCompare(b.objectId));
  const counts = objects.reduce((result, object) => {
    result.total += 1;
    result.byKind[object.kind] = (result.byKind[object.kind] || 0) + 1;
    result.byRenderStatus[object.renderStatus] = (result.byRenderStatus[object.renderStatus] || 0) + 1;
    if (object.degraded) {
      result.degraded += 1;
      result.byDegradationReason[object.degradationReason] = (result.byDegradationReason[object.degradationReason] || 0) + 1;
    }
    return result;
  }, {
    total: 0,
    degraded: 0,
    byKind: {},
    byRenderStatus: {},
    byDegradationReason: {}
  });

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    counts,
    objects
  };
}

function collectMessageImageAssets(message, field, assetRoot, assetsById, embeddedAssetCache = new Map(), dataUriCache = new Map(), localImageAssetMap = new Map()) {
  const source = String(message?.[field] || "");
  let match;

  while ((match = MARKDOWN_IMAGE_RE.exec(source))) {
    const alt = cleanText(match[1] || "Image", 160);
    const src = match[2] || "";
    const reference = buildReference(message, field, { label: alt });
    const localAsset = resolveLocalImageAsset(src, localImageAssetMap);
    const embeddedAsset = resolveEmbeddedImageAsset(src, assetRoot, embeddedAssetCache, dataUriCache);

    if (localAsset) {
      upsertAsset(assetsById, {
        assetId: `sha256:${localAsset.sha256}`,
        sha256: localAsset.sha256,
        kind: kindFromMime(localAsset.mimeType),
        storage: "local-cache",
        mimeType: localAsset.mimeType,
        sizeBytes: localAsset.sizeBytes,
        cachePath: localAsset.cachePath,
        origin: originFromMessageRole(message?.role),
        label: alt,
        references: [reference]
      });
      continue;
    }

    if (embeddedAsset) {
      upsertAsset(assetsById, {
        ...embeddedAsset,
        origin: originFromMessageRole(message?.role),
        label: alt,
        references: [reference]
      });
      continue;
    }

    upsertAsset(assetsById, {
      assetId: `ref:${hashString(src)}`,
      kind: "image",
      origin: originFromMessageRole(message?.role),
      storage: "reference-only",
      sourceUrl: src,
      label: alt,
      references: [reference]
    });
  }
}

function resolveEmbeddedImageAsset(src, assetRoot, cache, dataUriCache) {
  if (cache.has(src)) {
    return cache.get(src);
  }

  const dataUri = getCachedDataUri(src, dataUriCache);
  if (!dataUri) {
    cache.set(src, null);
    return null;
  }

  const sha256 = hashBuffer(dataUri.bytes);
  const extension = extensionFromMime(dataUri.mimeType);
  const cachePath = path.join("sha256", sha256.slice(0, 2), sha256.slice(2, 4), `${sha256}.${extension}`);

  if (assetRoot) {
    const absolutePath = path.join(assetRoot, cachePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    if (!fs.existsSync(absolutePath)) {
      fs.writeFileSync(absolutePath, dataUri.bytes);
    }
  }

  const asset = {
    assetId: `sha256:${sha256}`,
    sha256,
    kind: kindFromMime(dataUri.mimeType),
    storage: "local-cache",
    mimeType: dataUri.mimeType,
    sizeBytes: dataUri.bytes.length,
    cachePath: slashPath(path.join("assets", cachePath))
  };
  cache.set(src, asset);
  return asset;
}

function collectMessageFileAssets(message, field, assetsById) {
  const source = maskEmbeddedDataUris(message?.[field]);
  const sourceWithoutFileLinks = source.replace(FILE_LINK_RE, " ");
  let match;

  FILE_LINK_RE.lastIndex = 0;
  while ((match = FILE_LINK_RE.exec(source))) {
    const fileName = cleanText(match[1] || "attachment", 180);
    const sourceUrl = match[2] || "";
    upsertAsset(assetsById, {
      assetId: `file-ref:${hashString(`${fileName}\n${sourceUrl}`)}`,
      kind: "file",
      origin: originFromMessageRole(message?.role),
      storage: "reference-only",
      fileName,
      sourceUrl,
      label: fileName,
      references: [buildReference(message, field, { label: fileName })]
    });
  }

  FILENAME_RE.lastIndex = 0;
  while ((match = FILENAME_RE.exec(sourceWithoutFileLinks))) {
    const fileName = cleanText(match[0], 180);
    upsertAsset(assetsById, {
      assetId: `file-name:${hashString(fileName)}`,
      kind: "file",
      origin: originFromMessageRole(message?.role),
      storage: "metadata-only",
      fileName,
      label: fileName,
      references: [buildReference(message, field, { label: fileName })]
    });
  }
}

function collectOutputObjects(message, field, objectsById, dataUriCache, localImageAssetMap) {
  const source = String(message?.[field] || "");
  const textSource = maskEmbeddedDataUris(source);

  collectMathOutputObjects(message, field, textSource, objectsById);
  collectMermaidOutputObjects(message, field, textSource, objectsById);
  collectChartOutputObjects(message, field, textSource, objectsById);
  collectImageOutputObjects(message, field, source, objectsById, dataUriCache, localImageAssetMap);
  collectLinkOutputObjects(message, field, textSource, objectsById);
}

function collectMathOutputObjects(message, field, source, objectsById) {
  collectPatternObjects(source, DISPLAY_MATH_RE, (match) => {
    upsertOutputObject(objectsById, buildOutputObject(message, field, {
      kind: "math",
      subtype: "display",
      label: cleanText(match[1], 120) || "Formula",
      content: cleanMultiline(match[1]),
      renderStatus: "rendered-static",
      renderPolicy: "formula-panel"
    }));
  });

  collectPatternObjects(source, INLINE_MATH_RE, (match) => {
    upsertOutputObject(objectsById, buildOutputObject(message, field, {
      kind: "math",
      subtype: "inline",
      label: cleanText(match[1], 120) || "Inline formula",
      content: cleanMultiline(match[1]),
      renderStatus: "rendered-static",
      renderPolicy: "inline-formula"
    }));
  });
}

function collectMermaidOutputObjects(message, field, source, objectsById) {
  collectPatternObjects(source, MERMAID_FENCE_RE, (match) => {
    const content = cleanMultiline(match[1]);
    const diagramType = getMermaidDiagramType(content);
    const supported = SUPPORTED_DIAGRAM_TYPES.has(diagramType);
    upsertOutputObject(objectsById, buildOutputObject(message, field, {
      kind: "diagram",
      subtype: diagramType || "mermaid",
      label: diagramType ? `Mermaid ${diagramType}` : "Mermaid diagram",
      content,
      renderStatus: supported ? "rendered-static" : "degraded",
      renderPolicy: supported ? "diagram-svg" : "source-preserved",
      degraded: !supported,
      degradationReason: supported ? "" : "unsupported-diagram-type"
    }));
  });
}

function collectChartOutputObjects(message, field, source, objectsById) {
  collectPatternObjects(source, CHART_FENCE_RE, (match) => {
    const content = cleanMultiline(match[1]);
    upsertOutputObject(objectsById, buildOutputObject(message, field, {
      kind: "chart",
      subtype: getChartSubtype(content),
      label: getChartLabel(content),
      content,
      renderStatus: "rendered-static",
      renderPolicy: "chart-svg"
    }));
  });
}

function collectImageOutputObjects(message, field, source, objectsById, dataUriCache, localImageAssetMap) {
  collectPatternObjects(source, MARKDOWN_IMAGE_RE, (match) => {
    const alt = cleanText(match[1] || "Image", 160);
    const src = match[2] || "";
    const dataUri = getCachedDataUri(src, dataUriCache);
    const localAsset = resolveLocalImageAsset(src, localImageAssetMap);
    const mimeType = localAsset?.mimeType || dataUri?.mimeType || mimeTypeFromUrl(src);
    const animated = isAnimatedImageMimeOrUrl(mimeType, src);
    const remote = !dataUri && !localAsset;

    upsertOutputObject(objectsById, buildOutputObject(message, field, {
      kind: animated ? "gif" : "image",
      subtype: mimeSubtype(mimeType) || (animated ? "gif" : "image"),
      label: alt,
      identity: localAsset?.sha256 || (dataUri ? hashBuffer(dataUri.bytes) : hashString(src)),
      sourceUrl: remote ? src : "",
      mimeType,
      renderStatus: animated ? "degraded" : (remote ? "reference-only" : "embedded-static"),
      renderPolicy: animated ? "static-poster-or-reference" : (remote ? "reference-card" : "inline-image"),
      degraded: animated || remote,
      degradationReason: animated ? "animated-media-static-poster" : (remote ? "remote-image-reference-only" : "")
    }));
  });
}

function createLocalImageAssetMap(localImageAssets) {
  const map = new Map();

  for (const asset of Array.isArray(localImageAssets) ? localImageAssets : []) {
    if (!asset?.sha256 || !asset?.cachePath) {
      continue;
    }

    if (asset.sourceKey) {
      map.set(asset.sourceKey, asset);
    }

    if (asset.source) {
      map.set(hashString(asset.source), asset);
    }

    if (asset.cachePath) {
      map.set(hashString(asset.cachePath), asset);
    }

    if (asset.renderUrl) {
      map.set(hashString(asset.renderUrl), asset);
    }
  }

  return map;
}

function resolveLocalImageAsset(source, localImageAssetMap) {
  if (!source || !localImageAssetMap?.size) {
    return null;
  }

  return localImageAssetMap.get(hashString(source)) || null;
}

function collectLinkOutputObjects(message, field, source, objectsById) {
  collectPatternObjects(source, MARKDOWN_LINK_RE, (match) => {
    if (source[match.index - 1] === "!") {
      return;
    }

    const label = cleanText(match[1], 180);
    const sourceUrl = match[2] || "";
    const fileName = extractLinkedFileName(label, sourceUrl);
    const interactiveKind = getInteractiveLinkKind(label);

    if (interactiveKind) {
      upsertOutputObject(objectsById, buildOutputObject(message, field, {
        kind: "interactive",
        subtype: interactiveKind,
        label: stripLinkPrefix(label),
        sourceUrl,
        renderStatus: "degraded",
        renderPolicy: "static-card",
        degraded: true,
        degradationReason: "interactive-content-static-record"
      }));
      return;
    }

    if (isCitationLink(label)) {
      upsertOutputObject(objectsById, buildOutputObject(message, field, {
        kind: "citation",
        subtype: "source-link",
        label: stripLinkPrefix(label),
        sourceUrl,
        renderStatus: "reference-only",
        renderPolicy: "link-reference"
      }));
      return;
    }

    if (!fileName) {
      return;
    }

    const classification = classifyFileName(fileName);
    upsertOutputObject(objectsById, buildOutputObject(message, field, {
      kind: classification.kind,
      subtype: classification.subtype,
      label: fileName,
      sourceUrl,
      mimeType: classification.mimeType,
      renderStatus: classification.degraded ? "degraded" : "reference-only",
      renderPolicy: classification.degraded ? "static-card" : "attachment-card",
      degraded: classification.degraded,
      degradationReason: classification.degraded ? classification.degradationReason : ""
    }));
  });
}

function collectPatternObjects(source, pattern, callback) {
  pattern.lastIndex = 0;
  let match;

  while ((match = pattern.exec(source))) {
    callback(match);
  }
}

function buildOutputObject(message, field, details) {
  const key = [
    details.kind,
    details.subtype || "",
    details.label || "",
    details.sourceUrl || "",
    details.content || "",
    details.identity || "",
    message?.id || "",
    message?.turnNumber || message?.order || "",
    field
  ].join("\n");

  return {
    objectId: `object:${hashString(key).slice(0, 24)}`,
    kind: details.kind,
    subtype: details.subtype || "",
    label: details.label || "",
    sourceUrl: details.sourceUrl || "",
    mimeType: details.mimeType || "",
    content: details.content || "",
    renderStatus: details.renderStatus || "reference-only",
    renderPolicy: details.renderPolicy || "reference-card",
    degraded: Boolean(details.degraded),
    degradationReason: details.degradationReason || "",
    messageId: message?.id || "",
    turnNumber: message?.turnNumber || message?.order || null,
    role: message?.role || "unknown",
    field
  };
}

function upsertOutputObject(objectsById, object) {
  if (!object?.kind || objectsById.has(object.objectId)) {
    return;
  }

  objectsById.set(object.objectId, object);
}

function upsertAsset(assetsById, asset) {
  const existing = assetsById.get(asset.assetId);

  if (!existing) {
    assetsById.set(asset.assetId, {
      ...asset,
      references: uniqueReferences(asset.references || [])
    });
    return;
  }

  existing.references = uniqueReferences([
    ...existing.references,
    ...(asset.references || [])
  ]);

  if (!existing.label && asset.label) {
    existing.label = asset.label;
  }
}

function buildReference(message, field, details = {}) {
  return {
    messageId: message?.id || "",
    turnNumber: message?.turnNumber || message?.order || null,
    role: message?.role || "unknown",
    field,
    label: details.label || ""
  };
}

function uniqueReferences(references) {
  const seen = new Set();
  const result = [];

  for (const reference of references) {
    const key = JSON.stringify(reference);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(reference);
  }

  return result;
}

function parseDataUri(value) {
  const match = String(value || "").match(DATA_URI_RE);

  if (!match) {
    return null;
  }

  const declaredMimeType = (match[1] || "application/octet-stream").toLowerCase();
  const bytes = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  const mimeType = sniffMimeType(bytes, declaredMimeType);

  return {
    mimeType,
    declaredMimeType,
    bytes,
    source: `data:${mimeType};base64,${bytes.toString("base64")}`
  };
}

function getCachedDataUri(value, cache = new Map()) {
  const key = String(value || "");
  if (cache.has(key)) {
    return cache.get(key);
  }

  const parsed = parseDataUri(key);
  cache.set(key, parsed);
  return parsed;
}

function maskEmbeddedDataUris(value) {
  return String(value || "").replace(
    /data:[^;,)\s]+(?:;charset=[^;,)\s]+)?;base64,[a-z0-9+/=]+/gi,
    "embedded-image"
  );
}

function normalizeEmbeddedImageSource(value) {
  const parsed = parseDataUri(value);
  return parsed?.mimeType.startsWith("image/") ? parsed.source : "";
}

function sniffMimeType(bytes, declaredMimeType) {
  const declared = String(declaredMimeType || "").toLowerCase();

  if (!GENERIC_BINARY_MIME_TYPES.has(declared)) {
    return declared;
  }

  if (!Buffer.isBuffer(bytes)) {
    return declared || "application/octet-stream";
  }

  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (bytes.length >= 6 && (bytes.subarray(0, 6).toString("ascii") === "GIF87a" || bytes.subarray(0, 6).toString("ascii") === "GIF89a")) {
    return "image/gif";
  }

  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }

  if (bytes.length >= 2 && bytes.subarray(0, 2).toString("ascii") === "BM") {
    return "image/bmp";
  }

  const text = bytes.subarray(0, 512).toString("utf8").replace(/^\uFEFF/, "").trimStart();
  if (/^(?:<\?xml[^>]*>\s*)?<svg(?:\s|>)/i.test(text)) {
    return "image/svg+xml";
  }

  return declared || "application/octet-stream";
}

function originFromMessageRole(role) {
  const normalized = String(role || "").toLowerCase();
  if (normalized === "assistant") return "ai-generated";
  if (normalized === "user") return "user-provided";
  return "unknown";
}

function kindFromMime(mimeType) {
  const type = String(mimeType || "").toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  return "file";
}

function extensionFromMime(mimeType) {
  const type = String(mimeType || "").toLowerCase();
  if (type === "image/jpeg") return "jpg";
  if (type === "image/svg+xml") return "svg";
  const subtype = type.split("/")[1] || "bin";
  return subtype.replace(/[^a-z0-9]+/g, "").slice(0, 12) || "bin";
}

function getMermaidDiagramType(source) {
  const firstLine = String(source || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("%%")) || "";
  const match = firstLine.match(/^([A-Za-z][A-Za-z0-9_-]*)/);
  return String(match?.[1] || "").toLowerCase();
}

function getChartSubtype(source) {
  const text = String(source || "").trim();

  try {
    const parsed = JSON.parse(text);
    const type = parsed?.mark || parsed?.type || parsed?.chart || "";
    return normalizeChartSubtype(type);
  } catch (_) {
    const firstLine = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
    return normalizeChartSubtype(/^(bar|line|area|scatter)\b/i.test(firstLine) ? firstLine : "bar");
  }
}

function getChartLabel(source) {
  try {
    const parsed = JSON.parse(String(source || "").trim());
    return cleanText(parsed?.title || `${getChartSubtype(source)} chart`, 160);
  } catch (_) {
    return `${getChartSubtype(source)} chart`;
  }
}

function normalizeChartSubtype(value) {
  const type = String(value || "bar").toLowerCase().replace(/[^a-z]/g, "");
  if (type.includes("line")) return "line";
  if (type.includes("area")) return "line";
  if (type.includes("scatter")) return "scatter";
  return "bar";
}

function mimeTypeFromUrl(url) {
  const extension = String(url || "")
    .split(/[?#]/)[0]
    .match(/\.([a-z0-9]{1,8})$/i)?.[1]
    ?.toLowerCase() || "";

  if (!extension) return "";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "gif") return "image/gif";
  if (extension === "webp") return "image/webp";
  if (extension === "svg") return "image/svg+xml";
  if (extension === "mp4") return "video/mp4";
  if (extension === "mov") return "video/quicktime";
  if (extension === "webm") return "video/webm";
  if (extension === "mp3") return "audio/mpeg";
  if (extension === "wav") return "audio/wav";
  if (extension === "m4a") return "audio/mp4";
  if (extension === "pdf") return "application/pdf";
  if (extension === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (extension === "csv") return "text/csv";
  if (extension === "pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (extension === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "";
}

function mimeSubtype(mimeType) {
  return String(mimeType || "").split("/")[1]?.replace(/[^a-z0-9.+-]/gi, "") || "";
}

function isAnimatedImageMimeOrUrl(mimeType, url) {
  return String(mimeType || "").toLowerCase() === "image/gif"
    || /\.gif(?:$|[?#])/i.test(String(url || ""));
}

function extractLinkedFileName(label, sourceUrl) {
  const labelFile = String(label || "").match(FILENAME_RE)?.[0] || "";
  if (labelFile) return cleanText(labelFile, 180);

  try {
    const parsed = new URL(sourceUrl);
    const fileName = decodeURIComponent(parsed.pathname.split("/").pop() || "");
    return cleanText(fileName.match(FILENAME_RE)?.[0] || "", 180);
  } catch (_) {
    return cleanText(String(sourceUrl || "").match(FILENAME_RE)?.[0] || "", 180);
  }
}

function classifyFileName(fileName) {
  const extension = String(fileName || "").split(/[?#]/)[0].match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase() || "";

  if (["mp4", "mov", "webm", "m4v"].includes(extension)) {
    return {
      kind: "video",
      subtype: extension,
      mimeType: mimeTypeFromUrl(fileName),
      degraded: true,
      degradationReason: "media-not-playable-in-pdf"
    };
  }

  if (["mp3", "wav", "m4a", "aac", "ogg"].includes(extension)) {
    return {
      kind: "audio",
      subtype: extension,
      mimeType: mimeTypeFromUrl(fileName),
      degraded: true,
      degradationReason: "media-not-playable-in-pdf"
    };
  }

  if (["xlsx", "xls", "csv", "tsv"].includes(extension)) {
    return { kind: "spreadsheet", subtype: extension, mimeType: mimeTypeFromUrl(fileName), degraded: false };
  }

  if (["pptx", "ppt"].includes(extension)) {
    return { kind: "presentation", subtype: extension, mimeType: mimeTypeFromUrl(fileName), degraded: false };
  }

  if (["pdf", "doc", "docx", "txt", "md"].includes(extension)) {
    return { kind: "document", subtype: extension, mimeType: mimeTypeFromUrl(fileName), degraded: false };
  }

  return { kind: "file", subtype: extension || "file", mimeType: mimeTypeFromUrl(fileName), degraded: false };
}

function getInteractiveLinkKind(label) {
  const match = String(label || "").match(/^\s*(Interactive|Dashboard|Canvas|App|Prototype|Site)\s*:/i);
  return match ? match[1].toLowerCase() : "";
}

function isCitationLink(label) {
  return /^\s*(Source|Citation|Reference)\s*:/i.test(String(label || ""));
}

function stripLinkPrefix(label) {
  return cleanText(String(label || "").replace(/^\s*(?:File|Attachment|Interactive|Dashboard|Canvas|App|Prototype|Site|Source|Citation|Reference)\s*:\s*/i, ""), 180);
}

function hashBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function hashString(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function cleanText(value, maxLength = 140) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function cleanMultiline(value, maxLength = 4000) {
  const text = String(value || "")
    .replace(/\r\n?/g, "\n")
    .trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function slashPath(value) {
  return String(value || "").replace(/\\/g, "/");
}

module.exports = {
  buildAssetManifest,
  buildOutputObjectIndex,
  dedupeEmbeddedImageAssets,
  externalizeEmbeddedImageAssets,
  normalizeEmbeddedImageSource,
  parseDataUri
};
