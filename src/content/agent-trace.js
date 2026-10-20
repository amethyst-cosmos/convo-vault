  // Agent trace: every node ChatGPT stores between a prompt and its answer, in
  // tree order, as typed events with full content. The PDF thinking timeline
  // and the bundle's agent-trace files are both built from it.
  //
  // Event kinds: thought (summarized reasoning step), note (the model's own
  // commentary), tool_call, tool_result, recap, answer, other. ChatGPT stores
  // web.run and functions.* calls with empty text; those calls carry
  // inputHidden: true instead of invented content.
  const AGENT_TRACE_VERSION = 2;

  function buildTurnAgentTrace(nodes, options = {}) {
    const messages = (Array.isArray(nodes) ? nodes : []).map((node) => node?.message).filter(Boolean);
    const events = [];
    const sources = new Map();
    const calls = createTraceCallQueue();
    let model = null;
    let durationSeconds = 0;
    let firstTime = null;
    let lastTime = null;

    const push = (msg, time, kind, fields) => {
      const event = {
        seq: events.length + 1,
        nodeId: msg.id || "",
        at: formatTraceTime(time),
        offsetSeconds: time != null && firstTime != null ? Math.round((time - firstTime) * 10) / 10 : null,
        kind,
        ...fields
      };
      events.push(event);
      return event;
    };

    for (const msg of messages) {
      const role = String(msg.author?.role || "").toLowerCase();
      const recipient = String(msg.recipient || "").toLowerCase();
      const channel = String(msg.channel || msg.metadata?.channel || "").toLowerCase();
      const contentType = String(msg.content?.content_type || "").toLowerCase();
      const metadata = msg.metadata || {};
      const time = Number(msg.create_time) || null;

      if (time != null) {
        firstTime ??= time;
        lastTime = time;
      }
      if (!model && role === "assistant" && (metadata.model_slug || metadata.resolved_model_slug)) {
        model = {
          slug: metadata.model_slug || "",
          resolvedSlug: metadata.resolved_model_slug || "",
          thinkingEffort: metadata.thinking_effort || "",
          cotVersion: metadata.cot_version || ""
        };
      }
      durationSeconds = Math.max(durationSeconds, Number(metadata.finished_duration_sec || metadata.thinking_duration_seconds || 0));

      if (contentType === "reasoning_recap") {
        push(msg, time, "recap", {
          text: typeof msg.content?.content === "string" ? msg.content.content.trim() : "",
          durationSeconds: Number(metadata.finished_duration_sec || 0) || null
        });
        continue;
      }

      if (Array.isArray(msg.content?.thoughts)) {
        for (const thought of msg.content.thoughts) {
          const summary = String(thought?.summary || "").trim();
          const content = String(thought?.content || "").trim();
          if (summary || content) {
            push(msg, time, "thought", { summary, content, finished: thought?.finished !== false });
          }
        }
        continue;
      }

      const text = getTraceText(msg.content);

      // Older conversations keep a reasoning string in the message metadata,
      // sometimes on the final answer itself.
      if (role === "assistant") {
        for (const legacy of [metadata.reasoning, metadata.reasoning_content, metadata.thinking, metadata.thoughts]) {
          if (typeof legacy === "string" && legacy.trim()) push(msg, time, "thought", { summary: "", content: legacy.trim(), finished: true });
        }
      }

      if (role === "assistant" && isApiFinalAnswerMessage(msg)) {
        push(msg, time, "answer", { messageId: msg.id || "", chars: text.length });
        continue;
      }

      if (role === "assistant" && isTraceToolCall(msg, recipient)) {
        const tool = recipient && recipient !== "all" ? recipient : "web.run";
        const parsed = parseTraceJson(text);
        const event = push(msg, time, "tool_call", {
          tool,
          title: getTraceTitle(metadata),
          input: text,
          ...(parsed !== undefined ? { arguments: parsed } : {}),
          ...(Array.isArray(metadata.search_queries) && metadata.search_queries.length ? { queries: uniqueStrings(metadata.search_queries) } : {}),
          ...(msg.content?.language && msg.content.language !== "unknown" ? { language: msg.content.language } : {}),
          inputHidden: !text
        });
        calls.add(event);
        continue;
      }

      if (role === "tool") {
        const call = calls.match(String(msg.author?.name || "").toLowerCase(), contentType === "code" && !text);
        const tool = String(msg.author?.name || "").toLowerCase() || call?.tool || "";
        const found = collectTraceSources(metadata, sources, events.length + 1);
        const images = (Array.isArray(msg.content?.parts) ? msg.content.parts : [])
          .map((part) => part?.asset_pointer)
          .filter(Boolean);
        push(msg, time, "tool_result", {
          tool,
          ...(call ? { callSeq: call.seq } : {}),
          title: getTraceTitle(metadata),
          contentType,
          output: text,
          ...(found.length ? { sources: found } : {}),
          ...(found.some((source) => source.query) ? { queries: uniqueStrings(found.map((source) => source.query)) } : {}),
          ...(images.length ? { images } : {}),
          ...(metadata.aggregate_result?.status ? { status: metadata.aggregate_result.status } : {}),
          ...(metadata.invoked_resource?.resource_uri ? { resource: metadata.invoked_resource.resource_uri } : {})
        });
        continue;
      }

      if (role === "assistant") {
        if (text) {
          push(msg, time, "note", { channel: channel || "", text });
        } else {
          for (const title of Array.isArray(metadata.reasoning_titles) ? metadata.reasoning_titles : []) {
            if (String(title || "").trim()) push(msg, time, "thought", { summary: String(title).trim(), content: "", finished: true });
          }
        }
        continue;
      }

      if (text) {
        push(msg, time, "other", { role, recipient, channel, contentType, text });
      }
    }

    markCitedTraceSources(sources, messages, options.citations || []);
    const sourceList = [...sources.values()];
    const count = (kind) => events.filter((event) => event.kind === kind).length;

    return {
      version: AGENT_TRACE_VERSION,
      model,
      startedAt: formatTraceTime(firstTime),
      finishedAt: formatTraceTime(lastTime),
      durationSeconds: durationSeconds || null,
      stats: {
        events: events.length,
        thoughts: count("thought"),
        notes: count("note"),
        toolCalls: count("tool_call"),
        toolResults: count("tool_result"),
        hiddenInputs: events.filter((event) => event.inputHidden).length,
        sources: sourceList.length,
        citedSources: sourceList.filter((source) => source.cited).length
      },
      events,
      sources: sourceList,
      citations: options.citations || [],
      memories: options.memories || []
    };
  }

  // Pairs results with calls. Parallel calls are answered in call order, and
  // nodes carry no call id. Tools that open each answer with an empty `code`
  // node (api_tool.*) start a new answer only at that marker; other tools
  // answer each call with one result node.
  function createTraceCallQueue() {
    const pending = [];
    const current = new Map();
    const markerTools = new Set();
    const take = (tool) => {
      const index = pending.findIndex((call) => !tool || call.tool === tool);
      return index >= 0 ? pending.splice(index, 1)[0] : null;
    };
    return {
      add(call) {
        pending.push(call);
      },
      match(tool, isMarker) {
        if (isMarker) markerTools.add(tool);
        const startsAnswer = isMarker || !markerTools.has(tool) || !current.has(tool);
        const call = (startsAnswer && take(tool)) || current.get(tool) || null;
        if (call) current.set(tool || call.tool, call);
        return call;
      }
    };
  }

  function isTraceToolCall(msg, recipient) {
    if (recipient && recipient !== "all") {
      return true;
    }
    const metadata = msg.metadata || {};
    return metadata.reasoning_status === "is_reasoning" && String(msg.content?.content_type || "") === "code";
  }

  function getTraceText(content) {
    if (!content || typeof content !== "object") return "";
    if (typeof content.text === "string") return content.text.trim();
    const parts = Array.isArray(content.parts) ? content.parts : [];
    return parts.filter((part) => typeof part === "string").join("\n").trim();
  }

  function getTraceTitle(metadata) {
    return String(metadata.reasoning_title || (Array.isArray(metadata.reasoning_titles) ? metadata.reasoning_titles[0] : "") || "").trim();
  }

  function parseTraceJson(text) {
    if (!/^[[{]/.test(text)) return undefined;
    try {
      return JSON.parse(text);
    } catch (error) {
      // Tool input that only looks like JSON stays as plain text in `input`.
      return undefined;
    }
  }

  function formatTraceTime(seconds) {
    return seconds ? new Date(seconds * 1000).toISOString() : "";
  }

  function collectTraceSources(metadata, sources, seq) {
    const found = [];
    for (const group of Array.isArray(metadata.search_result_groups) ? metadata.search_result_groups : []) {
      for (const entry of Array.isArray(group?.entries) ? group.entries : []) {
        if (!entry?.url) continue;
        const refId = entry.ref_id ? formatCitationRefId(entry.ref_id) : "";
        const source = {
          url: entry.url,
          title: entry.title || "",
          domain: group.domain || entry.attribution || "",
          snippet: entry.snippet || "",
          ...(entry.pub_date ? { pubDate: entry.pub_date } : {}),
          ...(refId ? { refId } : {}),
          ...(group.search_query ? { query: group.search_query } : {})
        };
        found.push(source);
        const known = sources.get(entry.url);
        if (known) {
          known.seenAt.push(seq);
          if (refId && !known.refIds.includes(refId)) known.refIds.push(refId);
        } else {
          sources.set(entry.url, { url: source.url, title: source.title, domain: source.domain, snippet: source.snippet, refIds: refId ? [refId] : [], seenAt: [seq], cited: false });
        }
      }
    }
    return found;
  }

  function markCitedTraceSources(sources, messages, citations) {
    const citedUrls = new Set(citations.map((citation) => citation?.metadata?.url || citation?.url).filter(Boolean));
    const answerText = messages.filter((msg) => isApiFinalAnswerMessage(msg)).map((msg) => getTraceText(msg.content)).join("\n");
    const citedRefs = new Set(answerText.match(/turn\d+[a-z_]+\d+/gi) || []);
    for (const source of sources.values()) {
      source.cited = citedUrls.has(source.url) || source.refIds.some((refId) => citedRefs.has(refId));
    }
  }

  function recordAgentTraceDiagnostics(trace, debugLog, turnNumber) {
    if (!debugLog) return;
    const thoughts = trace.events.filter((event) => event.kind === "thought");
    for (const thought of thoughts) {
      if (thought.summary && !thought.content) {
        debugLog.fidelityWarning?.({
          turnNumber,
          severity: "info",
          code: "EMPTY_THOUGHT_CONTENT",
          message: `Thought step "${thought.summary}" has no descriptive body in API payload`,
          details: { summary: thought.summary, nodeId: thought.nodeId }
        });
      }
    }
    debugLog.recordThinkingDiagnostic?.({
      turnNumber,
      totalSteps: thoughts.length,
      stepsWithFullContent: thoughts.filter((thought) => thought.summary && thought.content).length,
      stepsWithSummaryOnly: thoughts.filter((thought) => thought.summary && !thought.content).length,
      durationSec: trace.durationSeconds || 0,
      searchQueriesCount: trace.events.reduce((sum, event) => sum + (event.kind === "tool_call" ? (event.queries?.length || 0) : 0), 0),
      toolCallsCount: trace.stats.toolCalls,
      hasRecap: trace.events.some((event) => event.kind === "recap")
    });
  }

  // The PDF thinking timeline, in the order ChatGPT's thinking panel shows it.
  // Search steps list every source not already listed in this turn; tool
  // outputs stay in the agent-trace files.
  function renderAgentTraceThinkingMarkdown(trace) {
    const lines = [];
    const shownUrls = new Set();
    const seen = new Set();
    const add = (icon, label, content) => {
      const clean = String(content || "").trim();
      if (!clean || seen.has(`${label}:${clean}`)) return;
      seen.add(`${label}:${clean}`);
      const [first, ...rest] = clean.split("\n").map((line) => line.trim()).filter(Boolean);
      lines.push(`- ${icon} **${label}**: ${first}`, ...rest.map((line) => `  ${line}`));
    };
    const calls = new Map(trace.events.filter((event) => event.kind === "tool_call").map((event) => [event.seq, event]));
    const answeredCalls = new Set(trace.events.map((event) => event.callSeq).filter(Boolean));

    for (const event of trace.events) {
      if (event.kind === "thought") {
        add("🧠", "推理思考", event.summary && event.content && event.summary !== event.content ? `**${event.summary}**\n${event.content}` : event.summary || event.content);
      } else if (event.kind === "note") {
        add("💬", "分析计划", event.text);
      } else if (event.kind === "recap") {
        add("⏱️", "思考总结", event.text);
      } else if (event.kind === "tool_result" && event.sources?.length) {
        const call = calls.get(event.callSeq);
        const queries = uniqueStrings([...(call?.queries || []), ...(event.queries || [])]);
        const links = event.sources.filter((source) => !shownUrls.has(source.url));
        links.forEach((source) => shownUrls.add(source.url));
        add("🔍", "网页搜索", [
          event.title || call?.title || "联网检索",
          queries.length ? `检索 \`${queries.slice(0, 3).join("`, `")}\`` : "",
          links.length ? `查阅 ${links.map((source) => `[${escapeMarkdownLinkLabel(source.title || source.domain || source.url)}](${source.url})`).join(" · ")}` : ""
        ].filter(Boolean).join(" · "));
      } else if (event.kind === "tool_call" && !isTraceSearchTool(event.tool) && (event.title || !event.inputHidden)) {
        add(...describeTraceToolCall(event));
      } else if (event.kind === "tool_call" && !answeredCalls.has(event.seq) && (event.title || event.queries?.length)) {
        add("🔍", "网页搜索", [event.title || "联网检索", event.queries?.length ? `检索 \`${event.queries.slice(0, 3).join("`, `")}\`` : ""].filter(Boolean).join(" · "));
      }
    }

    const cited = trace.citations
      .map((citation, index) => {
        const title = citation?.metadata?.title || citation?.title || citation?.metadata?.name || `来源 [${index + 1}]`;
        const url = citation?.metadata?.url || citation?.url || citation?.metadata?.extra?.url || citation?.metadata?.cloud_doc_url || "";
        return url ? `[${escapeMarkdownLinkLabel(title)}](${url})` : `📄 ${title}`;
      });
    if (cited.length) {
      add("🌐", "引用来源", uniqueStrings(cited).join(" · "));
    }

    const duration = trace.durationSeconds || 0;
    if (!lines.length && !duration) {
      return "";
    }
    const header = duration
      ? `> 💭 **Thinking Process (Worked for ${duration >= 60 ? `${Math.floor(duration / 60)}m ${duration % 60}s` : `${duration}s`})**`
      : "> 💭 **Thinking Process**";
    return lines.length ? `${header}\n>\n${lines.map((line) => `> ${line}`).join("\n")}` : header;
  }

  function isTraceSearchTool(tool) {
    return tool === "web.run" || tool === "browser" || tool === "search" || tool.startsWith("web.");
  }

  function describeTraceToolCall(event) {
    const tool = event.tool;
    if (tool === "container.exec" || tool === "python") {
      const firstLine = String(event.input || "").split("\n").find((line) => line.trim()) || "";
      return ["⚙️", "执行代码", [event.title, firstLine ? `\`${truncatePreview(firstLine.replace(/`/g, "'"), 120)}\`` : ""].filter(Boolean).join(" · ")];
    }
    if (tool.includes("image") || tool.startsWith("dalle")) {
      return ["🖼️", "生成图像", event.title || "生成图像"];
    }
    if (tool.includes("myfiles") || tool.includes("file_search")) {
      return ["📄", "读取文件", event.title || "读取上传的文件"];
    }
    const action = String(event.arguments?.path || "").split("/").filter(Boolean).pop() || tool;
    const args = event.arguments?.args ? truncatePreview(JSON.stringify(event.arguments.args), 160) : "";
    return ["🔧", "调用工具", [event.title, `\`${action}\``, args ? `\`${args.replace(/`/g, "'")}\`` : ""].filter(Boolean).join(" · ")];
  }
