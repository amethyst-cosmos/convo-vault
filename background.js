const IMAGE_FETCH_TIMEOUT_MS = 6000;
const ACCESS_TOKEN_TIMEOUT_MS = 3500;
const SETTINGS_STORAGE_KEY = "convoVaultSettings";
const DEFAULT_RENDERER_PORT = 38474;
const LOCAL_RENDERER_BUNDLE_PORT = "CONVO_VAULT_LOCAL_RENDERER_BUNDLE";
const MAX_LOCAL_RENDERER_REQUEST_BYTES = 256 * 1024 * 1024;
const LOCAL_RENDERER_KEEPALIVE_MS = 15000;
const LOCAL_RENDERER_ASSET_CONCURRENCY = 4;
const accessTokenCache = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "FETCH_IMAGE_AS_DATA_URI") {
    return false;
  }

  fetchImageAsDataUri(message.src, message.pageUrl)
    .then((dataUri) => sendResponse({ ok: true, dataUri }))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));

  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port?.name !== LOCAL_RENDERER_BUNDLE_PORT) {
    return;
  }

  if (!isTrustedExporterSender(port.sender)) {
    port.postMessage({
      type: "RESULT",
      result: { ok: false, error: "Local renderer requests are only accepted from ChatGPT conversation tabs." }
    });
    disconnectPortSoon(port);
    return;
  }

  let started = false;
  let finished = false;
  let expectedCharacters = 0;
  let expectedBytes = 0;
  let receivedCharacters = 0;
  let receivedBytes = 0;
  let chunks = [];
  let keepAliveTimer = null;

  port.onMessage.addListener((message) => {
    if (finished) {
      return;
    }

    if (message?.type === "START") {
      if (started) {
        finishWithError("Local renderer export stream was started more than once.");
        return;
      }

      expectedCharacters = Number(message.totalCharacters) || 0;
      expectedBytes = Number(message.totalBytes) || 0;

      if (
        expectedCharacters <= 0
        || expectedBytes <= 0
        || expectedBytes > MAX_LOCAL_RENDERER_REQUEST_BYTES
      ) {
        finishWithError(`Local renderer request exceeds the ${MAX_LOCAL_RENDERER_REQUEST_BYTES} byte safety limit.`);
        return;
      }

      started = true;
      return;
    }

    if (message?.type === "CHUNK") {
      if (!started) {
        finishWithError("Local renderer export stream did not start correctly.");
        return;
      }

      const chunk = typeof message.data === "string" ? message.data : "";
      receivedCharacters += chunk.length;
      receivedBytes += new TextEncoder().encode(chunk).byteLength;

      if (
        receivedCharacters > expectedCharacters
        || receivedBytes > expectedBytes
        || receivedBytes > MAX_LOCAL_RENDERER_REQUEST_BYTES
      ) {
        finishWithError("Local renderer export stream exceeded its declared size.");
        return;
      }

      chunks.push(chunk);
      return;
    }

    if (message?.type === "END") {
      finishExport();
    }
  });

  port.onDisconnect.addListener(() => {
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }
    chunks = [];
  });

  async function finishExport() {
    if (finished) {
      return;
    }

    if (!started || receivedCharacters !== expectedCharacters || receivedBytes !== expectedBytes) {
      finishWithError("Local renderer export stream ended before the complete request arrived.");
      return;
    }

    finished = true;
    const serializedBody = chunks.join("");
    chunks = [];
    keepAliveTimer = setInterval(() => {
      safePostMessage(port, { type: "KEEPALIVE" });
    }, LOCAL_RENDERER_KEEPALIVE_MS);

    try {
      const result = await prepareAndDownloadLocalBundle(serializedBody);
      safePostMessage(port, { type: "RESULT", result });
    } catch (error) {
      safePostMessage(port, {
        type: "RESULT",
        result: { ok: false, error: error.message || String(error) }
      });
    } finally {
      if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
      }
      disconnectPortSoon(port);
    }
  }

  function finishWithError(error) {
    if (finished) {
      return;
    }
    finished = true;
    chunks = [];
    safePostMessage(port, {
      type: "RESULT",
      result: { ok: false, error }
    });
    disconnectPortSoon(port);
  }
});

