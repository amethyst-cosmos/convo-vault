(() => {
  const EXPORTER_VERSION = "0.9.5";
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
      debugLog: options.debugLog,
      onProgress: options.onProgress
    });
    const filename = bundleResult.filename;

    if (options.debugLog) {
      options.debugLog.event?.("bundle.generated", {
        filename,
        rendererUrl: bundleResult.rendererUrl,
        exporterVersion: EXPORTER_VERSION,
        captureMode: normalizeCaptureMode(options.captureMode),
        assetCount: bundleResult.assetCount || 0,
        assetStats: bundleResult.assetStats,
        rendererTimings: bundleResult.rendererTimings || null
      });
      downloadDebugLog(options.debugLog, filename.replace(/\.zip$/i, "-debug.json"));
    }

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

    options.onProgress?.("Rendering Markdown, PDF, and data files...");
    const result = await requestBackgroundBundleExport({
      exportPayload: payload,
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

  function countMarkdownImages(markdown) {
    return (String(markdown || "").match(/!\[[^\]]*]\([^)]+\)/g) || []).length;
  }

  function createDebugLog(options = {}) {
    const startedAt = new Date();
    // ChatGPT is a single-page app: the user can open another conversation
    // while a long export renders, so page identity is fixed at capture start.
    const pageUrl = location.href;
    const pageTitle = getConversationTitle();
    const events = [];
    const isDetailed = options.detailed ?? DETAILED_DEBUG_LOG;
    const maxEvents = options.maxEvents || DEBUG_EVENT_LIMIT;
    let captureMode = normalizeCaptureMode(options.captureMode);
    const debugMode = options.debugMode || (isDetailed ? "fidelity-audit" : "standard");
    let droppedEvents = 0;
    const fidelityWarnings = [];
    const turnThinkingDiagnostics = [];
    const stats = {
      selectorHits: {},
      normalizedCandidates: 0,
      acceptedCandidates: 0,
      filteredCandidates: 0,
      filteredTurns: 0,
      acceptedTurns: 0,
      duplicateCandidates: 0,
      extractedMessages: 0,
      emptyMessages: 0,
      emptyReasons: {},
      filterReasons: {},
      fidelity: {
        warningsCount: 0,
        emptyThoughtContentCount: 0,
        stepsWithFullContent: 0,
        stepsWithSummaryOnly: 0,
        totalThinkingSteps: 0,
        reasoningSearchesCount: 0,
        unassociatedSearchesCount: 0
      },
      roles: {
        user: 0,
        assistant: 0,
        system: 0,
        tool: 0,
        unknown: 0
      }
    };
    const timings = {};
    const pageTurnDiagnostics = getPageTurnDiagnostics();
    const messageDiagnostics = [];
    let exportMessages = [];
    let scrollTargetSummary = null;
    let finalSummary = null;

    return {
      stats,
      debugMode,
      setCaptureMode(value) {
        captureMode = normalizeCaptureMode(value);
      },
      fidelityWarning(warning = {}) {
        stats.fidelity.warningsCount += 1;
        const code = warning.code || "FIDELITY_ANOMALY";
        if (code === "EMPTY_THOUGHT_CONTENT") {
          stats.fidelity.emptyThoughtContentCount += 1;
        } else if (code === "UNASSOCIATED_REASONING_SEARCH") {
          stats.fidelity.unassociatedSearchesCount += 1;
        }
        fidelityWarnings.push({
          atMs: Date.now() - startedAt.getTime(),
          severity: warning.severity || "warning",
          code,
          turnNumber: warning.turnNumber || null,
          message: warning.message || "",
          details: warning.details || {}
        });
        this.event("fidelity.warning", {
          code,
          turnNumber: warning.turnNumber,
          message: warning.message,
          details: warning.details
        });
      },
      recordThinkingDiagnostic(diag = {}) {
        const turnNumber = diag.turnNumber || null;
        const totalSteps = Number(diag.totalSteps || 0);
        const stepsWithFull = Number(diag.stepsWithFullContent || 0);
        const stepsSummaryOnly = Number(diag.stepsWithSummaryOnly || 0);
        const searches = Number(diag.searchQueriesCount || 0);

        stats.fidelity.totalThinkingSteps += totalSteps;
        stats.fidelity.stepsWithFullContent += stepsWithFull;
        stats.fidelity.stepsWithSummaryOnly += stepsSummaryOnly;
        stats.fidelity.reasoningSearchesCount += searches;

        turnThinkingDiagnostics.push({
          turnNumber,
          totalSteps,
          stepsWithFullContent: stepsWithFull,
          stepsWithSummaryOnly: stepsSummaryOnly,
          durationSec: diag.durationSec || 0,
          searchQueriesCount: searches,
          toolCallsCount: diag.toolCallsCount || 0,
          hasRecap: Boolean(diag.hasRecap)
        });
      },
      event(type, data = {}) {
        if (events.length >= maxEvents) {
          droppedEvents += 1;
          return;
        }

        events.push({
          type,
          atMs: Date.now() - startedAt.getTime(),
          ...data
        });
      },
      selectorHit(selector, count) {
        stats.selectorHits[selector] = (stats.selectorHits[selector] || 0) + count;
      },
      mark(name) {
        timings[name] = Date.now() - startedAt.getTime();
      },
      progress(type, data = {}) {
        this.event(`progress.${type}`, data);
      },
      candidateAccepted(node, selector, role) {
        stats.acceptedCandidates += 1;
        if (isTurnNode(node)) {
          stats.acceptedTurns += 1;
        }
        if (!isDetailed) {
          return;
        }
        this.event("candidate.accepted", {
          selector,
          role,
          node: summarizeNode(node),
          signals: summarizeCandidateSignals(node)
        });
      },
      candidateFiltered(element, selector, reason, normalized = null) {
        stats.filteredCandidates += 1;
        stats.filterReasons[reason] = (stats.filterReasons[reason] || 0) + 1;
        if (isTurnNode(normalized || element)) {
          stats.filteredTurns += 1;
        }
        if (!isDetailed) {
          return;
        }
        this.event("candidate.filtered", {
          selector,
          reason,
          element: summarizeNode(element),
          elementSignals: summarizeCandidateSignals(element),
          normalized: normalized ? summarizeNode(normalized) : null,
          normalizedSignals: normalized ? summarizeCandidateSignals(normalized) : null
        });
      },
      candidateDuplicate(node, selector, reason) {
        stats.duplicateCandidates += 1;
        if (!isDetailed) {
          return;
        }
        this.event("candidate.duplicate", {
          selector,
          reason,
          node: summarizeNode(node)
        });
      },
      messageExtracted(message, body, roleReason) {
        stats.extractedMessages += 1;
        stats.roles[message.role] = (stats.roles[message.role] || 0) + 1;
        messageDiagnostics.push(createMessageDebugSnapshot(message, body, roleReason));
        if (!isDetailed) {
          return;
        }
        this.event("message.extracted", {
          id: message.id,
          role: message.role,
          roleReason,
          markdownLength: message.markdown.length,
          thinkingLength: message.thinkingMarkdown.length,
          usedWholeNodeFallback: Boolean(message.usedWholeNodeFallback),
          serializationAttempts: message.serializationAttempts || [],
          codeBlockCount: message.codeBlockCount,
          fileCount: message.fileCount,
          imageCount: message.imageCount,
          imagesEmbedded: message.imagesEmbedded,
          imagesDeferred: message.imagesDeferred,
          imagesFailed: message.imagesFailed,
          imageEvents: message.imageEvents || [],
          node: summarizeNode(message.sourceNode),
          body: summarizeNode(body)
        });
      },
      messageEmpty(node, role, body, reason, parts = null) {
        stats.emptyMessages += 1;
        stats.emptyReasons[reason] = (stats.emptyReasons[reason] || 0) + 1;
        if (!isDetailed) {
          return;
        }
        this.event("message.empty", {
          role,
          reason,
          node: summarizeNode(node),
          nodeSignals: summarizeCandidateSignals(node),
          nodeSerializationHint: getSerializationHint(node),
          body: summarizeNode(body),
          bodySignals: summarizeCandidateSignals(body),
          bodySerializationHint: getSerializationHint(body),
          bodyCandidates: parts?.bodyCandidates || []
        });
      },
      lastTurn(stage, node, message = null, parts = null, roleReason = "") {
        if (!isDetailed) {
          return;
        }
        this.event("lastTurn.diagnostic", {
          stage,
          role: message?.role || "",
          roleReason,
          markdownLength: message?.markdown?.length || 0,
          thinkingLength: message?.thinkingMarkdown?.length || 0,
          codeBlockCount: message?.codeBlockCount || 0,
          imageCount: message?.imageCount || 0,
          serializationAttempts: message?.serializationAttempts || [],
          node: summarizeNode(node),
          nodeSignals: summarizeCandidateSignals(node),
          nodeSerializationHint: getSerializationHint(node),
          body: parts?.body ? summarizeNode(parts.body) : null,
          bodyCandidates: parts?.bodyCandidates || []
        });
      },
      setScrollTarget(node) {
        scrollTargetSummary = {
          ...summarizeNode(node),
          scrollTop: getScrollTop(node),
          scrollHeight: getScrollHeight(node),
          clientHeight: getClientHeight(node),
          maxScrollTop: getMaxScrollTop(node),
          canProgrammaticallyScroll: canProgrammaticallyScroll(node)
        };
      },
      finish(messages) {
        exportMessages = messages.map((message, index) => createPortableMessageSnapshot(message, index));
        const userMessages = messages.filter((message) => message.role === "user").length;
        const assistantMessages = messages.filter((message) => message.role === "assistant").length;
        const assistantThinkingMessages = messages.filter((message) => message.role === "assistant" && message.thinkingMarkdown).length;
        const thinThinkingMessages = messages.filter((message) => message.role === "assistant" && isThinThinkingMarkdown(message.thinkingMarkdown)).length;
        const attachmentStats = messages.reduce((totals, message) => {
          const stats = getMessageAttachmentStats(message);
          totals.totalImages += stats.images;
          totals.totalFiles += stats.files;

          if (stats.total > 0) {
            totals.messagesWithAttachments += 1;
          }

          return totals;
        }, {
          totalImages: 0,
          totalFiles: 0,
          messagesWithAttachments: 0
        });
        const capturedTurnOrders = [...new Set(messages
          .map((message) => Number(message.order))
          .filter((order) => Number.isFinite(order) && order > 0 && order < 1_000_000))]
          .sort((a, b) => a - b);
        const capturedTurnOrderSet = new Set(capturedTurnOrders);
        const roleSequenceDiagnostics = getRoleSequenceDiagnostics(messages);
        const effectiveTurnCount = messages.length;
        const availableTurnOrders = getAvailableConversationTurnOrders();
        const allDiscoveredOrders = [...new Set([
          ...capturedTurnOrders,
          ...availableTurnOrders
        ])].sort((a, b) => a - b);
        const maxKnownOrder = allDiscoveredOrders.length ? allDiscoveredOrders[allDiscoveredOrders.length - 1] : 0;
        const expectedTurnOrders = maxKnownOrder > 0
          ? Array.from({ length: maxKnownOrder }, (_, index) => index + 1)
          : (availableTurnOrders.length
            ? availableTurnOrders
            : (pageTurnDiagnostics.dataTurnIdCount
              ? Array.from({ length: pageTurnDiagnostics.dataTurnIdCount }, (_, index) => index + 1)
              : capturedTurnOrders));
        const expectedTurnCount = expectedTurnOrders.length || pageTurnDiagnostics.dataTurnIdCount || effectiveTurnCount;
        const missingTurnOrders = expectedTurnOrders.filter((order) => !capturedTurnOrderSet.has(order));
        const hasCriticalFidelityIssue = fidelityWarnings.some((w) => w.severity === "high" || w.code === "EMPTY_THOUGHT_CONTENT");
        const fidelityAudit = {
          status: fidelityWarnings.length === 0
            ? "clean"
            : (hasCriticalFidelityIssue ? "degraded" : "warning"),
          debugMode,
          totalAssistantTurns: assistantMessages,
          turnsWithThinking: assistantThinkingMessages,
          totalThinkingSteps: stats.fidelity.totalThinkingSteps,
          stepsWithFullContent: stats.fidelity.stepsWithFullContent,
          stepsWithSummaryOnly: stats.fidelity.stepsWithSummaryOnly,
          contentCompletenessRate: stats.fidelity.totalThinkingSteps > 0
            ? Number((stats.fidelity.stepsWithFullContent / stats.fidelity.totalThinkingSteps).toFixed(3))
            : 1.0,
          warningsCount: fidelityWarnings.length,
          warnings: fidelityWarnings,
          turnDiagnostics: turnThinkingDiagnostics
        };
        finalSummary = {
          captureMode,
          debugMode,
          totalMessages: messages.length,
          userMessages,
          assistantMessages,
          assistantThinkingMessages,
          thinThinkingMessages,
          richThinkingMessages: Math.max(0, assistantThinkingMessages - thinThinkingMessages),
          markdownFeatureStats: getMarkdownFeatureStats(messages),
          ...attachmentStats,
          systemMessages: messages.filter((message) => message.role === "system").length,
          toolMessages: messages.filter((message) => message.role === "tool").length,
          pageTurnCount: pageTurnDiagnostics.dataTurnIdCount,
          availableTurnCount: availableTurnOrders.length,
          expectedTurnCount,
          effectiveTurnCount,
          extractionRateFromDataTurnId: pageTurnDiagnostics.dataTurnIdCount
            ? Number((messages.length / pageTurnDiagnostics.dataTurnIdCount).toFixed(3))
            : null,
          extractionRateFromExpectedTurns: expectedTurnCount
            ? Number((messages.length / expectedTurnCount).toFixed(3))
            : null,
          roleSequenceDiagnostics,
          capturedTurnOrders,
          missingTurnOrders,
          fidelityAudit
        };
      },
      getFinalSummary() {
        return finalSummary;
      },
      toJSON() {
        return {
          exporterVersion: EXPORTER_VERSION,
          captureMode,
          debugMode,
          features: {
            conversationTimestampApi: true,
            visibleThinkingFlyoutCapture: true,
            autoOpenThinkingFlyouts: true,
            thinkingFlyoutAutoOpenLimit: THINKING_FLYOUT_AUTO_OPEN_LIMIT,
            cognitiveFidelityTracking: true,
            pdfEngine: "advanced-local-chrome"
          },
          fidelityAudit: finalSummary?.fidelityAudit || {
            status: fidelityWarnings.length === 0 ? "clean" : "warning",
            debugMode,
            warningsCount: fidelityWarnings.length,
            warnings: fidelityWarnings
          },
          pageUrl,
          title: pageTitle,
          startedAt: startedAt.toISOString(),
          finishedAt: new Date().toISOString(),
          pageTurnDiagnostics,
          timings,
          debugEvents: {
            detailed: isDetailed,
            retained: events.length,
            dropped: droppedEvents
          },
          scrollTarget: scrollTargetSummary,
          stats,
          finalSummary,
          exportPayload: {
            schemaVersion: 1,
            exporterVersion: EXPORTER_VERSION,
            title: pageTitle,
            source: pageUrl,
            exportedAt: new Date().toISOString(),
            captureMode,
            messages: exportMessages
          },
          messageDiagnostics,
          events
        };
      }
    };
  }

  function downloadDebugLog(debugLog, filename) {
    const payload = JSON.stringify(debugLog.toJSON(), null, 2);
    const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
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

  function createMessageSelectorUI() {
    const hostId = "chatgpt-exporter-selector-host";
    let host = null;
    let shadow = null;
    let messages = [];
    let selectedIds = new Set();
    let api = null;
    let panelPhase = "idle";
    const captureJobs = createCaptureJobManager();

    return {
      open(nextApi) {
        api = nextApi;
        ensurePanel();
        const activeJob = captureJobs.getActiveJob();
        const loadedSnapshot = captureJobs.getLoadedSnapshot();

        if (activeJob) {
          setPanelPhase("scanning", `Scanning with ${formatCaptureMode(activeJob.captureMode)}...`);
        } else if (loadedSnapshot) {
          setPanelPhase(loadedSnapshot.completeness?.complete ? "ready" : "incomplete");
        } else {
          renderMessageList();
          renderCompletenessReport(null);
          setPanelPhase("idle", "Choose a mode, then click Start Scan. Opening the selector does not scan.");
        }

        return { ok: true, panelOpen: true };
      }
    };

    function ensurePanel() {
      host = document.getElementById(hostId);

      if (!host) {
        host = document.createElement("div");
        host.id = hostId;
        document.documentElement.append(host);
        shadow = host.attachShadow({ mode: "open" });
        shadow.innerHTML = getSelectorPanelMarkup();
        bindPanelEvents();
      } else {
        shadow = host.shadowRoot;
      }

      host.style.display = "block";
    }

    function bindPanelEvents() {
      shadow.querySelector("[data-action='close']").addEventListener("click", () => {
        cancelActiveScan("Capture cancelled because the selector was closed.");
        host.style.display = "none";
      });
      shadow.querySelector("[data-action='start-scan']").addEventListener("click", () => {
        startScan();
      });
      shadow.querySelector("[data-action='cancel-scan']").addEventListener("click", () => {
        cancelActiveScan("Capture cancelled by the user.");
      });
      shadow.querySelector("[data-action='select-all']").addEventListener("click", () => {
        selectedIds = new Set(messages.map((message) => message.id));
        syncCheckboxes();
      });
      shadow.querySelector("[data-action='select-users']").addEventListener("click", () => {
        selectedIds = new Set(messages.filter((message) => message.role === "user").map((message) => message.id));
        syncCheckboxes();
      });
      shadow.querySelector("[data-action='select-assistants']").addEventListener("click", () => {
        selectedIds = new Set(messages.filter((message) => message.role === "assistant").map((message) => message.id));
        syncCheckboxes();
      });
      shadow.querySelector("[data-action='invert']").addEventListener("click", () => {
        selectedIds = new Set(messages.filter((message) => !selectedIds.has(message.id)).map((message) => message.id));
        syncCheckboxes();
      });
      shadow.querySelector("[data-action='export']").addEventListener("click", () => {
        exportCheckedMessages();
      });
      shadow.querySelector("[data-option='capture-mode']").addEventListener("change", () => {
        cancelActiveScan("Capture cancelled because the mode changed.");
        captureJobs.clearSnapshot();
        messages = [];
        selectedIds = new Set();
        resetIncompleteOverride();
        renderMessageList();
        renderCompletenessReport(null);
        updateExportButtonLabel();
        setPanelPhase("idle", `Mode set to ${formatCaptureMode(getSelectedCaptureMode())}. Click Start Scan.`);
      });
      shadow.querySelector("[data-option='allow-incomplete']").addEventListener("change", () => {
        updateExportAvailability();
      });
      shadow.querySelector(".cgce-list").addEventListener("change", (event) => {
        const checkbox = event.target.closest("input[type='checkbox'][data-message-id]");

        if (!checkbox) {
          return;
        }

        if (checkbox.checked) {
          selectedIds.add(checkbox.dataset.messageId);
        } else {
          selectedIds.delete(checkbox.dataset.messageId);
        }

        updateSelectionSummary();
      });
      shadow.querySelector(".cgce-list").addEventListener("dblclick", (event) => {
        const row = event.target.closest(".cgce-message[data-message-id]");

        if (!row) {
          return;
        }

        const message = messages.find((candidate) => candidate.id === row.dataset.messageId);
        scrollToMessage(message);
      });
    }

    function renderMessageList() {
      const list = shadow.querySelector(".cgce-list");

      if (!messages.length) {
        list.innerHTML = '<div class="cgce-empty">No scan loaded. Choose a mode and click Start Scan.</div>';
        return;
      }

      list.innerHTML = "";

      for (const message of messages) {
        list.append(createMessageRow(message));
      }
    }

    async function startScan() {
      if (!api) {
        setPanelStatus("The capture service is not ready.", true);
        return;
      }

      const job = captureJobs.start(getSelectedCaptureMode());
      messages = [];
      selectedIds = new Set();
      resetIncompleteOverride();
      renderMessageList();
      renderCompletenessReport(null);
      setPanelPhase("scanning", `Starting one ${formatCaptureMode(job.captureMode)} capture job...`);

      try {
        const result = await api.loadMessages((message) => {
          if (captureJobs.isCurrent(job)) {
            setPanelStatus(message);
          }
        }, {
          captureMode: job.captureMode,
          signal: job.signal
        });

        if (!captureJobs.isCurrent(job)) {
          return;
        }

        setPanelPhase("validating", "Validating conversation structure and media coverage...");
        throwIfCaptureCancelled(job.signal);
        const completeness = result?.completeness || buildCaptureCompletenessReport(result?.messages || result, {
          captureMode: job.captureMode,
          reconciliationReport: result?.reconciliationReport || null
        });
        const snapshot = captureJobs.commit(job, {
          ...result,
          messages: result?.messages || result,
          completeness
        });
        messages = [...snapshot.messages];
        selectedIds = new Set(messages.map((message) => message.id));
        renderMessageList();
        renderCompletenessReport(snapshot.completeness);
        updateSelectionSummary();

        if (snapshot.completeness?.complete) {
          setPanelPhase("ready", `Ready. ${messages.length} messages validated with ${formatCaptureMode(snapshot.captureMode)}.`);
        } else {
          setPanelPhase("incomplete", formatIncompleteCaptureStatus(snapshot.completeness), true);
        }
      } catch (error) {
        const isCurrent = captureJobs.isCurrent(job);
        captureJobs.fail(job);

        if (isCaptureCancelledError(error) || job.signal.aborted || !isCurrent) {
          return;
        }

        messages = [];
        selectedIds = new Set();
        renderMessageList();
        renderCompletenessReport(null);
        setPanelPhase("idle", error.message || String(error), true);
      }
    }

    function cancelActiveScan(reason) {
      const cancelledJob = captureJobs.cancel(reason);

      if (!cancelledJob) {
        return false;
      }

      messages = [];
      selectedIds = new Set();
      captureJobs.clearSnapshot();
      resetIncompleteOverride();
      renderMessageList();
      renderCompletenessReport(null);
      setPanelPhase("cancelled", reason);
      return true;
    }

    function createMessageRow(message) {
      const label = document.createElement("label");
      label.className = `cgce-message cgce-message-${sanitizeCssClass(message.role)}`;
      label.dataset.messageId = message.id;
      label.title = "Double-click to jump to this message";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selectedIds.has(message.id);
      checkbox.dataset.messageId = message.id;

      const content = document.createElement("span");
      content.className = "cgce-message-content";

      const meta = document.createElement("span");
      meta.className = "cgce-message-meta";

      const role = document.createElement("span");
      role.className = "cgce-role";
      role.textContent = formatRole(message.role);

      const stats = document.createElement("span");
      stats.className = "cgce-stats";
      stats.textContent = getMessageStats(message);

      meta.append(role, stats);

      const preview = document.createElement("span");
      preview.className = "cgce-preview";
      preview.textContent = message.preview || messageExtractor.preview(message);

      content.append(meta, preview);
      label.append(checkbox, content);
      return label;
    }

    function scrollToMessage(message) {
      const node = resolveMessageNode(message);

      if (!node?.isConnected) {
        setPanelStatus("That message is not currently mounted in the page. Run the scan again if you need to jump to it.", true);
        return;
      }

      node.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest"
      });
      highlightMessageNode(node);
      setPanelStatus(`Jumped to ${formatRole(message.role)} message.`);
    }

    function resolveMessageNode(message) {
      if (message?.sourceNode?.isConnected) {
        return message.sourceNode;
      }

      if (message?.sourceTurnId) {
        const byTurnId = document.querySelector(`[data-turn-id="${cssString(message.sourceTurnId)}"]`);

        if (byTurnId) {
          return normalizeMessageNode(byTurnId) || byTurnId;
        }
      }

      if (message?.sourceMessageId) {
        const byMessageId = document.querySelector(`[data-message-id="${cssString(message.sourceMessageId)}"]`);

        if (byMessageId) {
          return normalizeMessageNode(byMessageId) || byMessageId;
        }
      }

      if (message?.sourceTestId) {
        return document.querySelector(`[data-testid="${cssString(message.sourceTestId)}"]`);
      }

      return null;
    }

    function syncCheckboxes() {
      for (const checkbox of shadow.querySelectorAll("input[type='checkbox'][data-message-id]")) {
        checkbox.checked = selectedIds.has(checkbox.dataset.messageId);
      }

      updateSelectionSummary();
    }

    function updateSelectionSummary() {
      const selected = messages.filter((message) => selectedIds.has(message.id));
      const userCount = selected.filter((message) => message.role === "user").length;
      const assistantCount = selected.filter((message) => message.role === "assistant").length;

      setPanelStatus(`${selected.length}/${messages.length} selected. ${userCount} user, ${assistantCount} assistant.`);
      updateExportButtonLabel();
      updateExportAvailability();
    }

    function getSelectedMessages() {
      return messages.filter((message) => selectedIds.has(message.id));
    }

    function getSelectedCaptureMode() {
      return normalizeCaptureMode(shadow.querySelector("[data-option='capture-mode']")?.value);
    }

    function exportCheckedMessages() {
      const selected = getSelectedMessages();
      const snapshot = captureJobs.getLoadedSnapshot();

      if (!selected.length) {
        setPanelStatus("Select at least one message first.", true);
        return;
      }

      if (!snapshot) {
        setPanelStatus("Run and validate a scan before exporting.", true);
        return;
      }

      if (!snapshot.completeness?.complete && !allowsIncompleteExport()) {
        setPanelStatus("This capture is incomplete. Review the missing coverage and explicitly enable the override to export it.", true);
        return;
      }

      runExport(selected, {
        format: "bundle",
        captureMode: snapshot.captureMode,
        completeness: snapshot.completeness,
        allowIncomplete: allowsIncompleteExport(),
        debugLog: shouldDownloadDebugLog() ? snapshot.debugLog : null
      });
    }

    async function runExport(selected, options) {
      try {
        const busyLabel = options.format === "bundle"
          ? "Generating export bundle..."
          : "Exporting selected messages...";
        setPanelPhase("exporting", busyLabel);
        const result = await api.exportMessages(selected, {
          ...options,
          onProgress: (message) => setPanelStatus(message)
        });
        const snapshot = captureJobs.getLoadedSnapshot();
        setPanelPhase(snapshot?.completeness?.complete ? "ready" : "incomplete", formatExportResult(result));
      } catch (error) {
        const snapshot = captureJobs.getLoadedSnapshot();
        setPanelPhase(snapshot?.completeness?.complete ? "ready" : snapshot ? "incomplete" : "idle", error.message || String(error), true);
      }
    }

    function formatExportResult(result) {
      const imageSummary = result.imagesEmbedded || result.imagesFailed
        ? `, ${result.imagesEmbedded} image(s) embedded`
        : "";
      const failedSummary = result.imagesFailed ? `, ${result.imagesFailed} image(s) could not be downloaded and are left as links` : "";
      return `Saved ${result.filename}. ${result.messageCount} message(s), Markdown + PDF + data files${imageSummary}${failedSummary}.`;
    }


    function updateExportButtonLabel() {
      const exportButton = shadow.querySelector("[data-action='export']");
      const snapshot = captureJobs.getLoadedSnapshot();
      exportButton.textContent = snapshot
        ? `Export Loaded ${formatCaptureMode(snapshot.captureMode)} Bundle`
        : "Export Bundle";
    }

    function shouldDownloadDebugLog() {
      return Boolean(shadow.querySelector("[data-option='debug-log']")?.checked);
    }

    function setPanelPhase(nextPhase, message = "", isError = false) {
      panelPhase = nextPhase;
      const isCaptureBusy = nextPhase === "scanning" || nextPhase === "validating";
      const isBusy = isCaptureBusy || nextPhase === "exporting";
      const hasMessages = messages.length > 0;
      const modeSelect = shadow.querySelector("[data-option='capture-mode']");
      const startButton = shadow.querySelector("[data-action='start-scan']");
      const cancelButton = shadow.querySelector("[data-action='cancel-scan']");

      modeSelect.disabled = isBusy;
      startButton.disabled = isBusy || !api;
      startButton.textContent = captureJobs.getLoadedSnapshot() ? "Scan Again" : "Start Scan";
      cancelButton.disabled = !isCaptureBusy;
      cancelButton.hidden = !isCaptureBusy;

      for (const action of shadow.querySelectorAll(".cgce-action")) {
        action.disabled = isBusy || !hasMessages;
      }

      shadow.querySelector(".cgce-panel").classList.toggle("is-busy", isBusy);
      shadow.querySelector(".cgce-panel").dataset.phase = nextPhase;
      updateExportAvailability();

      if (message) {
        setPanelStatus(message, isError);
      }
    }

    function updateExportAvailability() {
      const exportButton = shadow.querySelector("[data-action='export']");
      const snapshot = captureJobs.getLoadedSnapshot();
      const phaseAllowsExport = panelPhase === "ready" || panelPhase === "incomplete";
      const completenessAllowsExport = Boolean(snapshot?.completeness?.complete || allowsIncompleteExport());
      exportButton.disabled = !phaseAllowsExport
        || !snapshot
        || selectedIds.size === 0
        || !completenessAllowsExport;
      updateOverrideVisibility();
    }

    function allowsIncompleteExport() {
      return Boolean(shadow.querySelector("[data-option='allow-incomplete']")?.checked);
    }

    function resetIncompleteOverride() {
      const checkbox = shadow.querySelector("[data-option='allow-incomplete']");

      if (checkbox) {
        checkbox.checked = false;
      }
    }

    function updateOverrideVisibility() {
      const wrapper = shadow.querySelector("[data-control='incomplete-override']");
      const snapshot = captureJobs.getLoadedSnapshot();

      if (wrapper) {
        wrapper.hidden = !snapshot || Boolean(snapshot.completeness?.complete);
      }
    }

    function renderCompletenessReport(report) {
      const container = shadow.querySelector(".cgce-integrity");
      container.replaceChildren();
      container.hidden = !report;

      if (!report) {
        return;
      }

      container.classList.toggle("is-incomplete", !report.complete);
      const heading = document.createElement("strong");
      heading.textContent = report.complete ? "Completeness check passed" : "Incomplete capture";
      const metrics = document.createElement("span");
      metrics.textContent = [
        `${report.captured.uniqueIdentities}/${report.expected.uniqueIdentities} identities`,
        `${report.captured.userMessages}/${report.expected.userMessages} user`,
        `${report.captured.assistantMessages}/${report.expected.assistantMessages} assistant`,
        `${report.images.references} image refs`,
        `${report.images.uniqueIdentities} unique`,
        `${report.images.embedded} embedded`,
        `${report.images.deferred} deferred`,
        `${report.images.failures} failed`
      ].join(" | ");
      container.append(heading, metrics);

      if (report.issues.length) {
        const list = document.createElement("ul");

        for (const issue of report.issues) {
          const item = document.createElement("li");
          item.textContent = issue.message;
          list.append(item);
        }

        container.append(list);
      }

      if (report.warnings.length) {
        const warning = document.createElement("span");
        warning.textContent = report.warnings.map((item) => item.message).join(" ");
        container.append(warning);
      }
    }

    function formatIncompleteCaptureStatus(report) {
      const missing = report?.missingConversationOrders || [];
      const missingSummary = missing.length
        ? ` Missing order(s): ${formatNumberRanges(missing)}.`
        : "";
      return `Incomplete: ${report?.captured?.messages || 0} captured, ${report?.captured?.userMessages || 0} user + ${report?.captured?.assistantMessages || 0} assistant.${missingSummary} Normal export is blocked.`;
    }

    function setPanelStatus(message, isError = false) {
      const status = shadow.querySelector(".cgce-status");
      status.textContent = message || "";
      status.classList.toggle("is-error", isError);
    }

    function getSelectorPanelMarkup() {
      return `
        <style>
          :host {
            all: initial;
            color-scheme: light;
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }

          .cgce-panel {
            position: fixed;
            top: 18px;
            right: 18px;
            bottom: 18px;
            z-index: 2147483647;
            width: min(430px, calc(100vw - 36px));
            display: grid;
            grid-template-rows: auto auto 1fr auto;
            overflow: hidden;
            background: #ffffff;
            border: 1px solid #d7dde8;
            border-radius: 8px;
            box-shadow: 0 24px 70px rgba(15, 23, 42, 0.24);
            color: #111827;
          }

          .cgce-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
            padding: 16px 16px 12px;
            border-bottom: 1px solid #e6eaf0;
          }

          .cgce-title {
            margin: 0;
            font-size: 16px;
            line-height: 1.25;
            font-weight: 700;
          }

          .cgce-subtitle {
            margin: 4px 0 0;
            max-width: 300px;
            font-size: 12px;
            line-height: 1.4;
            color: #5b6472;
          }

          .cgce-icon-buttons {
            display: flex;
            gap: 6px;
          }

          .cgce-icon-button {
            width: 32px;
            height: 32px;
            border: 1px solid #d7dde8;
            border-radius: 6px;
            background: #ffffff;
            color: #243042;
            font-size: 18px;
            line-height: 1;
            cursor: pointer;
          }

          .cgce-icon-button:disabled {
            cursor: wait;
            opacity: 0.55;
          }

          .cgce-actions {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 8px;
            padding: 12px 16px;
            border-bottom: 1px solid #e6eaf0;
            background: #f8fafc;
          }

          .cgce-action {
            min-height: 32px;
            border: 1px solid #cfd7e3;
            border-radius: 6px;
            background: #ffffff;
            color: #172033;
            font-size: 12px;
            font-weight: 650;
            cursor: pointer;
          }

          .cgce-list {
            overflow: auto;
            min-height: 0;
            padding: 6px 8px 8px;
            background: #ffffff;
          }

          .cgce-message {
            display: grid;
            grid-template-columns: 14px 1fr;
            gap: 6px;
            align-items: center;
            padding: 4px 6px;
            margin: 0 0 3px;
            border: 1px solid #e3e8f0;
            border-radius: 4px;
            background: #ffffff;
            cursor: pointer;
          }

          .cgce-message:hover {
            border-color: #9aa8bb;
            background: #f9fbfd;
          }

          .cgce-message input {
            width: 13px;
            height: 13px;
            margin: 0;
            accent-color: #0f766e;
          }

          .cgce-message-content {
            min-width: 0;
            display: grid;
            grid-template-columns: auto minmax(0, 1fr) auto;
            gap: 5px;
            align-items: center;
          }

          .cgce-message-meta {
            display: contents;
          }

          .cgce-role {
            display: inline-flex;
            align-items: center;
            min-height: 16px;
            padding: 0 5px;
            border-radius: 999px;
            background: #eef6f5;
            color: #0f766e;
            font-size: 9px;
            font-weight: 750;
            text-transform: uppercase;
            letter-spacing: 0;
          }

          .cgce-message-assistant .cgce-role {
            background: #eff4ff;
            color: #3159a8;
          }

          .cgce-stats {
            overflow: hidden;
            color: #64748b;
            font-size: 10px;
            white-space: nowrap;
            text-overflow: ellipsis;
          }

          .cgce-preview {
            display: block;
            overflow: hidden;
            color: #1f2937;
            font-size: 11px;
            line-height: 1.25;
            white-space: nowrap;
            text-overflow: ellipsis;
          }

          .cgce-footer {
            display: grid;
            gap: 10px;
            padding: 12px 16px 14px;
            border-top: 1px solid #e6eaf0;
            background: #ffffff;
          }

          .cgce-status {
            min-height: 17px;
            color: #4b5563;
            font-size: 12px;
            line-height: 1.35;
          }

          .cgce-status.is-error {
            color: #b42318;
          }

          .cgce-integrity {
            display: grid;
            gap: 4px;
            padding: 9px 10px;
            border: 1px solid #b7dfd7;
            border-radius: 6px;
            background: #f0fdfa;
            color: #134e4a;
            font-size: 11px;
            line-height: 1.4;
          }

          .cgce-integrity.is-incomplete {
            border-color: #f2b8b5;
            background: #fff5f4;
            color: #8a1c13;
          }

          .cgce-integrity ul {
            margin: 2px 0 0;
            padding-left: 18px;
          }

          [hidden] {
            display: none !important;
          }

          .cgce-option {
            display: flex;
            align-items: center;
            gap: 8px;
            color: #334155;
            font-size: 12px;
            line-height: 1.3;
          }

          .cgce-option input {
            width: 14px;
            height: 14px;
            margin: 0;
            accent-color: #0f766e;
          }

          .cgce-footer-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 10px;
            align-items: center;
          }

          .cgce-format {
            display: grid;
            grid-template-columns: auto minmax(110px, 1fr);
            gap: 8px;
            align-items: center;
            color: #334155;
            font-size: 12px;
          }

          .cgce-select,
          .cgce-input {
            min-height: 32px;
            min-width: 0;
            border: 1px solid #cfd7e3;
            border-radius: 6px;
            background: #ffffff;
            color: #172033;
            font: inherit;
            font-size: 13px;
          }

          .cgce-select {
            padding: 0 8px;
          }

          .cgce-input {
            box-sizing: border-box;
            width: 100%;
            padding: 0 10px;
          }

          .cgce-scan-controls {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 8px;
          }

          .cgce-scan,
          .cgce-cancel {
            min-height: 36px;
            border: 1px solid #0f766e;
            border-radius: 7px;
            background: #ffffff;
            color: #0f766e;
            font-size: 13px;
            font-weight: 750;
            cursor: pointer;
          }

          .cgce-scan {
            background: #0f766e;
            color: #ffffff;
          }

          .cgce-cancel {
            border-color: #cfd7e3;
            color: #334155;
          }

          .cgce-scan:disabled,
          .cgce-cancel:disabled,
          .cgce-action:disabled,
          .cgce-select:disabled {
            cursor: not-allowed;
            opacity: 0.58;
          }

          .cgce-export {
            min-height: 40px;
            border: 0;
            border-radius: 7px;
            background: #0f766e;
            color: #ffffff;
            font-size: 14px;
            font-weight: 750;
            cursor: pointer;
          }

          .cgce-export:disabled {
            cursor: not-allowed;
            opacity: 0.58;
          }

          .cgce-empty {
            padding: 18px;
            color: #64748b;
            font-size: 13px;
            text-align: center;
          }

          @media (max-width: 520px) {
            .cgce-panel {
              inset: 0;
              width: auto;
              border-radius: 0;
            }

            .cgce-footer-row {
              grid-template-columns: 1fr;
            }
          }
        </style>
        <aside class="cgce-panel" aria-label="ChatGPT export message selector">
          <header class="cgce-header">
            <div>
              <h2 class="cgce-title">Select messages <span style="font-size: 11px; font-weight: 500; color: #64748b; margin-left: 6px;">v${EXPORTER_VERSION}</span></h2>
              <p class="cgce-subtitle">Choose a capture mode, review loaded turns, then export the bundle.</p>
            </div>
            <div class="cgce-icon-buttons">
              <button class="cgce-icon-button" type="button" data-action="close" title="Close" aria-label="Close">X</button>
            </div>
          </header>
          <div class="cgce-actions" aria-label="Selection tools">
            <button class="cgce-action" type="button" data-action="select-all">All</button>
            <button class="cgce-action" type="button" data-action="select-users">Questions</button>
            <button class="cgce-action" type="button" data-action="select-assistants">Answers</button>
            <button class="cgce-action" type="button" data-action="invert">Invert</button>
          </div>
          <div class="cgce-list" role="list"></div>
          <footer class="cgce-footer">
            <div class="cgce-status" role="status" aria-live="polite"></div>
            <div class="cgce-integrity" hidden></div>
            <div class="cgce-footer-row">
              <label class="cgce-format">
                <span>Mode</span>
                <select class="cgce-select" data-option="capture-mode">
                  <option value="fast" selected>Fast (Recommended)</option>
                  <option value="hybrid">Hybrid (Fast + page details)</option>
                  <option value="full">Full (page scan only)</option>
                </select>
              </label>
              <label class="cgce-option">
                <input type="checkbox" data-option="debug-log">
                <span>Debug log</span>
              </label>
            </div>
            <div class="cgce-scan-controls">
              <button class="cgce-scan" type="button" data-action="start-scan">Start Scan</button>
              <button class="cgce-cancel" type="button" data-action="cancel-scan" hidden disabled>Cancel</button>
            </div>
            <label class="cgce-option" data-control="incomplete-override" hidden>
              <input type="checkbox" data-option="allow-incomplete">
              <span>Export this incomplete snapshot anyway</span>
            </label>
            <button class="cgce-export" type="button" data-action="export" disabled>Export Bundle</button>
          </footer>
        </aside>
      `;
    }
  }

  function createMessageCollector(debugLog = null) {
    const messagesByKey = new Map();
    const capturedStableKeys = new Set();
    const unitOrder = createDomOrderRegistry();
    let sequence = 0;

    return {
      async captureFromDom(options = {}) {
        const signal = options.signal || null;
        throwIfCaptureCancelled(signal);
        const settleMs = Number.isFinite(options.settleMs) ? Math.max(0, options.settleMs) : CAPTURE_SETTLE_MS;

        if (settleMs) {
          await sleep(settleMs);
          throwIfCaptureCancelled(signal);
        }

        const nodes = options.nodes || getCandidateMessageNodes(debugLog);
        unitOrder.observe(nodes
          .filter(isChatGptMessageUnit)
          .map((node) => getChatGptMessageUnitInfo(node)?.messageIds[0] || ""));

        for (const node of nodes) {
          throwIfCaptureCancelled(signal);
          const stableKey = getStableNodeKey(node);
          const existingByStableKey = stableKey && capturedStableKeys.has(stableKey) ? messagesByKey.get(stableKey) : null;
          const shouldRevisit = shouldRevisitMessageNode(node) || shouldRevisitCapturedMessage(node, existingByStableKey);

          if (existingByStableKey && !shouldRevisit) {
            debugLog?.candidateDuplicate(node, "collector", "stable node key already captured");
            continue;
          }

          const roleDetails = detectRoleDetails(node, sequence);
          const role = roleDetails.role;
          const parts = getMessageParts(node, role);
          const key = getMessageKey(node, role, parts);
          const existingMessage = messagesByKey.get(key) || existingByStableKey || null;

          if (existingMessage && !shouldRevisit) {
            debugLog?.candidateDuplicate(node, "collector", "message key already captured");
            continue;
          }

          const message = await extractMessage(node, parts, role, sequence);

          if (isLikelyNonMessageMarkdown(message)) {
            debugLog?.messageEmpty(node, role, parts.body, "serialized content matched non-message disclaimer/system text", parts);
            continue;
          }

          if (message?.markdown || message?.thinkingMarkdown || message?.codeBlockCount || message?.imageCount || message?.fileCount) {
            message.id = key;
            const mergedMessage = mergeMessageAttachments(message, existingMessage);
            mergedMessage.preview = messageExtractor.preview(mergedMessage);
            if (!existingMessage || isMessageRicher(mergedMessage, existingMessage)) {
              messagesByKey.set(key, mergedMessage);
              if (stableKey) {
                messagesByKey.set(stableKey, mergedMessage);
                capturedStableKeys.add(stableKey);
              }
              debugLog?.messageExtracted(mergedMessage, parts.body, roleDetails.reason);

              if (isLastTurnNode(node)) {
                debugLog?.lastTurn("updated", node, mergedMessage, parts, roleDetails.reason);
              }

              if (!existingMessage) {
                sequence += 1;
              }
            } else {
              debugLog?.candidateDuplicate(node, "collector", "revisited turn was not richer than captured message");

              if (isLastTurnNode(node)) {
                debugLog?.lastTurn("revisited-not-richer", node, message, parts, roleDetails.reason);
              }
            }
          } else {
            debugLog?.messageEmpty(node, role, parts.body, "no markdown, thinking, code, or image content after serialization", parts);

            if (isLastTurnNode(node)) {
              debugLog?.lastTurn("empty", node, message, parts, roleDetails.reason);
            }
          }
        }
      },

      getMessages() {
        const messages = uniqueMessages([...messagesByKey.values()]);

        // Message units carry no global turn number, so their order comes from
        // the id sequence observed across scroll batches.
        for (const message of messages) {
          const rank = isChatGptMessageUnit(message.sourceNode) ? unitOrder.rank(message.sourceMessageId) : NaN;

          if (Number.isFinite(rank)) {
            message.order = rank;
          }
        }

        return messages.sort((a, b) => a.order - b.order);
      },

      getMessageCount() {
        return uniqueMessages([...messagesByKey.values()]).length;
      },

      hasCapturedNode(node) {
        const stableKey = getStableNodeKey(node);
        return Boolean(stableKey && capturedStableKeys.has(stableKey));
      }
    };
  }

  function uniqueMessages(messages) {
    const seen = new Set();
    const result = [];

    for (const message of messages) {
      if (!message || seen.has(message)) {
        continue;
      }

      seen.add(message);
      result.push(message);
    }

    return result;
  }

  function finalizeCollectedMessages(messages, debugLog = null) {
    const sorted = dedupeMessagesByTurnRoleOverlap(
      dedupeMessagesByContentIdentity(uniqueMessages(messages), debugLog),
      debugLog
    )
      .sort((a, b) => a.order - b.order);
    const roleSequence = getRoleSequenceDiagnostics(sorted);

    if (roleSequence.sameRolePairs.length || !roleSequence.balancedPairs) {
      debugLog?.event("roleSequence.warning", roleSequence);
    }

    sorted.forEach((message) => {
      if (message.originalOrder == null) {
        message.originalOrder = message.order;
      }
    });

    return sorted;
  }

  function dedupeMessagesByTurnRoleOverlap(messages, debugLog = null) {
    const result = [];

    for (const message of messages) {
      const duplicateIndex = result.findIndex((existing) => isSameTurnRoleOverlap(message, existing));

      if (duplicateIndex < 0) {
        result.push(message);
        continue;
      }

      const existing = result[duplicateIndex];
      const merged = chooseDuplicateMessageWinner(message, existing);
      result[duplicateIndex] = merged;
      debugLog?.event("message.sameTurnOverlapMerged", {
        order: message.order,
        role: message.role,
        keptId: merged.id,
        droppedId: merged === message ? existing.id : message.id
      });
    }

    return result;
  }

  function isSameTurnRoleOverlap(nextMessage, previousMessage) {
    const nextKey = getMessageTurnRoleKey(nextMessage);

    if (!nextKey || nextKey !== getMessageTurnRoleKey(previousMessage)) {
      return false;
    }

    return isMessageContentSubset(nextMessage, previousMessage)
      || isMessageContentSubset(previousMessage, nextMessage);
  }

  function getMessageTurnRoleKey(message) {
    const order = Number(message?.order);

    if (!Number.isFinite(order) || order <= 0) {
      return "";
    }

    return `${order}|${message.role || "unknown"}`;
  }

  function isMessageContentSubset(candidate, container) {
    const candidateMarkdown = normalizeMessageDedupeText(candidate?.markdown);
    const containerMarkdown = normalizeMessageDedupeText(container?.markdown);
    const candidateThinking = normalizeMessageDedupeText(candidate?.thinkingMarkdown);
    const containerThinking = normalizeMessageDedupeText(container?.thinkingMarkdown);

    if (candidateThinking && candidateThinking !== containerThinking && !containerThinking.includes(candidateThinking)) {
      return false;
    }

    if (!candidateMarkdown) {
      return true;
    }

    return Boolean(containerMarkdown && containerMarkdown.includes(candidateMarkdown));
  }

  function dedupeMessagesByContentIdentity(messages, debugLog = null) {
    const messagesByIdentity = new Map();
    const messagesWithoutIdentity = [];

    for (const message of messages) {
      const identity = getMessageContentIdentity(message);

      if (!identity) {
        messagesWithoutIdentity.push(message);
        continue;
      }

      const existing = messagesByIdentity.get(identity);

      if (!existing) {
        messagesByIdentity.set(identity, message);
        continue;
      }

      const merged = chooseDuplicateMessageWinner(message, existing);
      messagesByIdentity.set(identity, merged);
      debugLog?.event("message.duplicateContentMerged", {
        order: message.order,
        role: message.role,
        keptId: merged.id,
        droppedId: merged === message ? existing.id : message.id
      });
    }

    return [...messagesByIdentity.values(), ...messagesWithoutIdentity];
  }

  function getMessageContentIdentity(message) {
    if (!message) {
      return "";
    }

    const order = Number(message.order);

    if (!Number.isFinite(order) || order <= 0) {
      return "";
    }

    const role = message.role || "unknown";
    const markdownHash = hashString(normalizeMessageDedupeText(message.markdown));
    const thinkingHash = hashString(normalizeMessageDedupeText(message.thinkingMarkdown));

    return `${order}|${role}|${markdownHash}|${thinkingHash}`;
  }

  function normalizeMessageDedupeText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function chooseDuplicateMessageWinner(nextMessage, previousMessage) {
    const nextIsRicher = isMessageRicher(nextMessage, previousMessage);
    const previousIsRicher = isMessageRicher(previousMessage, nextMessage);

    if (nextIsRicher && !previousIsRicher) {
      return mergeMessageAttachments(nextMessage, previousMessage);
    }

    const nextHasStableId = !String(nextMessage.id || "").startsWith("fingerprint:");
    const previousHasStableId = !String(previousMessage.id || "").startsWith("fingerprint:");

    if (nextHasStableId && !previousHasStableId) {
      return mergeMessageAttachments(nextMessage, previousMessage);
    }

    return mergeMessageAttachments(previousMessage, nextMessage);
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

  async function loadOlderMessages(scrollTarget, collector, debugLog = null, deadline = Infinity, budget = null, signal = null) {
    let stableAtTopCount = 0;
    let previousSignature = getConversationSignature(scrollTarget);
    await collector.captureFromDom({ signal });

    for (let attempt = 0; attempt < TOP_LOAD_ATTEMPTS; attempt += 1) {
      throwIfCaptureCancelled(signal);
      if (Date.now() >= deadline) {
        debugLog?.progress("loadOlder.timeout", { attempt, maxScanMs: budget?.maxScanMs || MAX_SCAN_MS });
        break;
      }

      const top = getScrollTop(scrollTarget);
      const step = Math.max(Math.floor(getClientHeight(scrollTarget) * 4.2), 2600);
      const shouldJumpToTop = attempt === 0 || attempt % 4 === 3 || top <= step;
      setScrollTop(scrollTarget, shouldJumpToTop ? 0 : Math.max(0, top - step));
      await waitForScrollAndDomIdle();
      throwIfCaptureCancelled(signal);

      if (getScrollTop(scrollTarget) <= 80) {
        setScrollTop(scrollTarget, 0);
        await waitForScrollAndDomIdle(90);
      }

      await collector.captureFromDom({ settleMs: 0, signal });

      const currentSignature = getConversationSignature(scrollTarget);
      const atTop = getScrollTop(scrollTarget) <= 2;
      debugLog?.progress("loadOlder", {
        attempt,
        top: getScrollTop(scrollTarget),
        scrollHeight: getScrollHeight(scrollTarget),
        stableAtTopCount
      });

      if (atTop && currentSignature === previousSignature) {
        stableAtTopCount += 1;
      } else {
        stableAtTopCount = 0;
      }

      previousSignature = currentSignature;

      if (stableAtTopCount >= TOP_STABLE_PASSES) {
        break;
      }
    }
  }

  async function walkConversation(scrollTarget, collector, debugLog = null, deadline = Infinity, budget = null, signal = null) {
    let stuckCount = 0;
    let bottomStableCount = 0;
    let previousSignature = "";
    let maxAttempts = getWalkAttemptLimit(scrollTarget);

    await collector.captureFromDom({ settleMs: 0, signal });

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      throwIfCaptureCancelled(signal);
      if (Date.now() >= deadline) {
        debugLog?.progress("walk.timeout", {
          attempt,
          maxScanMs: budget?.maxScanMs || MAX_SCAN_MS,
          hydrateReservedMs: budget?.hydrateReservedMs || HYDRATE_RESERVED_MS
        });
        break;
      }

      const top = getScrollTop(scrollTarget);
      const maxTop = getMaxScrollTop(scrollTarget);

      if (maxTop - top <= 4) {
        bottomStableCount += 1;

        if (bottomStableCount >= 2) {
          break;
        }

        await waitForScrollAndDomIdle(90);
        throwIfCaptureCancelled(signal);
        await collector.captureFromDom({ settleMs: 0, signal });
        continue;
      }

      bottomStableCount = 0;
      const step = getWalkScrollStep(scrollTarget);
      setScrollTop(scrollTarget, Math.min(top + step, maxTop));
      await waitForScrollAndDomIdle();
      throwIfCaptureCancelled(signal);

      if (Date.now() >= deadline) {
        debugLog?.progress("walk.timeoutAfterWait", {
          attempt,
          maxScanMs: budget?.maxScanMs || MAX_SCAN_MS,
          hydrateReservedMs: budget?.hydrateReservedMs || HYDRATE_RESERVED_MS
        });
        break;
      }

      await collector.captureFromDom({ settleMs: 0, signal });

      const newTop = getScrollTop(scrollTarget);
      const currentSignature = getConversationSignature(scrollTarget);
      stuckCount = Math.abs(newTop - top) <= 2 && currentSignature === previousSignature ? stuckCount + 1 : 0;
      previousSignature = currentSignature;
      maxAttempts = Math.min(WALK_ATTEMPTS, Math.max(maxAttempts, getWalkAttemptLimit(scrollTarget)));
      debugLog?.progress("walk", {
        attempt,
        maxAttempts,
        top,
        newTop,
        maxTop,
        stuckCount
      });

      if (stuckCount >= 4) {
        break;
      }
    }
  }

  function getWalkScrollStep(scrollTarget) {
    return Math.max(Math.floor(getClientHeight(scrollTarget) * 0.85), 650);
  }

  function getWalkAttemptLimit(scrollTarget) {
    const step = getWalkScrollStep(scrollTarget);
    const estimated = Math.ceil(getMaxScrollTop(scrollTarget) / Math.max(1, step)) + 16;
    return Math.min(WALK_ATTEMPTS, Math.max(20, estimated));
  }

  async function hydrateVirtualizedTurns(collector, debugLog = null, deadline = Infinity, budget = null, signal = null) {
    const allTurns = orderTurnsForHydration(getAllTurnNodes());
    const turns = getTurnsNeedingHydration(allTurns, collector);

    debugLog?.progress("hydrate.start", {
      totalTurns: allTurns.length,
      pendingTurns: turns.length,
      capturedMessages: collector.getMessageCount(),
      emptyTurns: allTurns.filter((turn) => !hasMountedMessageText(turn)).length
    });

    for (let index = 0; index < turns.length; index += 1) {
      throwIfCaptureCancelled(signal);
      if (Date.now() >= deadline) {
        debugLog?.progress("hydrate.timeout", {
          index,
          totalTurns: turns.length,
          maxScanMs: budget?.maxScanMs || MAX_SCAN_MS,
          hydrateReservedMs: budget?.hydrateReservedMs || HYDRATE_RESERVED_MS
        });
        break;
      }

      const turn = turns[index];

      if (!turn?.isConnected) {
        continue;
      }

      if (collector.hasCapturedNode(turn)) {
        continue;
      }

      const beforeTextLength = getRawElementText(turn).length;
      const beforeHasMountedText = hasMountedMessageText(turn);
      const hydrationResult = await hydrateSingleTurn(turn, collector, deadline, signal);

      debugLog?.progress("hydrate.turn", {
        index,
        totalTurns: turns.length,
        testId: turn.getAttribute("data-testid") || "",
        turnId: getTurnId(turn),
        beforeTextLength,
        afterTextLength: hydrationResult.afterTextLength,
        beforeHasMountedText,
        afterHasMountedText: hydrationResult.afterHasMountedText,
        attempts: hydrationResult.attempts
      });
    }
  }

  async function hydrateSingleTurn(turn, collector, deadline = Infinity, signal = null) {
    const attempts = [
      { block: "center", waitMs: TURN_HYDRATION_SETTLE_MS },
      { block: "start", waitMs: 150 },
      { block: "end", waitMs: 180 }
    ];
    let afterTextLength = getRawElementText(turn).length;
    let afterHasMountedText = hasMountedMessageText(turn);
    let attemptsUsed = 0;

    for (const attempt of attempts) {
      throwIfCaptureCancelled(signal);
      if (Date.now() >= deadline || collector.hasCapturedNode(turn)) {
        break;
      }

      turn.scrollIntoView({
        behavior: "auto",
        block: attempt.block,
        inline: "nearest"
      });
      await waitForScrollAndDomIdle(attempt.waitMs);
      throwIfCaptureCancelled(signal);
      await collector.captureFromDom({ settleMs: 0, nodes: [turn], signal });
      attemptsUsed += 1;
      afterTextLength = getRawElementText(turn).length;
      afterHasMountedText = hasMountedMessageText(turn);

      if (afterHasMountedText || collector.hasCapturedNode(turn)) {
        break;
      }
    }

    return {
      afterTextLength,
      afterHasMountedText,
      attempts: attemptsUsed
    };
  }

  async function recoverMissingTurnMessages(scrollTarget, collector, debugLog = null, deadline = Infinity, budgetMs = MISSING_TURN_RECOVERY_MS, signal = null, options = {}) {
    const expectedOrders = options?.expectedOrders || null;
    let missingOrders = getMissingConversationTurnOrders(collector.getMessages(), expectedOrders);

    debugLog?.progress("missingRecovery.start", {
      missingOrders,
      capturedMessages: collector.getMessageCount(),
      recoveryBudgetMs: budgetMs
    });

    if (!missingOrders.length) {
      return;
    }

    for (let pass = 0; pass < 3 && missingOrders.length && Date.now() < deadline; pass += 1) {
      throwIfCaptureCancelled(signal);
      for (const order of missingOrders) {
        throwIfCaptureCancelled(signal);
        if (Date.now() >= deadline) {
          break;
        }

        let turn = findBestTurnNodeByOrder(order);

        if (!turn) {
          await scrollNearTurnOrder(scrollTarget, order, options?.maxKnownOrder || 0);
          await collector.captureFromDom({ settleMs: 0, signal });
          turn = findBestTurnNodeByOrder(order);
        }

        if (!turn) {
          const currentTop = getScrollTop(scrollTarget);
          const offset = Math.floor(getClientHeight(scrollTarget) * 0.75);
          setScrollTop(scrollTarget, Math.max(0, currentTop - offset));
          await waitForScrollAndDomIdle(160);
          await collector.captureFromDom({ settleMs: 0, signal });
          turn = findBestTurnNodeByOrder(order);

          if (!turn) {
            setScrollTop(scrollTarget, Math.min(getMaxScrollTop(scrollTarget), currentTop + offset));
            await waitForScrollAndDomIdle(160);
            await collector.captureFromDom({ settleMs: 0, signal });
            turn = findBestTurnNodeByOrder(order);
          }
        }

        if (!turn?.isConnected) {
          debugLog?.progress("missingRecovery.noNode", { pass, order });
          continue;
        }

        const beforeCount = collector.getMessageCount();
        const beforeTextLength = getRawElementText(turn).length;
        const beforeHasMountedText = hasMountedMessageText(turn);
        const hydrationResult = await hydrateSingleTurn(turn, collector, deadline, signal);
        await collector.captureFromDom({ settleMs: 0, nodes: [turn], signal });
        const captured = !getMissingConversationTurnOrders(collector.getMessages(), expectedOrders).includes(order);

        debugLog?.progress("missingRecovery.turn", {
          pass,
          order,
          captured,
          beforeCount,
          afterCount: collector.getMessageCount(),
          testId: turn.getAttribute("data-testid") || "",
          turnId: getTurnId(turn),
          beforeTextLength,
          afterTextLength: hydrationResult.afterTextLength,
          beforeHasMountedText,
          afterHasMountedText: hydrationResult.afterHasMountedText,
          attempts: hydrationResult.attempts
        });
      }

      missingOrders = getMissingConversationTurnOrders(collector.getMessages(), expectedOrders);
    }

    debugLog?.progress("missingRecovery.finish", {
      missingOrders,
      capturedMessages: collector.getMessageCount(),
      recoveryBudgetMs: budgetMs
    });
  }

  function getMissingConversationTurnOrders(messages, expectedOrders = null) {
    const availableOrders = getAvailableConversationTurnOrders();
    const capturedOrders = new Set(messages
      .map((message) => Number(message.order))
      .filter((order) => Number.isFinite(order) && order > 0 && order < 1_000_000));

    if (Array.isArray(expectedOrders) && expectedOrders.length) {
      return expectedOrders.filter((order) => !capturedOrders.has(order));
    }

    const allDiscoveredOrders = [...new Set([
      ...availableOrders,
      ...capturedOrders
    ])].sort((a, b) => a - b);

    if (!allDiscoveredOrders.length) {
      return [];
    }

    const maxOrder = allDiscoveredOrders[allDiscoveredOrders.length - 1];
    if (maxOrder > 0 && maxOrder < 1_000_000) {
      const canonicalOrders = Array.from({ length: maxOrder }, (_, index) => index + 1);
      return canonicalOrders.filter((order) => !capturedOrders.has(order));
    }

    return availableOrders.filter((order) => !capturedOrders.has(order));
  }

  function getAvailableConversationTurnOrders() {
    return [...new Set(getAllTurnNodes()
      .map((turn) => getConversationTurnNumber(turn))
      .filter((order) => Number.isFinite(order) && order > 0 && order < 1_000_000))]
      .sort((a, b) => a - b);
  }

  function findBestTurnNodeByOrder(order) {
    const candidates = getAllTurnNodes()
      .filter((turn) => getConversationTurnNumber(turn) === order);

    if (!candidates.length) {
      return null;
    }

    return candidates
      .map((turn) => ({
        turn,
        score: getTurnRecoveryScore(turn)
      }))
      .sort((a, b) => b.score - a.score)[0].turn;
  }

  function getTurnRecoveryScore(turn) {
    const textLength = getRawElementText(turn).length;
    const messageIds = turn.querySelectorAll?.("[data-message-id]")?.length || 0;
    const roleHints = turn.querySelectorAll?.("[data-message-author-role], [data-testid*='message' i], .markdown, [class*='markdown'], [class*='prose']")?.length || 0;

    return textLength
      + messageIds * 2000
      + roleHints * 250
      + (hasMountedMessageText(turn) ? 1000 : 0)
      + (getPotentialMessageNodeResult(turn).ok ? 500 : 0);
  }

  async function scrollNearTurnOrder(scrollTarget, order, maxKnownOrder = 0) {
    const orders = getAvailableConversationTurnOrders();
    const first = 1;
    const last = Math.max(orders[orders.length - 1] || order, maxKnownOrder || order, 1);
    const span = Math.max(1, last - first);
    const ratio = Math.min(1, Math.max(0, (order - first) / span));
    setScrollTop(scrollTarget, Math.round(getMaxScrollTop(scrollTarget) * ratio));
    await waitForScrollAndDomIdle(240);
  }

  function getTurnsNeedingHydration(turns, collector) {
    if (!turns.length || collector.getMessageCount() >= turns.length) {
      return [];
    }

    return turns.filter((turn) => turn?.isConnected && !collector.hasCapturedNode(turn));
  }

  function orderTurnsForHydration(turns) {
    return [...turns].sort((a, b) => {
      const aMounted = hasMountedMessageText(a);
      const bMounted = hasMountedMessageText(b);

      if (aMounted !== bMounted) {
        return aMounted ? 1 : -1;
      }

      return compareDocumentOrder(a, b);
    });
  }

  function hasMountedMessageText(turn) {
    if (!turn?.isConnected) {
      return false;
    }

    if (turn.querySelector("[data-message-author-role], .markdown, [class*='markdown'], [class*='prose'], [data-start], pre, code, img, picture, canvas")) {
      return getRawElementText(turn).length > 0 || Boolean(turn.querySelector("img, picture, canvas, pre, code"));
    }

    return getRawElementText(turn).length > 0;
  }
  async function waitForScrollAndDomIdle(ms = SCROLL_SETTLE_MS) {
    await sleep(ms);
    await waitForConversationDomIdle();
  }

  function waitForConversationDomIdle(idleMs = DOM_IDLE_MS, maxMs = MAX_DOM_IDLE_MS) {
    const root = document.querySelector("main") || document.body;

    if (!root) {
      return sleep(idleMs);
    }

    return new Promise((resolve) => {
      let finished = false;
      let idleTimer = null;
      const observer = new MutationObserver(scheduleFinish);
      const finish = () => {
        if (finished) {
          return;
        }

        finished = true;
        window.clearTimeout(idleTimer);
        window.clearTimeout(maxTimer);
        observer.disconnect();
        resolve();
      };
      const maxTimer = window.setTimeout(finish, maxMs);

      function scheduleFinish() {
        window.clearTimeout(idleTimer);
        idleTimer = window.setTimeout(finish, idleMs);
      }

      observer.observe(root, {
        attributes: true,
        childList: true,
        subtree: true
      });
      scheduleFinish();
    });
  }

  function getConversationSignature(scrollTarget) {
    const nodes = getCandidateMessageNodes();
    const first = nodes[0];
    const last = nodes[nodes.length - 1];

    return [
      Math.round(getScrollTop(scrollTarget)),
      Math.round(getScrollHeight(scrollTarget)),
      nodes.length,
      first ? getNodeSignature(first) : "",
      last ? getNodeSignature(last) : ""
    ].join("|");
  }

  function getNodeSignature(node) {
    return [
      getTurnId(node),
      node.getAttribute("data-turn-container") || "",
      node.getAttribute("data-turn-id-container") || "",
      node.getAttribute("data-testid") || "",
      node.querySelector("[data-message-id]")?.getAttribute("data-message-id") || "",
      getElementText(node).slice(0, 120)
    ].join(":");
  }

  function getCandidateMessageNodes(debugLog = null) {
    const primaryTurnNodes = getPrimaryTurnMessageNodes(debugLog);

    if (primaryTurnNodes.length) {
      return primaryTurnNodes;
    }

    let nodes = [];

    // Data attributes are strongest, semantic article nodes are broad fallback,
    // and conversation-turn class fragments cover recent Tailwind-style builds.
    for (const selector of MESSAGE_NODE_SELECTORS) {
      const elements = [...document.querySelectorAll(selector)];
      debugLog?.selectorHit(selector, elements.length);

      for (const element of elements) {
        if (isHiddenCaptureCandidate(element)) {
          debugLog?.candidateFiltered(element, selector, "hidden or inactive candidate");
          continue;
        }

        const normalized = normalizeMessageNode(element);

        if (!normalized) {
          debugLog?.candidateFiltered(element, selector, "normalize returned null");
          continue;
        }

        if (isHiddenCaptureCandidate(normalized)) {
          debugLog?.candidateFiltered(element, selector, "normalized candidate is hidden or inactive", normalized);
          continue;
        }

        const potential = getPotentialMessageNodeResult(normalized);

        if (!potential.ok) {
          debugLog?.candidateFiltered(element, selector, potential.reason, normalized);
          continue;
        }

        debugLog && (debugLog.stats.normalizedCandidates += 1);
        nodes = addCandidateMessageNode(nodes, normalized, selector, debugLog);
      }
    }

    return nodes.sort(compareDocumentOrder);
  }

  function getPrimaryTurnMessageNodes(debugLog = null) {
    const turns = getAllTurnNodes();
    const nodes = [];

    debugLog?.selectorHit("primary-turn-nodes", turns.length);

    for (const turn of turns) {
      if (isHiddenCaptureCandidate(turn)) {
        debugLog?.candidateFiltered(turn, "primary-turn-nodes", "hidden or inactive turn", turn);
        continue;
      }

      const potential = getPotentialMessageNodeResult(turn);

      if (!potential.ok) {
        debugLog?.candidateFiltered(turn, "primary-turn-nodes", potential.reason, turn);
        continue;
      }

      nodes.push(turn);
      debugLog?.candidateAccepted(turn, "primary-turn-nodes", "");
    }

    return nodes.sort(compareDocumentOrder);
  }

  function addCandidateMessageNode(nodes, candidate, selector = "", debugLog = null) {
    const candidateScore = scoreMessageNodeSpecificity(candidate);
    const nextNodes = [];
    let shouldAdd = true;

    for (const existing of nodes) {
      if (existing === candidate) {
        shouldAdd = false;
        debugLog?.candidateDuplicate(candidate, selector, "same normalized node");
        nextNodes.push(existing);
        continue;
      }

      if (existing.contains(candidate)) {
        if (isTurnNode(existing)) {
          shouldAdd = false;
          debugLog?.candidateDuplicate(candidate, selector, "contained by accepted turn node");
          nextNodes.push(existing);
          continue;
        }

        const existingScore = scoreMessageNodeSpecificity(existing);

        if (candidateScore >= existingScore || isLikelyBroadMessageShell(existing, candidate)) {
          debugLog?.candidateDuplicate(existing, selector, "replaced broader existing node with more specific candidate");
          nextNodes.push(candidate);
        } else {
          shouldAdd = false;
          debugLog?.candidateDuplicate(candidate, selector, "contained by stronger existing node");
          nextNodes.push(existing);
        }

        continue;
      }

      if (candidate.contains(existing)) {
        if (isTurnNode(candidate)) {
          debugLog?.candidateDuplicate(existing, selector, "replaced child node with turn node");
          continue;
        }

        const existingScore = scoreMessageNodeSpecificity(existing);

        if (candidateScore > existingScore && !isLikelyBroadMessageShell(candidate, existing)) {
          debugLog?.candidateDuplicate(existing, selector, "removed weaker existing child node");
          continue;
        }

        shouldAdd = false;
        debugLog?.candidateDuplicate(candidate, selector, "candidate is broader than existing node");
        nextNodes.push(existing);
        continue;
      }

      nextNodes.push(existing);
    }

    if (shouldAdd && !nextNodes.includes(candidate)) {
      nextNodes.push(candidate);
      debugLog?.candidateAccepted(candidate, selector, detectRole(candidate, 0));
    }

    return uniqueElements(nextNodes);
  }

  function normalizeMessageNode(element) {
    if (isTurnNode(element)) {
      return getTurnRootNode(element);
    }

    const conversationTurn = getClosestTurnNode(element);

    if (conversationTurn) {
      return getTurnRootNode(conversationTurn);
    }

    if (element.matches("[data-message-author-role]")) {
      return getRoleMessageBoundary(element);
    }

    const roleContainer = element.closest("[data-message-author-role]");

    if (roleContainer) {
      return getRoleMessageBoundary(roleContainer);
    }

    if (element.matches("[data-message-id]")) {
      return element.closest("[data-message-author-role], article, [role='article']") || element;
    }

    if (isAssistantContentElement(element)) {
      return findMessageBoundary(element, "assistant");
    }

    if (isUserContentElement(element)) {
      return findMessageBoundary(element, "user");
    }

    if (element.matches("article, [role='article']") && hasMessageContent(element)) {
      return element;
    }

    return null;
  }

  function getRoleMessageBoundary(roleElement) {
    const turn = getClosestTurnNode(roleElement);

    if (turn) {
      return turn;
    }

    const article = roleElement.closest("article, [role='article']");

    if (article && article.querySelectorAll("[data-message-author-role]").length === 1 && getElementText(article).length <= 9000) {
      return article;
    }

    return roleElement;
  }

  function getPotentialMessageNodeResult(node) {
    const main = document.querySelector("main");

    if (main && !main.contains(node)) {
      return {
        ok: false,
        reason: "outside main"
      };
    }

    if (isTurnNode(node)) {
      if (isDisclaimerLikeNode(node)) {
        return {
          ok: false,
          reason: "turn node matched disclaimer/system text"
        };
      }

      return {
        ok: true,
        reason: "turn node accepted even without visible text"
      };
    }

    if (hasRoleOrMessageIdSignal(node)) {
      if (isDisclaimerLikeNode(node)) {
        return {
          ok: false,
          reason: "role/message node matched disclaimer/system text"
        };
      }

      return {
        ok: true,
        reason: "role/message id signal"
      };
    }

    if (isHardNonMessageNode(node)) {
      return {
        ok: false,
        reason: "non-message page chrome/disclaimer/system text"
      };
    }

    if (!hasMessageContent(node)) {
      return {
        ok: false,
        reason: "no message-like text/media/content markers"
      };
    }

    return {
      ok: true,
      reason: "message-like content"
    };
  }

  function hasMessageContent(node) {
    if (!node?.matches) {
      return false;
    }

    if (hasRoleOrMessageIdSignal(node) || isTurnNode(node) || isAssistantContentElement(node) || isUserContentElement(node)) {
      return true;
    }

    if (node.matches("pre, code, img, picture, canvas, p, li, table, blockquote, [dir='auto']")) {
      return true;
    }

    if (node.querySelector("pre, code, img, picture, canvas, p, li, table, blockquote, [dir='auto'], [data-message-id], [data-message-author-role], [data-testid*='assistant' i], [data-testid*='bot-message' i], [data-testid*='user-message' i], [data-testid*='message' i], .markdown, [class*='markdown'], [class*='prose'], [class*='break-words'], [data-start], [data-is-streaming], [class*='result-streaming']")) {
      return true;
    }

    const text = getElementText(node) || getRawElementText(node);
    return text.trim().length > 0;
  }

  function isConversationTurnNode(node) {
    return Boolean(node?.matches?.('[data-testid^="conversation-turn-"], [data-testid*="conversation-turn"]'));
  }

  function isTurnNode(node) {
    return Boolean(node?.matches?.(TURN_NODE_SELECTOR));
  }

  function getAllTurnNodes() {
    return uniqueElements([
      ...document.querySelectorAll(CHATGPT_MESSAGE_UNIT_SELECTOR),
      ...document.querySelectorAll("[data-turn-id]"),
      ...document.querySelectorAll("[data-turn-container]"),
      ...document.querySelectorAll("[data-turn-id-container]"),
      ...document.querySelectorAll('[data-testid^="conversation-turn-"], [data-testid*="conversation-turn"]')
    ].map((node) => normalizeMessageNode(node) || node))
      .filter((node) => node?.isConnected && isTurnNode(node) && !isHiddenCaptureCandidate(node))
      .sort(compareDocumentOrder);
  }

  function isLastTurnNode(node) {
    const turn = isTurnNode(node) ? node : getClosestTurnNode(node);
    return Boolean(turn && getLastTurnNode() === turn);
  }

  function getLastTurnNode() {
    const now = Date.now();

    if (lastTurnNodeCache?.isConnected && now - lastTurnNodeCacheAt <= 250) {
      return lastTurnNodeCache;
    }

    const turns = getAllTurnNodes();
    lastTurnNodeCache = turns[turns.length - 1] || null;
    lastTurnNodeCacheAt = now;
    return lastTurnNodeCache;
  }

  function shouldRevisitMessageNode(node) {
    return Boolean(
      isLastTurnNode(node)
      || node.matches?.("[data-is-streaming], [class*='result-streaming']")
      || node.querySelector?.("[data-is-streaming], [class*='result-streaming'], [data-is-last-node], [data-is-only-node]")
    );
  }

  function shouldRevisitCapturedMessage(node, existingMessage) {
    if (!existingMessage) {
      return false;
    }

    const mountedAttachmentCount = countMountedAttachmentElements(node);
    const capturedAttachmentCount = getMessageAttachmentStats(existingMessage).total;

    if (mountedAttachmentCount > capturedAttachmentCount) {
      return true;
    }

    const mountedTextLength = getRawElementText(node).length;
    const capturedLength = (existingMessage.markdown || "").length + (existingMessage.thinkingMarkdown || "").length;

    return mountedTextLength > capturedLength + Math.max(160, Math.floor(capturedLength * 0.2));
  }

  function isMessageRicher(nextMessage, previousMessage) {
    const nextLength = (nextMessage.markdown || "").length + (nextMessage.thinkingMarkdown || "").length;
    const previousLength = (previousMessage.markdown || "").length + (previousMessage.thinkingMarkdown || "").length;
    const nextAttachments = getMessageAttachmentStats(nextMessage);
    const previousAttachments = getMessageAttachmentStats(previousMessage);

    if (nextAttachments.total > previousAttachments.total) {
      return true;
    }

    if (nextLength > previousLength + Math.max(120, Math.floor(previousLength * 0.12))) {
      return true;
    }

    if (
      nextMessage.codeBlockCount > previousMessage.codeBlockCount
      || nextAttachments.images > previousAttachments.images
      || nextAttachments.files > previousAttachments.files
    ) {
      return true;
    }

    return previousLength === 0 && nextLength > 0;
  }

  function mergeMessageAttachments(primaryMessage, previousMessage) {
    if (!previousMessage?.markdown) {
      return primaryMessage;
    }

    const nextBlocks = getMarkdownAttachmentBlocks(primaryMessage.markdown);
    const previousBlocks = getMarkdownAttachmentBlocks(previousMessage.markdown);
    const existingKeys = new Set(nextBlocks.map((block) => block.key));
    const missingBlocks = previousBlocks.filter((block) => !existingKeys.has(block.key));

    if (missingBlocks.length) {
      primaryMessage.markdown = cleanMarkdown([
        missingBlocks.map((block) => block.markdown).join("\n\n"),
        primaryMessage.markdown || ""
      ].filter(Boolean).join("\n\n"));
    }

    primaryMessage.imageCount = Math.max(primaryMessage.imageCount || 0, previousMessage.imageCount || 0);
    primaryMessage.fileCount = Math.max(primaryMessage.fileCount || 0, previousMessage.fileCount || 0);
    primaryMessage.imagesEmbedded = Math.max(primaryMessage.imagesEmbedded || 0, previousMessage.imagesEmbedded || 0);
    primaryMessage.imagesDeferred = Math.max(primaryMessage.imagesDeferred || 0, previousMessage.imagesDeferred || 0);
    primaryMessage.imagesFailed = Math.max(primaryMessage.imagesFailed || 0, previousMessage.imagesFailed || 0);

    return primaryMessage;
  }

  function getMessageAttachmentStats(message) {
    const blocks = getMarkdownAttachmentBlocks(message?.markdown || "");
    const markdownImages = blocks.filter((block) => block.kind === "image").length;
    const markdownFiles = blocks.filter((block) => block.kind === "file").length;
    const images = Math.max(message?.imageCount || 0, markdownImages);
    const files = Math.max(message?.fileCount || 0, markdownFiles);

    return {
      images,
      files,
      total: images + files
    };
  }

  function getMarkdownAttachmentBlocks(markdown) {
    const value = String(markdown || "");
    const blocks = [];

    for (const match of value.matchAll(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g)) {
      const alt = match[1] || "image";
      const url = match[2] || "";
      blocks.push({
        kind: "image",
        key: `image:${alt}:${url}`,
        markdown: match[0]
      });
    }

    for (const match of value.matchAll(/\[File:\s*([^\]]+)\](?:\(([^)]*)\))?/gi)) {
      const name = sanitizeFileAttachmentName(match[1]) || "Attachment";
      blocks.push({
        kind: "file",
        key: `file:${name.toLowerCase()}`,
        markdown: `[File: ${escapeMarkdownLinkLabel(name)}]`
      });
    }

    return blocks;
  }

  function countMountedAttachmentElements(node) {
    if (!node?.querySelectorAll) {
      return 0;
    }

    return uniqueElements([
      ...node.querySelectorAll("img, canvas, a, button, [role='button'], [download]")
    ]).filter((element) => {
      const tag = element.tagName?.toLowerCase?.() || "";

      if (tag === "img") {
        return !isLikelyDecorativeImage(element);
      }

      if (tag === "canvas") {
        return !isLikelyDecorativeMedia(element);
      }

      return hasUsefulImageContent(element) || isLikelyFileAttachmentElement(element);
    }).length;
  }

  function getClosestTurnNode(element) {
    return element?.closest?.(TURN_NODE_SELECTOR) || null;
  }

  function getTurnRootNode(element) {
    if (!element?.closest) {
      return element || null;
    }

    return element.closest(CHATGPT_MESSAGE_UNIT_SELECTOR)
      || element.closest('[data-testid^="conversation-turn-"], [data-testid*="conversation-turn"]')
      || element.closest("[data-turn-id]")
      || element.closest("[data-turn-container]")
      || element.closest("[data-turn-id-container]")
      || element;
  }

  function getTurnId(node) {
    return node?.getAttribute?.("data-turn-id") || node?.closest?.("[data-turn-id]")?.getAttribute("data-turn-id") || "";
  }

  function hasTurnContainerSignal(node) {
    return Boolean(node?.matches?.("[data-turn-container], [data-turn-id-container]") || node?.querySelector?.("[data-turn-container], [data-turn-id-container]"));
  }

  function hasRoleOrMessageIdSignal(node) {
    const selector = "[data-message-author-role], [data-message-id], [data-chatgpt-search-unit-key]";
    return Boolean(node?.matches?.(selector) || node?.querySelector?.(selector));
  }

  function isNonMessageNode(node) {
    if (!node?.matches) {
      return false;
    }

    if (hasRoleOrMessageIdSignal(node) || isTurnNode(node)) {
      return isDisclaimerLikeNode(node);
    }

    return isHardNonMessageNode(node);
  }

  function isHardNonMessageNode(node) {
    if (!node?.matches) {
      return false;
    }

    if (node.closest("#chatgpt-exporter-selector-host, nav, header, footer, aside")) {
      return true;
    }

    const role = node.getAttribute("role") || "";

    if (NON_MESSAGE_ROLE_RE.test(role) && !node.querySelector("[data-message-author-role], [data-message-id]")) {
      return true;
    }

    const attrs = [
      node.getAttribute("data-testid") || "",
      node.getAttribute("aria-label") || "",
      node.getAttribute("class") || ""
    ].join(" ");

    if (/\b(toast|notice|banner|alert|warning|disclaimer|composer|input|prompt-textarea|sidebar|navigation)\b/i.test(attrs)) {
      return true;
    }

    return isDisclaimerLikeNode(node);
  }

  function isDisclaimerLikeNode(node) {
    const text = getElementText(node) || getRawElementText(node);
    const compactText = text.replace(/\s+/g, " ").trim();

    if (NON_MESSAGE_TEXT_RE.test(compactText) && compactText.length <= 260) {
      return true;
    }

    if (!node.querySelector("[data-message-author-role], [data-message-id], .markdown, [class*='markdown'], [data-start], pre, img") && compactText.length <= 180 && NON_MESSAGE_TEXT_RE.test(compactText)) {
      return true;
    }

    return false;
  }

  function findMessageBoundary(element, expectedRole) {
    const roleContainer = element.closest(`[data-message-author-role="${cssString(expectedRole)}"]`);

    if (roleContainer) {
      return roleContainer;
    }

    const turn = getClosestTurnNode(element);

    if (turn) {
      return turn;
    }

    const messageId = element.closest("[data-message-id]");

    if (messageId) {
      return messageId;
    }

    const assistantTestId = expectedRole === "assistant"
      ? element.closest('[data-testid*="assistant" i], [data-testid*="bot-message" i], [data-testid*="model-response" i], [data-testid*="response" i]')
      : null;

    if (assistantTestId) {
      return assistantTestId;
    }

    const article = element.closest("article, [role='article']");

    if (article && article.querySelectorAll("[data-message-author-role], .markdown, [class*='markdown'], [data-start], [data-is-streaming], [class*='result-streaming']").length <= 3) {
      return article;
    }

    return findCompactMessageAncestor(element) || element;
  }

  function findCompactMessageAncestor(element) {
    let current = element;
    let best = element;

    while (current?.parentElement) {
      const parent = current.parentElement;

      if (parent.matches("main, body, html, nav, aside, header, footer")) {
        break;
      }

      const textLength = getElementText(parent).length;
      const roleCount = parent.querySelectorAll("[data-message-author-role]").length;
      const contentCount = parent.querySelectorAll(".markdown, [class*='markdown'], [class*='prose'], [data-start], [data-is-streaming], [class*='result-streaming']").length;

      if (roleCount > 1 || contentCount > 4 || textLength > 12000) {
        break;
      }

      best = parent;
      current = parent;
    }

    return best;
  }

  function isAssistantContentElement(element) {
    if (!element.matches?.("*")) {
      return false;
    }

    const attrs = [
      element.getAttribute("data-testid") || "",
      element.getAttribute("data-message-author-role") || "",
      element.className || ""
    ].join(" ").toLowerCase();

    return element.matches('[data-message-author-role="assistant"], .markdown, [class*="markdown"], [class*="prose"], [class*="break-words"], [data-start], [data-is-streaming], [class*="result-streaming"]')
      || element.querySelector?.('[data-message-author-role="assistant"], .markdown, [class*="markdown"], [class*="prose"], [class*="break-words"], [data-start], [data-is-streaming], [class*="result-streaming"]')
      || ASSISTANT_SIGNAL_RE.test(attrs);
  }

  function isUserContentElement(element) {
    return Boolean(element.matches?.('[data-message-author-role="user"], [data-testid*="user-message" i], .whitespace-pre-wrap, [class*="whitespace-pre-wrap"]')
      || element.querySelector?.('[data-message-author-role="user"], [data-testid*="user-message" i], .whitespace-pre-wrap, [class*="whitespace-pre-wrap"]'));
  }

  function scoreMessageNodeSpecificity(node) {
    let score = 0;

    if (node.matches('[data-message-author-role="assistant"]')) {
      score += 1200;
    } else if (node.querySelector('[data-message-author-role="assistant"]')) {
      score += 900;
    }

    if (node.matches('[data-message-author-role="user"]') || node.querySelector('[data-message-author-role="user"]')) {
      score += 800;
    }

    if (node.matches("[data-message-id]") || node.querySelector("[data-message-id]")) {
      score += 700;
    }

    if (isTurnNode(node)) {
      score += 650;
    }

    if (node.matches(".markdown, [class*='markdown'], [class*='prose'], [data-start], [data-is-streaming], [class*='result-streaming']")) {
      score += 550;
    }

    if (node.querySelector(".markdown, [class*='markdown'], [class*='prose'], [data-start], [data-is-streaming], [class*='result-streaming']")) {
      score += 420;
    }

    if (node.matches("article, [role='article']")) {
      score += 160;
    }

    score += Math.min(getElementText(node).length, 1800) / 20;
    score -= node.querySelectorAll("[data-message-author-role]").length > 1 ? 800 : 0;
    score -= node.querySelectorAll("article, [role='article']").length * 150;

    return score;
  }

  function isLikelyBroadMessageShell(container, child) {
    if (!container.contains(child)) {
      return false;
    }

    const roleCount = container.querySelectorAll("[data-message-author-role]").length;
    const contentCount = container.querySelectorAll(".markdown, [class*='markdown'], [class*='prose'], [data-start], [data-is-streaming], [class*='result-streaming']").length;

    return roleCount > 1 || contentCount > 2 || getElementText(container).length > getElementText(child).length * 2.8;
  }

  function compareDocumentOrder(a, b) {
    if (a === b) {
      return 0;
    }

    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  }

  function detectRole(node, sequence) {
    return detectRoleDetails(node, sequence).role;
  }

  function detectRoleDetails(node, sequence) {
    // Message-unit keys and the author-role attribute are the strongest
    // signals. Test ids, body shape, and order are fallbacks for UI revisions
    // where attributes move around.
    const unitRole = isChatGptMessageUnit(node) ? getChatGptMessageUnitInfo(node)?.role : "";

    if (unitRole === "user" || unitRole === "assistant" || unitRole === "system" || unitRole === "tool") {
      return {
        role: unitRole,
        reason: "data-chatgpt-search-unit-key"
      };
    }

    const roleElement = findRoleElement(node);
    const role = roleElement?.getAttribute("data-message-author-role")?.toLowerCase();

    if (role === "user" || role === "assistant" || role === "system" || role === "tool") {
      return {
        role,
        reason: "data-message-author-role"
      };
    }

    const testId = getMessageSignalText(node).toLowerCase();

    if (/\b(user|human)-?message\b/.test(testId)) {
      return {
        role: "user",
        reason: "user/human signal in data-testid/class/aria"
      };
    }

    if (/\b(bot|assistant|model)-?(message|response|turn)?\b|\bassistant-response\b/.test(testId)) {
      return {
        role: "assistant",
        reason: "assistant/bot/model signal in data-testid/class/aria"
      };
    }

    if (isTurnNode(node) && node.querySelector("div.markdown.prose, .markdown.prose, .markdown, [class*='markdown'], [class*='prose'], [data-is-streaming], [class*='result-streaming']")) {
      return {
        role: "assistant",
        reason: "turn node with assistant markdown/prose structure"
      };
    }

    if (isTurnNode(node) && hasUserRoleSignal(node)) {
      return {
        role: "user",
        reason: "turn node with user structure"
      };
    }

    const labelText = [
      node.getAttribute("aria-label") || "",
      node.getAttribute("data-testid") || "",
      getElementText(node).slice(0, 240)
    ].join(" ").toLowerCase();

    if (/\byou said\b|\buser\b/.test(labelText)) {
      return {
        role: "user",
        reason: "user label text"
      };
    }

    if (/\bchatgpt said\b|\bassistant\b|\bchatgpt\b/.test(labelText)) {
      return {
        role: "assistant",
        reason: "assistant label text"
      };
    }

    if (hasAssistantRoleSignal(node)) {
      return {
        role: "assistant",
        reason: "assistant content signal"
      };
    }

    if (hasUserRoleSignal(node)) {
      return {
        role: "user",
        reason: "user content signal"
      };
    }

    return {
      role: sequence % 2 === 0 ? "user" : "assistant",
      reason: "turn order fallback"
    };
  }

  function getMessageSignalText(node) {
    return [
      node.getAttribute("data-testid") || "",
      node.getAttribute("aria-label") || "",
      node.getAttribute("class") || "",
      ...[...node.querySelectorAll("[data-testid], [aria-label], [class]")]
        .slice(0, 12)
        .map((element) => [
          element.getAttribute("data-testid") || "",
          element.getAttribute("aria-label") || "",
          element.getAttribute("class") || ""
        ].join(" "))
    ].join(" ");
  }

  function hasAssistantRoleSignal(node) {
    if (node.matches('[data-message-author-role="assistant"], .markdown, [class*="markdown"], [class*="prose"], [class*="break-words"], [data-start], [data-is-streaming], [class*="result-streaming"]')) {
      return true;
    }

    if (node.querySelector('[data-message-author-role="assistant"], [data-testid="bot-message"], [data-testid*="bot-message" i], [data-testid*="assistant" i], [data-testid*="model-response" i], .markdown, [class*="markdown"], [class*="prose"], [class*="break-words"], [data-start], [data-is-streaming], [class*="result-streaming"]')) {
      return true;
    }

    const signalText = getMessageSignalText(node).toLowerCase();
    return ASSISTANT_SIGNAL_RE.test(signalText);
  }

  function hasUserRoleSignal(node) {
    if (node.matches('[data-message-author-role="user"], [data-testid*="user-message" i], .whitespace-pre-wrap, [class*="whitespace-pre-wrap"]')) {
      return true;
    }

    return Boolean(node.querySelector('[data-message-author-role="user"], [data-testid*="user-message" i], .whitespace-pre-wrap, [class*="whitespace-pre-wrap"]'));
  }

  function getMessageParts(node, role) {
    const roleElement = findRoleElement(node, role);
    const body = findMessageBody(node, role, roleElement);
    const thinkingElements = getThinkingElements(node, body, role);
    const timestamp = findTimestamp(node);

    return {
      roleElement,
      body,
      bodyCandidates: getBodyCandidateDebug(node, role, roleElement),
      thinkingElements,
      timestamp
    };
  }

  function findRoleElement(node, role) {
    if (role && node.matches(`[data-message-author-role="${cssString(role)}"]`)) {
      return node;
    }

    if (role) {
      const exact = node.querySelector(`[data-message-author-role="${cssString(role)}"]`);

      if (exact) {
        return exact;
      }
    }

    if (node.matches("[data-message-author-role]")) {
      return node;
    }

    return node.querySelector("[data-message-author-role]");
  }

  function findMessageBody(node, role, roleElement) {
    const unitBody = getChatGptMessageUnitBody(node, role);

    if (unitBody) {
      return unitBody;
    }

    const root = roleElement || node;
    const selectors = role === "assistant" ? ASSISTANT_BODY_SELECTORS : USER_BODY_SELECTORS;
    const candidates = [root, node];

    if (role === "assistant") {
      candidates.push(...findAssistantBodyCandidates(node, root));
    }

    for (const selector of selectors) {
      for (const element of root.querySelectorAll(selector)) {
        candidates.push(element);
      }
    }

    for (const selector of selectors) {
      for (const element of node.querySelectorAll(selector)) {
        candidates.push(element);
      }
    }

    return chooseBestBody(candidates, root, role);
  }

  function findAssistantBodyCandidates(node, root) {
    const scopes = uniqueElements([root, node]).filter(Boolean);
    const selectors = [
      "div.markdown.prose",
      ".markdown.prose",
      ".markdown",
      "[class*='markdown']",
      "[class*='prose']",
      "[data-start]",
      "[data-end]",
      "[data-is-last-node]",
      "[data-is-only-node]",
      "[data-is-streaming]",
      "[class*='result-streaming']",
      "[class*='flex']",
      "[class*='min-w-0']",
      "[class*='w-full']",
      "[dir='auto']",
      ...EXPANDABLE_BUTTON_SELECTORS,
      "article",
      "section"
    ];
    const candidates = [];

    for (const scope of scopes) {
      candidates.push(...findStructuredContentCandidates(scope));

      for (const selector of selectors) {
        candidates.push(...scope.querySelectorAll(selector));
      }
    }

    return candidates.filter((candidate) => {
      const button = candidate.closest("button, [role='button']");
      return (!button || isExpandableContentButton(button)) && !candidate.closest("nav, aside, header, footer");
    });
  }

  function getBodyCandidateDebug(node, role, roleElement) {
    const root = roleElement || node;
    const candidates = role === "assistant"
      ? uniqueElements([root, node, ...findStructuredContentCandidates(node), ...findAssistantBodyCandidates(node, root), ...getExpandableContentButtons(node)])
      : uniqueElements([root, node]);

    return candidates.slice(0, 12).map((candidate) => ({
      node: summarizeNode(candidate),
      score: scoreBodyCandidate(candidate, root, role),
      textLength: getRawElementText(candidate).length,
      serializedHint: getSerializationHint(candidate)
    }));
  }

  function chooseBestBody(candidates, fallback, role) {
    const unique = uniqueElements(candidates).filter((element) => element && hasMessageContent(element) && !isNonMessageNode(element));

    if (!unique.length) {
      return fallback;
    }

    return unique
      .map((element) => ({ element, score: scoreBodyCandidate(element, fallback, role) }))
      .sort((a, b) => b.score - a.score)[0].element;
  }

  function isRichMarkdownContainer(element) {
    return Boolean(element?.matches?.("div.markdown.prose, .markdown.prose, .markdown, [class*='markdown'], [class*='prose']"));
  }

  function scoreBodyCandidate(element, fallback, role) {
    const textLength = Math.min(getElementText(element).length, 2000);
    const mediaScore = element.querySelectorAll("pre, code, img, picture, canvas").length * 220;
    const richContainerScore = isRichMarkdownContainer(element) ? 1200 : element.querySelector?.("div.markdown.prose, .markdown.prose, .markdown, [class*='markdown'], [class*='prose']") ? 650 : 0;
    const markdownScore = element.matches(".markdown") || element.querySelector(".markdown") ? 500 : 0;
    const proseScore = element.matches("[class*='markdown'], [class*='prose'], [data-is-streaming], [class*='result-streaming']") ? 520 : 0;
    const structuredNodeScore = element.matches("[data-start], [data-end], [data-is-last-node], [data-is-only-node]") || element.querySelector("[data-start], [data-end], [data-is-last-node], [data-is-only-node]") ? 140 : 0;
    const assistantScore = role === "assistant" && hasAssistantRoleSignal(element) ? 420 : 0;
    const userPenalty = role === "assistant" && hasUserRoleSignal(element) ? 650 : 0;
    const roleScore = element.matches("[data-message-author-role]") ? 500 : 0;
    const fallbackScore = element === fallback ? 450 : 0;
    const chromePenalty = element.querySelectorAll("button, [role='button'], [role='menu'], [role='menuitem']").length * 45;
    const nonMessagePenalty = isNonMessageNode(element) ? 3000 : 0;
    const markdownFragmentPenalty = element.matches("[data-start], [data-end], [data-is-last-node], [data-is-only-node], p, li") && !isRichMarkdownContainer(element) ? 280 : 0;

    return textLength + mediaScore + richContainerScore + markdownScore + proseScore + structuredNodeScore + assistantScore + roleScore + fallbackScore - chromePenalty - userPenalty - nonMessagePenalty - markdownFragmentPenalty;
  }

  function getThinkingElements(node, body, role) {
    if (role !== "assistant") {
      return [];
    }

    const roots = uniqueElements([node, body]).filter(Boolean);
    const candidates = [];

    for (const root of roots) {
      for (const selector of THINKING_SELECTORS) {
        for (const element of root.querySelectorAll(selector)) {
          const normalized = normalizeThinkingElement(element, node, body);

          if (normalized && isLikelyThinkingElement(normalized, node, body)) {
            candidates.push(normalized);
          }
        }
      }

      candidates.push(...findThinkingCueRegions(root, node, body));
    }

    return uniqueTopLevelElements(candidates);
  }

  function normalizeThinkingElement(element, messageNode, body = null) {
    const controlledId = element.getAttribute("aria-controls");
    const controlled = controlledId ? document.getElementById(controlledId) : null;

    if (controlled && messageNode.contains(controlled)) {
      const controlledRegion = controlled.closest("details, section, article") || controlled;
      return body && controlledRegion.contains(body) ? findCompactAncestor(controlled, messageNode, body) : controlledRegion;
    }

    if (element.matches("button, summary")) {
      const disclosureRegion = element.closest("details, section, article");

      if (disclosureRegion && !(body && disclosureRegion.contains(body))) {
        return disclosureRegion;
      }

      return findCompactAncestor(element, messageNode, body) || element;
    }

    return findCompactAncestor(element, messageNode, body) || element;
  }

  function findCompactAncestor(element, boundary, body = null) {
    let current = element;
    let best = element;

    while (current?.parentElement && current.parentElement !== boundary) {
      const parent = current.parentElement;
      const text = getElementText(parent);

      if (body && parent.contains(body)) {
        break;
      }

      if (!THINKING_CUE_RE.test(text.slice(0, 500))) {
        break;
      }

      if (text.length > 5000 || parent.querySelector('[data-message-author-role]:not([data-message-author-role="assistant"])')) {
        break;
      }

      best = parent;
      current = parent;
    }

    return best;
  }

  function findThinkingCueRegions(root, messageNode, body) {
    if (!root?.querySelectorAll) {
      return [];
    }

    const selectors = [
      "details",
      "summary",
      "button",
      "[role='button']",
      "[aria-expanded]",
      "[aria-controls]",
      "[data-testid]",
      "[aria-label]",
      "[title]",
      "section",
      "article",
      "div"
    ].join(",");
    const regions = [];

    for (const element of root.querySelectorAll(selectors)) {
      if (!isThinkingCueCandidateElement(element, messageNode, body)) {
        continue;
      }

      const region = findThinkingRegionFromCue(element, messageNode, body);

      if (region && isLikelyThinkingElement(region, messageNode, body)) {
        regions.push(region);
      }
    }

    return uniqueElements(regions);
  }

  function isThinkingCueCandidateElement(element, messageNode, body) {
    if (!element?.matches || !messageNode.contains(element) || element === messageNode || element === body) {
      return false;
    }

    if (body && body.contains(element)) {
      return false;
    }

    if (element.closest("#chatgpt-exporter-selector-host, nav, header, footer, aside, [role='menu']")) {
      return false;
    }

    const text = getElementText(element);
    const attrs = [
      element.getAttribute("data-testid") || "",
      element.getAttribute("aria-label") || "",
      element.getAttribute("title") || "",
      element.className || ""
    ].join(" ");
    const cueText = `${attrs} ${text.slice(0, 700)}`;

    if (THINKING_STATUS_RE.test(cueText)) {
      return text.length <= 4000;
    }

    if (!THINKING_CUE_RE.test(cueText)) {
      return false;
    }

    return element.matches("details, summary, button, [role='button'], [aria-expanded], [aria-controls], [data-testid], [aria-label], [title]")
      || text.length <= 1200;
  }

  function findThinkingRegionFromCue(element, messageNode, body) {
    let current = element;
    let best = element;

    while (current?.parentElement && current.parentElement !== messageNode) {
      const parent = current.parentElement;

      if (body && parent.contains(body)) {
        break;
      }

      if (parent.querySelector('[data-message-author-role]:not([data-message-author-role="assistant"])')) {
        break;
      }

      const text = getElementText(parent);

      if (text.length > 4000 || !THINKING_CUE_RE.test(text.slice(0, 900))) {
        break;
      }

      best = parent;
      current = parent;
    }

    return best;
  }

  function isLikelyThinkingElement(element, messageNode, body) {
    if (!messageNode.contains(element) || element === messageNode || element === body) {
      return false;
    }

    if (body && element.contains(body)) {
      return false;
    }

    if (element.matches("button, [role='button']") && !isExpandableContentButton(element)) {
      const text = getExpandableCueText(element);

      if (!THINKING_STATUS_RE.test(text)) {
        return false;
      }
    }

    if (element.matches("[role='menu'], [role='menuitem']")) {
      return false;
    }

    const attrs = [
      element.getAttribute("data-testid") || "",
      element.getAttribute("aria-label") || "",
      element.getAttribute("title") || "",
      element.className || ""
    ].join(" ");
    const text = getElementText(element);

    return THINKING_CUE_RE.test(`${attrs} ${text.slice(0, 700)}`);
  }

  function isExpandableCueElement(element) {
    const text = getExpandableCueText(element);

    if (!text) {
      return false;
    }

    const hasDisclosureState = element.matches?.("[aria-expanded], [aria-controls], summary, details");
    const strongExpandCue = /\b(show\s+more|show\s+all|read\s+more|view\s+more|continue|expand)\b|\u5c55\u5f00|\u663e\u793a\u66f4\u591a|\u67e5\u770b\u66f4\u591a|\u7ee7\u7eed/i;

    return THINKING_CUE_RE.test(text) || (hasDisclosureState ? EXPAND_CUE_RE.test(text) : strongExpandCue.test(text));
  }

  function isExpandableContentButton(element) {
    if (!element?.matches?.("button, [role='button']")) {
      return false;
    }

    if (element.matches("[data-testid*='copy' i], [data-testid*='feedback' i], [data-testid*='share' i], [aria-label*='Copy' i], [aria-label*='Good response' i], [aria-label*='Bad response' i], [aria-label*='Share' i]")) {
      return false;
    }

    if (element.matches(EXPANDABLE_BUTTON_SELECTORS.join(","))) {
      return true;
    }

    return isExpandableCueElement(element);
  }

  function getExpandableContentButtons(root) {
    if (!root?.querySelectorAll) {
      return [];
    }

    return uniqueElements(
      EXPANDABLE_BUTTON_SELECTORS.flatMap((selector) => [...root.querySelectorAll(selector)])
    ).filter(isExpandableContentButton);
  }

  function getExpandableCueText(element) {
    const text = [
      element.getAttribute("aria-label") || "",
      element.getAttribute("title") || "",
      element.getAttribute("data-testid") || "",
      element.getAttribute("aria-controls") || "",
      getElementText(element).slice(0, 500)
    ].join(" ");

    return text;
  }

  function findTimestamp(node) {
    const roots = getTimestampSearchRoots(node);
    const selectors = [
      "time[datetime]",
      "time",
      "[datetime]",
      '[data-testid*="timestamp" i]',
      '[data-testid*="time" i]',
      '[class*="timestamp" i]',
      '[class*="time" i]',
      '[aria-label*="timestamp" i]',
      '[aria-label*="sent" i]',
      '[aria-label*="date" i]',
      '[aria-label*="time" i]',
      '[title*="timestamp" i]',
      '[title*="sent" i]',
      '[title*="date" i]',
      '[title*="time" i]',
      '[title]'
    ];

    for (const root of roots) {
      for (const selector of selectors) {
        for (const element of getTimestampSelectorMatches(root, selector)) {
          const value = normalizeTimestamp(
            element.getAttribute("datetime") ||
            element.getAttribute("aria-label") ||
            element.getAttribute("title") ||
            getElementText(element)
          );

          if (value) {
            return value;
          }
        }
      }
    }

    for (const root of roots) {
      const value = findTimestampInShortTextNodes(root);

      if (value) {
        return value;
      }
    }

    return "";
  }

  function getTimestampSearchRoots(node) {
    if (!node?.querySelectorAll) {
      return [];
    }

    return uniqueElements([
      node,
      getClosestTurnNode(node),
      node.closest?.("[data-turn-container]"),
      node.closest?.("[data-turn-id-container]"),
      node.parentElement
    ].filter(Boolean)).filter((root) => root?.querySelectorAll && !root.matches?.("html, body, main"));
  }

  function getTimestampSelectorMatches(root, selector) {
    const matches = [];

    if (root.matches?.(selector)) {
      matches.push(root);
    }

    matches.push(...root.querySelectorAll(selector));
    return uniqueElements(matches);
  }

  function findTimestampInShortTextNodes(root) {
    const rootTextLength = getElementText(root).length;

    if (rootTextLength > 5000 && root.querySelectorAll("[data-message-author-role], .markdown, [class*='markdown']").length > 2) {
      return "";
    }

    const candidates = uniqueElements([
      root,
      ...root.querySelectorAll("time, span, div")
    ]);

    for (const element of candidates) {
      if (!isShortTimestampTextElement(element)) {
        continue;
      }

      const value = extractTimestampFromText(getElementText(element));

      if (value) {
        return value;
      }
    }

    return "";
  }

  function isShortTimestampTextElement(element) {
    if (!element?.matches || element.closest("#chatgpt-exporter-selector-host")) {
      return false;
    }

    if (element.querySelector("p, li, pre, code, img, svg, button, [role='button'], .markdown, [class*='markdown']")) {
      return false;
    }

    const text = getElementText(element);
    return Boolean(text && text.length <= 96 && extractTimestampFromText(text));
  }

  function normalizeTimestamp(value) {
    const timestamp = String(value || "").replace(/\s+/g, " ").trim();

    if (!timestamp || timestamp.length > 160) {
      return "";
    }

    return extractTimestampFromText(timestamp);
  }

  function extractTimestampFromText(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim();

    if (!text) {
      return "";
    }

    const dateTimeMatch = text.match(DATE_TIME_VALUE_RE);

    if (dateTimeMatch) {
      return dateTimeMatch[0].trim();
    }

    if (!TIMESTAMP_CUE_RE.test(text)) {
      return "";
    }

    const timeMatch = text.match(TIME_VALUE_RE);
    return timeMatch ? timeMatch[0].trim() : "";
  }

  function isTimestampDividerText(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim();

    if (!text || text.length > 96) {
      return false;
    }

    if (TIMESTAMP_DIVIDER_RE.test(text)) {
      return true;
    }

    const dateTime = text.match(DATE_TIME_VALUE_RE)?.[0]?.trim() || "";

    if (dateTime && dateTime === text) {
      return true;
    }

    const time = text.match(TIME_VALUE_RE)?.[0]?.trim() || "";
    return Boolean(time && time === text && TIMESTAMP_CUE_RE.test(text));
  }

  // ============================================================================
  // CHATGPT RESPONSE MARKUP
  // ============================================================================
  //
  // ChatGPT stores two non-Markdown layers inside assistant text:
  //
  // 1. Inline reference tokens: U+E200 <name> U+E202 <arg> [U+E202 <arg>...] U+E201.
  //    Known names are cite, entity, url, image_group, and navlist. They appear
  //    in classic text messages and in the DIL fallback Markdown.
  // 2. DIL (metadata.model_dil_v2): content.parts holds component source such as
  //    <box>, <row>, <Cite/>, and {@body ...} state declarations. The same
  //    metadata carries fallbackMarkdown, ChatGPT's static Markdown rendition of
  //    that source, which is the export source of record for DIL messages.

  const CHATGPT_TOKEN_START = "";
  const CHATGPT_TOKEN_SEPARATOR = "";
  const CHATGPT_TOKEN_END = "";
  const CHATGPT_INLINE_TOKEN_RE = /([A-Za-z_][\w-]*)((?:[^]*)*)/g;
  const CHATGPT_CITATION_REF_RE = /^turn\d+[a-z_]+\d+$/i;
  const CHATGPT_WRITING_BLOCK_RE = /(^|\n):::writing(?:\{[^\n]*\})?[ \t]*\n([\s\S]*?)\n:::[ \t]*(?=\n|$)/g;
  const DIL_COMPONENT_NAMES = new Set([
    "AsyncImage",
    "Cite",
    "Entity",
    "Link",
    "MemoryCite",
    "WritingBlock",
    "badge",
    "box",
    "button",
    "caption",
    "divider",
    "grid",
    "grid-item",
    "icon",
    "pressable",
    "radio",
    "radio-group",
    "row",
    "spacer",
    "text",
    "title"
  ]);

  /**
   * Returns the Markdown that ChatGPT itself shows for a message whose body is
   * DIL component source, or "" when the message is not a DIL message.
   */
  function getDilFallbackMarkdown(message) {
    const dil = message?.metadata?.model_dil_v2;
    const fallback = dil && typeof dil === "object" ? dil.fallbackMarkdown : "";
    return typeof fallback === "string" ? fallback.trim() : "";
  }

  /**
   * Picks the Markdown for a DIL message. ChatGPT's fallbackMarkdown leaves
   * out everything a {#each} loop generates (lists, score bars), so a message
   * with loops is rendered from its source when every loop iterates over a
   * literal array. Otherwise the fallback is used and the gap is reported.
   *
   * @returns {{ markdown: string, origin: "fallback" | "source", unexpandedLoops: number }}
   */
  function chooseDilMarkdown(source, fallbackMarkdown) {
    const text = String(source || "");

    if (!DIL_LOOP_OPEN_RE.test(text)) {
      return {
        markdown: normalizeDilFallbackMarkdown(fallbackMarkdown) || renderDilSourceAsMarkdown(text),
        origin: fallbackMarkdown ? "fallback" : "source",
        unexpandedLoops: 0
      };
    }

    const expanded = expandDilTemplateBlocks(text);

    if (!expanded.failed) {
      return { markdown: renderDilSourceAsMarkdown(text), origin: "source", unexpandedLoops: 0 };
    }

    return {
      markdown: normalizeDilFallbackMarkdown(fallbackMarkdown) || renderDilSourceAsMarkdown(text),
      origin: fallbackMarkdown ? "fallback" : "source",
      unexpandedLoops: expanded.failed
    };
  }

  // The fallback writes AsyncImage as "[images: query]"; exports label image
  // searches the same way everywhere.
  function normalizeDilFallbackMarkdown(markdown) {
    return String(markdown || "").replace(/^\[images:\s*(.+?)\]\s*$/gm, (match, query) => `*[Image search: ${escapeMarkdownLinkLabel(query)}]*`);
  }

  const DIL_LOOP_OPEN_RE = /\{#each\s/;

  /**
   * Expands {#each LITERAL as item[, index]}...{/each} and {#if ...}...{/if}
   * blocks. Only literal data (arrays, objects, strings, numbers, booleans)
   * is read and only {item.path} / {index} placeholders are substituted;
   * nothing in the source is executed. A loop over anything else stays in
   * place and is counted in `failed`.
   */
  function expandDilTemplateBlocks(text, scope = {}) {
    let output = "";
    let failed = 0;
    let index = 0;

    while (index < text.length) {
      const open = text.indexOf("{#", index);

      if (open < 0) {
        output += substituteDilPlaceholders(text.slice(index), scope);
        break;
      }

      output += substituteDilPlaceholders(text.slice(index, open), scope);
      const headEnd = findBalancedBraceEnd(text, open);
      const head = headEnd > open ? text.slice(open + 2, headEnd) : "";
      const keyword = head.match(/^(each|if)\s/)?.[1];
      const blockEnd = keyword ? findDilBlockEnd(text, headEnd + 1, keyword) : null;

      if (!keyword || !blockEnd) {
        output += text.slice(open, open + 2);
        index = open + 2;
        continue;
      }

      const body = text.slice(headEnd + 1, blockEnd.start);

      if (keyword === "each") {
        const match = head.match(/^each\s+([\s\S]+?)\s+as\s+([A-Za-z_$][\w$]*)(?:\s*,\s*([A-Za-z_$][\w$]*))?\s*$/);
        const items = match ? parseDilLiteral(match[1]) : null;

        if (!Array.isArray(items)) {
          failed += 1;
          output += text.slice(open, blockEnd.end);
        } else {
          const names = [match[2], match[3]].filter(Boolean);
          items.forEach((item, itemIndex) => {
            const inner = expandDilTemplateBlocks(body, { ...scope, [match[2]]: item, ...(match[3] ? { [match[3]]: itemIndex } : {}) });
            failed += inner.failed + countUnresolvedDilPlaceholders(inner.text, names);
            output += inner.text;
          });
        }
      } else {
        const [whenTrue, whenFalse = ""] = splitDilElse(body);
        const condition = evaluateDilCondition(head.slice(3), scope);
        const inner = expandDilTemplateBlocks(condition === false ? whenFalse : whenTrue, scope);
        failed += inner.failed;
        output += inner.text;
      }

      index = blockEnd.end;
    }

    return { text: output, failed };
  }

  // A loop body expression that still names the loop variable could not be
  // resolved from literals (for example {tasks[t.id].name}). Attribute values
  // (={...}) are ignored because attributes are dropped when rendering.
  function countUnresolvedDilPlaceholders(text, names) {
    let count = 0;

    for (let index = text.indexOf("{"); index >= 0; index = text.indexOf("{", index + 1)) {
      const close = findBalancedBraceEnd(text, index);

      if (close < 0) {
        break;
      }

      const expression = text.slice(index + 1, close);
      const isAttribute = /=\s*$/.test(text.slice(Math.max(0, index - 3), index));

      if (!isAttribute && names.some((name) => new RegExp(`(^|[^\\w$.])${name.replace(/\$/g, "\\$")}\\b`).test(expression))) {
        count += 1;
      }

      index = close;
    }

    return count;
  }

  function findDilBlockEnd(text, from, keyword) {
    const pattern = new RegExp(`\\{(#${keyword}\\s|\\/${keyword}\\})`, "g");
    pattern.lastIndex = from;
    let depth = 1;
    let match;

    while ((match = pattern.exec(text))) {
      depth += match[1].startsWith("#") ? 1 : -1;

      if (depth === 0) {
        return { start: match.index, end: match.index + match[0].length };
      }
    }

    return null;
  }

  function splitDilElse(body) {
    const marker = body.search(/\{:else\}/);
    return marker < 0 ? [body] : [body.slice(0, marker), body.slice(marker + "{:else}".length)];
  }

  function substituteDilPlaceholders(text, scope) {
    if (!Object.keys(scope).length) {
      return text;
    }

    return text.replace(/\{\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\}/g, (match, path, offset) => {
      const value = resolveDilPath(path, scope);

      if (value === undefined || (value !== null && typeof value === "object")) {
        return match;
      }

      // An attribute value (name={item.icon}) must stay a quoted string.
      return /=\s*$/.test(text.slice(Math.max(0, offset - 3), offset)) ? JSON.stringify(String(value ?? "")) : String(value ?? "");
    });
  }

  function resolveDilPath(path, scope) {
    const [head, ...rest] = path.split(".");

    if (!Object.prototype.hasOwnProperty.call(scope, head)) {
      return undefined;
    }

    return rest.reduce((value, key) => (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined), scope[head]);
  }

  // Supports `path OP literal` with <, <=, >, >=, ==, ===, !=, !== and a bare
  // path; anything else is unknown (null) and keeps the {#if} branch.
  function evaluateDilCondition(expression, scope) {
    const match = String(expression).trim().match(/^([A-Za-z_$][\w$.]*)\s*(?:(<=|>=|===|!==|==|!=|<|>)\s*(.+))?$/);

    if (!match) {
      return null;
    }

    const left = resolveDilPath(match[1], scope);

    if (left === undefined) {
      return null;
    }

    if (!match[2]) {
      return Boolean(left);
    }

    const right = parseDilLiteral(match[3]);

    switch (match[2]) {
      case "<": return left < right;
      case "<=": return left <= right;
      case ">": return left > right;
      case ">=": return left >= right;
      case "==":
      case "===": return left === right;
      default: return left !== right;
    }
  }

  /**
   * Parses a JavaScript literal (arrays, objects with bare or quoted keys,
   * strings without interpolation, numbers, true/false/null). Returns null
   * for anything else, including identifiers and calls.
   */
  function parseDilLiteral(source) {
    const text = String(source ?? "");
    let index = 0;
    const fail = {};

    const skip = () => {
      while (/\s/.test(text[index] || "")) index += 1;
    };

    const value = () => {
      skip();
      const char = text[index];

      if (char === "[") {
        index += 1;
        const items = [];
        skip();
        while (text[index] !== "]") {
          const item = value();
          if (item === fail) return fail;
          items.push(item);
          skip();
          if (text[index] === ",") { index += 1; skip(); continue; }
          if (text[index] !== "]") return fail;
        }
        index += 1;
        return items;
      }

      if (char === "{") {
        index += 1;
        const object = {};
        skip();
        while (text[index] !== "}") {
          let key;
          if (text[index] === "\"" || text[index] === "'") {
            key = value();
            if (typeof key !== "string") return fail;
          } else {
            const match = text.slice(index).match(/^[A-Za-z_$][\w$]*/);
            if (!match) return fail;
            key = match[0];
            index += key.length;
          }
          skip();
          if (text[index] !== ":") return fail;
          index += 1;
          const item = value();
          if (item === fail) return fail;
          object[key] = item;
          skip();
          if (text[index] === ",") { index += 1; skip(); continue; }
          if (text[index] !== "}") return fail;
        }
        index += 1;
        return object;
      }

      if (char === "\"" || char === "'" || char === "`") {
        let result = "";
        index += 1;
        while (index < text.length && text[index] !== char) {
          if (char === "`" && text.startsWith("${", index)) return fail;
          if (text[index] === "\\") {
            const next = text[index + 1];
            result += { n: "\n", t: "\t", r: "\r" }[next] ?? next;
            index += 2;
            continue;
          }
          result += text[index];
          index += 1;
        }
        if (text[index] !== char) return fail;
        index += 1;
        return result;
      }

      const literal = text.slice(index).match(/^(?:-?\d+(?:\.\d+)?(?:e[+-]?\d+)?|true|false|null)/i);
      if (!literal) return fail;
      index += literal[0].length;
      return literal[0] === "true" ? true : literal[0] === "false" ? false : literal[0] === "null" ? null : Number(literal[0]);
    };

    const result = value();
    skip();
    return result === fail || index !== text.length ? null : result;
  }

  /**
   * Packs what the PDF renderer needs to draw a DIL message the way ChatGPT
   * does: the compiled UI program, its constants and resolved component
   * results, the client-defined widgets it embeds (by invocation id), and the
   * pages its citations point to. Returns null when there is no program.
   */
  function buildDilRenderBlock(message, citationSources) {
    const dil = message?.metadata?.model_dil_v2;

    if (!dil || typeof dil.code !== "string" || !dil.code.trim()) {
      return null;
    }

    const widgetReferences = (Array.isArray(message.metadata?.content_references) ? message.metadata.content_references : [])
      .filter((reference) => reference?.type === "client_defined_widget");
    const widgets = {};

    for (const [invocationId, widget] of Object.entries(dil.clientDefinedWidgets || {})) {
      const reference = widgetReferences[Number(widget?.refIndex)];
      if (reference) {
        widgets[invocationId] = { category: reference.category || "", data: reference.data || {} };
      }
    }

    const citations = {};
    const searchable = `${dil.code}\n${JSON.stringify(dil.constants || {})}`;

    for (const ref of new Set(searchable.match(/turn\d+[a-z_]+\d+/gi) || [])) {
      const source = citationSources?.get(ref);
      if (source) {
        citations[ref] = { url: source.url, title: source.title, label: getCitationLabel(source) };
      }
    }

    return {
      version: 2,
      code: dil.code,
      constants: dil.constants || {},
      appData: dil.appData || {},
      widgets,
      citations
    };
  }

  function getCitationLabel(source) {
    try {
      return new URL(source.url).hostname.replace(/^www\./, "");
    } catch (error) {
      // A non-URL citation keeps its title as the chip label.
      return source.title;
    }
  }

  function isDilMessage(message) {
    const dil = message?.metadata?.model_dil_v2;
    return Boolean(dil && typeof dil === "object");
  }

  /**
   * Maps citation ref ids (turn<index><type><index>) to their source pages.
   * Ref ids restart in every exchange, so pass the messages of one response.
   * Two API layouts carry the mapping:
   * - search_result_groups[].entries[].ref_id on search tool messages (2026);
   * - content_references[type=grouped_webpages].items[].refs on the answer.
   */
  function buildCitationSourceIndex(messages) {
    const sources = new Map();
    const addSource = (refId, url, title) => {
      const ref = formatCitationRefId(refId);
      const href = String(url || "").trim();

      if (ref && href && !sources.has(ref)) {
        sources.set(ref, { url: href, title: String(title || href).trim() });
      }
    };

    for (const message of messages) {
      const metadata = message?.metadata || {};

      for (const group of Array.isArray(metadata.search_result_groups) ? metadata.search_result_groups : []) {
        for (const entry of Array.isArray(group?.entries) ? group.entries : []) {
          addSource(entry?.ref_id, entry?.url, entry?.title || group?.domain);
        }
      }

      for (const reference of Array.isArray(metadata.content_references) ? metadata.content_references : []) {
        if (reference?.type !== "grouped_webpages") {
          continue;
        }

        for (const item of Array.isArray(reference.items) ? reference.items : []) {
          for (const refId of Array.isArray(item?.refs) ? item.refs : []) {
            addSource(refId, item?.url, item?.title || item?.attribution);
          }
        }
      }
    }

    return sources;
  }

  function formatCitationRefId(refId) {
    if (!refId || typeof refId !== "object") {
      return "";
    }

    const turnIndex = refId.turn_index ?? refId.turnIndex;
    const refType = refId.ref_type ?? refId.refType;
    const refIndex = refId.ref_index ?? refId.refIndex;

    if (turnIndex == null || !refType || refIndex == null) {
      return "";
    }

    return `turn${turnIndex}${refType}${refIndex}`;
  }

  /**
   * Creates the per-response state shared by every text part of one assistant
   * turn, so footnote numbers stay unique across the whole response.
   */
  function createChatGptMarkupContext(options = {}) {
    return {
      citationSources: options.citationSources || new Map(),
      footnoteOffset: Math.max(0, Number(options.footnoteOffset) || 0),
      footnotes: [],
      footnoteIndexByRef: new Map(),
      tokenCounts: {},
      unknownTokenCounts: {},
      unresolvedCitationRefs: []
    };
  }

  /**
   * Replaces ChatGPT inline reference tokens with portable Markdown. Citations
   * become numbered footnote references; call formatChatGptFootnotes() with the
   * same context once all parts of the response are rendered.
   */
  function renderChatGptInlineTokens(markdown, context = createChatGptMarkupContext()) {
    const text = String(markdown || "");

    if (!text.includes(CHATGPT_TOKEN_START)) {
      return text;
    }

    return text.replace(CHATGPT_INLINE_TOKEN_RE, (match, rawName, rawArgs) => {
      const name = rawName.toLowerCase();
      const args = rawArgs ? rawArgs.split(CHATGPT_TOKEN_SEPARATOR).slice(1) : [];
      context.tokenCounts[name] = (context.tokenCounts[name] || 0) + 1;

      switch (name) {
        case "cite":
          return renderCitationToken(args, context);
        case "entity":
          return renderEntityToken(args);
        case "url":
          return renderUrlToken(args);
        case "image_group":
          return renderImageGroupToken(args);
        case "navlist":
          return renderNavlistToken(args, context);
        default:
          context.unknownTokenCounts[name] = (context.unknownTokenCounts[name] || 0) + 1;
          return args.filter(isReadableTokenArgument).join(" ");
      }
    });
  }

  function renderCitationToken(args, context) {
    const references = [];

    for (const arg of args) {
      const ref = String(arg || "").trim();

      if (!CHATGPT_CITATION_REF_RE.test(ref)) {
        continue;
      }

      const footnote = resolveCitationFootnote(ref, context);

      if (footnote && !references.includes(footnote)) {
        references.push(footnote);
      }
    }

    return references.map((index) => `[^${index}]`).join("");
  }

  function resolveCitationFootnote(ref, context) {
    if (context.footnoteIndexByRef.has(ref)) {
      return context.footnoteIndexByRef.get(ref);
    }

    const source = context.citationSources.get(ref);

    if (!source) {
      if (!context.unresolvedCitationRefs.includes(ref)) {
        context.unresolvedCitationRefs.push(ref);
      }
      return 0;
    }

    // Search results often repeat one page under several ref ids.
    const samePage = context.footnotes.find((footnote) => footnote.url === source.url);

    if (samePage) {
      context.footnoteIndexByRef.set(ref, samePage.index);
      return samePage.index;
    }

    const index = context.footnoteOffset + context.footnotes.length + 1;
    context.footnotes.push({ index, ref, ...source });
    context.footnoteIndexByRef.set(ref, index);
    return index;
  }

  function renderEntityToken(args) {
    const parsed = parseJsonTokenArgument(args[0]);

    if (Array.isArray(parsed)) {
      return String(parsed[1] ?? parsed[0] ?? "").trim();
    }

    return String(args[1] ?? args[0] ?? "").trim();
  }

  function renderUrlToken(args) {
    const values = args.map((arg) => String(arg || "").trim()).filter(Boolean);
    const url = values.find((value) => /^https?:\/\//i.test(value)) || "";
    const title = values.find((value) => value !== url) || url;

    if (!url) {
      return title;
    }

    return `[${escapeMarkdownLinkLabel(title)}](${url})`;
  }

  function renderImageGroupToken(args) {
    const parsed = parseJsonTokenArgument(args[0]);
    const queries = Array.isArray(parsed?.query)
      ? parsed.query
      : (typeof parsed?.query === "string" ? [parsed.query] : []);
    const label = queries.map((query) => String(query || "").trim()).filter(Boolean).join("; ");
    return label ? `*[Image search: ${escapeMarkdownLinkLabel(label)}]*` : "";
  }

  function renderNavlistToken(args, context) {
    const [title = "", ...refs] = args.map((arg) => String(arg || "").trim());
    const links = refs
      .filter((ref) => CHATGPT_CITATION_REF_RE.test(ref))
      .map((ref) => context.citationSources.get(ref))
      .filter(Boolean)
      .map((source) => `- [${escapeMarkdownLinkLabel(source.title)}](${source.url})`);

    return [title ? `**${title}**` : "", ...links].filter(Boolean).join("\n");
  }

  function parseJsonTokenArgument(value) {
    try {
      return JSON.parse(String(value || ""));
    } catch (error) {
      // Token arguments are model output; a malformed payload degrades to text.
      return null;
    }
  }

  function isReadableTokenArgument(value) {
    const text = String(value || "").trim();
    return Boolean(text)
      && !CHATGPT_CITATION_REF_RE.test(text)
      && !/^[{[]/.test(text);
  }

  function formatChatGptFootnotes(context) {
    return context.footnotes
      .map((footnote) => `[^${footnote.index}]: [${escapeMarkdownLinkLabel(footnote.title)}](${footnote.url})`)
      .join("\n");
  }

  /**
   * Converts :::writing directives (ChatGPT's copyable writing blocks) into
   * ```writing fences: Markdown readers keep the text verbatim and copyable,
   * and the PDF renderer shows the fence as a formatted writing card.
   */
  function renderChatGptWritingBlocks(markdown) {
    return String(markdown || "").replace(CHATGPT_WRITING_BLOCK_RE, (match, prefix, body) => {
      const fence = makeFence(body);
      return `${prefix}${fence}writing\n${body}\n${fence}`;
    });
  }

  /**
   * Degrades DIL component source to static Markdown. It is used only when a
   * DIL message lacks fallbackMarkdown; code fences are left untouched.
   */
  function renderDilSourceAsMarkdown(source) {
    return mapOutsideCodeFences(expandDilTemplateBlocks(String(source || "")).text, (segment) => {
      const withoutStatements = stripDilExpressionBlocks(segment);
      // Component nesting indents source lines; four spaces would turn them
      // into Markdown code blocks, so only list items keep their indentation.
      return joinDilRows(renderDilComponents(withoutStatements))
        .replace(/^[ \t]+(?![-*+][ \t]|\d+[.)][ \t])/gm, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n");
    });
  }

  const DIL_ROW_OPEN = "\u0001DILROW<";
  const DIL_ROW_CLOSE = "\u0001DILROW>";

  // A <row> lays its children out horizontally; in Markdown its text parts
  // become one line joined with " · ". Inner rows are joined first.
  function joinDilRows(text) {
    const innermost = new RegExp(`${DIL_ROW_OPEN}((?:(?!${DIL_ROW_OPEN})[\\s\\S])*?)${DIL_ROW_CLOSE}`);
    let output = text;
    let match;

    while ((match = output.match(innermost))) {
      const parts = match[1].split("\n").map((line) => line.trim()).filter(Boolean);
      output = output.slice(0, match.index) + `\n\n${parts.join(" · ")}\n\n` + output.slice(match.index + match[0].length);
    }

    return output.split(DIL_ROW_OPEN).join("").split(DIL_ROW_CLOSE).join("");
  }

  function mapOutsideCodeFences(text, transform) {
    const lines = text.split("\n");
    const output = [];
    let buffer = [];
    let fence = null;

    const flush = () => {
      if (buffer.length) {
        output.push(transform(buffer.join("\n")));
        buffer = [];
      }
    };

    for (const line of lines) {
      const match = line.match(/^\s*(`{3,}|~{3,})/);

      if (!fence && match) {
        flush();
        fence = match[1];
        output.push(line);
        continue;
      }

      if (fence) {
        output.push(line);

        if (line.trim().startsWith(fence[0].repeat(fence.length)) && line.trim().replace(/[`~]/g, "") === "") {
          fence = null;
        }
        continue;
      }

      buffer.push(line);
    }

    flush();
    return output.join("\n");
  }

  function stripDilExpressionBlocks(text) {
    let output = "";
    let index = 0;

    while (index < text.length) {
      const open = text.indexOf("{", index);

      if (open < 0) {
        output += text.slice(index);
        break;
      }

      const close = findBalancedBraceEnd(text, open);
      const block = close > open ? text.slice(open, close + 1) : "";
      const isStatement = /^\{\s*@/.test(block);
      const isExpression = /=>|\bDIL\.|\bGenUI\./.test(block);

      if (block && (isStatement || isExpression) && !isInsideDilTag(text, open)) {
        output += text.slice(index, open);
        index = close + 1;
        continue;
      }

      output += text.slice(index, open + 1);
      index = open + 1;
    }

    return output;
  }

  function isInsideDilTag(text, position) {
    const tagStart = text.lastIndexOf("<", position);
    const tagEnd = text.lastIndexOf(">", position);
    return tagStart > tagEnd && /^<\/?[A-Za-z]/.test(text.slice(tagStart, tagStart + 2));
  }

  function findBalancedBraceEnd(text, start) {
    let depth = 0;
    let quote = "";

    for (let index = start; index < text.length; index += 1) {
      const char = text[index];

      if (quote) {
        if (char === "\\") {
          index += 1;
        } else if (char === quote) {
          quote = "";
        }
        continue;
      }

      if (char === "\"" || char === "'" || char === "`") {
        quote = char;
      } else if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;

        if (depth === 0) {
          return index;
        }
      }
    }

    return -1;
  }

  function renderDilComponents(text) {
    let output = "";
    let index = 0;

    while (index < text.length) {
      const tag = readDilTag(text, index);

      if (!tag) {
        output += text[index];
        index += 1;
        continue;
      }

      output += renderDilTag(tag);
      index = tag.end;
    }

    return output;
  }

  function readDilTag(text, start) {
    if (text[start] !== "<") {
      return null;
    }

    const nameMatch = text.slice(start).match(/^<(\/?)([A-Za-z][\w-]*)/);

    if (!nameMatch || !DIL_COMPONENT_NAMES.has(nameMatch[2])) {
      return null;
    }

    const closing = nameMatch[1] === "/";
    const name = nameMatch[2];
    const attributes = {};
    let index = start + nameMatch[0].length;

    while (index < text.length) {
      while (/\s/.test(text[index] || "")) {
        index += 1;
      }

      if (text.startsWith("/>", index)) {
        return { name, closing, selfClosing: true, attributes, end: index + 2 };
      }

      if (text[index] === ">") {
        return { name, closing, selfClosing: false, attributes, end: index + 1 };
      }

      const attributeMatch = text.slice(index).match(/^([A-Za-z_][\w-]*)/);

      if (!attributeMatch) {
        return null;
      }

      const attributeName = attributeMatch[1];
      index += attributeName.length;

      if (text[index] !== "=") {
        attributes[attributeName] = true;
        continue;
      }

      index += 1;
      const valueStart = index;

      if (text[index] === "\"" || text[index] === "'") {
        const quote = text[index];
        let cursor = index + 1;

        while (cursor < text.length && text[cursor] !== quote) {
          cursor += text[cursor] === "\\" ? 2 : 1;
        }

        attributes[attributeName] = text.slice(valueStart + 1, cursor);
        index = cursor + 1;
      } else if (text[index] === "{") {
        const close = findBalancedBraceEnd(text, index);

        if (close < 0) {
          return null;
        }

        attributes[attributeName] = { expression: text.slice(index + 1, close) };
        index = close + 1;
      } else {
        return null;
      }
    }

    return null;
  }

  function renderDilTag(tag) {
    const attributes = tag.attributes;
    const text = (name) => (typeof attributes[name] === "string" ? attributes[name] : "");

    if (tag.closing) {
      switch (tag.name) {
        case "title":
          return "**";
        case "badge":
          return ")";
        case "button":
          return "]";
        case "WritingBlock":
          return "\n```\n";
        case "row":
          return DIL_ROW_CLOSE;
        case "box":
        case "grid":
        case "grid-item":
        case "pressable":
        case "radio-group":
        case "caption":
        case "radio":
        case "text":
          return "\n";
        default:
          return "";
      }
    }

    switch (tag.name) {
      case "Link": {
        const url = text("url");
        const title = text("title") || url;
        return url ? `[${escapeMarkdownLinkLabel(title)}](${url})` : title;
      }
      case "Entity":
        return text("value");
      case "AsyncImage":
        return text("query") ? `*[Image search: ${escapeMarkdownLinkLabel(text("query"))}]*` : "";
      case "Cite": {
        const refs = typeof attributes.ref === "string"
          ? [attributes.ref]
          : (parseDilLiteral(attributes.refs?.expression ?? attributes.refs) || []);
        const valid = (Array.isArray(refs) ? refs : []).filter((ref) => typeof ref === "string" && CHATGPT_CITATION_REF_RE.test(ref));
        return valid.length
          ? `${CHATGPT_TOKEN_START}cite${valid.map((ref) => `${CHATGPT_TOKEN_SEPARATOR}${ref}`).join("")}${CHATGPT_TOKEN_END}`
          : "";
      }
      case "MemoryCite":
      case "spacer":
        return "";
      case "icon":
        return renderDilIcon(text("name"));
      case "divider":
        return "\n\n---\n\n";
      case "title":
        return tag.selfClosing ? "" : "**";
      case "badge":
        return tag.selfClosing ? "" : " (";
      case "button":
        return tag.selfClosing ? "" : "[";
      case "radio":
        return tag.selfClosing ? "" : "\n- ";
      case "WritingBlock":
        return tag.selfClosing ? "" : "\n```writing\n";
      case "row":
        return tag.selfClosing ? "" : DIL_ROW_OPEN;
      default:
        return tag.selfClosing ? "" : "\n";
    }
  }

  function renderDilIcon(name) {
    const glyphs = {
      "arrow-down": "↓",
      "arrow-right": "→",
      "arrow-left": "←",
      "arrow-up": "↑",
      "check": "✓",
      "check-circle-2": "✓",
      "circle": "○"
    };
    return glyphs[String(name || "").toLowerCase()] || "";
  }
  // ============================================================================
  // CHATGPT DOM SCHEMA: MESSAGE UNITS (2026-10)
  // ============================================================================
  //
  // Current ChatGPT pages render one [data-turn-key] container per exchange.
  // Each message inside it is a unit:
  //
  //   [data-turn-key="<user message id>"]
  //     [data-chatgpt-search-unit-key="<turn>:<index>:user"]
  //        data-chatgpt-search-message-ids="<message id>"
  //       [data-user-message-bubble]                       user body
  //     [data-chatgpt-search-unit-key="<turn>:<index>:assistant"]
  //        data-chatgpt-search-message-ids="<message id> ..."
  //       [data-markdown-text-style="assistant-message"]   assistant body
  //
  // The unit key carries the role, and the message ids match the conversation
  // API, so units are the message nodes for Full capture. The <turn> prefix is
  // a render-window key (for example "fallback-turn-3"), not a global order.
  // Legacy pages ([data-message-author-role], conversation-turn-N) keep using
  // the selectors in index.js.

  const CHATGPT_MESSAGE_UNIT_SELECTOR = "[data-chatgpt-search-unit-key]";
  const CHATGPT_UNIT_BODY_SELECTORS = {
    assistant: [
      "[data-markdown-text-style='assistant-message']",
      "[data-markdown-copy='contents']"
    ],
    user: [
      "[data-user-message-bubble]"
    ]
  };
  const CHATGPT_WRITING_BLOCK_SELECTOR = "[data-testid='chatgpt-writing-block']";
  const CHATGPT_COPY_EXCLUDED_SELECTOR = "[data-markdown-copy='exclude']";

  function isChatGptMessageUnit(node) {
    return Boolean(node?.matches?.(CHATGPT_MESSAGE_UNIT_SELECTOR));
  }

  function hasChatGptMessageUnits(root = document) {
    return Boolean(root?.querySelector?.(CHATGPT_MESSAGE_UNIT_SELECTOR));
  }

  /**
   * Reads role and ChatGPT message ids from a message unit.
   *
   * @returns {{ role: string, messageIds: string[], unitKey: string, turnKey: string } | null}
   */
  function getChatGptMessageUnitInfo(node) {
    const unit = isChatGptMessageUnit(node) ? node : node?.closest?.(CHATGPT_MESSAGE_UNIT_SELECTOR);

    if (!unit) {
      return null;
    }

    const unitKey = unit.getAttribute("data-chatgpt-search-unit-key") || "";
    const keyRole = (unitKey.match(/:(user|assistant|system|tool)$/i)?.[1] || "").toLowerCase();
    const headingRole = String(unit.querySelector("[data-conversation-role]")?.getAttribute("data-conversation-role") || "").toLowerCase();
    const messageIds = uniqueStrings([
      ...String(unit.getAttribute("data-chatgpt-search-message-ids") || "").split(/\s+/),
      ...[...unit.querySelectorAll("[data-chatgpt-selection-message-id]")]
        .map((element) => element.getAttribute("data-chatgpt-selection-message-id") || "")
    ].map((id) => id.trim()).filter(Boolean));

    return {
      role: keyRole || headingRole,
      messageIds,
      unitKey,
      turnKey: unit.closest("[data-turn-key]")?.getAttribute("data-turn-key") || ""
    };
  }

  function getChatGptMessageUnitBody(node, role) {
    if (!isChatGptMessageUnit(node)) {
      return null;
    }

    for (const selector of CHATGPT_UNIT_BODY_SELECTORS[role] || []) {
      const body = node.querySelector(selector);

      if (body) {
        return body;
      }
    }

    return null;
  }

  // DIL responses render through [data-dil-message-id] with data-d-component
  // markers. Citation chips are popover triggers that wrap a pill badge and no
  // link; Link components are popover triggers that wrap a plain <a href>.
  const CHATGPT_DIL_ROOT_SELECTOR = "[data-dil-message-id]";

  function isChatGptDilCitationChip(element) {
    return Boolean(
      element?.matches?.("[data-d-component='popover-trigger']")
      && element.querySelector("[data-d-component='badge'][data-pill]")
      && !element.querySelector("a[href]")
    );
  }

  function formatChatGptDilCitationChip(element) {
    const label = String(element.textContent || "").replace(/\s+/g, " ").trim();
    return label ? ` (${label})` : "";
  }

  function isChatGptDilWebLink(element, href) {
    return Boolean(element?.closest?.(CHATGPT_DIL_ROOT_SELECTOR))
      && /^https?:\/\//i.test(String(href || ""))
      && !/\/backend-api\/|oaiusercontent\.com/i.test(String(href || ""));
  }

  function isChatGptDilDivider(element) {
    return Boolean(element?.matches?.("[data-d-component='divider']"));
  }

  function hasChatGptDilStrongMarker(element) {
    return Boolean(element?.hasAttribute?.("data-d-default-strong"));
  }

  function isChatGptCopyExcludedElement(element) {
    return Boolean(element?.matches?.(CHATGPT_COPY_EXCLUDED_SELECTOR));
  }

  function isChatGptWritingBlockElement(element) {
    return Boolean(element?.matches?.(CHATGPT_WRITING_BLOCK_SELECTOR));
  }

  /**
   * Writing blocks render through an editor surface; ChatGPT keeps the block's
   * Markdown source in data-markdown-copy-text for its own copy action.
   */
  function formatChatGptWritingBlock(element) {
    const text = String(element.getAttribute("data-markdown-copy-text") || element.innerText || "").replace(/\s+$/g, "");

    if (!text.trim()) {
      return "";
    }

    const fence = makeFence(text);
    return `${fence}writing\n${text}\n${fence}`;
  }

  /**
   * Keeps the discovery order of message ids across virtualized scroll
   * batches. Each batch is in document order; ids not seen before are placed
   * after the nearest earlier id of the same batch that is already known.
   */
  function createDomOrderRegistry() {
    const order = [];

    return {
      observe(ids) {
        let anchor = -1;

        for (const id of ids) {
          if (!id) {
            continue;
          }

          const known = order.indexOf(id);

          if (known >= 0) {
            anchor = known;
            continue;
          }

          order.splice(anchor + 1, 0, id);
          anchor += 1;
        }
      },

      rank(id) {
        const index = order.indexOf(id);
        return index >= 0 ? index + 1 : NaN;
      },

      size() {
        return order.length;
      }
    };
  }

  /**
   * Orders captured messages by the conversation manifest when one is
   * available and assigns contiguous order numbers. Messages the manifest
   * does not know keep their position relative to their neighbours.
   */
  function applyManifestOrder(messages, manifest, debugLog = null) {
    if (!manifest?.entries?.length) {
      return messages;
    }

    const positionByIdentity = new Map(manifest.entries.map((entry, index) => [entry.identity, index]));
    let lastPosition = -1;
    const keyed = messages.map((message, index) => {
      const position = positionByIdentity.get(resolveManifestIdentity(manifest, message));

      if (position != null) {
        lastPosition = position;
        return { message, key: position, tie: index };
      }

      return { message, key: lastPosition + 0.5, tie: index };
    });

    keyed.sort((a, b) => (a.key - b.key) || (a.tie - b.tie));
    const ordered = keyed.map((entry, index) => {
      entry.message.order = index + 1;
      entry.message.conversationOrder = index + 1;
      return entry.message;
    });

    debugLog?.event("fullCapture.manifestOrder", {
      messages: ordered.length,
      matched: keyed.filter((entry) => Number.isInteger(entry.key)).length
    });

    return ordered;
  }
  // ============================================================================
  // CONVERSATION MANIFEST (expected structure from the raw conversation API)
  // ============================================================================
  //
  // The manifest states which messages an export must contain. It is derived
  // from raw API nodes with its own visibility rules and never from exporter
  // output, so the completeness gate compares two independent results:
  //
  //   raw API nodes --buildConversationManifest--> expected entries
  //   raw API nodes --Fast builder / DOM capture--> exported messages
  //
  // Entries are matched by ChatGPT message id, not by position, so a dropped
  // or duplicated message cannot shift every later comparison.

  const MANIFEST_REPLY_STATUS = Object.freeze({
    ANSWER: "answer",
    THINKING_ONLY: "thinking-only",
    INTERRUPTED: "interrupted",
    EMPTY: "empty",
    NO_REPLY: "no-reply"
  });

  /**
   * Builds the expected export structure of the current conversation branch.
   *
   * @returns {{
   *   entries: Array<{ identity: string, role: "user" | "assistant", nodeIds: string[], status: string }>,
   *   gaps: Array<{ userIdentity: string, userNodeId: string, status: string, reason: string, createTime: number | null }>,
   *   nodeIdentity: Map<string, string>,
   *   counts: { pathNodes: number, hiddenNodes: number, user: number, assistant: number }
   * }}
   */
  function buildConversationManifest(data) {
    const pathNodes = getConversationApiCurrentPath(data);
    const entries = [];
    const gaps = [];
    const nodeIdentity = new Map();
    let hiddenNodes = 0;
    let pendingUser = null;
    let pendingReplyNodes = [];

    const closeExchange = () => {
      if (!pendingUser) {
        pendingReplyNodes = [];
        return;
      }

      const reply = classifyManifestReply(pendingReplyNodes);

      if (reply.status === MANIFEST_REPLY_STATUS.ANSWER || reply.status === MANIFEST_REPLY_STATUS.THINKING_ONLY) {
        const identity = `reply:${reply.nodeIds[0]}`;
        entries.push({ identity, role: "assistant", nodeIds: reply.nodeIds, status: reply.status });
        reply.nodeIds.forEach((nodeId) => nodeIdentity.set(nodeId, identity));
      } else {
        gaps.push({
          userIdentity: pendingUser.identity,
          userNodeId: pendingUser.nodeId,
          status: reply.status,
          reason: reply.reason,
          createTime: pendingUser.createTime
        });
      }

      pendingUser = null;
      pendingReplyNodes = [];
    };

    for (const node of pathNodes) {
      const message = node?.message;

      if (!message) {
        continue;
      }

      if (isManifestHiddenMessage(message)) {
        hiddenNodes += 1;
        continue;
      }

      const role = String(message.author?.role || "").toLowerCase();
      const nodeId = String(message.id || node.id || "");

      if (role === "user") {
        closeExchange();
        const identity = `message:${nodeId}`;
        entries.push({ identity, role: "user", nodeIds: [nodeId], status: "prompt" });
        nodeIdentity.set(nodeId, identity);
        pendingUser = {
          identity,
          nodeId,
          createTime: Number.isFinite(Number(message.create_time)) ? Number(message.create_time) : null
        };
        continue;
      }

      if (role === "assistant" || role === "tool") {
        if (!pendingUser) {
          // A reply without a visible prompt (for example a greeting) still
          // belongs in the export when it shows content.
          pendingUser = { identity: "", nodeId: "", createTime: null, synthetic: true };
        }
        pendingReplyNodes.push({ nodeId, message });
      }
    }

    closeExchange();

    // Drop gaps recorded for synthetic prompt placeholders.
    const visibleGaps = gaps.filter((gap) => gap.userIdentity);

    return {
      entries,
      gaps: visibleGaps,
      nodeIdentity,
      counts: {
        pathNodes: pathNodes.length,
        hiddenNodes,
        user: entries.filter((entry) => entry.role === "user").length,
        assistant: entries.filter((entry) => entry.role === "assistant").length
      }
    };
  }

  function isManifestHiddenMessage(message) {
    const metadata = message?.metadata || {};
    const authorMetadata = message?.author?.metadata || {};
    return [
      metadata.is_visually_hidden_from_conversation,
      metadata.is_hidden,
      metadata.hidden,
      authorMetadata.is_visually_hidden_from_conversation,
      authorMetadata.is_hidden,
      authorMetadata.hidden
    ].some((value) => value === true || String(value || "").toLowerCase() === "true");
  }

  function classifyManifestReply(replyNodes) {
    const nodeIds = replyNodes.map((entry) => entry.nodeId).filter(Boolean);

    if (!replyNodes.length) {
      return {
        status: MANIFEST_REPLY_STATUS.NO_REPLY,
        // The tree API omits replies stopped before any content; only the
        // paginated API keeps them, which classifies them as "interrupted".
        reason: "ChatGPT stored no reply after this prompt (stopped before any content, or never generated).",
        nodeIds
      };
    }

    const messages = replyNodes.map((entry) => entry.message);

    if (messages.some(hasManifestAnswerContent)) {
      return { status: MANIFEST_REPLY_STATUS.ANSWER, reason: "", nodeIds };
    }

    if (messages.some(hasManifestThinkingContent)) {
      return { status: MANIFEST_REPLY_STATUS.THINKING_ONLY, reason: "", nodeIds };
    }

    const interrupted = messages.find((message) => {
      const finish = message?.metadata?.finish_details || {};
      return String(finish.type || "").toLowerCase() === "interrupted";
    });

    if (interrupted) {
      const finishReason = String(interrupted.metadata.finish_details.reason || "interrupted");
      return {
        status: MANIFEST_REPLY_STATUS.INTERRUPTED,
        reason: `The response was stopped before it produced content (${finishReason}).`,
        nodeIds
      };
    }

    return {
      status: MANIFEST_REPLY_STATUS.EMPTY,
      reason: "The stored response has no visible content.",
      nodeIds
    };
  }

  /**
   * A reply shows an answer when an assistant message addressed to the user
   * (not a tool call or reasoning channel) carries text, DIL fallback Markdown,
   * or media; or when any reply node carries an image or generated file.
   */
  function hasManifestAnswerContent(message) {
    if (!message) {
      return false;
    }

    const role = String(message.author?.role || "").toLowerCase();
    const parts = Array.isArray(message.content?.parts) ? message.content.parts : [];
    // Document-reading tools attach page images for the model only.
    const isDocumentReader = role === "tool" && /^(?:file_search|myfiles_browser)(?:\.|$)/.test(String(message.author?.name || "").toLowerCase());

    if (!isDocumentReader && parts.some(isManifestMediaPart)) {
      return true;
    }

    if (role !== "assistant") {
      return false;
    }

    const recipient = String(message.recipient || "").toLowerCase();
    const channel = String(message.channel || "").toLowerCase();
    const contentType = String(message.content?.content_type || "").toLowerCase();

    if (recipient && recipient !== "all") {
      return false;
    }

    if (channel && channel !== "final") {
      return false;
    }

    if (!["text", "multimodal_text"].includes(contentType)) {
      return false;
    }

    const dilFallback = message.metadata?.model_dil_v2?.fallbackMarkdown;

    if (typeof dilFallback === "string" && dilFallback.trim()) {
      return true;
    }

    return parts.some((part) => typeof part === "string" && part.trim());
  }

  function isManifestMediaPart(part) {
    if (!part || typeof part !== "object") {
      return false;
    }

    const pointer = String(part.asset_pointer || part.assetPointer || "");
    return Boolean(pointer) && /image|file-service|sediment/i.test(`${part.content_type || ""} ${pointer}`);
  }

  function hasManifestThinkingContent(message) {
    const content = message?.content || {};
    const contentType = String(content.content_type || "").toLowerCase();

    if (contentType === "thoughts") {
      return Array.isArray(content.thoughts)
        && content.thoughts.some((thought) => String(thought?.summary || thought?.content || "").trim());
    }

    if (contentType === "reasoning_recap") {
      return typeof content.content === "string" && Boolean(content.content.trim());
    }

    // Commentary preambles appear in ChatGPT's activity timeline.
    if (String(message?.channel || "").toLowerCase() === "commentary") {
      const parts = Array.isArray(content.parts) ? content.parts : [];
      return parts.some((part) => typeof part === "string" && part.trim());
    }

    return false;
  }

  /**
   * Resolves the manifest identity of an exported message from any ChatGPT
   * message id it carries. Returns "" when the message is not in the manifest.
   */
  function resolveManifestIdentity(manifest, message) {
    for (const id of getCapturedSourceMessageIds(message)) {
      const identity = manifest.nodeIdentity.get(id);

      if (identity) {
        return identity;
      }
    }

    return "";
  }

  function getCapturedSourceMessageIds(message) {
    return [
      message?.sourceMessageId,
      ...(Array.isArray(message?.sourceMessageIds) ? message.sourceMessageIds : []),
      message?.sourceTurnId
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
  }

  /**
   * Compares exported messages with the manifest. The returned report has the
   * same fields as buildCaptureCompletenessReport so the selector UI, the
   * export gate, and the debug log treat both sources alike.
   */
  function buildManifestCompletenessReport(messages, manifest, options = {}) {
    const captureMode = normalizeCaptureMode(options.captureMode);
    const expectedIdentities = manifest.entries.map((entry) => entry.identity);
    const expectedIdentitySet = new Set(expectedIdentities);
    const capturedIdentities = [];
    const unmatchedMessages = [];
    const duplicateIdentities = [];

    messages.forEach((message, index) => {
      const identity = resolveManifestIdentity(manifest, message);

      if (!identity) {
        unmatchedMessages.push({
          index,
          role: message?.role || "",
          preview: truncatePreview(String(message?.preview || message?.markdown || ""), 120)
        });
        return;
      }

      if (capturedIdentities.includes(identity)) {
        duplicateIdentities.push(identity);
        return;
      }

      capturedIdentities.push(identity);
    });

    const capturedIdentitySet = new Set(capturedIdentities);
    const missingEntries = manifest.entries.filter((entry) => !capturedIdentitySet.has(entry.identity));
    const roleSequence = getRoleSequenceDiagnostics(messages);
    const imageStats = getCaptureImageCompletenessStats(messages);
    const reconciliationReport = options.reconciliationReport || {};
    const substantiveFullOnlyMessages = Number(reconciliationReport.substantiveFullOnlyMessages || 0);
    const expectedUser = manifest.counts.user;
    const expectedAssistant = manifest.counts.assistant;
    const issues = [];
    const warnings = [];

    if (missingEntries.length) {
      const missingUser = missingEntries.filter((entry) => entry.role === "user").length;
      const missingAssistant = missingEntries.length - missingUser;
      issues.push({
        code: "missing-identities",
        message: `Missing ${missingEntries.length} expected message(s): ${missingUser} user, ${missingAssistant} assistant.`,
        missing: missingEntries.slice(0, 50).map((entry) => ({
          identity: entry.identity,
          role: entry.role,
          position: expectedIdentities.indexOf(entry.identity) + 1
        }))
      });
    }

    if (roleSequence.userMessages < expectedUser) {
      issues.push({
        code: "missing-user-messages",
        message: `Captured ${roleSequence.userMessages}/${expectedUser} expected user messages.`
      });
    }

    if (roleSequence.assistantMessages < expectedAssistant) {
      issues.push({
        code: "missing-assistant-messages",
        message: `Captured ${roleSequence.assistantMessages}/${expectedAssistant} expected assistant messages.`
      });
    }

    if (!isManifestOrderPreserved(messages, manifest)) {
      issues.push({
        code: "order-mismatch",
        message: "Captured messages are not in conversation order."
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

    if (unmatchedMessages.length) {
      warnings.push({
        code: "unmatched-messages",
        message: `${unmatchedMessages.length} captured message(s) have no ChatGPT message id in the conversation branch.`,
        samples: unmatchedMessages.slice(0, 12)
      });
    }

    if (duplicateIdentities.length) {
      warnings.push({
        code: "duplicate-identities",
        message: `${duplicateIdentities.length} captured message(s) repeat an earlier message.`,
        identities: duplicateIdentities.slice(0, 20)
      });
    }

    if (roleSequence.sameRolePairs.length) {
      warnings.push({
        code: "same-role-adjacency",
        message: formatSameRoleAdjacencyWarning(roleSequence.sameRolePairs.length, manifest.gaps),
        pairs: roleSequence.sameRolePairs,
        explainedBy: manifest.gaps
      });
    }

    const complete = issues.length === 0;
    return {
      complete,
      requiresOverride: !complete,
      captureMode,
      coverageKnown: true,
      expectedSource: "conversation-api-manifest",
      expected: {
        uniqueIdentities: expectedIdentities.length,
        conversationOrders: [],
        userMessages: expectedUser,
        assistantMessages: expectedAssistant,
        startRole: manifest.entries[0]?.role || "",
        endRole: manifest.entries[manifest.entries.length - 1]?.role || "",
        sameRoleAdjacencies: manifest.gaps.length,
        replyGaps: manifest.gaps
      },
      captured: {
        messages: messages.length,
        uniqueIdentities: capturedIdentities.filter((identity) => expectedIdentitySet.has(identity)).length,
        conversationOrders: [],
        userMessages: roleSequence.userMessages,
        assistantMessages: roleSequence.assistantMessages,
        startRole: messages[0]?.role || "",
        endRole: messages[messages.length - 1]?.role || "",
        sameRoleAdjacencies: roleSequence.sameRolePairs
      },
      missingConversationOrders: missingEntries.map((entry) => expectedIdentities.indexOf(entry.identity) + 1),
      missingIdentities: missingEntries.map((entry) => entry.identity),
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

  function isManifestOrderPreserved(messages, manifest) {
    const positionByIdentity = new Map(manifest.entries.map((entry, index) => [entry.identity, index]));
    let previous = -1;

    for (const message of messages) {
      const position = positionByIdentity.get(resolveManifestIdentity(manifest, message));

      if (position == null) {
        continue;
      }

      if (position < previous) {
        return false;
      }

      previous = position;
    }

    return true;
  }

  function formatSameRoleAdjacencyWarning(pairCount, gaps) {
    const byStatus = gaps.reduce((counts, gap) => {
      counts[gap.status] = (counts[gap.status] || 0) + 1;
      return counts;
    }, {});
    const reasons = [
      byStatus[MANIFEST_REPLY_STATUS.INTERRUPTED] ? `${byStatus[MANIFEST_REPLY_STATUS.INTERRUPTED]} stopped before any content` : "",
      byStatus[MANIFEST_REPLY_STATUS.NO_REPLY] ? `${byStatus[MANIFEST_REPLY_STATUS.NO_REPLY]} with no stored reply` : "",
      byStatus[MANIFEST_REPLY_STATUS.EMPTY] ? `${byStatus[MANIFEST_REPLY_STATUS.EMPTY]} answered with no visible content` : ""
    ].filter(Boolean);

    if (!reasons.length) {
      return `${pairCount} same-role adjacency pair(s) detected.`;
    }

    return `${pairCount} same-role adjacency pair(s): ChatGPT has no reply for ${gaps.length} prompt(s) (${reasons.join(", ")}).`;
  }

  // Agent trace: every node ChatGPT stores between a prompt and its answer, in
  // tree order, as typed events with full content. The PDF thinking timeline
  // and the bundle's agent-trace files are both built from it.
  //
  // Event kinds: thought (summarized reasoning step), note (the model's own
  // commentary), tool_call, tool_result, recap, answer, other. ChatGPT stores
  // web.run and functions.* calls with empty text; those calls carry
  // inputHidden: true instead of invented content.
  const AGENT_TRACE_VERSION = 2;

  function buildTurnAgentTrace(nodes, options = {}) {
    const messages = (Array.isArray(nodes) ? nodes : []).map((node) => node?.message).filter(Boolean);
    const events = [];
    const sources = new Map();
    const calls = createTraceCallQueue();
    let model = null;
    let durationSeconds = 0;
    let firstTime = null;
    let lastTime = null;

    const push = (msg, time, kind, fields) => {
      const event = {
        seq: events.length + 1,
        nodeId: msg.id || "",
        at: formatTraceTime(time),
        offsetSeconds: time != null && firstTime != null ? Math.round((time - firstTime) * 10) / 10 : null,
        kind,
        ...fields
      };
      events.push(event);
      return event;
    };

    for (const msg of messages) {
      const role = String(msg.author?.role || "").toLowerCase();
      const recipient = String(msg.recipient || "").toLowerCase();
      const channel = String(msg.channel || msg.metadata?.channel || "").toLowerCase();
      const contentType = String(msg.content?.content_type || "").toLowerCase();
      const metadata = msg.metadata || {};
      const time = Number(msg.create_time) || null;

      if (time != null) {
        firstTime ??= time;
        lastTime = time;
      }
      if (!model && role === "assistant" && (metadata.model_slug || metadata.resolved_model_slug)) {
        model = {
          slug: metadata.model_slug || "",
          resolvedSlug: metadata.resolved_model_slug || "",
          thinkingEffort: metadata.thinking_effort || "",
          cotVersion: metadata.cot_version || ""
        };
      }
      durationSeconds = Math.max(durationSeconds, Number(metadata.finished_duration_sec || metadata.thinking_duration_seconds || 0));

      if (contentType === "reasoning_recap") {
        push(msg, time, "recap", {
          text: typeof msg.content?.content === "string" ? msg.content.content.trim() : "",
          durationSeconds: Number(metadata.finished_duration_sec || 0) || null
        });
        continue;
      }

      if (Array.isArray(msg.content?.thoughts)) {
        for (const thought of msg.content.thoughts) {
          const summary = String(thought?.summary || "").trim();
          const content = String(thought?.content || "").trim();
          if (summary || content) {
            push(msg, time, "thought", { summary, content, finished: thought?.finished !== false });
          }
        }
        continue;
      }

      const text = getTraceText(msg.content);

      // Older conversations keep a reasoning string in the message metadata,
      // sometimes on the final answer itself.
      if (role === "assistant") {
        for (const legacy of [metadata.reasoning, metadata.reasoning_content, metadata.thinking, metadata.thoughts]) {
          if (typeof legacy === "string" && legacy.trim()) push(msg, time, "thought", { summary: "", content: legacy.trim(), finished: true });
        }
      }

      if (role === "assistant" && isApiFinalAnswerMessage(msg)) {
        push(msg, time, "answer", { messageId: msg.id || "", chars: text.length });
        continue;
      }

      if (role === "assistant" && isTraceToolCall(msg, recipient)) {
        const tool = recipient && recipient !== "all" ? recipient : "web.run";
        const parsed = parseTraceJson(text);
        const event = push(msg, time, "tool_call", {
          tool,
          title: getTraceTitle(metadata),
          input: text,
          ...(parsed !== undefined ? { arguments: parsed } : {}),
          ...(Array.isArray(metadata.search_queries) && metadata.search_queries.length ? { queries: uniqueStrings(metadata.search_queries) } : {}),
          ...(msg.content?.language && msg.content.language !== "unknown" ? { language: msg.content.language } : {}),
          inputHidden: !text
        });
        calls.add(event);
        continue;
      }

      if (role === "tool") {
        const call = calls.match(String(msg.author?.name || "").toLowerCase(), contentType === "code" && !text);
        const tool = String(msg.author?.name || "").toLowerCase() || call?.tool || "";
        const found = collectTraceSources(metadata, sources, events.length + 1);
        const images = (Array.isArray(msg.content?.parts) ? msg.content.parts : [])
          .map((part) => part?.asset_pointer)
          .filter(Boolean);
        push(msg, time, "tool_result", {
          tool,
          ...(call ? { callSeq: call.seq } : {}),
          title: getTraceTitle(metadata),
          contentType,
          output: text,
          ...(found.length ? { sources: found } : {}),
          ...(found.some((source) => source.query) ? { queries: uniqueStrings(found.map((source) => source.query)) } : {}),
          ...(images.length ? { images } : {}),
          ...(metadata.aggregate_result?.status ? { status: metadata.aggregate_result.status } : {}),
          ...(metadata.invoked_resource?.resource_uri ? { resource: metadata.invoked_resource.resource_uri } : {})
        });
        continue;
      }

      if (role === "assistant") {
        if (text) {
          push(msg, time, "note", { channel: channel || "", text });
        } else {
          for (const title of Array.isArray(metadata.reasoning_titles) ? metadata.reasoning_titles : []) {
            if (String(title || "").trim()) push(msg, time, "thought", { summary: String(title).trim(), content: "", finished: true });
          }
        }
        continue;
      }

      if (text) {
        push(msg, time, "other", { role, recipient, channel, contentType, text });
      }
    }

    markCitedTraceSources(sources, messages, options.citations || []);
    const sourceList = [...sources.values()];
    const count = (kind) => events.filter((event) => event.kind === kind).length;

    return {
      version: AGENT_TRACE_VERSION,
      model,
      startedAt: formatTraceTime(firstTime),
      finishedAt: formatTraceTime(lastTime),
      durationSeconds: durationSeconds || null,
      stats: {
        events: events.length,
        thoughts: count("thought"),
        notes: count("note"),
        toolCalls: count("tool_call"),
        toolResults: count("tool_result"),
        hiddenInputs: events.filter((event) => event.inputHidden).length,
        sources: sourceList.length,
        citedSources: sourceList.filter((source) => source.cited).length
      },
      events,
      sources: sourceList,
      citations: options.citations || [],
      memories: options.memories || []
    };
  }

  // Pairs results with calls. Parallel calls are answered in call order, and
  // nodes carry no call id. Tools that open each answer with an empty `code`
  // node (api_tool.*) start a new answer only at that marker; other tools
  // answer each call with one result node.
  function createTraceCallQueue() {
    const pending = [];
    const current = new Map();
    const markerTools = new Set();
    const take = (tool) => {
      const index = pending.findIndex((call) => !tool || call.tool === tool);
      return index >= 0 ? pending.splice(index, 1)[0] : null;
    };
    return {
      add(call) {
        pending.push(call);
      },
      match(tool, isMarker) {
        if (isMarker) markerTools.add(tool);
        const startsAnswer = isMarker || !markerTools.has(tool) || !current.has(tool);
        const call = (startsAnswer && take(tool)) || current.get(tool) || null;
        if (call) current.set(tool || call.tool, call);
        return call;
      }
    };
  }

  function isTraceToolCall(msg, recipient) {
    if (recipient && recipient !== "all") {
      return true;
    }
    const metadata = msg.metadata || {};
    return metadata.reasoning_status === "is_reasoning" && String(msg.content?.content_type || "") === "code";
  }

  function getTraceText(content) {
    if (!content || typeof content !== "object") return "";
    if (typeof content.text === "string") return content.text.trim();
    const parts = Array.isArray(content.parts) ? content.parts : [];
    return parts.filter((part) => typeof part === "string").join("\n").trim();
  }

  function getTraceTitle(metadata) {
    return String(metadata.reasoning_title || (Array.isArray(metadata.reasoning_titles) ? metadata.reasoning_titles[0] : "") || "").trim();
  }

  function parseTraceJson(text) {
    if (!/^[[{]/.test(text)) return undefined;
    try {
      return JSON.parse(text);
    } catch (error) {
      // Tool input that only looks like JSON stays as plain text in `input`.
      return undefined;
    }
  }

  function formatTraceTime(seconds) {
    return seconds ? new Date(seconds * 1000).toISOString() : "";
  }

  function collectTraceSources(metadata, sources, seq) {
    const found = [];
    for (const group of Array.isArray(metadata.search_result_groups) ? metadata.search_result_groups : []) {
      for (const entry of Array.isArray(group?.entries) ? group.entries : []) {
        if (!entry?.url) continue;
        const refId = entry.ref_id ? formatCitationRefId(entry.ref_id) : "";
        const source = {
          url: entry.url,
          title: entry.title || "",
          domain: group.domain || entry.attribution || "",
          snippet: entry.snippet || "",
          ...(entry.pub_date ? { pubDate: entry.pub_date } : {}),
          ...(refId ? { refId } : {}),
          ...(group.search_query ? { query: group.search_query } : {})
        };
        found.push(source);
        const known = sources.get(entry.url);
        if (known) {
          known.seenAt.push(seq);
          if (refId && !known.refIds.includes(refId)) known.refIds.push(refId);
        } else {
          sources.set(entry.url, { url: source.url, title: source.title, domain: source.domain, snippet: source.snippet, refIds: refId ? [refId] : [], seenAt: [seq], cited: false });
        }
      }
    }
    return found;
  }

  function markCitedTraceSources(sources, messages, citations) {
    const citedUrls = new Set(citations.map((citation) => citation?.metadata?.url || citation?.url).filter(Boolean));
    const answerText = messages.filter((msg) => isApiFinalAnswerMessage(msg)).map((msg) => getTraceText(msg.content)).join("\n");
    const citedRefs = new Set(answerText.match(/turn\d+[a-z_]+\d+/gi) || []);
    for (const source of sources.values()) {
      source.cited = citedUrls.has(source.url) || source.refIds.some((refId) => citedRefs.has(refId));
    }
  }

  function recordAgentTraceDiagnostics(trace, debugLog, turnNumber) {
    if (!debugLog) return;
    const thoughts = trace.events.filter((event) => event.kind === "thought");
    for (const thought of thoughts) {
      if (thought.summary && !thought.content) {
        debugLog.fidelityWarning?.({
          turnNumber,
          severity: "info",
          code: "EMPTY_THOUGHT_CONTENT",
          message: `Thought step "${thought.summary}" has no descriptive body in API payload`,
          details: { summary: thought.summary, nodeId: thought.nodeId }
        });
      }
    }
    debugLog.recordThinkingDiagnostic?.({
      turnNumber,
      totalSteps: thoughts.length,
      stepsWithFullContent: thoughts.filter((thought) => thought.summary && thought.content).length,
      stepsWithSummaryOnly: thoughts.filter((thought) => thought.summary && !thought.content).length,
      durationSec: trace.durationSeconds || 0,
      searchQueriesCount: trace.events.reduce((sum, event) => sum + (event.kind === "tool_call" ? (event.queries?.length || 0) : 0), 0),
      toolCallsCount: trace.stats.toolCalls,
      hasRecap: trace.events.some((event) => event.kind === "recap")
    });
  }

  // The PDF thinking timeline, in the order ChatGPT's thinking panel shows it.
  // Search steps list every source not already listed in this turn; tool
  // outputs stay in the agent-trace files.
  function renderAgentTraceThinkingMarkdown(trace) {
    const lines = [];
    const shownUrls = new Set();
    const seen = new Set();
    const add = (icon, label, content) => {
      const clean = String(content || "").trim();
      if (!clean || seen.has(`${label}:${clean}`)) return;
      seen.add(`${label}:${clean}`);
      const [first, ...rest] = clean.split("\n").map((line) => line.trim()).filter(Boolean);
      lines.push(`- ${icon} **${label}**: ${first}`, ...rest.map((line) => `  ${line}`));
    };
    const calls = new Map(trace.events.filter((event) => event.kind === "tool_call").map((event) => [event.seq, event]));
    const answeredCalls = new Set(trace.events.map((event) => event.callSeq).filter(Boolean));

    for (const event of trace.events) {
      if (event.kind === "thought") {
        add("🧠", "推理思考", event.summary && event.content && event.summary !== event.content ? `**${event.summary}**\n${event.content}` : event.summary || event.content);
      } else if (event.kind === "note") {
        add("💬", "分析计划", event.text);
      } else if (event.kind === "recap") {
        add("⏱️", "思考总结", event.text);
      } else if (event.kind === "tool_result" && event.sources?.length) {
        const call = calls.get(event.callSeq);
        const queries = uniqueStrings([...(call?.queries || []), ...(event.queries || [])]);
        const links = event.sources.filter((source) => !shownUrls.has(source.url));
        links.forEach((source) => shownUrls.add(source.url));
        add("🔍", "网页搜索", [
          event.title || call?.title || "联网检索",
          queries.length ? `检索 \`${queries.slice(0, 3).join("`, `")}\`` : "",
          links.length ? `查阅 ${links.map((source) => `[${escapeMarkdownLinkLabel(source.title || source.domain || source.url)}](${source.url})`).join(" · ")}` : ""
        ].filter(Boolean).join(" · "));
      } else if (event.kind === "tool_call" && !isTraceSearchTool(event.tool) && (event.title || !event.inputHidden)) {
        add(...describeTraceToolCall(event));
      } else if (event.kind === "tool_call" && !answeredCalls.has(event.seq) && (event.title || event.queries?.length)) {
        add("🔍", "网页搜索", [event.title || "联网检索", event.queries?.length ? `检索 \`${event.queries.slice(0, 3).join("`, `")}\`` : ""].filter(Boolean).join(" · "));
      }
    }

    const cited = trace.citations
      .map((citation, index) => {
        const title = citation?.metadata?.title || citation?.title || citation?.metadata?.name || `来源 [${index + 1}]`;
        const url = citation?.metadata?.url || citation?.url || citation?.metadata?.extra?.url || citation?.metadata?.cloud_doc_url || "";
        return url ? `[${escapeMarkdownLinkLabel(title)}](${url})` : `📄 ${title}`;
      });
    if (cited.length) {
      add("🌐", "引用来源", uniqueStrings(cited).join(" · "));
    }

    const duration = trace.durationSeconds || 0;
    if (!lines.length && !duration) {
      return "";
    }
    const header = duration
      ? `> 💭 **Thinking Process (Worked for ${duration >= 60 ? `${Math.floor(duration / 60)}m ${duration % 60}s` : `${duration}s`})**`
      : "> 💭 **Thinking Process**";
    return lines.length ? `${header}\n>\n${lines.map((line) => `> ${line}`).join("\n")}` : header;
  }

  function isTraceSearchTool(tool) {
    return tool === "web.run" || tool === "browser" || tool === "search" || tool.startsWith("web.");
  }

  function describeTraceToolCall(event) {
    const tool = event.tool;
    if (tool === "container.exec" || tool === "python") {
      const firstLine = String(event.input || "").split("\n").find((line) => line.trim()) || "";
      return ["⚙️", "执行代码", [event.title, firstLine ? `\`${truncatePreview(firstLine.replace(/`/g, "'"), 120)}\`` : ""].filter(Boolean).join(" · ")];
    }
    if (tool.includes("image") || tool.startsWith("dalle")) {
      return ["🖼️", "生成图像", event.title || "生成图像"];
    }
    if (tool.includes("myfiles") || tool.includes("file_search")) {
      return ["📄", "读取文件", event.title || "读取上传的文件"];
    }
    const action = String(event.arguments?.path || "").split("/").filter(Boolean).pop() || tool;
    const args = event.arguments?.args ? truncatePreview(JSON.stringify(event.arguments.args), 160) : "";
    return ["🔧", "调用工具", [event.title, `\`${action}\``, args ? `\`${args.replace(/`/g, "'")}\`` : ""].filter(Boolean).join(" · ")];
  }
  const FAST_CONVERSATION_API_PAGE_SIZE = 100;
  const FAST_CONVERSATION_API_MAX_PAGES = 200;

  async function collectFastConversationMessages(debugLog = null, options = {}) {
    const signal = options.signal || null;
    throwIfCaptureCancelled(signal);
    const conversationId = getCurrentConversationId();

    if (!conversationId) {
      throw new Error("No conversation id was found in the current URL.");
    }

    const data = await fetchConversationData(conversationId, {
      timeoutMs: CONVERSATION_API_FETCH_TIMEOUT_MS,
      debugLog,
      signal,
      onProgress: options.onProgress
    });
    throwIfCaptureCancelled(signal);
    const messages = buildMessagesFromConversationApi(data, debugLog);
    const manifest = buildConversationManifest(data);

    debugLog?.event("fastCapture.loaded", {
      conversationId,
      apiSource: data?.__convoVaultApiSource || "",
      mappingCount: Object.keys(getConversationApiMapping(data)).length,
      linearMessageCount: getConversationApiLinearMessages(data).length,
      messageCount: messages.length
    });
    logConversationManifest(manifest, debugLog);

    return { messages, manifest };
  }

  /**
   * Loads only the expected conversation structure. Full capture uses it to
   * order DOM messages and to check completeness; a failure is reported to the
   * caller, which falls back to DOM-only checks.
   */
  async function fetchConversationManifest(debugLog = null, options = {}) {
    const conversationId = getCurrentConversationId();

    if (!conversationId) {
      throw new Error("No conversation id was found in the current URL.");
    }

    const data = await fetchConversationData(conversationId, {
      timeoutMs: CONVERSATION_API_FETCH_TIMEOUT_MS,
      debugLog,
      signal: options.signal || null
    });
    const manifest = buildConversationManifest(data);
    logConversationManifest(manifest, debugLog);
    return manifest;
  }

  function logConversationManifest(manifest, debugLog) {
    debugLog?.event("conversationManifest.built", {
      ...manifest.counts,
      expectedMessages: manifest.entries.length,
      replyGaps: manifest.gaps.map((gap) => ({
        userNodeId: gap.userNodeId,
        status: gap.status,
        reason: gap.reason,
        createTime: gap.createTime
      }))
    });
  }

  function buildMessagesFromConversationApi(data, debugLog = null) {
    const pathNodes = getConversationApiCurrentPath(data);
    const messages = [];
    const filterStats = {};
    const markupStats = createMarkupStats();
    let pendingAssistantNodes = [];
    let directThinkingMessageCount = 0;

    function flushAssistantTurn() {
      if (!pendingAssistantNodes.length) {
        return;
      }

      const synthesized = synthesizeAssistantTurn(pendingAssistantNodes, messages.length + 1, "", null, debugLog, markupStats);
      pendingAssistantNodes = [];

      if (!synthesized) {
        return;
      }

      if (synthesized.thinkingMarkdown) {
        directThinkingMessageCount += 1;
      }

      messages.push(synthesized);
    }

    for (const node of pathNodes) {
      const message = node?.message;
      if (!message) {
        incrementReasonCount(filterStats, "missing-message");
        continue;
      }

      const rawRole = String(message.author?.role || "").toLowerCase();
      const metadata = message.metadata || {};
      const authorMetadata = message.author?.metadata || {};

      if (
        isTruthyApiFlag(metadata.is_visually_hidden_from_conversation)
        || isTruthyApiFlag(metadata.is_hidden)
        || isTruthyApiFlag(metadata.hidden)
        || isTruthyApiFlag(authorMetadata.is_visually_hidden_from_conversation)
        || isTruthyApiFlag(authorMetadata.is_hidden)
        || isTruthyApiFlag(authorMetadata.hidden)
      ) {
        incrementReasonCount(filterStats, "hidden");
        continue;
      }

      if (rawRole === "user") {
        flushAssistantTurn();

        const turnNumber = messages.length + 1;
        const id = message.id || node.id || `api-message-${turnNumber}`;
        const markdown = cleanApiMarkdown([
          renderChatGptInlineTokens(extractApiContentMarkdown(message.content)),
          extractApiAttachmentMarkdown(message)
        ].filter(Boolean).join("\n\n"));

        messages.push({
          id,
          role: "user",
          order: turnNumber,
          turnNumber,
          conversationOrder: turnNumber,
          timestamp: formatConversationTimestamp(
            message.create_time ??
            message.update_time ??
            message.metadata?.create_time ??
            message.metadata?.timestamp
          ),
          markdown,
          thinkingMarkdown: "",
          preview: truncatePreview(markdown, 180),
          sourceMessageId: message.id || "",
          sourceTurnId: node.id || "",
          sourceNode: null,
          codeBlockCount: getCodeBlockDiagnostics(markdown, "").length,
          fileCount: countApiFileAttachments(message),
          imageCount: countMarkdownImages(markdown),
          imagesEmbedded: 0,
          imagesDeferred: countMarkdownImages(markdown),
          imagesFailed: 0,
          captureMode: "fast"
        });
      } else if (rawRole === "assistant" || rawRole === "tool") {
        if (message.end_turn === false) {
          incrementReasonCount(filterStats, "assistant-not-final");
        }
        pendingAssistantNodes.push(node);
      }
    }

    flushAssistantTurn();

    debugLog?.event("fastCapture.path", {
      pathNodeCount: pathNodes.length,
      exportedMessageCount: messages.length
    });

    if (Object.keys(filterStats).length) {
      debugLog?.event("fastCapture.filteredSummary", {
        filtered: filterStats
      });
    }

    if (markupStats.dilMessages || Object.keys(markupStats.tokens).length) {
      debugLog?.event("fastCapture.markup", markupStats);
    }

    if (directThinkingMessageCount) {
      debugLog?.event("fastCapture.thinkingMerged", {
        applied: directThinkingMessageCount
      });
    }

    return messages;
  }

  function synthesizeAssistantTurn(nodes, turnNumber, turnId = "", primaryNode = null, debugLog = null, markupStats = null) {
    if (!nodes.length) {
      return null;
    }

    let primaryMessage = primaryNode?.message || null;
    const textParts = [];
    const imagePointers = [];
    const fileEntries = [];
    const citations = [];
    const memories = [];
    let turnMsgId = "";
    let timestamp = null;

    // First pass: locate the primary final assistant message and metadata
    for (const node of nodes) {
      const msg = node?.message;
      if (!msg) continue;
      const role = String(msg.author?.role || "").toLowerCase();
      if (role === "assistant") {
        if (!turnMsgId) turnMsgId = msg.id || node.id;
        if (!timestamp) {
          timestamp = msg.create_time ?? msg.update_time ?? msg.metadata?.create_time ?? msg.metadata?.timestamp;
        }
        if (msg.channel === "final" || msg.end_turn === true || !primaryMessage) {
          primaryMessage = msg;
        }
      }

      const metadata = msg.metadata || {};
      if (Array.isArray(metadata.citations)) {
        citations.push(...metadata.citations);
      }
      if (Array.isArray(metadata.conversation_context_citation_metadata)) {
        memories.push(...metadata.conversation_context_citation_metadata);
      }
    }

    // 1. The ordered agent trace is the single source of the thinking timeline.
    const agentTrace = buildTurnAgentTrace(nodes, { citations, memories });
    recordAgentTraceDiagnostics(agentTrace, debugLog, turnNumber);
    const thinkingMarkdown = cleanApiMarkdown(renderAgentTraceThinkingMarkdown(agentTrace));

    // 2. Aggregate prose text, image pointers, generated files and attachments
    const markupContext = createChatGptMarkupContext({
      citationSources: buildCitationSourceIndex(nodes.map((node) => node?.message).filter(Boolean)),
      footnoteOffset: Array.isArray(primaryMessage?.metadata?.citations) ? primaryMessage.metadata.citations.length : 0
    });

    for (const node of nodes) {
      const msg = node?.message;
      if (!msg) continue;

      // Collect generated files
      const fileCandidate = extractApiGeneratedFilesMarkdown(msg);
      if (fileCandidate) {
        fileEntries.push(fileCandidate);
      }

      // Collect attachments
      const attachmentCandidate = extractApiAttachmentMarkdown(msg);
      if (attachmentCandidate) {
        fileEntries.push(attachmentCandidate);
      }

      const isThinking = isApiThinkingNode(msg);
      const isInternalTool = isApiInternalToolCallNode(msg);
      const isDil = isDilMessage(msg);
      const isFileReader = isApiFileReaderNode(msg);

      // Collect text and image parts
      const content = msg.content;
      if (isDil && !isThinking && !isInternalTool) {
        const fallbackMarkdown = getDilFallbackMarkdown(msg);
        const dil = chooseDilMarkdown(getApiStringParts(content).join("\n\n"), fallbackMarkdown);
        if (markupStats) {
          markupStats.dilMessages += 1;
          if (!fallbackMarkdown) markupStats.dilWithoutFallback += 1;
          if (dil.origin === "source" && fallbackMarkdown) markupStats.dilRenderedFromSource += 1;
          markupStats.dilUnexpandedLoops += dil.unexpandedLoops;
        }
        if (dil.markdown.trim()) {
          textParts.push(renderApiResponseMarkup(dil.markdown, markupContext));
        }
      }

      if (content && typeof content === "object") {
        const parts = Array.isArray(content.parts) ? content.parts : [];
        for (const part of parts) {
          if (typeof part === "string" && part.trim()) {
            if (
              !isDil
              && !isThinking
              && !isInternalTool
              && !isApiInternalFileIngestionText(part)
              && !looksLikeInternalApiToolCall(part)
              && !(looksLikeApiJsonPayload(part) && !isApiFinalAnswerMessage(msg))
            ) {
              textParts.push(renderApiResponseMarkup(part, markupContext));
            }
          } else if (part && typeof part === "object") {
            const ptr = part.asset_pointer || part.assetPointer || part.url || "";
            if (ptr && !isFileReader && isApiImageHaystack(`${part.content_type || ""} ${part.mime_type || ""} ${ptr}`)) {
              const label = sanitizeApiMarkdownLabel(part.name || part.filename || part.title || "Image");
              const imgMd = `![${label}](${ptr})`;
              if (!imagePointers.includes(imgMd)) {
                imagePointers.push(imgMd);
              }
            }
          }
        }

        if (!parts.length && typeof content.text === "string" && content.text.trim()) {
          if (
            !isThinking
            && !isInternalTool
            && !isApiInternalFileIngestionText(content.text)
            && !looksLikeInternalApiToolCall(content.text)
            && !(looksLikeApiJsonPayload(content.text) && !isApiFinalAnswerMessage(msg))
          ) {
            textParts.push(renderApiResponseMarkup(content.text, markupContext));
          }
        }
      }
    }

    // Build synthesized markdown
    const combinedProse = uniqueStrings(textParts).join("\n\n");
    const combinedImages = imagePointers.join("\n\n");
    const combinedFiles = uniqueStrings(fileEntries).join("\n\n");

    const dilBlocks = nodes
      .map((node) => node?.message)
      .filter((msg) => msg && isDilMessage(msg) && !isApiThinkingNode(msg) && !isApiInternalToolCallNode(msg))
      .map((msg) => buildDilRenderBlock(msg, markupContext.citationSources))
      .filter(Boolean);

    let markdown = cleanApiMarkdown([
      combinedProse,
      combinedImages,
      combinedFiles
    ].filter(Boolean).join("\n\n"));

    if (primaryMessage) {
      markdown = enrichApiMarkdownWithCitations(markdown, primaryMessage);
      markdown = enrichApiMarkdownWithMemories(markdown, primaryMessage);
    } else if (citations.length || memories.length) {
      markdown = enrichApiMarkdownWithCitations(markdown, { metadata: { citations } });
      markdown = enrichApiMarkdownWithMemories(markdown, { metadata: { conversation_context_citation_metadata: memories } });
    }

    const tokenFootnotes = formatChatGptFootnotes(markupContext);
    if (tokenFootnotes) {
      markdown = `${markdown.trim()}\n\n${tokenFootnotes}`;
    }
    mergeMarkupStats(markupStats, markupContext);

    if (!markdown && !thinkingMarkdown) {
      return null;
    }

    const id = turnId || turnMsgId || `api-assistant-${turnNumber}`;

    return {
      id,
      role: "assistant",
      order: turnNumber,
      turnNumber,
      conversationOrder: turnNumber,
      timestamp: formatConversationTimestamp(timestamp),
      markdown,
      thinkingMarkdown,
      agentTrace,
      ...(dilBlocks.length ? { dil: dilBlocks } : {}),
      preview: truncatePreview(cleanMarkdown(`${markdown}\n${thinkingMarkdown}`), 180),
      sourceMessageId: primaryMessage?.id || id,
      sourceTurnId: id,
      sourceNode: null,
      codeBlockCount: getCodeBlockDiagnostics(markdown, thinkingMarkdown).length,
      fileCount: (primaryMessage ? countApiFileAttachments(primaryMessage) : 0) + fileEntries.length,
      imageCount: countMarkdownImages(markdown),
      imagesEmbedded: 0,
      imagesDeferred: countMarkdownImages(markdown),
      imagesFailed: 0,
      captureMode: "fast"
    };
  }

  // A JSON-shaped text is dropped as a leaked tool payload unless ChatGPT marks
  // the message as the user-facing final answer.
  function isApiFinalAnswerMessage(msg) {
    const channel = String(msg?.channel || "").toLowerCase();
    const recipient = String(msg?.recipient || "").toLowerCase();
    return (channel === "final" || msg?.end_turn === true) && (!recipient || recipient === "all");
  }

  function renderApiResponseMarkup(text, markupContext) {
    return renderChatGptInlineTokens(renderChatGptWritingBlocks(String(text || "").trim()), markupContext);
  }

  function getApiStringParts(content) {
    if (!content || typeof content !== "object") {
      return [];
    }

    const parts = Array.isArray(content.parts) ? content.parts : [content.text];
    return parts.filter((part) => typeof part === "string" && part.trim());
  }

  function createMarkupStats() {
    return {
      dilMessages: 0,
      dilWithoutFallback: 0,
      dilRenderedFromSource: 0,
      dilUnexpandedLoops: 0,
      tokens: {},
      unknownTokens: {},
      citationFootnotes: 0,
      unresolvedCitationRefs: 0
    };
  }

  function mergeMarkupStats(stats, markupContext) {
    if (!stats) {
      return;
    }

    for (const [name, count] of Object.entries(markupContext.tokenCounts)) {
      stats.tokens[name] = (stats.tokens[name] || 0) + count;
    }

    for (const [name, count] of Object.entries(markupContext.unknownTokenCounts)) {
      stats.unknownTokens[name] = (stats.unknownTokens[name] || 0) + count;
    }

    stats.citationFootnotes += markupContext.footnotes.length;
    stats.unresolvedCitationRefs += markupContext.unresolvedCitationRefs.length;
  }

  function isApiThinkingNode(msg) {
    if (!msg) return false;
    const channel = String(msg.channel || msg.metadata?.channel || msg.author?.metadata?.channel || "").toLowerCase();
    const contentType = String(msg.content?.content_type || msg.content?.contentType || "").toLowerCase();
    return (
      channel === "analysis"
      || channel === "reasoning"
      || channel === "commentary"
      || contentType === "thoughts"
      || contentType === "reasoning"
      || contentType === "reasoning_recap"
      || msg.metadata?.is_thinking_preamble_message === true
    );
  }

  /**
   * File-reading tools (file_search, myfiles_browser) return each page of an
   * uploaded document as text plus a page image (sediment://...#p_N.jpg) for
   * the model. ChatGPT never shows those pages in the answer.
   */
  function isApiFileReaderNode(msg) {
    const role = String(msg?.author?.role || "").toLowerCase();
    const name = String(msg?.author?.name || "").toLowerCase();
    return role === "tool" && /^(?:file_search|myfiles_browser)(?:\.|$)/.test(name);
  }

  function isApiInternalFileIngestionText(text) {
    const str = String(text || "").trim();
    if (!str) return false;
    return (
      /Make sure to include fileL\d+-L\d+ in your response/i.test(str)
      || /Use ref_id "turn\d+file\d+"/i.test(str)
      || /\[L\d+\]\s*<PARSED TEXT FOR PAGE/i.test(str)
      || (/^\[L\d+\]/m.test(str) && /PARSED TEXT/i.test(str))
      || /scoped to this file\.\s*Use `?files\.(?:search|find|read)`?/i.test(str)
      || /Full file size:\s*\d+\s*pages/i.test(str)
    );
  }

  function isApiInternalToolCallNode(msg) {
    if (!msg) return false;
    const recipient = String(msg.recipient || msg.metadata?.recipient || msg.author?.metadata?.recipient || "").toLowerCase();
    const contentType = String(msg.content?.content_type || msg.content?.contentType || "").toLowerCase();
    const messageType = String(msg.metadata?.message_type || msg.metadata?.messageType || "").toLowerCase();
    const role = String(msg.author?.role || "").toLowerCase();
    const name = String(msg.author?.name || "").toLowerCase();

    if (role === "tool" || role === "system") {
      return true;
    }

    if (name.includes("browser") || name.includes("myfiles") || name.includes("search") || name.includes("tool")) {
      return true;
    }

    if (["python", "web.run", "browser", "search", "myfiles_browser", "file_search", "api_tool", "api_tool.search_plugins", "api_tool.call_tool", "api_tool.suggest_installs", "api_tool.list_resources"].some((r) => recipient.includes(r))) {
      return true;
    }

    if (["code", "execution", "tool", "tool_call", "search_query", "search_result"].includes(messageType)) {
      return true;
    }

    if (contentType === "code" && recipient && recipient !== "all") {
      return true;
    }

    const parts = Array.isArray(msg.content?.parts) ? msg.content.parts : [msg.content?.text];
    for (const part of parts) {
      if (typeof part === "string" && isApiInternalFileIngestionText(part)) {
        return true;
      }
    }

    return false;
  }

  function isTruthyApiFlag(value) {
    return value === true || String(value || "").toLowerCase() === "true";
  }

  function looksLikeInternalApiToolCall(markdown) {
    const text = String(markdown || "").trim();

    return /^search\(/i.test(text)
      || /^\{\s*"search_query"\s*:/i.test(text)
      || /^\{\s*"queries"\s*:/i.test(text);
  }

  function looksLikeApiJsonPayload(markdown) {
    const text = String(markdown || "").trim();
    return /^[{[]/.test(text) && /["'}\]]$/.test(text);
  }

  function incrementReasonCount(stats, reason) {
    if (!isReportableApiSkipReason(reason)) {
      return;
    }

    stats[reason] = (stats[reason] || 0) + 1;
  }

  function isReportableApiSkipReason(reason) {
    return !["missing-message", "unsupported-role"].includes(reason);
  }

  function getConversationApiCurrentPath(data) {
    const mapping = getConversationApiMapping(data);
    const currentNode = getConversationApiCurrentNode(data);
    const path = [];
    const seen = new Set();
    let nodeId = currentNode;

    while (nodeId && mapping[nodeId] && !seen.has(nodeId)) {
      seen.add(nodeId);
      const node = mapping[nodeId];
      path.push(node);
      nodeId = node.parent || node.parent_id || "";
    }

    if (path.length) {
      return path.reverse();
    }

    if (Object.keys(mapping).length) {
      return Object.values(mapping);
    }

    return getConversationApiLinearMessages(data)
      .map((message, index) => ({
        id: message?.id || `api-message-${index + 1}`,
        message
      }));
  }

  function getConversationApiMapping(data) {
    const candidates = [
      data?.mapping,
      data?.conversation?.mapping,
      data?.data?.mapping
    ];

    return candidates.find((value) => value && typeof value === "object" && !Array.isArray(value)) || {};
  }

  function getConversationApiCurrentNode(data) {
    return data?.current_node
      || data?.currentNode
      || data?.conversation?.current_node
      || data?.conversation?.currentNode
      || data?.data?.current_node
      || data?.data?.currentNode
      || "";
  }

  function getConversationApiLinearMessages(data) {
    return getConversationApiRawMessages(data)
      ?.map((item) => item?.message || item)
      .filter((message) => message && typeof message === "object") || [];
  }

  function cleanApiMarkdown(value) {
    return cleanMarkdown(removeApiPrivateUseArtifacts(value));
  }

  function removeApiPrivateUseArtifacts(value) {
    return String(value || "")
      .replace(/[\uE000-\uF8FF]+(?:file|web|mem)?cite(?:[\uE000-\uF8FF]+[0-9A-Za-z_-]+)*[\uE000-\uF8FF]*/gi, "")
      .replace(/\bfileL\d+(?:-L\d+)?\b/gi, "")
      .replace(/[\uE000-\uF8FF]+/g, "")
      .replace(/[ \t]+\n/g, "\n");
  }

  function extractApiContentMarkdown(content) {
    if (!content || typeof content !== "object") {
      return "";
    }

    const parts = Array.isArray(content.parts) ? content.parts : [];

    if (parts.length) {
      return cleanMarkdown(parts
        .map((part) => apiContentPartToMarkdown(part))
        .filter(Boolean)
        .join("\n\n"));
    }

    const candidates = [
      content.text,
      content.result,
      content.summary,
      content.value
    ].filter((value) => typeof value === "string" && value.trim());

    return cleanMarkdown(candidates.join("\n\n"));
  }

  function apiContentPartToMarkdown(part) {
    if (typeof part === "string") {
      return part;
    }

    if (!part || typeof part !== "object") {
      return "";
    }

    const assetPointer = part.asset_pointer || part.assetPointer || part.url || "";

    if (assetPointer) {
      const label = sanitizeApiMarkdownLabel(
        part.name
        || part.file_name
        || part.filename
        || part.title
        || "Image"
      );

      if (/image|img|picture/i.test(`${part.content_type || ""} ${part.mime_type || ""} ${assetPointer}`)) {
        return `![${label}](${assetPointer})`;
      }

      return `[Attachment: ${assetPointer}]`;
    }

    const textCandidates = [
      part.text,
      part.content,
      part.transcript,
      part.caption,
      part.name
    ].filter((value) => typeof value === "string" && value.trim());

    if (textCandidates.length) {
      return textCandidates.join("\n\n");
    }

    return "";
  }

  function extractApiAttachmentMarkdown(message) {
    const attachments = getApiAttachmentObjects(message);
    const hasImageAssetPointer = getApiMessageImageAssetPointers(message).length > 0;
    const lines = attachments
      .map((attachment) => hasImageAssetPointer && isApiImageAttachment(attachment)
        ? ""
        : formatApiAttachmentMarkdown(attachment)
      )
      .filter(Boolean);

    return uniqueStrings(lines).join("\n");
  }

  function getApiMessageImageAssetPointers(message) {
    const parts = Array.isArray(message?.content?.parts) ? message.content.parts : [];

    return parts
      .filter((part) => part && typeof part === "object")
      .map((part) => {
        const assetPointer = part.asset_pointer || part.assetPointer || part.url || "";
        const descriptor = [
          part.content_type,
          part.contentType,
          part.mime_type,
          part.mimeType,
          part.name,
          part.file_name,
          part.filename,
          part.title,
          assetPointer
        ].join(" ");

        return /image|img|picture|\bpng\b|\bjpe?g\b|\bwebp\b|\bgif\b/i.test(descriptor)
          ? assetPointer
          : "";
      })
      .filter(Boolean);
  }

  function getApiAttachmentObjects(message) {
    const metadata = message?.metadata || {};
    const candidates = [
      metadata.attachments,
      metadata.files,
      metadata.uploaded_files,
      metadata.uploadedFiles
    ];

    return candidates
      .filter(Array.isArray)
      .flat()
      .filter((attachment) => attachment && typeof attachment === "object");
  }

  function formatApiAttachmentMarkdown(attachment) {
    const name = attachment.name
      || attachment.file_name
      || attachment.filename
      || attachment.title
      || attachment.id
      || "";
    const url = attachment.url || attachment.download_url || attachment.file_url || "";

    if (!name && !url) {
      return "";
    }

    return url
      ? `[File: ${sanitizeFileAttachmentName(name || filenameFromUrl(url) || "attachment")}](${url})`
      : `[File: ${sanitizeFileAttachmentName(name)}]`;
  }

  function countApiFileAttachments(message) {
    const hasImageAssetPointer = getApiMessageImageAssetPointers(message).length > 0;
    return getApiAttachmentObjects(message)
      .filter((attachment) => !(hasImageAssetPointer && isApiImageAttachment(attachment)))
      .length;
  }

  function isApiImageHaystack(haystack) {
    const text = String(haystack || "");
    return /\bimage\b|image\/|img|picture|\.(?:png|jpe?g|gif|webp|avif|bmp|svg)(?:$|[?#])|sediment:\/\/|file_000/i.test(text);
  }

  function isApiImageAttachment(attachment) {
    const haystack = [
      attachment?.mime_type,
      attachment?.mimeType,
      attachment?.content_type,
      attachment?.contentType,
      attachment?.name,
      attachment?.file_name,
      attachment?.filename,
      attachment?.title,
      attachment?.url,
      attachment?.download_url,
      attachment?.file_url
    ].join(" ");

    return isApiImageHaystack(haystack);
  }

  function sanitizeApiMarkdownLabel(value) {
    return String(value || "Image")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160)
      .replace(/[[\]\\]/g, "\\$&")
      || "Image";
  }

  function extractApiGeneratedFilesMarkdown(message) {
    const metadata = message?.metadata || {};
    const files = [];

    // Check aggregate_result
    const aggregate = metadata.aggregate_result;
    if (aggregate?.status === "success" && typeof aggregate.final_expression_output === "string") {
      const match = aggregate.final_expression_output.match(/name:\s*([^\n]+)/);
      if (match && !files.some((f) => f.name === match[1].trim())) {
        files.push({ name: match[1].trim(), url: "" });
      }
    }

    // Check sandbox files in the displayed text; DIL parts hold component
    // source, so DIL messages are read from their fallback Markdown.
    const parts = isDilMessage(message)
      ? [getDilFallbackMarkdown(message)]
      : (Array.isArray(message?.content?.parts) ? message.content.parts : []);
    for (const part of parts) {
      if (typeof part === "string") {
        const sandboxMatches = [...part.matchAll(/\[([^\]]+)\]\((sandbox:[^)]+)\)/g)];
        for (const match of sandboxMatches) {
          if (!files.some((f) => f.url === match[2])) {
            files.push({ name: match[1], url: match[2] });
          }
        }
      }
    }

    if (!files.length) {
      return "";
    }

    return files.map((file) => file.url ? `📥 **Generated File**: [${file.name}](${file.url})` : `📥 **Generated Artifact**: ${file.name}`).join("\n");
  }

  function enrichApiMarkdownWithCitations(markdown, message) {
    const citations = Array.isArray(message?.metadata?.citations) ? message.metadata.citations : [];
    if (!citations.length) {
      return markdown;
    }

    let enriched = markdown;
    const footnotes = [];
    // One uploaded document is often cited once per passage; it gets one
    // footnote line however many citation records point at it.
    const footnoteIndexByLine = new Map();

    citations.forEach((citation, index) => {
      const title = citation?.metadata?.title
        || citation?.title
        || citation?.metadata?.name
        || citation?.name
        || `Source ${index + 1}`;
      const url = citation?.metadata?.url
        || citation?.url
        || citation?.metadata?.cloud_doc_url
        || citation?.metadata?.extra?.url
        || citation?.metadata?.search_result?.url
        || citation?.metadata?.search_result?.link
        || citation?.link
        || "";

      const source = url ? `[${title}](${url})` : `📄 **Document**: ${title}`;
      let footnoteIndex = footnoteIndexByLine.get(source);

      if (!footnoteIndex) {
        footnoteIndex = footnotes.length + 1;
        footnoteIndexByLine.set(source, footnoteIndex);
        footnotes.push(`[^${footnoteIndex}]: ${source}`);
      }

      // Replace matching citation tokens if present
      const markerPattern = new RegExp(`fileciteturn\\d+file\\d+L\\d+-L\\d+|fileciteturn\\d+file\\d+|【\\d+:\\d+†source】|【\\d+†source】|【turn\\d+search\\d+】`, "g");
      enriched = enriched.replace(markerPattern, `[^${footnoteIndex}]`);
    });

    // Remove any remaining raw citation tokens and normalize footnote spacing
    enriched = enriched
      .replace(/(?:file|web|mem)?citeturn\w+(?:L\d+-L\d+)?/gi, "")
      .replace(/\bfileL\d+(?:-L\d+)?\b/gi, "")
      .replace(/【\d+(?::\d+)?†source】/gi, "")
      .replace(/【turn\d+search\d+】/gi, "")
      .replace(/[ \t]+(\[\^\d+\])/g, " $1");

    if (footnotes.length) {
      enriched = enriched.trim() + "\n\n" + footnotes.join("\n");
    }

    return enriched;
  }

  function enrichApiMarkdownWithMemories(markdown, message) {
    const memories = Array.isArray(message?.metadata?.conversation_context_citation_metadata)
      ? message.metadata.conversation_context_citation_metadata
      : [];

    let enriched = markdown.replace(/memcite/gi, "");

    if (!memories.length) {
      return enriched;
    }

    const memoryLines = memories
      .map((item) => {
        const citation = item?.citation;
        if (!citation) return "";
        const title = citation.title || citation.snippet || "";
        const attribution = citation.attribution || "Memory";
        const url = citation.url || "";
        return url
          ? `> - **${attribution}**: [${title}](${url})`
          : `> - **${attribution}**: ${title}`;
      })
      .filter(Boolean);

    if (memoryLines.length) {
      enriched = enriched.trim() + "\n\n> 🧠 **Memory & Context**:\n" + memoryLines.join("\n");
    }

    return enriched;
  }

  async function enrichMessageTimestamps(messages, debugLog = null, options = {}) {
    const signal = options.signal || null;
    throwIfCaptureCancelled(signal);
    const messagesNeedingApiTime = messages.filter((message) => message?.sourceMessageId);

    if (!messagesNeedingApiTime.length) {
      debugLog?.event("timestamps.skipped", { reason: "no source message ids" });
      return;
    }

    const conversationId = getCurrentConversationId();

    if (!conversationId) {
      debugLog?.event("timestamps.skipped", { reason: "no conversation id in url" });
      return;
    }

    try {
      const data = await fetchConversationData(conversationId, { signal });
      throwIfCaptureCancelled(signal);
      const timestampMap = buildConversationTimestampMap(data);
      let applied = 0;

      for (const message of messagesNeedingApiTime) {
        const timestamp = timestampMap.get(message.sourceMessageId);

        if (timestamp) {
          message.timestamp = timestamp;
          applied += 1;
        }
      }

      debugLog?.event("timestamps.enriched", {
        conversationId,
        available: timestampMap.size,
        applied
      });
    } catch (error) {
      if (isCaptureCancelledError(error)) {
        throw error;
      }
      debugLog?.event("timestamps.failed", {
        conversationId,
        error: error?.message || String(error)
      });
    }
  }

  function getCurrentConversationId() {
    const pathParts = location.pathname.split("/").map(decodePathPart).filter(Boolean);
    const conversationSegmentIndex = pathParts.findIndex((part) => part === "c");
    const id = conversationSegmentIndex >= 0 ? pathParts[conversationSegmentIndex + 1] : "";

    if (id && /^[a-z0-9_-]{8,}$/i.test(id)) {
      return id;
    }

    const queryId = new URLSearchParams(location.search).get("conversation_id") || "";
    return /^[a-z0-9_-]{8,}$/i.test(queryId) ? queryId : "";
  }

  function decodePathPart(part) {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  }

  async function fetchConversationData(conversationId, options = {}) {
    const debugLog = options.debugLog || null;
    const signal = options.signal || null;
    throwIfCaptureCancelled(signal);
    const timeoutMs = Number(options.timeoutMs || CONVERSATION_API_FETCH_TIMEOUT_MS);
    const attemptTimeoutMs = Math.min(timeoutMs, CONVERSATION_API_ATTEMPT_TIMEOUT_MS);
    const accessToken = await getChatGptAccessToken(debugLog, attemptTimeoutMs, signal);
    throwIfCaptureCancelled(signal);
    const attempts = buildConversationApiAttempts(conversationId, accessToken);
    const failures = [];

    debugLog?.event("conversationApi.probe.start", {
      conversationId,
      attempts: attempts.length,
      accessTokenAvailable: Boolean(accessToken)
    });

    for (const attempt of attempts) {
      throwIfCaptureCancelled(signal);
      try {
        let data = await fetchConversationApiAttempt(attempt, attemptTimeoutMs, signal);
        data = await fetchRemainingConversationApiPages(data, attempt, {
          timeoutMs: attemptTimeoutMs,
          signal,
          debugLog,
          onProgress: options.onProgress
        });
        throwIfCaptureCancelled(signal);
        const mapping = getConversationApiMapping(data);
        const linearMessages = getConversationApiLinearMessages(data);
        const mappingCount = Object.keys(mapping).length;

        if (!mappingCount && !linearMessages.length) {
          failures.push(`${attempt.label}: empty response`);
          debugLog?.event("conversationApi.probe.empty", {
            label: attempt.label
          });
          continue;
        }

        Object.defineProperty(data, "__convoVaultApiSource", {
          value: attempt.label,
          enumerable: false,
          configurable: true
        });
        debugLog?.event("conversationApi.probe.success", {
          label: attempt.label,
          mappingCount,
          linearMessageCount: linearMessages.length
        });
        return data;
      } catch (error) {
        if (isCaptureCancelledError(error)) {
          throw error;
        }
        const reason = error?.message || String(error);
        failures.push(`${attempt.label}: ${reason}`);
        debugLog?.event("conversationApi.probe.failed", {
          label: attempt.label,
          reason
        });
      }
    }

    throw new Error(`Conversation API attempts failed after ${failures.length} route(s): ${summarizeConversationApiFailures(failures)}.`);
  }

  function summarizeConversationApiFailures(failures) {
    const counts = new Map();

    for (const failure of failures) {
      const reason = String(failure || "").split(": ").slice(1).join(": ") || "unknown";
      const key = reason
        .replace(/bearer:[^;]+/g, "bearer route")
        .replace(/cookie:[^;]+/g, "cookie route");
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    return [...counts.entries()]
      .map(([reason, count]) => count > 1 ? `${reason} x${count}` : reason)
      .join(", ");
  }

  function buildConversationApiAttempts(conversationId, accessToken = "") {
    const encodedId = encodeURIComponent(conversationId);
    // The full tree arrives in one request (about 10 s for 2,700 nodes); the
    // paginated route costs 5-8 s per page regardless of page size, so it is
    // the fallback, and only with the largest page size.
    const paths = uniqueStrings([
      `/backend-api/conversation/${encodedId}`,
      `/backend-api/conversations/${encodedId}?include_has_versions=true&num_turns=${FAST_CONVERSATION_API_PAGE_SIZE}`,
      `/backend-api/conversations/${encodedId}`,
      `/backend-api/conversation/${encodedId}?tree_format=true`,
      `/backend-api/conversation/${encodedId}?tree_format=false`,
      `/backend-api/conversation/${encodedId}?include_system_messages=true`,
      `/backend-api/conversation/${encodedId}?tree_format=true&include_system_messages=true`,
      ...buildConversationRouteDataPaths()
    ]);
    const authModes = accessToken ? ["bearer", "cookie"] : ["cookie"];
    const attempts = [];

    for (const authMode of authModes) {
      for (const path of paths) {
        const url = new URL(path, location.origin);
        const isRouteData = url.searchParams.has("_data");
        attempts.push({
          label: `${authMode}:${url.pathname}${url.search}`,
          url: url.href,
          authMode,
          accessToken,
          pagination: /^\/backend-api\/conversations\//i.test(url.pathname) ? "before" : "",
          headers: isRouteData ? { "x-remix-request": "yes" } : {}
        });
      }
    }

    return attempts;
  }

  async function fetchRemainingConversationApiPages(initialData, attempt, options = {}) {
    if (attempt?.pagination !== "before") {
      return initialData;
    }

    const signal = options.signal || null;
    const debugLog = options.debugLog || null;
    const timeoutMs = Number(options.timeoutMs || CONVERSATION_API_ATTEMPT_TIMEOUT_MS);
    let mergedData = initialData;
    let pageData = initialData;
    let pageCount = 1;
    let totalRawMessages = getConversationApiRawMessages(initialData).length;
    const seenCursors = new Set();

    while (conversationApiHasPreviousPage(pageData)) {
      throwIfCaptureCancelled(signal);
      const pageInfo = getConversationApiPageInfo(pageData);
      const cursor = String(pageInfo?.start_cursor || pageInfo?.startCursor || "").trim();

      if (!cursor) {
        throw new Error("pagination response is missing start_cursor");
      }

      if (seenCursors.has(cursor)) {
        throw new Error("pagination cursor repeated");
      }

      if (pageCount >= FAST_CONVERSATION_API_MAX_PAGES) {
        throw new Error(`pagination exceeded ${FAST_CONVERSATION_API_MAX_PAGES} pages`);
      }

      seenCursors.add(cursor);
      const pageUrl = new URL(attempt.url);
      pageUrl.searchParams.set("before", cursor);
      const pageAttempt = {
        ...attempt,
        label: `${attempt.label}:older-page-${pageCount + 1}`,
        url: pageUrl.href
      };

      pageData = await fetchConversationApiAttempt(pageAttempt, timeoutMs, signal);
      throwIfCaptureCancelled(signal);
      const pageMessages = getConversationApiRawMessages(pageData);

      if (!pageMessages.length) {
        throw new Error("pagination returned an empty older page");
      }

      mergedData = mergeConversationApiPages(pageData, mergedData);
      pageCount += 1;
      totalRawMessages = getConversationApiRawMessages(mergedData).length;
      options.onProgress?.(`Loading conversation data: page ${pageCount}, ${totalRawMessages} messages...`);
      debugLog?.event("conversationApi.pagination.page", {
        label: attempt.label,
        pageCount,
        pageMessageCount: pageMessages.length,
        totalRawMessages,
        hasPreviousPage: conversationApiHasPreviousPage(pageData)
      });
    }

    if (pageCount > 1) {
      debugLog?.event("conversationApi.pagination.complete", {
        label: attempt.label,
        pageCount,
        totalRawMessages
      });
    }

    return mergedData;
  }

  function mergeConversationApiPages(olderPage, newerPage) {
    const olderMessages = getConversationApiRawMessages(olderPage);
    const newerMessages = getConversationApiRawMessages(newerPage);
    const combined = [...olderMessages, ...newerMessages];
    const lastIndexById = new Map();

    combined.forEach((item, index) => {
      const id = getConversationApiRawMessageId(item);
      if (id) {
        lastIndexById.set(id, index);
      }
    });

    const messages = combined.filter((item, index) => {
      const id = getConversationApiRawMessageId(item);
      return !id || lastIndexById.get(id) === index;
    });
    const olderPageInfo = getConversationApiPageInfo(olderPage);
    const newerPageInfo = getConversationApiPageInfo(newerPage);
    const pageInfo = {
      ...(newerPageInfo || {}),
      start_cursor: olderPageInfo?.start_cursor ?? olderPageInfo?.startCursor ?? newerPageInfo?.start_cursor,
      has_previous_page: conversationApiHasPreviousPage(olderPage),
      end_cursor: newerPageInfo?.end_cursor ?? newerPageInfo?.endCursor ?? olderPageInfo?.end_cursor,
      has_next_page: newerPageInfo?.has_next_page ?? newerPageInfo?.hasNextPage ?? false
    };

    return setConversationApiMessagesAndPageInfo(newerPage, messages, pageInfo);
  }

  function getConversationApiRawMessages(data) {
    const candidates = [
      data?.messages,
      data?.items,
      data?.linear_conversation,
      data?.linearConversation,
      data?.conversation?.messages,
      data?.conversation?.items,
      data?.conversation?.linear_conversation,
      data?.data?.messages,
      data?.data?.items,
      data?.data?.linear_conversation
    ];

    return candidates.find(Array.isArray) || [];
  }

  function getConversationApiRawMessageId(item) {
    const message = item?.message || item;
    return String(message?.id || message?.message_id || item?.id || "").trim();
  }

  function getConversationApiPageInfo(data) {
    const candidates = [
      data?.page_info,
      data?.pageInfo,
      data?.conversation?.page_info,
      data?.conversation?.pageInfo,
      data?.data?.page_info,
      data?.data?.pageInfo
    ];

    return candidates.find((value) => value && typeof value === "object" && !Array.isArray(value)) || null;
  }

  function conversationApiHasPreviousPage(data) {
    const pageInfo = getConversationApiPageInfo(data);
    return pageInfo?.has_previous_page === true || pageInfo?.hasPreviousPage === true;
  }

  function setConversationApiMessagesAndPageInfo(data, messages, pageInfo) {
    if (Array.isArray(data?.conversation?.messages)) {
      return {
        ...data,
        conversation: {
          ...data.conversation,
          messages,
          page_info: pageInfo
        }
      };
    }

    if (Array.isArray(data?.data?.messages)) {
      return {
        ...data,
        data: {
          ...data.data,
          messages,
          page_info: pageInfo
        }
      };
    }

    return {
      ...data,
      messages,
      page_info: pageInfo
    };
  }

  function buildConversationRouteDataPaths() {
    const routes = getConversationRouteDataNames();
    return routes.map((routeName) => {
      const url = new URL(location.href);
      url.searchParams.set("_data", routeName);
      return `${url.pathname}${url.search}`;
    });
  }

  function getConversationRouteDataNames() {
    const pathParts = location.pathname.split("/").map(decodePathPart).filter(Boolean);
    const hasGizmoRoute = pathParts.includes("g") && pathParts.includes("c");
    const routes = [
      "routes/_conversation.c.$conversationId",
      "routes/_conversation"
    ];

    if (hasGizmoRoute) {
      routes.unshift("routes/_conversation.g.$gizmoId.c.$conversationId");
    }

    return uniqueStrings(routes);
  }

  async function fetchConversationApiAttempt(attempt, timeoutMs, signal = null) {
    const headers = {
      accept: "application/json",
      ...(attempt.headers || {})
    };

    if (attempt.authMode === "bearer" && attempt.accessToken) {
      headers.authorization = `Bearer ${attempt.accessToken}`;
    }

    const response = await fetchWithTimeout(attempt.url, {
      timeoutMs,
      signal,
      credentials: "include",
      cache: "no-store",
      headers
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return parseConversationApiResponse(response);
  }

  async function parseConversationApiResponse(response) {
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      return response.json();
    }

    const text = await response.text();

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`non-json response (${contentType || "unknown content-type"})`);
    }
  }

  let cachedChatGptAccessToken = "";
  let chatGptAccessTokenLoaded = false;

  async function getChatGptAccessToken(debugLog = null, timeoutMs = CONVERSATION_API_ATTEMPT_TIMEOUT_MS, signal = null) {
    throwIfCaptureCancelled(signal);
    if (chatGptAccessTokenLoaded) {
      return cachedChatGptAccessToken;
    }

    chatGptAccessTokenLoaded = true;

    let tokenSource = "";

    try {
      const url = new URL("/api/auth/session", location.origin);
      const response = await fetchWithTimeout(url.href, {
        timeoutMs,
        signal,
        credentials: "include",
        cache: "no-store",
        headers: {
          accept: "application/json"
        }
      });

      if (!response.ok) {
        debugLog?.event("conversationApi.token.failed", { status: response.status });
      } else {
        const session = await response.json();
        cachedChatGptAccessToken = extractAccessTokenFromSession(session);
        tokenSource = cachedChatGptAccessToken ? "session-api" : "";
      }
    } catch (error) {
      if (isCaptureCancelledError(error)) {
        chatGptAccessTokenLoaded = false;
        throw error;
      }
      debugLog?.event("conversationApi.token.failed", {
        error: error?.message || String(error)
      });
    }

    if (!cachedChatGptAccessToken) {
      cachedChatGptAccessToken = getChatGptAccessTokenFromPageBootstrap();
      tokenSource = cachedChatGptAccessToken ? "page-bootstrap" : "";
    }

    debugLog?.event("conversationApi.token.loaded", {
      available: Boolean(cachedChatGptAccessToken),
      source: tokenSource
    });
    return cachedChatGptAccessToken;
  }

  function extractAccessTokenFromSession(session) {
    const candidates = [
      session?.accessToken,
      session?.access_token,
      session?.token,
      session?.session?.accessToken,
      session?.session?.access_token,
      session?.session?.token,
      session?.user?.accessToken,
      session?.user?.access_token
    ];

    return String(candidates.find((value) => typeof value === "string" && value.length > 20) || "");
  }

  function getChatGptAccessTokenFromPageBootstrap() {
    const scripts = document.querySelectorAll("script:not([src])");

    for (const script of scripts) {
      const text = String(script?.textContent || "").trim();

      if (!text.includes('"accessToken"') || text.length > 2_000_000) {
        continue;
      }

      try {
        const token = extractAccessTokenFromSession(JSON.parse(text));
        if (token) {
          return token;
        }
      } catch {
        // Ignore non-JSON bootstrap scripts and continue probing.
      }
    }

    return "";
  }

  async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const externalSignal = options.signal || null;
    const timeoutMs = Number(options.timeoutMs || CONVERSATION_API_ATTEMPT_TIMEOUT_MS);
    let timedOut = false;
    const abortFromExternalSignal = () => controller.abort(externalSignal?.reason);

    throwIfCaptureCancelled(externalSignal);
    externalSignal?.addEventListener("abort", abortFromExternalSignal, { once: true });
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const { timeoutMs: _timeoutMs, signal: _signal, ...fetchOptions } = options;
      return await fetch(url, {
        ...fetchOptions,
        signal: controller.signal
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        if (externalSignal?.aborted) {
          throw createCaptureCancelledError(externalSignal.reason);
        }
        throw new Error("timeout");
      }

      throw error;
    } finally {
      window.clearTimeout(timeoutId);
      externalSignal?.removeEventListener("abort", abortFromExternalSignal);
    }
  }

  function buildConversationTimestampMap(data) {
    const map = new Map();
    const mapping = getConversationApiMapping(data);

    for (const node of Object.values(mapping)) {
      const message = node?.message || {};
      const messageId = message.id || node?.id || "";
      const timestamp = formatConversationTimestamp(
        message.create_time ??
        message.update_time ??
        message.metadata?.create_time ??
        message.metadata?.timestamp
      );

      if (messageId && timestamp) {
        map.set(messageId, timestamp);
      }
    }

    for (const message of getConversationApiLinearMessages(data)) {
      const messageId = String(message?.id || message?.message_id || "").trim();
      const timestamp = formatConversationTimestamp(
        message?.create_time ??
        message?.update_time ??
        message?.metadata?.create_time ??
        message?.metadata?.timestamp
      );

      if (messageId && timestamp) {
        map.set(messageId, timestamp);
      }
    }

    return map;
  }
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

  async function enrichVisibleThinkingFlyouts(messages, debugLog = null, options = {}) {
    const signal = options.signal || null;
    throwIfCaptureCancelled(signal);
    const snapshots = getVisibleThinkingFlyoutSnapshots();
    let applied = 0;

    debugLog?.event("thinkingFlyout.visibleScan", {
      ...getThinkingFlyoutDiagnostic(),
      snapshotCount: snapshots.length,
      snapshots: snapshots.slice(0, 3).map(getThinkingSnapshotDebug)
    });

    for (const snapshot of snapshots) {
      throwIfCaptureCancelled(signal);
      applied += applyThinkingFlyoutSnapshot(snapshot, messages) ? 1 : 0;
    }

    const opened = await enrichThinkingFlyoutsByOpeningTriggers(messages, debugLog, options);
    throwIfCaptureCancelled(signal);
    const settled = await settleVisibleThinkingFlyoutSnapshots(messages, options);
    throwIfCaptureCancelled(signal);

    debugLog?.event("thinkingFlyout.enriched", {
      available: snapshots.length,
      visibleApplied: applied,
      autoAttempted: opened.attempted,
      autoApplied: opened.applied,
      settled: settled.settled,
      settledSnapshots: settled.snapshotCount,
      settledSourceCount: settled.sourceCount
    });
  }

  async function settleVisibleThinkingFlyoutSnapshots(messages, options = {}) {
    const signal = options.signal || null;
    const timeoutMs = Number.isFinite(options.settleTimeoutMs)
      ? Math.max(0, options.settleTimeoutMs)
      : THINKING_FLYOUT_SETTLE_TIMEOUT_MS;
    const startedAt = Date.now();
    let previousSignature = "";
    let stablePasses = 0;
    let snapshotCount = 0;
    let sourceCount = 0;
    let sawPanel = false;

    while (Date.now() - startedAt < timeoutMs) {
      throwIfCaptureCancelled(signal);
      const snapshots = getVisibleThinkingFlyoutSnapshots();

      if (snapshots.length) {
        sawPanel = true;
        snapshotCount = snapshots.length;
        sourceCount = snapshots.reduce((sum, snapshot) => sum + (snapshot.sources?.length || 0), 0);

        for (const snapshot of snapshots) {
          applyThinkingFlyoutSnapshot(snapshot, messages);
        }

        const signature = snapshots
          .map((snapshot) => `${snapshot.signature}:${snapshot.sources?.length || 0}`)
          .join("|");
        stablePasses = signature === previousSignature ? stablePasses + 1 : 1;
        previousSignature = signature;

        const hasCompletedStatus = snapshots.some((snapshot) => snapshot.completed);
        const hasActiveStatus = snapshots.some((snapshot) => snapshot.active);
        const elapsed = Date.now() - startedAt;

        if (stablePasses >= THINKING_FLYOUT_STABLE_PASSES && (hasCompletedStatus || (!hasActiveStatus && elapsed >= 900))) {
          return { settled: true, snapshotCount, sourceCount };
        }
      } else if (!sawPanel && Date.now() - startedAt >= THINKING_FLYOUT_NO_PANEL_GRACE_MS) {
        return { settled: false, snapshotCount: 0, sourceCount: 0 };
      }

      await sleep(THINKING_FLYOUT_SETTLE_POLL_MS);
      throwIfCaptureCancelled(signal);
    }

    return { settled: sawPanel, snapshotCount, sourceCount };
  }

  async function enrichThinkingFlyoutsByOpeningTriggers(messages, debugLog = null, options = {}) {
    const signal = options.signal || null;
    const limit = Number.isFinite(options.autoOpenLimit) ? options.autoOpenLimit : THINKING_FLYOUT_AUTO_OPEN_LIMIT;
    const assistantMessages = messages
      .filter((message) => message.role === "assistant" && isThinThinkingMarkdown(message.thinkingMarkdown))
      .filter((message) => !options.requireMountedRoot || hasMountedThinkingSearchRoot(message));
    let attempted = 0;
    let applied = 0;

    debugLog?.event("thinkingFlyout.autoStart", {
      assistantMessages: messages.filter((message) => message.role === "assistant").length,
      thinThinkingMessages: assistantMessages.length,
      limit,
      requireMountedRoot: Boolean(options.requireMountedRoot)
    });

    for (const message of assistantMessages) {
      throwIfCaptureCancelled(signal);
      if (attempted >= limit) {
        break;
      }

      const triggerResult = await findMountedThinkingTriggerForMessage(message, options);
      throwIfCaptureCancelled(signal);
      const trigger = triggerResult.trigger;

      if (!trigger) {
        debugLog?.event("thinkingFlyout.triggerMissing", {
          message: getThinkingDebugMessageInfo(message),
          reason: triggerResult.reason,
          candidates: triggerResult.candidates || []
        });
        continue;
      }

      attempted += 1;

      try {
        const beforeSnapshots = getVisibleThinkingFlyoutSnapshots();
        const beforeSignatures = new Set(beforeSnapshots.map((snapshot) => snapshot.signature));
        debugLog?.event("thinkingFlyout.autoClick", {
          message: getThinkingDebugMessageInfo(message),
          triggerText: getElementText(trigger).slice(0, 120),
          triggerSource: triggerResult.source,
          beforeSnapshotCount: beforeSnapshots.length
        });
        trigger.click();
        const snapshot = await waitForThinkingFlyoutSnapshot(beforeSignatures, THINKING_FLYOUT_OPEN_TIMEOUT_MS, signal);
        const wasApplied = snapshot ? applyThinkingFlyoutSnapshot(snapshot, messages, message) : false;

        debugLog?.event("thinkingFlyout.autoResult", {
          message: getThinkingDebugMessageInfo(message),
          snapshot: snapshot ? getThinkingSnapshotDebug(snapshot) : null,
          applied: wasApplied,
          reason: snapshot ? (wasApplied ? "applied" : "snapshot not richer than current thinking") : "no new flyout snapshot after click"
        });

        if (wasApplied) {
          applied += 1;
        }
      } catch (error) {
        if (isCaptureCancelledError(error)) {
          throw error;
        }
        debugLog?.event("thinkingFlyout.openFailed", {
          message: getThinkingDebugMessageInfo(message),
          error: error?.message || String(error)
        });
      }
    }

    return {
      attempted,
      applied
    };
  }

  function hasMountedThinkingSearchRoot(message) {
    return Boolean(
      message.sourceNode?.isConnected
      || (message.sourceTurnId && document.querySelector(`[data-turn-id="${cssString(message.sourceTurnId)}"]`))
      || (message.sourceTurnContainer && document.querySelector(`[data-turn-id-container="${cssString(message.sourceTurnContainer)}"], [data-turn-container="${cssString(message.sourceTurnContainer)}"]`))
      || (message.sourceMessageId && document.querySelector(`[data-message-id="${cssString(message.sourceMessageId)}"]`))
      || findTurnNodeByConversationOrder(message.order)
    );
  }

  async function findMountedThinkingTriggerForMessage(message, options = {}) {
    const signal = options.signal || null;
    throwIfCaptureCancelled(signal);
    const candidates = [
      message.sourceNode,
      message.sourceNode?.closest?.("[data-turn-id-container], [data-turn-container], [data-turn-id], [data-testid*='conversation-turn']"),
      message.sourceTurnId ? document.querySelector(`[data-turn-id="${cssString(message.sourceTurnId)}"]`) : null,
      message.sourceTurnContainer ? document.querySelector(`[data-turn-id-container="${cssString(message.sourceTurnContainer)}"], [data-turn-container="${cssString(message.sourceTurnContainer)}"]`) : null,
      message.sourceMessageId ? document.querySelector(`[data-message-id="${cssString(message.sourceMessageId)}"]`)?.closest("[data-turn-id-container], [data-turn-container], [data-turn-id], [data-testid*='conversation-turn']") : null,
      findTurnNodeByConversationOrder(message.order)
    ].filter((node) => node?.isConnected);
    const diagnostics = [];

    if (!candidates.length) {
      return {
        trigger: null,
        reason: "no mounted source node for message",
        candidates: diagnostics
      };
    }

    for (const candidate of uniqueElements(candidates)) {
      throwIfCaptureCancelled(signal);
      const trigger = findThinkingTriggerInRoot(candidate);
      const candidateInfo = {
        source: "before-scroll",
        node: summarizeNode(candidate),
        triggerCount: countThinkingTriggersInRoot(candidate)
      };
      diagnostics.push(candidateInfo);

      if (trigger) {
        return {
          trigger,
          reason: "found before scroll",
          source: "before-scroll",
          candidates: diagnostics
        };
      }

      candidate.scrollIntoView?.({ block: "center", inline: "nearest" });
      await sleep(120);
      throwIfCaptureCancelled(signal);

      const mountedTrigger = findThinkingTriggerInRoot(candidate);
      diagnostics.push({
        source: "after-scroll",
        node: summarizeNode(candidate),
        triggerCount: countThinkingTriggersInRoot(candidate)
      });

      if (mountedTrigger) {
        return {
          trigger: mountedTrigger,
          reason: "found after scroll",
          source: "after-scroll",
          candidates: diagnostics
        };
      }
    }

    if (options.allowGlobalFallback === false) {
      return {
        trigger: null,
        reason: "no thinking trigger inside mounted source nodes",
        candidates: diagnostics
      };
    }

    const globalResult = await findGlobalThinkingTriggerForMessage(message, signal);

    if (globalResult.trigger) {
      diagnostics.push(...globalResult.candidates);
      return {
        trigger: globalResult.trigger,
        reason: globalResult.reason,
        source: globalResult.source,
        candidates: diagnostics
      };
    }

    diagnostics.push(...globalResult.candidates);

    return {
      trigger: null,
      reason: globalResult.reason || "no thinking trigger inside mounted source nodes",
      candidates: diagnostics
    };
  }

  function findTurnNodeByConversationOrder(order) {
    const number = Number(order);

    if (!Number.isFinite(number) || number <= 0 || number >= 1_000_000) {
      return null;
    }

    return getAllTurnNodes().find((turn) => getConversationTurnNumber(turn) === number) || null;
  }

  async function findGlobalThinkingTriggerForMessage(message, signal = null) {
    throwIfCaptureCancelled(signal);
    const expectedStatus = normalizeThinkingStatus(message.thinkingMarkdown);
    const triggerScores = getGlobalThinkingTriggerScores(message, expectedStatus);

    if (!triggerScores.length) {
      return {
        trigger: null,
        reason: "no global thinking triggers found",
        candidates: []
      };
    }

    const exactStatusMatches = expectedStatus
      ? triggerScores.filter((entry) => entry.normalizedTriggerText === expectedStatus)
      : [];
    const best = [...triggerScores].sort((left, right) => right.score - left.score)[0];
    const canUseBest = best.score >= 120
      || (expectedStatus && exactStatusMatches.length === 1 && best.normalizedTriggerText === expectedStatus && best.score >= 100);

    if (!canUseBest) {
      return {
        trigger: null,
        reason: "global thinking triggers found but no confident match",
        candidates: triggerScores.slice(0, 6).map(formatThinkingTriggerScore)
      };
    }

    best.root?.scrollIntoView?.({ block: "center", inline: "nearest" });
    await sleep(120);
    throwIfCaptureCancelled(signal);

    return {
      trigger: best.trigger,
      reason: "found by global trigger fallback",
      source: "global-fallback",
      candidates: triggerScores.slice(0, 6).map(formatThinkingTriggerScore)
    };
  }

  function getGlobalThinkingTriggerScores(message, expectedStatus) {
    const triggers = [...document.querySelectorAll("button, [role='button']")]
      .filter(isThinkingPanelTriggerElement);
    const sourceMessageId = message.sourceMessageId || "";
    const order = Number(message.order);
    const previewNeedle = getThinkingPreviewNeedle(message.preview || message.markdown || "");

    return triggers.map((trigger) => {
      const root = getClosestTurnNode(trigger) || trigger.closest("[data-message-author-role], article, [role='article']") || trigger;
      const triggerText = getExpandableCueText(trigger);
      const normalizedTriggerText = normalizeThinkingStatus(triggerText);
      const rootText = getElementText(root);
      const turnNumber = getConversationTurnNumber(root);
      let score = 0;

      if (sourceMessageId && root.querySelector?.(`[data-message-id="${cssString(sourceMessageId)}"]`)) {
        score += 160;
      }

      if (Number.isFinite(order) && order > 0 && turnNumber === order) {
        score += 120;
      }

      if (expectedStatus && normalizedTriggerText === expectedStatus) {
        score += 100;
      } else if (expectedStatus && normalizedTriggerText.includes(expectedStatus)) {
        score += 70;
      }

      if (previewNeedle && rootText.includes(previewNeedle)) {
        score += 35;
      }

      if (isNodeInViewport(root)) {
        score += 8;
      }

      return {
        trigger,
        root,
        score,
        turnNumber,
        triggerText,
        normalizedTriggerText
      };
    })
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score);
  }

  function formatThinkingTriggerScore(entry) {
    return {
      source: "global-fallback",
      score: entry.score,
      turnNumber: Number.isFinite(entry.turnNumber) ? entry.turnNumber : null,
      triggerText: entry.triggerText,
      node: summarizeNode(entry.root),
      triggerCount: 1
    };
  }

  function normalizeThinkingStatus(text) {
    return cleanMarkdown(text).replace(/\s+/g, "").trim();
  }

  function getThinkingPreviewNeedle(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 42);
  }

  function findThinkingTriggerInRoot(root) {
    if (!root?.querySelectorAll) {
      return null;
    }

    return [...root.querySelectorAll("button, [role='button']")].find(isThinkingPanelTriggerElement) || null;
  }

  function countThinkingTriggersInRoot(root) {
    if (!root?.querySelectorAll) {
      return 0;
    }

    return [...root.querySelectorAll("button, [role='button']")].filter(isThinkingPanelTriggerElement).length;
  }

  function isThinkingPanelTriggerElement(element) {
    return isThinkingDetailTriggerElement(element) || isThinkingSourceTriggerElement(element);
  }

  function isThinkingDetailTriggerElement(element) {
    if (!element?.matches || element.closest("#chatgpt-exporter-selector-host, nav, header, footer, aside, [role='menu']")) {
      return false;
    }

    const cueText = getExpandableCueText(element);

    if (!cueText || !THINKING_STATUS_RE.test(cueText)) {
      return false;
    }

    if (element.matches("[data-testid*='copy' i], [data-testid*='feedback' i], [data-testid*='share' i], [aria-label*='Copy' i], [aria-label*='Good response' i], [aria-label*='Bad response' i], [aria-label*='Share' i]")) {
      return false;
    }

    return true;
  }

  function isThinkingSourceTriggerElement(element) {
    if (!element?.matches || element.closest("#chatgpt-exporter-selector-host, nav, header, aside, [role='menu']")) {
      return false;
    }

    const cueTexts = [
      element.getAttribute("aria-label") || "",
      element.getAttribute("title") || "",
      element.getAttribute("data-testid") || "",
      getElementText(element)
    ]
      .map((text) => String(text).replace(/\s+/g, " ").trim())
      .filter(Boolean);

    return cueTexts.some((text) => THINKING_SOURCE_TRIGGER_RE.test(text));
  }

  async function waitForThinkingFlyoutSnapshot(previousSignatures, timeoutMs, signal = null) {
    const startedAt = Date.now();
    let bestSnapshot = null;

    while (Date.now() - startedAt < timeoutMs) {
      throwIfCaptureCancelled(signal);
      const snapshots = getVisibleThinkingFlyoutSnapshots();
      const freshSnapshot = snapshots.find((snapshot) => !previousSignatures.has(snapshot.signature) && snapshot.markdown);

      if (freshSnapshot) {
        return freshSnapshot;
      }

      bestSnapshot = snapshots.find((snapshot) => snapshot.markdown) || bestSnapshot;
      await sleep(100);
      throwIfCaptureCancelled(signal);
    }

    return previousSignatures.size ? null : bestSnapshot;
  }

  function applyThinkingFlyoutSnapshot(snapshot, messages, preferredMessage = null) {
    const target = preferredMessage || findThinkingFlyoutTargetMessage(snapshot, messages);

    if (!target || !isRicherThinkingMarkdown(snapshot.markdown, target.thinkingMarkdown)) {
      return false;
    }

    target.thinkingMarkdown = snapshot.markdown;
    target.preview = messageExtractor.preview(target);
    return true;
  }

  function getThinkingFlyoutDiagnostic() {
    const roots = [
      ...document.querySelectorAll('[data-stage-thread-flyout="true"], [data-testid="stage-thread-flyout"], [data-testid="screen-threadFlyout"], [data-testid="screen-threadFlyOut"]')
    ];
    const screenFlyouts = [...document.querySelectorAll('[data-testid="screen-threadFlyout"], [data-testid="screen-threadFlyOut"]')];
    const reasoningPanels = [...document.querySelectorAll([
      'section[aria-label*="\u63a8\u7406"]',
      'section[aria-label*="\u601d\u8003"]',
      'section[aria-label*="reasoning" i]',
      'section[aria-label*="thinking" i]'
    ].join(","))];
    const candidates = uniqueElements([...roots, ...screenFlyouts, ...reasoningPanels]);

    return {
      rootCount: roots.length,
      screenFlyoutCount: screenFlyouts.length,
      reasoningPanelCount: reasoningPanels.length,
      visibleCandidateCount: candidates.filter(isVisibleElement).length,
      candidatePreviews: candidates.slice(0, 4).map((element) => ({
        visible: isVisibleElement(element),
        node: summarizeNode(element),
        textPreview: getElementText(element).slice(0, 220)
      }))
    };
  }

  function getThinkingSnapshotDebug(snapshot) {
    return {
      markdownLength: snapshot.markdown?.length || 0,
      sourceCount: snapshot.sources?.length || 0,
      status: snapshot.status || "",
      duration: snapshot.duration || "",
      signature: snapshot.signature || "",
      preview: String(snapshot.markdown || "").replace(/\s+/g, " ").slice(0, 220),
      panel: summarizeNode(snapshot.panel)
    };
  }

  function getThinkingDebugMessageInfo(message) {
    return {
      id: message.id || "",
      role: message.role || "",
      order: message.order ?? null,
      sourceTurnId: message.sourceTurnId || "",
      sourceMessageId: message.sourceMessageId || "",
      sourceTestId: message.sourceTestId || "",
      thinkingLength: message.thinkingMarkdown?.length || 0,
      thinkingPreview: String(message.thinkingMarkdown || "").replace(/\s+/g, " ").slice(0, 160),
      preview: message.preview || ""
    };
  }

  function getVisibleThinkingFlyoutSnapshots() {
    const roots = uniqueElements([
      ...document.querySelectorAll('[data-stage-thread-flyout="true"], [data-testid="stage-thread-flyout"], [data-testid="screen-threadFlyout"], [data-testid="screen-threadFlyOut"]')
    ]);
    const panels = [];

    for (const root of roots) {
      if (isThinkingFlyoutPanel(root)) {
        panels.push(root);
      }

      panels.push(...root.querySelectorAll([
        '[data-testid="screen-threadFlyout"]',
        '[data-testid="screen-threadFlyOut"]',
        'section[aria-label*="\u63a8\u7406"]',
        'section[aria-label*="\u601d\u8003"]',
        'section[aria-label*="reasoning" i]',
        'section[aria-label*="thinking" i]'
      ].join(",")));
    }

    if (!panels.length) {
      panels.push(...document.querySelectorAll([
        '[data-testid="screen-threadFlyout"]',
        'section[aria-label*="\u63a8\u7406"]',
        'section[aria-label*="\u601d\u8003"]',
        'section[aria-label*="reasoning" i]',
        'section[aria-label*="thinking" i]'
      ].join(",")));
    }

    return uniqueTopLevelElements(panels)
      .filter(isThinkingFlyoutPanel)
      .map(extractThinkingFlyoutSnapshot)
      .filter((snapshot) => snapshot.markdown);
  }

  function isThinkingFlyoutPanel(element) {
    if (!element?.matches || !isVisibleElement(element)) {
      return false;
    }

    const attrs = [
      element.getAttribute("data-testid") || "",
      element.getAttribute("aria-label") || "",
      element.getAttribute("class") || ""
    ].join(" ");
    const text = getElementText(element);

    return Boolean(
      /stage-thread-flyout|screen-threadFlyout|reasoning|thinking|\u63a8\u7406|\u601d\u8003/i.test(attrs)
      && (THINKING_CUE_RE.test(text.slice(0, 1200)) || THINKING_STATUS_RE.test(text))
    );
  }

  function extractThinkingFlyoutSnapshot(panel) {
    const lines = getThinkingFlyoutLines(panel);
    const sources = extractThinkingFlyoutSources(panel);
    const markdown = extractThinkingFlyoutStructuredMarkdown(panel, lines, sources)
      || formatThinkingFlyoutLinesAsMarkdown(lines, sources);
    const status = lines.find((line) => THINKING_STATUS_RE.test(line)) || "";

    return {
      panel,
      markdown,
      sources,
      status,
      completed: lines.some((line) => THINKING_FLYOUT_DONE_RE.test(line)),
      active: lines.some((line) => THINKING_FLYOUT_ACTIVE_RE.test(line)),
      duration: extractThinkingDuration(status || getElementText(panel)),
      signature: hashString([
        markdown,
        ...sources.map((source) => `${source.label}\n${source.url}`)
      ].join("\n"))
    };
  }

  function getThinkingFlyoutLines(panel) {
    const rawText = String(panel.innerText || panel.textContent || "").replace(/\r\n?/g, "\n");
    const sourceLines = rawText.split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
    const startIndex = sourceLines.findIndex((line) => THINKING_FLYOUT_TITLE_RE.test(line) || THINKING_STATUS_RE.test(line) || THINKING_CUE_RE.test(line));
    const lines = startIndex >= 0 ? sourceLines.slice(startIndex) : sourceLines;
    const result = [];

    for (const line of lines) {
      if (THINKING_FLYOUT_STOP_RE.test(line) || THINKING_FLYOUT_SOURCES_RE.test(line)) {
        break;
      }

      if (isThinkingFlyoutNoiseLineSafe(line)) {
        continue;
      }

      result.push(line);
    }

    return result;
  }

  function extractThinkingFlyoutStructuredMarkdown(panel, lines = [], sources = []) {
    const entries = extractThinkingFlyoutStepEntries(panel);

    if (!entries.length) {
      return "";
    }

    const items = [];

    for (const entry of entries) {
      const blocks = extractThinkingFlyoutStepBlocks(entry.contentRoot);

      if (!blocks.length) {
        continue;
      }

      const renderedBlocks = blocks.map(renderThinkingFlyoutStructuredBlock).filter(Boolean);

      if (!renderedBlocks.length) {
        continue;
      }

      items.push([
        `#### ${entry.heading}`,
        renderedBlocks.join("\n\n")
      ].join("\n\n"));
    }

    if (!items.length) {
      return "";
    }

    const statusLines = lines
      .filter((line) => THINKING_STATUS_RE.test(line) || THINKING_FLYOUT_DONE_RE.test(line))
      .map((line) => `✓ ${line}`);
    const sourceLines = sources.map((source) => {
      const label = escapeMarkdownLinkLabel(source.label || compactUrlLabel(source.url));
      return `- [Source: ${label}](${source.url})`;
    });

    return cleanMarkdown([
      items.join("\n\n"),
      statusLines.join("\n"),
      sourceLines.length ? `### Sources\n\n${sourceLines.join("\n")}` : ""
    ].filter(Boolean).join("\n\n"));
  }

  function extractThinkingFlyoutStepEntries(panel) {
    if (!panel?.querySelectorAll) {
      return [];
    }

    const entries = [];
    const seenContainers = new Set();

    for (const element of panel.querySelectorAll("div")) {
      const className = String(element.className || "");
      const heading = getElementText(element);

      if (!isVisibleElement(element)
        || !className.includes("text-token-text-primary")
        || !className.includes("text-[14px]")
        || !heading
        || heading.length > 140
        || element.querySelector("pre, p, ul, ol, blockquote")) {
        continue;
      }

      if (THINKING_FLYOUT_TITLE_RE.test(heading)
        || THINKING_STATUS_RE.test(heading)
        || THINKING_FLYOUT_DONE_RE.test(heading)) {
        continue;
      }

      const location = findThinkingFlyoutStepLocation(element, panel);

      if (!location || seenContainers.has(location.container)) {
        continue;
      }

      seenContainers.add(location.container);
      entries.push({
        heading: heading.replace(/\s+/g, " ").trim(),
        contentRoot: location.contentRoot,
        container: location.container
      });
    }

    return entries;
  }

  function findThinkingFlyoutStepLocation(heading, panel) {
    let current = heading.parentElement;

    while (current && current !== panel) {
      const contentRoot = Array.from(current.children || [])
        .find((child) => !child.contains(heading) && hasThinkingFlyoutStructuredContent(child));

      if (contentRoot) {
        return { container: current, contentRoot };
      }

      current = current.parentElement;
    }

    return null;
  }

  function hasThinkingFlyoutStructuredContent(element) {
    return Boolean(element?.querySelector?.("p, pre, ul, ol, blockquote, h1, h2, h3, h4, h5, h6"));
  }

  function extractThinkingFlyoutStepBlocks(contentRoot) {
    if (!contentRoot?.querySelectorAll) {
      return [];
    }

    const outerPreNodes = Array.from(contentRoot.querySelectorAll("pre"))
      .filter((pre) => !pre.parentElement?.closest("pre"));
    const outerPreSet = new Set(outerPreNodes);
    const nodes = Array.from(contentRoot.querySelectorAll("p, pre, ul, ol, blockquote, h1, h2, h3, h4, h5, h6"))
      .filter((node) => outerPreSet.has(node) || !node.closest("pre"));
    const blocks = [];

    for (const node of nodes) {
      if (node.tagName === "PRE") {
        if (!outerPreSet.has(node)) {
          continue;
        }

        const codeBlock = extractThinkingFlyoutCodeCard(node);

        if (codeBlock) {
          blocks.push(codeBlock);
        }
        continue;
      }

      if (node.matches("UL, OL")) {
        const lines = Array.from(node.querySelectorAll(":scope > li"))
          .map((item) => getElementText(item))
          .filter(Boolean)
          .map((line) => `- ${line}`);

        if (lines.length) {
          blocks.push({ kind: "text", text: lines.join("\n") });
        }
        continue;
      }

      const text = getElementText(node);

      if (text) {
        blocks.push({
          kind: node.tagName === "BLOCKQUOTE" ? "quote" : "text",
          text
        });
      }
    }

    return blocks;
  }

  function extractThinkingFlyoutCodeCard(pre) {
    const nestedPres = Array.from(pre.querySelectorAll("pre"));
    const commandPre = nestedPres.find((candidate) => String(candidate.className || "").includes("cm-content"))
      || nestedPres.find((candidate) => candidate.querySelector("code"))
      || (pre.querySelector("code") ? pre.querySelector("code").closest("pre") : null);
    const labelNode = Array.from(pre.querySelectorAll("div, span"))
      .find((candidate) => {
        const className = String(candidate.className || "");
        const value = getElementText(candidate);
        return className.includes("font-medium")
          && value.length <= 32
          && THINKING_FLYOUT_CODE_TITLE_RE.test(value);
      });
    const label = labelNode ? getElementText(labelNode) : "Code";
    const rawCode = commandPre
      ? getPreservedThinkingFlyoutText(commandPre)
      : pre.querySelector("code")
        ? getPreservedThinkingFlyoutText(pre.querySelector("code"))
        : getPreservedThinkingFlyoutText(pre);
    const codeLines = stripThinkingFlyoutCodeLabel(rawCode, label);
    const resultLines = nestedPres
      .filter((candidate) => candidate !== commandPre)
      .map(getPreservedThinkingFlyoutText)
      .flatMap((value) => value ? value.split("\n") : [])
      .filter((line, index, all) => line || index === 0 || all[index - 1]);

    if (!codeLines.length && !resultLines.length) {
      return null;
    }

    return {
      kind: "code",
      label,
      codeLines,
      resultLines
    };
  }

  function getPreservedThinkingFlyoutText(element) {
    return String(element?.innerText || element?.textContent || "")
      .replace(/\r\n?/g, "\n")
      .trim();
  }

  function stripThinkingFlyoutCodeLabel(text, label) {
    const lines = String(text || "").split("\n");

    if (lines.length && label && lines[0].trim() === label) {
      lines.shift();
    }

    return lines;
  }

  function renderThinkingFlyoutStructuredBlock(block) {
    if (block.kind === "code") {
      const sections = [
        `##### ${block.label || "Code"}`,
        renderThinkingCodeFence(block.codeLines, "text")
      ];

      if (block.resultLines.length) {
        sections.push(`##### Result\n\n${renderThinkingCodeFence(block.resultLines, "text")}`);
      }

      return sections.join("\n\n");
    }

    if (block.kind === "quote") {
      return block.text.split("\n").map((line) => `> ${line}`).join("\n");
    }

    return block.text;
  }

  function extractThinkingFlyoutSources(panel) {
    if (!panel?.querySelectorAll) {
      return [];
    }

    const sources = [];
    const seen = new Set();

    for (const anchor of panel.querySelectorAll("a[href]")) {
      const href = String(anchor.href || anchor.getAttribute("href") || "").trim();

      if (!/^https?:\/\//i.test(href)) {
        continue;
      }

      const label = getElementText(anchor).replace(/\s+/g, " ").trim();
      const key = `${label}\n${href}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      sources.push({
        label: label.slice(0, 180) || compactUrlLabel(href),
        url: href
      });

      if (sources.length >= 60) {
        break;
      }
    }

    return sources;
  }

  function isThinkingFlyoutNoiseLineSafe(line) {
    return THINKING_FLYOUT_TITLE_RE.test(line)
      || /^activity\s*(?:[\u00b7:])?/i.test(line)
      || /^\u6d3b\u52a8\s*(?:[\u00b7:])?/.test(line)
      || /^close$/i.test(line)
      || /^\u5173\u95ed$/.test(line);
  }

  function formatThinkingFlyoutLinesAsMarkdown(lines, sources = []) {
    const contentLines = [];
    const statusLines = [];

    for (const line of lines) {
      if (THINKING_STATUS_RE.test(line) || THINKING_FLYOUT_DONE_RE.test(line)) {
        statusLines.push(line);
      } else {
        contentLines.push(line);
      }
    }

    const items = [];

    for (let index = 0; index < contentLines.length; index += 1) {
      const line = contentLines[index];
      const next = contentLines[index + 1] || "";

      if (THINKING_FLYOUT_STEP_LABEL_RE.test(line)) {
        const countMatch = next.match(/^[\u00b7:]\s*(\d+)$/);
        const count = countMatch ? countMatch[1] : "";
        items.push(`#### ${line}${count ? ` (${count})` : ""}`);
        if (countMatch) {
          index += 1;
        }
        continue;
      }

      if (THINKING_FLYOUT_CODE_TITLE_RE.test(line) && next) {
        const block = collectThinkingCodeBlock(contentLines, index + 1);
        items.push([
          `##### ${line}`,
          renderThinkingCodeFence(block.codeLines, "text"),
          block.resultLines.length ? `##### Result\n\n${renderThinkingCodeFence(block.resultLines, "text")}` : ""
        ].filter(Boolean).join("\n\n"));
        index = block.endIndex;
        continue;
      }

      if (isThinkingFlyoutStepHeadingSafe(line, next)) {
        items.push(`#### ${line}`);
        continue;
      }

      if (next && isLikelyThinkingFlyoutHeadingSafe(line, next)) {
        items.push(`- **${line}**\n  ${next}`);
        index += 1;
      } else {
        items.push(formatThinkingFlyoutContentLine(line));
      }
    }

    const sourceLines = sources.map((source) => {
      const label = escapeMarkdownLinkLabel(source.label || compactUrlLabel(source.url));
      return `- [Source: ${label}](${source.url})`;
    });

    return cleanMarkdown([
      items.join("\n"),
      statusLines.map((line) => `\u2713 ${line}`).join("\n"),
      sourceLines.length ? `### Sources\n\n${sourceLines.join("\n")}` : ""
    ].filter(Boolean).join("\n\n"));
  }

  function isThinkingFlyoutStepHeadingSafe(line, nextLine) {
    const value = String(line || "").trim();
    const next = String(nextLine || "").trim();

    return Boolean(
      value
      && next
      && value.length <= 52
      && (next.length >= 24 || THINKING_FLYOUT_CODE_TITLE_RE.test(next))
      && !THINKING_FLYOUT_STEP_LABEL_RE.test(value)
      && !THINKING_FLYOUT_CODE_TITLE_RE.test(value)
      && !THINKING_STATUS_RE.test(value)
      && !THINKING_FLYOUT_DONE_RE.test(value)
      && !THINKING_FLYOUT_RESULT_RE.test(value)
      && !/^[-*+\u2022\u00b7]\s/.test(value)
      && !/^https?:\/\//i.test(value)
      && !/^(?:[\w.-]+\.)+[a-z]{2,}(?:\/|$)/i.test(value)
      && !/[:=]$/.test(value)
      && !/^\d{1,4}[\/-]\d{1,2}[\/-]\d{1,4}/.test(value)
    );
  }

  function collectThinkingCodeBlock(lines, startIndex) {
    const codeLines = [];
    const resultLines = [];
    let resultMode = false;
    let index = startIndex;

    for (; index < lines.length; index += 1) {
      const line = String(lines[index] || "");
      const next = lines[index + 1] || "";

      if (
        THINKING_FLYOUT_STEP_LABEL_RE.test(line)
        || THINKING_FLYOUT_SOURCES_RE.test(line)
        || THINKING_STATUS_RE.test(line)
        || THINKING_FLYOUT_DONE_RE.test(line)
        || isThinkingFlyoutStepHeadingSafe(line, next)
      ) {
        break;
      }

      if (!resultMode && THINKING_FLYOUT_RESULT_RE.test(line) && codeLines.length) {
        resultMode = true;
      }

      (resultMode ? resultLines : codeLines).push(line);
    }

    return {
      codeLines,
      resultLines,
      endIndex: Math.max(startIndex - 1, index - 1)
    };
  }

  function renderThinkingCodeFence(lines, language = "text") {
    const body = lines
      .map((line) => String(line || "").replace(/```/g, "`` `"))
      .join("\n")
      .trim();
    return `\`\`\`${language}\n${body}\n\`\`\``;
  }

  function formatThinkingFlyoutContentLine(line) {
    const value = String(line || "").trim();

    if (/^[-*+]\s+/.test(value) || /^\u2022\s+/.test(value) || /^-{3,}$/.test(value)) {
      return value;
    }

    return `- ${value}`;
  }

  function isLikelyThinkingFlyoutHeadingSafe(line, nextLine) {
    return line.length <= 38
      && nextLine.length >= 24
      && !/[.?!\u3002\uff1f\uff01:\uff1a]$/.test(line)
      && !THINKING_STATUS_RE.test(line)
      && !THINKING_FLYOUT_DONE_RE.test(line);
  }

  function extractThinkingDuration(text) {
    const match = String(text || "").match(/\d+(?:\.\d+)?\s*(?:s|sec|secs|seconds?|\u79d2)?/i);
    return match ? match[0].replace(/\s+/g, "") : "";
  }

  function findThinkingFlyoutTargetMessage(snapshot, messages) {
    const assistantMessages = messages.filter((message) => message.role === "assistant");

    if (!assistantMessages.length) {
      return null;
    }

    if (snapshot.status || snapshot.duration) {
      const matchedByStatus = assistantMessages.find((message) => {
        const text = [
          message.thinkingMarkdown || "",
          message.sourceNode ? getElementText(message.sourceNode) : ""
        ].join(" ");
        return Boolean(
          snapshot.status && text.includes(snapshot.status)
          || snapshot.duration && text.replace(/\s+/g, "").includes(snapshot.duration)
        );
      });

      if (matchedByStatus) {
        return matchedByStatus;
      }
    }

    return assistantMessages.find((message) => isNodeInViewport(message.sourceNode) && isThinThinkingMarkdown(message.thinkingMarkdown))
      || assistantMessages.find((message) => isNodeInViewport(message.sourceNode))
      || assistantMessages.find((message) => isThinThinkingMarkdown(message.thinkingMarkdown))
      || assistantMessages[assistantMessages.length - 1]
      || assistantMessages[0];
  }

  function isRicherThinkingMarkdown(candidate, current) {
    const next = cleanMarkdown(candidate);
    const previous = cleanMarkdown(current);

    if (!next) {
      return false;
    }

    if (!previous) {
      return true;
    }

    return next.length > previous.length + Math.max(40, Math.floor(previous.length * 0.25));
  }

  function isThinThinkingMarkdown(markdown) {
    const value = cleanMarkdown(markdown);
    return !value
      || /^fast\|/i.test(value)
      || value.length < 90
      || (THINKING_STATUS_RE.test(value) && value.length < 160);
  }

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

  async function extractMessage(node, parts, role, order) {
    const body = parts.body || node;
    const thinkingElements = parts.thinkingElements || [];
    let state = createSerializationState(thinkingElements);
    let usedWholeNodeFallback = false;
    const serializationAttempts = [];
    let markdown = cleanMarkdown(await serializeNodeChildren(body, state));
    serializationAttempts.push({
      stage: "primary-body",
      length: markdown.length,
      node: summarizeNode(body)
    });

    if (shouldRunCompletenessPass(node, body, role, markdown)) {
      const completeState = createSerializationState(thinkingElements, true);
      const completeResult = await serializeCompleteMessageContent(node, parts, completeState, serializationAttempts);

      if (isMoreCompleteMarkdown(completeResult.markdown, markdown)) {
        markdown = completeResult.markdown;
        usedWholeNodeFallback = completeResult.usedFallback;
        state = completeState;
      }
    }

    if (!markdown) {
      const fallbackState = createSerializationState(thinkingElements, true);
      const fallbackResult = await serializeFallbackMessageContent(node, parts, fallbackState, serializationAttempts);
      markdown = fallbackResult.markdown;
      usedWholeNodeFallback = fallbackResult.usedFallback;
      state = fallbackState;
    }

    const previousSkipElements = state.skipElements;
    let thinkingMarkdown = "";

    try {
      state.skipElements = new WeakSet();
      thinkingMarkdown = cleanMarkdown((await Promise.all(
        thinkingElements.map((element) => serializeNode(element, state))
      )).join("\n\n"));
    } finally {
      state.skipElements = previousSkipElements;
    }

    markdown = dedupeMarkdownImageReferences(markdown);
    thinkingMarkdown = dedupeMarkdownImageReferences(thinkingMarkdown);
    const serializedImageCount = countMarkdownImages(`${markdown}\n${thinkingMarkdown}`);

    return {
      role,
      sourceNode: node,
      sourceTurnId: getTurnId(node),
      sourceTurnContainer: node.getAttribute("data-turn-id-container") || node.getAttribute("data-turn-container") || "",
      sourceTestId: node.getAttribute("data-testid") || "",
      sourceMessageId: getMessageIdFromNode(node),
      sourceMessageIds: getChatGptMessageUnitInfo(node)?.messageIds || [],
      order: getOrderHint(node, order),
      timestamp: parts.timestamp || "",
      markdown,
      thinkingMarkdown,
      usedWholeNodeFallback,
      serializationAttempts,
      codeBlockCount: state.codeBlockCount,
      fileCount: state.fileCount,
      imageCount: serializedImageCount,
      imagesEmbedded: Math.min(serializedImageCount, state.imagesEmbedded),
      imagesDeferred: Math.min(serializedImageCount, state.imagesDeferred),
      imagesFailed: Math.max(0, state.imagesFailed),
      imageEvents: state.imageEvents
    };
  }

  function createSerializationState(thinkingElements = [], includeHidden = false) {
    return {
      codeBlockCount: 0,
      fileCount: 0,
      imageCount: 0,
      imagesEmbedded: 0,
      imagesDeferred: 0,
      imagesFailed: 0,
      imageEvents: [],
      includeHidden,
      skipElements: new WeakSet(thinkingElements)
    };
  }

  function shouldRunCompletenessPass(node, body, role, markdown) {
    if (role !== "assistant") {
      return false;
    }

    return Boolean(
      isLastTurnNode(node)
      || node.querySelector?.("[data-is-last-node], [data-is-only-node], [data-end], [data-start]")
      || body?.querySelector?.("[data-is-last-node], [data-is-only-node], [data-end], [data-start]")
      || markdown.length > 1200
    );
  }

  function isMoreCompleteMarkdown(candidate, current) {
    const next = cleanMarkdown(candidate);
    const previous = cleanMarkdown(current);

    if (!next) {
      return false;
    }

    if (!previous) {
      return true;
    }

    return next.length > previous.length + Math.max(180, Math.floor(previous.length * 0.18));
  }

  async function serializeCompleteMessageContent(node, parts, state, attempts = []) {
    const body = parts.body || node;
    const candidates = getCompleteContentCandidates(node, body);
    const serializedPieces = [];

    for (const candidate of candidates) {
      const markdown = cleanMarkdown(await serializeNode(candidate, state));

      attempts.push({
        stage: "complete-candidate",
        length: markdown.length,
        node: summarizeNode(candidate),
        hint: getSerializationHint(candidate)
      });

      if (markdown) {
        serializedPieces.push(markdown);
      }
    }

    const aggregate = cleanMarkdown(serializedPieces.join("\n\n"));
    attempts.push({
      stage: "complete-aggregate",
      length: aggregate.length,
      candidateCount: candidates.length,
      node: summarizeNode(node),
      hint: getSerializationHint(node)
    });

    if (aggregate) {
      return {
        markdown: aggregate,
        usedFallback: candidates.some((candidate) => candidate !== body)
      };
    }

    const wholeTurn = cleanMarkdown(await serializeNodeChildren(node, state));
    attempts.push({
      stage: "complete-whole-turn",
      length: wholeTurn.length,
      node: summarizeNode(node),
      hint: getSerializationHint(node)
    });

    return {
      markdown: wholeTurn,
      usedFallback: true
    };
  }

  function getCompleteContentCandidates(node, body) {
    const richSelector = "div.markdown.prose, .markdown.prose, .markdown, [class*='markdown'], [class*='prose']";
    const richCandidates = uniqueTopLevelElements([
      body?.matches?.(richSelector) ? body : null,
      ...node.querySelectorAll(richSelector)
    ]).filter((candidate) => isSerializableContentCandidate(candidate, node));

    if (richCandidates.length) {
      return richCandidates;
    }

    const selectors = [
      "[data-start]",
      "[data-end]",
      "[data-is-last-node]",
      "[data-is-only-node]",
      "[data-is-streaming]",
      "[class*='result-streaming']",
      "blockquote",
      "ul",
      "ol",
      "table",
      "pre"
    ].join(", ");
    const rawCandidates = uniqueElements([
      body,
      ...node.querySelectorAll(selectors)
    ]).filter((candidate) => isSerializableContentCandidate(candidate, node));

    const topLevel = uniqueTopLevelElements(rawCandidates);

    if (topLevel.length === 1 && topLevel[0] === body && body !== node && isLastTurnNode(node)) {
      return uniqueTopLevelElements([body, ...node.querySelectorAll("[data-start], [data-end], [data-is-last-node], [data-is-only-node]")]);
    }

    return topLevel.length ? topLevel : [body || node];
  }

  function isSerializableContentCandidate(candidate, scope) {
    return Boolean(
      candidate
      && scope?.contains?.(candidate)
      && hasMessageContent(candidate)
      && !isNonMessageNode(candidate)
      && !candidate.closest("nav, aside, header, footer, [role='menu'], [role='menuitem']")
    );
  }

  async function serializeFallbackMessageContent(node, parts, state, attempts = []) {
    const previousIncludeHidden = state.includeHidden;
    state.includeHidden = true;
    const candidates = uniqueElements([
      ...findStructuredContentCandidates(node),
      ...findAssistantBodyCandidates(node, parts.body || node),
      ...getExpandableContentButtons(node),
      parts.body,
      node
    ]).filter((candidate) => candidate && hasMessageContent(candidate) && !isNonMessageNode(candidate));

    try {
      for (const candidate of candidates) {
        const markdown = cleanMarkdown(await serializeNodeChildren(candidate, state));
        attempts.push({
          stage: "fallback-candidate",
          length: markdown.length,
          node: summarizeNode(candidate),
          hint: getSerializationHint(candidate)
        });

        if (markdown) {
          return {
            markdown,
            usedFallback: candidate !== parts.body
          };
        }
      }

      const rawText = cleanMarkdown(getRawElementText(node));
      attempts.push({
        stage: "raw-text",
        length: rawText.length,
        node: summarizeNode(node)
      });

      if (rawText && !NON_MESSAGE_TEXT_RE.test(rawText)) {
        return {
          markdown: rawText,
          usedFallback: true
        };
      }

      return {
        markdown: "",
        usedFallback: false
      };
    } finally {
      state.includeHidden = previousIncludeHidden;
    }
  }

  function findStructuredContentCandidates(node) {
    if (!node?.querySelectorAll) {
      return [];
    }

    return [...node.querySelectorAll("div.markdown.prose, .markdown.prose, [data-start], [data-end], [data-is-last-node], [data-is-only-node], blockquote, ul, ol, table")]
      .filter((candidate) => !candidate.closest("nav, aside, header, footer"));
  }

  async function serializeNodeChildren(element, state) {
    const parts = [];

    for (const child of element.childNodes) {
      parts.push(await serializeNode(child, state));
    }

    return parts.join("");
  }

  function getCssInlineMarkdownFormat(element) {
    if (!isInlineMarkdownFormattingElement(element)) {
      return null;
    }

    const className = ` ${String(element.getAttribute("class") || "")} `;
    const styleAttr = String(element.getAttribute("style") || "");
    let bold = hasChatGptDilStrongMarker(element)
      || /\sfont-(?:semibold|bold|extrabold|black)\s/.test(className)
      || /font-\[(?:[6-9]\d{2}|[1-9]\d{3})\]/.test(className)
      || /font-weight\s*:\s*(?:bold|bolder|[6-9]\d{2}|[1-9]\d{3})/i.test(styleAttr);
    let italic = /\sitalic\s/.test(className) || /font-style\s*:\s*(?:italic|oblique)/i.test(styleAttr);

    if (!bold || !italic) {
      const computed = getElementComputedStyle(element);
      const parentComputed = getElementComputedStyle(element.parentElement);

      if (!bold && computed) {
        const weight = parseFontWeight(computed.fontWeight);
        const parentWeight = parseFontWeight(parentComputed?.fontWeight);
        bold = weight >= 600 && weight > Math.max(500, parentWeight || 0);
      }

      if (!italic && computed) {
        italic = /italic|oblique/i.test(computed.fontStyle || "") && !/italic|oblique/i.test(parentComputed?.fontStyle || "");
      }
    }

    return bold || italic ? { bold, italic } : null;
  }

  function isInlineMarkdownFormattingElement(element) {
    const tag = element?.tagName?.toLowerCase?.() || "";

    if (!["span", "mark", "small"].includes(tag)) {
      return false;
    }

    return !element.querySelector?.("p, ul, ol, blockquote, table, pre, h1, h2, h3, h4, h5, h6, div, section, article");
  }

  function getElementComputedStyle(element) {
    if (!element || !window.getComputedStyle) {
      return null;
    }

    try {
      return window.getComputedStyle(element);
    } catch {
      return null;
    }
  }

  function parseFontWeight(weight) {
    const value = String(weight || "").trim().toLowerCase();

    if (value === "bold" || value === "bolder") {
      return 700;
    }

    if (value === "normal" || value === "lighter") {
      return 400;
    }

    const numeric = Number.parseInt(value, 10);
    return Number.isFinite(numeric) ? numeric : 400;
  }

  function wrapSerializedInlineMarkdown(text, format) {
    let value = cleanMarkdown(text);

    if (!value) {
      return "";
    }

    if (format.italic && !isWrappedWithMarkdown(value, "_") && !isWrappedWithMarkdown(value, "*")) {
      value = `_${value}_`;
    }

    if (format.bold && !isWrappedWithMarkdown(value, "**") && !isWrappedWithMarkdown(value, "__")) {
      value = `**${value}**`;
    }

    return value;
  }

  function isWrappedWithMarkdown(text, marker) {
    return String(text || "").startsWith(marker) && String(text || "").endsWith(marker);
  }

  async function serializeNode(node, state) {
    if (node.nodeType === Node.TEXT_NODE) {
      return normalizeTextNode(node.nodeValue || "", node.parentElement);
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const element = node;
    const tag = element.tagName.toLowerCase();

    // Citation chips use role="button", which the generic skip rules drop.
    if (isChatGptDilCitationChip(element) && !state?.skipElements?.has(element)) {
      return formatChatGptDilCitationChip(element);
    }

    if (shouldSkipElement(element, state)) {
      return "";
    }

    if (tag === "br") {
      return "\n";
    }

    if (tag === "pre") {
      // Code blocks are serialized directly so syntax fences and language hints
      // survive even if surrounding toolbar markup changes.
      state.codeBlockCount += 1;
      return `\n\n${formatCodeBlock(element)}\n\n`;
    }

    if (isLikelyFileAttachmentElement(element)) {
      const fileMarkdown = formatFileAttachmentMarkdown(element);
      if (fileMarkdown) {
        state.fileCount += 1;
      }
      return fileMarkdown ? `\n\n${fileMarkdown}\n\n` : "";
    }

    if (isChatGptDilDivider(element)) {
      return "\n\n---\n\n";
    }

    if (isChatGptWritingBlockElement(element)) {
      const block = formatChatGptWritingBlock(element);
      return block ? `\n\n${block}\n\n` : "";
    }

    if (hasChatGptRangeMarker(element) && !isSemanticMarkdownElementTag(tag)) {
      const text = cleanMarkdown(await serializeNodeChildren(element, state));
      return text ? `\n\n${text}\n\n` : "";
    }

    if (tag === "img") {
      if (isLikelyDecorativeImage(element)) {
        return "";
      }

      state.imageCount += 1;
      const imageMarkdown = await imageElementToMarkdown(element, state);
      return imageMarkdown ? `\n\n${imageMarkdown}\n\n` : "";
    }

    if (tag === "canvas") {
      const imageMarkdown = canvasElementToMarkdown(element, state);
      return imageMarkdown ? `\n\n${imageMarkdown}\n\n` : "";
    }

    if (tag === "code" && element.closest("pre") === null && isStandaloneCodeBlock(element)) {
      state.codeBlockCount += 1;
      return `\n\n${formatCodeBlockFromElement(element)}\n\n`;
    }

    if (tag === "code" && element.closest("pre") === null) {
      return formatInlineCode(element.textContent || "");
    }

    if (tag === "strong" || tag === "b") {
      const text = cleanMarkdown(await serializeNodeChildren(element, state));
      return text ? `**${text}**` : "";
    }

    if (tag === "em" || tag === "i") {
      const text = cleanMarkdown(await serializeNodeChildren(element, state));
      return text ? `_${text}_` : "";
    }

    if (tag === "s" || tag === "del") {
      const text = cleanMarkdown(await serializeNodeChildren(element, state));
      return text ? `~~${text}~~` : "";
    }

    const cssInlineFormat = getCssInlineMarkdownFormat(element);

    if (cssInlineFormat) {
      const text = cleanMarkdown(await serializeNodeChildren(element, state));
      return text ? wrapSerializedInlineMarkdown(text, cssInlineFormat) : "";
    }

    if (tag === "hr") {
      return "\n\n---\n\n";
    }

    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag.slice(1));
      const text = cleanMarkdown(await serializeNodeChildren(element, state));
      return text ? `\n\n${"#".repeat(level)} ${text}\n\n` : "";
    }

    if (tag === "p") {
      const text = cleanMarkdown(await serializeNodeChildren(element, state));
      return text ? `\n\n${text}\n\n` : "";
    }

    if (tag === "ul") {
      return `\n${await serializeList(element, state, false)}\n`;
    }

    if (tag === "ol") {
      return `\n${await serializeList(element, state, true)}\n`;
    }

    if (tag === "blockquote") {
      const quote = cleanMarkdown(await serializeNodeChildren(element, state));
      return quote ? `\n\n${quote.split("\n").map((line) => `> ${line}`).join("\n")}\n\n` : "";
    }

    if (tag === "table") {
      const table = await serializeTable(element, state);
      return table ? `\n\n${table}\n\n` : "";
    }

    if (tag === "a") {
      const href = element.href;
      const rawLabel = cleanMarkdown(await serializeNodeChildren(element, state)) || href;
      const label = cleanPdfLinkLabel(rawLabel, href);

      if (!href || href === label || href.startsWith("javascript:")) {
        return label;
      }

      return `[${escapeMarkdownLinkLabel(label)}](${href})`;
    }

    const serialized = await serializeNodeChildren(element, state);

    if (isBlockElement(tag)) {
      const text = cleanMarkdown(serialized);
      return text ? `\n\n${text}\n\n` : "";
    }

    return serialized;
  }

  function hasChatGptRangeMarker(element) {
    return Boolean(
      element?.hasAttribute?.("data-start")
      || element?.hasAttribute?.("data-end")
      || element?.hasAttribute?.("data-is-last-node")
      || element?.hasAttribute?.("data-is-only-node")
    );
  }

  function isSemanticMarkdownElementTag(tag) {
    return /^h[1-6]$/.test(tag)
      || [
        "p",
        "pre",
        "code",
        "strong",
        "b",
        "em",
        "i",
        "s",
        "del",
        "hr",
        "ul",
        "ol",
        "blockquote",
        "table",
        "a",
        "img",
        "canvas"
      ].includes(tag);
  }

  function shouldSkipElement(element, state) {
    const tag = element.tagName.toLowerCase();

    if (state?.skipElements?.has(element)) {
      return true;
    }

    if (["script", "style", "noscript", "template", "svg"].includes(tag)) {
      return true;
    }

    if (isChatGptCopyExcludedElement(element)) {
      return true;
    }

    if (tag === "button" && !isExpandableContentButton(element) && !hasUsefulImageContent(element) && !hasUsefulFileContent(element)) {
      return true;
    }

    if (!state?.includeHidden && (element.getAttribute("aria-hidden") === "true" || element.hidden)) {
      return true;
    }

    if (element.matches(".sr-only, [data-testid*='copy'], [data-testid*='feedback'], [data-testid*='share'], [data-testid*='toolbar'], [data-testid*='actions']")) {
      return true;
    }

    if (element.matches("[role='button']") && !isExpandableContentButton(element) && !hasUsefulImageContent(element) && !hasUsefulFileContent(element)) {
      return true;
    }

    if (element.matches("[role='menu'], [role='menuitem'], [role='tooltip'], [role='dialog']")) {
      return true;
    }

    if (element.matches("[aria-label*='Copy' i], [aria-label*='Read aloud' i], [aria-label*='Good response' i], [aria-label*='Bad response' i], [aria-label*='Share' i]")) {
      return true;
    }

    return isLikelyCodeToolbar(element);
  }

  function isLikelyCodeToolbar(element) {
    if (element.querySelector("pre") || !element.parentElement?.querySelector("pre")) {
      return false;
    }

    const previousOrNextIsPre = element.previousElementSibling?.matches("pre") || element.nextElementSibling?.matches("pre");

    if (!previousOrNextIsPre) {
      return false;
    }

    const text = getElementText(element).toLowerCase().replace(/\s+/g, " ").trim();

    if (!text || text.length > 80) {
      return false;
    }

    const words = text.split(" ").filter(Boolean);
    return words.every((word) => word === "copy" || word === "code" || KNOWN_LANGUAGES.has(word));
  }

  function hasUsefulImageContent(element) {
    const image = element.querySelector?.("img");

    if (!image) {
      return false;
    }

    if (isLikelyImageAttachmentButton(element)) {
      return true;
    }

    const width = getMediaWidth(image);
    const height = getMediaHeight(image);
    return width >= 80 && height >= 80;
  }

  function isLikelyImageAttachmentButton(element) {
    const label = [
      element.getAttribute?.("aria-label") || "",
      element.getAttribute?.("title") || "",
      element.getAttribute?.("class") || "",
      element.querySelector?.("img")?.getAttribute("alt") || ""
    ].join(" ").toLowerCase();

    return /open image|image|picture|photo|attachment|\u6253\u5f00\u56fe\u7247|\u56fe\u7247|\u9644\u4ef6/.test(label);
  }

  function hasUsefulFileContent(element) {
    return Boolean(isLikelyFileAttachmentElement(element));
  }

  function isLikelyFileAttachmentElement(element) {
    if (!element?.matches) {
      return false;
    }

    if (element.closest?.("[data-testid*='copy' i], [data-testid*='toolbar' i], [data-testid*='actions' i]")) {
      return false;
    }

    const text = getElementText(element);
    const href = getAttachmentHref(element);

    if (isChatGptDilWebLink(element, href)) {
      return false;
    }

    const signal = [
      text,
      href,
      element.getAttribute("download") || "",
      element.getAttribute("aria-label") || "",
      element.getAttribute("title") || "",
      element.getAttribute("class") || "",
      element.querySelector?.("[download]")?.getAttribute("download") || ""
    ].join(" ");
    const attachmentName = extractFileName(signal);

    if (!FILE_ATTACHMENT_RE.test(signal)) {
      return false;
    }

    if (!attachmentName) {
      return false;
    }

    const hasAttachmentControl = element.matches("a, button, [role='button'], [download]")
      || Boolean(element.querySelector?.("a, button, [role='button'], [download]"));

    return hasAttachmentControl && isCompactFileAttachmentElement(element, attachmentName);
  }

  function isCompactFileAttachmentElement(element, attachmentName) {
    if (!element?.matches) {
      return false;
    }

    if (isTurnNode(element) || hasRoleOrMessageIdSignal(element)) {
      return false;
    }

    if (element.querySelector?.(".markdown, [class*='markdown'], [class*='prose'], [data-start], [data-end], [data-is-last-node], [data-is-only-node], p, li, blockquote, pre, table")) {
      return false;
    }

    const text = getElementText(element);
    const compactRemainder = text
      .replace(attachmentName, "")
      .replace(FILE_ATTACHMENT_RE, "")
      .replace(/\b(open|download|attachment|attached|uploaded|preview)\b/gi, "")
      .replace(/\u6253\u5f00|\u4e0b\u8f7d|\u9644\u4ef6|\u6587\u4ef6|\u9884\u89c8/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (compactRemainder.length > 36) {
      return false;
    }

    const rect = element.getBoundingClientRect?.();

    if (rect && rect.width && rect.height && (rect.height > 160 || rect.width > 520)) {
      return false;
    }

    return true;
  }

  function formatFileAttachmentMarkdown(element) {
    const href = getAttachmentHref(element);
    const name = sanitizeFileAttachmentName(getAttachmentName(element, href));

    if (!name) {
      return "";
    }

    return `[File: ${escapeMarkdownLinkLabel(name)}]`;
  }

  function getAttachmentHref(element) {
    return element.href
      || element.getAttribute?.("href")
      || element.querySelector?.("a[href]")?.href
      || element.querySelector?.("[href]")?.getAttribute("href")
      || "";
  }

  function getAttachmentName(element, href = "") {
    const download = element.getAttribute?.("download") || element.querySelector?.("[download]")?.getAttribute("download") || "";
    const text = getElementText(element);
    const label = element.getAttribute?.("aria-label") || element.getAttribute?.("title") || "";
    const candidates = [download, text, label, filenameFromUrl(href)];

    for (const candidate of candidates) {
      const name = extractFileName(candidate);

      if (name) {
        return name;
      }
    }

    return "";
  }

  function filenameFromUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      return decodeURIComponent(parsed.pathname.split("/").pop() || "");
    } catch {
      return "";
    }
  }

  function extractFileName(text) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    const match = value.match(FILE_NAME_RE);
    return match?.[0] || "";
  }

  function sanitizeFileAttachmentName(name) {
    return String(name || "").replace(/\s+/g, " ").trim().slice(0, 160);
  }

  async function serializeList(listElement, state, ordered) {
    const items = [...listElement.children].filter((child) => child.tagName?.toLowerCase() === "li");
    let number = Number(listElement.getAttribute("start") || 1);
    const lines = [];

    for (const item of items) {
      const text = cleanMarkdown(await serializeNodeChildren(item, state));

      if (!text) {
        continue;
      }

      const prefix = ordered ? `${number}. ` : "- ";
      lines.push(`${prefix}${text.replace(/\n/g, "\n  ")}`);
      number += 1;
    }

    return lines.join("\n");
  }

  async function serializeTable(table, state) {
    const rows = [];

    for (const row of table.querySelectorAll("tr")) {
      const cells = [];

      for (const cell of row.querySelectorAll("th,td")) {
        const markdown = cleanMarkdown(await serializeNodeChildren(cell, state));
        cells.push(escapeTableCell(markdown || getElementText(cell)));
      }

      if (cells.length > 0) {
        rows.push(cells);
      }
    }

    if (!rows.length) {
      return "";
    }

    const columnCount = Math.max(...rows.map((row) => row.length));
    const normalizedRows = rows.map((row) => padRow(row, columnCount));
    const [header, ...bodyRows] = normalizedRows;
    const separator = Array.from({ length: columnCount }, () => "---");

    return [
      markdownTableRow(header),
      markdownTableRow(separator),
      ...bodyRows.map(markdownTableRow)
    ].join("\n");
  }

  async function imageElementToMarkdown(image, state) {
    const src = image.currentSrc || image.src || image.getAttribute("src") || "";
    const alt = sanitizeAltText(image.alt || image.getAttribute("aria-label") || `image-${state.imageCount}`);

    if (!src) {
      state.imagesFailed += 1;
      state.imageEvents?.push({
        type: "img",
        src: "",
        ok: false,
        reason: "image source is missing"
      });
      return "";
    }

    state.imagesDeferred += 1;
    state.imageEvents?.push({
      type: "img",
      src,
      ok: true,
      skipped: true,
      deferred: true,
      reason: "base64 embedding deferred until export"
    });
    return `![${escapeMarkdownLinkLabel(alt)}](${src})\n\n<!-- Image base64 embedding is deferred until export to avoid page side effects. -->`;
  }

  function canvasElementToMarkdown(canvas, state) {
    const width = canvas.width || canvas.clientWidth;
    const height = canvas.height || canvas.clientHeight;

    if (!width || !height || isLikelyDecorativeMedia(canvas)) {
      return "";
    }

    try {
      state.imageCount += 1;
      state.imagesEmbedded += 1;
      state.imageEvents?.push({
        type: "canvas",
        ok: true
      });
      return `![canvas-${state.imageCount}](${canvas.toDataURL("image/png")})`;
    } catch (error) {
      state.imagesFailed += 1;
      state.imageEvents?.push({
        type: "canvas",
        ok: false,
        error: error.message || String(error)
      });
      return `<!-- Canvas could not be converted to base64: ${escapeHtmlComment(error.message || String(error))} -->`;
    }
  }

  function isLikelyDecorativeImage(image) {
    const imageButton = image.closest("button, [role='button']");
    const src = image.currentSrc || image.src || image.getAttribute("src") || "";

    if (isFaviconImageUrl(src)) {
      return true;
    }

    if (imageButton && isLikelyImageAttachmentButton(imageButton)) {
      return false;
    }

    if (image.closest("button, [role='button'], [role='menuitem'], [data-testid*='avatar' i], [class*='avatar' i]")) {
      return true;
    }

    return isLikelyDecorativeMedia(image);
  }

  function isFaviconImageUrl(url) {
    return /(?:google\.com\/s2\/favicons|favicon)/i.test(String(url || ""));
  }

  function isLikelyDecorativeMedia(element) {
    const width = getMediaWidth(element);
    const height = getMediaHeight(element);
    const alt = "alt" in element ? String(element.alt || "").trim() : "";

    if (alt === "" && width && height && width <= 48 && height <= 48) {
      return true;
    }

    return width && height && width <= 24 && height <= 24;
  }

  function getMediaWidth(element) {
    return Number(element.getAttribute?.("width")) || element.naturalWidth || element.width || element.clientWidth || 0;
  }

  function getMediaHeight(element) {
    return Number(element.getAttribute?.("height")) || element.naturalHeight || element.height || element.clientHeight || 0;
  }

  function formatCodeBlock(pre) {
    const code = trimTrailingNewlines(extractCodeText(pre));
    const language = detectCodeLanguage(pre);
    const fence = makeFence(code);
    return `${fence}${language}\n${code}\n${fence}`;
  }

  function formatCodeBlockFromElement(codeElement) {
    const code = trimTrailingNewlines(extractCodeText(codeElement));
    const language = detectCodeLanguage(codeElement);
    const fence = makeFence(code);
    return `${fence}${language}\n${code}\n${fence}`;
  }

  function extractCodeText(pre) {
    const codeElement = pre.matches?.("code") ? pre : pre.querySelector("code");

    if (codeElement) {
      return normalizeExtractedCodeText(codeElement.innerText || codeElement.textContent || "");
    }

    const clone = pre.cloneNode(true);

    for (const element of clone.querySelectorAll("button, [role='button'], [data-testid*='copy' i], [data-testid*='toolbar' i]")) {
      element.remove();
    }

    return normalizeExtractedCodeText(pre.innerText || clone.textContent || "");
  }

  function normalizeExtractedCodeText(text) {
    return String(text || "")
      .replace(/\r\n?/g, "\n")
      .replace(/\u00a0/g, " ");
  }

  function detectCodeLanguage(pre) {
    const code = pre.matches("code") ? pre : pre.querySelector("code");
    const candidates = [
      code?.getAttribute("data-language"),
      code?.getAttribute("data-highlight-language"),
      code?.getAttribute("data-code-language"),
      pre.getAttribute("data-language"),
      pre.getAttribute("data-highlight-language"),
      pre.getAttribute("data-code-language"),
      getLanguageFromClass(code?.className || ""),
      getLanguageFromClass(pre.className || ""),
      getLanguageFromClass(pre.parentElement?.className || ""),
      getLanguageFromNearbyText(pre)
    ];

    for (const candidate of candidates) {
      const language = normalizeLanguage(candidate);

      if (language) {
        return language;
      }
    }

    return "";
  }

  function getLanguageFromClass(className) {
    const match = String(className).match(/(?:^|\s)(?:language|lang)-([a-z0-9_+#.-]+)/i);
    return match?.[1] || "";
  }

  function getLanguageFromNearbyText(pre) {
    const nearbyText = [
      pre.previousElementSibling?.textContent || "",
      pre.parentElement?.firstElementChild?.textContent || ""
    ].join(" ").toLowerCase();

    for (const language of KNOWN_LANGUAGES) {
      if (new RegExp(`\\b${escapeRegExp(language)}\\b`, "i").test(nearbyText)) {
        return language;
      }
    }

    return "";
  }

  function normalizeLanguage(language) {
    const normalized = String(language || "")
      .trim()
      .toLowerCase()
      .replace(/^language-/, "")
      .replace(/^lang-/, "")
      .replace(/^brush:/, "")
      .replace(/[^a-z0-9_+#.-]/g, "");

    if (!normalized || normalized.length > 30) {
      return "";
    }

    return LANGUAGE_ALIASES.get(normalized) || normalized;
  }

  function isStandaloneCodeBlock(element) {
    const text = element.textContent || "";

    return text.includes("\n") || element.matches("[class*='hljs'], [class*='language-'], [class*='lang-']");
  }

  function formatInlineCode(text) {
    const trimmed = text.trim();

    if (!trimmed) {
      return "";
    }

    const fence = trimmed.includes("`") ? "``" : "`";
    return `${fence}${trimmed}${fence}`;
  }

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
})();
