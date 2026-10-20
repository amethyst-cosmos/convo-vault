  // The conversation is read from ChatGPT's own API (see capture-fast.js). The
  // page is never scrolled or clicked, so a long conversation takes seconds and
  // works the same in a background tab.

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "CONVO_VAULT_EXPORT_CURRENT") {
      return false;
    }

    exportCurrentConversation()
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));

    return true;
  });

  const markdownBuilder = {
    metadata: createExportMetadata,
    filename: makeFilename
  };

  /**
   * Captures the open conversation, checks it against ChatGPT's message list and
   * exports it as a bundle. The integrity gate blocks an incomplete capture
   * unless allowIncomplete is set.
   */
  async function exportCurrentConversation(options = {}) {
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
    const capture = await collectConversationMessages({ onProgress });
    const messages = capture.messages || [];

    if (!messages.length) {
      throw new Error("The conversation has no messages to export.");
    }

    onProgress(`Captured ${messages.length} messages. Rendering the bundle...`);
    return exportSelectedMessages(messages, {
      captureMode: capture.captureMode,
      completeness: capture.completeness,
      allowIncomplete: options.allowIncomplete === true,
      jobId: options.jobId,
      skipPdf: options.skipPdf === true,
      onProgress
    });
  }

  async function collectConversationMessages(options = {}) {
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
    const debugLog = createDebugLog({ captureMode: "fast" });

    try {
      const { messages, manifest } = await collectFastCanonicalMessages(debugLog, onProgress, {
        finishDebug: true
      });
      return createValidatedCaptureResult({
        messages,
        manifest,
        debugLog,
        captureMode: "fast"
      });
    } catch (error) {
      debugLog.event("fastCapture.failed", {
        error: error?.message || String(error)
      });
      throw new Error(`Could not read the conversation from ChatGPT. Details: ${error?.message || error}`);
    }
  }

  async function collectFastCanonicalMessages(debugLog, onProgress, options = {}) {
    onProgress("Reading the conversation from ChatGPT...");
    const { messages, manifest } = await collectFastConversationMessages(debugLog, { onProgress });

    if (!messages.length) {
      debugLog.event("fastCapture.empty", {});
      throw new Error("ChatGPT returned no messages for this conversation.");
    }

    if (options.finishDebug !== false) {
      debugLog.finish(messages);
    }

    onProgress(`Found ${messages.length} messages.`);
    return { messages, manifest };
  }
