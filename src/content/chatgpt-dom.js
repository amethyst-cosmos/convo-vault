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
  const CHATGPT_UNIT_BODY_SELECTORS = {
    assistant: [
      "[data-markdown-text-style='assistant-message']",
      "[data-markdown-copy='contents']"
    ],
    user: [
      "[data-user-message-bubble]"
    ]
  };
  const CHATGPT_WRITING_BLOCK_SELECTOR = "[data-testid='chatgpt-writing-block']";
  const CHATGPT_COPY_EXCLUDED_SELECTOR = "[data-markdown-copy='exclude']";

  function isChatGptMessageUnit(node) {
    return Boolean(node?.matches?.(CHATGPT_MESSAGE_UNIT_SELECTOR));
  }

  function hasChatGptMessageUnits(root = document) {
    return Boolean(root?.querySelector?.(CHATGPT_MESSAGE_UNIT_SELECTOR));
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

  function getChatGptMessageUnitBody(node, role) {
    if (!isChatGptMessageUnit(node)) {
      return null;
    }

    for (const selector of CHATGPT_UNIT_BODY_SELECTORS[role] || []) {
      const body = node.querySelector(selector);

      if (body) {
        return body;
      }
    }

    return null;
  }

  // DIL responses render through [data-dil-message-id] with data-d-component
  // markers. Citation chips are popover triggers that wrap a pill badge and no
  // link; Link components are popover triggers that wrap a plain <a href>.
  const CHATGPT_DIL_ROOT_SELECTOR = "[data-dil-message-id]";

  function isChatGptDilCitationChip(element) {
    return Boolean(
      element?.matches?.("[data-d-component='popover-trigger']")
      && element.querySelector("[data-d-component='badge'][data-pill]")
      && !element.querySelector("a[href]")
    );
  }

  function formatChatGptDilCitationChip(element) {
    const label = String(element.textContent || "").replace(/\s+/g, " ").trim();
    return label ? ` (${label})` : "";
  }

  function isChatGptDilWebLink(element, href) {
    return Boolean(element?.closest?.(CHATGPT_DIL_ROOT_SELECTOR))
      && /^https?:\/\//i.test(String(href || ""))
      && !/\/backend-api\/|oaiusercontent\.com/i.test(String(href || ""));
  }

  function isChatGptDilDivider(element) {
    return Boolean(element?.matches?.("[data-d-component='divider']"));
  }

  function hasChatGptDilStrongMarker(element) {
    return Boolean(element?.hasAttribute?.("data-d-default-strong"));
  }

  function isChatGptCopyExcludedElement(element) {
    return Boolean(element?.matches?.(CHATGPT_COPY_EXCLUDED_SELECTOR));
  }

  function isChatGptWritingBlockElement(element) {
    return Boolean(element?.matches?.(CHATGPT_WRITING_BLOCK_SELECTOR));
  }

  /**
   * Writing blocks render through an editor surface; ChatGPT keeps the block's
   * Markdown source in data-markdown-copy-text for its own copy action.
   */
  function formatChatGptWritingBlock(element) {
    const text = String(element.getAttribute("data-markdown-copy-text") || element.innerText || "").replace(/\s+$/g, "");

    if (!text.trim()) {
      return "";
    }

    const fence = makeFence(text);
    return `${fence}markdown\n${text}\n${fence}`;
  }

  /**
   * Keeps the discovery order of message ids across virtualized scroll
   * batches. Each batch is in document order; ids not seen before are placed
   * after the nearest earlier id of the same batch that is already known.
   */
  function createDomOrderRegistry() {
    const order = [];

    return {
      observe(ids) {
        let anchor = -1;

        for (const id of ids) {
          if (!id) {
            continue;
          }

          const known = order.indexOf(id);

          if (known >= 0) {
            anchor = known;
            continue;
          }

          order.splice(anchor + 1, 0, id);
          anchor += 1;
        }
      },

      rank(id) {
        const index = order.indexOf(id);
        return index >= 0 ? index + 1 : NaN;
      },

      size() {
        return order.length;
      }
    };
  }

  /**
   * Orders captured messages by the conversation manifest when one is
   * available and assigns contiguous order numbers. Messages the manifest
   * does not know keep their position relative to their neighbours.
   */
  function applyManifestOrder(messages, manifest, debugLog = null) {
    if (!manifest?.entries?.length) {
      return messages;
    }

    const positionByIdentity = new Map(manifest.entries.map((entry, index) => [entry.identity, index]));
    let lastPosition = -1;
    const keyed = messages.map((message, index) => {
      const position = positionByIdentity.get(resolveManifestIdentity(manifest, message));

      if (position != null) {
        lastPosition = position;
        return { message, key: position, tie: index };
      }

      return { message, key: lastPosition + 0.5, tie: index };
    });

    keyed.sort((a, b) => (a.key - b.key) || (a.tie - b.tie));
    const ordered = keyed.map((entry, index) => {
      entry.message.order = index + 1;
      entry.message.conversationOrder = index + 1;
      return entry.message;
    });

    debugLog?.event("fullCapture.manifestOrder", {
      messages: ordered.length,
      matched: keyed.filter((entry) => Number.isInteger(entry.key)).length
    });

    return ordered;
  }
