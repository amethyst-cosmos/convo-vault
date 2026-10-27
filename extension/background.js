const IMAGE_FETCH_TIMEOUT_MS = 6000;
const SETTINGS_STORAGE_KEY = "convoVaultSettings";
const DEFAULT_RENDERER_PORT = 38474;
const LOCAL_RENDERER_BUNDLE_PORT = "CONVO_VAULT_LOCAL_RENDERER_BUNDLE";
const MAX_LOCAL_RENDERER_REQUEST_BYTES = 256 * 1024 * 1024;
const LOCAL_RENDERER_KEEPALIVE_MS = 15000;
const LOCAL_RENDERER_ASSET_CONCURRENCY = 4;

const EXPORT_JOB_ID_PATTERN = /^[a-f0-9]{48}$/;

// Export jobs: a local program (the CLI or an agent skill) opens a ChatGPT tab
// with #convo-vault-job=<id>. The content script claims the job here, reports
// progress, and the finished bundle goes back to the local program instead of
// the browser's Downloads folder.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "CONVO_VAULT_JOB" || !isTrustedExporterSender(sender)) {
    return false;
  }

  handleJobMessage(message, sender)
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));

  return true;
});

async function handleJobMessage(message, sender) {
  const jobId = String(message.jobId || "");

  if (!EXPORT_JOB_ID_PATTERN.test(jobId)) {
    return { ok: false, error: "Invalid export job id." };
  }

  const settings = await loadRendererSettings();
  const rendererUrl = `http://127.0.0.1:${settings.port}`;

  if (message.action === "claim") {
    const response = await fetch(`${rendererUrl}/jobs/${jobId}/claim`, { method: "POST" });
    const result = await readRendererJson(response);

    if (!response.ok || !result?.ok) {
      return { ok: false, error: result?.error || `Claim failed (${response.status}).` };
    }

    // The renderer hands out its own token so a job works without opening the popup.
    await saveBackendToken(String(result.token || ""));
    return { ok: true, options: result.options || {} };
  }

  if (message.action === "status") {
    await fetch(`${rendererUrl}/jobs/${jobId}/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Convo-Vault-Token": settings.backendToken
      },
      body: JSON.stringify({
        state: message.state === "error" ? "error" : "working",
        message: String(message.message || "")
      })
    });
    return { ok: true };
  }

  if (message.action === "result") {
    // A job that returns data instead of a bundle, such as a list of conversations.
    const response = await fetch(`${rendererUrl}/jobs/${jobId}/result`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Convo-Vault-Token": settings.backendToken
      },
      body: JSON.stringify({ data: message.data, message: String(message.message || "") })
    });
    return { ok: response.ok, error: response.ok ? "" : `The renderer refused the result (${response.status}).` };
  }

  if (message.action === "reload-extension") {
    // Reply first: the service worker restarts right after.
    setTimeout(() => chrome.runtime.reload(), 300);
    return { ok: true };
  }

  if (message.action === "close-tab" && sender?.tab?.id) {
    chrome.tabs.remove(sender.tab.id);
    return { ok: true };
  }

  return { ok: false, error: "Unknown export job action." };
}

function saveBackendToken(token) {
  return new Promise((resolve) => {
    chrome.storage.local.get([SETTINGS_STORAGE_KEY], (result) => {
      const settings = result?.[SETTINGS_STORAGE_KEY] || {};
      if (settings.backendToken === token) {
        resolve();
        return;
      }
      chrome.storage.local.set({
        [SETTINGS_STORAGE_KEY]: { ...settings, backendToken: token }
      }, resolve);
    });
  });
}

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
  const pageFiles = readPageImageMap(body?.pageFiles);
  if (body && typeof body === "object") {
    delete body.pageImages;
    delete body.pageImageFailures;
    delete body.pageFiles;
  }

  try {
    const imageSources = collectBundleImageSources(body?.exportPayload?.messages);
    if (imageSources.length || pageFiles.size) {
      const session = await createLocalExportSession(rendererUrl, requestHeaders);
      exportSessionId = session.sessionId;
      body.exportSessionId = exportSessionId;
    }

    if (pageFiles.size) {
      const fileFailures = await stageBundleFiles({ rendererUrl, requestHeaders, exportSessionId, pageFiles });
      const download = body.exportPayload.fileDownload || (body.exportPayload.fileDownload = { requested: true, failures: {} });
      Object.assign(download.failures ||= {}, fileFailures);
    }

    if (imageSources.length) {
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
  // A job's bundle is collected from the renderer by the program that created it.
  const isJob = EXPORT_JOB_ID_PATTERN.test(String(body?.jobId || ""));
  const browserDownloadId = isJob ? null : await downloadPreparedBundle(downloadUrl.href, filename);

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

// Files go to the renderer one request each, keyed by the hash of their
// reference key, so the renderer can match them to the payload's fileRefs.
async function stageBundleFiles(options) {
  const entries = [...options.pageFiles.entries()];
  const failures = {};
  let cursor = 0;

  async function worker() {
    while (cursor < entries.length) {
      const [refKey, dataUri] = entries[cursor];
      cursor += 1;

      try {
        const blob = dataUriToBlob(dataUri);
        const response = await fetch(`${options.rendererUrl}/export-sessions/${options.exportSessionId}/files/${await sha256Text(refKey)}`, {
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
      } catch (error) {
        failures[refKey] = `could not be stored: ${error.message || error}`;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(LOCAL_RENDERER_ASSET_CONCURRENCY, entries.length) }, () => worker()));
  return failures;
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

  return fetchImageAsBlob(source);
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

// ChatGPT-hosted images (file-service://, sediment://, and chatgpt.com
// /backend-api/ URLs) need the page session, so the content script downloads
// them and sends the bytes. The service worker only resolves data URIs and
// fetches public third-party images, without cookies.
async function fetchImageAsBlob(src) {
  if (!src) {
    throw new Error("Missing image URL.");
  }

  if (src.startsWith("data:")) {
    return dataUriToBlob(src);
  }

  if (!/^https?:\/\//i.test(src)) {
    throw new Error("ChatGPT file reference was not downloaded by the page.");
  }

  const response = await fetchWithTimeout(src, {
    timeoutMs: IMAGE_FETCH_TIMEOUT_MS,
    credentials: "omit"
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";

  if (contentType && !/^image\//i.test(contentType) && !/octet-stream/i.test(contentType)) {
    throw new Error(`unexpected content-type ${contentType}`);
  }

  const blob = await response.blob();
  return blob.type ? blob : new Blob([blob], { type: contentType || "application/octet-stream" });
}

function dataUriToBlob(dataUri) {
  // Files can carry type parameters ("text/csv;charset=utf-8"); they are dropped.
  const match = String(dataUri || "").match(/^data:([^;,]+)?(?:;[^;,]*)*;base64,([a-z0-9+/=\r\n]+)$/i);
  if (!match) {
    throw new Error("Unsupported data URI.");
  }

  const binary = atob(match[2].replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: match[1] || "application/octet-stream" });
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