async function prepareAndDownloadLocalBundle(serializedBody) {
  const settings = await loadRendererSettings();
  const rendererUrl = `http://127.0.0.1:${settings.port}`;
  const requestHeaders = {
    "X-Convo-Vault-Token": settings.backendToken
  };
  let body;
  let exportSessionId = "";
  let response;

  try {
    body = JSON.parse(serializedBody);
  } catch (error) {
    throw new Error(`Local renderer export request is invalid JSON. Details: ${error.message || error}`);
  }

  // ChatGPT file pointers resolve only with the page's session, so the content
  // script downloads them and ships the bytes here; the renderer never sees them.
  const pageImages = readPageImageMap(body?.pageImages);
  const pageImageFailures = readPageImageMap(body?.pageImageFailures);
  if (body && typeof body === "object") {
    delete body.pageImages;
    delete body.pageImageFailures;
  }

  try {
    const imageSources = collectBundleImageSources(body?.exportPayload?.messages);
    if (imageSources.length) {
      const session = await createLocalExportSession(rendererUrl, requestHeaders);
      exportSessionId = session.sessionId;
      const staged = await stageBundleImageSources({
        rendererUrl,
        requestHeaders,
        exportSessionId,
        imageSources,
        pageImages,
        pageImageFailures,
        pageUrl: body?.exportPayload?.source || ""
      });
      applyStagedImageStats(body?.exportPayload, staged);
      body.exportSessionId = exportSessionId;
    }

    response = await fetch(`${rendererUrl}/prepare-render-bundle`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...requestHeaders
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    if (exportSessionId) {
      await deleteLocalExportSession(rendererUrl, requestHeaders, exportSessionId);
    }
    throw new Error(`Local renderer is not running at ${rendererUrl}. Details: ${error.message || error}`);
  }

  const prepared = await readRendererJson(response);

  if (response.status === 401 || response.status === 403) {
    throw new Error("Local renderer rejected the extension token. Copy a fresh start command from the popup and restart the local renderer.");
  }

  if (!response.ok || !prepared?.ok) {
    throw new Error(`Bundle renderer failed (${response.status}). ${prepared?.error || response.statusText}`);
  }

  const downloadUrl = new URL(prepared.downloadPath || "", `${rendererUrl}/`);
  const rendererOrigin = new URL(rendererUrl).origin;

  if (downloadUrl.origin !== rendererOrigin || !downloadUrl.pathname.startsWith("/download-bundle/")) {
    throw new Error("Local renderer returned an invalid bundle download address.");
  }

  const filename = String(prepared.filename || "chatgpt-conversation.zip");
  const browserDownloadId = await downloadPreparedBundle(downloadUrl.href, filename);

  return {
    ok: true,
    filename,
    rendererUrl,
    bundleFiles: String(prepared.bundleFiles || ""),
    rendererTimings: prepared.rendererTimings || null,
    assetCount: Number(prepared.assetCount) || 0,
    assetStats: prepared.assetStats || body?.exportPayload?.assetStats || null,
    bundleSize: Number(prepared.bundleSize) || 0,
    browserDownloadId
  };
}

async function createLocalExportSession(rendererUrl, requestHeaders) {
  const response = await fetch(`${rendererUrl}/export-sessions`, {
    method: "POST",
    headers: requestHeaders
  });
  const result = await readRendererJson(response);

  if (!response.ok || !result?.ok || !/^[a-f0-9]{48}$/.test(String(result.sessionId || ""))) {
    throw new Error(`Could not create local export session (${response.status}). ${result?.error || response.statusText}`);
  }

  return result;
}

async function stageBundleImageSources(options) {
  const resultsBySource = new Map();
  let cursor = 0;
  const workerCount = Math.min(LOCAL_RENDERER_ASSET_CONCURRENCY, options.imageSources.length);

  async function worker() {
    while (cursor < options.imageSources.length) {
      const source = options.imageSources[cursor];
      cursor += 1;

      try {
        const sourceKey = await sha256Text(source);
        const blob = await resolveStageableImageBlob(source, options);
        const response = await fetch(`${options.rendererUrl}/export-sessions/${options.exportSessionId}/assets/${sourceKey}`, {
          method: "PUT",
          headers: {
            ...options.requestHeaders,
            "Content-Type": blob.type || "application/octet-stream"
          },
          body: blob
        });
        const result = await readRendererJson(response);

        if (!response.ok || !result?.ok) {
          throw new Error(result?.error || `HTTP ${response.status}`);
        }

        resultsBySource.set(source, {
          ok: true,
          sourceKey,
          sha256: result.sha256 || "",
          reused: Boolean(result.reused)
        });
      } catch (error) {
        resultsBySource.set(source, {
          ok: false,
          error: error.message || String(error)
        });
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return resultsBySource;
}

async function resolveStageableImageBlob(source, options) {
  const pageImage = options.pageImages?.get(source);

  if (pageImage) {
    return dataUriToBlob(pageImage);
  }

  const pageFailure = options.pageImageFailures?.get(source);

  // The page already tried with the user's session; retrying ChatGPT file
  // endpoints from the service worker only adds failed requests.
  if (pageFailure) {
    throw new Error(`page download failed: ${pageFailure}`);
  }

  return fetchImageAsBlob(source, options.pageUrl);
}

function readPageImageMap(value) {
  const entries = value && typeof value === "object" && !Array.isArray(value) ? Object.entries(value) : [];
  return new Map(entries.filter(([source, item]) => typeof source === "string" && typeof item === "string"));
}

async function deleteLocalExportSession(rendererUrl, requestHeaders, exportSessionId) {
  try {
    await fetch(`${rendererUrl}/export-sessions/${exportSessionId}`, {
      method: "DELETE",
      headers: requestHeaders
    });
  } catch (_) {
    // Session expiry will release the in-memory record if cleanup cannot reach the renderer.
  }
}

function collectBundleImageSources(messages) {
  const sources = [];
  const seen = new Set();

  for (const message of Array.isArray(messages) ? messages : []) {
    for (const source of [
      ...extractMarkdownImageSources(message?.markdown),
      ...extractMarkdownImageSources(message?.thinkingMarkdown)
    ]) {
      if (!isStageableBundleImageSource(source) || seen.has(source)) {
        continue;
      }
      seen.add(source);
      sources.push(source);
    }
  }

  return sources;
}

function extractMarkdownImageSources(markdown) {
  const sources = [];
  const pattern = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match;

  while ((match = pattern.exec(String(markdown || "")))) {
    sources.push(match[1] || "");
  }

  return sources;
}

function isStageableBundleImageSource(source) {
  return /^https?:\/\//i.test(String(source || ""))
    || /^(?:file-service|sediment):\/\//i.test(String(source || ""));
}

function applyStagedImageStats(payload, staged) {
  if (!payload || !Array.isArray(payload.messages)) {
    return;
  }

  let embeddedReferences = 0;
  let failedReferences = 0;

  for (const message of payload.messages) {
    const sources = [
      ...extractMarkdownImageSources(message?.markdown),
      ...extractMarkdownImageSources(message?.thinkingMarkdown)
    ];
    let embedded = 0;
    let failed = 0;
    let deferred = 0;

    for (const source of sources) {
      if (/^data:image\//i.test(source) || staged.get(source)?.ok) {
        embedded += 1;
      } else if (isStageableBundleImageSource(source)) {
        failed += 1;
      } else {
        deferred += 1;
      }
    }

    message.imageCount = sources.length;
    message.imagesEmbedded = embedded;
    message.imagesFailed = failed;
    message.imagesDeferred = deferred;
    embeddedReferences += embedded;
    failedReferences += failed;
  }

  const uniqueResults = [...staged.values()];
  payload.assetStats = {
    ...(payload.assetStats || {}),
    imagesEmbedded: uniqueResults.filter((result) => result.ok).length,
    imagesFailed: uniqueResults.filter((result) => !result.ok).length,
    imageFailureSamples: [...new Set(uniqueResults.filter((result) => !result.ok).map((result) => result.error))].slice(0, 5),
    imagesSkipped: 0,
    imageReferencesEmbedded: embeddedReferences,
    imageReferencesFailed: failedReferences,
    imagesReused: uniqueResults.filter((result) => result.ok && result.reused).length
  };
}

async function sha256Text(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function loadRendererSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get([SETTINGS_STORAGE_KEY], (result) => {
      const settings = result?.[SETTINGS_STORAGE_KEY] || {};
      resolve({
        port: DEFAULT_RENDERER_PORT,
        backendToken: String(settings.backendToken || "").trim()
      });
    });
  });
}

async function readRendererJson(response) {
  const text = await response.text().catch(() => "");
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (_) {
    return { error: text.slice(0, 2000) };
  }
}

function downloadPreparedBundle(url, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url,
      filename,
      conflictAction: "uniquify",
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!Number.isInteger(downloadId)) {
        reject(new Error("Chrome did not accept the prepared bundle download."));
        return;
      }

      resolve(downloadId);
    });
  });
}

