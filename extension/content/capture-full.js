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
