

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

  function getAttachmentHref(element) {
    return element.href
      || element.getAttribute?.("href")
      || element.querySelector?.("a[href]")?.href
      || element.querySelector?.("[href]")?.getAttribute("href")
      || "";
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

  function getMediaWidth(element) {
    return Number(element.getAttribute?.("width")) || element.naturalWidth || element.width || element.clientWidth || 0;
  }

  function getMediaHeight(element) {
    return Number(element.getAttribute?.("height")) || element.naturalHeight || element.height || element.clientHeight || 0;
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

