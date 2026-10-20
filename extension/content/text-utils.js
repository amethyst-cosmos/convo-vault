
  function getElementText(element) {
    return (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
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

  function uniqueStrings(values) {
    return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
  }

  function escapeMarkdownLinkLabel(text) {
    return String(text || "").replace(/[[\]\\]/g, "\\$&");
  }

  function sanitizeFilename(name) {
    return String(name || "chatgpt-conversation")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/\s+/g, " ")
      .replace(/[. ]+$/g, "")
      .trim()
      || "chatgpt-conversation";
  }

