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
