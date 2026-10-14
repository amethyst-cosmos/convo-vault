(() => {
  const EXPORTER_VERSION = "0.9.1";
  const IS_EXTENSION_ENV = typeof chrome !== "undefined" && Boolean(chrome?.runtime?.id);
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
  const CONVERSATION_TIMESTAMP_FETCH_TIMEOUT_MS = 3500;
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
  const ADVANCED_PDF_IMAGE_EMBED_LIMIT = 160;
  const ADVANCED_PDF_IMAGE_EMBED_CONCURRENCY = 4;
  const BUNDLE_IMAGE_DOWNLOAD_CONCURRENCY = 12;
  const BUNDLE_IMAGE_DOWNLOAD_TIMEOUT_MS = 20_000;
  const SETTINGS_STORAGE_KEY = "convoVaultSettings";
  const DEFAULT_EXPORTER_SETTINGS = {
    port: 38474,
    backendToken: ""
  };
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
  const USER_SIGNAL_RE = /\b(user|human|prompt|question|whitespace-pre-wrap)\b/i;
  const FILE_NAME_RE = /[^\\/:*?"<>|\n\r]{1,140}\.(?:pdf|docx?|xlsx?|pptx?|csv|tsv|txt|md|json|zip|rar|7z|mov|mp4|mp3|wav)/i;
  const FILE_ATTACHMENT_RE = /\b(file|attachment|download|uploaded|pdf|docx?|xlsx?|pptx?|csv|tsv|txt|md|json|zip|rar|7z|mov|mp4|mp3|wav|document)\b|\u6587\u4ef6|\u9644\u4ef6|\u4e0b\u8f7d|\u6587\u6863/i;
  const IMAGE_DATA_URI_CACHE = new Map();
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
    if (message?.type === "OPEN_CHATGPT_EXPORT_SELECTOR") {
      openMessageSelectorPanel()
        .then((result) => sendResponse(result))
        .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));

      return true;
    }

    if (message?.type !== "EXPORT_CHATGPT_CONVERSATION") {
      return false;
    }

    exportConversation()
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
    build: buildMarkdown,
    download: downloadMarkdown,
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

  async function exportConversation() {
    const result = await messageExtractor.collect();
    const messages = result.messages || result;

    if (!messages.length) {
      throw new Error("No conversation messages were found on this page.");
    }

    if (!result.completeness?.complete) {
      throw new Error(formatCaptureCompletenessError(result.completeness));
    }

    return exportSelectedMessages(messages, {
      captureMode: result.captureMode,
      completeness: result.completeness,
      debugLog: result.debugLog || null
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

  async function exportSelectedMessages(messages, options = {}) {
    if (!messages.length) {
      throw new Error("Select at least one message to export.");
    }

    if (options.completeness && !options.completeness.complete && !options.allowIncomplete) {
      throw new Error(formatCaptureCompletenessError(options.completeness));
    }

    const exportedAt = new Date();
    const metadata = markdownBuilder.metadata(messages, exportedAt);
    const requestedFormat = options.format;
    const format = requestedFormat === "bundle"
      ? "bundle"
      : requestedFormat === "pdf"
      ? "advanced-pdf"
      : requestedFormat === "advanced-pdf" || requestedFormat === "advanced-markdown"
        ? requestedFormat
        : "markdown";
    let filename = "";

    if (format === "bundle") {
      const bundleResult = await downloadExportBundle(metadata, messages, exportedAt, {
        captureMode: options.captureMode,
        debugLog: options.debugLog,
        onProgress: options.onProgress
      });
      filename = bundleResult.filename;

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
        format,
        filename,
        messageCount: messages.length,
        imagesEmbedded: bundleResult.imagesEmbedded || 0,
        imagesFailed: bundleResult.imagesFailed || 0,
        assetCount: bundleResult.assetCount || 0,
        bundleFiles: bundleResult.bundleFiles || ""
      };
    }

    if (format === "advanced-markdown") {
      const markdownResult = await downloadAdvancedMarkdown(metadata, messages, exportedAt);
      filename = markdownResult.filename;

      if (options.debugLog) {
        options.debugLog.event?.("advancedMarkdown.generated", {
          engine: markdownResult.markdownEngine,
          filename,
          rendererUrl: markdownResult.rendererUrl,
          exporterVersion: EXPORTER_VERSION,
          captureWarning: markdownResult.captureWarning || ""
        });
        downloadDebugLog(options.debugLog, filename.replace(/\.md$/i, "-debug.json"));
      }

      return {
        ok: true,
        format,
        filename,
        messageCount: messages.length,
        imagesEmbedded: messages.reduce((total, message) => total + message.imagesEmbedded, 0),
        imagesFailed: messages.reduce((total, message) => total + message.imagesFailed, 0),
        markdownEngine: markdownResult.markdownEngine,
        captureWarning: markdownResult.captureWarning || ""
      };
    }

    if (format === "advanced-pdf") {
      const pdfResult = await downloadAdvancedPdf(metadata, messages, exportedAt);
      filename = pdfResult.filename;

      if (options.debugLog) {
        options.debugLog.event?.("advancedPdf.generated", {
          engine: pdfResult.pdfEngine,
          filename,
          rendererUrl: pdfResult.rendererUrl,
          exporterVersion: EXPORTER_VERSION,
          dataDir: pdfResult.dataDir || "",
          dataFiles: pdfResult.dataFiles || "",
          captureWarning: pdfResult.captureWarning || ""
        });
        downloadDebugLog(options.debugLog, filename.replace(/\.pdf$/i, "-debug.json"));
      }

      return {
        ok: true,
        format,
        filename,
        messageCount: messages.length,
        pageCount: pdfResult.pageCount,
        pdfEngine: pdfResult.pdfEngine,
        imagesEmbedded: pdfResult.imagesEmbedded || 0,
        imagesFailed: pdfResult.imagesFailed || 0,
        imageLinks: messages.reduce((total, message) => total + (message.imageCount || 0), 0),
        dataDir: pdfResult.dataDir || "",
        dataFiles: pdfResult.dataFiles || "",
        captureWarning: pdfResult.captureWarning || ""
      };
    }

    const markdown = markdownBuilder.build(metadata, messages);
    filename = markdownBuilder.filename(metadata.title, exportedAt, "md");
    markdownBuilder.download(filename, markdown);

    if (options.debugLog) {
      downloadDebugLog(options.debugLog, filename.replace(/\.md$/i, "-debug.json"));
    }

    return {
      ok: true,
      format,
      filename,
      messageCount: messages.length,
      imagesEmbedded: messages.reduce((total, message) => total + message.imagesEmbedded, 0),
      imagesFailed: messages.reduce((total, message) => total + message.imagesFailed, 0)
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

    if (options.embedImages) {
      const embedStartedAt = Date.now();
      const imageReferenceCount = countPortableMarkdownImages(portableMessages);
      options.debugLog?.event?.("assetEmbed.start", {
        captureMode,
        imageReferenceCount,
        concurrency: ADVANCED_PDF_IMAGE_EMBED_CONCURRENCY,
        limit: ADVANCED_PDF_IMAGE_EMBED_LIMIT
      });
      await embedImagesForPortableMessages(portableMessages, assetStats, {
        captureMode,
        debugLog: options.debugLog
      });
      portableMessages.forEach((message) => refreshPortableMessageImageStats(message, {
        embedAttempted: true
      }));
      options.debugLog?.event?.("assetEmbed.done", {
        captureMode,
        imageReferenceCount,
        durationMs: Date.now() - embedStartedAt,
        ...assetStats
      });
    }

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

  async function getExporterSettings() {
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      return Promise.resolve({ ...DEFAULT_EXPORTER_SETTINGS });
    }

    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([SETTINGS_STORAGE_KEY], (result) => {
          if (chrome.runtime?.lastError) {
            resolve({ ...DEFAULT_EXPORTER_SETTINGS });
            return;
          }
          resolve(normalizeExporterSettings(result?.[SETTINGS_STORAGE_KEY]));
        });
      } catch (_) {
        resolve({ ...DEFAULT_EXPORTER_SETTINGS });
      }
    });
  }

  function normalizeExporterSettings(settings = {}) {
    return {
      port: DEFAULT_EXPORTER_SETTINGS.port,
      backendToken: String(settings.backendToken || "").trim()
    };
  }

  function getAdvancedPdfRendererUrl(settings = DEFAULT_EXPORTER_SETTINGS) {
    return settings.port === DEFAULT_EXPORTER_SETTINGS.port
      ? DEFAULT_ADVANCED_PDF_RENDERER_URL
      : `http://127.0.0.1:${settings.port}`;
  }

  function getLocalApiHeaders(settings = DEFAULT_EXPORTER_SETTINGS) {
    return settings.backendToken
      ? { "X-Convo-Vault-Token": settings.backendToken }
      : {};
  }

  async function downloadExportBundle(metadata, messages, exportedAt = new Date(), options = {}) {
    const defaultFileName = markdownBuilder.filename(metadata.title, exportedAt, "zip");
    const payload = await createStructuredExportPayload(messages, exportedAt, {
      embedImages: false,
      captureMode: options.captureMode,
      debugLog: options.debugLog
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
    ]).filter((source) => getChatGptFileImageId(source)));
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
          const blob = await fetchChatGptFileImage(getChatGptFileImageId(source), { accessToken, conversationId });
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

  async function downloadAdvancedMarkdown(metadata, messages, exportedAt = new Date()) {
    const defaultFileName = markdownBuilder.filename(metadata.title, exportedAt, "md");
    const payload = await createStructuredExportPayload(messages, exportedAt);

    const rendererSettings = await getExporterSettings();
    const rendererUrl = getAdvancedPdfRendererUrl(rendererSettings);
    let response;
    try {
      response = await fetch(`${rendererUrl}/render-markdown`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getLocalApiHeaders(rendererSettings)
        },
        body: JSON.stringify({
          exportPayload: payload,
          fileName: defaultFileName
        })
      });
    } catch (error) {
      throw new Error(`Local renderer is not running at ${rendererUrl}. Details: ${error.message || error}`);
    }

    if (!response.ok) {
      await throwRendererResponseError(response, "Markdown renderer");
    }

    const blob = await response.blob();
    const filename = getFilenameFromContentDisposition(response.headers.get("content-disposition")) || defaultFileName;
    downloadBlob(filename, blob);

    return {
      filename,
      rendererUrl,
      markdownEngine: response.headers.get("x-markdown-engine") || "advanced-local",
      captureWarning: response.headers.get("x-capture-warning") || ""
    };
  }

  async function downloadAdvancedPdf(metadata, messages, exportedAt = new Date()) {
    const defaultFileName = markdownBuilder.filename(metadata.title, exportedAt, "pdf");
    const payload = await createStructuredExportPayload(messages, exportedAt, {
      embedImages: true
    });

    const rendererSettings = await getExporterSettings();
    const rendererUrl = getAdvancedPdfRendererUrl(rendererSettings);
    let response;
    try {
      response = await fetch(`${rendererUrl}/render-pdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getLocalApiHeaders(rendererSettings)
        },
        body: JSON.stringify({
          exportPayload: payload,
          fileName: defaultFileName
        })
      });
    } catch (error) {
      throw new Error(`Local renderer is not running at ${rendererUrl}. Details: ${error.message || error}`);
    }

    if (!response.ok) {
      await throwRendererResponseError(response, "PDF renderer");
    }

    const blob = await response.blob();
    const filename = getFilenameFromContentDisposition(response.headers.get("content-disposition")) || defaultFileName;
    downloadBlob(filename, blob);

    return {
      filename,
      rendererUrl,
      pageCount: Number(response.headers.get("x-page-count")) || null,
      pdfEngine: response.headers.get("x-pdf-engine") || "advanced-local-chrome",
      captureWarning: response.headers.get("x-capture-warning") || "",
      dataDir: decodeHeaderValue(response.headers.get("x-data-dir")),
      dataFiles: decodeHeaderValue(response.headers.get("x-data-files")),
      imagesEmbedded: payload.assetStats?.imagesEmbedded || 0,
      imagesFailed: payload.assetStats?.imagesFailed || 0
    };
  }

  async function throwRendererResponseError(response, label) {
    const errorText = await response.text().catch(() => "");

    if (response.status === 401 || response.status === 403) {
      throw new Error("Local renderer rejected the extension token. Copy a fresh start command from the popup and restart the local renderer.");
    }

    throw new Error(`${label} failed (${response.status}). ${errorText || response.statusText}`);
  }

  async function embedImagesForPortableMessages(messages, stats, options = {}) {
    const domFallbackStats = await embedInternalAssetImagesFromMountedDom(messages, stats);

    if (domFallbackStats.attempted || domFallbackStats.embedded || domFallbackStats.failed) {
      options.debugLog?.event?.("assetEmbed.domFallback", {
        captureMode: options.captureMode || "",
        ...domFallbackStats
      });
    }

    const plan = collectImageEmbeddingPlan(messages, ADVANCED_PDF_IMAGE_EMBED_LIMIT);
    stats.imagesSkipped += plan.skipped;

    if (!plan.urls.length) {
      return;
    }

    const embeddedImagesByUrl = await fetchImageDataUrisForEmbedding(plan.urls, stats, options);

    for (const message of messages) {
      message.markdown = replaceEmbeddedMarkdownImages(message.markdown, embeddedImagesByUrl);
      message.thinkingMarkdown = replaceEmbeddedMarkdownImages(message.thinkingMarkdown, embeddedImagesByUrl);
    }
  }

  async function embedInternalAssetImagesFromMountedDom(messages, stats) {
    const result = {
      attempted: 0,
      embedded: 0,
      failed: 0,
      missingNode: 0,
      missingDomImage: 0
    };

    for (const message of messages) {
      const refs = [
        ...extractInternalAssetMarkdownImageRefs(message.markdown, "markdown"),
        ...extractInternalAssetMarkdownImageRefs(message.thinkingMarkdown, "thinkingMarkdown")
      ];

      if (!refs.length) {
        continue;
      }

      result.attempted += refs.length;
      const node = resolveMountedMessageNodeForPortableMessage(message);

      if (!node) {
        const globalDomImages = Array.from(document.querySelectorAll("img"));
        const replacements = new Map();
        for (const ref of refs) {
          const fileMatch = ref.url.match(/(file_[a-f0-9]{32}|file-[a-zA-Z0-9_-]+)/i);
          const fileId = fileMatch ? fileMatch[1] : "";
          if (!fileId) continue;
          const match = globalDomImages.find((img) => {
            const src = img.currentSrc || img.src || "";
            return src && !isInternalAssetImageUrl(src) && (src.includes(fileId) || img.alt?.includes(fileId));
          });
          if (match) {
            try {
              const dataUri = await imageToDataUri(match, match.currentSrc || match.src);
              replacements.set(ref.url, dataUri);
              result.embedded += 1;
              stats.imagesEmbedded += 1;
            } catch (_) {}
          }
        }
        if (replacements.size) {
          message.markdown = replaceEmbeddedMarkdownImages(message.markdown, replacements);
          message.thinkingMarkdown = replaceEmbeddedMarkdownImages(message.thinkingMarkdown, replacements);
        }
        result.missingNode += refs.length - replacements.size;
        continue;
      }

      const candidates = getCandidateDomImagesForEmbedding(node);

      if (!candidates.length) {
        result.missingDomImage += refs.length;
        continue;
      }

      const replacements = new Map();

      for (let index = 0; index < refs.length; index += 1) {
        const ref = refs[index];
        const candidate = candidates[index] || candidates[candidates.length - 1];

        try {
          const dataUri = await imageToDataUri(candidate.image, candidate.src);
          replacements.set(ref.url, dataUri);
          result.embedded += 1;
          stats.imagesEmbedded += 1;
        } catch (_) {
          result.failed += 1;
        }
      }

      if (replacements.size) {
        message.markdown = replaceEmbeddedMarkdownImages(message.markdown, replacements);
        message.thinkingMarkdown = replaceEmbeddedMarkdownImages(message.thinkingMarkdown, replacements);
      }
    }

    return result;
  }

  function extractInternalAssetMarkdownImageRefs(markdown, field) {
    return extractEmbeddableMarkdownImageUrls(markdown)
      .filter(isInternalAssetImageUrl)
      .map((url) => ({ field, url }));
  }

  function resolveMountedMessageNodeForPortableMessage(message) {
    const candidates = [
      message?.sourceMessageId
        ? document.querySelector(`[data-message-id="${cssString(message.sourceMessageId)}"]`)
        : null,
      message?.sourceTurnId
        ? document.querySelector(`[data-turn-id="${cssString(message.sourceTurnId)}"]`)
        : null,
      message?.sourceTurnContainer
        ? document.querySelector(`[data-turn-id-container="${cssString(message.sourceTurnContainer)}"], [data-turn-container="${cssString(message.sourceTurnContainer)}"]`)
        : null,
      findTurnNodeByConversationOrder(message?.order ?? message?.turnNumber)
    ].filter(Boolean);

    for (const candidate of candidates) {
      const turn = candidate.closest?.("[data-turn-id], [data-turn-container], [data-turn-id-container], [data-testid^='conversation-turn-'], [data-testid*='conversation-turn']");
      if (turn) {
        return turn;
      }

      return candidate;
    }

    return null;
  }

  function getCandidateDomImagesForEmbedding(root) {
    return Array.from(root.querySelectorAll?.("img") || [])
      .map((image) => ({
        image,
        src: image.currentSrc || image.src || image.getAttribute("src") || "",
        width: getMediaWidth(image),
        height: getMediaHeight(image)
      }))
      .filter((candidate) => {
        if (!candidate.src || isLikelyDecorativeImage(candidate.image)) {
          return false;
        }

        if (/google\.com\/s2\/favicons|favicon|avatar|openai/i.test(candidate.src)) {
          return false;
        }

        return Math.max(candidate.width || 0, candidate.height || 0) >= 72;
      });
  }

  function collectImageEmbeddingPlan(messages, limit) {
    const urls = [];
    const seen = new Set();
    let skipped = 0;

    for (const message of messages) {
      for (const url of [
        ...extractEmbeddableMarkdownImageUrls(message.markdown),
        ...extractEmbeddableMarkdownImageUrls(message.thinkingMarkdown)
      ]) {
        if (seen.has(url)) {
          continue;
        }

        seen.add(url);

        if (urls.length >= limit) {
          skipped += 1;
          continue;
        }

        urls.push(url);
      }
    }

    return { urls, skipped };
  }

  function extractEmbeddableMarkdownImageUrls(markdown) {
    const urls = [];
    const source = String(markdown || "");
    const imagePattern = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    let match;

    while ((match = imagePattern.exec(source))) {
      const url = match[2] || "";
      if (isEmbeddableImageUrl(url)) {
        urls.push(url);
      }
    }

    return urls;
  }

  async function fetchImageDataUrisForEmbedding(urls, stats, options = {}) {
    const embeddedImagesByUrl = new Map();
    const failures = [];
    let cursor = 0;
    const workerCount = Math.min(ADVANCED_PDF_IMAGE_EMBED_CONCURRENCY, urls.length);

    async function worker() {
      while (cursor < urls.length) {
        const url = urls[cursor];
        cursor += 1;

        try {
          const dataUri = await imageToDataUriFromSrc(url);
          embeddedImagesByUrl.set(url, dataUri);
          stats.imagesEmbedded += 1;
        } catch (error) {
          stats.imagesFailed += 1;
          if (failures.length < 12) {
            failures.push({
              url: summarizeImageUrlForDebug(url),
              error: error?.message || String(error)
            });
          }
        }
      }
    }

    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    if (failures.length) {
      options.debugLog?.event?.("assetEmbed.fetchFailures", {
        captureMode: options.captureMode || "",
        failureCount: stats.imagesFailed,
        samples: failures
      });
    }

    return embeddedImagesByUrl;
  }

  function summarizeImageUrlForDebug(url) {
    const value = String(url || "");

    if (/^data:/i.test(value)) {
      return `${value.slice(0, 40)}...`;
    }

    return value.length > 240 ? `${value.slice(0, 220)}...` : value;
  }

  function replaceEmbeddedMarkdownImages(markdown, embeddedImagesByUrl) {
    const source = String(markdown || "");
    const imagePattern = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    return source.replace(imagePattern, (fullMatch, alt, url) => {
      const embedded = embeddedImagesByUrl.get(url);
      return embedded ? `![${alt || "image"}](${embedded})` : fullMatch;
    });
  }

  function isEmbeddableImageUrl(url) {
    return /^https?:\/\//i.test(url) || isInternalAssetImageUrl(url);
  }

  function isInternalAssetImageUrl(url) {
    return /^(?:file-service|sediment):\/\//i.test(String(url || ""));
  }

  function countPortableMarkdownImages(messages) {
    return messages.reduce((sum, message) => {
      return sum + countMarkdownImages(message.markdown) + countMarkdownImages(message.thinkingMarkdown);
    }, 0);
  }

  function countMarkdownImages(markdown) {
    return (String(markdown || "").match(/!\[[^\]]*]\([^)]+\)/g) || []).length;
  }

  function getFilenameFromContentDisposition(header) {
    if (!header) {
      return "";
    }

    const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match) {
      try {
        return decodeURIComponent(utf8Match[1]);
      } catch (_) {
        return utf8Match[1];
      }
    }

    const quotedMatch = header.match(/filename="([^"]+)"/i);
    return quotedMatch ? quotedMatch[1] : "";
  }

  function decodeHeaderValue(value) {
    if (!value) {
      return "";
    }

    try {
      return decodeURIComponent(value);
    } catch (_) {
      return value;
    }
  }

  function parseEncodedJsonHeader(value) {
    const decoded = decodeHeaderValue(value);

    if (!decoded) {
      return null;
    }

    try {
      return JSON.parse(decoded);
    } catch (_) {
      return null;
    }
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

  function refreshPortableMessageImageStats(message, options = {}) {
    const imageCount = countMarkdownImages(`${message?.markdown || ""}\n${message?.thinkingMarkdown || ""}`);
    const embedded = countEmbeddedMarkdownImages(`${message?.markdown || ""}\n${message?.thinkingMarkdown || ""}`);
    const priorFailures = Math.max(0, message.imagesFailed || 0);
    message.imageCount = imageCount;
    message.imagesEmbedded = embedded;
    message.imagesFailed = options.embedAttempted
      ? Math.max(0, imageCount - embedded) + Math.max(0, priorFailures - imageCount)
      : priorFailures;
    message.imagesDeferred = options.embedAttempted
      ? 0
      : Math.min(message.imagesDeferred || 0, Math.max(0, imageCount - embedded - message.imagesFailed));
    return message;
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
      if (result.format === "bundle") {
        const imageSummary = result.imagesEmbedded || result.imagesFailed
          ? `, ${result.imagesEmbedded} image(s) embedded`
          : "";
        const failedSummary = result.imagesFailed ? `, ${result.imagesFailed} image(s) could not be downloaded and are left as links` : "";
        return `Saved ${result.filename}. ${result.messageCount} message(s), Markdown + PDF + data files${imageSummary}${failedSummary}.`;
      }

      if (result.format === "pdf" || result.format === "advanced-pdf") {
        const pageSummary = result.pageCount ? `, ${result.pageCount} page(s)` : "";
        const imageSummary = result.imageLinks ? `, ${result.imageLinks} image attachment(s)` : "";
        const captureSummary = result.captureWarning ? ` Backend capture warning: ${result.captureWarning}` : "";
        return `Saved ${result.filename}. ${result.messageCount} message(s)${pageSummary}${imageSummary}.${captureSummary}`;
      }

      const failedSummary = result.imagesFailed ? `, ${result.imagesFailed} image(s) left as links` : "";
      const captureSummary = result.captureWarning ? ` Backend capture warning: ${result.captureWarning}` : "";
      return `Saved ${result.filename}. ${result.messageCount} message(s), ${result.imagesEmbedded} image(s) embedded${failedSummary}.${captureSummary}`;
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

  // @convo-vault-include capture-full
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

  function isPotentialMessageNode(node) {
    return getPotentialMessageNodeResult(node).ok;
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

  async function revealExpandableThinking(root = document) {
    return revealExpandableContent(root);
  }

  async function revealExpandableContent(root = document, debugLog = null) {
    const clickDisabled = true;
    let expandableButtonCount = 0;

    const buttons = uniqueElements([
      ...root.querySelectorAll('main button[aria-expanded="false"], main button[aria-controls], main button'),
      ...EXPANDABLE_BUTTON_SELECTORS.flatMap((selector) => [...root.querySelectorAll(`main ${selector}`)])
    ]);
    expandableButtonCount = buttons.filter((button) => isExpandableCueElement(button) || isExpandableContentButton(button)).length;

    debugLog?.event("expandable.reveal", {
      detailsOpened: 0,
      expandableButtonCount,
      clicked: 0,
      clickDisabled
    });
  }

  function isThinkingCueElement(element) {
    return isExpandableCueElement(element) && THINKING_CUE_RE.test(getExpandableCueText(element));
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

  // @convo-vault-include chatgpt-markup
  // @convo-vault-include chatgpt-dom
  // @convo-vault-include conversation-manifest

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

  function isThinkingFlyoutNoiseLine(line) {
    return THINKING_FLYOUT_TITLE_RE.test(line)
      || /^activity\s*[·:]/i.test(line)
      || /^\u6d3b\u52a8\s*[·:]/.test(line)
      || /^close$/i.test(line)
      || /^\u5173\u95ed$/.test(line);
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

  function isLikelyThinkingFlyoutHeading(line, nextLine) {
    return line.length <= 38
      && nextLine.length >= 24
      && !/[.?!。？！:：]$/.test(line)
      && !THINKING_STATUS_RE.test(line)
      && !THINKING_FLYOUT_DONE_RE.test(line);
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

    if (false && hasUsefulBackgroundImage(element)) {
      const imageMarkdown = await backgroundImageElementToMarkdown(element, state);

      if (imageMarkdown) {
        return `\n\n${imageMarkdown}\n\n${await serializeNodeChildren(element, state)}`;
      }
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

  function getFileAttachmentExtension(name) {
    const match = String(name || "").match(/\.([a-z0-9]{1,6})$/i);
    return (match?.[1] || "FILE").toUpperCase();
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

  async function backgroundImageElementToMarkdown(element, state) {
    const src = getBackgroundImageUrl(element);

    if (!src) {
      return "";
    }

    const alt = sanitizeAltText(element.getAttribute("aria-label") || element.getAttribute("title") || "background-image");
    state.imageCount += 1;

    try {
      const dataUri = await imageToDataUriFromSrc(src);
      state.imagesEmbedded += 1;
      state.imageEvents?.push({
        type: "background-image",
        src,
        ok: true
      });
      return `![${escapeMarkdownLinkLabel(alt)}](${dataUri})`;
    } catch (error) {
      state.imagesFailed += 1;
      state.imageEvents?.push({
        type: "background-image",
        src,
        ok: false,
        error: error.message || String(error)
      });
      return `![${escapeMarkdownLinkLabel(alt)}](${src})\n\n<!-- Background image could not be converted to base64: ${escapeHtmlComment(error.message || String(error))} -->`;
    }
  }

  function hasUsefulBackgroundImage(element) {
    if (element.closest("button:not(.group__menu-item):not(.hoverable), [role='button']:not(.group__menu-item):not(.hoverable), nav, aside, header, footer")) {
      return false;
    }

    const src = getBackgroundImageUrl(element);

    if (!src) {
      return false;
    }

    const width = element.clientWidth || Number(element.getAttribute("width")) || 0;
    const height = element.clientHeight || Number(element.getAttribute("height")) || 0;

    return width >= 40 && height >= 40;
  }

  function getBackgroundImageUrl(element) {
    const backgroundImage = window.getComputedStyle(element).backgroundImage || "";
    const match = backgroundImage.match(/url\(["']?(.+?)["']?\)/);

    if (!match?.[1] || match[1].startsWith("data:image/svg")) {
      return "";
    }

    try {
      return new URL(match[1], location.href).href;
    } catch {
      return match[1];
    }
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

  async function imageToDataUri(image, src) {
    if (src.startsWith("data:")) {
      return src;
    }

    try {
      return await imageToDataUriFromSrc(src);
    } catch (backgroundError) {
      return imageToDataUriWithCanvas(image);
    }
  }

  async function imageToDataUriFromSrc(src) {
    if (src.startsWith("data:")) {
      return src;
    }

    if (IMAGE_DATA_URI_CACHE.has(src)) {
      const cached = IMAGE_DATA_URI_CACHE.get(src);

      if (cached.ok) {
        return cached.dataUri;
      }

      throw new Error(cached.error);
    }

    try {
      const dataUri = await requestImageFromBackground(src);
      IMAGE_DATA_URI_CACHE.set(src, {
        ok: true,
        dataUri
      });
      return dataUri;
    } catch (error) {
      IMAGE_DATA_URI_CACHE.set(src, {
        ok: false,
        error: error.message || String(error)
      });
      throw error;
    }
  }

  function requestImageFromBackground(src) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "FETCH_IMAGE_AS_DATA_URI",
          src,
          pageUrl: location.href
        },
        (response) => {
          const runtimeError = chrome.runtime.lastError;

          if (runtimeError) {
            reject(new Error(runtimeError.message));
            return;
          }

          if (!response?.ok) {
            reject(new Error(response?.error || "Background image fetch failed."));
            return;
          }

          resolve(response.dataUri);
        }
      );
    });
  }

  function imageToDataUriWithCanvas(image) {
    const canvas = document.createElement("canvas");
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;

    if (!width || !height) {
      throw new Error("Image dimensions are not available.");
    }

    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    return canvas.toDataURL("image/png");
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

  function buildMarkdown(metadata, messages) {
    const lines = [
      "---",
      `title: "${escapeYaml(metadata.title)}"`,
      `source: "${escapeYaml(metadata.source)}"`,
      `exported_at: "${metadata.exportedAt.toISOString()}"`,
      `exporter: "Convo Vault ${metadata.exporterVersion}"`,
      `message_count: ${metadata.messageCount}`,
      "---",
      "",
      `# ${metadata.title}`,
      "",
      `Exported: ${metadata.exportedAt.toLocaleString()}`,
      "",
      `Source: ${metadata.source}`,
      ""
    ];

    messages.forEach((message, index) => {
      lines.push(`## ${index + 1}. ${formatRole(message.role)}`, "");

      if (message.timestamp) {
        lines.push(`_Time: ${message.timestamp}_`, "");
      }

      if (message.thinkingMarkdown) {
        lines.push("### Thinking", "", message.thinkingMarkdown, "", "### Message", "");
      }

      lines.push(message.markdown || "_No text content found._", "");
    });

    return `${lines.join("\n").replace(/\n{4,}/g, "\n\n\n").trim()}\n`;
  }

  function downloadMarkdown(filename, markdown) {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    downloadBlob(filename, blob);
  }

  function downloadBlob(filename, blob) {
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

  function escapeYaml(text) {
    return String(text || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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
