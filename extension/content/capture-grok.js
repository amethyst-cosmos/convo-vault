  // Grok. The conversation is read from grok.com's own REST API with the session the
  // browser already has (cookies only, no token), the way capture-fast.js reads ChatGPT's.
  //
  //   GET  /rest/app-chat/conversations_v2/<id>           title and times
  //   GET  /rest/app-chat/conversations/<id>/response-node  the tree: id, sender, parent
  //   POST /rest/app-chat/conversations/<id>/load-responses  the messages for a list of ids
  //
  // The tree is what the export is checked against: every response on the chosen path
  // must come back, in order, or the integrity gate stops the export.
  const GROK_API_TIMEOUT_MS = 30000;
  const GROK_LOAD_BATCH = 50;
  const GROK_CITATION_RE = /<grok:render\b[^>]*type="render_inline_citation"[^>]*>\s*<argument name="citation_id">(\d+)<\/argument>\s*<\/grok:render>/g;
  const GROK_RENDER_RE = /<grok:render\b[\s\S]*?<\/grok:render>/g;
  const GROK_TOOL_CARD_RE = /<xai:tool_usage_card>[\s\S]*?<\/xai:tool_usage_card>/g;

  async function collectGrokConversationMessages(debugLog = null, options = {}) {
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
    const conversationId = getCurrentConversationId();

    if (!conversationId) {
      throw new Error("No conversation id was found in the current URL.");
    }

    onProgress("Reading the conversation from Grok...");
    const encodedId = encodeURIComponent(conversationId);
    const meta = await grokGetJson(`/rest/app-chat/conversations_v2/${encodedId}?includeWorkspaces=true&includeTaskResult=true`);
    const tree = await grokGetJson(`/rest/app-chat/conversations/${encodedId}/response-node?includeThreads=true`);
    const nodes = Array.isArray(tree?.responseNodes) ? tree.responseNodes : [];
    const loaded = await grokLoadResponses(encodedId, nodes.map((node) => node.responseId));

    lastApiConversationTitle = cleanApiConversationTitle(meta?.conversation?.title);
    debugLog?.event("grokCapture.loaded", { conversationId, nodes: nodes.length, responses: loaded.length });

    const path = chooseGrokPath(nodes, loaded);
    const messages = path.map((response, index) => grokResponseToMessage(response, index));
    const completeness = buildGrokCompleteness({ nodes, loaded, path, messages, inflight: tree?.inflightResponses });

    onProgress(`Found ${messages.length} messages.`);
    return { messages, completeness, captureMode: "fast" };
  }

  async function grokGetJson(path, init = {}) {
    const response = await fetchWithTimeout(new URL(path, location.origin).href, {
      timeoutMs: GROK_API_TIMEOUT_MS,
      credentials: "include",
      cache: "no-store",
      ...init,
      headers: { accept: "application/json", ...(init.headers || {}) }
    });

    if (!response.ok) {
      throw new Error(`Grok answered HTTP ${response.status} for ${path.split("?")[0].replace(/[0-9a-f-]{36}/g, "<id>")}.`);
    }

    return response.json();
  }

  async function grokLoadResponses(encodedId, responseIds) {
    const loaded = [];

    for (let start = 0; start < responseIds.length; start += GROK_LOAD_BATCH) {
      const json = await grokGetJson(`/rest/app-chat/conversations/${encodedId}/load-responses`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ responseIds: responseIds.slice(start, start + GROK_LOAD_BATCH) })
      });
      loaded.push(...(Array.isArray(json?.responses) ? json.responses : []));
    }

    return loaded;
  }

  // The tree can hold alternatives (a regenerated answer, an edited prompt). The export follows
  // one path from the first message: at each step the newest child, which is what the page shows.
  function chooseGrokPath(nodes, loaded) {
    const byId = new Map(loaded.map((response) => [response.responseId, response]));
    const children = new Map();

    for (const node of nodes) {
      const parent = node.parentResponseId || "";
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(node.responseId);
    }

    const knownIds = new Set(nodes.map((node) => node.responseId));
    const roots = nodes.filter((node) => !node.parentResponseId || !knownIds.has(node.parentResponseId)).map((node) => node.responseId);
    const newest = (ids) => ids
      .filter((id) => byId.has(id))
      .sort((a, b) => String(byId.get(b).createTime || "").localeCompare(String(byId.get(a).createTime || "")))[0];
    const path = [];
    let current = newest(roots);

    while (current && !path.includes(current)) {
      path.push(current);
      current = newest(children.get(current) || []);
    }

    return path.map((id) => byId.get(id));
  }

  function grokResponseToMessage(response, index) {
    const role = ["human", "user"].includes(String(response.sender || "").toLowerCase()) ? "user" : "assistant";
    const markdown = role === "user" ? grokUserMarkdown(response) : grokAssistantMarkdown(response);
    const thinkingMarkdown = role === "assistant" ? grokThinkingMarkdown(response) : "";
    const createdAt = Date.parse(response.createTime || "");

    return {
      id: response.responseId,
      role,
      turnNumber: index + 1,
      order: index,
      sourceMessageId: response.responseId,
      timestamp: Number.isNaN(createdAt) ? "" : formatConversationTimestamp(createdAt / 1000),
      preview: truncatePreview(markdown.replace(/\s+/g, " "), 120),
      markdown,
      thinkingMarkdown,
      model: role === "assistant" ? String(response.model || "") : ""
    };
  }

  function grokUserMarkdown(response) {
    const attachments = [...(response.fileAttachmentsMetadata || []), ...(response.fileAttachments || [])]
      .map((item) => (typeof item === "string" ? "" : item?.fileName || item?.filename || item?.name || ""))
      .filter(Boolean);
    const lines = [...new Set(attachments)].map((name) => `📎 **Attachment**: ${name}`);
    return [String(response.message || "").trim(), ...lines].filter(Boolean).join("\n\n");
  }

  // Inline citations (<grok:render ... citation_id>N) point at webSearchResults[N]. They become
  // numbered footnotes, one per distinct page; any other render tag is Grok's own widget and is dropped.
  function grokAssistantMarkdown(response) {
    const results = Array.isArray(response.webSearchResults) ? response.webSearchResults : [];
    const sources = [];
    let markdown = String(response.message || "").replace(GROK_CITATION_RE, (_match, rawIndex) => {
      const result = results[Number(rawIndex)];
      if (!result?.url) return "";
      let number = sources.findIndex((source) => source.url === result.url) + 1;
      if (!number) {
        sources.push({ url: result.url, title: String(result.title || result.url).replace(/[\[\]]/g, "") });
        number = sources.length;
      }
      return `[^${number}]`;
    });

    markdown = markdown.replace(GROK_RENDER_RE, "").trim();
    const generated = Array.isArray(response.generatedImageUrls) ? response.generatedImageUrls.filter((url) => typeof url === "string" && url) : [];
    const extras = generated.map((url) => `🖼️ **Generated image** (link, not downloaded): ${url}`);
    const footnotes = sources.map((source, index) => `[^${index + 1}]: [${source.title}](${source.url})`);
    return [markdown, ...extras, footnotes.join("\n")].filter(Boolean).join("\n\n");
  }

  function grokThinkingMarkdown(response) {
    const lines = [];

    for (const step of response.steps || []) {
      for (const text of step?.text || []) {
        const cards = String(text).match(GROK_TOOL_CARD_RE);

        if (cards) {
          cards.forEach((card) => lines.push(grokToolCardLine(card)));
        } else if (String(text).trim()) {
          lines.push(`🧠 **推理思考**: ${String(text).replace(/\s+/g, " ").trim()}`);
        }
      }
    }

    const started = Date.parse(response.thinkingStartTime || "");
    const ended = Date.parse(response.thinkingEndTime || "");
    const seconds = Number.isNaN(started) || Number.isNaN(ended) ? 0 : Math.max(0, Math.round((ended - started) / 1000));

    if (!lines.length && !seconds) {
      return "";
    }

    const duration = seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
    const head = `> 💭 **Thinking Process${seconds ? ` (Worked for ${duration})` : ""}**`;
    return lines.length ? `${head}\n>\n${lines.map((line) => `> - ${line}`).join("\n")}` : head;
  }

  function grokToolCardLine(card) {
    const name = card.match(/<xai:tool_name>([^<]*)<\/xai:tool_name>/)?.[1]?.trim() || "tool";
    let args = {};

    try {
      args = JSON.parse(card.match(/<!\[CDATA\[([\s\S]*?)\]\]>/)?.[1] || "{}").args || {};
    } catch (_) {
      args = {};
    }

    if (args.query) return `🔍 **网页搜索**: ${args.query}`;
    if (args.url) return `🌐 **打开网页**: ${args.url}`;
    const firstText = Object.values(args).find((value) => typeof value === "string" && value);
    return `🔧 **调用工具**: ${name}${firstText ? ` ${String(firstText).slice(0, 120)}` : ""}`;
  }

  // The check the ChatGPT capture does against its message list, against Grok's tree: every
  // response in the tree came back, the chosen path is finished, and nothing is still being written.
  function buildGrokCompleteness({ nodes, loaded, path, messages, inflight }) {
    const issues = [];
    const warnings = [];
    const loadedIds = new Set(loaded.map((response) => response.responseId));
    const missing = nodes.filter((node) => !loadedIds.has(node.responseId));
    const onPath = new Set(path.map((response) => response.responseId));

    if (!nodes.length) {
      issues.push({ code: "no-messages", message: "Grok returned no messages for this conversation." });
    }

    if (missing.length) {
      issues.push({ code: "missing-responses", message: `Grok did not return ${missing.length} of ${nodes.length} messages.` });
    }

    if (Array.isArray(inflight) && inflight.length) {
      issues.push({ code: "response-in-progress", message: "Grok is still writing a response in this conversation." });
    }

    const unfinished = path.filter((response) => response.partial === true);
    if (unfinished.length) {
      issues.push({ code: "partial-response", message: `${unfinished.length} response(s) are unfinished (stopped or interrupted).` });
    }

    const streamErrors = path.filter((response) => Array.isArray(response.streamErrors) && response.streamErrors.length);
    if (streamErrors.length) {
      warnings.push({ code: "stream-errors", message: `${streamErrors.length} response(s) reported stream errors.` });
    }

    const alternatives = nodes.filter((node) => !onPath.has(node.responseId)).length;
    if (alternatives) {
      warnings.push({ code: "alternatives-skipped", message: `${alternatives} alternative response(s) (regenerated or edited branches) are not part of the exported path.` });
    }

    return {
      complete: issues.length === 0,
      mode: "fast",
      provider: "grok",
      expected: { nodes: nodes.length },
      captured: { messages: messages.length },
      issues,
      warnings
    };
  }
