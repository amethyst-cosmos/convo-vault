  // ============================================================================
  // CONVERSATION MANIFEST (expected structure from the raw conversation API)
  // ============================================================================
  //
  // The manifest states which messages an export must contain. It is derived
  // from raw API nodes with its own visibility rules and never from exporter
  // output, so the completeness gate compares two independent results:
  //
  //   raw API nodes --buildConversationManifest--> expected entries
  //   raw API nodes --Fast builder / DOM capture--> exported messages
  //
  // Entries are matched by ChatGPT message id, not by position, so a dropped
  // or duplicated message cannot shift every later comparison.

  const MANIFEST_REPLY_STATUS = Object.freeze({
    ANSWER: "answer",
    THINKING_ONLY: "thinking-only",
    INTERRUPTED: "interrupted",
    EMPTY: "empty",
    NO_REPLY: "no-reply"
  });

  /**
   * Builds the expected export structure of the current conversation branch.
   *
   * @returns {{
   *   entries: Array<{ identity: string, role: "user" | "assistant", nodeIds: string[], status: string }>,
   *   gaps: Array<{ userIdentity: string, userNodeId: string, status: string, reason: string, createTime: number | null }>,
   *   nodeIdentity: Map<string, string>,
   *   counts: { pathNodes: number, hiddenNodes: number, user: number, assistant: number }
   * }}
   */
  function buildConversationManifest(data) {
    const pathNodes = getConversationApiCurrentPath(data);
    const entries = [];
    const gaps = [];
    const nodeIdentity = new Map();
    let hiddenNodes = 0;
    let pendingUser = null;
    let pendingReplyNodes = [];

    const closeExchange = () => {
      if (!pendingUser) {
        pendingReplyNodes = [];
        return;
      }

      const reply = classifyManifestReply(pendingReplyNodes);

      if (reply.status === MANIFEST_REPLY_STATUS.ANSWER || reply.status === MANIFEST_REPLY_STATUS.THINKING_ONLY) {
        const identity = `reply:${reply.nodeIds[0]}`;
        entries.push({ identity, role: "assistant", nodeIds: reply.nodeIds, status: reply.status });
        reply.nodeIds.forEach((nodeId) => nodeIdentity.set(nodeId, identity));
      } else {
        gaps.push({
          userIdentity: pendingUser.identity,
          userNodeId: pendingUser.nodeId,
          status: reply.status,
          reason: reply.reason,
          createTime: pendingUser.createTime
        });
      }

      pendingUser = null;
      pendingReplyNodes = [];
    };

    for (const node of pathNodes) {
      const message = node?.message;

      if (!message) {
        continue;
      }

      if (isManifestHiddenMessage(message)) {
        hiddenNodes += 1;
        continue;
      }

      const role = String(message.author?.role || "").toLowerCase();
      const nodeId = String(message.id || node.id || "");

      if (role === "user") {
        closeExchange();
        const identity = `message:${nodeId}`;
        entries.push({ identity, role: "user", nodeIds: [nodeId], status: "prompt" });
        nodeIdentity.set(nodeId, identity);
        pendingUser = {
          identity,
          nodeId,
          createTime: Number.isFinite(Number(message.create_time)) ? Number(message.create_time) : null
        };
        continue;
      }

      if (role === "assistant" || role === "tool") {
        if (!pendingUser) {
          // A reply without a visible prompt (for example a greeting) still
          // belongs in the export when it shows content.
          pendingUser = { identity: "", nodeId: "", createTime: null, synthetic: true };
        }
        pendingReplyNodes.push({ nodeId, message });
      }
    }

    closeExchange();

    // Drop gaps recorded for synthetic prompt placeholders.
    const visibleGaps = gaps.filter((gap) => gap.userIdentity);

    return {
      entries,
      gaps: visibleGaps,
      nodeIdentity,
      counts: {
        pathNodes: pathNodes.length,
        hiddenNodes,
        user: entries.filter((entry) => entry.role === "user").length,
        assistant: entries.filter((entry) => entry.role === "assistant").length
      }
    };
  }

  function isManifestHiddenMessage(message) {
    const metadata = message?.metadata || {};
    const authorMetadata = message?.author?.metadata || {};
    return [
      metadata.is_visually_hidden_from_conversation,
      metadata.is_hidden,
      metadata.hidden,
      authorMetadata.is_visually_hidden_from_conversation,
      authorMetadata.is_hidden,
      authorMetadata.hidden
    ].some((value) => value === true || String(value || "").toLowerCase() === "true");
  }

  function classifyManifestReply(replyNodes) {
    const nodeIds = replyNodes.map((entry) => entry.nodeId).filter(Boolean);

    if (!replyNodes.length) {
      return {
        status: MANIFEST_REPLY_STATUS.NO_REPLY,
        reason: "ChatGPT stored no assistant message after this prompt.",
        nodeIds
      };
    }

    const messages = replyNodes.map((entry) => entry.message);

    if (messages.some(hasManifestAnswerContent)) {
      return { status: MANIFEST_REPLY_STATUS.ANSWER, reason: "", nodeIds };
    }

    if (messages.some(hasManifestThinkingContent)) {
      return { status: MANIFEST_REPLY_STATUS.THINKING_ONLY, reason: "", nodeIds };
    }

    const interrupted = messages.find((message) => {
      const finish = message?.metadata?.finish_details || {};
      return String(finish.type || "").toLowerCase() === "interrupted";
    });

    if (interrupted) {
      const finishReason = String(interrupted.metadata.finish_details.reason || "interrupted");
      return {
        status: MANIFEST_REPLY_STATUS.INTERRUPTED,
        reason: `The response was stopped before it produced content (${finishReason}).`,
        nodeIds
      };
    }

    return {
      status: MANIFEST_REPLY_STATUS.EMPTY,
      reason: "The stored response has no visible content.",
      nodeIds
    };
  }

  /**
   * A reply shows an answer when an assistant message addressed to the user
   * (not a tool call or reasoning channel) carries text, DIL fallback Markdown,
   * or media; or when any reply node carries an image or generated file.
   */
  function hasManifestAnswerContent(message) {
    if (!message) {
      return false;
    }

    const role = String(message.author?.role || "").toLowerCase();
    const parts = Array.isArray(message.content?.parts) ? message.content.parts : [];

    if (parts.some(isManifestMediaPart)) {
      return true;
    }

    if (role !== "assistant") {
      return false;
    }

    const recipient = String(message.recipient || "").toLowerCase();
    const channel = String(message.channel || "").toLowerCase();
    const contentType = String(message.content?.content_type || "").toLowerCase();

    if (recipient && recipient !== "all") {
      return false;
    }

    if (channel && channel !== "final") {
      return false;
    }

    if (!["text", "multimodal_text"].includes(contentType)) {
      return false;
    }

    const dilFallback = message.metadata?.model_dil_v2?.fallbackMarkdown;

    if (typeof dilFallback === "string" && dilFallback.trim()) {
      return true;
    }

    return parts.some((part) => typeof part === "string" && part.trim());
  }

  function isManifestMediaPart(part) {
    if (!part || typeof part !== "object") {
      return false;
    }

    const pointer = String(part.asset_pointer || part.assetPointer || "");
    return Boolean(pointer) && /image|file-service|sediment/i.test(`${part.content_type || ""} ${pointer}`);
  }

  function hasManifestThinkingContent(message) {
    const content = message?.content || {};
    const contentType = String(content.content_type || "").toLowerCase();

    if (contentType === "thoughts") {
      return Array.isArray(content.thoughts)
        && content.thoughts.some((thought) => String(thought?.summary || thought?.content || "").trim());
    }

    if (contentType === "reasoning_recap") {
      return typeof content.content === "string" && Boolean(content.content.trim());
    }

    // Commentary preambles appear in ChatGPT's activity timeline.
    if (String(message?.channel || "").toLowerCase() === "commentary") {
      const parts = Array.isArray(content.parts) ? content.parts : [];
      return parts.some((part) => typeof part === "string" && part.trim());
    }

    return false;
  }

  /**
   * Resolves the manifest identity of an exported message from any ChatGPT
   * message id it carries. Returns "" when the message is not in the manifest.
   */
  function resolveManifestIdentity(manifest, message) {
    for (const id of getCapturedSourceMessageIds(message)) {
      const identity = manifest.nodeIdentity.get(id);

      if (identity) {
        return identity;
      }
    }

    return "";
  }

  function getCapturedSourceMessageIds(message) {
    return [
      message?.sourceMessageId,
      ...(Array.isArray(message?.sourceMessageIds) ? message.sourceMessageIds : []),
      message?.sourceTurnId
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
  }

  /**
   * Compares exported messages with the manifest. The returned report has the
   * same fields as buildCaptureCompletenessReport so the selector UI, the
   * export gate, and the debug log treat both sources alike.
   */
  function buildManifestCompletenessReport(messages, manifest, options = {}) {
    const captureMode = normalizeCaptureMode(options.captureMode);
    const expectedIdentities = manifest.entries.map((entry) => entry.identity);
    const expectedIdentitySet = new Set(expectedIdentities);
    const capturedIdentities = [];
    const unmatchedMessages = [];
    const duplicateIdentities = [];

    messages.forEach((message, index) => {
      const identity = resolveManifestIdentity(manifest, message);

      if (!identity) {
        unmatchedMessages.push({
          index,
          role: message?.role || "",
          preview: truncatePreview(String(message?.preview || message?.markdown || ""), 120)
        });
        return;
      }

      if (capturedIdentities.includes(identity)) {
        duplicateIdentities.push(identity);
        return;
      }

      capturedIdentities.push(identity);
    });

    const capturedIdentitySet = new Set(capturedIdentities);
    const missingEntries = manifest.entries.filter((entry) => !capturedIdentitySet.has(entry.identity));
    const roleSequence = getRoleSequenceDiagnostics(messages);
    const imageStats = getCaptureImageCompletenessStats(messages);
    const reconciliationReport = options.reconciliationReport || {};
    const substantiveFullOnlyMessages = Number(reconciliationReport.substantiveFullOnlyMessages || 0);
    const expectedUser = manifest.counts.user;
    const expectedAssistant = manifest.counts.assistant;
    const issues = [];
    const warnings = [];

    if (missingEntries.length) {
      const missingUser = missingEntries.filter((entry) => entry.role === "user").length;
      const missingAssistant = missingEntries.length - missingUser;
      issues.push({
        code: "missing-identities",
        message: `Missing ${missingEntries.length} expected message(s): ${missingUser} user, ${missingAssistant} assistant.`,
        missing: missingEntries.slice(0, 50).map((entry) => ({
          identity: entry.identity,
          role: entry.role,
          position: expectedIdentities.indexOf(entry.identity) + 1
        }))
      });
    }

    if (roleSequence.userMessages < expectedUser) {
      issues.push({
        code: "missing-user-messages",
        message: `Captured ${roleSequence.userMessages}/${expectedUser} expected user messages.`
      });
    }

    if (roleSequence.assistantMessages < expectedAssistant) {
      issues.push({
        code: "missing-assistant-messages",
        message: `Captured ${roleSequence.assistantMessages}/${expectedAssistant} expected assistant messages.`
      });
    }

    if (!isManifestOrderPreserved(messages, manifest)) {
      issues.push({
        code: "order-mismatch",
        message: "Captured messages are not in conversation order."
      });
    }

    if (imageStats.failures > 0) {
      issues.push({
        code: "image-failures",
        message: `${imageStats.failures} image reference(s) failed during capture.`
      });
    }

    if (captureMode === "hybrid" && substantiveFullOnlyMessages > 0) {
      issues.push({
        code: "hybrid-full-only-messages",
        message: `Hybrid found ${substantiveFullOnlyMessages} substantive Full-only message(s); use Full to retain them.`
      });
    }

    if (unmatchedMessages.length) {
      warnings.push({
        code: "unmatched-messages",
        message: `${unmatchedMessages.length} captured message(s) have no ChatGPT message id in the conversation branch.`,
        samples: unmatchedMessages.slice(0, 12)
      });
    }

    if (duplicateIdentities.length) {
      warnings.push({
        code: "duplicate-identities",
        message: `${duplicateIdentities.length} captured message(s) repeat an earlier message.`,
        identities: duplicateIdentities.slice(0, 20)
      });
    }

    if (roleSequence.sameRolePairs.length) {
      warnings.push({
        code: "same-role-adjacency",
        message: formatSameRoleAdjacencyWarning(roleSequence.sameRolePairs.length, manifest.gaps),
        pairs: roleSequence.sameRolePairs,
        explainedBy: manifest.gaps
      });
    }

    const complete = issues.length === 0;
    return {
      complete,
      requiresOverride: !complete,
      captureMode,
      coverageKnown: true,
      expectedSource: "conversation-api-manifest",
      expected: {
        uniqueIdentities: expectedIdentities.length,
        conversationOrders: [],
        userMessages: expectedUser,
        assistantMessages: expectedAssistant,
        startRole: manifest.entries[0]?.role || "",
        endRole: manifest.entries[manifest.entries.length - 1]?.role || "",
        sameRoleAdjacencies: manifest.gaps.length,
        replyGaps: manifest.gaps
      },
      captured: {
        messages: messages.length,
        uniqueIdentities: capturedIdentities.filter((identity) => expectedIdentitySet.has(identity)).length,
        conversationOrders: [],
        userMessages: roleSequence.userMessages,
        assistantMessages: roleSequence.assistantMessages,
        startRole: messages[0]?.role || "",
        endRole: messages[messages.length - 1]?.role || "",
        sameRoleAdjacencies: roleSequence.sameRolePairs
      },
      missingConversationOrders: missingEntries.map((entry) => expectedIdentities.indexOf(entry.identity) + 1),
      missingIdentities: missingEntries.map((entry) => entry.identity),
      images: imageStats,
      hybrid: {
        substantiveFullOnlyMessages,
        substantiveFullOnlyAssistantMessages: Number(reconciliationReport.substantiveFullOnlyAssistantMessages || 0),
        substantiveSamples: reconciliationReport.substantiveSamples || []
      },
      issues,
      warnings
    };
  }

  function isManifestOrderPreserved(messages, manifest) {
    const positionByIdentity = new Map(manifest.entries.map((entry, index) => [entry.identity, index]));
    let previous = -1;

    for (const message of messages) {
      const position = positionByIdentity.get(resolveManifestIdentity(manifest, message));

      if (position == null) {
        continue;
      }

      if (position < previous) {
        return false;
      }

      previous = position;
    }

    return true;
  }

  function formatSameRoleAdjacencyWarning(pairCount, gaps) {
    const byStatus = gaps.reduce((counts, gap) => {
      counts[gap.status] = (counts[gap.status] || 0) + 1;
      return counts;
    }, {});
    const reasons = [
      byStatus[MANIFEST_REPLY_STATUS.INTERRUPTED] ? `${byStatus[MANIFEST_REPLY_STATUS.INTERRUPTED]} stopped before any content` : "",
      byStatus[MANIFEST_REPLY_STATUS.NO_REPLY] ? `${byStatus[MANIFEST_REPLY_STATUS.NO_REPLY]} never answered` : "",
      byStatus[MANIFEST_REPLY_STATUS.EMPTY] ? `${byStatus[MANIFEST_REPLY_STATUS.EMPTY]} answered with no visible content` : ""
    ].filter(Boolean);

    if (!reasons.length) {
      return `${pairCount} same-role adjacency pair(s) detected.`;
    }

    return `${pairCount} same-role adjacency pair(s): ChatGPT has no reply for ${gaps.length} prompt(s) (${reasons.join(", ")}).`;
  }
