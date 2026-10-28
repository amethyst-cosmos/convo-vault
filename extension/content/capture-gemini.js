  // Gemini (gemini.google.com). Gemini has no conversation API this extension can call, so the
  // conversation is read from the page: every turn is a .conversation-container with a
  // <user-query> and a <model-response>. Two things follow from that, and both are reported:
  //
  //   - older turns load only when the page is scrolled up, so (unlike ChatGPT and Grok) the page is
  //     scrolled here until no more turns appear;
  //   - nothing tells how many messages the conversation has, so the check is what the page can
  //     show: at least one turn, a reply for every prompt, no reply still being written.
  //
  // The reply's HTML is turned back into Markdown by geminiHtmlToMarkdown(), which reads only
  // nodeType, tagName, childNodes, getAttribute and textContent so it can be tested without a browser.
  const GEMINI_MAX_SCROLL_ROUNDS = 80;
  const GEMINI_SCROLL_WAIT_MS = 900;
  const GEMINI_STABLE_ROUNDS = 3;
  const GEMINI_READY_TIMEOUT_MS = 15000;
  const GEMINI_TITLE_TIMEOUT_MS = 8000;
  const GEMINI_SKIPPED_TAGS = new Set(["style", "script", "svg", "button", "mat-icon", "gem-icon", "noscript"]);
  const GEMINI_HIDDEN_CLASSES = ["cdk-visually-hidden", "screen-reader-user-query-label", "sr-only"];

  function getGeminiConversationId() {
    // /app/<id>, /u/1/app/<id> (second account) and /gem/<gem>/<id> (a custom Gem).
    const parts = location.pathname.split("/").filter(Boolean);
    const appIndex = parts.indexOf("app");
    const id = appIndex >= 0 ? parts[appIndex + 1] : parts[0] === "gem" ? parts[2] : "";
    return /^[a-z0-9_-]{8,}$/i.test(id || "") ? id : "";
  }

  async function collectGeminiConversationMessages(debugLog = null, options = {}) {
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
    const conversationId = getGeminiConversationId();

    if (!conversationId) {
      throw new Error("No conversation id was found in the current URL.");
    }

    onProgress("Reading the conversation from Gemini...");
    await geminiWaitFor(() => geminiListTurns().length > 0, GEMINI_READY_TIMEOUT_MS, "Gemini did not show the conversation.");
    const loaded = await geminiLoadAllTurns(onProgress);
    await geminiWaitFor(() => geminiTitleReady(), GEMINI_TITLE_TIMEOUT_MS, "").catch(() => {});

    const turns = geminiListTurns().map((container, index) => extractGeminiTurn(container, index));
    const messages = [];
    turns.forEach((turn) => {
      messages.push(geminiMessage(turn, "user", messages.length));
      messages.push(geminiMessage(turn, "assistant", messages.length));
    });

    lastApiConversationTitle = cleanApiConversationTitle(geminiPageTitle());
    debugLog?.event("geminiCapture.loaded", { conversationId, turns: turns.length, scrollRounds: loaded.rounds });
    onProgress(`Found ${messages.length} messages.`);

    return { messages, completeness: buildGeminiCompleteness(turns, loaded), captureMode: "fast" };
  }

  function geminiMessage(turn, role, index) {
    const markdown = role === "user" ? turn.user : turn.assistant;
    return {
      id: `gemini-${turn.id || turn.index + 1}-${role}`,
      role,
      turnNumber: index + 1,
      order: index,
      sourceMessageId: turn.id || "",
      timestamp: "",
      preview: truncatePreview(markdown.replace(/\s+/g, " "), 120),
      markdown,
      thinkingMarkdown: ""
    };
  }

  // ---- the page edge: every read of the live page is one of these, so tests can replace them ----

  function geminiListTurns() {
    return [...document.querySelectorAll(".conversation-container")];
  }

  function geminiScrollOlderIntoView() {
    const first = geminiListTurns()[0];
    let node = first?.parentElement || null;

    while (node && node !== document.body) {
      const overflow = getComputedStyle(node).overflowY;
      if (node.scrollHeight > node.clientHeight + 8 && /auto|scroll/.test(overflow)) {
        node.scrollTop = 0;
        return;
      }
      node = node.parentElement;
    }

    (document.scrollingElement || document.documentElement).scrollTop = 0;
  }

  function geminiIsGenerating() {
    return Boolean(document.querySelector('button[aria-label="Stop response"], button[aria-label*="Stop"][class*="stop"], [data-test-id="stop-button"]'));
  }

  function geminiPageTitle() {
    return String(document.title || "").replace(/\s*-\s*Google Gemini\s*$/i, "").trim();
  }

  function geminiTitleReady() {
    return Boolean(cleanApiConversationTitle(geminiPageTitle()));
  }

  function geminiSleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function geminiWaitFor(condition, timeoutMs, message) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      if (condition()) return;
      await geminiSleep(250);
    }

    if (message) throw new Error(message);
    throw new Error("timeout");
  }

  // Scrolls to the top until the number of turns stops growing for a few rounds.
  async function geminiLoadAllTurns(onProgress) {
    let last = -1;
    let stable = 0;
    let max = 0;
    let rounds = 0;

    while (stable < GEMINI_STABLE_ROUNDS && rounds < GEMINI_MAX_SCROLL_ROUNDS) {
      geminiScrollOlderIntoView();
      await geminiSleep(GEMINI_SCROLL_WAIT_MS);
      rounds += 1;
      const count = geminiListTurns().length;
      max = Math.max(max, count);
      stable = count === last ? stable + 1 : 0;
      last = count;
      if (rounds % 5 === 0) onProgress(`Loading older turns... ${count} so far.`);
    }

    return { rounds, turns: last, maxSeen: max, hitLimit: stable < GEMINI_STABLE_ROUNDS };
  }

  // ---- one turn ----

  function extractGeminiTurn(container, index) {
    const userQuery = geminiFind(container, (node) => geminiTag(node) === "user-query");
    const response = geminiFind(container, (node) => geminiTag(node) === "model-response");
    const contents = response
      ? geminiFindAll(response, (node) => geminiTag(node) === "message-content")
        .map((content) => geminiFind(content, (node) => geminiHasClass(node, "markdown")) || content)
      : [];

    return {
      index,
      id: container.getAttribute?.("id") || "",
      user: userQuery ? geminiUserMarkdown(userQuery) : "",
      assistant: contents.map((content) => geminiHtmlToMarkdown(content)).filter(Boolean).join("\n\n"),
      generating: Boolean(response && geminiFind(response, (node) => geminiHasClass(node, "loading") || geminiHasClass(node, "is-loading")))
    };
  }

  // The prompt is a list of <p class="query-text-line"> (an empty one for a blank line) and
  // <ol class="query-numbered-list">; a hidden label repeats the whole text for screen readers and is skipped.
  function geminiUserMarkdown(userQuery) {
    const textRoot = geminiFind(userQuery, (node) => geminiHasClass(node, "query-text"));
    const lines = [];

    for (const child of textRoot ? textRoot.childNodes : []) {
      if (child.nodeType !== 1 || geminiIsHidden(child)) continue;
      const tag = geminiTag(child);

      if (tag === "ol" || tag === "ul") {
        geminiChildElements(child).filter((item) => geminiTag(item) === "li").forEach((item, number) => {
          lines.push(`${tag === "ol" ? `${number + 1}.` : "-"} ${geminiInline(item).trim()}`);
        });
      } else {
        lines.push(geminiInline(child).replace(/ /g, " ").trim());
      }
    }

    const attachments = [];
    const previews = geminiFind(userQuery, (node) => geminiHasClass(node, "file-preview-container"));
    if (previews) {
      geminiFindAll(previews, (node) => geminiHasClass(node, "file-name") || geminiHasClass(node, "file-title"))
        .forEach((node) => {
          const name = geminiInline(node).trim();
          if (name && !attachments.includes(name)) attachments.push(name);
        });
    }

    // Single line breaks inside a prompt are kept as hard breaks; a blank line is a paragraph break.
    let text = "";
    lines.forEach((line, i) => {
      if (!line) {
        text += text.endsWith("\n\n") || !text ? "" : "\n\n";
      } else {
        text += line + (i < lines.length - 1 && lines[i + 1] ? "  \n" : "");
      }
    });

    return [text.trim(), ...attachments.map((name) => `📎 **Attachment**: ${name}`)].filter(Boolean).join("\n\n");
  }

  // ---- HTML to Markdown ----

  function geminiTag(node) {
    return String(node?.tagName || "").toLowerCase();
  }

  function geminiClasses(node) {
    return String(node?.getAttribute?.("class") || "").split(/\s+/).filter(Boolean);
  }

  function geminiHasClass(node, name) {
    return node?.nodeType === 1 && geminiClasses(node).includes(name);
  }

  function geminiIsHidden(node) {
    return GEMINI_HIDDEN_CLASSES.some((name) => geminiHasClass(node, name));
  }

  function geminiChildElements(node) {
    return [...(node?.childNodes || [])].filter((child) => child.nodeType === 1);
  }

  function geminiFind(node, predicate) {
    for (const child of geminiChildElements(node)) {
      if (predicate(child)) return child;
      const found = geminiFind(child, predicate);
      if (found) return found;
    }
    return null;
  }

  function geminiFindAll(node, predicate, found = []) {
    for (const child of geminiChildElements(node)) {
      if (predicate(child)) found.push(child);
      geminiFindAll(child, predicate, found);
    }
    return found;
  }

  function geminiInline(node) {
    return [...(node?.childNodes || [])].map((child) => geminiNodeToMarkdown(child, { inPre: false })).join("");
  }

  function geminiHtmlToMarkdown(root) {
    return geminiNodeToMarkdown(root, { inPre: false })
      .replace(/[ \t]+\n/g, (match) => (match.length > 2 && match.startsWith("  ") ? "  \n" : "\n"))
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function geminiNodeToMarkdown(node, ctx) {
    if (node.nodeType === 3) {
      return ctx.inPre ? node.textContent : node.textContent.replace(/\s+/g, " ");
    }

    if (node.nodeType !== 1 || geminiIsHidden(node)) return "";
    const tag = geminiTag(node);
    if (GEMINI_SKIPPED_TAGS.has(tag)) return "";

    const inner = () => [...node.childNodes].map((child) => geminiNodeToMarkdown(child, ctx)).join("");

    switch (tag) {
      case "p":
        return `${inner().trim()}\n\n`;
      case "h1": case "h2": case "h3": case "h4": case "h5": case "h6":
        return `${"#".repeat(Number(tag[1]))} ${inner().trim()}\n\n`;
      case "b": case "strong":
        return geminiWrapEmphasis(inner(), "**");
      case "i": case "em":
        return geminiWrapEmphasis(inner(), "*");
      case "s": case "del": case "strike":
        return geminiWrapEmphasis(inner(), "~~");
      case "code":
        return ctx.inPre ? node.textContent : geminiInlineCode(node.textContent);
      case "pre":
        return geminiCodeBlock(node);
      case "code-block":
        return geminiFind(node, (child) => geminiTag(child) === "pre") ? geminiCodeBlock(geminiFind(node, (child) => geminiTag(child) === "pre"), node) : inner();
      case "a": {
        const href = node.getAttribute("href") || "";
        const text = inner().trim();
        return href ? `[${text || href}](${href})` : text;
      }
      case "br":
        return "  \n";
      case "hr":
        return "---\n\n";
      case "blockquote":
        return `${inner().trim().split("\n").map((line) => (line ? `> ${line}` : ">")).join("\n")}\n\n`;
      case "ul": case "ol":
        return `${geminiList(node, tag === "ol")}\n\n`;
      case "table":
        return `${geminiTable(node)}\n\n`;
      case "img": {
        const src = node.getAttribute("src") || "";
        return src ? `\n\n🖼️ **${node.getAttribute("alt") || "Image"}** (link, not downloaded): ${src}\n\n` : "";
      }
      default: {
        const math = node.getAttribute("data-math");
        if (math) {
          return geminiHasClass(node, "math-block") ? `\n\n$$\n${math}\n$$\n\n` : `$${math}$`;
        }
        const out = inner();
        // Block wrappers keep their children apart even when the children are bare text.
        return ["div", "section", "response-element", "table-block"].includes(tag) && out && !out.endsWith("\n") ? `${out}\n\n` : out;
      }
    }
  }

  function geminiWrapEmphasis(text, mark) {
    const core = text.trim();
    if (!core) return text;
    return `${text.startsWith(" ") ? " " : ""}${mark}${core}${mark}${text.endsWith(" ") ? " " : ""}`;
  }

  function geminiInlineCode(text) {
    const run = Math.max(0, ...(text.match(/`+/g) || []).map((ticks) => ticks.length));
    const fence = "`".repeat(run + 1);
    return `${fence}${run && /^`|`$/.test(text) ? ` ${text} ` : text}${fence}`;
  }

  function geminiCodeBlock(pre, wrapper = null) {
    const codeNode = geminiFind(pre, (child) => geminiTag(child) === "code") || pre;
    const code = codeNode.textContent.replace(/\n$/, "");
    const fromClass = geminiClasses(codeNode).map((name) => name.match(/^language-(.+)$/)?.[1]).find(Boolean) || "";
    const label = wrapper
      ? geminiFind(wrapper, (child) => geminiHasClass(child, "code-block-decoration"))
      : null;
    const language = fromClass || (label ? geminiInline(label).trim().split(/\s+/)[0].toLowerCase() : "");
    const run = Math.max(2, ...(code.match(/`+/g) || []).map((ticks) => ticks.length));
    const fence = "`".repeat(run + 1);
    return `\n\n${fence}${/^[a-z0-9+#._-]+$/.test(language) ? language : ""}\n${code}\n${fence}\n\n`;
  }

  function geminiList(list, ordered, depth = 0) {
    const items = geminiChildElements(list).filter((child) => geminiTag(child) === "li");
    const indentFor = (marker) => " ".repeat(marker.length);

    return items.map((item, index) => {
      const marker = ordered ? `${index + 1}. ` : "- ";
      const parts = [];
      let text = "";

      for (const child of item.childNodes) {
        const tag = geminiTag(child);
        if (tag === "ul" || tag === "ol") {
          parts.push(text.trim());
          text = "";
          parts.push(geminiList(child, tag === "ol", depth + 1));
        } else {
          text += geminiNodeToMarkdown(child, { inPre: false });
        }
      }

      parts.push(text.trim());
      const lines = parts.filter(Boolean).join("\n").split("\n");
      return marker + lines[0] + lines.slice(1).map((line) => (line ? `\n${indentFor(marker)}${line}` : "\n")).join("");
    }).join("\n");
  }

  function geminiTable(table) {
    const rows = geminiFindAll(table, (node) => geminiTag(node) === "tr")
      .map((row) => geminiChildElements(row)
        .filter((cell) => ["th", "td"].includes(geminiTag(cell)))
        .map((cell) => geminiInline(cell).trim().replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ")));

    if (!rows.length) return "";
    const width = Math.max(...rows.map((row) => row.length));
    const pad = (row) => row.concat(Array(width - row.length).fill(""));
    const line = (row) => `| ${pad(row).join(" | ")} |`;
    return [line(rows[0]), `| ${Array(width).fill("---").join(" | ")} |`, ...rows.slice(1).map(line)].join("\n");
  }

  // ---- the check ----

  function buildGeminiCompleteness(turns, loaded) {
    const issues = [];
    const warnings = [];

    if (!turns.length) {
      issues.push({ code: "no-messages", message: "Gemini showed no messages for this conversation." });
    }

    const unanswered = turns.filter((turn) => turn.user && !turn.assistant).length;
    if (unanswered) {
      issues.push({ code: "unanswered-prompts", message: `${unanswered} prompt(s) have no reply on the page (still loading, or never answered).` });
    }

    const emptyPrompts = turns.filter((turn) => !turn.user).length;
    if (emptyPrompts) {
      issues.push({ code: "empty-prompts", message: `${emptyPrompts} prompt(s) could not be read from the page.` });
    }

    if (turns.some((turn) => turn.generating) || geminiIsGenerating()) {
      issues.push({ code: "response-in-progress", message: "Gemini is still writing a response in this conversation." });
    }

    if (loaded.turns < loaded.maxSeen) {
      issues.push({ code: "turns-unloaded", message: `The page dropped older turns while loading (${loaded.maxSeen} seen, ${loaded.turns} left).` });
    }

    if (loaded.hitLimit) {
      warnings.push({ code: "load-limit", message: "The page was still loading older turns when the scroll limit was reached; the export may start later than the conversation does." });
    }

    warnings.push({ code: "no-message-count", message: `Gemini does not report how many messages a conversation has, so this export holds the ${turns.length} turn(s) the page showed.` });
    warnings.push({ code: "thinking-not-captured", message: "Gemini's collapsed thinking panel and source chips are not part of the export." });

    return {
      complete: issues.length === 0,
      mode: "fast",
      provider: "gemini",
      expected: {},
      captured: { messages: turns.length * 2 },
      issues,
      warnings
    };
  }
