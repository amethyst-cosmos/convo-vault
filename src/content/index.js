(() => {
  const EXPORTER_VERSION = "0.10.0";
  const installedState = window.__chatGptConversationExporterInstalled;

  if (
    installedState
    && typeof installedState === "object"
    && installedState.version === EXPORTER_VERSION
  ) {
    return;
  }

  if (
    installedState === true
    && window.__chatGptConversationExporterVersion === EXPORTER_VERSION
  ) {
    return;
  }

  window.__chatGptConversationExporterInstalled = {
    version: EXPORTER_VERSION,
    installedAt: Date.now()
  };
  window.__chatGptConversationExporterVersion = EXPORTER_VERSION;
  const TOP_LOAD_ATTEMPTS = 32;
  const WALK_ATTEMPTS = 240;
  const SCROLL_SETTLE_MS = 110;
  const DOM_IDLE_MS = 45;
  const MAX_DOM_IDLE_MS = 220;
  const CAPTURE_SETTLE_MS = 12;
  const TOP_STABLE_PASSES = 2;
  const MAX_SCAN_MS = 75_000;
  const HYDRATE_RESERVED_MS = 15_000;
  const MISSING_TURN_RECOVERY_MS = 18_000;
  const MAX_ADAPTIVE_SCAN_MS = 210_000;
  const MAX_ADAPTIVE_HYDRATE_RESERVED_MS = 60_000;
  const MAX_ADAPTIVE_MISSING_RECOVERY_MS = 120_000;
  const TURN_HYDRATION_SETTLE_MS = 70;
  // A 2,700-node conversation takes about 10 s as one tree and 5-8 s per
  // 100-turn page, so requests get a generous timeout; broken routes still
  // fail fast with an HTTP error.
  const CONVERSATION_API_FETCH_TIMEOUT_MS = 45_000;
  const CONVERSATION_API_ATTEMPT_TIMEOUT_MS = 45_000;
  const THINKING_FLYOUT_AUTO_OPEN_LIMIT = 48;
  const FAST_THINKING_FLYOUT_AUTO_OPEN_LIMIT = 0;
  const THINKING_FLYOUT_OPEN_TIMEOUT_MS = 1400;
  const THINKING_FLYOUT_SETTLE_TIMEOUT_MS = 4500;
  const FAST_THINKING_FLYOUT_SETTLE_TIMEOUT_MS = 2800;
  const THINKING_FLYOUT_SETTLE_POLL_MS = 150;
  const THINKING_FLYOUT_STABLE_PASSES = 3;
  const THINKING_FLYOUT_NO_PANEL_GRACE_MS = 700;
  const DEBUG_EVENT_LIMIT = 500;
  const DETAILED_DEBUG_LOG = false;
  const BUNDLE_IMAGE_DOWNLOAD_CONCURRENCY = 12;
  const BUNDLE_IMAGE_DOWNLOAD_TIMEOUT_MS = 20_000;
  const DEFAULT_ADVANCED_PDF_RENDERER_URL = "http://127.0.0.1:38474";
  const LOCAL_RENDERER_BUNDLE_PORT = "CONVO_VAULT_LOCAL_RENDERER_BUNDLE";
  const LOCAL_RENDERER_REQUEST_CHUNK_CHARACTERS = 512 * 1024;
  const MAX_LOCAL_RENDERER_REQUEST_BYTES = 256 * 1024 * 1024;
  // Message-unit pages expose one unit per message; legacy pages expose one
  // turn container per message. Both are the "turn nodes" of Full capture.
  const TURN_NODE_SELECTOR = '[data-chatgpt-search-unit-key], [data-turn-id], [data-turn-container], [data-turn-id-container], [data-testid^="conversation-turn-"], [data-testid*="conversation-turn"]';
  const MESSAGE_NODE_SELECTORS = [
    '[data-chatgpt-search-unit-key]',
    '[data-turn-id]',
    '[data-turn-container]',
    '[data-turn-id-container]',
    '[data-testid^="conversation-turn-"]',
    '[data-testid*="conversation-turn"]',
    'div[data-turn-id]',
    'div[data-turn-container]',
    'div[data-turn-id-container]',
    '[data-message-author-role]',
    '[data-message-id]',
    'main [data-is-streaming]',
    'main [class*="result-streaming"]',
    '[data-testid*="assistant" i]',
    '[data-testid*="bot-message" i]',
    '[data-testid*="user-message" i]',
    'main [data-start]',
    'main .markdown',
    'main [class*="markdown"]',
    'main [class*="prose"]',
    'main [class*="response"]',
    'main [class*="message"]',
    'main [class*="group/turn"]',
    'main [class*="group\\/turn"]',
    'main article',
    'main [role="article"]',
    'main [data-testid*="message"]',
    'main [class*="assistant" i]',
    'main [class*="group/conversation-turn"]',
    'main [class*="conversation-turn"]'
  ];
  const ASSISTANT_BODY_SELECTORS = [
    '[data-message-author-role="assistant"]',
    '[data-message-author-role="assistant"] div.markdown.prose',
    '[data-message-author-role="assistant"] .markdown',
    '[data-message-author-role="assistant"] [class*="markdown"]',
    '[data-message-author-role="assistant"] [class*="prose"]',
    '[data-message-author-role="assistant"] [dir="auto"]',
    '[data-message-author-role="assistant"] p',
    '[data-message-author-role="assistant"] li',
    '[data-message-author-role="assistant"] table',
    '[data-message-author-role="assistant"] [data-start]',
    '[data-message-author-role="assistant"] [class*="response"]',
    '[data-message-author-role="assistant"] [class*="text-base"]',
    '[data-message-author-role="assistant"] [class*="min-w-0"]',
    '[data-message-author-role="assistant"] [class*="w-full"]',
    '[data-message-author-role="assistant"] [class*="break-words"]',
    '[data-message-author-role="assistant"] [data-is-streaming]',
    '[data-message-author-role="assistant"] [class*="result-streaming"]',
    '[data-turn-id] [data-message-author-role="assistant"]',
    '[data-turn-id] div.markdown.prose',
    '[data-turn-id] .markdown',
    '[data-turn-id] [class*="markdown"]',
    '[data-turn-id] [class*="prose"]',
    '[data-turn-id] [dir="auto"]',
    '[data-turn-id] [data-is-streaming]',
    '[data-turn-container] [data-message-author-role="assistant"]',
    '[data-turn-container] div.markdown.prose',
    '[data-turn-container] .markdown',
    '[data-turn-container] [class*="markdown"]',
    '[data-turn-container] [class*="prose"]',
    '[data-turn-container] [dir="auto"]',
    '[data-turn-container] [data-is-streaming]',
    '[data-turn-id-container] [data-message-author-role="assistant"]',
    '[data-turn-id-container] div.markdown.prose',
    '[data-turn-id-container] .markdown',
    '[data-turn-id-container] [class*="markdown"]',
    '[data-turn-id-container] [class*="prose"]',
    '[data-turn-id-container] [dir="auto"]',
    '[data-turn-id-container] [data-is-streaming]',
    '[data-testid="bot-message"]',
    '[data-testid*="bot-message"]',
    '[data-testid*="assistant-message"]',
    '[data-testid*="assistant-response"]',
    '[data-testid*="assistant-turn"]',
    '[data-testid*="model-response"]',
    '[data-testid*="response"] [class*="markdown"]',
    '[data-testid*="assistant"] .markdown',
    '[data-testid*="assistant"] [class*="markdown"]',
    '[data-testid*="assistant"] [class*="prose"]',
    '[data-testid*="assistant"] [dir="auto"]',
    '[data-testid*="assistant"] [data-start]',
    'article [data-message-author-role="assistant"]',
    'article .markdown',
    'article [class*="prose"]',
    'article [dir="auto"]',
    '[data-is-streaming]',
    '[class*="result-streaming"]',
    '[data-start]',
    '[class*="markdown"]',
    '[class*="prose"]',
    '[class*="response"]',
    '[dir="auto"]',
    '.markdown'
  ];
  const USER_BODY_SELECTORS = [
    '[data-message-author-role="user"]',
    '[data-message-author-role="user"] [class*="whitespace-pre-wrap"]',
    '[data-testid="user-message"]',
    '[data-testid*="user-message"]',
    '.whitespace-pre-wrap',
    '[class*="whitespace-pre-wrap"]'
  ];
  const THINKING_SELECTORS = [
    '[data-testid*="reasoning" i]',
    '[data-testid*="thinking" i]',
    '[data-testid*="thought" i]',
    '[aria-label*="reasoning" i]',
    '[aria-label*="thinking" i]',
    '[aria-label*="thought" i]',
    '[aria-label*="\u601d\u8003"]',
    '[aria-label*="\u63a8\u7406"]',
    '[title*="reasoning" i]',
    '[title*="thinking" i]',
    '[title*="thought" i]',
    '[title*="\u601d\u8003"]',
    '[title*="\u63a8\u7406"]',
    '[class*="reasoning" i]',
    '[class*="thinking" i]',
    '[class*="thought" i]',
    'button.group__menu-item',
    'button.hoverable',
    'button[data-fill]',
    '[role="button"].group__menu-item',
    '[role="button"].hoverable',
    '[role="button"][data-fill]',
    'details'
  ];
  const THINKING_CUE_RE = /\b(show\s+)?(reasoning|reasoned|thinking|thoughts?|thought|thought\s+for)\b|\u5df2\u601d\u8003|\u601d\u8003|\u63a8\u7406|\u60f3\u6cd5|\u601d\u7ef4\u94fe|\u601d\u8003\u8fc7\u7a0b/i;
  const THINKING_STATUS_RE = /\b(?:thought|thinking|reasoned)\s*(?:for)?\s*\d+(?:\.\d+)?\s*(?:s|sec|secs|seconds?)\b|\u5df2\u601d\u8003\s*\d+(?:\.\d+)?\s*(?:s|\u79d2)?|\u601d\u8003\s*\d+(?:\.\d+)?\s*(?:s|\u79d2)/i;
  const THINKING_FLYOUT_TITLE_RE = /^(?:\u601d\u8003|\u63a8\u7406|thinking|reasoning)$/i;
  const THINKING_FLYOUT_DONE_RE = /^(?:\u5b8c\u6210|done|completed)$/i;
  const THINKING_FLYOUT_ACTIVE_RE = /^(?:\u6b63\u5728\u641c\u7d22|\u641c\u7d22\u4e2d|searching\b|browsing\b|researching\b|loading\b|working\b)/i;
  const THINKING_FLYOUT_STOP_RE = /^(?:web search|deep research|references?)\b/i;
  const THINKING_FLYOUT_STEP_LABEL_RE = /^(?:\u8bb0\u5fc6|memory|memories|past chat|saved memory|\u6587\u4ef6|file|files?|\u7f51\u9875|web|web pages?)(?:\s*[\u00b7:]\s*\d+)?$/i;
  const THINKING_FLYOUT_CODE_TITLE_RE = /^(?:python|javascript|typescript|bash|shell|sql|json|html|css|markdown|code|terminal)$/i;
  const THINKING_FLYOUT_RESULT_RE = /^(?:true|false|none|stdout|stderr|output|result|encoding\b|sample\b|b[\u0027\"]|\d+\s+)/i;
  const THINKING_FLYOUT_SOURCES_RE = /^(?:\u6e90|\u6765\u6e90|sources?)\s*(?:[\u00b7:]\s*\d+)?$/i;
  const THINKING_SOURCE_TRIGGER_RE = /^(?:\u6e90|\u6765\u6e90|sources?)$/i;
  const EXPAND_CUE_RE = /\b(show\s+more|show\s+all|expand|expanded|continue|read\s+more|more|details?|view\s+more)\b|\u5c55\u5f00|\u663e\u793a\u66f4\u591a|\u67e5\u770b\u66f4\u591a|\u7ee7\u7eed|\u66f4\u591a/i;
  const EXPANDABLE_BUTTON_SELECTORS = [
    "button.group__menu-item",
    "button.hoverable",
    "button[data-fill]",
    "[role='button'].group__menu-item",
    "[role='button'].hoverable",
    "[role='button'][data-fill]",
    "button[aria-expanded]",
    "button[aria-controls]"
  ];
  const DATE_TIME_VALUE_RE = /\b(?:\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2}|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})(?:[,\uFF0C]?\s*(?:at\s*)?\d{1,2}:\d{2}(?::\d{2})?(?:\s?(?:am|pm))?)?\b/i;
  const TIME_VALUE_RE = /\b\d{1,2}:\d{2}(?::\d{2})?(?:\s?(?:am|pm))?\b/i;
  const TIMESTAMP_DIVIDER_RE = /^(?:(?:星期|周)[一二三四五六日天]|(?:mon|tue|wed|thu|fri|sat|sun)(?:day)?|today|yesterday|昨天|今天|明天)(?:[,\uFF0C]?\s+|\s*)\d{1,2}:\d{2}(?::\d{2})?(?:\s?(?:am|pm))?$/i;
  const TIMESTAMP_CUE_RE = /\b(timestamp|sent|created|edited|updated|today|yesterday|date|time|am|pm)\b|\u65f6\u95f4|\u53d1\u9001|\u521b\u5efa|\u7f16\u8f91|\u66f4\u65b0/i;
  const NON_MESSAGE_TEXT_RE = /chatgpt\s+(can|may|might)\s+make\s+mistakes|check\s+important\s+info|verify\s+important\s+information|chatgpt\s*\u4e5f?\u53ef\u80fd\u4f1a?\u72af\u9519|\u8bf7\u6838\u67e5\u91cd\u8981\u4fe1\u606f|\u8bf7\u6838\u5bf9\u91cd\u8981\u4fe1\u606f|\u6838\u67e5\u91cd\u8981\u4fe1\u606f/i;
  const NON_MESSAGE_ROLE_RE = /\b(alert|status|banner|complementary|navigation|contentinfo|dialog|tooltip|menu|menubar|search)\b/i;
  const ASSISTANT_SIGNAL_RE = /\b(assistant|bot-message|bot|model-response|model|response|answer|completion|markdown|prose)\b/i;
  const FILE_NAME_RE = /[^\\/:*?"<>|\n\r]{1,140}\.(?:pdf|docx?|xlsx?|pptx?|csv|tsv|txt|md|json|zip|rar|7z|mov|mp4|mp3|wav)/i;
  const FILE_ATTACHMENT_RE = /\b(file|attachment|download|uploaded|pdf|docx?|xlsx?|pptx?|csv|tsv|txt|md|json|zip|rar|7z|mov|mp4|mp3|wav|document)\b|\u6587\u4ef6|\u9644\u4ef6|\u4e0b\u8f7d|\u6587\u6863/i;
  let lastTurnNodeCache = null;
  let lastTurnNodeCacheAt = 0;
  const LANGUAGE_ALIASES = new Map([
    ["js", "javascript"],
    ["mjs", "javascript"],
    ["cjs", "javascript"],
    ["ts", "typescript"],
    ["py", "python"],
    ["rb", "ruby"],
    ["rs", "rust"],
    ["sh", "bash"],
    ["zsh", "bash"],
    ["ps", "powershell"],
    ["ps1", "powershell"],
    ["md", "markdown"],
    ["yml", "yaml"]
  ]);
  const KNOWN_LANGUAGES = new Set([
    "bash",
    "c",
    "cpp",
    "csharp",
    "css",
    "diff",
    "go",
    "graphql",
    "html",
    "java",
    "javascript",
    "json",
    "jsx",
    "kotlin",
    "markdown",
    "php",
    "powershell",
    "python",
    "r",
    "ruby",
    "rust",
    "shell",
    "sql",
    "swift",
    "text",
    "tsx",
    "typescript",
    "xml",
    "yaml",
    "yml"
  ]);

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

  function getConversationScanBudget(options = {}) {
    const scrollTarget = getBestScrollTarget();
    const maxScrollTop = getMaxScrollTop(scrollTarget);
    const pageTurnDiagnostics = getPageTurnDiagnostics();
    const availableTurnCount = getAvailableConversationTurnOrders().length;
    const estimatedTurnsByHeight = Math.ceil(maxScrollTop / 1800);
    const expectedTurnCount = Number(options?.expectedTurnCount || 0);
    const pageTurnCount = Math.max(
      pageTurnDiagnostics.dataTurnIdCount || 0,
      availableTurnCount,
      estimatedTurnsByHeight,
      expectedTurnCount
    );
    const isLargeConversation = pageTurnCount >= 36 || maxScrollTop >= 30_000;
    const maxScanMs = isLargeConversation
      ? Math.min(MAX_ADAPTIVE_SCAN_MS, Math.max(MAX_SCAN_MS, pageTurnCount * 1400))
      : MAX_SCAN_MS;
    const hydrateReservedMs = isLargeConversation
      ? Math.min(MAX_ADAPTIVE_HYDRATE_RESERVED_MS, Math.max(HYDRATE_RESERVED_MS, pageTurnCount * 350))
      : HYDRATE_RESERVED_MS;

    return {
      pageTurnCount,
      availableTurnCount,
      maxScanMs,
      hydrateReservedMs,
      adaptive: isLargeConversation
    };
  }

  function getMissingRecoveryBudgetMs(missingCount, pageTurnCount = 0) {
    if (!missingCount) {
      return MISSING_TURN_RECOVERY_MS;
    }

    const needsAdaptiveRecovery = pageTurnCount >= 36 || missingCount >= 10;

    if (!needsAdaptiveRecovery) {
      return MISSING_TURN_RECOVERY_MS;
    }

    return Math.min(
      MAX_ADAPTIVE_MISSING_RECOVERY_MS,
      Math.max(MISSING_TURN_RECOVERY_MS, missingCount * 1800)
    );
  }

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
    // The API manifest is the expected structure whenever it loaded; the DOM
    // turn census remains the fallback for pages where the API is unavailable.
    const completeness = result?.manifest
      ? buildManifestCompletenessReport(messages, result.manifest, {
        captureMode,
        reconciliationReport: result?.reconciliationReport || null
      })
      : buildCaptureCompletenessReport(messages, {
        captureMode,
        reconciliationReport: result?.reconciliationReport || null,
        expectedSummary: result?.debugLog?.getFinalSummary?.() || null
      });

    result?.debugLog?.event("capture.completeness", completeness);
    return {
      ...result,
      captureMode,
      completeness
    };
  }

  function buildCaptureCompletenessReport(messages, options = {}) {
    const captureMode = normalizeCaptureMode(options.captureMode);
    const expected = options.expectedStructure || getExpectedConversationStructure(options.expectedSummary);
    const capturedEntries = messages.map((message, index) => ({
      identity: getCapturedMessageIdentity(message, index),
      order: getCapturedConversationOrder(message),
      role: String(message?.role || "unknown").toLowerCase()
    }));
    const capturedIdentities = [...new Set(capturedEntries.map((entry) => entry.identity).filter(Boolean))];
    const capturedIdentitySet = new Set(capturedIdentities);
    const missingIdentities = expected.identities.filter((identity) => !capturedIdentitySet.has(identity));
    const capturedOrders = [...new Set(capturedEntries
      .map((entry) => entry.order)
      .filter((order) => Number.isFinite(order) && order > 0 && order < 1_000_000))]
      .sort((a, b) => a - b);
    const capturedOrderSet = new Set(capturedOrders);
    const missingConversationOrders = expected.orders.filter((order) => !capturedOrderSet.has(order));
    const roleSequence = getRoleSequenceDiagnostics(messages);
    const userMessages = roleSequence.userMessages;
    const assistantMessages = roleSequence.assistantMessages;
    const imageStats = getCaptureImageCompletenessStats(messages);
    const issues = [];
    const warnings = [];
    const coverageKnown = expected.identities.length > 0;
    const capturedStartRole = messages[0]?.role || "";
    const capturedEndRole = messages[messages.length - 1]?.role || "";
    const reconciliationReport = options.reconciliationReport || {};
    const substantiveFullOnlyMessages = Number(reconciliationReport.substantiveFullOnlyMessages || 0);

    if (!coverageKnown) {
      issues.push({
        code: "expected-structure-unavailable",
        message: "The page did not expose a stable expected conversation structure."
      });
    }

    if (coverageKnown && capturedIdentities.length < expected.identities.length) {
      issues.push({
        code: "identity-coverage",
        message: `Captured ${capturedIdentities.length}/${expected.identities.length} unique conversation identities.`
      });
    }

    if (missingConversationOrders.length) {
      issues.push({
        code: "missing-orders",
        message: `Missing conversation order(s): ${formatNumberRanges(missingConversationOrders)}.`
      });
    } else if (missingIdentities.length) {
      issues.push({
        code: "missing-identities",
        message: `Missing ${missingIdentities.length} expected conversation identity/identities.`
      });
    }

    if (expected.roles.user > userMessages) {
      issues.push({
        code: "missing-user-messages",
        message: `Captured ${userMessages}/${expected.roles.user} expected user messages.`
      });
    }

    if (expected.roles.assistant > assistantMessages) {
      issues.push({
        code: "missing-assistant-messages",
        message: `Captured ${assistantMessages}/${expected.roles.assistant} expected assistant messages.`
      });
    }

    if (expected.startRole && capturedStartRole !== expected.startRole) {
      issues.push({
        code: "start-role-mismatch",
        message: `Expected the conversation to start with ${expected.startRole}, captured ${capturedStartRole || "nothing"}.`
      });
    }

    if (expected.endRole && capturedEndRole !== expected.endRole) {
      issues.push({
        code: "end-role-mismatch",
        message: `Expected the conversation to end with ${expected.endRole}, captured ${capturedEndRole || "nothing"}.`
      });
    }

    if (imageStats.failures > 0) {
      issues.push({
        code: "image-failures",
        message: `${imageStats.failures} image reference(s) failed during capture.`
      });
    }

    if (captureMode === "hybrid" && substantiveFullOnlyMessages > 0) {
      issues.push({
        code: "hybrid-full-only-messages",
        message: `Hybrid found ${substantiveFullOnlyMessages} substantive Full-only message(s); use Full to retain them.`
      });
    }

    if (roleSequence.sameRolePairs.length) {
      warnings.push({
        code: "same-role-adjacency",
        message: `${roleSequence.sameRolePairs.length} same-role adjacency pair(s) detected.`,
        pairs: roleSequence.sameRolePairs
      });
    }

    const complete = issues.length === 0;
    return {
      complete,
      requiresOverride: !complete,
      captureMode,
      coverageKnown,
      expected: {
        uniqueIdentities: expected.identities.length,
        conversationOrders: expected.orders,
        userMessages: expected.roles.user,
        assistantMessages: expected.roles.assistant,
        startRole: expected.startRole,
        endRole: expected.endRole,
        sameRoleAdjacencies: expected.sameRolePairs
      },
      captured: {
        messages: messages.length,
        uniqueIdentities: capturedIdentities.length,
        conversationOrders: capturedOrders,
        userMessages,
        assistantMessages,
        startRole: capturedStartRole,
        endRole: capturedEndRole,
        sameRoleAdjacencies: roleSequence.sameRolePairs
      },
      missingConversationOrders,
      missingIdentities,
      images: imageStats,
      hybrid: {
        substantiveFullOnlyMessages,
        substantiveFullOnlyAssistantMessages: Number(reconciliationReport.substantiveFullOnlyAssistantMessages || 0),
        substantiveSamples: reconciliationReport.substantiveSamples || []
      },
      issues,
      warnings
    };
  }

  function getExpectedConversationStructure(summary = null) {
    const turns = getAllTurnNodes();
    const entries = [];
    const seen = new Set();

    turns.forEach((turn, index) => {
      const identity = getExpectedTurnIdentity(turn, index);

      if (!identity || seen.has(identity)) {
        return;
      }

      seen.add(identity);
      entries.push({
        identity,
        order: getConversationTurnNumber(turn),
        role: detectRoleDetails(turn, index).role
      });
    });

    const domOrders = entries
      .map((entry) => entry.order)
      .filter((order) => Number.isFinite(order) && order > 0 && order < 1_000_000)
      .map(Math.floor);
    let summaryOrders = [
      ...(summary?.capturedTurnOrders || []),
      ...(summary?.missingTurnOrders || [])
    ]
      .map(Number)
      .filter((order) => Number.isFinite(order) && order > 0 && order < 1_000_000)
      .map(Math.floor);
    const expectedTurnCount = Number(summary?.expectedTurnCount || 0);

    const allDiscoveredOrders = [...new Set([...domOrders, ...summaryOrders])].sort((a, b) => a - b);
    const maxDiscoveredOrder = Math.max(
      allDiscoveredOrders.length ? allDiscoveredOrders[allDiscoveredOrders.length - 1] : 0,
      Number.isInteger(expectedTurnCount) ? expectedTurnCount : 0
    );

    const orders = maxDiscoveredOrder > 0
      ? Array.from({ length: maxDiscoveredOrder }, (_, index) => index + 1)
      : allDiscoveredOrders;
    const canonicalEntries = orders.length
      ? orders.map((order) => {
        const candidates = entries.filter((entry) => Math.floor(entry.order) === order);
        let role = candidates.find((entry) => entry.role === "user" || entry.role === "assistant")?.role
          || candidates[0]?.role
          || "";
        if (!role && order % 2 === 1) {
          role = "user";
        } else if (!role && order % 2 === 0) {
          role = "assistant";
        }
        return { identity: `order:${order}`, order, role };
      })
      : entries;
    const roles = canonicalEntries.reduce((counts, entry) => {
      if (entry.role === "user" || entry.role === "assistant") {
        counts[entry.role] += 1;
      }
      return counts;
    }, { user: 0, assistant: 0 });
    const sameRolePairs = [];

    for (let index = 1; index < canonicalEntries.length; index += 1) {
      const current = canonicalEntries[index];
      const previous = canonicalEntries[index - 1];

      if ((current.role === "user" || current.role === "assistant") && current.role === previous.role) {
        sameRolePairs.push({
          previousOrder: previous.order,
          order: current.order,
          role: current.role
        });
      }
    }

    return {
      identities: canonicalEntries.map((entry) => entry.identity),
      orders,
      roles,
      startRole: canonicalEntries[0]?.role || "",
      endRole: canonicalEntries[canonicalEntries.length - 1]?.role || "",
      sameRolePairs
    };
  }

  function getExpectedTurnIdentity(turn, index = 0) {
    const order = getConversationTurnNumber(turn);

    if (Number.isFinite(order) && order > 0 && order < 1_000_000) {
      return `order:${Math.floor(order)}`;
    }

    const messageId = turn?.getAttribute?.("data-message-id") || turn?.querySelector?.("[data-message-id]")?.getAttribute("data-message-id") || "";
    const turnId = getTurnId(turn);
    const turnContainer = turn?.getAttribute?.("data-turn-id-container") || turn?.getAttribute?.("data-turn-container") || "";
    const testId = turn?.getAttribute?.("data-testid") || "";

    if (messageId) return `message:${messageId}`;
    if (turnId) return `turn:${turnId}`;
    if (turnContainer) return `container:${turnContainer}`;
    if (testId) return `test:${testId}`;
    return `dom-index:${index}`;
  }

  function getCapturedMessageIdentity(message, index = 0) {
    const order = getCapturedConversationOrder(message);

    if (Number.isFinite(order) && order > 0 && order < 1_000_000) {
      return `order:${Math.floor(order)}`;
    }

    if (message?.sourceMessageId) return `message:${message.sourceMessageId}`;
    if (message?.sourceTurnId) return `turn:${message.sourceTurnId}`;
    if (message?.sourceTurnContainer) return `container:${message.sourceTurnContainer}`;
    if (message?.sourceTestId) return `test:${message.sourceTestId}`;
    if (message?.id) return `id:${message.id}`;
    return `capture-index:${index}`;
  }

  function getCapturedConversationOrder(message) {
    const order = Number(message?.conversationOrder ?? message?.order ?? message?.turnNumber);
    return Number.isFinite(order) ? Math.floor(order) : NaN;
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

  function formatNumberRanges(values) {
    const numbers = [...new Set(values
      .map(Number)
      .filter((value) => Number.isFinite(value)))]
      .sort((a, b) => a - b);
    const ranges = [];
    let start = numbers[0];
    let end = numbers[0];

    for (let index = 1; index <= numbers.length; index += 1) {
      const value = numbers[index];

      if (value === end + 1) {
        end = value;
        continue;
      }

      if (start != null) {
        ranges.push(start === end ? String(start) : `${start}-${end}`);
      }
      start = value;
      end = value;
    }

    return ranges.join(", ");
  }

  function normalizeCaptureMode(value) {
    const mode = String(value || "").toLowerCase();
    return ["fast", "full", "hybrid"].includes(mode) ? mode : "fast";
  }

  function formatCaptureMode(value) {
    const mode = normalizeCaptureMode(value);
    if (mode === "full") return "Full";
    if (mode === "fast") return "Fast";
    return "Hybrid";
  }

  function normalizeTurnNumber(value, index = 0) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : index + 1;
  }

  // @convo-vault-include bundle-export

  function countMarkdownImages(markdown) {
    return (String(markdown || "").match(/!\[[^\]]*]\([^)]+\)/g) || []).length;
  }

  // @convo-vault-include debug-log
  function createMessageDebugSnapshot(message, body, roleReason = "") {
    const markdown = String(message?.markdown || "");
    const thinkingMarkdown = String(message?.thinkingMarkdown || "");

    return {
      id: message?.id || "",
      role: message?.role || "",
      order: message?.order ?? null,
      roleReason,
      sourceMessageId: message?.sourceMessageId || "",
      timestamp: message?.timestamp || "",
      markdownLength: markdown.length,
      thinkingLength: thinkingMarkdown.length,
      markdownPreview: truncateDebugText(markdown, 4000),
      thinkingPreview: truncateDebugText(thinkingMarkdown, 2400),
      featureFlags: getMarkdownFeatureFlags(markdown, thinkingMarkdown),
      codeBlockDiagnostics: getCodeBlockDiagnostics(markdown, thinkingMarkdown),
      codeBlockCount: message?.codeBlockCount || 0,
      fileCount: message?.fileCount || 0,
      imageCount: message?.imageCount || 0,
      imagesEmbedded: message?.imagesEmbedded || 0,
      imagesDeferred: message?.imagesDeferred || 0,
      imagesFailed: message?.imagesFailed || 0,
      usedWholeNodeFallback: Boolean(message?.usedWholeNodeFallback),
      serializationAttempts: (message?.serializationAttempts || []).slice(0, 8),
      node: message?.sourceNode ? summarizeNode(message.sourceNode) : null,
      body: body ? summarizeNode(body) : null
    };
  }

  function createPortableMessageSnapshot(message, index = 0) {
    const markdown = dedupeMarkdownImageReferences(message?.markdown || "");
    const thinkingMarkdown = dedupeMarkdownImageReferences(message?.thinkingMarkdown || "");
    const imageCount = countMarkdownImages(`${markdown}\n${thinkingMarkdown}`);
    const imagesEmbedded = Math.min(imageCount, message?.imagesEmbedded || 0);
    const imagesFailed = Math.max(0, message?.imagesFailed || 0);
    const failedImageReferences = Math.min(Math.max(0, imageCount - imagesEmbedded), imagesFailed);
    const imagesDeferred = Math.min(
      Math.max(0, imageCount - imagesEmbedded - failedImageReferences),
      message?.imagesDeferred || 0
    );

    return {
      id: message?.id || `message-${index + 1}`,
      role: message?.role || "unknown",
      turnNumber: normalizeTurnNumber(message?.turnNumber, index),
      order: message?.order ?? index,
      conversationOrder: message?.order ?? index,
      originalOrder: message?.originalOrder ?? message?.order ?? index,
      sourceTurnId: message?.sourceTurnId || "",
      sourceTurnContainer: message?.sourceTurnContainer || "",
      sourceMessageId: message?.sourceMessageId || "",
      timestamp: message?.timestamp || "",
      preview: message?.preview || "",
      markdown,
      thinkingMarkdown,
      agentTrace: message?.agentTrace || null,
      ...(Array.isArray(message?.dil) && message.dil.length ? { dil: message.dil } : {}),
      codeBlockCount: message?.codeBlockCount || 0,
      fileCount: message?.fileCount || 0,
      imageCount,
      imagesEmbedded,
      imagesDeferred,
      imagesFailed,
      hybridSource: message?.hybridSource || "",
      hybridMarkdownSource: message?.hybridMarkdownSource || "",
      hybridThinkingSource: message?.hybridThinkingSource || ""
    };
  }

  function dedupeMarkdownImageReferences(markdown) {
    const imagePattern = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)(?:\s*<!-- (?:Image base64 embedding is temporarily disabled during scanning to avoid page side effects|Image base64 embedding is deferred until export to avoid page side effects)\. -->)?/g;
    const source = String(markdown || "");
    const seen = new Set();
    let previousMatchEnd = 0;

    return cleanMarkdown(source.replace(imagePattern, (match, _alt, url, offset) => {
      if (hasSubstantiveImageGap(source.slice(previousMatchEnd, offset))) {
        seen.clear();
      }
      previousMatchEnd = offset + match.length;
      const identity = getMarkdownImageIdentity(url);

      if (!identity || !seen.has(identity)) {
        if (identity) {
          seen.add(identity);
        }
        return match;
      }

      return "";
    }));
  }

  function hasSubstantiveImageGap(value) {
    return Boolean(String(value || "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .trim());
  }

  function getMarkdownImageIdentity(url) {
    const value = String(url || "").trim();

    if (!value) {
      return "";
    }

    const pointerMatch = value.match(/^(?:file-service|sediment):\/\/([^/?#]+)/i);
    if (pointerMatch?.[1]) {
      return `chatgpt-asset:${pointerMatch[1]}`;
    }

    if (/^data:/i.test(value)) {
      return value;
    }

    try {
      const parsed = new URL(value, location.href);
      const estuaryId = /\/backend-api\/estuary\/content/i.test(parsed.pathname)
        ? parsed.searchParams.get("id") || ""
        : "";
      if (estuaryId) {
        return `chatgpt-estuary:${estuaryId}:${parsed.searchParams.get("p") || ""}`;
      }

      const fileMatch = parsed.pathname.match(/\/backend-api\/files\/([^/?#]+)(?:\/([^/?#]+))?/i);
      if (fileMatch?.[1]) {
        return `chatgpt-file:${fileMatch[1]}:${fileMatch[2] || "metadata"}`;
      }

      const sedimentMatch = parsed.pathname.match(/\/backend-api\/sediment\/files\/([^/?#]+)(?:\/([^/?#]+))?/i);
      if (sedimentMatch?.[1]) {
        return `chatgpt-sediment:${sedimentMatch[1]}:${sedimentMatch[2] || "metadata"}`;
      }

      parsed.hash = "";
      return parsed.href;
    } catch (_) {
      return value;
    }
  }

  function countEmbeddedMarkdownImages(markdown) {
    let count = 0;
    const imagePattern = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    let match;

    while ((match = imagePattern.exec(String(markdown || "")))) {
      if (/^data:image\//i.test(match[2] || "")) {
        count += 1;
      }
    }

    return count;
  }

  function truncateDebugText(text, maxLength) {
    const value = String(text || "");

    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, Math.max(0, maxLength - 24))}\n...[truncated ${value.length - maxLength} chars]`;
  }

  function getCodeBlockDiagnostics(markdown, thinkingMarkdown = "") {
    const combined = `${String(markdown || "")}\n${String(thinkingMarkdown || "")}`;
    const diagnostics = [];
    const pattern = /(^|\n)([`~]{3,})([^\n]*)\n([\s\S]*?)\n\2(?=\n|$)/g;
    let match;

    while ((match = pattern.exec(combined)) !== null) {
      const code = match[4] || "";
      const lines = code.split("\n");
      diagnostics.push({
        language: normalizeLanguage(match[3] || ""),
        lineCount: lines.length,
        nonEmptyLineCount: lines.filter((line) => line.trim()).length,
        maxLineLength: lines.reduce((max, line) => Math.max(max, line.length), 0),
        firstLine: truncateDebugText(lines.find((line) => line.trim()) || "", 160)
      });
    }

    return diagnostics.slice(0, 12);
  }

  function getMarkdownFeatureFlags(markdown, thinkingMarkdown = "") {
    const combined = `${String(markdown || "")}\n${String(thinkingMarkdown || "")}`;

    return {
      hasBold: /(\*\*|__)[\s\S]+?\1/.test(combined),
      hasItalic: /(^|[^*])(?:\*|_)[^*_]+(?:\*|_)/.test(combined),
      hasList: /^\s*(?:[-*+]|\d+[.)])\s+\S/m.test(combined),
      hasOrderedList: /^\s*\d+[.)]\s+\S/m.test(combined),
      hasQuote: /^\s*>/m.test(combined),
      hasCodeBlock: /```/.test(combined),
      hasTable: /^\s*\|.*\|\s*$/m.test(combined),
      hasLink: /\[[^\]]+\]\([^)]+\)/.test(combined),
      boldMarkerCount: (combined.match(/(\*\*|__)/g) || []).length,
      orderedListItemCount: (combined.match(/^\s*\d+[.)]\s+\S/gm) || []).length,
      quoteLineCount: (combined.match(/^\s*>/gm) || []).length,
      tableRowCount: (combined.match(/^\s*\|.*\|\s*$/gm) || []).length
    };
  }

  function getMarkdownFeatureStats(messages) {
    return messages.reduce((stats, message) => {
      const markdown = String(message.markdown || "");
      const thinkingMarkdown = String(message.thinkingMarkdown || "");
      const flags = getMarkdownFeatureFlags(markdown, thinkingMarkdown);

      if (flags.hasBold) {
        stats.messagesWithBold += 1;
      }

      if (flags.hasItalic) {
        stats.messagesWithItalic += 1;
      }

      if (flags.hasList) {
        stats.messagesWithLists += 1;
      }

      if (flags.hasQuote) {
        stats.messagesWithQuotes += 1;
      }

      if (flags.hasCodeBlock) {
        stats.messagesWithCodeBlocks += 1;
      }

      if (flags.hasTable) {
        stats.messagesWithTables += 1;
      }

      if (flags.hasLink) {
        stats.messagesWithLinks += 1;
      }

      return stats;
    }, {
      messagesWithBold: 0,
      messagesWithItalic: 0,
      messagesWithLists: 0,
      messagesWithQuotes: 0,
      messagesWithCodeBlocks: 0,
      messagesWithTables: 0,
      messagesWithLinks: 0
    });
  }

  function getPageTurnDiagnostics() {
    return {
      dataTurnIdCount: document.querySelectorAll("[data-turn-id]").length,
      dataTurnContainerCount: document.querySelectorAll("[data-turn-container]").length,
      dataTurnIdContainerCount: document.querySelectorAll("[data-turn-id-container]").length,
      authorRoleCount: document.querySelectorAll("[data-message-author-role]").length,
      assistantRoleCount: document.querySelectorAll('[data-message-author-role="assistant"]').length,
      userRoleCount: document.querySelectorAll('[data-message-author-role="user"]').length,
      legacyConversationTurnCount: document.querySelectorAll('[data-testid*="conversation-turn"]').length,
      markdownProseCount: document.querySelectorAll("div.markdown.prose, .markdown.prose").length,
      markdownCount: document.querySelectorAll(".markdown, [class*='markdown']").length
    };
  }

  function makeMessagePreview(message) {
    const text = [
      message.markdown,
      message.thinkingMarkdown ? `Thinking: ${message.thinkingMarkdown}` : ""
    ].filter(Boolean).join(" ");
    const preview = text
      .replace(/```[\s\S]*?```/g, "[code block]")
      .replace(/!\[[^\]]*]\([^)]+\)/g, "[image]")
      .replace(/[#*_>`~\[\]()|]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (preview) {
      return truncatePreview(preview, 30);
    }

    const extras = [];

    if (message.codeBlockCount) {
      extras.push(`${message.codeBlockCount} code block(s)`);
    }

    if (message.imageCount) {
      extras.push(`${message.imageCount} image(s)`);
    }

    return extras.join(", ") || "No text preview available.";
  }

  function truncatePreview(text, maxLength) {
    const value = String(text || "").trim();

    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
  }

  function isLikelyNonMessageMarkdown(message) {
    const text = [message.markdown, message.thinkingMarkdown].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

    if (!text) {
      return false;
    }

    return isTimestampDividerText(text) || (text.length <= 320 && NON_MESSAGE_TEXT_RE.test(text));
  }

  function getMessageStats(message) {
    const stats = [];

    if (message.timestamp) {
      stats.push(message.timestamp);
    }

    if (message.codeBlockCount) {
      stats.push(`${message.codeBlockCount} code`);
    }

    if (message.imageCount) {
      stats.push(`${message.imageCount} img`);
    }

    if (message.thinkingMarkdown) {
      stats.push("thinking");
    }

    return stats.join(" | ") || "text";
  }

  function summarizeNode(node) {
    if (!node) {
      return null;
    }

    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;

    if (!element) {
      return null;
    }

    return {
      tag: element.tagName?.toLowerCase() || "",
      id: element.id || "",
      role: element.getAttribute?.("role") || "",
      testId: element.getAttribute?.("data-testid") || "",
      messageRole: element.getAttribute?.("data-message-author-role") || "",
      messageId: element.getAttribute?.("data-message-id") || "",
      className: String(element.getAttribute?.("class") || "").slice(0, 220),
      textPreview: getElementText(element).slice(0, 260),
      selectorPath: getNodeSelectorPath(element)
    };
  }

  function summarizeCandidateSignals(node) {
    if (!node?.matches) {
      return null;
    }

    return {
      isConversationTurn: isConversationTurnNode(node),
      isTurnNode: isTurnNode(node),
      turnId: getTurnId(node),
      hasTurnContainer: hasTurnContainerSignal(node),
      hasRoleOrMessageId: hasRoleOrMessageIdSignal(node),
      hasAssistantSignal: hasAssistantRoleSignal(node),
      hasUserSignal: hasUserRoleSignal(node),
      hasMessageContent: hasMessageContent(node),
      isNonMessage: isNonMessageNode(node),
      innerTextLength: String(node.innerText || "").trim().length,
      textContentLength: String(node.textContent || "").trim().length,
      markdownCount: node.querySelectorAll?.(".markdown, [class*='markdown'], [class*='prose']").length || 0,
      streamingCount: node.querySelectorAll?.("[data-is-streaming], [class*='result-streaming']").length || 0,
      expandableButtonCount: getExpandableContentButtons(node).length,
      mediaCount: node.querySelectorAll?.("img, picture, canvas").length || 0,
      codeCount: node.querySelectorAll?.("pre, code").length || 0
    };
  }

  function getSerializationHint(node) {
    if (!node?.matches) {
      return null;
    }

    return {
      rawTextLength: getRawElementText(node).length,
      elementTextLength: getElementText(node).length,
      childNodeCount: node.childNodes?.length || 0,
      elementChildCount: node.children?.length || 0,
      skippedBySerializer: shouldSkipElement(node, { skipElements: new WeakSet() }),
      markdownCount: node.querySelectorAll?.("div.markdown.prose, .markdown, [class*='markdown'], [class*='prose']").length || 0,
      richMarkdownContainer: isRichMarkdownContainer(node),
      structuralBlockCount: node.querySelectorAll?.("strong, b, em, i, blockquote, ul, ol, table").length || 0,
      semanticTagCounts: {
        strong: node.querySelectorAll?.("strong, b").length || 0,
        emphasis: node.querySelectorAll?.("em, i").length || 0,
        blockquote: node.querySelectorAll?.("blockquote").length || 0,
        orderedList: node.querySelectorAll?.("ol").length || 0,
        unorderedList: node.querySelectorAll?.("ul").length || 0,
        table: node.querySelectorAll?.("table").length || 0,
        dataRange: node.querySelectorAll?.("[data-start], [data-end], [data-is-last-node], [data-is-only-node]").length || 0
      },
      cssFormattedInlineCount: node.querySelectorAll?.(".font-bold, .font-semibold, .font-extrabold, .font-black, .italic, [style*='font-weight'], [style*='font-style']").length || 0,
      dirAutoCount: node.querySelectorAll?.("[dir='auto']").length || 0,
      buttonCount: node.querySelectorAll?.("button, [role='button']").length || 0,
      expandableButtonCount: getExpandableContentButtons(node).length,
      hiddenCount: node.querySelectorAll?.("[hidden], [aria-hidden='true']").length || 0
    };
  }

  function getNodeSelectorPath(element) {
    const parts = [];
    let current = element;

    while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
      let part = current.tagName.toLowerCase();
      const testId = current.getAttribute("data-testid");
      const role = current.getAttribute("data-message-author-role");

      if (testId) {
        part += `[data-testid="${testId.slice(0, 80)}"]`;
      } else if (role) {
        part += `[data-message-author-role="${role}"]`;
      } else if (current.id) {
        part += `#${current.id}`;
      }

      parts.unshift(part);
      current = current.parentElement;
    }

    return parts.join(" > ");
  }

  function highlightMessageNode(node) {
    const previousOutline = node.style.outline;
    const previousOutlineOffset = node.style.outlineOffset;
    const previousBackground = node.style.backgroundColor;
    const previousTransition = node.style.transition;

    node.style.transition = "outline-color 160ms ease, background-color 160ms ease";
    node.style.outline = "3px solid #0f766e";
    node.style.outlineOffset = "6px";
    node.style.backgroundColor = "rgba(15, 118, 110, 0.08)";

    window.setTimeout(() => {
      if (!node.isConnected) {
        return;
      }

      node.style.outline = previousOutline;
      node.style.outlineOffset = previousOutlineOffset;
      node.style.backgroundColor = previousBackground;
      node.style.transition = previousTransition;
    }, 1600);
  }

  function createCaptureJobManager() {
    let nextJobId = 0;
    let activeJob = null;
    let loadedSnapshot = null;

    return {
      start(captureMode) {
        this.cancel("Superseded by a newer capture job.");
        loadedSnapshot = null;
        const controller = new AbortController();
        activeJob = Object.freeze({
          id: ++nextJobId,
          captureMode: normalizeCaptureMode(captureMode),
          controller,
          signal: controller.signal,
          startedAt: Date.now()
        });
        return activeJob;
      },
      cancel(reason = "Capture cancelled.") {
        const job = activeJob;
        activeJob = null;

        if (job && !job.signal.aborted) {
          job.controller.abort(reason);
        }

        return job;
      },
      isCurrent(job) {
        return Boolean(job && activeJob?.id === job.id && !job.signal.aborted);
      },
      commit(job, result) {
        if (!this.isCurrent(job)) {
          throw createCaptureCancelledError("A stale capture job cannot replace the loaded snapshot.");
        }

        const snapshot = Object.freeze({
          jobId: job.id,
          captureMode: job.captureMode,
          messages: Object.freeze([...(result?.messages || [])]),
          debugLog: result?.debugLog || null,
          completeness: result?.completeness || null,
          reconciliationReport: result?.reconciliationReport || null,
          completedAt: Date.now()
        });
        activeJob = null;
        loadedSnapshot = snapshot;
        return snapshot;
      },
      fail(job) {
        if (activeJob?.id === job?.id) {
          activeJob = null;
        }
      },
      clearSnapshot() {
        loadedSnapshot = null;
      },
      getActiveJob() {
        return activeJob;
      },
      getLoadedSnapshot() {
        return loadedSnapshot;
      }
    };
  }

  // @convo-vault-include selector-panel

  // @convo-vault-include capture-full
  // @convo-vault-include message-discovery

  // @convo-vault-include chatgpt-markup
  // @convo-vault-include chatgpt-dom
  // @convo-vault-include conversation-manifest

  // @convo-vault-include agent-trace
  // @convo-vault-include capture-fast
  function formatConversationTimestamp(value) {
    if (value == null || value === "") {
      return "";
    }

    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return normalizeTimestamp(value);
    }

    const milliseconds = numericValue > 1_000_000_000_000 ? numericValue : numericValue * 1000;
    const date = new Date(milliseconds);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return [
      padDatePart(date.getDate()),
      padDatePart(date.getMonth() + 1),
      date.getFullYear()
    ].join("/") + `, ${[
      padDatePart(date.getHours()),
      padDatePart(date.getMinutes()),
      padDatePart(date.getSeconds())
    ].join(":")}`;
  }

  function padDatePart(value) {
    return String(value).padStart(2, "0");
  }

  // @convo-vault-include thinking-flyouts

  function isVisibleElement(element) {
    const rect = element?.getBoundingClientRect?.();

    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0;
  }

  function isHiddenCaptureCandidate(element) {
    if (!element?.isConnected) {
      return true;
    }

    let current = element;
    const boundary = document.querySelector("main") || document.body;

    while (current && current !== document.documentElement) {
      if (current.hidden || current.getAttribute?.("aria-hidden") === "true" || current.hasAttribute?.("inert")) {
        return true;
      }

      const style = window.getComputedStyle?.(current);

      if (style && (style.display === "none" || style.visibility === "hidden")) {
        return true;
      }

      if (current === boundary || current === document.body) {
        break;
      }

      current = current.parentElement;
    }

    return false;
  }

  function isNodeInViewport(node) {
    const rect = node?.getBoundingClientRect?.();

    if (!rect) {
      return false;
    }

    return rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
  }

  function getMessageKey(node, role, parts) {
    const messageId = getMessageIdFromNode(node);
    const turnDataId = getTurnId(node);
    const turnId = node.getAttribute("data-testid") || node.closest("[data-testid]")?.getAttribute("data-testid");
    const body = parts.body || node;

    if (messageId) {
      return `message-id:${messageId}`;
    }

    if (turnDataId) {
      return `turn-id:${turnDataId}`;
    }

    if (turnId && /^conversation-turn-\d+/.test(turnId)) {
      return `turn:${turnId}`;
    }

    const fingerprint = [
      role,
      parts.timestamp || "",
      getElementText(body).slice(0, 600),
      parts.thinkingElements.map((element) => getElementText(element).slice(0, 200)).join("\n"),
      [...body.querySelectorAll("pre")].map((pre) => pre.textContent || "").join("\n").slice(0, 400)
    ].join("\n");

    return `fingerprint:${hashString(fingerprint)}`;
  }

  function getStableNodeKey(node) {
    const messageId = getMessageIdFromNode(node);

    if (messageId) {
      return `message-id:${messageId}`;
    }

    const turnDataId = getTurnId(node);

    if (turnDataId) {
      return `turn-id:${turnDataId}`;
    }

    const turnId = node.getAttribute("data-testid") || node.closest("[data-testid]")?.getAttribute("data-testid");

    if (turnId && /^conversation-turn-\d+/.test(turnId)) {
      return `turn:${turnId}`;
    }

    return "";
  }

  function getMessageIdFromNode(node) {
    if (isChatGptMessageUnit(node)) {
      return getChatGptMessageUnitInfo(node)?.messageIds[0] || "";
    }

    return node?.querySelector?.("[data-message-id]")?.getAttribute("data-message-id") || node?.getAttribute?.("data-message-id") || "";
  }

  // @convo-vault-include dom-serializer

  function getConversationTitle() {
    const documentTitle = cleanTitle(document.title);

    if (documentTitle && documentTitle.toLowerCase() !== "chatgpt") {
      return documentTitle;
    }

    const heading = document.querySelector("main h1, h1");
    const headingText = heading ? cleanTitle(getElementText(heading)) : "";
    return headingText || "ChatGPT Conversation";
  }

  function cleanTitle(title) {
    return String(title || "")
      .replace(/^chatgpt\s*[-|:]\s*/i, "")
      .replace(/\s+-\s+chatgpt$/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function makeFilename(title, date, extension = "md") {
    const timestamp = date.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const safeTitle = sanitizeFilename(title || "chatgpt-conversation").slice(0, 80);
    const safeExtension = String(extension || "md").replace(/^\.+/, "").replace(/[^a-z0-9]/gi, "").toLowerCase() || "md";
    return `${safeTitle}-${timestamp}.${safeExtension}`;
  }

  function getBestScrollTarget() {
    // ChatGPT has used both document-level and nested scroll containers. Score
    // candidates by scroll range plus whether they contain conversation turns,
    // but only keep targets whose scrollTop can actually be changed. Some
    // recent ChatGPT builds expose large scrollHeight on <main> while the real
    // scroll owner is an ancestor/document scroller; choosing that inert node
    // leaves virtualized turns empty forever.
    const main = document.querySelector("main");
    const firstTurn = document.querySelector('[data-turn-id], [data-turn-container], [data-turn-id-container], [data-testid^="conversation-turn-"], [data-testid*="conversation-turn"]');
    const candidates = [
      document.scrollingElement,
      document.documentElement,
      document.body,
      main,
      main?.parentElement,
      ...getAncestorChain(firstTurn),
      ...getAncestorChain(main),
      ...document.querySelectorAll("[data-radix-scroll-area-viewport], [class*='overflow-y-auto'], [class*='overflow-auto'], [class*='scroll']")
    ].filter(Boolean);

    const ranked = uniqueElements(candidates)
      .filter((element) => getScrollHeight(element) - getClientHeight(element) > 40)
      .filter((element) => canProgrammaticallyScroll(element))
      .map((element) => ({ element, score: scoreScrollTarget(element, main) }))
      .sort((a, b) => b.score - a.score);

    return ranked[0]?.element || document.scrollingElement || document.documentElement;
  }

  function getAncestorChain(element) {
    const ancestors = [];
    let current = element;

    while (current && current !== document.documentElement) {
      ancestors.push(current);
      current = current.parentElement;
    }

    ancestors.push(document.documentElement, document.body);
    return ancestors;
  }

  function scoreScrollTarget(element, main) {
    const range = getScrollHeight(element) - getClientHeight(element);
    const containsMain = main && (element === main || element.contains(main) || main.contains(element));
    const containsMessages = Boolean(element.querySelector?.('[data-turn-id], [data-turn-container], [data-turn-id-container], [data-testid^="conversation-turn-"], [data-message-author-role], [data-message-id]'));
    const isChrome = Boolean(element.closest?.("nav, aside, header"));

    return range + (containsMessages ? 100_000 : 0) + (containsMain ? 25_000 : 0) - (isChrome ? 100_000 : 0);
  }

  function getScrollTop(element) {
    if (isDocumentScroller(element)) {
      return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    }

    return element.scrollTop;
  }

  function setScrollTop(element, value) {
    rawSetScrollTop(element, value);
  }

  function rawSetScrollTop(element, value) {
    if (isDocumentScroller(element)) {
      window.scrollTo(0, value);
      document.documentElement.scrollTop = value;
      document.body.scrollTop = value;
      return;
    }

    element.scrollTo?.(0, value);
    element.scrollTop = value;
  }

  function canProgrammaticallyScroll(element) {
    const maxTop = getMaxScrollTop(element);

    if (maxTop <= 40) {
      return false;
    }

    const original = getScrollTop(element);
    const probe = original < Math.min(maxTop, 120)
      ? Math.min(maxTop, original + 80)
      : Math.max(0, original - 80);

    rawSetScrollTop(element, probe);
    const movedTop = getScrollTop(element);
    rawSetScrollTop(element, original);

    return Math.abs(movedTop - original) > 2;
  }

  function getScrollHeight(element) {
    if (isDocumentScroller(element)) {
      return Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    }

    return element.scrollHeight;
  }

  function getClientHeight(element) {
    if (isDocumentScroller(element)) {
      return window.innerHeight || document.documentElement.clientHeight;
    }

    return element.clientHeight;
  }

  function getMaxScrollTop(element) {
    return Math.max(0, getScrollHeight(element) - getClientHeight(element));
  }

  function isDocumentScroller(element) {
    return element === document.scrollingElement || element === document.documentElement || element === document.body;
  }

  function getOrderHint(node, fallback) {
    const turnNumber = getConversationTurnNumber(node);

    if (Number.isFinite(turnNumber)) {
      return turnNumber;
    }

    const turn = isTurnNode(node) ? node : getClosestTurnNode(node);
    const domIndex = getAllTurnNodes().indexOf(turn);

    if (domIndex >= 0) {
      return domIndex + 1_000_000;
    }

    return fallback + 2_000_000;
  }

  function getConversationTurnNumber(node) {
    const testIds = [
      node?.getAttribute?.("data-testid") || "",
      node?.closest?.("[data-testid]")?.getAttribute("data-testid") || "",
      node?.querySelector?.("[data-testid*='conversation-turn']")?.getAttribute("data-testid") || ""
    ];

    for (const testId of testIds) {
      const match = String(testId || "").match(/conversation-turn-(\d+)/);

      if (match) {
        return Number(match[1]);
      }
    }

    return NaN;
  }

  function isBlockElement(tag) {
    return [
      "article",
      "aside",
      "div",
      "figcaption",
      "figure",
      "footer",
      "header",
      "main",
      "section"
    ].includes(tag);
  }

  function getElementText(element) {
    return (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
  }

  function getRawElementText(element) {
    return String(element?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function normalizeTextNode(text, parentElement) {
    const normalized = String(text || "").replace(/\r\n?/g, "\n");

    if (preservesWhitespace(parentElement)) {
      return normalized
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/\n{3,}/g, "\n\n");
    }

    return normalized.replace(/\s+/g, " ");
  }

  function preservesWhitespace(element) {
    return Boolean(element?.closest?.("pre, textarea, [class*='whitespace-pre-wrap'], [style*='white-space: pre-wrap']"));
  }

  function cleanMarkdown(markdown) {
    return normalizeMarkdownOutsideCodeFences(String(markdown || ""), (text) => String(text || "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
    )
      .trim();
  }

  function normalizeMarkdownOutsideCodeFences(markdown, normalizeText) {
    const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
    const chunks = [];
    let buffer = [];
    let inFence = false;
    let fenceChar = "";
    let fenceLength = 0;

    const flushText = () => {
      if (!buffer.length) {
        return;
      }

      chunks.push(normalizeText(buffer.join("\n")));
      buffer = [];
    };

    const flushCode = () => {
      if (!buffer.length) {
        return;
      }

      chunks.push(buffer.join("\n").replace(/[ \t]+$/gm, ""));
      buffer = [];
    };

    for (const line of lines) {
      const openingFence = line.match(/^\s*([`~]{3,})(.*)$/);

      if (!inFence && openingFence) {
        flushText();
        inFence = true;
        fenceChar = openingFence[1][0];
        fenceLength = openingFence[1].length;
        buffer.push(line.trimEnd());
        continue;
      }

      if (inFence) {
        buffer.push(line);

        if (isClosingMarkdownFence(line, fenceChar, fenceLength)) {
          flushCode();
          inFence = false;
          fenceChar = "";
          fenceLength = 0;
        }
        continue;
      }

      buffer.push(line);
    }

    if (inFence) {
      flushCode();
    } else {
      flushText();
    }

    return chunks.join("\n");
  }

  function isClosingMarkdownFence(line, fenceChar, fenceLength) {
    const match = String(line || "").match(/^\s*([`~]{3,})\s*$/);
    return Boolean(match && match[1][0] === fenceChar && match[1].length >= fenceLength);
  }

  function makeFence(code) {
    const longestRun = Math.max(0, ...[...String(code).matchAll(/`+/g)].map((match) => match[0].length));
    return "`".repeat(Math.max(3, longestRun + 1));
  }

  function uniqueElements(elements) {
    return [...new Set(elements.filter(Boolean))];
  }

  function uniqueStrings(values) {
    return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
  }

  function uniqueTopLevelElements(elements) {
    const sorted = uniqueElements(elements).sort(compareDocumentOrder);
    const result = [];

    for (const element of sorted) {
      if (result.some((existing) => existing.contains(element))) {
        continue;
      }

      for (let index = result.length - 1; index >= 0; index -= 1) {
        if (element.contains(result[index])) {
          result.splice(index, 1);
        }
      }

      result.push(element);
    }

    return result;
  }

  function trimTrailingNewlines(text) {
    return String(text || "").replace(/\n+$/g, "");
  }

  function markdownTableRow(cells) {
    return `| ${cells.join(" | ")} |`;
  }

  function padRow(row, length) {
    return [...row, ...Array.from({ length: length - row.length }, () => "")];
  }

  function escapeTableCell(text) {
    return sanitizeTableCellMarkdown(text).replace(/\|/g, "\\|");
  }

  function sanitizeTableCellMarkdown(text) {
    return String(text || "")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/\[!\\?\[[^\]\n]*\\?\]\([^)]+\)\s*([^\]]*?)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, url) => formatCleanPdfMarkdownLink(label, url))
      .replace(/!\\?\[[^\]\n]*\\?\]\([^)]+\)/g, "")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, url) => formatCleanPdfMarkdownLink(label, url))
      .replace(/[ \t]*\r?\n+[ \t]*/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function formatCleanPdfMarkdownLink(label, url) {
    const cleanLabel = cleanPdfLinkLabel(label, url);
    return cleanLabel && cleanLabel !== url
      ? `[${escapeMarkdownLinkLabel(cleanLabel)}](${url})`
      : url;
  }

  function cleanPdfLinkLabel(label, url = "") {
    const value = stripMarkdownImagesFromLinkLabel(label)
      .replace(/\s+/g, " ")
      .trim();
    const normalizedUrl = String(url || "").trim();

    if (!value) {
      return compactUrlLabel(normalizedUrl);
    }

    if (/^https?:\/\//i.test(value)) {
      return compactUrlLabel(value);
    }

    if (normalizedUrl && value.includes(normalizedUrl)) {
      const withoutUrl = value.replaceAll(normalizedUrl, " ").replace(/\s+/g, " ").trim();
      return withoutUrl || compactUrlLabel(normalizedUrl);
    }

    return value;
  }

  function stripMarkdownImagesFromLinkLabel(label) {
    return String(label || "")
      .replace(/!\\?\[[^\]\n]*\\?\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, " ")
      .replace(/\\?\[?image-\d+\\?]?/gi, " ");
  }

  function compactUrlLabel(url) {
    if (!url) {
      return "";
    }

    try {
      const parsed = new URL(url, location.href);
      const leaf = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "");
      return leaf || parsed.hostname || url;
    } catch {
      return url;
    }
  }

  function escapeMarkdownLinkLabel(text) {
    return String(text || "").replace(/[[\]\\]/g, "\\$&");
  }

  function escapeHtmlComment(text) {
    return String(text || "").replace(/--/g, "- -").replace(/[<>]/g, "");
  }

  function escapeRegExp(text) {
    return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function cssString(text) {
    return String(text || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function sanitizeFilename(name) {
    return String(name || "chatgpt-conversation")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/\s+/g, " ")
      .replace(/[. ]+$/g, "")
      .trim()
      || "chatgpt-conversation";
  }

  function sanitizeAltText(text) {
    return String(text || "image").replace(/\s+/g, " ").trim().slice(0, 120) || "image";
  }

  function sanitizeCssClass(text) {
    return String(text || "message").toLowerCase().replace(/[^a-z0-9_-]/g, "-") || "message";
  }

  function formatRole(role) {
    const normalized = String(role || "message").toLowerCase();
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  function hashString(text) {
    let hash = 2166136261;

    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0).toString(36);
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  // @convo-vault-include auto-export
})();
