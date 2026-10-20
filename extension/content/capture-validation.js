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
