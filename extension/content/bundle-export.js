  // The selector panel exports one format: the local renderer's ZIP bundle
  // (Markdown, PDF, data files, and assets).
  async function exportSelectedMessages(messages, options = {}) {
    if (!messages.length) {
      throw new Error("Select at least one message to export.");
    }

    if (options.completeness && !options.completeness.complete && !options.allowIncomplete) {
      throw new Error(formatCaptureCompletenessError(options.completeness));
    }

    const exportedAt = new Date();
    const metadata = markdownBuilder.metadata(messages, exportedAt);
    const bundleResult = await downloadExportBundle(metadata, messages, exportedAt, {
      captureMode: options.captureMode,
      jobId: options.jobId,
      skipPdf: options.skipPdf,
      downloadFiles: options.downloadFiles,
      onProgress: options.onProgress
    });
    const filename = bundleResult.filename;

    return {
      ok: true,
      format: "bundle",
      filename,
      messageCount: messages.length,
      imagesEmbedded: bundleResult.imagesEmbedded || 0,
      imagesFailed: bundleResult.imagesFailed || 0,
      assetCount: bundleResult.assetCount || 0,
      bundleFiles: bundleResult.bundleFiles || ""
    };
  }


  function formatCaptureCompletenessError(report) {
    const issueText = (report?.issues || [])
      .map((issue) => issue.message)
      .filter(Boolean)
      .join(" ");
    return `Capture is incomplete and normal export is blocked.${issueText ? ` ${issueText}` : ""}`;
  }

  function createExportMetadata(messages, exportedAt = new Date()) {
    return {
      title: getConversationTitle(),
      source: location.href,
      exportedAt,
      exporterVersion: EXPORTER_VERSION,
      messageCount: messages.length
    };
  }

  async function createStructuredExportPayload(messages, exportedAt = new Date(), options = {}) {
    const portableMessages = messages.map((message, index) => createPortableMessageSnapshot(message, index));
    const captureMode = normalizeCaptureMode(options.captureMode);
    const assetStats = {
      imagesEmbedded: 0,
      imagesFailed: 0,
      imagesSkipped: 0
    };

    return {
      schemaVersion: 1,
      exporterVersion: EXPORTER_VERSION,
      title: getConversationTitle(),
      source: location.href,
      exportedAt: exportedAt.toISOString(),
      captureMode,
      messageCount: messages.length,
      assetStats,
      messages: portableMessages
    };
  }

  async function downloadExportBundle(metadata, messages, exportedAt = new Date(), options = {}) {
    const defaultFileName = markdownBuilder.filename(metadata.title, exportedAt, "zip");
    const payload = await createStructuredExportPayload(messages, exportedAt, {
      captureMode: options.captureMode
    });

    const pageImageDownloads = await downloadChatGptFileImages(payload.messages, {
      debugLog: options.debugLog,
      onProgress: options.onProgress
    });

    // Files are fetched only when the job asks for them. The references are
    // always in the payload, so the manifest says what was left out.
    const fileDownloads = options.downloadFiles
      ? await downloadChatGptFiles(payload.messages, {
        debugLog: options.debugLog,
        onProgress: options.onProgress
      })
      : null;
    payload.fileDownload = {
      requested: Boolean(fileDownloads),
      failures: fileDownloads?.failures || {}
    };

    options.onProgress?.("Rendering Markdown, PDF, and data files...");
    const result = await requestBackgroundBundleExport({
      exportPayload: payload,
      ...(fileDownloads ? { pageFiles: fileDownloads.files } : {}),
      ...(options.jobId ? { jobId: options.jobId } : {}),
      ...(options.skipPdf ? { skipPdf: true } : {}),
      fileName: defaultFileName,
      pageImages: pageImageDownloads.images,
      pageImageFailures: pageImageDownloads.failures
    });

    if (!result?.ok) {
      throw new Error(result?.error || "The local renderer could not export this conversation bundle.");
    }

    return {
      filename: result.filename || defaultFileName,
      rendererUrl: result.rendererUrl || DEFAULT_ADVANCED_PDF_RENDERER_URL,
      bundleFiles: result.bundleFiles || "",
      rendererTimings: result.rendererTimings || null,
      assetCount: Number(result.assetCount) || 0,
      imagesEmbedded: result.assetStats?.imagesEmbedded ?? payload.assetStats?.imagesEmbedded ?? 0,
      imagesFailed: result.assetStats?.imagesFailed ?? payload.assetStats?.imagesFailed ?? 0,
      assetStats: result.assetStats || null
    };
  }

  /**
   * Downloads ChatGPT file images (file-service:// and sediment:// pointers)
   * with the page's session. ChatGPT resolves a pointer through
   * /backend-api/files/download/{id}, which returns a signed estuary URL that
   * also needs the session cookies, so the extension service worker cannot
   * fetch these images itself.
   *
   * @returns {Promise<{ images: Record<string, string>, failures: Record<string, string> }>}
   *   data URIs and failure reasons keyed by the Markdown image source.
   */
  async function downloadChatGptFileImages(messages, options = {}) {
    const sources = uniqueStrings(messages.flatMap((message) => [
      ...extractMarkdownImageUrls(message?.markdown),
      ...extractMarkdownImageUrls(message?.thinkingMarkdown)
    ]).filter((source) => getChatGptFileImageId(source) || isChatGptSessionImageUrl(source)));
    const images = {};
    const failures = {};

    if (!sources.length) {
      return { images, failures };
    }

    const startedAt = Date.now();
    const accessToken = await getChatGptAccessToken(options.debugLog || null);
    const conversationId = getCurrentConversationId();
    let cursor = 0;
    let finished = 0;

    async function worker() {
      while (cursor < sources.length) {
        const source = sources[cursor];
        cursor += 1;

        try {
          const fileId = getChatGptFileImageId(source);
          const blob = fileId
            ? await fetchChatGptFileImage(fileId, { accessToken, conversationId })
            : await fetchChatGptSessionImage(source);
          images[source] = await blobToDataUri(blob);
        } catch (error) {
          failures[source] = error?.message || String(error);
        }

        finished += 1;
        options.onProgress?.(`Downloading images ${finished}/${sources.length}...`);
      }
    }

    await Promise.all(Array.from({ length: Math.min(BUNDLE_IMAGE_DOWNLOAD_CONCURRENCY, sources.length) }, () => worker()));
    options.debugLog?.event?.("assetDownload.done", {
      images: sources.length,
      downloaded: Object.keys(images).length,
      failed: Object.keys(failures).length,
      durationMs: Date.now() - startedAt,
      failureSamples: [...new Set(Object.values(failures))].slice(0, 5)
    });
    return { images, failures };
  }

  // Images the ChatGPT page shows from its own origin (estuary content and
  // file downloads captured by Full mode) are signed for the page session.
  function isChatGptSessionImageUrl(source) {
    try {
      const url = new URL(source);
      return url.origin === location.origin && url.pathname.startsWith("/backend-api/");
    } catch (error) {
      // Relative or malformed references are not ChatGPT session URLs.
      return false;
    }
  }

  async function fetchChatGptSessionImage(source) {
    const response = await fetchWithTimeout(source, {
      timeoutMs: BUNDLE_IMAGE_DOWNLOAD_TIMEOUT_MS,
      credentials: "include"
    });
    const contentType = response.headers.get("content-type") || "";

    if (!response.ok) {
      throw new Error(`image download HTTP ${response.status}`);
    }

    if (!/^image\//i.test(contentType)) {
      throw new Error(`image download returned ${contentType || "no content type"}`);
    }

    return response.blob();
  }

  function getChatGptFileImageId(source) {
    return String(source || "").match(/^(?:file-service|sediment):\/\/([^/?#)\s]+)/i)?.[1] || "";
  }

  async function fetchChatGptFileImage(fileId, context) {
    const headers = context.accessToken ? { authorization: `Bearer ${context.accessToken}` } : {};
    const query = new URLSearchParams({ inline: "false" });

    if (context.conversationId) {
      query.set("conversation_id", context.conversationId);
    }

    const resolveUrl = new URL(`/backend-api/files/download/${encodeURIComponent(fileId)}?${query}`, location.origin);
    const resolved = await fetchWithTimeout(resolveUrl.href, {
      timeoutMs: BUNDLE_IMAGE_DOWNLOAD_TIMEOUT_MS,
      credentials: "include",
      headers: { ...headers, accept: "application/json" }
    });

    if (!resolved.ok) {
      throw new Error(`file download lookup HTTP ${resolved.status}`);
    }

    const details = await resolved.json();
    const downloadUrl = String(details?.download_url || "");

    if (!downloadUrl) {
      throw new Error(`file download lookup returned no URL (${details?.status || "unknown status"})`);
    }

    const response = await fetchWithTimeout(new URL(downloadUrl, location.origin).href, {
      timeoutMs: BUNDLE_IMAGE_DOWNLOAD_TIMEOUT_MS,
      credentials: "include"
    });
    const contentType = response.headers.get("content-type") || "";

    if (!response.ok) {
      throw new Error(`image download HTTP ${response.status}`);
    }

    if (!/^image\//i.test(contentType)) {
      throw new Error(`image download returned ${contentType || "no content type"}`);
    }

    return response.blob();
  }

  function blobToDataUri(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Could not read image bytes."));
      reader.readAsDataURL(blob);
    });
  }

  async function requestBackgroundBundleExport(body) {
    if (typeof chrome === "undefined" || !chrome.runtime?.connect) {
      throw new Error("The Convo Vault extension background service is unavailable.");
    }

    const serializedBody = JSON.stringify(body);
    const totalBytes = new TextEncoder().encode(serializedBody).byteLength;

    if (totalBytes > MAX_LOCAL_RENDERER_REQUEST_BYTES) {
      throw new Error(`This export request is ${totalBytes} bytes and exceeds the ${MAX_LOCAL_RENDERER_REQUEST_BYTES} byte local renderer limit.`);
    }

    const port = chrome.runtime.connect({ name: LOCAL_RENDERER_BUNDLE_PORT });

    return new Promise((resolve, reject) => {
      let settled = false;

      const settle = (handler, value) => {
        if (settled) {
          return;
        }
        settled = true;
        port.onMessage.removeListener(onMessage);
        port.onDisconnect.removeListener(onDisconnect);
        handler(value);
      };

      const onMessage = (message) => {
        if (message?.type === "KEEPALIVE") {
          return;
        }

        if (message?.type === "RESULT") {
          settle(resolve, message.result || { ok: false, error: "The local renderer returned an empty result." });
          try {
            port.disconnect();
          } catch (_) {
            // The background service may already have closed the completed stream.
          }
        }
      };

      const onDisconnect = () => {
        if (settled) {
          return;
        }
        const detail = chrome.runtime.lastError?.message || "The extension background service disconnected before the export completed.";
        settle(reject, new Error(detail));
      };

      port.onMessage.addListener(onMessage);
      port.onDisconnect.addListener(onDisconnect);

      port.postMessage({
        type: "START",
        totalCharacters: serializedBody.length,
        totalBytes
      });

      void sendChunks();

      async function sendChunks() {
        try {
          let chunkIndex = 0;
          for (let offset = 0; offset < serializedBody.length; offset += LOCAL_RENDERER_REQUEST_CHUNK_CHARACTERS) {
            port.postMessage({
              type: "CHUNK",
              data: serializedBody.slice(offset, offset + LOCAL_RENDERER_REQUEST_CHUNK_CHARACTERS)
            });
            chunkIndex += 1;

            if (chunkIndex % 8 === 0) {
              await new Promise((resume) => setTimeout(resume, 0));
            }
          }
          port.postMessage({ type: "END" });
        } catch (error) {
          settle(reject, error);
          try {
            port.disconnect();
          } catch (_) {
            // The port may already be closed by the background service.
          }
        }
      }
    });
  }
