  // Message-unit pages expose one unit per message; legacy pages expose one
  // turn container per message. Both are the "turn nodes" of Full capture.
  const TURN_NODE_SELECTOR = '[data-chatgpt-search-unit-key], [data-turn-id], [data-turn-container], [data-turn-id-container], [data-testid^="conversation-turn-"], [data-testid*="conversation-turn"]';
  const THINKING_CUE_RE = /\b(show\s+)?(reasoning|reasoned|thinking|thoughts?|thought|thought\s+for)\b|\u5df2\u601d\u8003|\u601d\u8003|\u63a8\u7406|\u60f3\u6cd5|\u601d\u7ef4\u94fe|\u601d\u8003\u8fc7\u7a0b/i;
  const THINKING_STATUS_RE = /\b(?:thought|thinking|reasoned)\s*(?:for)?\s*\d+(?:\.\d+)?\s*(?:s|sec|secs|seconds?)\b|\u5df2\u601d\u8003\s*\d+(?:\.\d+)?\s*(?:s|\u79d2)?|\u601d\u8003\s*\d+(?:\.\d+)?\s*(?:s|\u79d2)/i;
  const THINKING_FLYOUT_TITLE_RE = /^(?:\u601d\u8003|\u63a8\u7406|thinking|reasoning)$/i;
  const THINKING_FLYOUT_DONE_RE = /^(?:\u5b8c\u6210|done|completed)$/i;
  const THINKING_FLYOUT_ACTIVE_RE = /^(?:\u6b63\u5728\u641c\u7d22|\u641c\u7d22\u4e2d|searching\b|browsing\b|researching\b|loading\b|working\b)/i;
  const THINKING_FLYOUT_STOP_RE = /^(?:web search|deep research|references?)\b/i;
  const THINKING_FLYOUT_STEP_LABEL_RE = /^(?:\u8bb0\u5fc6|memory|memories|past chat|saved memory|\u6587\u4ef6|file|files?|\u7f51\u9875|web|web pages?)(?:\s*[\u00b7:]\s*\d+)?$/i;
  const THINKING_FLYOUT_CODE_TITLE_RE = /^(?:python|javascript|typescript|bash|shell|sql|json|html|css|markdown|code|terminal)$/i;
  const THINKING_FLYOUT_RESULT_RE = /^(?:true|false|none|stdout|stderr|output|result|encoding\b|sample\b|b[\u0027\"]|\d+\s+)/i;
  const THINKING_FLYOUT_SOURCES_RE = /^(?:\u6e90|\u6765\u6e90|sources?)\s*(?:[\u00b7:]\s*\d+)?$/i;
  const THINKING_SOURCE_TRIGGER_RE = /^(?:\u6e90|\u6765\u6e90|sources?)$/i;
  const EXPAND_CUE_RE = /\b(show\s+more|show\s+all|expand|expanded|continue|read\s+more|more|details?|view\s+more)\b|\u5c55\u5f00|\u663e\u793a\u66f4\u591a|\u67e5\u770b\u66f4\u591a|\u7ee7\u7eed|\u66f4\u591a/i;
  const EXPANDABLE_BUTTON_SELECTORS = [
    "button.group__menu-item",
    "button.hoverable",
    "button[data-fill]",
    "[role='button'].group__menu-item",
    "[role='button'].hoverable",
    "[role='button'][data-fill]",
    "button[aria-expanded]",
    "button[aria-controls]"
  ];
  const DATE_TIME_VALUE_RE = /\b(?:\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2}|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})(?:[,\uFF0C]?\s*(?:at\s*)?\d{1,2}:\d{2}(?::\d{2})?(?:\s?(?:am|pm))?)?\b/i;
  const TIME_VALUE_RE = /\b\d{1,2}:\d{2}(?::\d{2})?(?:\s?(?:am|pm))?\b/i;
  const TIMESTAMP_CUE_RE = /\b(timestamp|sent|created|edited|updated|today|yesterday|date|time|am|pm)\b|\u65f6\u95f4|\u53d1\u9001|\u521b\u5efa|\u7f16\u8f91|\u66f4\u65b0/i;
  const NON_MESSAGE_TEXT_RE = /chatgpt\s+(can|may|might)\s+make\s+mistakes|check\s+important\s+info|verify\s+important\s+information|chatgpt\s*\u4e5f?\u53ef\u80fd\u4f1a?\u72af\u9519|\u8bf7\u6838\u67e5\u91cd\u8981\u4fe1\u606f|\u8bf7\u6838\u5bf9\u91cd\u8981\u4fe1\u606f|\u6838\u67e5\u91cd\u8981\u4fe1\u606f/i;
  const NON_MESSAGE_ROLE_RE = /\b(alert|status|banner|complementary|navigation|contentinfo|dialog|tooltip|menu|menubar|search)\b/i;
  const ASSISTANT_SIGNAL_RE = /\b(assistant|bot-message|bot|model-response|model|response|answer|completion|markdown|prose)\b/i;
  const FILE_NAME_RE = /[^\\/:*?"<>|\n\r]{1,140}\.(?:pdf|docx?|xlsx?|pptx?|csv|tsv|txt|md|json|zip|rar|7z|mov|mp4|mp3|wav)/i;
  const FILE_ATTACHMENT_RE = /\b(file|attachment|download|uploaded|pdf|docx?|xlsx?|pptx?|csv|tsv|txt|md|json|zip|rar|7z|mov|mp4|mp3|wav|document)\b|\u6587\u4ef6|\u9644\u4ef6|\u4e0b\u8f7d|\u6587\u6863/i;
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
  const KNOWN_LANGUAGES = new Set([
    "bash",
    "c",
    "cpp",
    "csharp",
    "css",
    "diff",
    "go",
    "graphql",
    "html",
    "java",
    "javascript",
    "json",
    "jsx",
    "kotlin",
    "markdown",
    "php",
    "powershell",
    "python",
    "r",
    "ruby",
    "rust",
    "shell",
    "sql",
    "swift",
    "text",
    "tsx",
    "typescript",
    "xml",
    "yaml",
    "yml"
  ]);
