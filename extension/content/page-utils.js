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

  function getScrollTop(element) {
    if (isDocumentScroller(element)) {
      return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    }

    return element.scrollTop;
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
