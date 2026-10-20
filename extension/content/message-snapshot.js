  function createMessageDebugSnapshot(message, body, roleReason = "") {
    const markdown = String(message?.markdown || "");
    const thinkingMarkdown = String(message?.thinkingMarkdown || "");

    return {
      id: message?.id || "",
      role: message?.role || "",
      order: message?.order ?? null,
      roleReason,
      sourceMessageId: message?.sourceMessageId || "",
      timestamp: message?.timestamp || "",
      markdownLength: markdown.length,
      thinkingLength: thinkingMarkdown.length,
      markdownPreview: truncateDebugText(markdown, 4000),
      thinkingPreview: truncateDebugText(thinkingMarkdown, 2400),
      featureFlags: getMarkdownFeatureFlags(markdown, thinkingMarkdown),
      codeBlockDiagnostics: getCodeBlockDiagnostics(markdown, thinkingMarkdown),
      codeBlockCount: message?.codeBlockCount || 0,
      fileCount: message?.fileCount || 0,
      imageCount: message?.imageCount || 0,
      imagesEmbedded: message?.imagesEmbedded || 0,
      imagesDeferred: message?.imagesDeferred || 0,
      imagesFailed: message?.imagesFailed || 0,
      usedWholeNodeFallback: Boolean(message?.usedWholeNodeFallback),
      serializationAttempts: (message?.serializationAttempts || []).slice(0, 8),
      node: message?.sourceNode ? summarizeNode(message.sourceNode) : null,
      body: body ? summarizeNode(body) : null
    };
  }

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

  function getMarkdownFeatureFlags(markdown, thinkingMarkdown = "") {
    const combined = `${String(markdown || "")}\n${String(thinkingMarkdown || "")}`;

    return {
      hasBold: /(\*\*|__)[\s\S]+?\1/.test(combined),
      hasItalic: /(^|[^*])(?:\*|_)[^*_]+(?:\*|_)/.test(combined),
      hasList: /^\s*(?:[-*+]|\d+[.)])\s+\S/m.test(combined),
      hasOrderedList: /^\s*\d+[.)]\s+\S/m.test(combined),
      hasQuote: /^\s*>/m.test(combined),
      hasCodeBlock: /```/.test(combined),
      hasTable: /^\s*\|.*\|\s*$/m.test(combined),
      hasLink: /\[[^\]]+\]\([^)]+\)/.test(combined),
      boldMarkerCount: (combined.match(/(\*\*|__)/g) || []).length,
      orderedListItemCount: (combined.match(/^\s*\d+[.)]\s+\S/gm) || []).length,
      quoteLineCount: (combined.match(/^\s*>/gm) || []).length,
      tableRowCount: (combined.match(/^\s*\|.*\|\s*$/gm) || []).length
    };
  }

  function getMarkdownFeatureStats(messages) {
    return messages.reduce((stats, message) => {
      const markdown = String(message.markdown || "");
      const thinkingMarkdown = String(message.thinkingMarkdown || "");
      const flags = getMarkdownFeatureFlags(markdown, thinkingMarkdown);

      if (flags.hasBold) {
        stats.messagesWithBold += 1;
      }

      if (flags.hasItalic) {
        stats.messagesWithItalic += 1;
      }

      if (flags.hasList) {
        stats.messagesWithLists += 1;
      }

      if (flags.hasQuote) {
        stats.messagesWithQuotes += 1;
      }

      if (flags.hasCodeBlock) {
        stats.messagesWithCodeBlocks += 1;
      }

      if (flags.hasTable) {
        stats.messagesWithTables += 1;
      }

      if (flags.hasLink) {
        stats.messagesWithLinks += 1;
      }

      return stats;
    }, {
      messagesWithBold: 0,
      messagesWithItalic: 0,
      messagesWithLists: 0,
      messagesWithQuotes: 0,
      messagesWithCodeBlocks: 0,
      messagesWithTables: 0,
      messagesWithLinks: 0
    });
  }

  function getPageTurnDiagnostics() {
    return {
      dataTurnIdCount: document.querySelectorAll("[data-turn-id]").length,
      dataTurnContainerCount: document.querySelectorAll("[data-turn-container]").length,
      dataTurnIdContainerCount: document.querySelectorAll("[data-turn-id-container]").length,
      authorRoleCount: document.querySelectorAll("[data-message-author-role]").length,
      assistantRoleCount: document.querySelectorAll('[data-message-author-role="assistant"]').length,
      userRoleCount: document.querySelectorAll('[data-message-author-role="user"]').length,
      legacyConversationTurnCount: document.querySelectorAll('[data-testid*="conversation-turn"]').length,
      markdownProseCount: document.querySelectorAll("div.markdown.prose, .markdown.prose").length,
      markdownCount: document.querySelectorAll(".markdown, [class*='markdown']").length
    };
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

  function truncatePreview(text, maxLength) {
    const value = String(text || "").trim();

    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
  }

  function isLikelyNonMessageMarkdown(message) {
    const text = [message.markdown, message.thinkingMarkdown].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

    if (!text) {
      return false;
    }

    return isTimestampDividerText(text) || (text.length <= 320 && NON_MESSAGE_TEXT_RE.test(text));
  }

  function getMessageStats(message) {
    const stats = [];

    if (message.timestamp) {
      stats.push(message.timestamp);
    }

    if (message.codeBlockCount) {
      stats.push(`${message.codeBlockCount} code`);
    }

    if (message.imageCount) {
      stats.push(`${message.imageCount} img`);
    }

    if (message.thinkingMarkdown) {
      stats.push("thinking");
    }

    return stats.join(" | ") || "text";
  }

  function summarizeNode(node) {
    if (!node) {
      return null;
    }

    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;

    if (!element) {
      return null;
    }

    return {
      tag: element.tagName?.toLowerCase() || "",
      id: element.id || "",
      role: element.getAttribute?.("role") || "",
      testId: element.getAttribute?.("data-testid") || "",
      messageRole: element.getAttribute?.("data-message-author-role") || "",
      messageId: element.getAttribute?.("data-message-id") || "",
      className: String(element.getAttribute?.("class") || "").slice(0, 220),
      textPreview: getElementText(element).slice(0, 260),
      selectorPath: getNodeSelectorPath(element)
    };
  }

  function summarizeCandidateSignals(node) {
    if (!node?.matches) {
      return null;
    }

    return {
      isConversationTurn: isConversationTurnNode(node),
      isTurnNode: isTurnNode(node),
      turnId: getTurnId(node),
      hasTurnContainer: hasTurnContainerSignal(node),
      hasRoleOrMessageId: hasRoleOrMessageIdSignal(node),
      hasAssistantSignal: hasAssistantRoleSignal(node),
      hasUserSignal: hasUserRoleSignal(node),
      hasMessageContent: hasMessageContent(node),
      isNonMessage: isNonMessageNode(node),
      innerTextLength: String(node.innerText || "").trim().length,
      textContentLength: String(node.textContent || "").trim().length,
      markdownCount: node.querySelectorAll?.(".markdown, [class*='markdown'], [class*='prose']").length || 0,
      streamingCount: node.querySelectorAll?.("[data-is-streaming], [class*='result-streaming']").length || 0,
      expandableButtonCount: getExpandableContentButtons(node).length,
      mediaCount: node.querySelectorAll?.("img, picture, canvas").length || 0,
      codeCount: node.querySelectorAll?.("pre, code").length || 0
    };
  }

  function getSerializationHint(node) {
    if (!node?.matches) {
      return null;
    }

    return {
      rawTextLength: getRawElementText(node).length,
      elementTextLength: getElementText(node).length,
      childNodeCount: node.childNodes?.length || 0,
      elementChildCount: node.children?.length || 0,
      skippedBySerializer: shouldSkipElement(node, { skipElements: new WeakSet() }),
      markdownCount: node.querySelectorAll?.("div.markdown.prose, .markdown, [class*='markdown'], [class*='prose']").length || 0,
      richMarkdownContainer: isRichMarkdownContainer(node),
      structuralBlockCount: node.querySelectorAll?.("strong, b, em, i, blockquote, ul, ol, table").length || 0,
      semanticTagCounts: {
        strong: node.querySelectorAll?.("strong, b").length || 0,
        emphasis: node.querySelectorAll?.("em, i").length || 0,
        blockquote: node.querySelectorAll?.("blockquote").length || 0,
        orderedList: node.querySelectorAll?.("ol").length || 0,
        unorderedList: node.querySelectorAll?.("ul").length || 0,
        table: node.querySelectorAll?.("table").length || 0,
        dataRange: node.querySelectorAll?.("[data-start], [data-end], [data-is-last-node], [data-is-only-node]").length || 0
      },
      cssFormattedInlineCount: node.querySelectorAll?.(".font-bold, .font-semibold, .font-extrabold, .font-black, .italic, [style*='font-weight'], [style*='font-style']").length || 0,
      dirAutoCount: node.querySelectorAll?.("[dir='auto']").length || 0,
      buttonCount: node.querySelectorAll?.("button, [role='button']").length || 0,
      expandableButtonCount: getExpandableContentButtons(node).length,
      hiddenCount: node.querySelectorAll?.("[hidden], [aria-hidden='true']").length || 0
    };
  }

  function getNodeSelectorPath(element) {
    const parts = [];
    let current = element;

    while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
      let part = current.tagName.toLowerCase();
      const testId = current.getAttribute("data-testid");
      const role = current.getAttribute("data-message-author-role");

      if (testId) {
        part += `[data-testid="${testId.slice(0, 80)}"]`;
      } else if (role) {
        part += `[data-message-author-role="${role}"]`;
      } else if (current.id) {
        part += `#${current.id}`;
      }

      parts.unshift(part);
      current = current.parentElement;
    }

    return parts.join(" > ");
  }

  function highlightMessageNode(node) {
    const previousOutline = node.style.outline;
    const previousOutlineOffset = node.style.outlineOffset;
    const previousBackground = node.style.backgroundColor;
    const previousTransition = node.style.transition;

    node.style.transition = "outline-color 160ms ease, background-color 160ms ease";
    node.style.outline = "3px solid #0f766e";
    node.style.outlineOffset = "6px";
    node.style.backgroundColor = "rgba(15, 118, 110, 0.08)";

    window.setTimeout(() => {
      if (!node.isConnected) {
        return;
      }

      node.style.outline = previousOutline;
      node.style.outlineOffset = previousOutlineOffset;
      node.style.backgroundColor = previousBackground;
      node.style.transition = previousTransition;
    }, 1600);
  }
