  const DATE_TIME_VALUE_RE = /\b(?:\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2}|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})(?:[,\uFF0C]?\s*(?:at\s*)?\d{1,2}:\d{2}(?::\d{2})?(?:\s?(?:am|pm))?)?\b/i;
  const TIME_VALUE_RE = /\b\d{1,2}:\d{2}(?::\d{2})?(?:\s?(?:am|pm))?\b/i;
  const TIMESTAMP_CUE_RE = /\b(timestamp|sent|created|edited|updated|today|yesterday|date|time|am|pm)\b|\u65f6\u95f4|\u53d1\u9001|\u521b\u5efa|\u7f16\u8f91|\u66f4\u65b0/i;
  const LANGUAGE_ALIASES = new Map([
    ["js", "javascript"],
    ["mjs", "javascript"],
    ["cjs", "javascript"],
    ["ts", "typescript"],
    ["py", "python"],
    ["rb", "ruby"],
    ["rs", "rust"],
    ["sh", "bash"],
    ["zsh", "bash"],
    ["ps", "powershell"],
    ["ps1", "powershell"],
    ["md", "markdown"],
    ["yml", "yaml"]
  ]);
