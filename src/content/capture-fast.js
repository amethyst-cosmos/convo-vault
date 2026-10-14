  const FAST_CONVERSATION_API_PAGE_SIZE = 100;
  const FAST_CONVERSATION_API_MAX_PAGES = 200;

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

  /**
   * Loads only the expected conversation structure. Full capture uses it to
   * order DOM messages and to check completeness; a failure is reported to the
   * caller, which falls back to DOM-only checks.
   */
  async function fetchConversationManifest(debugLog = null, options = {}) {
    const conversationId = getCurrentConversationId();

    if (!conversationId) {
      throw new Error("No conversation id was found in the current URL.");
    }

    const data = await fetchConversationData(conversationId, {
      timeoutMs: CONVERSATION_API_FETCH_TIMEOUT_MS,
      debugLog,
      signal: options.signal || null
    });
    const manifest = buildConversationManifest(data);
    logConversationManifest(manifest, debugLog);
    return manifest;
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

    // 1. Cognitive reasoning extraction (single source of truth for timeline and agentTrace)
    const parsedReasoning = FastThinkingEngine.parseTurnReasoning(nodes, citations, debugLog, turnNumber);
    const thinkingMarkdown = cleanApiMarkdown(FastThinkingEngine.buildTurnThinkingTimeline(parsedReasoning, citations));
    const agentTrace = FastThinkingEngine.extractTurnAgentTrace(parsedReasoning, citations, memories);

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

      // Collect text and image parts
      const content = msg.content;
      if (isDil && !isThinking && !isInternalTool) {
        const fallbackMarkdown = getDilFallbackMarkdown(msg);
        const dilMarkdown = fallbackMarkdown || renderDilSourceAsMarkdown(getApiStringParts(content).join("\n\n"));
        if (markupStats) {
          markupStats.dilMessages += 1;
          if (!fallbackMarkdown) markupStats.dilWithoutFallback += 1;
        }
        if (dilMarkdown.trim()) {
          textParts.push(renderApiResponseMarkup(dilMarkdown, markupContext));
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
            if (ptr && isApiImageHaystack(`${part.content_type || ""} ${part.mime_type || ""} ${ptr}`)) {
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
      preview: truncatePreview(cleanMarkdown(`${markdown}\n${thinkingMarkdown}`), 180),
      sourceMessageId: primaryMessage?.id || id,
      sourceTurnId: id,
      sourceNode: null,
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

  function getApiMessageStructuralSkipReason(message, role) {
    if (!message) {
      return "missing-message";
    }

    if (!role) {
      return "unsupported-role";
    }

    const metadata = message.metadata || {};
    const authorMetadata = message.author?.metadata || {};
    const contentType = normalizeApiField(message.content?.content_type || message.content?.contentType);
    const recipient = normalizeApiField(
      message.recipient
      || metadata.recipient
      || authorMetadata.recipient
    );
    const channel = normalizeApiField(
      message.channel
      || metadata.channel
      || authorMetadata.channel
    );
    const messageType = normalizeApiField(metadata.message_type || metadata.messageType || authorMetadata.message_type);

    if (
      isTruthyApiFlag(metadata.is_visually_hidden_from_conversation)
      || isTruthyApiFlag(metadata.is_hidden)
      || isTruthyApiFlag(metadata.hidden)
      || isTruthyApiFlag(authorMetadata.is_visually_hidden_from_conversation)
      || isTruthyApiFlag(authorMetadata.is_hidden)
      || isTruthyApiFlag(authorMetadata.hidden)
    ) {
      return "hidden";
    }

    if (role === "assistant" && message.end_turn === false) {
      return "assistant-not-final";
    }

    if (role === "assistant" && recipient && !isFinalAssistantRecipient(recipient)) {
      return `recipient:${recipient}`;
    }

    if (role === "assistant" && channel && !isFinalAssistantChannel(channel)) {
      return `channel:${channel}`;
    }

    if (messageType && isInternalApiMessageType(messageType)) {
      return `message-type:${messageType}`;
    }

    if (contentType && !isExportableApiContentType(contentType)) {
      return `content-type:${contentType}`;
    }

    return "";
  }

  function getApiMessageContentSkipReason(message, role, markdown) {
    if (role !== "assistant") {
      return "";
    }

    if (message?.end_turn === true) {
      return "";
    }

    return looksLikeInternalApiToolCall(markdown) ? "tool-call-text" : "";
  }

  function normalizeApiField(value) {
    return String(value || "").trim().toLowerCase();
  }

  function isTruthyApiFlag(value) {
    return value === true || String(value || "").toLowerCase() === "true";
  }

  function isFinalAssistantRecipient(recipient) {
    return ["", "all", "assistant", "user"].includes(recipient);
  }

  function isFinalAssistantChannel(channel) {
    return ["", "all", "final"].includes(channel);
  }

  function isInternalApiMessageType(messageType) {
    return [
      "browser_result",
      "code",
      "execution",
      "execution_output",
      "search_query",
      "search_result",
      "system",
      "tool",
      "tool_call",
      "tool_result"
    ].includes(messageType);
  }

  function isExportableApiContentType(contentType) {
    return [
      "multimodal_text",
      "text"
    ].includes(contentType);
  }

  function looksLikeInternalApiToolCall(markdown) {
    const text = String(markdown || "").trim();

    return /^search\(/i.test(text)
      || /^\{\s*"search_query"\s*:/i.test(text)
      || /^\{\s*"queries"\s*:/i.test(text);
  }

  function extractSkippedApiThinkingMarkdown(message, role, skipReason) {
    if (role !== "assistant" || !isPotentialApiThinkingSkipReason(skipReason)) {
      return "";
    }

    const explicitThinking = cleanApiMarkdown(extractApiThinkingMarkdown(message));
    if (explicitThinking) {
      return explicitThinking;
    }

    const markdown = cleanApiMarkdown(extractApiContentMarkdown(message?.content));
    if (!markdown || looksLikeInternalApiToolCall(markdown) || looksLikeApiJsonPayload(markdown)) {
      return "";
    }

    return markdown;
  }

  function isPotentialApiThinkingSkipReason(reason) {
    return reason === "assistant-not-final"
      || reason === "channel:analysis"
      || reason === "channel:reasoning"
      || reason === "content-type:thoughts"
      || reason === "content-type:reasoning";
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

  function normalizeApiRole(role) {
    const normalized = String(role || "").toLowerCase();

    if (normalized === "user" || normalized === "assistant") {
      return normalized;
    }

    return "";
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

  // ============================================================================
  // FAST THINKING & COGNITIVE REASONING ENGINE
  // ============================================================================

  const FastThinkingEngine = {
    parseTurnReasoning(nodes, citations = [], debugLog = null, turnNumber = null) {
      const thinkingSteps = [];
      const searchSteps = [];
      const toolInvocations = [];
      const fileIngestions = [];
      const internalToolCalls = [];
      let maxDurationSec = 0;
      let recapText = "";
      const seenStepKeys = new Set();

      const safeNodes = Array.isArray(nodes) ? nodes : (nodes ? [nodes] : []);
      const consumedNodeIndices = new Set();

      for (let i = 0; i < safeNodes.length; i++) {
        if (consumedNodeIndices.has(i)) continue;
        const node = safeNodes[i];
        const msg = node?.message;
        if (!msg) continue;

        const role = String(msg.author?.role || "").toLowerCase();
        const recipient = String(msg.recipient || msg.metadata?.recipient || "").toLowerCase();
        const channel = String(msg.channel || msg.metadata?.channel || "").toLowerCase();
        const contentType = String(msg.content?.content_type || "").toLowerCase();
        const metadata = msg.metadata || {};

        const duration = Number(metadata.finished_duration_sec || metadata.thinking_duration_seconds || 0);
        if (duration > maxDurationSec) {
          maxDurationSec = duration;
        }

        // 1. Content Type: reasoning_recap
        if (contentType === "reasoning_recap") {
          const recapContent = typeof msg.content?.content === "string" ? msg.content.content.trim() : "";
          if (recapContent) {
            recapText = recapContent;
          }
          continue;
        }

        // 2. Multi-step Thoughts (msg.content.thoughts array)
        if (Array.isArray(msg.content?.thoughts) && msg.content.thoughts.length) {
          for (const t of msg.content.thoughts) {
            const summary = String(t?.summary || "").trim();
            const content = String(t?.content || "").trim();
            if (!summary && !content) continue;

            const key = `thought:${summary}:${content}`;
            if (seenStepKeys.has(key)) continue;
            seenStepKeys.add(key);

            thinkingSteps.push({
              type: "thinking",
              nodeId: node.id,
              channel: channel || "reasoning",
              summary,
              content,
              duration
            });

            if (summary && !content) {
              debugLog?.fidelityWarning?.({
                turnNumber,
                severity: "info",
                code: "EMPTY_THOUGHT_CONTENT",
                message: `Thought step "${summary}" has no descriptive body in API payload`,
                details: { summary, nodeId: node.id }
              });
            }
          }
          continue;
        }

        // 3. Web Search during Reasoning (is_reasoning or reasoning_title)
        if (
          metadata.reasoning_status === "is_reasoning"
          || (role === "assistant" && contentType === "code" && metadata.reasoning_title)
        ) {
          const title = String(metadata.reasoning_title || "").trim();
          let queries = Array.isArray(metadata.search_queries) ? [...metadata.search_queries] : [];
          const results = [];

          // Scan forward for tool message with search_result_groups
          for (let k = i + 1; k < safeNodes.length; k++) {
            const nextMsg = safeNodes[k]?.message;
            if (!nextMsg) continue;
            if (nextMsg.author?.role !== "tool") break;
            const nextMeta = nextMsg.metadata || {};
            if (Array.isArray(nextMeta.search_result_groups)) {
              consumedNodeIndices.add(k);
              for (const grp of nextMeta.search_result_groups) {
                if (grp?.search_query) queries.push(grp.search_query);
                if (Array.isArray(grp?.entries)) {
                  for (const entry of grp.entries) {
                    if (entry?.url || entry?.title) {
                      results.push({
                        title: entry.title || grp.domain || entry.url || "",
                        url: entry.url || "",
                        snippet: entry.snippet || ""
                      });
                    }
                  }
                }
              }
            }
          }

          queries = uniqueStrings(queries);
          if (title || queries.length || results.length) {
            searchSteps.push({
              type: "searching",
              nodeId: node.id,
              title: title || "联网检索",
              queries,
              results
            });
          }
          continue;
        }

        // 4. Standard Web Searches (recipient === "web.run" / "browser" or metadata search results)
        if (recipient === "web.run" || recipient === "browser" || metadata.search_result_groups || metadata.search_results) {
          const parts = Array.isArray(msg.content?.parts) ? msg.content.parts : [msg.content?.text];
          let queries = [];
          for (const p of parts) {
            if (typeof p === "string") {
              const match = p.match(/"q(?:uery)?"\s*:\s*"([^"]+)"/g);
              if (match) {
                queries.push(...match.map((m) => m.replace(/.*"([^"]+)"$/, "$1")));
              }
            }
          }
          if (Array.isArray(metadata.search_result_groups)) {
            for (const grp of metadata.search_result_groups) {
              if (grp?.search_query) queries.push(grp.search_query);
            }
          }
          queries = uniqueStrings(queries);

          const results = [];
          if (Array.isArray(metadata.search_results)) {
            for (const r of metadata.search_results) {
              if (r?.url || r?.title) {
                results.push({ title: r.title || "", url: r.url || "", snippet: r.snippet || "" });
              }
            }
          }
          if (Array.isArray(metadata.search_result_groups)) {
            for (const grp of metadata.search_result_groups) {
              if (Array.isArray(grp?.entries)) {
                for (const entry of grp.entries) {
                  if (entry?.url || entry?.title) {
                    results.push({ title: entry.title || grp.domain || entry.url || "", url: entry.url || "", snippet: entry.snippet || "" });
                  }
                }
              }
            }
          }

          if (queries.length || results.length) {
            searchSteps.push({
              type: "searching",
              nodeId: node.id,
              title: "联网检索",
              queries,
              results
            });
          }
        }

        // 5. Commentary / Analysis / General Thinking Nodes
        const isCommentary = channel === "commentary" || msg.metadata?.is_thinking_preamble_message === true;
        if (isCommentary || channel === "analysis" || channel === "reasoning" || contentType === "thoughts" || isApiThinkingNode(msg)) {
          const parts = Array.isArray(msg.content?.parts) ? msg.content.parts : [msg.content?.text];
          const text = parts.filter((p) => typeof p === "string" && p.trim()).join("\n");
          if (text && !looksLikeInternalApiToolCall(text) && !looksLikeApiJsonPayload(text)) {
            const key = `text:${channel}:${text}`;
            if (!seenStepKeys.has(key)) {
              seenStepKeys.add(key);
              thinkingSteps.push({
                type: isCommentary ? "commentary" : "thinking",
                nodeId: node.id,
                channel: channel || (isCommentary ? "commentary" : "reasoning"),
                summary: "",
                content: text,
                duration
              });
            }
          }
        }

        // 6. Reasoning Titles metadata fallback
        if (Array.isArray(metadata.reasoning_titles)) {
          for (const title of metadata.reasoning_titles) {
            const cleanTitle = String(title || "").trim();
            if (cleanTitle && !seenStepKeys.has(`title:${cleanTitle}`)) {
              seenStepKeys.add(`title:${cleanTitle}`);
              thinkingSteps.push({
                type: "thinking",
                nodeId: node.id,
                channel: "reasoning",
                summary: cleanTitle,
                content: "",
                duration
              });
            }
          }
        }

        // 7. Fallback simple string thoughts (metadata.reasoning, metadata.thinking, etc.)
        const simpleThoughts = [metadata.reasoning, metadata.reasoning_content, metadata.thinking, metadata.thoughts]
          .filter((v) => typeof v === "string" && v.trim());
        for (const thought of simpleThoughts) {
          if (!looksLikeInternalApiToolCall(thought) && !looksLikeApiJsonPayload(thought)) {
            const key = `simple:${thought}`;
            if (!seenStepKeys.has(key)) {
              seenStepKeys.add(key);
              thinkingSteps.push({
                type: "thinking",
                nodeId: node.id,
                channel: "reasoning",
                summary: "",
                content: thought,
                duration
              });
            }
          }
        }

        // 8. Tool Invocations & Skill Integrations
        if (recipient.includes("google_drive") || recipient.includes("api_tool")) {
          const docCitation = citations.find((c) => c?.metadata?.title || c?.title);
          const docTitle = docCitation?.metadata?.title || docCitation?.title || "";
          toolInvocations.push({
            nodeId: node.id,
            role,
            recipient,
            label: "调用工具",
            icon: "🔌",
            description: `**Google Drive** · ${docTitle ? `读取文档《${docTitle}》` : "查询相关文档"}`
          });
        } else if (recipient === "container.exec" || recipient === "python") {
          const parts = Array.isArray(msg.content?.parts) ? msg.content.parts : [msg.content?.text];
          const codeText = parts.filter((p) => typeof p === "string").join(" ");
          const isSlide = /slides|pptx/i.test(codeText);
          toolInvocations.push({
            nodeId: node.id,
            role,
            recipient,
            label: isSlide ? "调用技能" : "执行代码",
            icon: isSlide ? "🎨" : "⚙️",
            description: isSlide ? "**Slide Generator** · 生成 PPTX 幻灯片演示文稿" : "**Python Sandbox** · 执行数据与资产处理",
            preview: codeText.slice(0, 500)
          });
        } else if (recipient === "dalle.text2im" || recipient.includes("image")) {
          toolInvocations.push({
            nodeId: node.id,
            role,
            recipient,
            label: "生成图像",
            icon: "🖼️",
            description: "**DALL-E** · 渲染多模态视觉设计与图标",
            preview: "image generation"
          });
        }

        // 9. File Ingestion Slices & Internal Tool Execution
        if (role === "tool" || isApiInternalToolCallNode(msg)) {
          const parts = Array.isArray(msg.content?.parts) ? msg.content.parts : [msg.content?.text];
          const rawText = parts.filter((p) => typeof p === "string").join("\n");
          const isFileIngest = isApiInternalFileIngestionText(rawText);

          if (isFileIngest) {
            fileIngestions.push({
              nodeId: node.id,
              recipient,
              sizeBytes: rawText.length,
              rawText
            });
          } else if (rawText) {
            internalToolCalls.push({
              nodeId: node.id,
              role,
              recipient,
              rawContent: rawText,
              preview: rawText.slice(0, 500)
            });
          }
        }
      }

      // Record Turn Diagnostic to debugLog if available
      if (debugLog?.recordThinkingDiagnostic) {
        const stepsWithFullContent = thinkingSteps.filter((s) => s.content && s.summary).length;
        const stepsWithSummaryOnly = thinkingSteps.filter((s) => !s.content && s.summary).length;
        const searchQueriesCount = searchSteps.reduce((sum, s) => sum + s.queries.length, 0);

        debugLog.recordThinkingDiagnostic({
          turnNumber,
          totalSteps: thinkingSteps.length,
          stepsWithFullContent,
          stepsWithSummaryOnly,
          durationSec: maxDurationSec,
          searchQueriesCount,
          toolCallsCount: toolInvocations.length + internalToolCalls.length,
          hasRecap: Boolean(recapText)
        });
      }

      return {
        thinkingSteps,
        searchSteps,
        toolInvocations,
        fileIngestions,
        internalToolCalls,
        maxDurationSec,
        recapText
      };
    },

    buildTurnThinkingTimeline(parsedReasoning, citations = []) {
      const steps = [];
      const seenStepText = new Set();

      function addStep(icon, label, content) {
        const cleanContent = String(content || "").trim();
        if (!cleanContent) return;
        const key = `${label}:${cleanContent}`;
        if (seenStepText.has(key)) return;
        seenStepText.add(key);

        const lines = cleanContent.split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.length > 1) {
          steps.push(`- ${icon} **${label}**: ${lines[0]}`);
          for (let i = 1; i < lines.length; i++) {
            steps.push(`  ${lines[i]}`);
          }
        } else {
          steps.push(`- ${icon} **${label}**: ${cleanContent}`);
        }
      }

      // 1. Thinking Steps (Formatting both summary title and detailed prose)
      for (const step of parsedReasoning.thinkingSteps || []) {
        const summary = step.summary;
        const content = step.content;
        const icon = step.type === "commentary" ? "💬" : "🧠";
        const label = step.type === "commentary" ? "分析计划" : "推理思考";

        if (summary && content && summary !== content) {
          addStep(icon, label, `**${summary}**\n${content}`);
        } else if (summary || content) {
          addStep(icon, label, summary || content);
        }
      }

      // 2. Searches during and outside reasoning
      for (const search of parsedReasoning.searchSteps || []) {
        const title = search.title || "联网检索";
        const queriesText = search.queries?.length ? ` · 检索 \`${search.queries.slice(0, 3).join("`, `")}\`` : "";
        const foundLinks = (search.results || [])
          .filter((r) => r.url)
          .slice(0, 4)
          .map((r) => `[${r.title || r.url}](${r.url})`);
        const linksText = foundLinks.length ? ` · 查阅 ${foundLinks.join(" · ")}` : "";
        addStep("🔍", "网页搜索", `${title}${queriesText}${linksText}`);
      }

      // 3. Tool Invocations
      for (const tool of parsedReasoning.toolInvocations || []) {
        addStep(tool.icon || "🔧", tool.label || "执行工具", tool.description);
      }

      // 4. Recap
      if (parsedReasoning.recapText) {
        addStep("⏱️", "思考总结", parsedReasoning.recapText);
      }

      // 5. Source Citations
      const activeCitations = (citations || [])
        .map((c, i) => {
          const title = c?.metadata?.title || c?.title || c?.metadata?.name || `来源 [${i + 1}]`;
          const url = c?.metadata?.url || c?.url || c?.metadata?.extra?.url || c?.metadata?.cloud_doc_url || "";
          return url ? `[${title}](${url})` : `📄 ${title}`;
        })
        .filter(Boolean);
      if (activeCitations.length) {
        addStep("🌐", "引用来源", activeCitations.slice(0, 6).join(" · "));
      }

      if (!steps.length && (!parsedReasoning.maxDurationSec || parsedReasoning.maxDurationSec === 0)) {
        return "";
      }

      const durationPrefix = parsedReasoning.maxDurationSec > 0
        ? `Worked for ${parsedReasoning.maxDurationSec >= 60 ? `${Math.floor(parsedReasoning.maxDurationSec / 60)}m ${parsedReasoning.maxDurationSec % 60}s` : `${parsedReasoning.maxDurationSec}s`}`
        : "";

      const header = durationPrefix ? `> 💭 **Thinking Process (${durationPrefix})**` : "> 💭 **Thinking Process**";

      if (!steps.length) {
        return header;
      }

      return `${header}\n>\n` + steps.map((s) => `> ${s}`).join("\n");
    },

    extractTurnAgentTrace(parsedReasoning, citations = [], memories = []) {
      const activities = [];
      const thinkingNodes = [];
      const searches = [];

      for (const step of parsedReasoning.thinkingSteps || []) {
        const summary = step.summary;
        const content = step.content;
        const fullSnippet = content || summary;
        thinkingNodes.push({
          nodeId: step.nodeId,
          channel: step.channel,
          contentType: "thoughts",
          durationSeconds: step.duration || parsedReasoning.maxDurationSec,
          summary,
          content: content || summary
        });
        activities.push({
          type: "reasoning",
          channel: step.channel,
          durationSeconds: step.duration || parsedReasoning.maxDurationSec,
          summary,
          snippet: fullSnippet.slice(0, 600)
        });
      }

      for (const search of parsedReasoning.searchSteps || []) {
        searches.push({
          nodeId: search.nodeId,
          recipient: "web.run",
          queries: search.queries,
          results: search.results
        });
        activities.push({
          type: "web_search",
          queries: search.queries,
          title: search.title,
          resultCount: search.results?.length || 0
        });
      }

      for (const file of parsedReasoning.fileIngestions || []) {
        activities.push({
          type: "file_ingestion",
          recipient: file.recipient,
          sizeBytes: file.sizeBytes,
          preview: file.rawText.slice(0, 300)
        });
      }

      for (const tool of parsedReasoning.internalToolCalls || []) {
        activities.push({
          type: "tool_execution",
          role: tool.role,
          recipient: tool.recipient,
          preview: (tool.preview || "").slice(0, 300)
        });
      }

      for (const tool of parsedReasoning.toolInvocations || []) {
        activities.push({
          type: "tool_execution",
          role: tool.role,
          recipient: tool.recipient,
          preview: (tool.preview || tool.description || "").slice(0, 300)
        });
      }

      return {
        activityCount: activities.length,
        activities,
        thinkingNodes,
        searches,
        internalToolCalls: parsedReasoning.internalToolCalls || [],
        fileIngestions: parsedReasoning.fileIngestions || [],
        citations: citations || [],
        memories: memories || []
      };
    },

    extractApiThinkingMarkdown(message) {
      const metadata = message?.metadata || {};
      const durationSec = Number(metadata.finished_duration_sec || metadata.thinking_duration_seconds || 0);
      const durationPrefix = durationSec > 0
        ? `Worked for ${durationSec >= 60 ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s` : `${durationSec}s`}`
        : "";

      const thoughtItems = [];

      // Multi-step thoughts: extract BOTH summary and content
      if (Array.isArray(message?.content?.thoughts)) {
        for (const t of message.content.thoughts) {
          const summary = String(t?.summary || "").trim();
          const content = String(t?.content || "").trim();
          if (summary && content && summary !== content) {
            thoughtItems.push(`**${summary}**\n\n${content}`);
          } else if (content || summary) {
            thoughtItems.push(content || summary);
          }
        }
      }

      // String thoughts fallback
      const candidates = [
        metadata.reasoning,
        metadata.reasoning_content,
        metadata.thinking,
        metadata.thinking_text,
        metadata.thoughts
      ];
      for (const c of candidates) {
        if (typeof c === "string" && c.trim() && !thoughtItems.includes(c.trim())) {
          thoughtItems.push(c.trim());
        }
      }

      if (Array.isArray(metadata.reasoning_titles)) {
        for (const title of metadata.reasoning_titles) {
          if (title && !thoughtItems.some((item) => item.includes(title))) {
            thoughtItems.push(title);
          }
        }
      }

      let thinkingText = thoughtItems.join("\n\n").trim();
      if (durationPrefix && thinkingText) {
        thinkingText = `> 💭 **Thinking Process (${durationPrefix})**\n>\n` + thinkingText.split("\n").map((line) => `> ${line}`).join("\n");
      } else if (durationPrefix && !thinkingText) {
        thinkingText = `> 💭 **Thinking Process (${durationPrefix})**`;
      }

      return thinkingText;
    }
  };

  function buildTurnThinkingTimeline(nodesOrParsed, citations = []) {
    if (nodesOrParsed && Array.isArray(nodesOrParsed.thinkingSteps)) {
      return FastThinkingEngine.buildTurnThinkingTimeline(nodesOrParsed, citations);
    }
    const nodes = Array.isArray(nodesOrParsed) ? nodesOrParsed : (nodesOrParsed ? [nodesOrParsed] : []);
    const parsed = FastThinkingEngine.parseTurnReasoning(nodes, citations);
    return FastThinkingEngine.buildTurnThinkingTimeline(parsed, citations);
  }

  function extractTurnAgentTrace(nodesOrParsed, citations = [], memories = []) {
    if (nodesOrParsed && Array.isArray(nodesOrParsed.thinkingSteps)) {
      return FastThinkingEngine.extractTurnAgentTrace(nodesOrParsed, citations, memories);
    }
    const nodes = Array.isArray(nodesOrParsed) ? nodesOrParsed : (nodesOrParsed ? [nodesOrParsed] : []);
    const parsed = FastThinkingEngine.parseTurnReasoning(nodes, citations);
    return FastThinkingEngine.extractTurnAgentTrace(parsed, citations, memories);
  }

  function extractApiThinkingMarkdown(message) {
    return FastThinkingEngine.extractApiThinkingMarkdown(message);
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

  function enrichApiMarkdownWithCitations(markdown, message) {
    const citations = Array.isArray(message?.metadata?.citations) ? message.metadata.citations : [];
    if (!citations.length) {
      return markdown;
    }

    let enriched = markdown;
    const footnotes = [];

    citations.forEach((citation, index) => {
      const footnoteIndex = index + 1;
      const title = citation?.metadata?.title
        || citation?.title
        || citation?.metadata?.name
        || citation?.name
        || `Source ${footnoteIndex}`;
      const url = citation?.metadata?.url
        || citation?.url
        || citation?.metadata?.cloud_doc_url
        || citation?.metadata?.extra?.url
        || citation?.metadata?.search_result?.url
        || citation?.metadata?.search_result?.link
        || citation?.link
        || "";

      if (url) {
        footnotes.push(`[^${footnoteIndex}]: [${title}](${url})`);
      } else {
        footnotes.push(`[^${footnoteIndex}]: 📄 **Document**: ${title}`);
      }

      // Replace matching citation tokens if present
      const markerPattern = new RegExp(`fileciteturn\\d+file\\d+L\\d+-L\\d+|fileciteturn\\d+file\\d+|【\\d+:\\d+†source】|【\\d+†source】|【turn\\d+search\\d+】`, "g");
      enriched = enriched.replace(markerPattern, `[^${footnoteIndex}]`);
    });

    // Remove any remaining raw citation tokens and normalize footnote spacing
    enriched = enriched
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

  async function enrichMessageTimestamps(messages, debugLog = null, options = {}) {
    const signal = options.signal || null;
    throwIfCaptureCancelled(signal);
    const messagesNeedingApiTime = messages.filter((message) => message?.sourceMessageId);

    if (!messagesNeedingApiTime.length) {
      debugLog?.event("timestamps.skipped", { reason: "no source message ids" });
      return;
    }

    const conversationId = getCurrentConversationId();

    if (!conversationId) {
      debugLog?.event("timestamps.skipped", { reason: "no conversation id in url" });
      return;
    }

    try {
      const data = await fetchConversationData(conversationId, { signal });
      throwIfCaptureCancelled(signal);
      const timestampMap = buildConversationTimestampMap(data);
      let applied = 0;

      for (const message of messagesNeedingApiTime) {
        const timestamp = timestampMap.get(message.sourceMessageId);

        if (timestamp) {
          message.timestamp = timestamp;
          applied += 1;
        }
      }

      debugLog?.event("timestamps.enriched", {
        conversationId,
        available: timestampMap.size,
        applied
      });
    } catch (error) {
      if (isCaptureCancelledError(error)) {
        throw error;
      }
      debugLog?.event("timestamps.failed", {
        conversationId,
        error: error?.message || String(error)
      });
    }
  }

  function getCurrentConversationId() {
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

  function buildConversationTimestampMap(data) {
    const map = new Map();
    const mapping = getConversationApiMapping(data);

    for (const node of Object.values(mapping)) {
      const message = node?.message || {};
      const messageId = message.id || node?.id || "";
      const timestamp = formatConversationTimestamp(
        message.create_time ??
        message.update_time ??
        message.metadata?.create_time ??
        message.metadata?.timestamp
      );

      if (messageId && timestamp) {
        map.set(messageId, timestamp);
      }
    }

    for (const message of getConversationApiLinearMessages(data)) {
      const messageId = String(message?.id || message?.message_id || "").trim();
      const timestamp = formatConversationTimestamp(
        message?.create_time ??
        message?.update_time ??
        message?.metadata?.create_time ??
        message?.metadata?.timestamp
      );

      if (messageId && timestamp) {
        map.set(messageId, timestamp);
      }
    }

    return map;
  }
