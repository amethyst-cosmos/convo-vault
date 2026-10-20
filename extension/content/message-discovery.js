

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

  function compareDocumentOrder(a, b) {
    if (a === b) {
      return 0;
    }

    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
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

  function isRichMarkdownContainer(element) {
    return Boolean(element?.matches?.("div.markdown.prose, .markdown.prose, .markdown, [class*='markdown'], [class*='prose']"));
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