function safePostMessage(port, message) {
  try {
    port.postMessage(message);
    return true;
  } catch (_) {
    return false;
  }
}

function disconnectPortSoon(port) {
  setTimeout(() => {
    try {
      port.disconnect();
    } catch (_) {
      // The receiving side may already have closed the completed stream.
    }
  }, 0);
}

function isTrustedExporterSender(sender) {
  const senderUrl = String(sender?.tab?.url || sender?.url || "");
  if (!senderUrl) {
    return true;
  }

  try {
    const { hostname } = new URL(senderUrl);
    return hostname === "chatgpt.com" || hostname === "chat.openai.com";
  } catch (_) {
    return false;
  }
}

async function fetchImageAsDataUri(src, pageUrl) {
  if (!src) {
    throw new Error("Missing image URL.");
  }

  if (src.startsWith("data:")) {
    return src;
  }

  const blob = await fetchImageAsBlob(src, pageUrl);
  const mimeType = blob.type || "application/octet-stream";
  const base64 = await blobToBase64(blob);
  return `data:${mimeType};base64,${base64}`;
}

async function fetchImageAsBlob(src, pageUrl) {
  if (!src) {
    throw new Error("Missing image URL.");
  }

  if (src.startsWith("data:")) {
    return dataUriToBlob(src);
  }

  const candidates = buildImageFetchCandidates(src, pageUrl);
  const errors = [];
  const seen = new Set();

  for (const candidate of candidates) {
    try {
      return await fetchImageCandidateAsBlob(candidate, pageUrl, seen);
    } catch (error) {
      errors.push(`${candidate.label}: ${error.message || error}`);
    }
  }

  throw new Error(`Image fetch failed. ${errors.slice(0, 4).join("; ")}`);
}

