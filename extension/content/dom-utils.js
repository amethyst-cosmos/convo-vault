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
