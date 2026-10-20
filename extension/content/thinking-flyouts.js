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
    target.preview = makeMessagePreview(target);
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
