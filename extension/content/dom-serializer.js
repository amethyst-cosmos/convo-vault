  async function extractMessage(node, parts, role, order) {
    const body = parts.body || node;
    const thinkingElements = parts.thinkingElements || [];
    let state = createSerializationState(thinkingElements);
    let usedWholeNodeFallback = false;
    const serializationAttempts = [];
    let markdown = cleanMarkdown(await serializeNodeChildren(body, state));
    serializationAttempts.push({
      stage: "primary-body",
      length: markdown.length,
      node: summarizeNode(body)
    });

    if (shouldRunCompletenessPass(node, body, role, markdown)) {
      const completeState = createSerializationState(thinkingElements, true);
      const completeResult = await serializeCompleteMessageContent(node, parts, completeState, serializationAttempts);

      if (isMoreCompleteMarkdown(completeResult.markdown, markdown)) {
        markdown = completeResult.markdown;
        usedWholeNodeFallback = completeResult.usedFallback;
        state = completeState;
      }
    }

    if (!markdown) {
      const fallbackState = createSerializationState(thinkingElements, true);
      const fallbackResult = await serializeFallbackMessageContent(node, parts, fallbackState, serializationAttempts);
      markdown = fallbackResult.markdown;
      usedWholeNodeFallback = fallbackResult.usedFallback;
      state = fallbackState;
    }

    const previousSkipElements = state.skipElements;
    let thinkingMarkdown = "";

    try {
      state.skipElements = new WeakSet();
      thinkingMarkdown = cleanMarkdown((await Promise.all(
        thinkingElements.map((element) => serializeNode(element, state))
      )).join("\n\n"));
    } finally {
      state.skipElements = previousSkipElements;
    }

    markdown = dedupeMarkdownImageReferences(markdown);
    thinkingMarkdown = dedupeMarkdownImageReferences(thinkingMarkdown);
    const serializedImageCount = countMarkdownImages(`${markdown}\n${thinkingMarkdown}`);

    return {
      role,
      sourceNode: node,
      sourceTurnId: getTurnId(node),
      sourceTurnContainer: node.getAttribute("data-turn-id-container") || node.getAttribute("data-turn-container") || "",
      sourceTestId: node.getAttribute("data-testid") || "",
      sourceMessageId: getMessageIdFromNode(node),
      sourceMessageIds: getChatGptMessageUnitInfo(node)?.messageIds || [],
      order: getOrderHint(node, order),
      timestamp: parts.timestamp || "",
      markdown,
      thinkingMarkdown,
      usedWholeNodeFallback,
      serializationAttempts,
      codeBlockCount: state.codeBlockCount,
      fileCount: state.fileCount,
      imageCount: serializedImageCount,
      imagesEmbedded: Math.min(serializedImageCount, state.imagesEmbedded),
      imagesDeferred: Math.min(serializedImageCount, state.imagesDeferred),
      imagesFailed: Math.max(0, state.imagesFailed),
      imageEvents: state.imageEvents
    };
  }

  function createSerializationState(thinkingElements = [], includeHidden = false) {
    return {
      codeBlockCount: 0,
      fileCount: 0,
      imageCount: 0,
      imagesEmbedded: 0,
      imagesDeferred: 0,
      imagesFailed: 0,
      imageEvents: [],
      includeHidden,
      skipElements: new WeakSet(thinkingElements)
    };
  }

  function shouldRunCompletenessPass(node, body, role, markdown) {
    if (role !== "assistant") {
      return false;
    }

    return Boolean(
      isLastTurnNode(node)
      || node.querySelector?.("[data-is-last-node], [data-is-only-node], [data-end], [data-start]")
      || body?.querySelector?.("[data-is-last-node], [data-is-only-node], [data-end], [data-start]")
      || markdown.length > 1200
    );
  }

  function isMoreCompleteMarkdown(candidate, current) {
    const next = cleanMarkdown(candidate);
    const previous = cleanMarkdown(current);

    if (!next) {
      return false;
    }

    if (!previous) {
      return true;
    }

    return next.length > previous.length + Math.max(180, Math.floor(previous.length * 0.18));
  }

  async function serializeCompleteMessageContent(node, parts, state, attempts = []) {
    const body = parts.body || node;
    const candidates = getCompleteContentCandidates(node, body);
    const serializedPieces = [];

    for (const candidate of candidates) {
      const markdown = cleanMarkdown(await serializeNode(candidate, state));

      attempts.push({
        stage: "complete-candidate",
        length: markdown.length,
        node: summarizeNode(candidate),
        hint: getSerializationHint(candidate)
      });

      if (markdown) {
        serializedPieces.push(markdown);
      }
    }

    const aggregate = cleanMarkdown(serializedPieces.join("\n\n"));
    attempts.push({
      stage: "complete-aggregate",
      length: aggregate.length,
      candidateCount: candidates.length,
      node: summarizeNode(node),
      hint: getSerializationHint(node)
    });

    if (aggregate) {
      return {
        markdown: aggregate,
        usedFallback: candidates.some((candidate) => candidate !== body)
      };
    }

    const wholeTurn = cleanMarkdown(await serializeNodeChildren(node, state));
    attempts.push({
      stage: "complete-whole-turn",
      length: wholeTurn.length,
      node: summarizeNode(node),
      hint: getSerializationHint(node)
    });

    return {
      markdown: wholeTurn,
      usedFallback: true
    };
  }

  function getCompleteContentCandidates(node, body) {
    const richSelector = "div.markdown.prose, .markdown.prose, .markdown, [class*='markdown'], [class*='prose']";
    const richCandidates = uniqueTopLevelElements([
      body?.matches?.(richSelector) ? body : null,
      ...node.querySelectorAll(richSelector)
    ]).filter((candidate) => isSerializableContentCandidate(candidate, node));

    if (richCandidates.length) {
      return richCandidates;
    }

    const selectors = [
      "[data-start]",
      "[data-end]",
      "[data-is-last-node]",
      "[data-is-only-node]",
      "[data-is-streaming]",
      "[class*='result-streaming']",
      "blockquote",
      "ul",
      "ol",
      "table",
      "pre"
    ].join(", ");
    const rawCandidates = uniqueElements([
      body,
      ...node.querySelectorAll(selectors)
    ]).filter((candidate) => isSerializableContentCandidate(candidate, node));

    const topLevel = uniqueTopLevelElements(rawCandidates);

    if (topLevel.length === 1 && topLevel[0] === body && body !== node && isLastTurnNode(node)) {
      return uniqueTopLevelElements([body, ...node.querySelectorAll("[data-start], [data-end], [data-is-last-node], [data-is-only-node]")]);
    }

    return topLevel.length ? topLevel : [body || node];
  }

  function isSerializableContentCandidate(candidate, scope) {
    return Boolean(
      candidate
      && scope?.contains?.(candidate)
      && hasMessageContent(candidate)
      && !isNonMessageNode(candidate)
      && !candidate.closest("nav, aside, header, footer, [role='menu'], [role='menuitem']")
    );
  }

  async function serializeFallbackMessageContent(node, parts, state, attempts = []) {
    const previousIncludeHidden = state.includeHidden;
    state.includeHidden = true;
    const candidates = uniqueElements([
      ...findStructuredContentCandidates(node),
      ...findAssistantBodyCandidates(node, parts.body || node),
      ...getExpandableContentButtons(node),
      parts.body,
      node
    ]).filter((candidate) => candidate && hasMessageContent(candidate) && !isNonMessageNode(candidate));

    try {
      for (const candidate of candidates) {
        const markdown = cleanMarkdown(await serializeNodeChildren(candidate, state));
        attempts.push({
          stage: "fallback-candidate",
          length: markdown.length,
          node: summarizeNode(candidate),
          hint: getSerializationHint(candidate)
        });

        if (markdown) {
          return {
            markdown,
            usedFallback: candidate !== parts.body
          };
        }
      }

      const rawText = cleanMarkdown(getRawElementText(node));
      attempts.push({
        stage: "raw-text",
        length: rawText.length,
        node: summarizeNode(node)
      });

      if (rawText && !NON_MESSAGE_TEXT_RE.test(rawText)) {
        return {
          markdown: rawText,
          usedFallback: true
        };
      }

      return {
        markdown: "",
        usedFallback: false
      };
    } finally {
      state.includeHidden = previousIncludeHidden;
    }
  }

  function findStructuredContentCandidates(node) {
    if (!node?.querySelectorAll) {
      return [];
    }

    return [...node.querySelectorAll("div.markdown.prose, .markdown.prose, [data-start], [data-end], [data-is-last-node], [data-is-only-node], blockquote, ul, ol, table")]
      .filter((candidate) => !candidate.closest("nav, aside, header, footer"));
  }

  async function serializeNodeChildren(element, state) {
    const parts = [];

    for (const child of element.childNodes) {
      parts.push(await serializeNode(child, state));
    }

    return parts.join("");
  }

  function getCssInlineMarkdownFormat(element) {
    if (!isInlineMarkdownFormattingElement(element)) {
      return null;
    }

    const className = ` ${String(element.getAttribute("class") || "")} `;
    const styleAttr = String(element.getAttribute("style") || "");
    let bold = hasChatGptDilStrongMarker(element)
      || /\sfont-(?:semibold|bold|extrabold|black)\s/.test(className)
      || /font-\[(?:[6-9]\d{2}|[1-9]\d{3})\]/.test(className)
      || /font-weight\s*:\s*(?:bold|bolder|[6-9]\d{2}|[1-9]\d{3})/i.test(styleAttr);
    let italic = /\sitalic\s/.test(className) || /font-style\s*:\s*(?:italic|oblique)/i.test(styleAttr);

    if (!bold || !italic) {
      const computed = getElementComputedStyle(element);
      const parentComputed = getElementComputedStyle(element.parentElement);

      if (!bold && computed) {
        const weight = parseFontWeight(computed.fontWeight);
        const parentWeight = parseFontWeight(parentComputed?.fontWeight);
        bold = weight >= 600 && weight > Math.max(500, parentWeight || 0);
      }

      if (!italic && computed) {
        italic = /italic|oblique/i.test(computed.fontStyle || "") && !/italic|oblique/i.test(parentComputed?.fontStyle || "");
      }
    }

    return bold || italic ? { bold, italic } : null;
  }

  function isInlineMarkdownFormattingElement(element) {
    const tag = element?.tagName?.toLowerCase?.() || "";

    if (!["span", "mark", "small"].includes(tag)) {
      return false;
    }

    return !element.querySelector?.("p, ul, ol, blockquote, table, pre, h1, h2, h3, h4, h5, h6, div, section, article");
  }

  function getElementComputedStyle(element) {
    if (!element || !window.getComputedStyle) {
      return null;
    }

    try {
      return window.getComputedStyle(element);
    } catch {
      return null;
    }
  }

  function parseFontWeight(weight) {
    const value = String(weight || "").trim().toLowerCase();

    if (value === "bold" || value === "bolder") {
      return 700;
    }

    if (value === "normal" || value === "lighter") {
      return 400;
    }

    const numeric = Number.parseInt(value, 10);
    return Number.isFinite(numeric) ? numeric : 400;
  }

  function wrapSerializedInlineMarkdown(text, format) {
    let value = cleanMarkdown(text);

    if (!value) {
      return "";
    }

    if (format.italic && !isWrappedWithMarkdown(value, "_") && !isWrappedWithMarkdown(value, "*")) {
      value = `_${value}_`;
    }

    if (format.bold && !isWrappedWithMarkdown(value, "**") && !isWrappedWithMarkdown(value, "__")) {
      value = `**${value}**`;
    }

    return value;
  }

  function isWrappedWithMarkdown(text, marker) {
    return String(text || "").startsWith(marker) && String(text || "").endsWith(marker);
  }

  async function serializeNode(node, state) {
    if (node.nodeType === Node.TEXT_NODE) {
      return normalizeTextNode(node.nodeValue || "", node.parentElement);
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const element = node;
    const tag = element.tagName.toLowerCase();

    // Citation chips use role="button", which the generic skip rules drop.
    if (isChatGptDilCitationChip(element) && !state?.skipElements?.has(element)) {
      return formatChatGptDilCitationChip(element);
    }

    if (shouldSkipElement(element, state)) {
      return "";
    }

    if (tag === "br") {
      return "\n";
    }

    if (tag === "pre") {
      // Code blocks are serialized directly so syntax fences and language hints
      // survive even if surrounding toolbar markup changes.
      state.codeBlockCount += 1;
      return `\n\n${formatCodeBlock(element)}\n\n`;
    }

    if (isLikelyFileAttachmentElement(element)) {
      const fileMarkdown = formatFileAttachmentMarkdown(element);
      if (fileMarkdown) {
        state.fileCount += 1;
      }
      return fileMarkdown ? `\n\n${fileMarkdown}\n\n` : "";
    }

    if (isChatGptDilDivider(element)) {
      return "\n\n---\n\n";
    }

    if (isChatGptWritingBlockElement(element)) {
      const block = formatChatGptWritingBlock(element);
      return block ? `\n\n${block}\n\n` : "";
    }

    if (hasChatGptRangeMarker(element) && !isSemanticMarkdownElementTag(tag)) {
      const text = cleanMarkdown(await serializeNodeChildren(element, state));
      return text ? `\n\n${text}\n\n` : "";
    }

    if (tag === "img") {
      if (isLikelyDecorativeImage(element)) {
        return "";
      }

      state.imageCount += 1;
      const imageMarkdown = await imageElementToMarkdown(element, state);
      return imageMarkdown ? `\n\n${imageMarkdown}\n\n` : "";
    }

    if (tag === "canvas") {
      const imageMarkdown = canvasElementToMarkdown(element, state);
      return imageMarkdown ? `\n\n${imageMarkdown}\n\n` : "";
    }

    if (tag === "code" && element.closest("pre") === null && isStandaloneCodeBlock(element)) {
      state.codeBlockCount += 1;
      return `\n\n${formatCodeBlockFromElement(element)}\n\n`;
    }

    if (tag === "code" && element.closest("pre") === null) {
      return formatInlineCode(element.textContent || "");
    }

    if (tag === "strong" || tag === "b") {
      const text = cleanMarkdown(await serializeNodeChildren(element, state));
      return text ? `**${text}**` : "";
    }

    if (tag === "em" || tag === "i") {
      const text = cleanMarkdown(await serializeNodeChildren(element, state));
      return text ? `_${text}_` : "";
    }

    if (tag === "s" || tag === "del") {
      const text = cleanMarkdown(await serializeNodeChildren(element, state));
      return text ? `~~${text}~~` : "";
    }

    const cssInlineFormat = getCssInlineMarkdownFormat(element);

    if (cssInlineFormat) {
      const text = cleanMarkdown(await serializeNodeChildren(element, state));
      return text ? wrapSerializedInlineMarkdown(text, cssInlineFormat) : "";
    }

    if (tag === "hr") {
      return "\n\n---\n\n";
    }

    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag.slice(1));
      const text = cleanMarkdown(await serializeNodeChildren(element, state));
      return text ? `\n\n${"#".repeat(level)} ${text}\n\n` : "";
    }

    if (tag === "p") {
      const text = cleanMarkdown(await serializeNodeChildren(element, state));
      return text ? `\n\n${text}\n\n` : "";
    }

    if (tag === "ul") {
      return `\n${await serializeList(element, state, false)}\n`;
    }

    if (tag === "ol") {
      return `\n${await serializeList(element, state, true)}\n`;
    }

    if (tag === "blockquote") {
      const quote = cleanMarkdown(await serializeNodeChildren(element, state));
      return quote ? `\n\n${quote.split("\n").map((line) => `> ${line}`).join("\n")}\n\n` : "";
    }

    if (tag === "table") {
      const table = await serializeTable(element, state);
      return table ? `\n\n${table}\n\n` : "";
    }

    if (tag === "a") {
      const href = element.href;
      const rawLabel = cleanMarkdown(await serializeNodeChildren(element, state)) || href;
      const label = cleanPdfLinkLabel(rawLabel, href);

      if (!href || href === label || href.startsWith("javascript:")) {
        return label;
      }

      return `[${escapeMarkdownLinkLabel(label)}](${href})`;
    }

    const serialized = await serializeNodeChildren(element, state);

    if (isBlockElement(tag)) {
      const text = cleanMarkdown(serialized);
      return text ? `\n\n${text}\n\n` : "";
    }

    return serialized;
  }

  function hasChatGptRangeMarker(element) {
    return Boolean(
      element?.hasAttribute?.("data-start")
      || element?.hasAttribute?.("data-end")
      || element?.hasAttribute?.("data-is-last-node")
      || element?.hasAttribute?.("data-is-only-node")
    );
  }

  function isSemanticMarkdownElementTag(tag) {
    return /^h[1-6]$/.test(tag)
      || [
        "p",
        "pre",
        "code",
        "strong",
        "b",
        "em",
        "i",
        "s",
        "del",
        "hr",
        "ul",
        "ol",
        "blockquote",
        "table",
        "a",
        "img",
        "canvas"
      ].includes(tag);
  }

  function shouldSkipElement(element, state) {
    const tag = element.tagName.toLowerCase();

    if (state?.skipElements?.has(element)) {
      return true;
    }

    if (["script", "style", "noscript", "template", "svg"].includes(tag)) {
      return true;
    }

    if (isChatGptCopyExcludedElement(element)) {
      return true;
    }

    if (tag === "button" && !isExpandableContentButton(element) && !hasUsefulImageContent(element) && !hasUsefulFileContent(element)) {
      return true;
    }

    if (!state?.includeHidden && (element.getAttribute("aria-hidden") === "true" || element.hidden)) {
      return true;
    }

    if (element.matches(".sr-only, [data-testid*='copy'], [data-testid*='feedback'], [data-testid*='share'], [data-testid*='toolbar'], [data-testid*='actions']")) {
      return true;
    }

    if (element.matches("[role='button']") && !isExpandableContentButton(element) && !hasUsefulImageContent(element) && !hasUsefulFileContent(element)) {
      return true;
    }

    if (element.matches("[role='menu'], [role='menuitem'], [role='tooltip'], [role='dialog']")) {
      return true;
    }

    if (element.matches("[aria-label*='Copy' i], [aria-label*='Read aloud' i], [aria-label*='Good response' i], [aria-label*='Bad response' i], [aria-label*='Share' i]")) {
      return true;
    }

    return isLikelyCodeToolbar(element);
  }

  function isLikelyCodeToolbar(element) {
    if (element.querySelector("pre") || !element.parentElement?.querySelector("pre")) {
      return false;
    }

    const previousOrNextIsPre = element.previousElementSibling?.matches("pre") || element.nextElementSibling?.matches("pre");

    if (!previousOrNextIsPre) {
      return false;
    }

    const text = getElementText(element).toLowerCase().replace(/\s+/g, " ").trim();

    if (!text || text.length > 80) {
      return false;
    }

    const words = text.split(" ").filter(Boolean);
    return words.every((word) => word === "copy" || word === "code" || KNOWN_LANGUAGES.has(word));
  }

  function hasUsefulImageContent(element) {
    const image = element.querySelector?.("img");

    if (!image) {
      return false;
    }

    if (isLikelyImageAttachmentButton(element)) {
      return true;
    }

    const width = getMediaWidth(image);
    const height = getMediaHeight(image);
    return width >= 80 && height >= 80;
  }

  function isLikelyImageAttachmentButton(element) {
    const label = [
      element.getAttribute?.("aria-label") || "",
      element.getAttribute?.("title") || "",
      element.getAttribute?.("class") || "",
      element.querySelector?.("img")?.getAttribute("alt") || ""
    ].join(" ").toLowerCase();

    return /open image|image|picture|photo|attachment|\u6253\u5f00\u56fe\u7247|\u56fe\u7247|\u9644\u4ef6/.test(label);
  }

  function hasUsefulFileContent(element) {
    return Boolean(isLikelyFileAttachmentElement(element));
  }

  function isLikelyFileAttachmentElement(element) {
    if (!element?.matches) {
      return false;
    }

    if (element.closest?.("[data-testid*='copy' i], [data-testid*='toolbar' i], [data-testid*='actions' i]")) {
      return false;
    }

    const text = getElementText(element);
    const href = getAttachmentHref(element);

    if (isChatGptDilWebLink(element, href)) {
      return false;
    }

    const signal = [
      text,
      href,
      element.getAttribute("download") || "",
      element.getAttribute("aria-label") || "",
      element.getAttribute("title") || "",
      element.getAttribute("class") || "",
      element.querySelector?.("[download]")?.getAttribute("download") || ""
    ].join(" ");
    const attachmentName = extractFileName(signal);

    if (!FILE_ATTACHMENT_RE.test(signal)) {
      return false;
    }

    if (!attachmentName) {
      return false;
    }

    const hasAttachmentControl = element.matches("a, button, [role='button'], [download]")
      || Boolean(element.querySelector?.("a, button, [role='button'], [download]"));

    return hasAttachmentControl && isCompactFileAttachmentElement(element, attachmentName);
  }

  function isCompactFileAttachmentElement(element, attachmentName) {
    if (!element?.matches) {
      return false;
    }

    if (isTurnNode(element) || hasRoleOrMessageIdSignal(element)) {
      return false;
    }

    if (element.querySelector?.(".markdown, [class*='markdown'], [class*='prose'], [data-start], [data-end], [data-is-last-node], [data-is-only-node], p, li, blockquote, pre, table")) {
      return false;
    }

    const text = getElementText(element);
    const compactRemainder = text
      .replace(attachmentName, "")
      .replace(FILE_ATTACHMENT_RE, "")
      .replace(/\b(open|download|attachment|attached|uploaded|preview)\b/gi, "")
      .replace(/\u6253\u5f00|\u4e0b\u8f7d|\u9644\u4ef6|\u6587\u4ef6|\u9884\u89c8/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (compactRemainder.length > 36) {
      return false;
    }

    const rect = element.getBoundingClientRect?.();

    if (rect && rect.width && rect.height && (rect.height > 160 || rect.width > 520)) {
      return false;
    }

    return true;
  }

  function formatFileAttachmentMarkdown(element) {
    const href = getAttachmentHref(element);
    const name = sanitizeFileAttachmentName(getAttachmentName(element, href));

    if (!name) {
      return "";
    }

    return `[File: ${escapeMarkdownLinkLabel(name)}]`;
  }

  function getAttachmentHref(element) {
    return element.href
      || element.getAttribute?.("href")
      || element.querySelector?.("a[href]")?.href
      || element.querySelector?.("[href]")?.getAttribute("href")
      || "";
  }

  function getAttachmentName(element, href = "") {
    const download = element.getAttribute?.("download") || element.querySelector?.("[download]")?.getAttribute("download") || "";
    const text = getElementText(element);
    const label = element.getAttribute?.("aria-label") || element.getAttribute?.("title") || "";
    const candidates = [download, text, label, filenameFromUrl(href)];

    for (const candidate of candidates) {
      const name = extractFileName(candidate);

      if (name) {
        return name;
      }
    }

    return "";
  }

  function filenameFromUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      return decodeURIComponent(parsed.pathname.split("/").pop() || "");
    } catch {
      return "";
    }
  }

  function extractFileName(text) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    const match = value.match(FILE_NAME_RE);
    return match?.[0] || "";
  }

  function sanitizeFileAttachmentName(name) {
    return String(name || "").replace(/\s+/g, " ").trim().slice(0, 160);
  }

  async function serializeList(listElement, state, ordered) {
    const items = [...listElement.children].filter((child) => child.tagName?.toLowerCase() === "li");
    let number = Number(listElement.getAttribute("start") || 1);
    const lines = [];

    for (const item of items) {
      const text = cleanMarkdown(await serializeNodeChildren(item, state));

      if (!text) {
        continue;
      }

      const prefix = ordered ? `${number}. ` : "- ";
      lines.push(`${prefix}${text.replace(/\n/g, "\n  ")}`);
      number += 1;
    }

    return lines.join("\n");
  }

  async function serializeTable(table, state) {
    const rows = [];

    for (const row of table.querySelectorAll("tr")) {
      const cells = [];

      for (const cell of row.querySelectorAll("th,td")) {
        const markdown = cleanMarkdown(await serializeNodeChildren(cell, state));
        cells.push(escapeTableCell(markdown || getElementText(cell)));
      }

      if (cells.length > 0) {
        rows.push(cells);
      }
    }

    if (!rows.length) {
      return "";
    }

    const columnCount = Math.max(...rows.map((row) => row.length));
    const normalizedRows = rows.map((row) => padRow(row, columnCount));
    const [header, ...bodyRows] = normalizedRows;
    const separator = Array.from({ length: columnCount }, () => "---");

    return [
      markdownTableRow(header),
      markdownTableRow(separator),
      ...bodyRows.map(markdownTableRow)
    ].join("\n");
  }

  async function imageElementToMarkdown(image, state) {
    const src = image.currentSrc || image.src || image.getAttribute("src") || "";
    const alt = sanitizeAltText(image.alt || image.getAttribute("aria-label") || `image-${state.imageCount}`);

    if (!src) {
      state.imagesFailed += 1;
      state.imageEvents?.push({
        type: "img",
        src: "",
        ok: false,
        reason: "image source is missing"
      });
      return "";
    }

    state.imagesDeferred += 1;
    state.imageEvents?.push({
      type: "img",
      src,
      ok: true,
      skipped: true,
      deferred: true,
      reason: "base64 embedding deferred until export"
    });
    return `![${escapeMarkdownLinkLabel(alt)}](${src})\n\n<!-- Image base64 embedding is deferred until export to avoid page side effects. -->`;
  }

  function canvasElementToMarkdown(canvas, state) {
    const width = canvas.width || canvas.clientWidth;
    const height = canvas.height || canvas.clientHeight;

    if (!width || !height || isLikelyDecorativeMedia(canvas)) {
      return "";
    }

    try {
      state.imageCount += 1;
      state.imagesEmbedded += 1;
      state.imageEvents?.push({
        type: "canvas",
        ok: true
      });
      return `![canvas-${state.imageCount}](${canvas.toDataURL("image/png")})`;
    } catch (error) {
      state.imagesFailed += 1;
      state.imageEvents?.push({
        type: "canvas",
        ok: false,
        error: error.message || String(error)
      });
      return `<!-- Canvas could not be converted to base64: ${escapeHtmlComment(error.message || String(error))} -->`;
    }
  }

  function isLikelyDecorativeImage(image) {
    const imageButton = image.closest("button, [role='button']");
    const src = image.currentSrc || image.src || image.getAttribute("src") || "";

    if (isFaviconImageUrl(src)) {
      return true;
    }

    if (imageButton && isLikelyImageAttachmentButton(imageButton)) {
      return false;
    }

    if (image.closest("button, [role='button'], [role='menuitem'], [data-testid*='avatar' i], [class*='avatar' i]")) {
      return true;
    }

    return isLikelyDecorativeMedia(image);
  }

  function isFaviconImageUrl(url) {
    return /(?:google\.com\/s2\/favicons|favicon)/i.test(String(url || ""));
  }

  function isLikelyDecorativeMedia(element) {
    const width = getMediaWidth(element);
    const height = getMediaHeight(element);
    const alt = "alt" in element ? String(element.alt || "").trim() : "";

    if (alt === "" && width && height && width <= 48 && height <= 48) {
      return true;
    }

    return width && height && width <= 24 && height <= 24;
  }

  function getMediaWidth(element) {
    return Number(element.getAttribute?.("width")) || element.naturalWidth || element.width || element.clientWidth || 0;
  }

  function getMediaHeight(element) {
    return Number(element.getAttribute?.("height")) || element.naturalHeight || element.height || element.clientHeight || 0;
  }

  function formatCodeBlock(pre) {
    const code = trimTrailingNewlines(extractCodeText(pre));
    const language = detectCodeLanguage(pre);
    const fence = makeFence(code);
    return `${fence}${language}\n${code}\n${fence}`;
  }

  function formatCodeBlockFromElement(codeElement) {
    const code = trimTrailingNewlines(extractCodeText(codeElement));
    const language = detectCodeLanguage(codeElement);
    const fence = makeFence(code);
    return `${fence}${language}\n${code}\n${fence}`;
  }

  function extractCodeText(pre) {
    const codeElement = pre.matches?.("code") ? pre : pre.querySelector("code");

    if (codeElement) {
      return normalizeExtractedCodeText(codeElement.innerText || codeElement.textContent || "");
    }

    const clone = pre.cloneNode(true);

    for (const element of clone.querySelectorAll("button, [role='button'], [data-testid*='copy' i], [data-testid*='toolbar' i]")) {
      element.remove();
    }

    return normalizeExtractedCodeText(pre.innerText || clone.textContent || "");
  }

  function normalizeExtractedCodeText(text) {
    return String(text || "")
      .replace(/\r\n?/g, "\n")
      .replace(/\u00a0/g, " ");
  }

  function detectCodeLanguage(pre) {
    const code = pre.matches("code") ? pre : pre.querySelector("code");
    const candidates = [
      code?.getAttribute("data-language"),
      code?.getAttribute("data-highlight-language"),
      code?.getAttribute("data-code-language"),
      pre.getAttribute("data-language"),
      pre.getAttribute("data-highlight-language"),
      pre.getAttribute("data-code-language"),
      getLanguageFromClass(code?.className || ""),
      getLanguageFromClass(pre.className || ""),
      getLanguageFromClass(pre.parentElement?.className || ""),
      getLanguageFromNearbyText(pre)
    ];

    for (const candidate of candidates) {
      const language = normalizeLanguage(candidate);

      if (language) {
        return language;
      }
    }

    return "";
  }

  function getLanguageFromClass(className) {
    const match = String(className).match(/(?:^|\s)(?:language|lang)-([a-z0-9_+#.-]+)/i);
    return match?.[1] || "";
  }

  function getLanguageFromNearbyText(pre) {
    const nearbyText = [
      pre.previousElementSibling?.textContent || "",
      pre.parentElement?.firstElementChild?.textContent || ""
    ].join(" ").toLowerCase();

    for (const language of KNOWN_LANGUAGES) {
      if (new RegExp(`\\b${escapeRegExp(language)}\\b`, "i").test(nearbyText)) {
        return language;
      }
    }

    return "";
  }

  function normalizeLanguage(language) {
    const normalized = String(language || "")
      .trim()
      .toLowerCase()
      .replace(/^language-/, "")
      .replace(/^lang-/, "")
      .replace(/^brush:/, "")
      .replace(/[^a-z0-9_+#.-]/g, "");

    if (!normalized || normalized.length > 30) {
      return "";
    }

    return LANGUAGE_ALIASES.get(normalized) || normalized;
  }

  function isStandaloneCodeBlock(element) {
    const text = element.textContent || "";

    return text.includes("\n") || element.matches("[class*='hljs'], [class*='language-'], [class*='lang-']");
  }

  function formatInlineCode(text) {
    const trimmed = text.trim();

    if (!trimmed) {
      return "";
    }

    const fence = trimmed.includes("`") ? "``" : "`";
    return `${fence}${trimmed}${fence}`;
  }
