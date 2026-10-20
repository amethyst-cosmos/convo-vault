
  function createPortableMessageSnapshot(message, index = 0) {
    const markdown = dedupeMarkdownImageReferences(message?.markdown || "");
    const thinkingMarkdown = dedupeMarkdownImageReferences(message?.thinkingMarkdown || "");
    const imageCount = countMarkdownImages(`${markdown}\n${thinkingMarkdown}`);
    const imagesEmbedded = Math.min(imageCount, message?.imagesEmbedded || 0);
    const imagesFailed = Math.max(0, message?.imagesFailed || 0);
    const failedImageReferences = Math.min(Math.max(0, imageCount - imagesEmbedded), imagesFailed);
    const imagesDeferred = Math.min(
      Math.max(0, imageCount - imagesEmbedded - failedImageReferences),
      message?.imagesDeferred || 0
    );

    return {
      id: message?.id || `message-${index + 1}`,
      role: message?.role || "unknown",
      turnNumber: normalizeTurnNumber(message?.turnNumber, index),
      order: message?.order ?? index,
      conversationOrder: message?.order ?? index,
      originalOrder: message?.originalOrder ?? message?.order ?? index,
      sourceTurnId: message?.sourceTurnId || "",
      sourceTurnContainer: message?.sourceTurnContainer || "",
      sourceMessageId: message?.sourceMessageId || "",
      timestamp: message?.timestamp || "",
      preview: message?.preview || "",
      markdown,
      thinkingMarkdown,
      agentTrace: message?.agentTrace || null,
      ...(Array.isArray(message?.dil) && message.dil.length ? { dil: message.dil } : {}),
      codeBlockCount: message?.codeBlockCount || 0,
      fileCount: message?.fileCount || 0,
      imageCount,
      imagesEmbedded,
      imagesDeferred,
      imagesFailed,
      hybridSource: message?.hybridSource || "",
      hybridMarkdownSource: message?.hybridMarkdownSource || "",
      hybridThinkingSource: message?.hybridThinkingSource || ""
    };
  }

  function dedupeMarkdownImageReferences(markdown) {
    const imagePattern = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)(?:\s*<!-- (?:Image base64 embedding is temporarily disabled during scanning to avoid page side effects|Image base64 embedding is deferred until export to avoid page side effects)\. -->)?/g;
    const source = String(markdown || "");
    const seen = new Set();
    let previousMatchEnd = 0;

    return cleanMarkdown(source.replace(imagePattern, (match, _alt, url, offset) => {
      if (hasSubstantiveImageGap(source.slice(previousMatchEnd, offset))) {
        seen.clear();
      }
      previousMatchEnd = offset + match.length;
      const identity = getMarkdownImageIdentity(url);

      if (!identity || !seen.has(identity)) {
        if (identity) {
          seen.add(identity);
        }
        return match;
      }

      return "";
    }));
  }

  function hasSubstantiveImageGap(value) {
    return Boolean(String(value || "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .trim());
  }

  function getMarkdownImageIdentity(url) {
    const value = String(url || "").trim();

    if (!value) {
      return "";
    }

    const pointerMatch = value.match(/^(?:file-service|sediment):\/\/([^/?#]+)/i);
    if (pointerMatch?.[1]) {
      return `chatgpt-asset:${pointerMatch[1]}`;
    }

    if (/^data:/i.test(value)) {
      return value;
    }

    try {
      const parsed = new URL(value, location.href);
      const estuaryId = /\/backend-api\/estuary\/content/i.test(parsed.pathname)
        ? parsed.searchParams.get("id") || ""
        : "";
      if (estuaryId) {
        return `chatgpt-estuary:${estuaryId}:${parsed.searchParams.get("p") || ""}`;
      }

      const fileMatch = parsed.pathname.match(/\/backend-api\/files\/([^/?#]+)(?:\/([^/?#]+))?/i);
      if (fileMatch?.[1]) {
        return `chatgpt-file:${fileMatch[1]}:${fileMatch[2] || "metadata"}`;
      }

      const sedimentMatch = parsed.pathname.match(/\/backend-api\/sediment\/files\/([^/?#]+)(?:\/([^/?#]+))?/i);
      if (sedimentMatch?.[1]) {
        return `chatgpt-sediment:${sedimentMatch[1]}:${sedimentMatch[2] || "metadata"}`;
      }

      parsed.hash = "";
      return parsed.href;
    } catch (_) {
      return value;
    }
  }

  function countEmbeddedMarkdownImages(markdown) {
    let count = 0;
    const imagePattern = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    let match;

    while ((match = imagePattern.exec(String(markdown || "")))) {
      if (/^data:image\//i.test(match[2] || "")) {
        count += 1;
      }
    }

    return count;
  }

  function truncateDebugText(text, maxLength) {
    const value = String(text || "");

    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, Math.max(0, maxLength - 24))}\n...[truncated ${value.length - maxLength} chars]`;
  }

  function getCodeBlockDiagnostics(markdown, thinkingMarkdown = "") {
    const combined = `${String(markdown || "")}\n${String(thinkingMarkdown || "")}`;
    const diagnostics = [];
    const pattern = /(^|\n)([`~]{3,})([^\n]*)\n([\s\S]*?)\n\2(?=\n|$)/g;
    let match;

    while ((match = pattern.exec(combined)) !== null) {
      const code = match[4] || "";
      const lines = code.split("\n");
      diagnostics.push({
        language: normalizeLanguage(match[3] || ""),
        lineCount: lines.length,
        nonEmptyLineCount: lines.filter((line) => line.trim()).length,
        maxLineLength: lines.reduce((max, line) => Math.max(max, line.length), 0),
        firstLine: truncateDebugText(lines.find((line) => line.trim()) || "", 160)
      });
    }

    return diagnostics.slice(0, 12);
  }

  function truncatePreview(text, maxLength) {
    const value = String(text || "").trim();

    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
  }

  function makeMessagePreview(message) {
    const text = [
      message.markdown,
      message.thinkingMarkdown ? `Thinking: ${message.thinkingMarkdown}` : ""
    ].filter(Boolean).join(" ");
    const preview = text
      .replace(/```[\s\S]*?```/g, "[code block]")
      .replace(/!\[[^\]]*]\([^)]+\)/g, "[image]")
      .replace(/[#*_>`~\[\]()|]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (preview) {
      return truncatePreview(preview, 30);
    }

    const extras = [];

    if (message.codeBlockCount) {
      extras.push(`${message.codeBlockCount} code block(s)`);
    }

    if (message.imageCount) {
      extras.push(`${message.imageCount} image(s)`);
    }

    return extras.join(", ") || "No text preview available.";
  }
