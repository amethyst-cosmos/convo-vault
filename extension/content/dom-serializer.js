

  function filenameFromUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      return decodeURIComponent(parsed.pathname.split("/").pop() || "");
    } catch {
      return "";
    }
  }

  function sanitizeFileAttachmentName(name) {
    return String(name || "").replace(/\s+/g, " ").trim().slice(0, 160);
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

