  // Uploaded and generated files. Every export records them as structured
  // references (fileRefs); only an export that asks for files (job option
  // "files") downloads them, with the page session, into assets/files/.
  // Each file fails on its own with a reason; nothing here fails the export.
  const CHATGPT_FILE_MAX_BYTES = 64 * 1024 * 1024;
  const CHATGPT_FILE_TOTAL_BYTES = 120 * 1024 * 1024;
  const CHATGPT_FILE_DOWNLOAD_CONCURRENCY = 4;
  const CHATGPT_FILE_DOWNLOAD_TIMEOUT_MS = 60_000;
  const CHATGPT_FILE_ATTEMPTS = 2;

  /**
   * Structured references to the non-image files one API message carries:
   * uploads (metadata.attachments) and files the model produced (sandbox: links).
   * Images are not listed here; the image pipeline owns them.
   */
  function collectApiFileRefs(message) {
    const refs = [];
    const messageId = message?.id || "";

    for (const attachment of getApiAttachmentObjects(message)) {
      const mimeType = String(attachment.mime_type || attachment.mimeType || attachment.content_type || "");
      const fileId = String(attachment.id || attachment.file_id || "");

      if (!fileId || /^image\//i.test(mimeType)) {
        continue;
      }

      refs.push({
        key: `upload:${fileId}`,
        kind: "upload",
        fileId,
        libraryFileId: String(attachment.library_file_id || ""),
        name: String(attachment.name || attachment.file_name || attachment.filename || fileId),
        mimeType,
        sizeBytes: Number(attachment.size ?? attachment.size_bytes) || 0,
        messageId
      });
    }

    const parts = isDilMessage(message)
      ? [getDilFallbackMarkdown(message)]
      : (Array.isArray(message?.content?.parts) ? message.content.parts : []);

    for (const part of parts) {
      if (typeof part !== "string") {
        continue;
      }

      for (const match of part.matchAll(/\[([^\]]+)\]\(sandbox:([^)\s]+)\)/g)) {
        const sandboxPath = decodeSandboxPath(match[2]);
        refs.push({
          key: `generated:${messageId}:${sandboxPath}`,
          kind: "generated",
          fileId: "",
          libraryFileId: "",
          name: sandboxPath.split("/").pop() || match[1],
          mimeType: "",
          sizeBytes: 0,
          messageId,
          sandboxPath
        });
      }
    }

    return refs;
  }

  function decodeSandboxPath(value) {
    const path = String(value || "").replace(/#.*$/, "");

    try {
      return decodeURIComponent(path);
    } catch (error) {
      // A path with a stray percent sign is used as written.
      return path;
    }
  }

  function uniqueFileRefs(refs) {
    const byKey = new Map();

    for (const ref of refs) {
      if (ref?.key && !byKey.has(ref.key)) {
        byKey.set(ref.key, ref);
      }
    }

    return [...byKey.values()];
  }

  /**
   * Downloads the files referenced by the exported messages.
   *
   * @returns {Promise<{ files: Record<string, string>, failures: Record<string, string> }>}
   *   data URIs and failure reasons keyed by the reference key.
   */
  async function downloadChatGptFiles(messages, options = {}) {
    const refs = uniqueFileRefs(messages.flatMap((message) => message?.fileRefs || []));
    const files = {};
    const failures = {};

    if (!refs.length) {
      return { files, failures };
    }

    const startedAt = Date.now();
    const accessToken = await getChatGptAccessToken(options.debugLog || null);
    const conversationId = getCurrentConversationId();
    let cursor = 0;
    let finished = 0;
    let totalBytes = 0;

    async function worker() {
      while (cursor < refs.length) {
        const ref = refs[cursor];
        cursor += 1;

        try {
          const blob = await fetchChatGptFile(ref, { accessToken, conversationId });

          if (totalBytes + blob.size > CHATGPT_FILE_TOTAL_BYTES) {
            throw new Error(`skipped: the ${formatFileMegabytes(CHATGPT_FILE_TOTAL_BYTES)} MB limit for files in one export was reached`);
          }

          totalBytes += blob.size;
          files[ref.key] = await blobToDataUri(blob);
        } catch (error) {
          failures[ref.key] = error?.message || String(error);
        }

        finished += 1;
        options.onProgress?.(`Downloading files ${finished}/${refs.length}...`);
      }
    }

    await Promise.all(Array.from({ length: Math.min(CHATGPT_FILE_DOWNLOAD_CONCURRENCY, refs.length) }, () => worker()));
    options.debugLog?.event?.("fileDownload.done", {
      files: refs.length,
      downloaded: Object.keys(files).length,
      failed: Object.keys(failures).length,
      bytes: totalBytes,
      durationMs: Date.now() - startedAt,
      failureSamples: [...new Set(Object.values(failures))].slice(0, 5)
    });
    return { files, failures };
  }

  function formatFileMegabytes(bytes) {
    return Math.round(bytes / (1024 * 1024));
  }

  async function fetchChatGptFile(ref, context) {
    let lastError = null;

    for (let attempt = 1; attempt <= CHATGPT_FILE_ATTEMPTS; attempt += 1) {
      try {
        return await fetchChatGptFileOnce(ref, context);
      } catch (error) {
        lastError = error;

        // A missing or forbidden file will not appear on a second try.
        if (!error?.retryable) {
          break;
        }

        await new Promise((resume) => setTimeout(resume, 800 * attempt));
      }
    }

    throw lastError;
  }

  function fileDownloadError(message, retryable = false) {
    const error = new Error(message);
    error.retryable = retryable;
    return error;
  }

  async function fetchChatGptFileOnce(ref, context) {
    const headers = context.accessToken ? { authorization: `Bearer ${context.accessToken}` } : {};
    let lookupUrl;

    if (ref.kind === "upload") {
      const query = new URLSearchParams({ inline: "false" });

      if (context.conversationId) {
        query.set("conversation_id", context.conversationId);
      }

      lookupUrl = `/backend-api/files/download/${encodeURIComponent(ref.fileId)}?${query}`;
    } else {
      if (!context.conversationId) {
        throw fileDownloadError("no conversation id to look the file up with");
      }

      const query = new URLSearchParams({ message_id: ref.messageId, sandbox_path: ref.sandboxPath });
      lookupUrl = `/backend-api/conversation/${encodeURIComponent(context.conversationId)}/interpreter/download?${query}`;
    }

    let resolved;

    try {
      resolved = await fetchWithTimeout(new URL(lookupUrl, location.origin).href, {
        timeoutMs: CHATGPT_FILE_DOWNLOAD_TIMEOUT_MS,
        credentials: "include",
        headers: { ...headers, accept: "application/json" }
      });
    } catch (error) {
      throw fileDownloadError(`lookup failed: ${error?.message || error}`, true);
    }

    const details = await resolved.json().catch(() => null);

    if (!resolved.ok) {
      throw fileDownloadError(describeFileLookupFailure(resolved.status, details), resolved.status === 429 || resolved.status >= 500);
    }

    const downloadUrl = String(details?.download_url || "");

    if (!downloadUrl) {
      throw fileDownloadError(`no download link (${details?.status || "unknown status"})`);
    }

    const declaredSize = Number(details?.file_size_bytes) || ref.sizeBytes || 0;

    if (declaredSize > CHATGPT_FILE_MAX_BYTES) {
      throw fileDownloadError(`skipped: ${formatFileMegabytes(declaredSize)} MB is over the ${formatFileMegabytes(CHATGPT_FILE_MAX_BYTES)} MB limit per file`);
    }

    let response;

    try {
      response = await fetchWithTimeout(new URL(downloadUrl, location.origin).href, {
        timeoutMs: CHATGPT_FILE_DOWNLOAD_TIMEOUT_MS,
        credentials: "include"
      });
    } catch (error) {
      throw fileDownloadError(`download failed: ${error?.message || error}`, true);
    }

    if (!response.ok) {
      throw fileDownloadError(`download HTTP ${response.status}`, response.status === 429 || response.status >= 500);
    }

    const blob = await response.blob();

    if (blob.size > CHATGPT_FILE_MAX_BYTES) {
      throw fileDownloadError(`skipped: ${formatFileMegabytes(blob.size)} MB is over the ${formatFileMegabytes(CHATGPT_FILE_MAX_BYTES)} MB limit per file`);
    }

    if (!blob.size) {
      throw fileDownloadError("the downloaded file is empty");
    }

    return blob;
  }

  // ChatGPT answers with {detail: {code, message}} or {detail: "..."}; the code
  // says why (conversation_deleted, "Library file not found", ...).
  function describeFileLookupFailure(status, details) {
    const detail = details?.detail;
    const reason = (typeof detail === "string" ? detail : detail?.code || detail?.message)
      || details?.error_code
      || details?.message
      || "";

    return `lookup HTTP ${status}${reason ? ` (${String(reason).slice(0, 80)})` : ""}`;
  }
