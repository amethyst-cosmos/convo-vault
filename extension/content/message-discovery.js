

  function normalizeTimestamp(value) {
    const timestamp = String(value || "").replace(/\s+/g, " ").trim();

    if (!timestamp || timestamp.length > 160) {
      return "";
    }

    return extractTimestampFromText(timestamp);
  }

  function extractTimestampFromText(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim();

    if (!text) {
      return "";
    }

    const dateTimeMatch = text.match(DATE_TIME_VALUE_RE);

    if (dateTimeMatch) {
      return dateTimeMatch[0].trim();
    }

    if (!TIMESTAMP_CUE_RE.test(text)) {
      return "";
    }

    const timeMatch = text.match(TIME_VALUE_RE);
    return timeMatch ? timeMatch[0].trim() : "";
  }

