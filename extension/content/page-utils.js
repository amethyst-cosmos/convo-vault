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
