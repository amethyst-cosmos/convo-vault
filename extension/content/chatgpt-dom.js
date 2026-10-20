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
  const CHATGPT_COPY_EXCLUDED_SELECTOR = "[data-markdown-copy='exclude']";

  function isChatGptMessageUnit(node) {
    return Boolean(node?.matches?.(CHATGPT_MESSAGE_UNIT_SELECTOR));
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

  // DIL responses render through [data-dil-message-id] with data-d-component
  // markers. Citation chips are popover triggers that wrap a pill badge and no
  // link; Link components are popover triggers that wrap a plain <a href>.
  const CHATGPT_DIL_ROOT_SELECTOR = "[data-dil-message-id]";

  function isChatGptDilWebLink(element, href) {
    return Boolean(element?.closest?.(CHATGPT_DIL_ROOT_SELECTOR))
      && /^https?:\/\//i.test(String(href || ""))
      && !/\/backend-api\/|oaiusercontent\.com/i.test(String(href || ""));
  }

  function isChatGptCopyExcludedElement(element) {
    return Boolean(element?.matches?.(CHATGPT_COPY_EXCLUDED_SELECTOR));
  }

