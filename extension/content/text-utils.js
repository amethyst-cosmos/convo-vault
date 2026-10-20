  function isBlockElement(tag) {
    return [
      "article",
      "aside",
      "div",
      "figcaption",
      "figure",
      "footer",
      "header",
      "main",
      "section"
    ].includes(tag);
  }

  function getElementText(element) {
    return (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
  }

  function getRawElementText(element) {
    return String(element?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function normalizeTextNode(text, parentElement) {
    const normalized = String(text || "").replace(/\r\n?/g, "\n");

    if (preservesWhitespace(parentElement)) {
      return normalized
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/\n{3,}/g, "\n\n");
    }

    return normalized.replace(/\s+/g, " ");
  }

  function preservesWhitespace(element) {
    return Boolean(element?.closest?.("pre, textarea, [class*='whitespace-pre-wrap'], [style*='white-space: pre-wrap']"));
  }

  function cleanMarkdown(markdown) {
    return normalizeMarkdownOutsideCodeFences(String(markdown || ""), (text) => String(text || "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
    )
      .trim();
  }

  function normalizeMarkdownOutsideCodeFences(markdown, normalizeText) {
    const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
    const chunks = [];
    let buffer = [];
    let inFence = false;
    let fenceChar = "";
    let fenceLength = 0;

    const flushText = () => {
      if (!buffer.length) {
        return;
      }

      chunks.push(normalizeText(buffer.join("\n")));
      buffer = [];
    };

    const flushCode = () => {
      if (!buffer.length) {
        return;
      }

      chunks.push(buffer.join("\n").replace(/[ \t]+$/gm, ""));
      buffer = [];
    };

    for (const line of lines) {
      const openingFence = line.match(/^\s*([`~]{3,})(.*)$/);

      if (!inFence && openingFence) {
        flushText();
        inFence = true;
        fenceChar = openingFence[1][0];
        fenceLength = openingFence[1].length;
        buffer.push(line.trimEnd());
        continue;
      }

      if (inFence) {
        buffer.push(line);

        if (isClosingMarkdownFence(line, fenceChar, fenceLength)) {
          flushCode();
          inFence = false;
          fenceChar = "";
          fenceLength = 0;
        }
        continue;
      }

      buffer.push(line);
    }

    if (inFence) {
      flushCode();
    } else {
      flushText();
    }

    return chunks.join("\n");
  }

  function isClosingMarkdownFence(line, fenceChar, fenceLength) {
    const match = String(line || "").match(/^\s*([`~]{3,})\s*$/);
    return Boolean(match && match[1][0] === fenceChar && match[1].length >= fenceLength);
  }

  function makeFence(code) {
    const longestRun = Math.max(0, ...[...String(code).matchAll(/`+/g)].map((match) => match[0].length));
    return "`".repeat(Math.max(3, longestRun + 1));
  }

  function uniqueElements(elements) {
    return [...new Set(elements.filter(Boolean))];
  }

  function uniqueStrings(values) {
    return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
  }

  function uniqueTopLevelElements(elements) {
    const sorted = uniqueElements(elements).sort(compareDocumentOrder);
    const result = [];

    for (const element of sorted) {
      if (result.some((existing) => existing.contains(element))) {
        continue;
      }

      for (let index = result.length - 1; index >= 0; index -= 1) {
        if (element.contains(result[index])) {
          result.splice(index, 1);
        }
      }

      result.push(element);
    }

    return result;
  }

  function trimTrailingNewlines(text) {
    return String(text || "").replace(/\n+$/g, "");
  }

  function markdownTableRow(cells) {
    return `| ${cells.join(" | ")} |`;
  }

  function padRow(row, length) {
    return [...row, ...Array.from({ length: length - row.length }, () => "")];
  }

  function escapeTableCell(text) {
    return sanitizeTableCellMarkdown(text).replace(/\|/g, "\\|");
  }

  function sanitizeTableCellMarkdown(text) {
    return String(text || "")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/\[!\\?\[[^\]\n]*\\?\]\([^)]+\)\s*([^\]]*?)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, url) => formatCleanPdfMarkdownLink(label, url))
      .replace(/!\\?\[[^\]\n]*\\?\]\([^)]+\)/g, "")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, url) => formatCleanPdfMarkdownLink(label, url))
      .replace(/[ \t]*\r?\n+[ \t]*/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function formatCleanPdfMarkdownLink(label, url) {
    const cleanLabel = cleanPdfLinkLabel(label, url);
    return cleanLabel && cleanLabel !== url
      ? `[${escapeMarkdownLinkLabel(cleanLabel)}](${url})`
      : url;
  }

  function cleanPdfLinkLabel(label, url = "") {
    const value = stripMarkdownImagesFromLinkLabel(label)
      .replace(/\s+/g, " ")
      .trim();
    const normalizedUrl = String(url || "").trim();

    if (!value) {
      return compactUrlLabel(normalizedUrl);
    }

    if (/^https?:\/\//i.test(value)) {
      return compactUrlLabel(value);
    }

    if (normalizedUrl && value.includes(normalizedUrl)) {
      const withoutUrl = value.replaceAll(normalizedUrl, " ").replace(/\s+/g, " ").trim();
      return withoutUrl || compactUrlLabel(normalizedUrl);
    }

    return value;
  }

  function stripMarkdownImagesFromLinkLabel(label) {
    return String(label || "")
      .replace(/!\\?\[[^\]\n]*\\?\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, " ")
      .replace(/\\?\[?image-\d+\\?]?/gi, " ");
  }

  function compactUrlLabel(url) {
    if (!url) {
      return "";
    }

    try {
      const parsed = new URL(url, location.href);
      const leaf = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "");
      return leaf || parsed.hostname || url;
    } catch {
      return url;
    }
  }

  function escapeMarkdownLinkLabel(text) {
    return String(text || "").replace(/[[\]\\]/g, "\\$&");
  }

  function escapeHtmlComment(text) {
    return String(text || "").replace(/--/g, "- -").replace(/[<>]/g, "");
  }

  function escapeRegExp(text) {
    return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function cssString(text) {
    return String(text || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function sanitizeFilename(name) {
    return String(name || "chatgpt-conversation")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/\s+/g, " ")
      .replace(/[. ]+$/g, "")
      .trim()
      || "chatgpt-conversation";
  }

  function sanitizeAltText(text) {
    return String(text || "image").replace(/\s+/g, " ").trim().slice(0, 120) || "image";
  }

  function sanitizeCssClass(text) {
    return String(text || "message").toLowerCase().replace(/[^a-z0-9_-]/g, "-") || "message";
  }

  function formatRole(role) {
    const normalized = String(role || "message").toLowerCase();
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  function hashString(text) {
    let hash = 2166136261;

    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0).toString(36);
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }
