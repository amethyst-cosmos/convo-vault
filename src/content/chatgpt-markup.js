  // ============================================================================
  // CHATGPT RESPONSE MARKUP
  // ============================================================================
  //
  // ChatGPT stores two non-Markdown layers inside assistant text:
  //
  // 1. Inline reference tokens: U+E200 <name> U+E202 <arg> [U+E202 <arg>...] U+E201.
  //    Known names are cite, entity, url, image_group, and navlist. They appear
  //    in classic text messages and in the DIL fallback Markdown.
  // 2. DIL (metadata.model_dil_v2): content.parts holds component source such as
  //    <box>, <row>, <Cite/>, and {@body ...} state declarations. The same
  //    metadata carries fallbackMarkdown, ChatGPT's static Markdown rendition of
  //    that source, which is the export source of record for DIL messages.

  const CHATGPT_TOKEN_START = "";
  const CHATGPT_TOKEN_SEPARATOR = "";
  const CHATGPT_TOKEN_END = "";
  const CHATGPT_INLINE_TOKEN_RE = /([A-Za-z_][\w-]*)((?:[^]*)*)/g;
  const CHATGPT_CITATION_REF_RE = /^turn\d+[a-z_]+\d+$/i;
  const CHATGPT_WRITING_BLOCK_RE = /(^|\n):::writing(?:\{[^\n]*\})?[ \t]*\n([\s\S]*?)\n:::[ \t]*(?=\n|$)/g;
  const DIL_COMPONENT_NAMES = new Set([
    "AsyncImage",
    "Cite",
    "Entity",
    "Link",
    "MemoryCite",
    "WritingBlock",
    "badge",
    "box",
    "button",
    "caption",
    "divider",
    "grid",
    "grid-item",
    "icon",
    "pressable",
    "radio",
    "radio-group",
    "row",
    "spacer",
    "text",
    "title"
  ]);

  /**
   * Returns the Markdown that ChatGPT itself shows for a message whose body is
   * DIL component source, or "" when the message is not a DIL message.
   */
  function getDilFallbackMarkdown(message) {
    const dil = message?.metadata?.model_dil_v2;
    const fallback = dil && typeof dil === "object" ? dil.fallbackMarkdown : "";
    return typeof fallback === "string" ? fallback.trim() : "";
  }

  function isDilMessage(message) {
    const dil = message?.metadata?.model_dil_v2;
    return Boolean(dil && typeof dil === "object");
  }

  /**
   * Maps citation ref ids (turn<index><type><index>) to their source pages.
   * Ref ids restart in every exchange, so pass the messages of one response.
   * Two API layouts carry the mapping:
   * - search_result_groups[].entries[].ref_id on search tool messages (2026);
   * - content_references[type=grouped_webpages].items[].refs on the answer.
   */
  function buildCitationSourceIndex(messages) {
    const sources = new Map();
    const addSource = (refId, url, title) => {
      const ref = formatCitationRefId(refId);
      const href = String(url || "").trim();

      if (ref && href && !sources.has(ref)) {
        sources.set(ref, { url: href, title: String(title || href).trim() });
      }
    };

    for (const message of messages) {
      const metadata = message?.metadata || {};

      for (const group of Array.isArray(metadata.search_result_groups) ? metadata.search_result_groups : []) {
        for (const entry of Array.isArray(group?.entries) ? group.entries : []) {
          addSource(entry?.ref_id, entry?.url, entry?.title || group?.domain);
        }
      }

      for (const reference of Array.isArray(metadata.content_references) ? metadata.content_references : []) {
        if (reference?.type !== "grouped_webpages") {
          continue;
        }

        for (const item of Array.isArray(reference.items) ? reference.items : []) {
          for (const refId of Array.isArray(item?.refs) ? item.refs : []) {
            addSource(refId, item?.url, item?.title || item?.attribution);
          }
        }
      }
    }

    return sources;
  }

  function formatCitationRefId(refId) {
    if (!refId || typeof refId !== "object") {
      return "";
    }

    const turnIndex = refId.turn_index ?? refId.turnIndex;
    const refType = refId.ref_type ?? refId.refType;
    const refIndex = refId.ref_index ?? refId.refIndex;

    if (turnIndex == null || !refType || refIndex == null) {
      return "";
    }

    return `turn${turnIndex}${refType}${refIndex}`;
  }

  /**
   * Creates the per-response state shared by every text part of one assistant
   * turn, so footnote numbers stay unique across the whole response.
   */
  function createChatGptMarkupContext(options = {}) {
    return {
      citationSources: options.citationSources || new Map(),
      footnoteOffset: Math.max(0, Number(options.footnoteOffset) || 0),
      footnotes: [],
      footnoteIndexByRef: new Map(),
      tokenCounts: {},
      unknownTokenCounts: {},
      unresolvedCitationRefs: []
    };
  }

  /**
   * Replaces ChatGPT inline reference tokens with portable Markdown. Citations
   * become numbered footnote references; call formatChatGptFootnotes() with the
   * same context once all parts of the response are rendered.
   */
  function renderChatGptInlineTokens(markdown, context = createChatGptMarkupContext()) {
    const text = String(markdown || "");

    if (!text.includes(CHATGPT_TOKEN_START)) {
      return text;
    }

    return text.replace(CHATGPT_INLINE_TOKEN_RE, (match, rawName, rawArgs) => {
      const name = rawName.toLowerCase();
      const args = rawArgs ? rawArgs.split(CHATGPT_TOKEN_SEPARATOR).slice(1) : [];
      context.tokenCounts[name] = (context.tokenCounts[name] || 0) + 1;

      switch (name) {
        case "cite":
          return renderCitationToken(args, context);
        case "entity":
          return renderEntityToken(args);
        case "url":
          return renderUrlToken(args);
        case "image_group":
          return renderImageGroupToken(args);
        case "navlist":
          return renderNavlistToken(args, context);
        default:
          context.unknownTokenCounts[name] = (context.unknownTokenCounts[name] || 0) + 1;
          return args.filter(isReadableTokenArgument).join(" ");
      }
    });
  }

  function renderCitationToken(args, context) {
    const references = [];

    for (const arg of args) {
      const ref = String(arg || "").trim();

      if (!CHATGPT_CITATION_REF_RE.test(ref)) {
        continue;
      }

      const footnote = resolveCitationFootnote(ref, context);

      if (footnote && !references.includes(footnote)) {
        references.push(footnote);
      }
    }

    return references.map((index) => `[^${index}]`).join("");
  }

  function resolveCitationFootnote(ref, context) {
    if (context.footnoteIndexByRef.has(ref)) {
      return context.footnoteIndexByRef.get(ref);
    }

    const source = context.citationSources.get(ref);

    if (!source) {
      if (!context.unresolvedCitationRefs.includes(ref)) {
        context.unresolvedCitationRefs.push(ref);
      }
      return 0;
    }

    const index = context.footnoteOffset + context.footnotes.length + 1;
    context.footnotes.push({ index, ref, ...source });
    context.footnoteIndexByRef.set(ref, index);
    return index;
  }

  function renderEntityToken(args) {
    const parsed = parseJsonTokenArgument(args[0]);

    if (Array.isArray(parsed)) {
      return String(parsed[1] ?? parsed[0] ?? "").trim();
    }

    return String(args[1] ?? args[0] ?? "").trim();
  }

  function renderUrlToken(args) {
    const values = args.map((arg) => String(arg || "").trim()).filter(Boolean);
    const url = values.find((value) => /^https?:\/\//i.test(value)) || "";
    const title = values.find((value) => value !== url) || url;

    if (!url) {
      return title;
    }

    return `[${escapeMarkdownLinkLabel(title)}](${url})`;
  }

  function renderImageGroupToken(args) {
    const parsed = parseJsonTokenArgument(args[0]);
    const queries = Array.isArray(parsed?.query)
      ? parsed.query
      : (typeof parsed?.query === "string" ? [parsed.query] : []);
    const label = queries.map((query) => String(query || "").trim()).filter(Boolean).join("; ");
    return label ? `*[Image search: ${escapeMarkdownLinkLabel(label)}]*` : "";
  }

  function renderNavlistToken(args, context) {
    const [title = "", ...refs] = args.map((arg) => String(arg || "").trim());
    const links = refs
      .filter((ref) => CHATGPT_CITATION_REF_RE.test(ref))
      .map((ref) => context.citationSources.get(ref))
      .filter(Boolean)
      .map((source) => `- [${escapeMarkdownLinkLabel(source.title)}](${source.url})`);

    return [title ? `**${title}**` : "", ...links].filter(Boolean).join("\n");
  }

  function parseJsonTokenArgument(value) {
    try {
      return JSON.parse(String(value || ""));
    } catch (error) {
      // Token arguments are model output; a malformed payload degrades to text.
      return null;
    }
  }

  function isReadableTokenArgument(value) {
    const text = String(value || "").trim();
    return Boolean(text)
      && !CHATGPT_CITATION_REF_RE.test(text)
      && !/^[{[]/.test(text);
  }

  function escapeMarkdownLinkLabel(value) {
    return String(value || "").replace(/[[\]]/g, "\\$&");
  }

  function formatChatGptFootnotes(context) {
    return context.footnotes
      .map((footnote) => `[^${footnote.index}]: [${escapeMarkdownLinkLabel(footnote.title)}](${footnote.url})`)
      .join("\n");
  }

  /**
   * Converts :::writing directives (ChatGPT's copyable writing blocks) into
   * ```writing fences: Markdown readers keep the text verbatim and copyable,
   * and the PDF renderer shows the fence as a formatted writing card.
   */
  function renderChatGptWritingBlocks(markdown) {
    return String(markdown || "").replace(CHATGPT_WRITING_BLOCK_RE, (match, prefix, body) => {
      const fence = makeFence(body);
      return `${prefix}${fence}writing\n${body}\n${fence}`;
    });
  }

  /**
   * Degrades DIL component source to static Markdown. It is used only when a
   * DIL message lacks fallbackMarkdown; code fences are left untouched.
   */
  function renderDilSourceAsMarkdown(source) {
    return mapOutsideCodeFences(String(source || ""), (segment) => {
      const withoutStatements = stripDilExpressionBlocks(segment);
      // Component nesting indents source lines; four spaces would turn them
      // into Markdown code blocks, so only list items keep their indentation.
      return renderDilComponents(withoutStatements)
        .replace(/^[ \t]+(?![-*+][ \t]|\d+[.)][ \t])/gm, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n");
    });
  }

  function mapOutsideCodeFences(text, transform) {
    const lines = text.split("\n");
    const output = [];
    let buffer = [];
    let fence = null;

    const flush = () => {
      if (buffer.length) {
        output.push(transform(buffer.join("\n")));
        buffer = [];
      }
    };

    for (const line of lines) {
      const match = line.match(/^\s*(`{3,}|~{3,})/);

      if (!fence && match) {
        flush();
        fence = match[1];
        output.push(line);
        continue;
      }

      if (fence) {
        output.push(line);

        if (line.trim().startsWith(fence[0].repeat(fence.length)) && line.trim().replace(/[`~]/g, "") === "") {
          fence = null;
        }
        continue;
      }

      buffer.push(line);
    }

    flush();
    return output.join("\n");
  }

  function stripDilExpressionBlocks(text) {
    let output = "";
    let index = 0;

    while (index < text.length) {
      const open = text.indexOf("{", index);

      if (open < 0) {
        output += text.slice(index);
        break;
      }

      const close = findBalancedBraceEnd(text, open);
      const block = close > open ? text.slice(open, close + 1) : "";
      const isStatement = /^\{\s*@/.test(block);
      const isExpression = /=>|\bDIL\.|\bGenUI\./.test(block);

      if (block && (isStatement || isExpression) && !isInsideDilTag(text, open)) {
        output += text.slice(index, open);
        index = close + 1;
        continue;
      }

      output += text.slice(index, open + 1);
      index = open + 1;
    }

    return output;
  }

  function isInsideDilTag(text, position) {
    const tagStart = text.lastIndexOf("<", position);
    const tagEnd = text.lastIndexOf(">", position);
    return tagStart > tagEnd && /^<\/?[A-Za-z]/.test(text.slice(tagStart, tagStart + 2));
  }

  function findBalancedBraceEnd(text, start) {
    let depth = 0;
    let quote = "";

    for (let index = start; index < text.length; index += 1) {
      const char = text[index];

      if (quote) {
        if (char === "\\") {
          index += 1;
        } else if (char === quote) {
          quote = "";
        }
        continue;
      }

      if (char === "\"" || char === "'" || char === "`") {
        quote = char;
      } else if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;

        if (depth === 0) {
          return index;
        }
      }
    }

    return -1;
  }

  function renderDilComponents(text) {
    let output = "";
    let index = 0;

    while (index < text.length) {
      const tag = readDilTag(text, index);

      if (!tag) {
        output += text[index];
        index += 1;
        continue;
      }

      output += renderDilTag(tag);
      index = tag.end;
    }

    return output;
  }

  function readDilTag(text, start) {
    if (text[start] !== "<") {
      return null;
    }

    const nameMatch = text.slice(start).match(/^<(\/?)([A-Za-z][\w-]*)/);

    if (!nameMatch || !DIL_COMPONENT_NAMES.has(nameMatch[2])) {
      return null;
    }

    const closing = nameMatch[1] === "/";
    const name = nameMatch[2];
    const attributes = {};
    let index = start + nameMatch[0].length;

    while (index < text.length) {
      while (/\s/.test(text[index] || "")) {
        index += 1;
      }

      if (text.startsWith("/>", index)) {
        return { name, closing, selfClosing: true, attributes, end: index + 2 };
      }

      if (text[index] === ">") {
        return { name, closing, selfClosing: false, attributes, end: index + 1 };
      }

      const attributeMatch = text.slice(index).match(/^([A-Za-z_][\w-]*)/);

      if (!attributeMatch) {
        return null;
      }

      const attributeName = attributeMatch[1];
      index += attributeName.length;

      if (text[index] !== "=") {
        attributes[attributeName] = true;
        continue;
      }

      index += 1;
      const valueStart = index;

      if (text[index] === "\"" || text[index] === "'") {
        const quote = text[index];
        let cursor = index + 1;

        while (cursor < text.length && text[cursor] !== quote) {
          cursor += text[cursor] === "\\" ? 2 : 1;
        }

        attributes[attributeName] = text.slice(valueStart + 1, cursor);
        index = cursor + 1;
      } else if (text[index] === "{") {
        const close = findBalancedBraceEnd(text, index);

        if (close < 0) {
          return null;
        }

        attributes[attributeName] = { expression: text.slice(index + 1, close) };
        index = close + 1;
      } else {
        return null;
      }
    }

    return null;
  }

  function renderDilTag(tag) {
    const attributes = tag.attributes;
    const text = (name) => (typeof attributes[name] === "string" ? attributes[name] : "");

    if (tag.closing) {
      switch (tag.name) {
        case "title":
          return "**";
        case "badge":
          return ")";
        case "button":
          return "]";
        case "WritingBlock":
          return "\n```\n";
        case "box":
        case "row":
        case "grid":
        case "grid-item":
        case "pressable":
        case "radio-group":
        case "caption":
        case "radio":
        case "text":
          return "\n";
        default:
          return "";
      }
    }

    switch (tag.name) {
      case "Link": {
        const url = text("url");
        const title = text("title") || url;
        return url ? `[${escapeMarkdownLinkLabel(title)}](${url})` : title;
      }
      case "Entity":
        return text("value");
      case "AsyncImage":
        return text("query") ? `*[Image search: ${escapeMarkdownLinkLabel(text("query"))}]*` : "";
      case "Cite":
      case "MemoryCite":
      case "spacer":
        return "";
      case "icon":
        return renderDilIcon(text("name"));
      case "divider":
        return "\n\n---\n\n";
      case "title":
        return tag.selfClosing ? "" : "**";
      case "badge":
        return tag.selfClosing ? "" : " (";
      case "button":
        return tag.selfClosing ? "" : "[";
      case "radio":
        return tag.selfClosing ? "" : "\n- ";
      case "WritingBlock":
        return tag.selfClosing ? "" : "\n```markdown\n";
      default:
        return tag.selfClosing ? "" : "\n";
    }
  }

  function renderDilIcon(name) {
    const glyphs = {
      "arrow-down": "↓",
      "arrow-right": "→",
      "arrow-left": "←",
      "arrow-up": "↑",
      "check": "✓",
      "check-circle-2": "✓",
      "circle": "○"
    };
    return glyphs[String(name || "").toLowerCase()] || "";
  }
