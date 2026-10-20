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

  /**
   * Picks the Markdown for a DIL message. ChatGPT's fallbackMarkdown leaves
   * out everything a {#each} loop generates (lists, score bars), so a message
   * with loops is rendered from its source when every loop iterates over a
   * literal array. Otherwise the fallback is used and the gap is reported.
   *
   * @returns {{ markdown: string, origin: "fallback" | "source", unexpandedLoops: number }}
   */
  function chooseDilMarkdown(source, fallbackMarkdown) {
    const text = String(source || "");

    if (!DIL_LOOP_OPEN_RE.test(text)) {
      return {
        markdown: normalizeDilFallbackMarkdown(fallbackMarkdown) || renderDilSourceAsMarkdown(text),
        origin: fallbackMarkdown ? "fallback" : "source",
        unexpandedLoops: 0
      };
    }

    const expanded = expandDilTemplateBlocks(text);

    if (!expanded.failed) {
      return { markdown: renderDilSourceAsMarkdown(text), origin: "source", unexpandedLoops: 0 };
    }

    return {
      markdown: normalizeDilFallbackMarkdown(fallbackMarkdown) || renderDilSourceAsMarkdown(text),
      origin: fallbackMarkdown ? "fallback" : "source",
      unexpandedLoops: expanded.failed
    };
  }

  // The fallback writes AsyncImage as "[images: query]"; exports label image
  // searches the same way everywhere.
  function normalizeDilFallbackMarkdown(markdown) {
    return mapOutsideCodeFences(String(markdown || ""), (segment) => segment
      .replace(/^\[images:\s*(.+?)\]\s*$/gm, (match, query) => `*[Image search: ${escapeMarkdownLinkLabel(query)}]*`)
      // The fallback leaves layout tags it could not draw: whole lines such as
      // `<box background="..." padding={3}>`, and checkboxes as `<checkbox .../>`.
      .replace(/^[ \t]*<checkbox\b([^\n]*?)\/?>[ \t]*(?:·[ \t]*)?/gm, (match, attributes) => (/\b(?:defaultChecked|checked)=\{true\}/.test(attributes) ? "- [x] " : "- [ ] "))
      .replace(/^[ \t]*<\/?(?:box|row|grid|grid-item|stack|column|col|card|spacer|divider|pressable|radio-group|radio|button|badge|icon|title|text|caption)\b[^\n]*>[ \t]*$/gm, "")
      .replace(/\n{3,}/g, "\n\n"));
  }

  const DIL_LOOP_OPEN_RE = /\{#each\s/;

  /**
   * Expands {#each LITERAL as item[, index]}...{/each} and {#if ...}...{/if}
   * blocks. Only literal data (arrays, objects, strings, numbers, booleans)
   * is read and only {item.path} / {index} placeholders are substituted;
   * nothing in the source is executed. A loop over anything else stays in
   * place and is counted in `failed`.
   */
  function expandDilTemplateBlocks(text, scope = {}) {
    let output = "";
    let failed = 0;
    let index = 0;

    while (index < text.length) {
      const open = text.indexOf("{#", index);

      if (open < 0) {
        output += substituteDilPlaceholders(text.slice(index), scope);
        break;
      }

      output += substituteDilPlaceholders(text.slice(index, open), scope);
      const headEnd = findBalancedBraceEnd(text, open);
      const head = headEnd > open ? text.slice(open + 2, headEnd) : "";
      const keyword = head.match(/^(each|if)\s/)?.[1];
      const blockEnd = keyword ? findDilBlockEnd(text, headEnd + 1, keyword) : null;

      if (!keyword || !blockEnd) {
        output += text.slice(open, open + 2);
        index = open + 2;
        continue;
      }

      const body = text.slice(headEnd + 1, blockEnd.start);

      if (keyword === "each") {
        const match = head.match(/^each\s+([\s\S]+?)\s+as\s+([A-Za-z_$][\w$]*)(?:\s*,\s*([A-Za-z_$][\w$]*))?\s*$/);
        const items = match ? parseDilLiteral(match[1]) : null;

        if (!Array.isArray(items)) {
          failed += 1;
          output += text.slice(open, blockEnd.end);
        } else {
          const names = [match[2], match[3]].filter(Boolean);
          items.forEach((item, itemIndex) => {
            const inner = expandDilTemplateBlocks(body, { ...scope, [match[2]]: item, ...(match[3] ? { [match[3]]: itemIndex } : {}) });
            failed += inner.failed + countUnresolvedDilPlaceholders(inner.text, names);
            output += inner.text;
          });
        }
      } else {
        const [whenTrue, whenFalse = ""] = splitDilElse(body);
        const condition = evaluateDilCondition(head.slice(3), scope);
        const inner = expandDilTemplateBlocks(condition === false ? whenFalse : whenTrue, scope);
        failed += inner.failed;
        output += inner.text;
      }

      index = blockEnd.end;
    }

    return { text: output, failed };
  }

  // A loop body expression that still names the loop variable could not be
  // resolved from literals (for example {tasks[t.id].name}). Attribute values
  // (={...}) are ignored because attributes are dropped when rendering.
  function countUnresolvedDilPlaceholders(text, names) {
    let count = 0;

    for (let index = text.indexOf("{"); index >= 0; index = text.indexOf("{", index + 1)) {
      const close = findBalancedBraceEnd(text, index);

      if (close < 0) {
        break;
      }

      const expression = text.slice(index + 1, close);
      const isAttribute = /=\s*$/.test(text.slice(Math.max(0, index - 3), index));

      if (!isAttribute && names.some((name) => new RegExp(`(^|[^\\w$.])${name.replace(/\$/g, "\\$")}\\b`).test(expression))) {
        count += 1;
      }

      index = close;
    }

    return count;
  }

  function findDilBlockEnd(text, from, keyword) {
    const pattern = new RegExp(`\\{(#${keyword}\\s|\\/${keyword}\\})`, "g");
    pattern.lastIndex = from;
    let depth = 1;
    let match;

    while ((match = pattern.exec(text))) {
      depth += match[1].startsWith("#") ? 1 : -1;

      if (depth === 0) {
        return { start: match.index, end: match.index + match[0].length };
      }
    }

    return null;
  }

  function splitDilElse(body) {
    const marker = body.search(/\{:else\}/);
    return marker < 0 ? [body] : [body.slice(0, marker), body.slice(marker + "{:else}".length)];
  }

  function substituteDilPlaceholders(text, scope) {
    if (!Object.keys(scope).length) {
      return text;
    }

    return text.replace(/\{\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\}/g, (match, path, offset) => {
      const value = resolveDilPath(path, scope);

      if (value === undefined || (value !== null && typeof value === "object")) {
        return match;
      }

      // An attribute value (name={item.icon}) must stay a quoted string.
      return /=\s*$/.test(text.slice(Math.max(0, offset - 3), offset)) ? JSON.stringify(String(value ?? "")) : String(value ?? "");
    });
  }

  function resolveDilPath(path, scope) {
    const [head, ...rest] = path.split(".");

    if (!Object.prototype.hasOwnProperty.call(scope, head)) {
      return undefined;
    }

    return rest.reduce((value, key) => (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined), scope[head]);
  }

  // Supports `path OP literal` with <, <=, >, >=, ==, ===, !=, !== and a bare
  // path; anything else is unknown (null) and keeps the {#if} branch.
  function evaluateDilCondition(expression, scope) {
    const match = String(expression).trim().match(/^([A-Za-z_$][\w$.]*)\s*(?:(<=|>=|===|!==|==|!=|<|>)\s*(.+))?$/);

    if (!match) {
      return null;
    }

    const left = resolveDilPath(match[1], scope);

    if (left === undefined) {
      return null;
    }

    if (!match[2]) {
      return Boolean(left);
    }

    const right = parseDilLiteral(match[3]);

    switch (match[2]) {
      case "<": return left < right;
      case "<=": return left <= right;
      case ">": return left > right;
      case ">=": return left >= right;
      case "==":
      case "===": return left === right;
      default: return left !== right;
    }
  }

  /**
   * Parses a JavaScript literal (arrays, objects with bare or quoted keys,
   * strings without interpolation, numbers, true/false/null). Returns null
   * for anything else, including identifiers and calls.
   */
  function parseDilLiteral(source) {
    const text = String(source ?? "");
    let index = 0;
    const fail = {};

    const skip = () => {
      while (/\s/.test(text[index] || "")) index += 1;
    };

    const value = () => {
      skip();
      const char = text[index];

      if (char === "[") {
        index += 1;
        const items = [];
        skip();
        while (text[index] !== "]") {
          const item = value();
          if (item === fail) return fail;
          items.push(item);
          skip();
          if (text[index] === ",") { index += 1; skip(); continue; }
          if (text[index] !== "]") return fail;
        }
        index += 1;
        return items;
      }

      if (char === "{") {
        index += 1;
        const object = {};
        skip();
        while (text[index] !== "}") {
          let key;
          if (text[index] === "\"" || text[index] === "'") {
            key = value();
            if (typeof key !== "string") return fail;
          } else {
            const match = text.slice(index).match(/^[A-Za-z_$][\w$]*/);
            if (!match) return fail;
            key = match[0];
            index += key.length;
          }
          skip();
          if (text[index] !== ":") return fail;
          index += 1;
          const item = value();
          if (item === fail) return fail;
          object[key] = item;
          skip();
          if (text[index] === ",") { index += 1; skip(); continue; }
          if (text[index] !== "}") return fail;
        }
        index += 1;
        return object;
      }

      if (char === "\"" || char === "'" || char === "`") {
        let result = "";
        index += 1;
        while (index < text.length && text[index] !== char) {
          if (char === "`" && text.startsWith("${", index)) return fail;
          if (text[index] === "\\") {
            const next = text[index + 1];
            result += { n: "\n", t: "\t", r: "\r" }[next] ?? next;
            index += 2;
            continue;
          }
          result += text[index];
          index += 1;
        }
        if (text[index] !== char) return fail;
        index += 1;
        return result;
      }

      const literal = text.slice(index).match(/^(?:-?\d+(?:\.\d+)?(?:e[+-]?\d+)?|true|false|null)/i);
      if (!literal) return fail;
      index += literal[0].length;
      return literal[0] === "true" ? true : literal[0] === "false" ? false : literal[0] === "null" ? null : Number(literal[0]);
    };

    const result = value();
    skip();
    return result === fail || index !== text.length ? null : result;
  }

  /**
   * Packs what the PDF renderer needs to draw a DIL message the way ChatGPT
   * does: the compiled UI program, its constants and resolved component
   * results, the client-defined widgets it embeds (by invocation id), and the
   * pages its citations point to. Returns null when there is no program.
   */
  function buildDilRenderBlock(message, citationSources) {
    const dil = message?.metadata?.model_dil_v2;

    if (!dil || typeof dil.code !== "string" || !dil.code.trim()) {
      return null;
    }

    const widgetReferences = (Array.isArray(message.metadata?.content_references) ? message.metadata.content_references : [])
      .filter((reference) => reference?.type === "client_defined_widget");
    const widgets = {};

    for (const [invocationId, widget] of Object.entries(dil.clientDefinedWidgets || {})) {
      const reference = widgetReferences[Number(widget?.refIndex)];
      if (reference) {
        widgets[invocationId] = { category: reference.category || "", data: reference.data || {} };
      }
    }

    const citations = {};
    const searchable = `${dil.code}\n${JSON.stringify(dil.constants || {})}`;

    for (const ref of new Set(searchable.match(/turn\d+[a-z_]+\d+/gi) || [])) {
      const source = citationSources?.get(ref);
      if (source) {
        citations[ref] = { url: source.url, title: source.title, label: getCitationLabel(source) };
      }
    }

    return {
      version: 2,
      code: dil.code,
      constants: dil.constants || {},
      appData: dil.appData || {},
      widgets,
      citations
    };
  }

  function getCitationLabel(source) {
    try {
      return new URL(source.url).hostname.replace(/^www\./, "");
    } catch (error) {
      // A non-URL citation keeps its title as the chip label.
      return source.title;
    }
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

    // Search results often repeat one page under several ref ids.
    const samePage = context.footnotes.find((footnote) => footnote.url === source.url);

    if (samePage) {
      context.footnoteIndexByRef.set(ref, samePage.index);
      return samePage.index;
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
    return mapOutsideCodeFences(expandDilTemplateBlocks(String(source || "")).text, (segment) => {
      const withoutStatements = stripDilExpressionBlocks(segment);
      // Component nesting indents source lines; four spaces would turn them
      // into Markdown code blocks, so only list items keep their indentation.
      return joinDilRows(renderDilComponents(withoutStatements))
        .replace(/^[ \t]+(?![-*+][ \t]|\d+[.)][ \t])/gm, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n");
    });
  }

  const DIL_ROW_OPEN = "\u0001DILROW<";
  const DIL_ROW_CLOSE = "\u0001DILROW>";

  // A <row> lays its children out horizontally; in Markdown its text parts
  // become one line joined with " · ". Inner rows are joined first.
  function joinDilRows(text) {
    const innermost = new RegExp(`${DIL_ROW_OPEN}((?:(?!${DIL_ROW_OPEN})[\\s\\S])*?)${DIL_ROW_CLOSE}`);
    let output = text;
    let match;

    while ((match = output.match(innermost))) {
      const parts = match[1].split("\n").map((line) => line.trim()).filter(Boolean);
      output = output.slice(0, match.index) + `\n\n${parts.join(" · ")}\n\n` + output.slice(match.index + match[0].length);
    }

    return output.split(DIL_ROW_OPEN).join("").split(DIL_ROW_CLOSE).join("");
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
        case "row":
          return DIL_ROW_CLOSE;
        case "box":
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
      case "Cite": {
        const refs = typeof attributes.ref === "string"
          ? [attributes.ref]
          : (parseDilLiteral(attributes.refs?.expression ?? attributes.refs) || []);
        const valid = (Array.isArray(refs) ? refs : []).filter((ref) => typeof ref === "string" && CHATGPT_CITATION_REF_RE.test(ref));
        return valid.length
          ? `${CHATGPT_TOKEN_START}cite${valid.map((ref) => `${CHATGPT_TOKEN_SEPARATOR}${ref}`).join("")}${CHATGPT_TOKEN_END}`
          : "";
      }
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
        return tag.selfClosing ? "" : "\n```writing\n";
      case "row":
        return tag.selfClosing ? "" : DIL_ROW_OPEN;
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
