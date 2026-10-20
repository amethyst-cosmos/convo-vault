  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "OPEN_CHATGPT_EXPORT_SELECTOR") {
      return false;
    }

    openMessageSelectorPanel()
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));

    return true;
  });

  const messageExtractor = {
    collect: collectConversationMessages,
    preview: makeMessagePreview,
    loadOlderMessages,
    walkConversation,
    createDebugLog
  };

  const markdownBuilder = {
    metadata: createExportMetadata,
    filename: makeFilename
  };
  const messageSelectorUI = createMessageSelectorUI();

  async function openMessageSelectorPanel() {
    return messageSelectorUI.open({
      loadMessages: async (onProgress, options = {}) => {
        return messageExtractor.collect({
          onProgress,
          captureMode: options.captureMode,
          signal: options.signal
        });
      },
      exportMessages: (messages, options) => exportSelectedMessages(messages, options)
    });
  }

  async function collectConversationMessages(options = {}) {
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
    const captureMode = normalizeCaptureMode(options.captureMode);
    const signal = options.signal || null;
    const debugLog = createDebugLog({ captureMode });
    debugLog.event("capture.mode", { captureMode });
    throwIfCaptureCancelled(signal);

    if (captureMode === "fast") {
      try {
        const { messages, manifest } = await collectFastCanonicalMessages(debugLog, onProgress, {
          finishDebug: true,
          signal
        });
        return createValidatedCaptureResult({
          messages,
          manifest,
          debugLog,
          captureMode
        }, { signal });
      } catch (error) {
        if (isCaptureCancelledError(error)) {
          throw error;
        }
        debugLog.event("fastCapture.failed", {
          error: error?.message || String(error)
        });
        throw new Error(`Fast capture failed. Switch to Full mode if you want to scan the page. Details: ${error?.message || error}`);
      }
    }

    if (captureMode === "hybrid") {
      const result = await collectHybridConversationMessages(debugLog, onProgress, { signal });
      return createValidatedCaptureResult(result, { signal });
    }

    const manifest = await loadOptionalConversationManifest(debugLog, signal);
    const messages = await collectFullDomMessages(debugLog, onProgress, {
      finishDebug: true,
      manifest,
      signal
    });
    return createValidatedCaptureResult({
      messages,
      manifest,
      debugLog,
      captureMode: "full"
    }, { signal });
  }

  async function loadOptionalConversationManifest(debugLog, signal = null) {
    try {
      return await fetchConversationManifest(debugLog, { signal });
    } catch (error) {
      if (isCaptureCancelledError(error)) {
        throw error;
      }

      debugLog.event("conversationManifest.unavailable", {
        error: error?.message || String(error)
      });
      return null;
    }
  }

  async function collectFastCanonicalMessages(debugLog, onProgress, options = {}) {
    const signal = options.signal || null;
    throwIfCaptureCancelled(signal);
    onProgress("Loading conversation data...");
    const { messages, manifest } = await collectFastConversationMessages(debugLog, { signal, onProgress });
    throwIfCaptureCancelled(signal);

    if (!messages.length) {
      debugLog.event("fastCapture.empty", {});
      throw new Error("Fast capture returned no messages. Switch to Full mode to scan the page.");
    }

    onProgress("Checking visible thinking details...");
    await enrichVisibleThinkingFlyouts(messages, debugLog, {
      autoOpenLimit: FAST_THINKING_FLYOUT_AUTO_OPEN_LIMIT,
      allowGlobalFallback: false,
      requireMountedRoot: true,
      settleTimeoutMs: FAST_THINKING_FLYOUT_SETTLE_TIMEOUT_MS,
      signal
    });
    throwIfCaptureCancelled(signal);
    debugLog.mark("enrichedFastThinkingFlyouts");

    if (options.finishDebug !== false) {
      debugLog.finish(messages);
    }

    onProgress(`Found ${messages.length} messages with Fast capture.`);
    return { messages, manifest };
  }

  async function collectHybridConversationMessages(debugLog, onProgress, options = {}) {
    const signal = options.signal || null;
    try {
      const { messages: fastMessages, manifest } = await collectFastCanonicalMessages(debugLog, onProgress, {
        finishDebug: false,
        signal
      });
      throwIfCaptureCancelled(signal);
      debugLog.event("hybridCapture.fastReady", {
        messageCount: fastMessages.length
      });
      onProgress(`Fast found ${fastMessages.length} canonical messages. Scanning page for enrichments...`);
      let fullMessages = [];

      try {
        fullMessages = await collectFullDomMessages(debugLog, onProgress, {
          finishDebug: false,
          progressPrefix: "Full enrichment: ",
          expectedTurnCount: fastMessages.length,
          expectedOrders: fastMessages.map((m) => Number(m.order)).filter((order) => Number.isFinite(order) && order > 0),
          manifest,
          signal
        });
      } catch (error) {
        if (isCaptureCancelledError(error)) {
          throw error;
        }
        debugLog.event("hybridCapture.fullFailed", {
          error: error?.message || String(error)
        });
        onProgress(`Full enrichment failed; using ${fastMessages.length} Fast canonical messages.`);
      }

      const reconciliation = reconcileHybridMessages(fastMessages, fullMessages, debugLog, manifest);
      const messages = reconciliation.messages;
      throwIfCaptureCancelled(signal);
      debugLog.event("hybridCapture.reconciled", reconciliation.report);
      debugLog.finish(messages);
      onProgress(`Hybrid ready. ${messages.length} canonical messages, ${reconciliation.report.enrichedMessages} enriched, ${reconciliation.report.ignoredFullOnlyMessages} Full-only candidate(s) ignored.`);
      return {
        messages,
        manifest,
        debugLog,
        captureMode: "hybrid",
        reconciliationReport: reconciliation.report
      };
    } catch (error) {
      if (isCaptureCancelledError(error)) {
        throw error;
      }
      debugLog.event("hybridCapture.failed", {
        error: error?.message || String(error)
      });
      throw new Error(`Hybrid capture failed. Use Fast for API-only export or Full for DOM-only debugging. Details: ${error?.message || error}`);
    }
  }

  async function collectFullDomMessages(debugLog, onProgress, options = {}) {
    const signal = options.signal || null;
    throwIfCaptureCancelled(signal);
    const progressPrefix = options.progressPrefix || "";
    const scrollTarget = getBestScrollTarget();
    const originalScrollTop = getScrollTop(scrollTarget);
    const collector = createMessageCollector(debugLog);
    const expectedTurnCount = Number(options.expectedTurnCount || 0);
    const expectedOrders = Array.isArray(options.expectedOrders) ? options.expectedOrders : null;
    const scanBudget = getConversationScanBudget({ expectedTurnCount });
    const scanDeadline = Date.now() + scanBudget.maxScanMs;
    const walkDeadline = scanDeadline - scanBudget.hydrateReservedMs;
    debugLog.setScrollTarget(scrollTarget);
    debugLog.event("scan.budget", scanBudget);

    try {
      // ChatGPT can lazy-load older turns. First move upward until the top is
      // stable, then walk downward and capture each visible batch.
      debugLog.mark("start");
      onProgress(`${progressPrefix}Loading older messages...`);
      await loadOlderMessages(scrollTarget, collector, debugLog, scanDeadline, scanBudget, signal);
      throwIfCaptureCancelled(signal);
      debugLog.mark("loadedOlderMessages");
      onProgress(`${progressPrefix}Scanning conversation...`);
      await walkConversation(scrollTarget, collector, debugLog, walkDeadline, scanBudget, signal);
      throwIfCaptureCancelled(signal);
      debugLog.mark("walkedConversation");
      onProgress(`${progressPrefix}Hydrating virtualized messages...`);
      const hydrateDeadline = Math.max(scanDeadline, Date.now() + scanBudget.hydrateReservedMs);
      await hydrateVirtualizedTurns(collector, debugLog, hydrateDeadline, scanBudget, signal);
      throwIfCaptureCancelled(signal);
      debugLog.mark("hydratedVirtualizedTurns");
      await collector.captureFromDom({ signal });
      debugLog.mark("finalCapture");
      if (hasChatGptMessageUnits()) {
        // Message-unit pages expose no global turn numbers to scroll back to;
        // missing messages are reported by the manifest completeness check.
        debugLog.event("missingRecovery.skipped", { reason: "message-unit DOM has no conversation-turn numbers" });
      } else {
        onProgress(`${progressPrefix}Recovering missed turns...`);
        const missingBeforeRecovery = getMissingConversationTurnOrders(collector.getMessages(), expectedOrders);
        const recoveryBudgetMs = getMissingRecoveryBudgetMs(missingBeforeRecovery.length, scanBudget.pageTurnCount);
        const recoveryDeadline = Date.now() + recoveryBudgetMs;
        await recoverMissingTurnMessages(scrollTarget, collector, debugLog, recoveryDeadline, recoveryBudgetMs, signal, {
          expectedOrders,
          maxKnownOrder: expectedTurnCount || Math.max(...(getAvailableConversationTurnOrders() || [0]))
        });
        throwIfCaptureCancelled(signal);
        debugLog.mark("recoveredMissingTurns");
      }
      await collector.captureFromDom({ settleMs: 0, signal });

      const messages = applyManifestOrder(
        finalizeCollectedMessages(collector.getMessages(), debugLog),
        options.manifest || null,
        debugLog
      );

      if (!messages.length) {
        throw new Error("No conversation messages were found on this page.");
      }

      onProgress(`${progressPrefix}Loading message timestamps...`);
      await enrichMessageTimestamps(messages, debugLog, { signal });
      throwIfCaptureCancelled(signal);
      debugLog.mark("enrichedTimestamps");
      onProgress(`${progressPrefix}Loading thinking details...`);
      await enrichVisibleThinkingFlyouts(messages, debugLog, { signal });
      throwIfCaptureCancelled(signal);
      debugLog.mark("enrichedThinkingFlyouts");

      if (options.finishDebug !== false) {
        debugLog.finish(messages);
        const finalSummary = debugLog.getFinalSummary();
        if (finalSummary?.missingTurnOrders?.length) {
          onProgress(`Found ${messages.length}/${finalSummary.expectedTurnCount || finalSummary.pageTurnCount || "?"} messages; ${finalSummary.missingTurnOrders.length} turns may still be missing.`);
        } else {
          onProgress(`Found ${messages.length} messages.`);
        }
      }
      return messages;
    } finally {
      setScrollTop(scrollTarget, originalScrollTop);
    }
  }
