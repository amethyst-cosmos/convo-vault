  function createCaptureCancelledError(reason = "Capture cancelled.") {
    const message = typeof reason === "string"
      ? reason
      : reason?.message || "Capture cancelled.";
    const error = new Error(message);
    error.name = "CaptureCancelledError";
    error.code = "CAPTURE_CANCELLED";
    return error;
  }

  function isCaptureCancelledError(error) {
    return error?.name === "CaptureCancelledError"
      || error?.code === "CAPTURE_CANCELLED";
  }

  function throwIfCaptureCancelled(signal) {
    if (signal?.aborted) {
      throw createCaptureCancelledError(signal.reason);
    }
  }

  function createValidatedCaptureResult(result, options = {}) {
    throwIfCaptureCancelled(options.signal);
    const messages = result?.messages || [];
    const captureMode = normalizeCaptureMode(result?.captureMode);
    if (!result?.manifest) {
      throw new Error("ChatGPT did not return a message list to check the export against.");
    }

    const completeness = buildManifestCompletenessReport(messages, result.manifest, {
      captureMode,
      reconciliationReport: null
    });

    result?.debugLog?.event("capture.completeness", completeness);
    return {
      ...result,
      captureMode,
      completeness
    };
  }

  function getCaptureImageCompletenessStats(messages) {
    const urls = [];
    let embedded = 0;
    let deferred = 0;
    let failures = 0;

    for (const message of messages) {
      const markdown = `${message?.markdown || ""}\n${message?.thinkingMarkdown || ""}`;
      urls.push(...extractMarkdownImageUrls(markdown));
      embedded += countEmbeddedMarkdownImages(markdown);
      deferred += Math.max(0, Number(message?.imagesDeferred || 0));
      failures += Math.max(0, Number(message?.imagesFailed || 0));
    }

    return {
      references: urls.length,
      uniqueIdentities: new Set(urls.map(getMarkdownImageIdentity).filter(Boolean)).size,
      embedded,
      deferred,
      failures
    };
  }

  function extractMarkdownImageUrls(markdown) {
    return [...String(markdown || "").matchAll(/!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)]
      .map((match) => match[1] || "")
      .filter(Boolean);
  }

  function normalizeCaptureMode(value) {
    const mode = String(value || "").toLowerCase();
    return ["fast", "full", "hybrid"].includes(mode) ? mode : "fast";
  }

  function normalizeTurnNumber(value, index = 0) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : index + 1;
  }

  function getRoleSequenceDiagnostics(messages) {
    const sameRolePairs = [];

    for (let index = 1; index < messages.length; index += 1) {
      if (messages[index]?.role === messages[index - 1]?.role) {
        sameRolePairs.push({
          previousOrder: messages[index - 1].order,
          order: messages[index].order,
          role: messages[index].role,
          previousPreview: messages[index - 1].preview || makeMessagePreview(messages[index - 1]),
          preview: messages[index].preview || makeMessagePreview(messages[index])
        });
      }
    }

    const userCount = messages.filter((message) => message.role === "user").length;
    const assistantCount = messages.filter((message) => message.role === "assistant").length;

    return {
      totalMessages: messages.length,
      userMessages: userCount,
      assistantMessages: assistantCount,
      startsWithUser: messages[0]?.role === "user",
      endsWithAssistant: messages[messages.length - 1]?.role === "assistant",
      balancedPairs: userCount === assistantCount && messages[0]?.role === "user" && messages[messages.length - 1]?.role === "assistant",
      sameRolePairs
    };
  }
