  function reconcileHybridMessages(fastMessages, fullMessages, debugLog = null, manifest = null) {
    const fullMatches = new Map();
    const fullOnlyCandidates = [];
    const substantiveFullOnlyCandidates = [];
    const usedFullMessages = new Set();
    let enrichedMessages = 0;

    for (const fullMessage of fullMessages) {
      if (isLikelyFullOnlyNonMessageCandidate(fullMessage)) {
        fullOnlyCandidates.push({
          role: fullMessage.role,
          order: fullMessage.order,
          reason: "timestamp-or-non-message-divider",
          preview: fullMessage.preview || makeMessagePreview(fullMessage)
        });
        continue;
      }

      const key = getHybridMessageKey(fullMessage, manifest);

      if (!key) {
        const candidate = {
          role: fullMessage.role,
          order: fullMessage.order,
          reason: "missing-order-or-role",
          preview: fullMessage.preview || makeMessagePreview(fullMessage)
        };
        fullOnlyCandidates.push(candidate);
        substantiveFullOnlyCandidates.push({
          ...candidate,
          identity: getCapturedMessageIdentity(fullMessage),
          imageCount: fullMessage.imageCount || countMarkdownImages(`${fullMessage.markdown || ""}\n${fullMessage.thinkingMarkdown || ""}`)
        });
        continue;
      }

      const existing = fullMatches.get(key);
      fullMatches.set(key, existing && isMessageRicher(existing, fullMessage) ? existing : fullMessage);
    }

    const messages = fastMessages.map((fastMessage, index) => {
      const key = getHybridMessageKey(fastMessage, manifest);
      const fullMessage = key ? fullMatches.get(key) : null;

      if (!fullMessage) {
        return {
          ...fastMessage,
          captureMode: "hybrid",
          hybridSource: "fast"
        };
      }

      usedFullMessages.add(fullMessage);
      const merged = mergeHybridMessage(fastMessage, fullMessage, index);

      if (merged.hybridSource !== "fast") {
        enrichedMessages += 1;
      }

      return merged;
    });

    for (const fullMessage of fullMatches.values()) {
      if (usedFullMessages.has(fullMessage)) {
        continue;
      }

      fullOnlyCandidates.push({
        role: fullMessage.role,
        order: fullMessage.order,
        reason: "not-in-fast-canonical-path",
        preview: fullMessage.preview || makeMessagePreview(fullMessage)
      });
      substantiveFullOnlyCandidates.push({
        role: fullMessage.role,
        order: fullMessage.order,
        identity: getCapturedMessageIdentity(fullMessage),
        imageCount: fullMessage.imageCount || countMarkdownImages(`${fullMessage.markdown || ""}\n${fullMessage.thinkingMarkdown || ""}`),
        preview: fullMessage.preview || makeMessagePreview(fullMessage)
      });
    }

    const ignoredSamples = fullOnlyCandidates.slice(0, 12);
    const report = {
      fastMessages: fastMessages.length,
      fullCandidates: fullMessages.length,
      mergedMessages: messages.length,
      matchedFullCandidates: usedFullMessages.size,
      enrichedMessages,
      ignoredFullOnlyMessages: fullOnlyCandidates.length,
      ignoredSamples,
      substantiveFullOnlyMessages: substantiveFullOnlyCandidates.length,
      substantiveFullOnlyAssistantMessages: substantiveFullOnlyCandidates.filter((candidate) => candidate.role === "assistant").length,
      substantiveSamples: substantiveFullOnlyCandidates.slice(0, 12)
    };

    debugLog?.event("hybridCapture.fullOnlyCandidates", {
      count: fullOnlyCandidates.length,
      samples: ignoredSamples,
      substantiveCount: substantiveFullOnlyCandidates.length,
      substantiveSamples: substantiveFullOnlyCandidates.slice(0, 12)
    });

    return {
      messages,
      report
    };
  }

  function mergeHybridMessage(fastMessage, fullMessage, index = 0) {
    const markdownSource = chooseHybridMarkdownSource(fastMessage, fullMessage);
    const thinkingSource = chooseRicherMarkdown(
      fastMessage.thinkingMarkdown,
      fullMessage.thinkingMarkdown
    ) === "second" ? "full" : "fast";
    const markdown = markdownSource === "full" ? fullMessage.markdown : fastMessage.markdown;
    const thinkingMarkdown = thinkingSource === "full" ? fullMessage.thinkingMarkdown : fastMessage.thinkingMarkdown;
    const hybridSource = markdownSource === "full" || thinkingSource === "full" ? "fast+full" : "fast";
    const finalImageCount = countMarkdownImages(`${markdown}\n${thinkingMarkdown}`);
    const imagesEmbedded = Math.min(finalImageCount, Math.max(fastMessage.imagesEmbedded || 0, fullMessage.imagesEmbedded || 0));
    const imagesFailed = Math.max(fastMessage.imagesFailed || 0, fullMessage.imagesFailed || 0);
    const failedImageReferences = Math.min(Math.max(0, finalImageCount - imagesEmbedded), imagesFailed);
    const imagesDeferred = Math.min(
      Math.max(0, finalImageCount - imagesEmbedded - failedImageReferences),
      Math.max(fastMessage.imagesDeferred || 0, fullMessage.imagesDeferred || 0)
    );

    return {
      ...fastMessage,
      sourceNode: fullMessage.sourceNode || fastMessage.sourceNode || null,
      sourceTurnId: fastMessage.sourceTurnId || fullMessage.sourceTurnId || "",
      sourceTurnContainer: fastMessage.sourceTurnContainer || fullMessage.sourceTurnContainer || "",
      sourceTestId: fastMessage.sourceTestId || fullMessage.sourceTestId || "",
      timestamp: fastMessage.timestamp || fullMessage.timestamp || "",
      markdown,
      thinkingMarkdown,
      preview: truncatePreview(cleanMarkdown(`${markdown}\n${thinkingMarkdown}`), 180) || fastMessage.preview || fullMessage.preview || "",
      codeBlockCount: Math.max(fastMessage.codeBlockCount || 0, fullMessage.codeBlockCount || 0),
      fileCount: Math.max(fastMessage.fileCount || 0, fullMessage.fileCount || 0),
      imageCount: finalImageCount,
      imagesEmbedded,
      imagesDeferred,
      imagesFailed,
      captureMode: "hybrid",
      hybridSource,
      hybridMarkdownSource: markdownSource,
      hybridThinkingSource: thinkingSource,
      turnNumber: normalizeTurnNumber(fastMessage.turnNumber, index),
      order: fastMessage.order ?? index + 1,
      conversationOrder: fastMessage.conversationOrder ?? fastMessage.order ?? index + 1,
      originalOrder: fastMessage.originalOrder ?? fastMessage.order ?? index + 1
    };
  }

  function getHybridMessageKey(message, manifest = null) {
    // Message ids pair Fast and Full copies exactly; order numbers are the
    // fallback for DOM messages that expose no ChatGPT message id.
    const manifestIdentity = manifest ? resolveManifestIdentity(manifest, message) : "";

    if (manifestIdentity) {
      return manifestIdentity;
    }

    const order = Number(message?.conversationOrder ?? message?.order ?? message?.turnNumber);
    const role = String(message?.role || "").toLowerCase();

    if (!Number.isFinite(order) || order <= 0 || !["user", "assistant"].includes(role)) {
      return "";
    }

    return `${Math.floor(order)}|${role}`;
  }

  function chooseHybridMarkdownSource(fastMessage, fullMessage) {
    const fastMarkdown = String(fastMessage?.markdown || "");
    const fullMarkdown = String(fullMessage?.markdown || "");

    if (!fullMarkdown.trim()) {
      return "fast";
    }

    if (!fastMarkdown.trim()) {
      return "full";
    }

    if (hasPortableImagePointers(fastMarkdown) && !hasPortableImagePointers(fullMarkdown)) {
      return "fast";
    }

    return chooseRicherMarkdown(fastMarkdown, fullMarkdown) === "second" ? "full" : "fast";
  }

  function chooseRicherMarkdown(first, second) {
    const left = String(first || "").trim();
    const right = String(second || "").trim();

    if (!right) {
      return "first";
    }

    if (!left) {
      return "second";
    }

    const leftText = normalizeMessageDedupeText(left);
    const rightText = normalizeMessageDedupeText(right);

    if (rightText.length > leftText.length + Math.max(180, Math.floor(leftText.length * 0.18))) {
      return "second";
    }

    return "first";
  }

  function hasPortableImagePointers(markdown) {
    return /!\[[^\]]*]\((?:sediment|file-service):\/\/[^)]+\)/i.test(String(markdown || ""));
  }

  function isLikelyFullOnlyNonMessageCandidate(message) {
    const text = [message?.markdown, message?.thinkingMarkdown]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (!text) {
      return false;
    }

    return isTimestampDividerText(text) || isLikelyNonMessageMarkdown(message);
  }
