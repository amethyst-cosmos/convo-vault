

// Page breaks are decided on Chrome's own fragmentation: while measuring, the
// conversation is laid out as columns exactly one page tall, so every element's
// column is the page it prints on. Forced breaks are added in document order
// and the layout is re-read after each one.
function buildPaginationScript() {
  return `
(() => {
  const CONTENT_HEIGHT = 1011;
  const PAGE_WIDTH = 674;
  // Room kept below a prompt so its answer starts on the same page.
  const ANSWER_LEAD_HEIGHT = 140;
  // A new exchange never starts in the last quarter of a page.
  const MIN_EXCHANGE_START_SPACE = CONTENT_HEIGHT * 0.25;
  // A block that avoids page breaks inside it keeps that rule only up to this
  // height; a taller one would leave a large gap when moved to the next page.
  const AVOID_BREAK_LIMIT = CONTENT_HEIGHT * 0.4;

  function releaseTallUnbreakableBlocks(conversation) {
    const tall = [];
    for (const element of conversation.querySelectorAll("*")) {
      const breakInside = window.getComputedStyle(element).breakInside;
      if (breakInside !== "avoid" && breakInside !== "avoid-page") continue;
      const limit = element.closest(".user-message") ? CONTENT_HEIGHT : AVOID_BREAK_LIMIT;
      if (element.getBoundingClientRect().height > limit) tall.push(element);
    }
    tall.forEach((element) => element.classList.add("break-released"));
  }

  // Page index and offset within the page of a client rect in measuring mode.
  function locate(rect, origin) {
    const page = Math.max(0, Math.round((rect.left - origin.left) / PAGE_WIDTH));
    return { page, top: rect.top - origin.top, bottom: rect.bottom - origin.top };
  }

  function fragments(element, origin) {
    return Array.from(element.getClientRects())
      .filter((rect) => rect.height > 0)
      .map((rect) => locate(rect, origin));
  }

  // First visible line or image after the message meta row.
  function firstContentRect(message, meta) {
    const walker = document.createTreeWalker(message, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        if (meta.contains(node) || !(meta.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) return NodeFilter.FILTER_SKIP;
        if (node.nodeType === Node.ELEMENT_NODE) {
          return /^(IMG|SVG|CANVAS|VIDEO)$/i.test(node.tagName) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }
        return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      let rects;
      if (node.nodeType === Node.TEXT_NODE) {
        const range = document.createRange();
        range.selectNodeContents(node);
        rects = range.getClientRects();
      } else {
        rects = node.getClientRects();
      }
      const rect = Array.from(rects).find((item) => item.height > 0);
      if (rect) return rect;
    }
    return null;
  }

  function forceBreak(message) {
    message.classList.add("force-page-before");
  }

  window.applyConversationPageBreaks = () => {
    const conversation = document.querySelector(".conversation");
    if (!conversation) return;
    const messages = Array.from(conversation.querySelectorAll(":scope > .message"));
    messages.forEach((message) => message.classList.remove("force-page-before"));
    conversation.querySelectorAll(".break-released").forEach((element) => element.classList.remove("break-released"));
    releaseTallUnbreakableBlocks(conversation);

    document.documentElement.classList.add("paginating");
    try {
      messages.forEach((message, index) => {
        const origin = conversation.getBoundingClientRect();
        const previous = messages[index - 1];

        // A prompt starts a new page when the previous answer leaves too
        // little room for the prompt and the start of its answer.
        if (message.classList.contains("user-message") && previous?.classList.contains("assistant-message")) {
          const end = fragments(previous, origin).pop();
          const prompt = fragments(message, origin);
          if (end && prompt.length) {
            const used = end.bottom;
            const promptHeight = Math.min(prompt.reduce((sum, part) => sum + part.bottom - part.top, 0), CONTENT_HEIGHT);
            if (used > 0 && CONTENT_HEIGHT - used < Math.max(promptHeight + ANSWER_LEAD_HEIGHT, MIN_EXCHANGE_START_SPACE)) {
              forceBreak(message);
            }
          }
          return;
        }

        // An answer's meta row stays on the page where its content starts.
        if (message.classList.contains("assistant-message")) {
          const meta = message.querySelector(".message-meta");
          const metaRect = meta && Array.from(meta.getClientRects()).find((rect) => rect.height > 0);
          const contentRect = meta && firstContentRect(message, meta);
          if (metaRect && contentRect && locate(contentRect, origin).page > locate(metaRect, origin).page) {
            forceBreak(message);
          }
        }
      });
    } finally {
      document.documentElement.classList.remove("paginating");
    }
  };

  window.addEventListener("load", () => {
    window.applyConversationPageBreaks();
  });
})();`;
}

module.exports = {
  buildPaginationScript
};
