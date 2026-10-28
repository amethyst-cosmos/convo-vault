  const FAST_CONVERSATION_API_PAGE_SIZE = 100;
  const FAST_CONVERSATION_API_MAX_PAGES = 200;
  const DEFAULT_CONVERSATION_TITLE_RE = /^(?:new chat|新聊天|chatgpt|gemini|google gemini)$/i;

  // The conversation the running job exports: { conversationId, title }. A batch exports several
  // conversations from one tab, so the id and title cannot come from the page's URL and title.
  let activeExportContext = null;
  // The title ChatGPT's conversation API gave for the last capture. The tab title can still be the
  // placeholder "New chat" when the export starts, so this is preferred.
  let lastApiConversationTitle = "";

  function setActiveExportContext(context) {
    activeExportContext = context || null;
  }

  function cleanApiConversationTitle(title) {
    const text = String(title || "").replace(/\s+/g, " ").trim();
    return text && !DEFAULT_CONVERSATION_TITLE_RE.test(text) ? text : "";
  }

  async function collectFastConversationMessages(debugLog = null, options = {}) {
    const signal = options.signal || null;
    throwIfCaptureCancelled(signal);
    const conversationId = getCurrentConversationId();

    if (!conversationId) {
      throw new Error("No conversation id was found in the current URL.");
    }

    const data = await fetchConversationData(conversationId, {
      timeoutMs: CONVERSATION_API_FETCH_TIMEOUT_MS,
      debugLog,
      signal,
      onProgress: options.onProgress
    });
    throwIfCaptureCancelled(signal);
    lastApiConversationTitle = cleanApiConversationTitle(data?.title);
    const messages = buildMessagesFromConversationApi(data, debugLog);
    const manifest = buildConversationManifest(data);

    debugLog?.event("fastCapture.loaded", {
      conversationId,
      apiSource: data?.__convoVaultApiSource || "",
      mappingCount: Object.keys(getConversationApiMapping(data)).length,
      linearMessageCount: getConversationApiLinearMessages(data).length,
      messageCount: messages.length
    });
    logConversationManifest(manifest, debugLog);

    return { messages, manifest };
  }

  function logConversationManifest(manifest, debugLog) {
    debugLog?.event("conversationManifest.built", {
      ...manifest.counts,
      expectedMessages: manifest.entries.length,
      replyGaps: manifest.gaps.map((gap) => ({
        userNodeId: gap.userNodeId,
        status: gap.status,
        reason: gap.reason,
        createTime: gap.createTime
      }))
    });
  }

  function buildMessagesFromConversationApi(data, debugLog = null) {
    const pathNodes = getConversationApiCurrentPath(data);
    const messages = [];
    const filterStats = {};
    const markupStats = createMarkupStats();
    let pendingAssistantNodes = [];
    let directThinkingMessageCount = 0;

    function flushAssistantTurn() {
      if (!pendingAssistantNodes.length) {
        return;
      }

      const synthesized = synthesizeAssistantTurn(pendingAssistantNodes, messages.length + 1, "", null, debugLog, markupStats);
      pendingAssistantNodes = [];

      if (!synthesized) {
        return;
      }

      if (synthesized.thinkingMarkdown) {
        directThinkingMessageCount += 1;
      }

      messages.push(synthesized);
    }

    for (const node of pathNodes) {
      const message = node?.message;
      if (!message) {
        incrementReasonCount(filterStats, "missing-message");
        continue;
      }

      const rawRole = String(message.author?.role || "").toLowerCase();
      const metadata = message.metadata || {};
      const authorMetadata = message.author?.metadata || {};

      if (
        isTruthyApiFlag(metadata.is_visually_hidden_from_conversation)
        || isTruthyApiFlag(metadata.is_hidden)
        || isTruthyApiFlag(metadata.hidden)
        || isTruthyApiFlag(authorMetadata.is_visually_hidden_from_conversation)
        || isTruthyApiFlag(authorMetadata.is_hidden)
        || isTruthyApiFlag(authorMetadata.hidden)
      ) {
        incrementReasonCount(filterStats, "hidden");
        continue;
      }

      if (rawRole === "user") {
        flushAssistantTurn();

        const turnNumber = messages.length + 1;
        const id = message.id || node.id || `api-message-${turnNumber}`;
        const markdown = cleanApiMarkdown([
          renderChatGptInlineTokens(extractApiContentMarkdown(message.content)),
          extractApiAttachmentMarkdown(message)
        ].filter(Boolean).join("\n\n"));

        messages.push({
          id,
          role: "user",
          order: turnNumber,
          turnNumber,
          conversationOrder: turnNumber,
          timestamp: formatConversationTimestamp(
            message.create_time ??
            message.update_time ??
            message.metadata?.create_time ??
            message.metadata?.timestamp
          ),
          markdown,
          thinkingMarkdown: "",
          preview: truncatePreview(markdown, 180),
          sourceMessageId: message.id || "",
          sourceTurnId: node.id || "",
          sourceNode: null,
          fileRefs: uniqueFileRefs(collectApiFileRefs(message)),
          codeBlockCount: getCodeBlockDiagnostics(markdown, "").length,
          fileCount: countApiFileAttachments(message),
          imageCount: countMarkdownImages(markdown),
          imagesEmbedded: 0,
          imagesDeferred: countMarkdownImages(markdown),
          imagesFailed: 0,
          captureMode: "fast"
        });
      } else if (rawRole === "assistant" || rawRole === "tool") {
        if (message.end_turn === false) {
          incrementReasonCount(filterStats, "assistant-not-final");
        }
        pendingAssistantNodes.push(node);
      }
    }

    flushAssistantTurn();

    debugLog?.event("fastCapture.path", {
      pathNodeCount: pathNodes.length,
      exportedMessageCount: messages.length
    });

    if (Object.keys(filterStats).length) {
      debugLog?.event("fastCapture.filteredSummary", {
        filtered: filterStats
      });
    }

    if (markupStats.dilMessages || Object.keys(markupStats.tokens).length) {
      debugLog?.event("fastCapture.markup", markupStats);
    }

    if (directThinkingMessageCount) {
      debugLog?.event("fastCapture.thinkingMerged", {
        applied: directThinkingMessageCount
      });
    }

    return messages;
  }

  function synthesizeAssistantTurn(nodes, turnNumber, turnId = "", primaryNode = null, debugLog = null, markupStats = null) {
    if (!nodes.length) {
      return null;
    }

    let primaryMessage = primaryNode?.message || null;
    const textParts = [];
    const imagePointers = [];
    const fileEntries = [];
    const citations = [];
    const memories = [];
    let turnMsgId = "";
    let timestamp = null;

    // First pass: locate the primary final assistant message and metadata
    for (const node of nodes) {
      const msg = node?.message;
      if (!msg) continue;
      const role = String(msg.author?.role || "").toLowerCase();
      if (role === "assistant") {
        if (!turnMsgId) turnMsgId = msg.id || node.id;
        if (!timestamp) {
          timestamp = msg.create_time ?? msg.update_time ?? msg.metadata?.create_time ?? msg.metadata?.timestamp;
        }
        if (msg.channel === "final" || msg.end_turn === true || !primaryMessage) {
          primaryMessage = msg;
        }
      }

      const metadata = msg.metadata || {};
      if (Array.isArray(metadata.citations)) {
        citations.push(...metadata.citations);
      }
      if (Array.isArray(metadata.conversation_context_citation_metadata)) {
        memories.push(...metadata.conversation_context_citation_metadata);
      }
    }

    // 1. The ordered agent trace is the single source of the thinking timeline.
    const agentTrace = buildTurnAgentTrace(nodes, { citations, memories });
    recordAgentTraceDiagnostics(agentTrace, debugLog, turnNumber);
    const thinkingMarkdown = cleanApiMarkdown(renderAgentTraceThinkingMarkdown(agentTrace));

    // 2. Aggregate prose text, image pointers, generated files and attachments
    const markupContext = createChatGptMarkupContext({
      citationSources: buildCitationSourceIndex(nodes.map((node) => node?.message).filter(Boolean)),
      footnoteOffset: Array.isArray(primaryMessage?.metadata?.citations) ? primaryMessage.metadata.citations.length : 0
    });

    for (const node of nodes) {
      const msg = node?.message;
      if (!msg) continue;

      // Collect generated files
      const fileCandidate = extractApiGeneratedFilesMarkdown(msg);
      if (fileCandidate) {
        fileEntries.push(fileCandidate);
      }

      // Collect attachments
      const attachmentCandidate = extractApiAttachmentMarkdown(msg);
      if (attachmentCandidate) {
        fileEntries.push(attachmentCandidate);
      }

      const isThinking = isApiThinkingNode(msg);
      const isInternalTool = isApiInternalToolCallNode(msg);
      const isDil = isDilMessage(msg);
      const isFileReader = isApiFileReaderNode(msg);

      // Collect text and image parts
      const content = msg.content;
      if (isDil && !isThinking && !isInternalTool) {
        const fallbackMarkdown = getDilFallbackMarkdown(msg);
        const dil = chooseDilMarkdown(getApiStringParts(content).join("\n\n"), fallbackMarkdown);
        if (markupStats) {
          markupStats.dilMessages += 1;
          if (!fallbackMarkdown) markupStats.dilWithoutFallback += 1;
          if (dil.origin === "source" && fallbackMarkdown) markupStats.dilRenderedFromSource += 1;
          markupStats.dilUnexpandedLoops += dil.unexpandedLoops;
        }
        if (dil.markdown.trim()) {
          textParts.push(renderApiResponseMarkup(dil.markdown, markupContext));
        }
      }

      if (content && typeof content === "object") {
        const parts = Array.isArray(content.parts) ? content.parts : [];
        for (const part of parts) {
          if (typeof part === "string" && part.trim()) {
            if (
              !isDil
              && !isThinking
              && !isInternalTool
              && !isApiInternalFileIngestionText(part)
              && !looksLikeInternalApiToolCall(part)
              && !(looksLikeApiJsonPayload(part) && !isApiFinalAnswerMessage(msg))
            ) {
              textParts.push(renderApiResponseMarkup(part, markupContext));
            }
          } else if (part && typeof part === "object") {
            const ptr = part.asset_pointer || part.assetPointer || part.url || "";
            if (ptr && !isFileReader && !isDocumentPagePreviewPointer(ptr) && isApiImageHaystack(`${part.content_type || ""} ${part.mime_type || ""} ${ptr}`)) {
              const label = sanitizeApiMarkdownLabel(part.name || part.filename || part.title || "Image");
              const imgMd = `![${label}](${ptr})`;
              if (!imagePointers.includes(imgMd)) {
                imagePointers.push(imgMd);
              }
            }
          }
        }

        if (!parts.length && typeof content.text === "string" && content.text.trim()) {
          if (
            !isThinking
            && !isInternalTool
            && !isApiInternalFileIngestionText(content.text)
            && !looksLikeInternalApiToolCall(content.text)
            && !(looksLikeApiJsonPayload(content.text) && !isApiFinalAnswerMessage(msg))
          ) {
            textParts.push(renderApiResponseMarkup(content.text, markupContext));
          }
        }
      }
    }

    // Build synthesized markdown
    const combinedProse = uniqueStrings(textParts).join("\n\n");
    const combinedImages = imagePointers.join("\n\n");
    const combinedFiles = uniqueStrings(fileEntries).join("\n\n");

    const dilBlocks = nodes
      .map((node) => node?.message)
      .filter((msg) => msg && isDilMessage(msg) && !isApiThinkingNode(msg) && !isApiInternalToolCallNode(msg))
      .map((msg) => buildDilRenderBlock(msg, markupContext.citationSources))
      .filter(Boolean);

    let markdown = cleanApiMarkdown([
      combinedProse,
      combinedImages,
      combinedFiles
    ].filter(Boolean).join("\n\n"));

    if (primaryMessage) {
      markdown = enrichApiMarkdownWithCitations(markdown, primaryMessage);
      markdown = enrichApiMarkdownWithMemories(markdown, primaryMessage);
    } else if (citations.length || memories.length) {
      markdown = enrichApiMarkdownWithCitations(markdown, { metadata: { citations } });
      markdown = enrichApiMarkdownWithMemories(markdown, { metadata: { conversation_context_citation_metadata: memories } });
    }

    const tokenFootnotes = formatChatGptFootnotes(markupContext);
    if (tokenFootnotes) {
      markdown = `${markdown.trim()}\n\n${tokenFootnotes}`;
    }
    mergeMarkupStats(markupStats, markupContext);

    if (!markdown && !thinkingMarkdown) {
      return null;
    }

    const id = turnId || turnMsgId || `api-assistant-${turnNumber}`;

    return {
      id,
      role: "assistant",
      order: turnNumber,
      turnNumber,
      conversationOrder: turnNumber,
      timestamp: formatConversationTimestamp(timestamp),
      markdown,
      thinkingMarkdown,
      agentTrace,
      ...(dilBlocks.length ? { dil: dilBlocks } : {}),
      preview: truncatePreview(cleanMarkdown(`${markdown}\n${thinkingMarkdown}`), 180),
      sourceMessageId: primaryMessage?.id || id,
      sourceTurnId: id,
      sourceNode: null,
      fileRefs: uniqueFileRefs(nodes.flatMap((node) => (node?.message ? collectApiFileRefs(node.message) : []))),
      codeBlockCount: getCodeBlockDiagnostics(markdown, thinkingMarkdown).length,
      fileCount: (primaryMessage ? countApiFileAttachments(primaryMessage) : 0) + fileEntries.length,
      imageCount: countMarkdownImages(markdown),
      imagesEmbedded: 0,
      imagesDeferred: countMarkdownImages(markdown),
      imagesFailed: 0,
      captureMode: "fast"
    };
  }

  // A JSON-shaped text is dropped as a leaked tool payload unless ChatGPT marks
  // the message as the user-facing final answer.
  function isApiFinalAnswerMessage(msg) {
    const channel = String(msg?.channel || "").toLowerCase();
    const recipient = String(msg?.recipient || "").toLowerCase();
    return (channel === "final" || msg?.end_turn === true) && (!recipient || recipient === "all");
  }

  function renderApiResponseMarkup(text, markupContext) {
    return renderChatGptInlineTokens(renderChatGptWritingBlocks(String(text || "").trim()), markupContext);
  }

  function getApiStringParts(content) {
    if (!content || typeof content !== "object") {
      return [];
    }

    const parts = Array.isArray(content.parts) ? content.parts : [content.text];
    return parts.filter((part) => typeof part === "string" && part.trim());
  }

  function createMarkupStats() {
    return {
      dilMessages: 0,
      dilWithoutFallback: 0,
      dilRenderedFromSource: 0,
      dilUnexpandedLoops: 0,
      tokens: {},
      unknownTokens: {},
      citationFootnotes: 0,
      unresolvedCitationRefs: 0
    };
  }

  function mergeMarkupStats(stats, markupContext) {
    if (!stats) {
      return;
    }

    for (const [name, count] of Object.entries(markupContext.tokenCounts)) {
      stats.tokens[name] = (stats.tokens[name] || 0) + count;
    }

    for (const [name, count] of Object.entries(markupContext.unknownTokenCounts)) {
      stats.unknownTokens[name] = (stats.unknownTokens[name] || 0) + count;
    }

    stats.citationFootnotes += markupContext.footnotes.length;
    stats.unresolvedCitationRefs += markupContext.unresolvedCitationRefs.length;
  }

  function isApiThinkingNode(msg) {
    if (!msg) return false;
    const channel = String(msg.channel || msg.metadata?.channel || msg.author?.metadata?.channel || "").toLowerCase();
    const contentType = String(msg.content?.content_type || msg.content?.contentType || "").toLowerCase();
    return (
      channel === "analysis"
      || channel === "reasoning"
      || channel === "commentary"
      || contentType === "thoughts"
      || contentType === "reasoning"
      || contentType === "reasoning_recap"
      || msg.metadata?.is_thinking_preamble_message === true
    );
  }

  /**
   * File-reading tools (file_search, myfiles_browser) return each page of an
   * uploaded document as text plus a page image (sediment://...#p_N.jpg) for
   * the model. ChatGPT never shows those pages in the answer.
   */
  function isApiFileReaderNode(msg) {
    const role = String(msg?.author?.role || "").toLowerCase();
    const name = String(msg?.author?.name || "").toLowerCase();
    return role === "tool" && /^(?:file_search|myfiles_browser)(?:\.|$)/.test(name);
  }

  function isApiInternalFileIngestionText(text) {
    const str = String(text || "").trim();
    if (!str) return false;
    return (
      /Make sure to include fileL\d+-L\d+ in your response/i.test(str)
      || /Use ref_id "turn\d+file\d+"/i.test(str)
      || /\[L\d+\]\s*<PARSED TEXT FOR PAGE/i.test(str)
      || (/^\[L\d+\]/m.test(str) && /PARSED TEXT/i.test(str))
      || /scoped to this file\.\s*Use `?files\.(?:search|find|read)`?/i.test(str)
      || /Full file size:\s*\d+\s*pages/i.test(str)
    );
  }

  function isApiInternalToolCallNode(msg) {
    if (!msg) return false;
    const recipient = String(msg.recipient || msg.metadata?.recipient || msg.author?.metadata?.recipient || "").toLowerCase();
    const contentType = String(msg.content?.content_type || msg.content?.contentType || "").toLowerCase();
    const messageType = String(msg.metadata?.message_type || msg.metadata?.messageType || "").toLowerCase();
    const role = String(msg.author?.role || "").toLowerCase();
    const name = String(msg.author?.name || "").toLowerCase();

    if (role === "tool" || role === "system") {
      return true;
    }

    if (name.includes("browser") || name.includes("myfiles") || name.includes("search") || name.includes("tool")) {
      return true;
    }

    if (["python", "web.run", "browser", "search", "myfiles_browser", "file_search", "api_tool", "api_tool.search_plugins", "api_tool.call_tool", "api_tool.suggest_installs", "api_tool.list_resources"].some((r) => recipient.includes(r))) {
      return true;
    }

    if (["code", "execution", "tool", "tool_call", "search_query", "search_result"].includes(messageType)) {
      return true;
    }

    if (contentType === "code" && recipient && recipient !== "all") {
      return true;
    }

    const parts = Array.isArray(msg.content?.parts) ? msg.content.parts : [msg.content?.text];
    for (const part of parts) {
      if (typeof part === "string" && isApiInternalFileIngestionText(part)) {
        return true;
      }
    }

    return false;
  }

  function isTruthyApiFlag(value) {
    return value === true || String(value || "").toLowerCase() === "true";
  }

  function looksLikeInternalApiToolCall(markdown) {
    const text = String(markdown || "").trim();

    return /^search\(/i.test(text)
      || /^\{\s*"search_query"\s*:/i.test(text)
      || /^\{\s*"queries"\s*:/i.test(text);
  }

  function looksLikeApiJsonPayload(markdown) {
    const text = String(markdown || "").trim();
    return /^[{[]/.test(text) && /["'}\]]$/.test(text);
  }

  function incrementReasonCount(stats, reason) {
    if (!isReportableApiSkipReason(reason)) {
      return;
    }

    stats[reason] = (stats[reason] || 0) + 1;
  }

  function isReportableApiSkipReason(reason) {
    return !["missing-message", "unsupported-role"].includes(reason);
  }

  function getConversationApiCurrentPath(data) {
    const mapping = getConversationApiMapping(data);
    const currentNode = getConversationApiCurrentNode(data);
    const path = [];
    const seen = new Set();
    let nodeId = currentNode;

    while (nodeId && mapping[nodeId] && !seen.has(nodeId)) {
      seen.add(nodeId);
      const node = mapping[nodeId];
      path.push(node);
      nodeId = node.parent || node.parent_id || "";
    }

    if (path.length) {
      return path.reverse();
    }

    if (Object.keys(mapping).length) {
      return Object.values(mapping);
    }

    return getConversationApiLinearMessages(data)
      .map((message, index) => ({
        id: message?.id || `api-message-${index + 1}`,
        message
      }));
  }

  function getConversationApiMapping(data) {
    const candidates = [
      data?.mapping,
      data?.conversation?.mapping,
      data?.data?.mapping
    ];

    return candidates.find((value) => value && typeof value === "object" && !Array.isArray(value)) || {};
  }

  function getConversationApiCurrentNode(data) {
    return data?.current_node
      || data?.currentNode
      || data?.conversation?.current_node
      || data?.conversation?.currentNode
      || data?.data?.current_node
      || data?.data?.currentNode
      || "";
  }

  function getConversationApiLinearMessages(data) {
    return getConversationApiRawMessages(data)
      ?.map((item) => item?.message || item)
      .filter((message) => message && typeof message === "object") || [];
  }

  function cleanApiMarkdown(value) {
    return cleanMarkdown(removeApiPrivateUseArtifacts(value));
  }

  function removeApiPrivateUseArtifacts(value) {
    return String(value || "")
      .replace(/[\uE000-\uF8FF]+(?:file|web|mem)?cite(?:[\uE000-\uF8FF]+[0-9A-Za-z_-]+)*[\uE000-\uF8FF]*/gi, "")
      .replace(/\bfileL\d+(?:-L\d+)?\b/gi, "")
      .replace(/[\uE000-\uF8FF]+/g, "")
      .replace(/[ \t]+\n/g, "\n");
  }

  function extractApiContentMarkdown(content) {
    if (!content || typeof content !== "object") {
      return "";
    }

    const parts = Array.isArray(content.parts) ? content.parts : [];

    if (parts.length) {
      return cleanMarkdown(parts
        .map((part) => apiContentPartToMarkdown(part))
        .filter(Boolean)
        .join("\n\n"));
    }

    const candidates = [
      content.text,
      content.result,
      content.summary,
      content.value
    ].filter((value) => typeof value === "string" && value.trim());

    return cleanMarkdown(candidates.join("\n\n"));
  }

  function apiContentPartToMarkdown(part) {
    if (typeof part === "string") {
      return part;
    }

    if (!part || typeof part !== "object") {
      return "";
    }

    const assetPointer = part.asset_pointer || part.assetPointer || part.url || "";

    if (assetPointer) {
      const label = sanitizeApiMarkdownLabel(
        part.name
        || part.file_name
        || part.filename
        || part.title
        || "Image"
      );

      if (/image|img|picture/i.test(`${part.content_type || ""} ${part.mime_type || ""} ${assetPointer}`)) {
        return `![${label}](${assetPointer})`;
      }

      return `[Attachment: ${assetPointer}]`;
    }

    const textCandidates = [
      part.text,
      part.content,
      part.transcript,
      part.caption,
      part.name
    ].filter((value) => typeof value === "string" && value.trim());

    if (textCandidates.length) {
      return textCandidates.join("\n\n");
    }

    return "";
  }

  function extractApiAttachmentMarkdown(message) {
    const attachments = getApiAttachmentObjects(message);
    const hasImageAssetPointer = getApiMessageImageAssetPointers(message).length > 0;
    const lines = attachments
      .map((attachment) => hasImageAssetPointer && isApiImageAttachment(attachment)
        ? ""
        : formatApiAttachmentMarkdown(attachment)
      )
      .filter(Boolean);

    return uniqueStrings(lines).join("\n");
  }

  function getApiMessageImageAssetPointers(message) {
    const parts = Array.isArray(message?.content?.parts) ? message.content.parts : [];

    return parts
      .filter((part) => part && typeof part === "object")
      .map((part) => {
        const assetPointer = part.asset_pointer || part.assetPointer || part.url || "";
        const descriptor = [
          part.content_type,
          part.contentType,
          part.mime_type,
          part.mimeType,
          part.name,
          part.file_name,
          part.filename,
          part.title,
          assetPointer
        ].join(" ");

        return /image|img|picture|\bpng\b|\bjpe?g\b|\bwebp\b|\bgif\b/i.test(descriptor)
          ? assetPointer
          : "";
      })
      .filter(Boolean);
  }

  function getApiAttachmentObjects(message) {
    const metadata = message?.metadata || {};
    const candidates = [
      metadata.attachments,
      metadata.files,
      metadata.uploaded_files,
      metadata.uploadedFiles
    ];

    return candidates
      .filter(Array.isArray)
      .flat()
      .filter((attachment) => attachment && typeof attachment === "object");
  }

  function formatApiAttachmentMarkdown(attachment) {
    const name = attachment.name
      || attachment.file_name
      || attachment.filename
      || attachment.title
      || attachment.id
      || "";
    const url = attachment.url || attachment.download_url || attachment.file_url || "";

    if (!name && !url) {
      return "";
    }

    return url
      ? `[File: ${sanitizeFileAttachmentName(name || filenameFromUrl(url) || "attachment")}](${url})`
      : `[File: ${sanitizeFileAttachmentName(name)}]`;
  }

  function countApiFileAttachments(message) {
    const hasImageAssetPointer = getApiMessageImageAssetPointers(message).length > 0;
    return getApiAttachmentObjects(message)
      .filter((attachment) => !(hasImageAssetPointer && isApiImageAttachment(attachment)))
      .length;
  }

  function isApiImageHaystack(haystack) {
    const text = String(haystack || "");
    return /\bimage\b|image\/|img|picture|\.(?:png|jpe?g|gif|webp|avif|bmp|svg)(?:$|[?#])|sediment:\/\/|file_000/i.test(text);
  }

  function isApiImageAttachment(attachment) {
    const haystack = [
      attachment?.mime_type,
      attachment?.mimeType,
      attachment?.content_type,
      attachment?.contentType,
      attachment?.name,
      attachment?.file_name,
      attachment?.filename,
      attachment?.title,
      attachment?.url,
      attachment?.download_url,
      attachment?.file_url
    ].join(" ");

    return isApiImageHaystack(haystack);
  }

  function sanitizeApiMarkdownLabel(value) {
    return String(value || "Image")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160)
      .replace(/[[\]\\]/g, "\\$&")
      || "Image";
  }

  function extractApiGeneratedFilesMarkdown(message) {
    const metadata = message?.metadata || {};
    const files = [];

    // Check aggregate_result
    const aggregate = metadata.aggregate_result;
    if (aggregate?.status === "success" && typeof aggregate.final_expression_output === "string") {
      const match = aggregate.final_expression_output.match(/name:\s*([^\n]+)/);
      if (match && !files.some((f) => f.name === match[1].trim())) {
        files.push({ name: match[1].trim(), url: "" });
      }
    }

    // Check sandbox files in the displayed text; DIL parts hold component
    // source, so DIL messages are read from their fallback Markdown.
    const parts = isDilMessage(message)
      ? [getDilFallbackMarkdown(message)]
      : (Array.isArray(message?.content?.parts) ? message.content.parts : []);
    for (const part of parts) {
      if (typeof part === "string") {
        const sandboxMatches = [...part.matchAll(/\[([^\]]+)\]\((sandbox:[^)]+)\)/g)];
        for (const match of sandboxMatches) {
          if (!files.some((f) => f.url === match[2])) {
            files.push({ name: match[1], url: match[2] });
          }
        }
      }
    }

    if (!files.length) {
      return "";
    }

    return files.map((file) => file.url ? `📥 **Generated File**: [${file.name}](${file.url})` : `📥 **Generated Artifact**: ${file.name}`).join("\n");
  }

  // Current ChatGPT cites an uploaded document with an inline component tag,
  // <FileCite ref="turn2file0" line_range_start={785} line_range_end={809}/>,
  // where older versions used the fileciteturn0file0 token.
  const API_FILE_CITE_TAG_RE = /<FileCite\b[^>]*\/>/g;

  function enrichApiMarkdownWithCitations(markdown, message) {
    const citations = Array.isArray(message?.metadata?.citations) ? message.metadata.citations : [];
    if (!citations.length) {
      return markdown.replace(API_FILE_CITE_TAG_RE, "");
    }

    let enriched = markdown;
    const footnotes = [];
    // One uploaded document is often cited once per passage; it gets one
    // footnote line however many citation records point at it.
    const footnoteIndexByLine = new Map();

    citations.forEach((citation, index) => {
      const title = citation?.metadata?.title
        || citation?.title
        || citation?.metadata?.name
        || citation?.name
        || `Source ${index + 1}`;
      const url = citation?.metadata?.url
        || citation?.url
        || citation?.metadata?.cloud_doc_url
        || citation?.metadata?.extra?.url
        || citation?.metadata?.search_result?.url
        || citation?.metadata?.search_result?.link
        || citation?.link
        || "";

      const source = url ? `[${title}](${url})` : `📄 **Document**: ${title}`;
      let footnoteIndex = footnoteIndexByLine.get(source);

      if (!footnoteIndex) {
        footnoteIndex = footnotes.length + 1;
        footnoteIndexByLine.set(source, footnoteIndex);
        footnotes.push(`[^${footnoteIndex}]: ${source}`);
      }

      // Replace matching citation tokens if present
      const markerPattern = new RegExp(`<FileCite\\b[^>]*/>|fileciteturn\\d+file\\d+L\\d+-L\\d+|fileciteturn\\d+file\\d+|【\\d+:\\d+†source】|【\\d+†source】|【turn\\d+search\\d+】`, "g");
      enriched = enriched.replace(markerPattern, `[^${footnoteIndex}]`);
    });

    // Remove any remaining raw citation tokens and normalize footnote spacing
    enriched = enriched
      .replace(API_FILE_CITE_TAG_RE, "")
      .replace(/(?:file|web|mem)?citeturn\w+(?:L\d+-L\d+)?/gi, "")
      .replace(/\bfileL\d+(?:-L\d+)?\b/gi, "")
      .replace(/【\d+(?::\d+)?†source】/gi, "")
      .replace(/【turn\d+search\d+】/gi, "")
      .replace(/[ \t]+(\[\^\d+\])/g, " $1");

    if (footnotes.length) {
      enriched = enriched.trim() + "\n\n" + footnotes.join("\n");
    }

    return enriched;
  }

  function enrichApiMarkdownWithMemories(markdown, message) {
    const memories = Array.isArray(message?.metadata?.conversation_context_citation_metadata)
      ? message.metadata.conversation_context_citation_metadata
      : [];

    let enriched = markdown.replace(/memcite/gi, "");

    if (!memories.length) {
      return enriched;
    }

    const memoryLines = memories
      .map((item) => {
        const citation = item?.citation;
        if (!citation) return "";
        const title = citation.title || citation.snippet || "";
        const attribution = citation.attribution || "Memory";
        const url = citation.url || "";
        return url
          ? `> - **${attribution}**: [${title}](${url})`
          : `> - **${attribution}**: ${title}`;
      })
      .filter(Boolean);

    if (memoryLines.length) {
      enriched = enriched.trim() + "\n\n> 🧠 **Memory & Context**:\n" + memoryLines.join("\n");
    }

    return enriched;
  }

  function getCurrentConversationId() {
    if (activeExportContext?.conversationId) {
      return activeExportContext.conversationId;
    }

    if (getProviderId() === "gemini") {
      return getGeminiConversationId();
    }

    const pathParts = location.pathname.split("/").map(decodePathPart).filter(Boolean);
    const conversationSegmentIndex = pathParts.findIndex((part) => part === "c");
    const id = conversationSegmentIndex >= 0 ? pathParts[conversationSegmentIndex + 1] : "";

    if (id && /^[a-z0-9_-]{8,}$/i.test(id)) {
      return id;
    }

    const queryId = new URLSearchParams(location.search).get("conversation_id") || "";
    return /^[a-z0-9_-]{8,}$/i.test(queryId) ? queryId : "";
  }

  function decodePathPart(part) {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  }

  async function fetchConversationData(conversationId, options = {}) {
    const debugLog = options.debugLog || null;
    const signal = options.signal || null;
    throwIfCaptureCancelled(signal);
    const timeoutMs = Number(options.timeoutMs || CONVERSATION_API_FETCH_TIMEOUT_MS);
    const attemptTimeoutMs = Math.min(timeoutMs, CONVERSATION_API_ATTEMPT_TIMEOUT_MS);
    const accessToken = await getChatGptAccessToken(debugLog, attemptTimeoutMs, signal);
    throwIfCaptureCancelled(signal);
    const attempts = buildConversationApiAttempts(conversationId, accessToken);
    const failures = [];

    debugLog?.event("conversationApi.probe.start", {
      conversationId,
      attempts: attempts.length,
      accessTokenAvailable: Boolean(accessToken)
    });

    for (const attempt of attempts) {
      throwIfCaptureCancelled(signal);
      try {
        let data = await fetchConversationApiAttempt(attempt, attemptTimeoutMs, signal);
        data = await fetchRemainingConversationApiPages(data, attempt, {
          timeoutMs: attemptTimeoutMs,
          signal,
          debugLog,
          onProgress: options.onProgress
        });
        throwIfCaptureCancelled(signal);
        const mapping = getConversationApiMapping(data);
        const linearMessages = getConversationApiLinearMessages(data);
        const mappingCount = Object.keys(mapping).length;

        if (!mappingCount && !linearMessages.length) {
          failures.push(`${attempt.label}: empty response`);
          debugLog?.event("conversationApi.probe.empty", {
            label: attempt.label
          });
          continue;
        }

        Object.defineProperty(data, "__convoVaultApiSource", {
          value: attempt.label,
          enumerable: false,
          configurable: true
        });
        debugLog?.event("conversationApi.probe.success", {
          label: attempt.label,
          mappingCount,
          linearMessageCount: linearMessages.length
        });
        return data;
      } catch (error) {
        if (isCaptureCancelledError(error)) {
          throw error;
        }
        const reason = error?.message || String(error);
        failures.push(`${attempt.label}: ${reason}`);
        debugLog?.event("conversationApi.probe.failed", {
          label: attempt.label,
          reason
        });
      }
    }

    throw new Error(`Conversation API attempts failed after ${failures.length} route(s): ${summarizeConversationApiFailures(failures)}.`);
  }

  function summarizeConversationApiFailures(failures) {
    const counts = new Map();

    for (const failure of failures) {
      const reason = String(failure || "").split(": ").slice(1).join(": ") || "unknown";
      const key = reason
        .replace(/bearer:[^;]+/g, "bearer route")
        .replace(/cookie:[^;]+/g, "cookie route");
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    return [...counts.entries()]
      .map(([reason, count]) => count > 1 ? `${reason} x${count}` : reason)
      .join(", ");
  }

  function buildConversationApiAttempts(conversationId, accessToken = "") {
    const encodedId = encodeURIComponent(conversationId);
    // The full tree arrives in one request (about 10 s for 2,700 nodes); the
    // paginated route costs 5-8 s per page regardless of page size, so it is
    // the fallback, and only with the largest page size.
    const paths = uniqueStrings([
      `/backend-api/conversation/${encodedId}`,
      `/backend-api/conversations/${encodedId}?include_has_versions=true&num_turns=${FAST_CONVERSATION_API_PAGE_SIZE}`,
      `/backend-api/conversations/${encodedId}`,
      `/backend-api/conversation/${encodedId}?tree_format=true`,
      `/backend-api/conversation/${encodedId}?tree_format=false`,
      `/backend-api/conversation/${encodedId}?include_system_messages=true`,
      `/backend-api/conversation/${encodedId}?tree_format=true&include_system_messages=true`,
      ...buildConversationRouteDataPaths()
    ]);
    const authModes = accessToken ? ["bearer", "cookie"] : ["cookie"];
    const attempts = [];

    for (const authMode of authModes) {
      for (const path of paths) {
        const url = new URL(path, location.origin);
        const isRouteData = url.searchParams.has("_data");
        attempts.push({
          label: `${authMode}:${url.pathname}${url.search}`,
          url: url.href,
          authMode,
          accessToken,
          pagination: /^\/backend-api\/conversations\//i.test(url.pathname) ? "before" : "",
          headers: isRouteData ? { "x-remix-request": "yes" } : {}
        });
      }
    }

    return attempts;
  }

  async function fetchRemainingConversationApiPages(initialData, attempt, options = {}) {
    if (attempt?.pagination !== "before") {
      return initialData;
    }

    const signal = options.signal || null;
    const debugLog = options.debugLog || null;
    const timeoutMs = Number(options.timeoutMs || CONVERSATION_API_ATTEMPT_TIMEOUT_MS);
    let mergedData = initialData;
    let pageData = initialData;
    let pageCount = 1;
    let totalRawMessages = getConversationApiRawMessages(initialData).length;
    const seenCursors = new Set();

    while (conversationApiHasPreviousPage(pageData)) {
      throwIfCaptureCancelled(signal);
      const pageInfo = getConversationApiPageInfo(pageData);
      const cursor = String(pageInfo?.start_cursor || pageInfo?.startCursor || "").trim();

      if (!cursor) {
        throw new Error("pagination response is missing start_cursor");
      }

      if (seenCursors.has(cursor)) {
        throw new Error("pagination cursor repeated");
      }

      if (pageCount >= FAST_CONVERSATION_API_MAX_PAGES) {
        throw new Error(`pagination exceeded ${FAST_CONVERSATION_API_MAX_PAGES} pages`);
      }

      seenCursors.add(cursor);
      const pageUrl = new URL(attempt.url);
      pageUrl.searchParams.set("before", cursor);
      const pageAttempt = {
        ...attempt,
        label: `${attempt.label}:older-page-${pageCount + 1}`,
        url: pageUrl.href
      };

      pageData = await fetchConversationApiAttempt(pageAttempt, timeoutMs, signal);
      throwIfCaptureCancelled(signal);
      const pageMessages = getConversationApiRawMessages(pageData);

      if (!pageMessages.length) {
        throw new Error("pagination returned an empty older page");
      }

      mergedData = mergeConversationApiPages(pageData, mergedData);
      pageCount += 1;
      totalRawMessages = getConversationApiRawMessages(mergedData).length;
      options.onProgress?.(`Loading conversation data: page ${pageCount}, ${totalRawMessages} messages...`);
      debugLog?.event("conversationApi.pagination.page", {
        label: attempt.label,
        pageCount,
        pageMessageCount: pageMessages.length,
        totalRawMessages,
        hasPreviousPage: conversationApiHasPreviousPage(pageData)
      });
    }

    if (pageCount > 1) {
      debugLog?.event("conversationApi.pagination.complete", {
        label: attempt.label,
        pageCount,
        totalRawMessages
      });
    }

    return mergedData;
  }

  function mergeConversationApiPages(olderPage, newerPage) {
    const olderMessages = getConversationApiRawMessages(olderPage);
    const newerMessages = getConversationApiRawMessages(newerPage);
    const combined = [...olderMessages, ...newerMessages];
    const lastIndexById = new Map();

    combined.forEach((item, index) => {
      const id = getConversationApiRawMessageId(item);
      if (id) {
        lastIndexById.set(id, index);
      }
    });

    const messages = combined.filter((item, index) => {
      const id = getConversationApiRawMessageId(item);
      return !id || lastIndexById.get(id) === index;
    });
    const olderPageInfo = getConversationApiPageInfo(olderPage);
    const newerPageInfo = getConversationApiPageInfo(newerPage);
    const pageInfo = {
      ...(newerPageInfo || {}),
      start_cursor: olderPageInfo?.start_cursor ?? olderPageInfo?.startCursor ?? newerPageInfo?.start_cursor,
      has_previous_page: conversationApiHasPreviousPage(olderPage),
      end_cursor: newerPageInfo?.end_cursor ?? newerPageInfo?.endCursor ?? olderPageInfo?.end_cursor,
      has_next_page: newerPageInfo?.has_next_page ?? newerPageInfo?.hasNextPage ?? false
    };

    return setConversationApiMessagesAndPageInfo(newerPage, messages, pageInfo);
  }

  function getConversationApiRawMessages(data) {
    const candidates = [
      data?.messages,
      data?.items,
      data?.linear_conversation,
      data?.linearConversation,
      data?.conversation?.messages,
      data?.conversation?.items,
      data?.conversation?.linear_conversation,
      data?.data?.messages,
      data?.data?.items,
      data?.data?.linear_conversation
    ];

    return candidates.find(Array.isArray) || [];
  }

  function getConversationApiRawMessageId(item) {
    const message = item?.message || item;
    return String(message?.id || message?.message_id || item?.id || "").trim();
  }

  function getConversationApiPageInfo(data) {
    const candidates = [
      data?.page_info,
      data?.pageInfo,
      data?.conversation?.page_info,
      data?.conversation?.pageInfo,
      data?.data?.page_info,
      data?.data?.pageInfo
    ];

    return candidates.find((value) => value && typeof value === "object" && !Array.isArray(value)) || null;
  }

  function conversationApiHasPreviousPage(data) {
    const pageInfo = getConversationApiPageInfo(data);
    return pageInfo?.has_previous_page === true || pageInfo?.hasPreviousPage === true;
  }

  function setConversationApiMessagesAndPageInfo(data, messages, pageInfo) {
    if (Array.isArray(data?.conversation?.messages)) {
      return {
        ...data,
        conversation: {
          ...data.conversation,
          messages,
          page_info: pageInfo
        }
      };
    }

    if (Array.isArray(data?.data?.messages)) {
      return {
        ...data,
        data: {
          ...data.data,
          messages,
          page_info: pageInfo
        }
      };
    }

    return {
      ...data,
      messages,
      page_info: pageInfo
    };
  }

  function buildConversationRouteDataPaths() {
    const routes = getConversationRouteDataNames();
    return routes.map((routeName) => {
      const url = new URL(location.href);
      url.searchParams.set("_data", routeName);
      return `${url.pathname}${url.search}`;
    });
  }

  function getConversationRouteDataNames() {
    const pathParts = location.pathname.split("/").map(decodePathPart).filter(Boolean);
    const hasGizmoRoute = pathParts.includes("g") && pathParts.includes("c");
    const routes = [
      "routes/_conversation.c.$conversationId",
      "routes/_conversation"
    ];

    if (hasGizmoRoute) {
      routes.unshift("routes/_conversation.g.$gizmoId.c.$conversationId");
    }

    return uniqueStrings(routes);
  }

  async function fetchConversationApiAttempt(attempt, timeoutMs, signal = null) {
    const headers = {
      accept: "application/json",
      ...(attempt.headers || {})
    };

    if (attempt.authMode === "bearer" && attempt.accessToken) {
      headers.authorization = `Bearer ${attempt.accessToken}`;
    }

    const response = await fetchWithTimeout(attempt.url, {
      timeoutMs,
      signal,
      credentials: "include",
      cache: "no-store",
      headers
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return parseConversationApiResponse(response);
  }

  async function parseConversationApiResponse(response) {
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      return response.json();
    }

    const text = await response.text();

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`non-json response (${contentType || "unknown content-type"})`);
    }
  }

  let cachedChatGptAccessToken = "";
  let chatGptAccessTokenLoaded = false;

  async function getChatGptAccessToken(debugLog = null, timeoutMs = CONVERSATION_API_ATTEMPT_TIMEOUT_MS, signal = null) {
    throwIfCaptureCancelled(signal);
    if (chatGptAccessTokenLoaded) {
      return cachedChatGptAccessToken;
    }

    chatGptAccessTokenLoaded = true;

    let tokenSource = "";

    try {
      const url = new URL("/api/auth/session", location.origin);
      const response = await fetchWithTimeout(url.href, {
        timeoutMs,
        signal,
        credentials: "include",
        cache: "no-store",
        headers: {
          accept: "application/json"
        }
      });

      if (!response.ok) {
        debugLog?.event("conversationApi.token.failed", { status: response.status });
      } else {
        const session = await response.json();
        cachedChatGptAccessToken = extractAccessTokenFromSession(session);
        tokenSource = cachedChatGptAccessToken ? "session-api" : "";
      }
    } catch (error) {
      if (isCaptureCancelledError(error)) {
        chatGptAccessTokenLoaded = false;
        throw error;
      }
      debugLog?.event("conversationApi.token.failed", {
        error: error?.message || String(error)
      });
    }

    if (!cachedChatGptAccessToken) {
      cachedChatGptAccessToken = getChatGptAccessTokenFromPageBootstrap();
      tokenSource = cachedChatGptAccessToken ? "page-bootstrap" : "";
    }

    debugLog?.event("conversationApi.token.loaded", {
      available: Boolean(cachedChatGptAccessToken),
      source: tokenSource
    });
    return cachedChatGptAccessToken;
  }

  function extractAccessTokenFromSession(session) {
    const candidates = [
      session?.accessToken,
      session?.access_token,
      session?.token,
      session?.session?.accessToken,
      session?.session?.access_token,
      session?.session?.token,
      session?.user?.accessToken,
      session?.user?.access_token
    ];

    return String(candidates.find((value) => typeof value === "string" && value.length > 20) || "");
  }

  function getChatGptAccessTokenFromPageBootstrap() {
    const scripts = document.querySelectorAll("script:not([src])");

    for (const script of scripts) {
      const text = String(script?.textContent || "").trim();

      if (!text.includes('"accessToken"') || text.length > 2_000_000) {
        continue;
      }

      try {
        const token = extractAccessTokenFromSession(JSON.parse(text));
        if (token) {
          return token;
        }
      } catch {
        // Ignore non-JSON bootstrap scripts and continue probing.
      }
    }

    return "";
  }

  async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const externalSignal = options.signal || null;
    const timeoutMs = Number(options.timeoutMs || CONVERSATION_API_ATTEMPT_TIMEOUT_MS);
    let timedOut = false;
    const abortFromExternalSignal = () => controller.abort(externalSignal?.reason);

    throwIfCaptureCancelled(externalSignal);
    externalSignal?.addEventListener("abort", abortFromExternalSignal, { once: true });
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const { timeoutMs: _timeoutMs, signal: _signal, ...fetchOptions } = options;
      return await fetch(url, {
        ...fetchOptions,
        signal: controller.signal
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        if (externalSignal?.aborted) {
          throw createCaptureCancelledError(externalSignal.reason);
        }
        throw new Error("timeout");
      }

      throw error;
    } finally {
      window.clearTimeout(timeoutId);
      externalSignal?.removeEventListener("abort", abortFromExternalSignal);
    }
  }

