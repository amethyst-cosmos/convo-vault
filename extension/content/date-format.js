  function formatConversationTimestamp(value) {
    if (value == null || value === "") {
      return "";
    }

    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return normalizeTimestamp(value);
    }

    const milliseconds = numericValue > 1_000_000_000_000 ? numericValue : numericValue * 1000;
    const date = new Date(milliseconds);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return [
      padDatePart(date.getDate()),
      padDatePart(date.getMonth() + 1),
      date.getFullYear()
    ].join("/") + `, ${[
      padDatePart(date.getHours()),
      padDatePart(date.getMinutes()),
      padDatePart(date.getSeconds())
    ].join(":")}`;
  }

  function padDatePart(value) {
    return String(value).padStart(2, "0");
  }
