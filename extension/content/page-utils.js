  function getConversationTitle() {
    if (activeExportContext?.title) {
      return activeExportContext.title;
    }

    if (lastApiConversationTitle) {
      return lastApiConversationTitle;
    }

    // A batch exports conversations other than the one in the tab, so the tab title is not theirs.
    if (activeExportContext?.conversationId) {
      return "ChatGPT Conversation";
    }

    const documentTitle = cleanTitle(document.title);

    if (documentTitle && documentTitle.toLowerCase() !== "chatgpt") {
      return documentTitle;
    }

    const heading = document.querySelector("main h1, h1");
    const headingText = heading ? cleanTitle(getElementText(heading)) : "";
    return headingText || "ChatGPT Conversation";
  }

  function getExportSourceUrl() {
    if (activeExportContext?.conversationId) {
      return `${location.origin}/c/${encodeURIComponent(activeExportContext.conversationId)}`;
    }
    const url = new URL(location.href);
    const hash = new URLSearchParams(url.hash.slice(1));
    if (hash.has(AUTO_EXPORT_HASH_KEY)) {
      hash.delete(AUTO_EXPORT_HASH_KEY);
      url.hash = hash.toString();
    }
    return url.href;
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