async function fetchImageCandidateAsBlob(candidate, pageUrl, seen = new Set()) {
  if (!candidate?.url || seen.has(candidate.url)) {
    throw new Error("duplicate or missing candidate URL");
  }

  if (/^data:image\//i.test(candidate.url)) {
    return dataUriToBlob(candidate.url);
  }

  seen.add(candidate.url);

  const headers = {
    accept: candidate.kind === "metadata"
      ? "application/json,*/*;q=0.8"
      : "image/avif,image/webp,image/apng,image/svg+xml,image/*,application/json,*/*;q=0.8"
  };
  const origin = getUrlOrigin(candidate.url);

  if (origin && isTrustedChatGptOrigin(origin)) {
    const accessToken = await getChatGptAccessToken(origin);

    if (accessToken) {
      headers.authorization = `Bearer ${accessToken}`;
    }
  }

  const response = await fetchWithTimeout(candidate.url, {
    timeoutMs: IMAGE_FETCH_TIMEOUT_MS,
    credentials: "include",
    referrer: pageUrl || undefined,
    headers
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";

  if (/json/i.test(contentType)) {
    const metadata = await response.json();
    const nestedCandidates = extractImageUrlsFromMetadata(metadata)
      .flatMap((url) => buildImageFetchCandidates(url, pageUrl))
      .filter((next) => next.url && !seen.has(next.url));
    const nestedErrors = [];

    for (const nextCandidate of nestedCandidates) {
      try {
        return await fetchImageCandidateAsBlob(nextCandidate, pageUrl, seen);
      } catch (error) {
        nestedErrors.push(`${nextCandidate.label}: ${error.message || error}`);
      }
    }

    throw new Error(`metadata did not resolve to image${nestedErrors.length ? ` (${nestedErrors.slice(0, 3).join("; ")})` : ""}`);
  }

  if (contentType && !/^image\//i.test(contentType) && !/octet-stream/i.test(contentType)) {
    throw new Error(`unexpected content-type ${contentType}`);
  }

  const blob = await response.blob();
  const mimeType = blob.type || response.headers.get("content-type") || "application/octet-stream";
  return blob.type === mimeType ? blob : new Blob([blob], { type: mimeType });
}

function dataUriToBlob(dataUri) {
  const match = String(dataUri || "").match(/^data:([^;,]+)?;base64,([a-z0-9+/=\r\n]+)$/i);
  if (!match) {
    throw new Error("Unsupported image data URI.");
  }

  const binary = atob(match[2].replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: match[1] || "application/octet-stream" });
}

function buildImageFetchCandidates(src, pageUrl) {
  const value = String(src || "").trim();

  if (/^data:image\//i.test(value)) {
    return [{ label: "direct:data", url: value }];
  }

  if (/^https?:\/\//i.test(value)) {
    return [{ label: "direct", url: value }];
  }

  const origin = getTrustedChatGptOrigin(pageUrl) || "https://chatgpt.com";

  if (/^\//.test(value)) {
    return [{ label: "relative", url: new URL(value, origin).href }];
  }

  const pointer = getInternalAssetPointer(value);

  if (!pointer.fileId) {
    return [{ label: "direct", url: value }];
  }

  const encodedId = encodeURIComponent(pointer.fileId);
  const labelPrefix = pointer.scheme || "asset";
  const paths = [
    `/backend-api/files/${encodedId}/content`,
    `/backend-api/files/${encodedId}/download`,
    `/backend-api/files/${encodedId}/image`,
    `/backend-api/files/${encodedId}/thumbnail`,
    `/backend-api/files/${encodedId}`,
    `/backend-api/files/${encodedId}?download=1`,
    `/backend-api/estuary/content?id=${encodedId}&p=fs`,
    `/backend-api/estuary/content?id=${encodedId}&p=fs&v=0`,
    `/backend-api/sediment/files/${encodedId}/content`,
    `/backend-api/sediment/files/${encodedId}/download`,
    `/backend-api/sediment/files/${encodedId}`
  ];

  return paths.map((path, index) => ({
    label: `${labelPrefix}:${index + 1}`,
    url: new URL(path, origin).href,
    kind: isMetadataAssetPath(path, encodedId) ? "metadata" : "image"
  }));
}

function isMetadataAssetPath(path, encodedId) {
  return path.endsWith(`/${encodedId}`) && !/(?:content|download|image|thumbnail|\?)/i.test(path);
}

function getInternalAssetPointer(value) {
  const text = String(value || "").trim();
  const schemeMatch = text.match(/^(file-service|sediment):\/\//i);
  const scheme = schemeMatch ? schemeMatch[1] : "asset";

  // Look for standard file IDs (e.g. file_00000000968881fa85680179ee957d99 or file-...)
  const fileMatch = text.match(/(file_[a-f0-9]{32}|file-[a-zA-Z0-9_-]+)/i);
  const fallbackMatch = text.match(/^(?:file-service|sediment):\/\/([^/?#]+)/i);
  const fileId = fileMatch ? fileMatch[1] : (fallbackMatch?.[1] || "");

  return {
    scheme,
    fileId
  };
}

function extractImageUrlsFromMetadata(metadata) {
  const urls = [];
  const seen = new Set();
  const preferredKey = /(?:url|href|uri|download|content|image|thumbnail|preview|signed|asset)/i;

  function visit(value, key = "", depth = 0) {
    if (depth > 5 || value == null) {
      return;
    }

    if (typeof value === "string") {
      const text = value.trim();
      if (
        text
        && preferredKey.test(key)
        && /^(?:https?:\/\/|\/|file-service:\/\/|sediment:\/\/|data:image\/)/i.test(text)
        && !seen.has(text)
      ) {
        seen.add(text);
        urls.push(text);
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, key, depth + 1));
      return;
    }

    if (typeof value === "object") {
      Object.entries(value).forEach(([childKey, childValue]) => {
        visit(childValue, childKey, depth + 1);
      });
    }
  }

  visit(metadata);
  return urls;
}

async function getChatGptAccessToken(origin) {
  if (!origin || !isTrustedChatGptOrigin(origin)) {
    return "";
  }

  if (accessTokenCache.has(origin)) {
    return accessTokenCache.get(origin);
  }

  try {
    const response = await fetchWithTimeout(new URL("/api/auth/session", origin).href, {
      timeoutMs: ACCESS_TOKEN_TIMEOUT_MS,
      credentials: "include",
      cache: "no-store",
      headers: {
        accept: "application/json"
      }
    });

    if (!response.ok) {
      accessTokenCache.set(origin, "");
      return "";
    }

    const session = await response.json();
    const token = extractAccessTokenFromSession(session);
    accessTokenCache.set(origin, token);
    return token;
  } catch (_) {
    accessTokenCache.set(origin, "");
    return "";
  }
}

function extractAccessTokenFromSession(session) {
  const candidates = [
    session?.accessToken,
    session?.access_token,
    session?.token,
    session?.user?.accessToken,
    session?.user?.access_token
  ];

  return String(candidates.find((value) => typeof value === "string" && value.length > 20) || "");
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Number(options.timeoutMs || IMAGE_FETCH_TIMEOUT_MS));

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("timeout");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function getTrustedChatGptOrigin(pageUrl) {
  try {
    const parsed = new URL(pageUrl || "");
    return isTrustedChatGptOrigin(parsed.origin) ? parsed.origin : "";
  } catch (_) {
    return "";
  }
}

function getUrlOrigin(url) {
  try {
    return new URL(url).origin;
  } catch (_) {
    return "";
  }
}

function isTrustedChatGptOrigin(origin) {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return hostname === "chatgpt.com" || hostname === "chat.openai.com";
  } catch (_) {
    return false;
  }
}

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}
