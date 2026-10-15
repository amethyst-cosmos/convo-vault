#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");
const { pathToFileURL } = require("url");
const { spawnSync } = require("child_process");

const MarkdownIt = require("markdown-it");
const hljs = require("highlight.js");
const { chromium } = require("playwright-core");
const { normalizeEmbeddedImageSource } = require("./assets.js");

const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), "output", "pdf");
const DEFAULT_HTML_DIR = path.resolve(process.cwd(), "tmp", "advanced-pdf");
const ASSET_DIR = path.resolve(__dirname, "assets");
const AVATAR_IMAGES = {
  user: loadPngDataUri("user.png"),
  assistant: loadPngDataUri("artificial-intelligence.png")
};
const DIL_RUNTIME = fs.readFileSync(path.join(__dirname, "dil-runtime.js"), "utf8");
// The page runs ChatGPT's compiled DIL code, so it may load only local files and
// inline resources; no request can leave the machine.
const PAGE_CONTENT_SECURITY_POLICY = "default-src 'none'; img-src file: data: blob:; font-src file: data:; style-src 'unsafe-inline'; script-src 'unsafe-inline' 'unsafe-eval'";
const CJK_STRONG_OPEN = "CVSTRONGOPENX";
const CJK_STRONG_CLOSE = "CVSTRONGCLOSEX";

main().catch((error) => {
  console.error(`[advanced-pdf] ${error.stack || error.message || error}`);
  process.exit(1);
});

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.input) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const inputPath = path.resolve(args.input);
  const payload = loadExportPayload(inputPath);
  const title = cleanText(payload.title || "ChatGPT Conversation");
  const safeBase = sanitizeFilename(args.name || title || "chatgpt-conversation");
  const outputPath = path.resolve(args.out || path.join(DEFAULT_OUTPUT_DIR, `${safeBase}.pdf`));
  const htmlPath = path.resolve(args.html || path.join(DEFAULT_HTML_DIR, `${safeBase}.html`));

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });

  const html = buildDocumentHtml(payload);
  fs.writeFileSync(htmlPath, html, "utf8");

  if (args.htmlOnly) {
    console.log(`[advanced-pdf] HTML written: ${htmlPath}`);
    return;
  }

  await renderPdfWithChrome({
    htmlPath,
    outputPath,
    chromePath: args.chrome || findChromeExecutable()
  });

  const outlineResult = addPdfOutlines(outputPath, buildPdfOutlineItems(payload.messages));
  const sizeMb = fs.statSync(outputPath).size / 1024 / 1024;
  console.log(`[advanced-pdf] PDF written: ${outputPath} (${sizeMb.toFixed(2)} MB)`);
  if (outlineResult.count) {
    console.log(`[advanced-pdf] PDF bookmarks: ${outlineResult.count}`);
  } else if (outlineResult.warning) {
    console.warn(`[advanced-pdf] PDF bookmarks skipped: ${outlineResult.warning}`);
  }
  console.log(`[advanced-pdf] HTML source: ${htmlPath}`);
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--out" || arg === "-o") {
      args.out = argv[++index];
    } else if (arg === "--html") {
      args.html = argv[++index];
    } else if (arg === "--html-only") {
      args.htmlOnly = true;
    } else if (arg === "--chrome") {
      args.chrome = argv[++index];
    } else if (arg === "--name") {
      args.name = argv[++index];
    } else if (!args.input) {
      args.input = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  node tools/advanced-pdf/render.js <export-debug-or-payload.json> [--out output.pdf] [--html output.html]

Options:
  --out, -o      PDF output path
  --html         Write the intermediate HTML to this path
  --html-only    Only generate HTML, do not print PDF
  --chrome       Explicit Chrome/Edge executable path
  --name         Output basename when --out/--html are omitted
`);
}

function loadExportPayload(inputPath) {
  const data = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const payload = data.exportPayload || data;
  const messages = Array.isArray(payload.messages)
    ? payload.messages
    : buildMessagesFromDiagnostics(data.messageDiagnostics || []);

  if (!messages.length) {
    throw new Error("No messages found. Export a fresh debug JSON with exporter 0.4.0 or later.");
  }

  return {
    schemaVersion: payload.schemaVersion || 0,
    exporterVersion: payload.exporterVersion || data.exporterVersion || "",
    title: payload.title || data.title || "ChatGPT Conversation",
    source: payload.source || data.pageUrl || "",
    exportedAt: payload.exportedAt || data.finishedAt || new Date().toISOString(),
    language: payload.language || payload.locale || payload.documentLanguage || data.language || data.locale || data.documentLanguage || "",
    messages
  };
}

function buildMessagesFromDiagnostics(diagnostics) {
  return diagnostics.map((message, index) => ({
    id: message.id || `diagnostic-${index + 1}`,
    role: message.role || "unknown",
    order: message.order ?? index,
    timestamp: message.timestamp || "",
    markdown: message.markdownPreview || "",
    thinkingMarkdown: message.thinkingPreview || "",
    preview: message.markdownPreview || "",
    codeBlockCount: message.codeBlockCount || 0,
    fileCount: message.fileCount || 0,
    imageCount: message.imageCount || 0
  }));
}

function buildDocumentHtml(payload) {
  const md = createMarkdownRenderer();
  const messages = payload.messages.map((message, index) => normalizeMessage(message, index));
  const exportedAt = formatDateTime(payload.exportedAt);
  const imageRegistry = buildImageRegistry(messages);
  const tocRows = buildTocRows(messages);
  const documentLanguage = normalizeDocumentLanguage(payload.language || payload.locale || payload.documentLanguage);

  return `<!doctype html>
<html lang="${escapeAttr(documentLanguage)}">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="${PAGE_CONTENT_SECURITY_POLICY}">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(payload.title)}</title>
  <style>${buildCss()}</style>
</head>
<body>
  ${renderIntroPages(payload, messages, exportedAt, tocRows)}

  <main class="conversation">
    ${messages.map((message, index) => renderMessage(md, message, index, imageRegistry)).join("\n")}
  </main>

  <script>${DIL_RUNTIME}</script>
  <script>${buildPaginationScript()}</script>
</body>
</html>`;
}

function normalizeDocumentLanguage(value) {
  const language = String(value || "").trim();

  if (/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(language)) {
    return language;
  }

  return "und";
}

// The prompt index is one multi-column flow; Chrome fills each page's two
// columns in order, so row height never has to be predicted.
function renderIntroPages(payload, messages, exportedAt, tocRows) {
  return `<section class="intro-sheet intro-sheet-first page-break-after">
      ${renderCoverCard(payload, messages, exportedAt)}
      ${renderTocCard(tocRows)}
    </section>`;
}

function renderCoverCard(payload, messages, exportedAt) {
  const prompts = messages.filter((message) => message.role === "user").length;
  return `<header class="cover-card">
    <div class="cover-eyebrow">ChatGPT conversation</div>
    <h1>${escapeHtml(payload.title)}</h1>
    <p class="cover-meta">${escapeHtml(exportedAt)}<span class="meta-dot">·</span>${prompts} prompts<span class="meta-dot">·</span>${messages.length} messages</p>
    ${payload.source ? `<p class="source"><a href="${escapeAttr(payload.source)}">${escapeHtml(payload.source)}</a></p>` : ""}
  </header>`;
}

function renderTocCard(rows) {
  return `<section class="toc">
    <h2>Prompts</h2>
    <div class="toc-grid">
      ${rows.map((row) => renderTocRow(row)).join("")}
    </div>
  </section>`;
}

function renderTocRow(row) {
  return `
        <a class="toc-row ${row.kind}" href="#${escapeAttr(row.id)}">
          <span class="toc-number">${escapeHtml(row.number)}</span>
          <span class="toc-label" dir="auto">${escapeHtml(row.label)}</span>
        </a>`;
}

function createMarkdownRenderer() {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: false,
    breaks: true,
    highlight(code, language) {
      const lang = normalizeLanguage(language);
      return lang && hljs.getLanguage(lang)
        ? hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
        : hljs.highlightAuto(code).value;
    }
  });

  installMathRules(md);

  const defaultFence = md.renderer.rules.fence || renderFenceFallback;
  const defaultLinkOpen = md.renderer.rules.link_open || renderToken;
  md.renderer.rules.fence = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const language = normalizeLanguage(String(token.info || "").trim().split(/\s+/)[0]);

    if (language === "mermaid") {
      return renderMermaidDiagram(token.content || "");
    }

    if (isChartLanguage(language)) {
      return renderChartBlock(token.content || "", language);
    }

    // ChatGPT writing blocks hold prose meant to be copied; ChatGPT shows them
    // as a formatted card, not as source code.
    if (language === "writing") {
      return `<section class="writing-block"><div class="writing-label">Writing</div><div class="writing-body">${md.render(token.content || "", env)}</div></section>`;
    }

    // Labelled blocks are assembled here so the label sits above a single
    // <pre>; returning the label from highlight() made markdown-it wrap the
    // whole fragment in a second <pre>.
    const highlighted = options.highlight(token.content || "", language);
    const label = shouldShowCodeLabel(language) ? `<div class="code-label">${escapeHtml(language)}</div>` : "";
    return `${label}<pre class="hljs"><code>${highlighted}</code></pre>\n`;
  };

  md.renderer.rules.link_open = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const hrefIndex = token.attrIndex("href");
    if (hrefIndex >= 0) {
      const href = token.attrs[hrefIndex][1];
      const label = tokens[index + 1]?.content || href;
      const objectLink = getObjectLinkDetails(label, href);
      token.attrSet("href", href);
      token.attrSet("target", "_blank");
      token.attrSet("rel", "noopener noreferrer");
      if (objectLink) {
        token.attrJoin("class", `object-link ${objectLink.className}`);
        token.attrSet("data-object-kind", objectLink.badge);
      }
    }
    return defaultLinkOpen(tokens, index, options, env, self);
  };

  md.renderer.rules.image = (tokens, index, options, env) => {
    const token = tokens[index];
    const source = token.attrGet("src") || "";
    const embeddedSrc = normalizeEmbeddedImageSource(source);
    const src = embeddedSrc || source;
    const alt = token.content || token.attrGet("alt") || "image";
    if (!isRenderableImageSource(src)) {
      return renderRemoteMediaCard(src, alt);
    }

    return `<figure class="inline-image"><img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}"><figcaption>${escapeHtml(alt)}</figcaption></figure>`;
  };

  return md;
}

function installMathRules(md) {
  md.block.ruler.before("fence", "math_block", (state, startLine, endLine, silent) => {
    const start = state.bMarks[startLine] + state.tShift[startLine];
    const end = state.eMarks[startLine];
    const firstLine = state.src.slice(start, end).trim();

    if (!firstLine.startsWith("$$")) {
      return false;
    }

    const firstContent = firstLine.slice(2);
    if (firstContent.endsWith("$$") && firstContent.length > 2) {
      if (!silent) {
        const token = state.push("math_block", "math", 0);
        token.content = firstContent.slice(0, -2).trim();
        state.line = startLine + 1;
      }
      return true;
    }

    const content = firstContent.trim() ? [firstContent] : [];
    let nextLine = startLine + 1;

    while (nextLine < endLine) {
      const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
      const lineEnd = state.eMarks[nextLine];
      const line = state.src.slice(lineStart, lineEnd);
      const trimmed = line.trim();

      if (trimmed.endsWith("$$")) {
        const beforeClose = line.slice(0, line.lastIndexOf("$$"));
        if (beforeClose.trim()) {
          content.push(beforeClose);
        }
        if (!silent) {
          const token = state.push("math_block", "math", 0);
          token.content = content.join("\n").trim();
          state.line = nextLine + 1;
        }
        return true;
      }

      content.push(line);
      nextLine += 1;
    }

    return false;
  });

  md.inline.ruler.before("escape", "math_inline", (state, silent) => {
    const marker = "\\(";

    if (state.src.slice(state.pos, state.pos + marker.length) !== marker) {
      return false;
    }

    const close = state.src.indexOf("\\)", state.pos + marker.length);
    if (close < 0) {
      return false;
    }

    if (!silent) {
      const token = state.push("math_inline", "math", 0);
      token.content = state.src.slice(state.pos + marker.length, close).trim();
    }

    state.pos = close + 2;
    return true;
  });

  md.renderer.rules.math_block = (tokens, index) => {
    const source = cleanMathSource(tokens[index].content);
    return `<figure class="math-card"><figcaption>Formula</figcaption><div class="math-display">${renderMathHtml(source, { display: true })}</div></figure>`;
  };

  md.renderer.rules.math_inline = (tokens, index) => {
    return `<span class="math-inline">${renderMathHtml(cleanMathSource(tokens[index].content), { display: false })}</span>`;
  };
}

function cleanMathSource(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

function renderMathHtml(source, options = {}) {
  const math = renderMathSegment(source, 0, String(source || "").length).html;
  return options.display
    ? math.replace(/(?:<br>){2,}/g, "<br>")
    : math.replace(/<br>/g, " ");
}

function renderMathSegment(source, start, end) {
  let html = "";
  let index = start;

  while (index < end) {
    const char = source[index];

    if (char === "\\") {
      const command = readMathCommand(source, index);
      if (command.name === "\\") {
        html += "<br>";
      } else if (command.name === "frac") {
        const numerator = readMathAtom(source, command.end);
        const denominator = readMathAtom(source, numerator.end);
        html += `<span class="math-frac"><span class="math-num">${numerator.html}</span><span class="math-den">${denominator.html}</span></span>`;
        index = denominator.end;
        continue;
      } else if (command.name === "sqrt") {
        const radicand = readMathAtom(source, command.end);
        html += `<span class="math-root"><span class="math-root-symbol">√</span><span class="math-root-body">${radicand.html}</span></span>`;
        index = radicand.end;
        continue;
      } else if (command.name === "left" || command.name === "right") {
        // Formatting hint only; the next visible delimiter is handled normally.
      } else {
        html += escapeHtml(mathCommandToText(command.name));
      }
      index = command.end;
      continue;
    }

    if (char === "^" || char === "_") {
      const atom = readMathAtom(source, index + 1);
      html += char === "^"
        ? `<sup class="math-sup">${atom.html}</sup>`
        : `<sub class="math-sub">${atom.html}</sub>`;
      index = atom.end;
      continue;
    }

    if (char === "{") {
      const group = readMathGroup(source, index);
      html += group.html;
      index = group.end;
      continue;
    }

    if (char === "}") {
      index += 1;
      continue;
    }

    if (char === "\n") {
      html += "<br>";
      index += 1;
      continue;
    }

    if (char === "&") {
      html += `<span class="math-align-space"></span>`;
      index += 1;
      continue;
    }

    html += escapeHtml(char);
    index += 1;
  }

  return { html, end: index };
}

function readMathAtom(source, start) {
  let index = skipMathWhitespace(source, start);

  if (source[index] === "{") {
    return readMathGroup(source, index);
  }

  if (source[index] === "\\") {
    const command = readMathCommand(source, index);
    if (command.name === "frac") {
      const numerator = readMathAtom(source, command.end);
      const denominator = readMathAtom(source, numerator.end);
      return {
        html: `<span class="math-frac"><span class="math-num">${numerator.html}</span><span class="math-den">${denominator.html}</span></span>`,
        end: denominator.end
      };
    }
    if (command.name === "sqrt") {
      const radicand = readMathAtom(source, command.end);
      return {
        html: `<span class="math-root"><span class="math-root-symbol">√</span><span class="math-root-body">${radicand.html}</span></span>`,
        end: radicand.end
      };
    }
    return {
      html: escapeHtml(mathCommandToText(command.name)),
      end: command.end
    };
  }

  if (index >= source.length) {
    return { html: "", end: index };
  }

  return {
    html: escapeHtml(source[index]),
    end: index + 1
  };
}

function readMathGroup(source, start) {
  let depth = 0;
  let index = start;

  while (index < source.length) {
    if (source[index] === "{") {
      depth += 1;
    } else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return {
          html: renderMathSegment(source, start + 1, index).html,
          end: index + 1
        };
      }
    }
    index += 1;
  }

  return {
    html: escapeHtml(source.slice(start)),
    end: source.length
  };
}

function readMathCommand(source, start) {
  if (source[start + 1] === "\\") {
    return { name: "\\", end: start + 2 };
  }

  const match = source.slice(start + 1).match(/^[A-Za-z]+|^./);
  const name = match?.[0] || "";
  return {
    name,
    end: start + 1 + name.length
  };
}

function skipMathWhitespace(source, start) {
  let index = start;
  while (/\s/.test(source[index] || "") && source[index] !== "\n") {
    index += 1;
  }
  return index;
}

function mathCommandToText(command) {
  const symbols = {
    alpha: "α",
    beta: "β",
    gamma: "γ",
    delta: "δ",
    Delta: "Δ",
    epsilon: "ε",
    theta: "θ",
    lambda: "λ",
    mu: "μ",
    pi: "π",
    sigma: "σ",
    Sigma: "Σ",
    omega: "ω",
    Omega: "Ω",
    sum: "∑",
    prod: "∏",
    int: "∫",
    infty: "∞",
    le: "≤",
    leq: "≤",
    ge: "≥",
    geq: "≥",
    neq: "≠",
    approx: "≈",
    times: "×",
    cdot: "·",
    pm: "±",
    to: "→",
    rightarrow: "→",
    leftarrow: "←",
    implies: "⇒",
    in: "∈",
    notin: "∉",
    subset: "⊂",
    subseteq: "⊆",
    cup: "∪",
    cap: "∩",
    text: ""
  };

  return Object.prototype.hasOwnProperty.call(symbols, command)
    ? symbols[command]
    : command;
}

function renderFenceFallback(tokens, index) {
  const token = tokens[index];
  const language = normalizeLanguage(String(token.info || "").trim().split(/\s+/)[0]);
  const label = shouldShowCodeLabel(language) ? `<div class="code-label">${escapeHtml(language)}</div>` : "";
  return `${label}<pre class="hljs"><code>${escapeHtml(token.content || "")}</code></pre>`;
}

function renderToken(tokens, index, options, env, self) {
  return self.renderToken(tokens, index, options);
}

function getObjectLinkDetails(label, href) {
  const text = String(label || "");
  const url = String(href || "");
  const fileName = extractObjectLinkFileName(text, url);

  if (/^\s*(Interactive|Dashboard|Canvas|App|Prototype|Site)\s*:/i.test(text)) {
    return { badge: "APP", className: "object-interactive-link" };
  }

  if (/^\s*(Source|Citation|Reference)\s*:/i.test(text)) {
    return { badge: "SRC", className: "object-source-link" };
  }

  if (!fileName) {
    return null;
  }

  const extension = fileName.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toUpperCase() || "FILE";
  if (["MP4", "MOV", "WEBM", "M4V"].includes(extension)) {
    return { badge: "VID", className: "object-media-link" };
  }
  if (["MP3", "WAV", "M4A", "AAC", "OGG"].includes(extension)) {
    return { badge: "AUD", className: "object-media-link" };
  }
  if (["XLSX", "XLS", "CSV", "TSV"].includes(extension)) {
    return { badge: extension.slice(0, 4), className: "object-file-link" };
  }
  if (["PPTX", "PPT"].includes(extension)) {
    return { badge: "PPT", className: "object-file-link" };
  }
  if (["PDF", "DOC", "DOCX", "TXT", "MD"].includes(extension)) {
    return { badge: extension.slice(0, 4), className: "object-file-link" };
  }

  return { badge: extension.slice(0, 4), className: "object-file-link" };
}

function extractObjectLinkFileName(label, href) {
  const combined = `${label || ""} ${href || ""}`;
  const match = combined.match(/[^\\/:*?"<>|\n\r]{1,140}\.(?:pdf|docx?|xlsx?|pptx?|csv|tsv|txt|md|json|zip|rar|7z|mov|mp4|webm|m4v|mp3|wav|m4a|aac|ogg)\b/i);
  return match?.[0] || "";
}

function isChartLanguage(language) {
  return ["chart", "chart-json", "vega-lite", "vegalite"].includes(String(language || "").toLowerCase());
}

function renderChartBlock(source, language = "chart") {
  const chart = parseChartSpec(source, language);

  if (!chart) {
    return `<figure class="chart-card chart-unsupported">
      <figcaption class="chart-title">Chart (source preserved)</figcaption>
      <div class="diagram-degraded-note">This chart could not be parsed, so the source text is preserved in the PDF.</div>
      <pre class="hljs chart-fallback"><code>${escapeHtml(source)}</code></pre>
    </figure>`;
  }

  return `<figure class="chart-card">
    <figcaption class="chart-title">${escapeHtml(chart.title || formatChartType(chart.type))}</figcaption>
    <div class="chart-stage">${renderChartSvg(chart)}</div>
  </figure>`;
}

function parseChartSpec(source, language = "chart") {
  const text = String(source || "").trim();

  if (!text) {
    return null;
  }

  const json = parseChartJson(text);
  if (json) {
    return normalizeChartSpec(json, language);
  }

  return parseDelimitedChart(text);
}

function parseChartJson(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function normalizeChartSpec(value, language = "chart") {
  const spec = Array.isArray(value) ? { data: value } : value;
  const type = normalizeChartType(spec.mark || spec.type || spec.chart || (language.includes("vega") ? "bar" : "bar"));
  const title = typeof spec.title === "string" ? spec.title : "";

  if (Array.isArray(spec.labels) && Array.isArray(spec.values)) {
    return {
      type,
      title,
      points: spec.labels.map((label, index) => ({
        label: cleanText(label, 40),
        value: Number(spec.values[index])
      })).filter((point) => Number.isFinite(point.value))
    };
  }

  const data = Array.isArray(spec.data?.values) ? spec.data.values : (Array.isArray(spec.data) ? spec.data : []);
  const encoding = spec.encoding || {};
  const xField = encoding.x?.field || spec.x || "label";
  const yField = encoding.y?.field || spec.y || "value";
  const points = data.map((row, index) => ({
    label: cleanText(row?.[xField] ?? row?.label ?? row?.name ?? `Item ${index + 1}`, 40),
    value: Number(row?.[yField] ?? row?.value ?? row?.count)
  })).filter((point) => Number.isFinite(point.value));

  return points.length ? { type, title, points } : null;
}

function parseDelimitedChart(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let type = "bar";

  if (/^(bar|line|area|scatter)\b/i.test(lines[0] || "")) {
    type = normalizeChartType(lines.shift());
  }

  if (lines[0] && /label\s*,\s*value/i.test(lines[0])) {
    lines.shift();
  }

  const points = lines.map((line, index) => {
    const [label, rawValue] = line.split(/,|\t/);
    return {
      label: cleanText(label || `Item ${index + 1}`, 40),
      value: Number(rawValue)
    };
  }).filter((point) => point.label && Number.isFinite(point.value));

  return points.length ? { type, title: formatChartType(type), points } : null;
}

function normalizeChartType(value) {
  const type = String(value || "bar").toLowerCase().replace(/[^a-z]/g, "");
  if (type.includes("line")) return "line";
  if (type.includes("area")) return "line";
  if (type.includes("scatter")) return "scatter";
  return "bar";
}

function formatChartType(type) {
  if (type === "line") return "Line chart";
  if (type === "scatter") return "Scatter chart";
  return "Bar chart";
}

function renderChartSvg(chart) {
  const width = 620;
  const height = 300;
  const margin = { top: 24, right: 22, bottom: 58, left: 52 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(1, ...chart.points.map((point) => point.value));
  const minValue = Math.min(0, ...chart.points.map((point) => point.value));
  const range = Math.max(1, maxValue - minValue);
  const scaleY = (value) => margin.top + plotHeight - ((value - minValue) / range) * plotHeight;
  const zeroY = scaleY(0);
  const axis = renderChartAxis({ width, height, margin, plotWidth, plotHeight, maxValue, minValue, zeroY });
  const labels = chart.points.map((point, index) => {
    const x = margin.left + (index + 0.5) * (plotWidth / chart.points.length);
    return `<text class="chart-label" x="${x}" y="${height - 22}" text-anchor="middle">${escapeSvgText(point.label)}</text>`;
  }).join("");

  const plot = chart.type === "bar"
    ? renderBarChartPlot(chart, { margin, plotWidth, scaleY, zeroY })
    : renderLineChartPlot(chart, { margin, plotWidth, scaleY });

  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttr(chart.title || formatChartType(chart.type))}" xmlns="http://www.w3.org/2000/svg">
    ${axis}
    ${plot}
    ${labels}
  </svg>`;
}

function renderChartAxis({ width, height, margin, plotWidth, plotHeight, maxValue, minValue, zeroY }) {
  const ticks = [minValue, (minValue + maxValue) / 2, maxValue]
    .map((value) => Number(value.toFixed(2)));
  const grid = ticks.map((tick) => {
    const y = margin.top + plotHeight - ((tick - minValue) / Math.max(1, maxValue - minValue)) * plotHeight;
    return `<g class="chart-grid">
      <line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>
      <text x="${margin.left - 8}" y="${y + 4}" text-anchor="end">${escapeSvgText(String(tick))}</text>
    </g>`;
  }).join("");

  return `${grid}
    <line class="chart-axis" x1="${margin.left}" y1="${zeroY}" x2="${width - margin.right}" y2="${zeroY}"></line>
    <line class="chart-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`;
}

function renderBarChartPlot(chart, context) {
  const { margin, plotWidth, scaleY, zeroY } = context;
  const slot = plotWidth / chart.points.length;
  const barWidth = Math.max(16, Math.min(54, slot * 0.58));

  return chart.points.map((point, index) => {
    const x = margin.left + index * slot + (slot - barWidth) / 2;
    const y = Math.min(scaleY(point.value), zeroY);
    const height = Math.max(1, Math.abs(zeroY - scaleY(point.value)));
    return `<g class="chart-bar-group">
      <rect class="chart-bar" x="${x}" y="${y}" width="${barWidth}" height="${height}" rx="4"></rect>
      <text class="chart-value" x="${x + barWidth / 2}" y="${y - 6}" text-anchor="middle">${escapeSvgText(String(point.value))}</text>
    </g>`;
  }).join("");
}

function renderLineChartPlot(chart, context) {
  const { margin, plotWidth, scaleY } = context;
  const step = chart.points.length > 1 ? plotWidth / (chart.points.length - 1) : plotWidth;
  const points = chart.points.map((point, index) => ({
    x: margin.left + index * step,
    y: scaleY(point.value),
    value: point.value
  }));
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const dots = points.map((point) => `<circle class="chart-dot" cx="${point.x}" cy="${point.y}" r="4"></circle>`).join("");
  const values = points.map((point) => `<text class="chart-value" x="${point.x}" y="${point.y - 8}" text-anchor="middle">${escapeSvgText(String(point.value))}</text>`).join("");

  return `<path class="chart-line" d="${path}"></path>${dots}${values}`;
}

function renderMermaidDiagram(source) {
  const diagramType = getMermaidDiagramType(source);

  if (diagramType === "sequencediagram") {
    const sequence = parseMermaidSequence(source);
    if (sequence) {
      return `<figure class="mermaid-card">${renderMermaidTitle("Mermaid Sequence")}<div class="mermaid-stage">${renderSequenceSvg(sequence)}</div></figure>`;
    }
  }

  if (diagramType === "erdiagram") {
    const erDiagram = parseMermaidErDiagram(source);
    if (erDiagram) {
      return `<figure class="mermaid-card">${renderMermaidTitle("Mermaid ER Diagram")}<div class="mermaid-stage">${renderErSvg(erDiagram)}</div></figure>`;
    }
  }

  if (diagramType === "statediagram" || diagramType === "statediagram-v2") {
    const stateDiagram = parseMermaidStateDiagram(source);
    if (stateDiagram) {
      return `<figure class="mermaid-card">${renderMermaidTitle("Mermaid State Diagram")}<div class="mermaid-stage">${renderStateSvg(stateDiagram)}</div></figure>`;
    }
  }

  const graph = parseMermaidFlowchart(source);

  if (!graph) {
    return renderUnsupportedMermaidDiagram(source, diagramType);
  }

  return `<figure class="mermaid-card">${renderMermaidTitle("Mermaid")}<div class="mermaid-stage">${renderFlowchartSvg(graph)}</div></figure>`;
}

function renderMermaidTitle(label = "Mermaid") {
  return `<figcaption class="mermaid-title">${escapeHtml(label)}</figcaption>`;
}

function renderUnsupportedMermaidDiagram(source, diagramType = "") {
  const label = diagramType ? `Mermaid ${diagramType} (source preserved)` : "Mermaid (source preserved)";
  return `<figure class="mermaid-card mermaid-unsupported">
    ${renderMermaidTitle(label)}
    <div class="diagram-degraded-note">This diagram type is preserved as source text in the PDF.</div>
    <pre class="hljs mermaid-fallback"><code>${escapeHtml(source)}</code></pre>
  </figure>`;
}

function getMermaidDiagramType(source) {
  const firstLine = String(source || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("%%")) || "";
  const match = firstLine.match(/^([A-Za-z][A-Za-z0-9_-]*)/);
  return String(match?.[1] || "").toLowerCase();
}

function parseMermaidFlowchart(source) {
  const lines = String(source || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("%%"));
  const header = lines.shift() || "";
  const headerMatch = header.match(/^(?:flowchart|graph)\s+(LR|RL|TB|TD|BT)\b/i);

  if (!headerMatch) {
    return null;
  }

  const graph = {
    direction: headerMatch[1].toUpperCase(),
    groups: [],
    nodes: new Map(),
    edges: []
  };
  let currentGroup = "";

  for (const rawLine of lines) {
    const line = rawLine.replace(/;$/g, "").trim();

    if (!line) {
      continue;
    }

    const subgraphMatch = line.match(/^subgraph\s+(.+)$/i);
    if (subgraphMatch) {
      currentGroup = cleanMermaidLabel(subgraphMatch[1]);
      ensureMermaidGroup(graph, currentGroup);
      continue;
    }

    if (/^end$/i.test(line)) {
      currentGroup = "";
      continue;
    }

    const edgeMatch = line.match(/^(.+?)\s*-{1,2}>\s*(?:\|([^|]+)\|\s*)?(.+)$/);
    if (edgeMatch) {
      const sourceNode = ensureMermaidNode(graph, edgeMatch[1], currentGroup);
      const targetNode = ensureMermaidNode(graph, edgeMatch[3], currentGroup);
      if (sourceNode && targetNode) {
        graph.edges.push({
          source: sourceNode.id,
          target: targetNode.id,
          label: cleanMermaidLabel(edgeMatch[2] || "")
        });
      }
      continue;
    }

    ensureMermaidNode(graph, line, currentGroup);
  }

  return graph.nodes.size ? graph : null;
}

function parseMermaidSequence(source) {
  const lines = String(source || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("%%"));

  if (!/^sequenceDiagram\b/i.test(lines.shift() || "")) {
    return null;
  }

  const participants = new Map();
  const events = [];

  for (const line of lines) {
    const participant = line.match(/^(?:participant|actor)\s+([A-Za-z][\w-]*)(?:\s+as\s+(.+))?$/i);
    if (participant) {
      ensureSequenceParticipant(participants, participant[1], participant[2] || participant[1]);
      continue;
    }

    const note = line.match(/^Note\s+(?:over|left of|right of)\s+([A-Za-z][\w-]*(?:\s*,\s*[A-Za-z][\w-]*)*)\s*:\s*(.+)$/i);
    if (note) {
      const ids = note[1].split(/\s*,\s*/).filter(Boolean);
      ids.forEach((id) => ensureSequenceParticipant(participants, id, id));
      events.push({
        kind: "note",
        participants: ids,
        text: cleanMermaidLabel(note[2])
      });
      continue;
    }

    const message = line.match(/^([A-Za-z][\w-]*)\s*(?:-{1,2}|={1,2})(?:>>|>|x)?\s*([A-Za-z][\w-]*)\s*:\s*(.+)$/);
    if (message) {
      ensureSequenceParticipant(participants, message[1], message[1]);
      ensureSequenceParticipant(participants, message[2], message[2]);
      events.push({
        kind: "message",
        from: message[1],
        to: message[2],
        text: cleanMermaidLabel(message[3])
      });
    }
  }

  return participants.size && events.length ? {
    participants: [...participants.values()],
    events
  } : null;
}

function ensureSequenceParticipant(participants, id, label) {
  if (!participants.has(id)) {
    participants.set(id, {
      id,
      label: cleanMermaidLabel(label || id)
    });
  }

  return participants.get(id);
}

function renderSequenceSvg(sequence) {
  const participantWidth = 150;
  const participantGap = 28;
  const top = 22;
  const headerHeight = 34;
  const eventGap = 48;
  const left = 12;
  const width = Math.max(430, sequence.participants.length * participantWidth + Math.max(0, sequence.participants.length - 1) * participantGap + left * 2);
  const height = top + headerHeight + 34 + sequence.events.length * eventGap + 24;
  const positions = new Map();

  sequence.participants.forEach((participant, index) => {
    const x = left + participantWidth / 2 + index * (participantWidth + participantGap);
    positions.set(participant.id, x);
  });

  const participantBoxes = sequence.participants.map((participant) => {
    const x = positions.get(participant.id);
    return `<g class="sequence-participant">
      <rect x="${x - participantWidth / 2}" y="${top}" width="${participantWidth}" height="${headerHeight}" rx="7"></rect>
      <text x="${x}" y="${top + 22}" text-anchor="middle">${escapeSvgText(participant.label)}</text>
      <line x1="${x}" y1="${top + headerHeight}" x2="${x}" y2="${height - 18}"></line>
    </g>`;
  }).join("");

  const events = sequence.events.map((event, index) => {
    const y = top + headerHeight + 34 + index * eventGap;

    if (event.kind === "note") {
      const xs = event.participants.map((id) => positions.get(id)).filter((value) => Number.isFinite(value));
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const boxX = Math.max(left, minX - 58);
      const boxWidth = Math.min(width - boxX - left, Math.max(130, maxX - minX + 116));
      return `<g class="sequence-note">
        <rect x="${boxX}" y="${y - 16}" width="${boxWidth}" height="30" rx="6"></rect>
        <text x="${boxX + boxWidth / 2}" y="${y + 4}" text-anchor="middle">${escapeSvgText(event.text)}</text>
      </g>`;
    }

    const fromX = positions.get(event.from);
    const toX = positions.get(event.to);
    if (!Number.isFinite(fromX) || !Number.isFinite(toX)) {
      return "";
    }

    const direction = fromX <= toX ? 1 : -1;
    const labelX = (fromX + toX) / 2;
    return `<g class="sequence-message">
      <line x1="${fromX}" y1="${y}" x2="${toX - direction * 8}" y2="${y}" marker-end="url(#sequence-arrow)"></line>
      <text x="${labelX}" y="${y - 7}" text-anchor="middle">${escapeSvgText(event.text)}</text>
    </g>`;
  }).join("");

  return `<svg class="sequence-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Mermaid sequence diagram" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <marker id="sequence-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
        <path d="M 0 0 L 8 4 L 0 8 z" fill="#64748b"></path>
      </marker>
    </defs>
    ${participantBoxes}
    ${events}
  </svg>`;
}

function parseMermaidErDiagram(source) {
  const lines = String(source || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("%%"));

  if (!/^erDiagram\b/i.test(lines.shift() || "")) {
    return null;
  }

  const entities = new Map();
  const relationships = [];
  let currentEntity = "";

  for (const line of lines) {
    const entityStart = line.match(/^([A-Za-z][\w-]*)\s*\{$/);
    if (entityStart) {
      currentEntity = entityStart[1];
      ensureErEntity(entities, currentEntity);
      continue;
    }

    if (line === "}") {
      currentEntity = "";
      continue;
    }

    if (currentEntity) {
      const entity = ensureErEntity(entities, currentEntity);
      entity.attributes.push(cleanMermaidLabel(line));
      continue;
    }

    const relationship = line.match(/^([A-Za-z][\w-]*)\s+([|o}{]+)--([|o}{]+)\s+([A-Za-z][\w-]*)\s*:?\s*(.*)$/);
    if (relationship) {
      const from = ensureErEntity(entities, relationship[1]);
      const to = ensureErEntity(entities, relationship[4]);
      relationships.push({
        from: from.id,
        to: to.id,
        leftCardinality: relationship[2],
        rightCardinality: relationship[3],
        label: cleanMermaidLabel(relationship[5] || "")
      });
    }
  }

  return entities.size ? {
    entities: [...entities.values()],
    relationships
  } : null;
}

function ensureErEntity(entities, id) {
  if (!entities.has(id)) {
    entities.set(id, {
      id,
      label: cleanMermaidLabel(id.replace(/_/g, " ")),
      attributes: []
    });
  }

  return entities.get(id);
}

function renderErSvg(diagram) {
  const columnWidth = 180;
  const rowHeight = 102;
  const gapX = 48;
  const gapY = 22;
  const cols = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(diagram.entities.length))));
  const rows = Math.ceil(diagram.entities.length / cols);
  const width = cols * columnWidth + Math.max(0, cols - 1) * gapX + 24;
  const height = rows * rowHeight + Math.max(0, rows - 1) * gapY + 24;
  const positions = new Map();

  diagram.entities.forEach((entity, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = 12 + col * (columnWidth + gapX);
    const y = 12 + row * (rowHeight + gapY);
    positions.set(entity.id, {
      x,
      y,
      width: columnWidth,
      height: rowHeight
    });
  });

  const relationships = diagram.relationships.map((relationship) => {
    const from = positions.get(relationship.from);
    const to = positions.get(relationship.to);
    if (!from || !to) return "";

    const fromX = from.x + from.width / 2;
    const fromY = from.y + from.height / 2;
    const toX = to.x + to.width / 2;
    const toY = to.y + to.height / 2;
    const labelX = (fromX + toX) / 2;
    const labelY = (fromY + toY) / 2 - 5;
    const label = [
      relationship.leftCardinality,
      relationship.label,
      relationship.rightCardinality
    ].filter(Boolean).join(" ");

    return `<g class="er-relationship">
      <path d="M ${fromX} ${fromY} C ${labelX} ${fromY}, ${labelX} ${toY}, ${toX} ${toY}"></path>
      ${label ? `<text x="${labelX}" y="${labelY}" text-anchor="middle">${escapeSvgText(label)}</text>` : ""}
    </g>`;
  }).join("");

  const entities = diagram.entities.map((entity) => {
    const box = positions.get(entity.id);
    const attributes = entity.attributes.slice(0, 4).map((attribute, index) => (
      `<text class="er-attribute" x="${box.x + 12}" y="${box.y + 48 + index * 13}">${escapeSvgText(attribute)}</text>`
    )).join("");
    return `<g class="er-entity">
      <rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="7"></rect>
      <line x1="${box.x}" y1="${box.y + 33}" x2="${box.x + box.width}" y2="${box.y + 33}"></line>
      <text class="er-title" x="${box.x + box.width / 2}" y="${box.y + 22}" text-anchor="middle">${escapeSvgText(entity.label)}</text>
      ${attributes}
    </g>`;
  }).join("");

  return `<svg class="er-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Mermaid ER diagram" xmlns="http://www.w3.org/2000/svg">
    ${relationships}
    ${entities}
  </svg>`;
}

function parseMermaidStateDiagram(source) {
  const lines = String(source || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("%%"));
  const header = lines.shift() || "";

  if (!/^stateDiagram(?:-v2)?\b/i.test(header)) {
    return null;
  }

  const states = new Map();
  const transitions = [];

  for (const line of lines) {
    const alias = line.match(/^state\s+"([^"]+)"\s+as\s+([A-Za-z][\w-]*)$/i);
    if (alias) {
      ensureStateNode(states, alias[2], alias[1]);
      continue;
    }

    const transition = line.match(/^(\[\*\]|[A-Za-z][\w-]*)\s*-->\s*(\[\*\]|[A-Za-z][\w-]*)(?:\s*:\s*(.+))?$/);
    if (transition) {
      const from = ensureStateNode(
        states,
        transition[1] === "[*]" ? "__start" : transition[1],
        transition[1],
        transition[1] === "[*]" ? "start" : ""
      );
      const to = ensureStateNode(
        states,
        transition[2] === "[*]" ? "__end" : transition[2],
        transition[2],
        transition[2] === "[*]" ? "end" : ""
      );
      transitions.push({
        from: from.id,
        to: to.id,
        label: cleanMermaidLabel(transition[3] || "")
      });
      continue;
    }

    const plain = line.match(/^state\s+([A-Za-z][\w-]*)$/i) || line.match(/^([A-Za-z][\w-]*)$/);
    if (plain) {
      ensureStateNode(states, plain[1], plain[1]);
    }
  }

  return states.size ? {
    states: [...states.values()],
    transitions
  } : null;
}

function ensureStateNode(states, id, label, terminalKind = "") {
  const normalized = id === "[*]" ? "state-terminal" : id;
  if (!states.has(normalized)) {
    states.set(normalized, {
      id: normalized,
      rawId: id,
      label: label === "[*]" ? "" : cleanMermaidLabel(label || id),
      terminal: label === "[*]" || Boolean(terminalKind),
      terminalKind
    });
  }

  return states.get(normalized);
}

function renderStateSvg(diagram) {
  const nodeWidth = 132;
  const nodeHeight = 48;
  const gapX = 54;
  const gapY = 38;
  const cols = diagram.states.length <= 5
    ? diagram.states.length
    : Math.min(3, Math.max(1, Math.ceil(Math.sqrt(diagram.states.length))));
  const rows = Math.ceil(diagram.states.length / cols);
  const width = cols * nodeWidth + Math.max(0, cols - 1) * gapX + 32;
  const height = rows * nodeHeight + Math.max(0, rows - 1) * gapY + 32;
  const positions = new Map();

  diagram.states.forEach((state, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    positions.set(state.id, {
      x: 16 + col * (nodeWidth + gapX),
      y: 16 + row * (nodeHeight + gapY),
      width: nodeWidth,
      height: nodeHeight
    });
  });

  const transitions = diagram.transitions.map((transition) => {
    const from = positions.get(transition.from);
    const to = positions.get(transition.to);
    if (!from || !to) return "";

    const fromCenterX = from.x + from.width / 2;
    const toCenterX = to.x + to.width / 2;
    const leftToRight = toCenterX >= fromCenterX;
    const fromX = leftToRight ? from.x + from.width : from.x;
    const fromY = from.y + from.height / 2;
    const toX = leftToRight ? to.x : to.x + to.width;
    const toY = to.y + to.height / 2;
    const sameColumn = Math.abs(from.x - to.x) < 4;
    const sx = sameColumn ? from.x + from.width / 2 : fromX;
    const sy = sameColumn ? from.y + from.height : fromY;
    const tx = sameColumn ? to.x + to.width / 2 : toX;
    const ty = sameColumn ? to.y : toY;
    const curve = sameColumn ? 28 : Math.max(28, Math.abs(tx - sx) / 2);
    const path = sameColumn
      ? `M ${sx} ${sy} C ${sx} ${sy + curve}, ${tx} ${ty - curve}, ${tx} ${ty}`
      : `M ${sx} ${sy} C ${sx + curve} ${sy}, ${tx - curve} ${ty}, ${tx} ${ty}`;
    const labelX = (sx + tx) / 2;
    const labelY = (sy + ty) / 2 - 7;

    return `<g class="state-transition">
      <path d="${path}" marker-end="url(#state-arrow)"></path>
      ${transition.label ? `<text x="${labelX}" y="${labelY}" text-anchor="middle">${escapeSvgText(transition.label)}</text>` : ""}
    </g>`;
  }).join("");

  const states = diagram.states.map((state) => {
    const box = positions.get(state.id);
    if (state.terminal) {
      return `<g class="state-node state-terminal">
        <circle cx="${box.x + box.width / 2}" cy="${box.y + box.height / 2}" r="12"></circle>
      </g>`;
    }
    return `<g class="state-node">
      <rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="20"></rect>
      <text x="${box.x + box.width / 2}" y="${box.y + 30}" text-anchor="middle">${escapeSvgText(state.label)}</text>
    </g>`;
  }).join("");

  return `<svg class="state-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Mermaid state diagram" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <marker id="state-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
        <path d="M 0 0 L 8 4 L 0 8 z" fill="#64748b"></path>
      </marker>
    </defs>
    ${transitions}
    ${states}
  </svg>`;
}

function ensureMermaidGroup(graph, name) {
  const groupName = name || "Diagram";
  let group = graph.groups.find((item) => item.name === groupName);

  if (!group) {
    group = {
      name: groupName,
      nodes: []
    };
    graph.groups.push(group);
  }

  return group;
}

function ensureMermaidNode(graph, token, groupName = "") {
  const parsed = parseMermaidNodeToken(token);

  if (!parsed?.id) {
    return null;
  }

  let node = graph.nodes.get(parsed.id);

  if (!node) {
    node = {
      ...parsed,
      group: groupName || "Diagram"
    };
    graph.nodes.set(node.id, node);
  } else if (parsed.label && parsed.label !== parsed.id) {
    node.label = parsed.label;
    node.shape = parsed.shape || node.shape;
  }

  if (groupName && node.group === "Diagram") {
    node.group = groupName;
  }

  const group = ensureMermaidGroup(graph, node.group);
  if (!group.nodes.includes(node.id)) {
    group.nodes.push(node.id);
  }

  return node;
}

function parseMermaidNodeToken(token) {
  const value = String(token || "").trim().replace(/;$/g, "");
  const idMatch = value.match(/^([A-Za-z][\w-]*)/);

  if (!idMatch) {
    return null;
  }

  const id = idMatch[1];
  const rest = value.slice(id.length).trim();
  let label = id;
  let shape = "rect";
  let labelMatch = rest.match(/^\[\(([\s\S]+)\)\]$/);

  if (labelMatch) {
    label = labelMatch[1];
    shape = "database";
  } else {
    labelMatch = rest.match(/^\[([\s\S]+)\]$/);
    if (labelMatch) {
      label = labelMatch[1];
    } else {
      labelMatch = rest.match(/^\(\(([\s\S]+)\)\)$/);
      if (labelMatch) {
        label = labelMatch[1];
        shape = "circle";
      } else {
        labelMatch = rest.match(/^\(([\s\S]+)\)$/);
        if (labelMatch) {
          label = labelMatch[1];
          shape = "round";
        }
      }
    }
  }

  return {
    id,
    label: cleanMermaidLabel(label),
    shape
  };
}

function renderFlowchartSvg(graph) {
  const layout = layoutMermaidFlowchart(graph);
  const arrows = graph.edges.map((edge, index) => renderMermaidEdge(edge, layout, index)).join("");
  const groups = layout.groups.map(renderMermaidGroup).join("");
  const nodes = layout.nodes.map(renderMermaidNode).join("");

  return `<svg class="mermaid-svg" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="Mermaid flowchart" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <marker id="${layout.markerId}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
        <path d="M 0 0 L 8 4 L 0 8 z" fill="#64748b"></path>
      </marker>
    </defs>
    ${groups}
    <g class="mermaid-edges">${arrows}</g>
    <g class="mermaid-nodes">${nodes}</g>
  </svg>`;
}

function layoutMermaidFlowchart(graph) {
  const horizontal = !["TB", "TD", "BT"].includes(graph.direction);
  const groupWidth = 158;
  const groupGap = 50;
  const nodeWidth = 122;
  const nodeHeight = 46;
  const nodeGap = 14;
  const groupPaddingX = 18;
  const groupHeader = 24;
  const bottomPadding = 16;
  const groupHeights = graph.groups.map((group) => {
    const nodeCount = Math.max(1, group.nodes.length);
    return groupHeader + bottomPadding + nodeCount * nodeHeight + (nodeCount - 1) * nodeGap;
  });
  const groupHeight = Math.max(104, ...groupHeights);
  const layout = {
    width: horizontal
      ? graph.groups.length * groupWidth + Math.max(0, graph.groups.length - 1) * groupGap
      : groupWidth,
    height: horizontal
      ? groupHeight
      : graph.groups.length * groupHeight + Math.max(0, graph.groups.length - 1) * groupGap,
    markerId: `arrow-${graph.direction.toLowerCase()}-${graph.groups.length}-${graph.nodes.size}`,
    groups: [],
    nodes: []
  };
  const positions = new Map();

  graph.groups.forEach((group, groupIndex) => {
    const groupX = horizontal ? groupIndex * (groupWidth + groupGap) : 0;
    const groupY = horizontal ? 0 : groupIndex * (groupHeight + groupGap);
    layout.groups.push({
      name: group.name,
      x: groupX,
      y: groupY,
      width: groupWidth,
      height: groupHeight
    });

    const totalNodeHeight = group.nodes.length * nodeHeight + Math.max(0, group.nodes.length - 1) * nodeGap;
    const startY = groupY + groupHeader + Math.max(0, (groupHeight - groupHeader - bottomPadding - totalNodeHeight) / 2);

    group.nodes.forEach((nodeId, nodeIndex) => {
      const node = graph.nodes.get(nodeId);
      const positioned = {
        ...node,
        x: groupX + groupPaddingX,
        y: startY + nodeIndex * (nodeHeight + nodeGap),
        width: nodeWidth,
        height: nodeHeight
      };
      positions.set(nodeId, positioned);
      layout.nodes.push(positioned);
    });
  });

  layout.positions = positions;
  return layout;
}

function renderMermaidGroup(group) {
  return `<g class="mermaid-group">
    <rect x="${group.x + 0.5}" y="${group.y + 0.5}" width="${group.width - 1}" height="${group.height - 1}" rx="4"></rect>
    <text x="${group.x + group.width / 2}" y="${group.y + 15}" text-anchor="middle">${escapeSvgText(group.name)}</text>
  </g>`;
}

function renderMermaidNode(node) {
  const lines = wrapMermaidLabel(node.label);
  const textY = node.y + node.height / 2 - ((lines.length - 1) * 7);
  const rect = node.shape === "circle"
    ? `<ellipse cx="${node.x + node.width / 2}" cy="${node.y + node.height / 2}" rx="${node.width / 2}" ry="${node.height / 2}"></ellipse>`
    : `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="${node.shape === "database" ? 18 : 4}"></rect>`;
  const text = lines.map((line, index) => (
    `<tspan x="${node.x + node.width / 2}" dy="${index === 0 ? 0 : 14}">${escapeSvgText(line)}</tspan>`
  )).join("");

  return `<g class="mermaid-node">${rect}<text x="${node.x + node.width / 2}" y="${textY}" text-anchor="middle">${text}</text></g>`;
}

function renderMermaidEdge(edge, layout, index) {
  const source = layout.positions.get(edge.source);
  const target = layout.positions.get(edge.target);

  if (!source || !target) {
    return "";
  }

  const sameColumn = Math.abs(source.x - target.x) < 4;
  const sx = sameColumn ? source.x + source.width / 2 : source.x + source.width;
  const sy = sameColumn ? source.y + source.height : source.y + source.height / 2;
  const tx = sameColumn ? target.x + target.width / 2 : target.x;
  const ty = sameColumn ? target.y : target.y + target.height / 2;
  const curve = sameColumn ? Math.max(18, Math.abs(ty - sy) / 2) : Math.max(30, Math.abs(tx - sx) / 2);
  const path = sameColumn
    ? `M ${sx} ${sy} C ${sx} ${sy + curve}, ${tx} ${ty - curve}, ${tx} ${ty}`
    : `M ${sx} ${sy} C ${sx + curve} ${sy}, ${tx - curve} ${ty}, ${tx} ${ty}`;
  const labelX = sameColumn ? sx + source.width / 2 + 8 : (sx + tx) / 2;
  const labelY = sameColumn ? (sy + ty) / 2 : (sy + ty) / 2 - 6 - (index % 2) * 6;
  const label = edge.label
    ? `<text class="mermaid-edge-label" x="${labelX}" y="${labelY}" text-anchor="middle">${escapeSvgText(edge.label)}</text>`
    : "";

  return `<g class="mermaid-edge"><path d="${path}" marker-end="url(#${layout.markerId})"></path>${label}</g>`;
}

function wrapMermaidLabel(label) {
  const lines = String(label || "")
    .replace(/\\n/g, "\n")
    .split("\n")
    .flatMap((line) => wrapMermaidTextLine(line.trim(), 17))
    .filter(Boolean);
  return lines.length ? lines.slice(0, 4) : [""];
}

function wrapMermaidTextLine(line, maxChars) {
  if (line.length <= maxChars) {
    return [line];
  }

  const chunks = [];
  let cursor = 0;
  while (cursor < line.length) {
    chunks.push(line.slice(cursor, cursor + maxChars));
    cursor += maxChars;
  }
  return chunks;
}

function cleanMermaidLabel(label) {
  return String(label || "")
    .replace(/^["']|["']$/g, "")
    .replace(/\\n/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function escapeSvgText(value) {
  return escapeHtml(value).replace(/\n/g, " ");
}

function renderMessage(md, message, index, imageRegistry) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const anchorId = getMessageAnchorId(message, index);
  const time = message.timestamp ? `<time>${escapeHtml(message.timestamp)}</time>` : "";
  const turnHeading = renderTurnHeading(message, index);
  const messageMarkdown = isUser ? stripAttachmentOnlyLines(message.markdown) : message.markdown;
  const content = messageMarkdown.trim() ? renderMessageMarkdown(md, messageMarkdown, imageRegistry, anchorId) : "";
  const thinking = isAssistant && message.thinkingMarkdown
    ? renderThinking(md, message.thinkingMarkdown, imageRegistry)
    : "";

  if (isUser) {
    return `<article id="${escapeAttr(anchorId)}" class="message user-message" data-turn-number="${escapeAttr(message.turnNumber)}">
      <div class="user-stack">
        ${turnHeading}
        ${renderAttachmentLead(message.markdown, imageRegistry)}
        ${content ? `<div class="bubble user-bubble">${content}</div>` : ""}
        ${renderMessageMeta(message, index, time)}
      </div>
    </article>`;
  }

  return `<article id="${escapeAttr(anchorId)}" class="message assistant-message" data-turn-number="${escapeAttr(message.turnNumber)}">
    <div class="assistant-intro">
      ${turnHeading}
      ${renderMessageMeta(message, index, time)}
      ${thinking}
    </div>
    <div class="assistant-content">${renderAssistantBody(message, content)}</div>
  </article>`;
}

// DIL answers are drawn from ChatGPT's compiled UI program by dil-runtime.js;
// the Markdown rendering stays in the page and shows if the program fails.
function renderAssistantBody(message, content) {
  const blocks = Array.isArray(message.dil) ? message.dil.filter((block) => block && typeof block.code === "string") : [];

  if (!blocks.length) {
    return content;
  }

  const roots = blocks.map((block) => `<div class="dil-root"></div><script type="application/json">${serializeScriptJson(block)}</script>`).join("");
  return `<div class="dil-message">${roots}<div class="dil-fallback">${content}</div></div>`;
}

function serializeScriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

// One muted line per message: avatar, speaker, turn number, and time. The
// turn heading above stays in the DOM (visually hidden) for PDF accessibility.
function renderMessageMeta(message, index, time) {
  const isUser = message.role === "user";
  const speaker = isUser ? "" : `<span class="meta-speaker">${escapeHtml(formatRole(message.role))}</span>`;
  const number = `<span class="meta-turn">#${escapeHtml(String(formatTurnNumber(message, index)).replace(/^Turn\s+/, ""))}</span>`;
  const details = [speaker, number, time].filter(Boolean).join('<span class="meta-dot">·</span>');
  return isUser
    ? `<div class="message-meta user-meta"><span class="meta-text">${details}</span>${renderUserAvatar()}</div>`
    : `<div class="message-meta assistant-meta">${renderAssistantAvatar()}<span class="meta-text">${details}</span></div>`;
}

function renderTurnHeading(message, index) {
  return `<h2 class="turn-heading ${message.role === "user" ? "user-turn-heading" : "assistant-turn-heading"}">${escapeHtml(formatTurnHeading(message, index))}</h2>`;
}

function renderUserAvatar() {
  return `<div class="avatar user-avatar" aria-label="User">
    ${renderAvatarImage(AVATAR_IMAGES.user, "User")}
  </div>`;
}

function renderAssistantAvatar() {
  return `<div class="assistant-avatar" aria-label="Assistant">
    ${renderAvatarImage(AVATAR_IMAGES.assistant, "ChatGPT")}
  </div>`;
}

function renderAvatarImage(src, alt) {
  return src
    ? `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}">`
    : `<span class="avatar-fallback">${escapeHtml(alt.slice(0, 2))}</span>`;
}

function renderThinking(md, thinkingMarkdown, imageRegistry) {
  return `<section class="thinking">
    <h3>Thinking</h3>
    <div class="thinking-body markdown-body" dir="auto">${md.render(cleanMarkdownForHtml(thinkingMarkdown), { imageRegistry })}</div>
  </section>`;
}

function renderMessageMarkdown(md, markdown, imageRegistry, anchorPrefix = "message") {
  const cleaned = cleanMarkdownForHtml(markdown || "_No text content found._");
  const { body, footnotes } = extractMarkdownFootnotes(cleaned);
  // Definitions with the same text (one page cited several times) share a number.
  const sources = [];
  const numbers = new Map();
  for (const footnote of footnotes) {
    let number = sources.indexOf(footnote.text) + 1;
    if (!number) {
      sources.push(footnote.text);
      number = sources.length;
    }
    numbers.set(footnote.id, number);
  }
  const placeholder = (id) => `CVFOOTNOTEREF${hashFootnoteId(id)}X`;
  // Adjacent references that resolve to the same source collapse to one.
  const withPlaceholders = body.replace(/(?:\[\^[^\]\s]+\])+/g, (run) => {
    const seen = new Set();
    return [...run.matchAll(/\[\^([^\]\s]+)\]/g)].map(([match, id]) => {
      if (!numbers.has(id)) {
        return match;
      }
      if (seen.has(numbers.get(id))) {
        return "";
      }
      seen.add(numbers.get(id));
      return placeholder(id);
    }).join("");
  });
  let html = md.render(protectCjkStrongRuns(withPlaceholders), { imageRegistry });

  for (const [id, number] of numbers) {
    html = html.split(placeholder(id)).join(
      `<sup class="footnote-ref"><a href="#${escapeAttr(`${anchorPrefix}-fn-${number}`)}">${number}</a></sup>`
    );
  }

  html = html
    .replace(/<\/sup>(\s*)<sup class="footnote-ref">/g, '</sup><sup class="footnote-sep">,</sup><sup class="footnote-ref">')
    .split(CJK_STRONG_OPEN).join("<strong>")
    .split(CJK_STRONG_CLOSE).join("</strong>");

  const list = sources.length
    ? `<section class="footnotes"><ol>${sources.map((text, index) => `<li id="${escapeAttr(`${anchorPrefix}-fn-${index + 1}`)}">${md.renderInline(text, { imageRegistry })}</li>`).join("")}</ol></section>`
    : "";
  return `<div class="markdown-body" dir="auto">${html}${list}</div>`;
}

/**
 * CommonMark rejects **bold** whose delimiter touches punctuation on the
 * inside and a letter on the outside, which is common in Chinese text
 * ("把**状态（Paid）**的"). ChatGPT renders those runs as bold, so they are
 * swapped for placeholders that become <strong> after rendering. Runs that
 * CommonMark accepts, code spans, and fenced code are left unchanged.
 */
function protectCjkStrongRuns(markdown) {
  let fence = "";

  return String(markdown || "").split("\n").map((line) => {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);

    if (fenceMatch) {
      fence = fence ? (line.trim().startsWith(fence) ? "" : fence) : fenceMatch[1];
      return line;
    }

    if (fence || !line.includes("**")) {
      return line;
    }

    return line.split(/(`+[^`]*`+)/).map((segment, index) => (index % 2 === 1
      ? segment
      : segment.replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, (match, content, offset, text) => {
        const before = text[offset - 1] || " ";
        const after = text[offset + match.length] || " ";
        const openOk = !isPunctuationChar(content[0]) || /\s/.test(before) || isPunctuationChar(before);
        const closeOk = !isPunctuationChar(content[content.length - 1]) || /\s/.test(after) || isPunctuationChar(after);
        return openOk && closeOk ? match : `${CJK_STRONG_OPEN}${content}${CJK_STRONG_CLOSE}`;
      }))).join("");
  }).join("\n");
}

function isPunctuationChar(char) {
  return /[\p{P}\p{S}]/u.test(String(char || ""));
}

/**
 * Splits Markdown footnote definitions ([^id]: text) from the body. Lines in
 * fenced code blocks are left untouched.
 */
function extractMarkdownFootnotes(markdown) {
  const footnotes = [];
  const seen = new Set();
  const lines = [];
  let fence = "";

  for (const line of String(markdown || "").split("\n")) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);

    if (fenceMatch) {
      fence = fence ? (line.trim().startsWith(fence) ? "" : fence) : fenceMatch[1];
      lines.push(line);
      continue;
    }

    const definition = !fence && line.match(/^\[\^([^\]\s]+)\]:\s*(.*)$/);

    if (definition) {
      if (!seen.has(definition[1])) {
        seen.add(definition[1]);
        footnotes.push({ id: definition[1], text: definition[2] });
      }
      continue;
    }

    lines.push(line);
  }

  return { body: lines.join("\n").trim(), footnotes };
}

function hashFootnoteId(id) {
  return Array.from(String(id)).map((char) => char.codePointAt(0).toString(36)).join("");
}

function buildPaginationScript() {
  return `
(() => {
  const CONTENT_HEIGHT = 1011;
  // Room kept below a prompt so its answer starts on the same page.
  const ANSWER_LEAD_HEIGHT = 140;
  // A new exchange never starts in the last quarter of a page.
  const MIN_EXCHANGE_START_SPACE = CONTENT_HEIGHT * 0.25;

  function outerHeight(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const marginTop = Number.parseFloat(style.marginTop) || 0;
    const marginBottom = Number.parseFloat(style.marginBottom) || 0;
    return rect.height + marginTop + marginBottom;
  }

  function advancePage(y, height, canSplit) {
    if (!canSplit && y > 0 && y + height > CONTENT_HEIGHT) {
      y = 0;
    }

    if (!canSplit || y + height <= CONTENT_HEIGHT) {
      return y + height >= CONTENT_HEIGHT ? (y + height) % CONTENT_HEIGHT : y + height;
    }

    return (height - (CONTENT_HEIGHT - y)) % CONTENT_HEIGHT;
  }

  window.applyConversationPageBreaks = () => {
    const messages = Array.from(document.querySelectorAll(".conversation > .message"));
    let y = 0;

    for (const message of messages) {
      message.classList.remove("force-page-before");
    }

    messages.forEach((message, index) => {
      const isUser = message.classList.contains("user-message");
      const isAssistant = message.classList.contains("assistant-message");
      const height = Math.min(Math.max(outerHeight(message), 1), CONTENT_HEIGHT * 8);

      if (message.classList.contains("force-page-before") && y > 0) {
        y = 0;
      }

      y = advancePage(y, height, !isUser);

      const next = messages[index + 1];
      if (isAssistant && next?.classList.contains("user-message") && y > 0) {
        const promptHeight = Math.min(outerHeight(next), CONTENT_HEIGHT);
        const remaining = CONTENT_HEIGHT - y;
        if (remaining < Math.max(promptHeight + ANSWER_LEAD_HEIGHT, MIN_EXCHANGE_START_SPACE)) {
          next.classList.add("force-page-before");
          y = 0;
        }
      }
    });
  };

  window.addEventListener("load", () => {
    window.applyConversationPageBreaks();
  });
})();`;
}

function renderAttachmentLead(markdown, imageRegistry) {
  const attachments = extractLeadingAttachments(markdown);

  if (!attachments.length) {
    return "";
  }

  const imageCount = attachments.filter((item) => item.type === "image").length;
  const layoutClass = imageCount === 1 ? "single-image" : imageCount > 1 ? "image-grid" : "files-only";

  return `<div class="user-attachments ${layoutClass}" data-image-count="${imageCount}">${attachments.map((item, index) => {
    const typeClass = item.type === "file" ? "file" : "image";
    const imageSrc = item.type === "image" ? (normalizeEmbeddedImageSource(item.url) || item.url) : "";
    const asset = item.type === "image"
      ? imageRegistry?.bySrc?.get(item.url) || imageRegistry?.bySrc?.get(imageSrc)
      : null;
    const content = asset
      ? `<span class="attachment-thumb"><img src="${escapeAttr(imageSrc)}" alt="${escapeAttr(item.label)}"></span>`
      : `<span class="attachment-icon">${item.type === "file" ? getFileExtensionLabel(item.label) : "IMG"}</span>`;
    const card = `<span class="attachment-card ${typeClass} ${asset ? "with-thumb image-preview-card" : ""}">
      ${content}
      <span class="attachment-name">${escapeHtml(item.label || `${item.type === "image" ? "Image" : "Attachment"} ${index + 1}`)}</span>
    </span>`;
    return card;
  }).join("")}</div>`;
}

function extractLeadingAttachments(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const result = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || /^<!--[\s\S]*-->$/.test(trimmed)) {
      continue;
    }

    const image = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    const file = trimmed.match(/^\[File:\s*([^\]]+)\](?:\(([^)]+)\))?$/i);

    if (image) {
      result.push({ type: "image", label: image[1] || "Image", url: image[2] || "" });
    } else if (file) {
      result.push({ type: "file", label: file[1] || "Attachment" });
    }

  }

  return result;
}

// The contents list one row per prompt; answers are reached by reading on.
// A conversation that opens with an assistant message keeps that row too.
function buildTocRows(messages) {
  const rows = [];

  messages.forEach((message, index) => {
    if (message.role !== "user" && !(index === 0 && message.role === "assistant")) {
      return;
    }

    rows.push({
      id: getMessageAnchorId(message, index),
      kind: message.role || "message",
      number: formatTurnNumber(message, index).replace(/^Turn\s+/, ""),
      label: getTocLabel(messages, message, index).replace(/^Turn\s+\d+\.\s*/, "")
    });
  });

  return rows;
}

function buildImageRegistry(messages) {
  const bySrc = new Map();
  const items = [];

  messages.forEach((message, messageIndex) => {
    for (const image of extractMarkdownImages(`${message.markdown || ""}\n${message.thinkingMarkdown || ""}`)) {
      const src = normalizeEmbeddedImageSource(image.src)
        || (isSafeRenderAssetSource(image.src) ? image.src : "");
      if (!src || bySrc.has(src)) {
        continue;
      }

      const item = {
        id: `asset-image-${items.length + 1}`,
        src,
        alt: image.alt || `Image ${items.length + 1}`,
        messageNumber: messageIndex + 1
      };
      bySrc.set(image.src, item);
      bySrc.set(src, item);
      items.push(item);
    }
  });

  return { bySrc, items };
}

function isRenderableImageSource(value) {
  const source = String(value || "");
  return source.startsWith("data:image/") || isSafeRenderAssetSource(source);
}

function isSafeRenderAssetSource(value) {
  return /^render-assets\/[a-f0-9]{64}\.(?:png|jpe?g|gif|webp|svg)$/i.test(String(value || ""));
}

function extractMarkdownImages(markdown) {
  const images = [];
  const pattern = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match;

  while ((match = pattern.exec(String(markdown || "")))) {
    images.push({
      alt: match[1] || "image",
      src: match[2] || ""
    });
  }

  return images;
}

function renderRemoteMediaCard(src, alt) {
  const kind = /\.gif(?:$|[?#])/i.test(src) ? "GIF" : "IMG";
  const note = kind === "GIF"
    ? "Animated media is preserved as a reference; PDF output is static."
    : "Remote image reference preserved; embed when local bytes are available.";
  return `<a class="remote-media-card" href="${escapeAttr(src)}" target="_blank" rel="noopener noreferrer">
    <span class="remote-media-kind">${kind}</span>
    <span class="remote-media-main">
      <span class="remote-media-label">${escapeHtml(alt || "Image")}</span>
      <span class="remote-media-note">${escapeHtml(note)}</span>
    </span>
  </a>`;
}

function getFileExtensionLabel(filename) {
  const extension = String(filename || "")
    .split(/[?#]/)[0]
    .match(/\.([a-z0-9]{1,5})$/i)?.[1];
  return (extension || "FILE").slice(0, 4).toUpperCase();
}

function normalizeMessage(message, index) {
  const turnNumber = normalizeTurnNumber(message.turnNumber, index);

  return {
    ...message,
    id: message.id || `message-${index + 1}`,
    role: String(message.role || "message").toLowerCase(),
    turnNumber,
    markdown: String(message.markdown || ""),
    thinkingMarkdown: String(message.thinkingMarkdown || "")
  };
}

function normalizeTurnNumber(value, index) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : index + 1;
}

function getMessageAnchorId(message, index) {
  return `message-${index + 1}-${slugify(message.id || message.role || "turn")}`;
}

function getMessageLabel(message, index) {
  const markdownSource = stripAttachmentOnlyLines(cleanMarkdownForHtml(message.markdown || ""));
  const attachmentDescription = describeAttachmentOnlyMessage(message);
  if (!markdownSource && attachmentDescription) {
    return `${formatTurnNumber(message, index)}. ${attachmentDescription}`;
  }
  const source = markdownSource || cleanMarkdownForHtml(message.preview || message.thinkingMarkdown || "");
  const text = stripMarkdown(source).replace(/\s+/g, " ").trim();
  return `${formatTurnNumber(message, index)}. ${text.slice(0, 82) || attachmentDescription || formatRole(message.role)}`;
}

// An image-only prompt says nothing by itself; its answer names the content.
function getTocLabel(messages, message, index) {
  const label = getMessageLabel(message, index);
  const next = messages[index + 1];
  const isAttachmentOnly = message.role === "user"
    && !stripAttachmentOnlyLines(cleanMarkdownForHtml(message.markdown || ""))
    && describeAttachmentOnlyMessage(message);

  if (!isAttachmentOnly || next?.role !== "assistant") {
    return label;
  }

  const imageCount = extractLeadingAttachments(message.markdown).filter((item) => item.type === "image").length;
  const answer = stripMarkdown(cleanMarkdownForHtml(next.markdown || "")).replace(/\s+/g, " ").trim().slice(0, 70);
  const prefix = imageCount === 1 ? "[image]" : `[${imageCount} images]`;
  return `${formatTurnNumber(message, index)}. ${prefix} ${answer}`;
}

function describeAttachmentOnlyMessage(message) {
  const attachments = extractLeadingAttachments(message.markdown);
  const imageCount = attachments.filter((item) => item.type === "image").length;
  const fileCount = attachments.filter((item) => item.type === "file").length;
  const owner = message.role === "assistant" ? "Assistant" : "User";

  if (imageCount && fileCount) return `${owner} attachments: ${imageCount} image${imageCount === 1 ? "" : "s"}, ${fileCount} file${fileCount === 1 ? "" : "s"}`;
  if (imageCount) return `${owner} ${imageCount === 1 ? "image" : `${imageCount} images`}`;
  if (fileCount) return `${owner} ${fileCount === 1 ? "file attachment" : `${fileCount} file attachments`}`;
  return "";
}

function getThinkingLabel(markdown) {
  const firstHeading = String(markdown || "").split(/\r?\n/).find((line) => /^\s*(?:[-*+]\s+)?#{0,6}\s*\S/.test(line));
  return stripMarkdown(firstHeading || markdown).replace(/\s+/g, " ").trim().slice(0, 86) || "Thinking";
}

function formatRole(role) {
  const value = String(role || "Message").toLowerCase();
  if (value === "assistant") return "ChatGPT";
  if (value === "user") return "User";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatTurnNumber(message, index) {
  const number = Number(message?.turnNumber);
  const value = Number.isFinite(number) && number > 0 ? Math.floor(number) : index + 1;
  return `Turn ${String(value).padStart(2, "0")}`;
}

function formatTurnHeading(message, index) {
  return `${formatTurnNumber(message, index)} - ${formatRole(message.role)}`;
}

function cleanMarkdownForHtml(markdown) {
  return compactMarkdownSourceLinks(String(markdown || "")
    .replace(/\r\n?/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/[\uE000-\uF8FF]*cite(?:[\uE000-\uF8FF]+turn[0-9A-Za-z_-]+)+[\uE000-\uF8FF]*/gi, "")
    .replace(/[\uE000-\uF8FF]+/g, "")
    .replace(/!\[(image-\d+|Image-\d+)\]\((https?:\/\/[^)]+)\)\s*/gi, "")
    .replace(/\[Image:\s*([^\]]+)\]\((https?:\/\/[^)]+)\)/gi, "[$1]($2)")
    .trim());
}

function compactMarkdownSourceLinks(markdown) {
  return stripFaviconMarkdownImages(markdown)
    .replace(/\[!\\?\[[^\]\n]*\\?\]\([^)]+\)\s*([^\]]*?)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, url) => {
      const cleanLabel = cleanMarkdownLinkLabel(label, url);
      return cleanLabel ? `[${escapeMarkdownLinkLabel(cleanLabel)}](${url})` : url;
    })
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, url) => {
      const cleanLabel = cleanMarkdownLinkLabel(label, url);
      return cleanLabel ? `[${escapeMarkdownLinkLabel(cleanLabel)}](${url})` : url;
    });
}

function stripFaviconMarkdownImages(markdown) {
  return String(markdown || "")
    .replace(/!\\?\[[^\]\n]*\\?\]\((https?:\/\/[^)]*(?:google\.com\/s2\/favicons|favicon)[^)]*)\)\s*/gi, "");
}

function cleanMarkdownLinkLabel(label, url = "") {
  const value = String(label || "")
    .replace(/!\\?\[[^\]\n]*\\?\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, " ")
    .replace(/\\?\[?image-\d+\\?]?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!value) return compactUrlLabel(url);
  if (/^https?:\/\//i.test(value)) return compactUrlLabel(value);
  return value;
}

function compactUrlLabel(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "") || url;
  } catch {
    return String(url || "").slice(0, 80);
  }
}

function escapeMarkdownLinkLabel(text) {
  return String(text || "").replace(/[[\]\\]/g, "\\$&");
}

function stripAttachmentOnlyLines(markdown) {
  return String(markdown || "")
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return !(/^!\[[^\]]*]\([^)]+\)$/.test(trimmed) || /^\[File:\s*[^\]]+]/i.test(trimmed));
    })
    .join("\n")
    .trim();
}

function stripMarkdown(markdown) {
  return String(markdown || "")
    .replace(/```[\s\S]*?```/g, " code ")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_`~|-]/g, " ")
    .replace(/\s+/g, " ");
}

function normalizeLanguage(language) {
  const value = String(language || "").trim().toLowerCase();
  const aliases = {
    js: "javascript",
    ts: "typescript",
    py: "python",
    sh: "bash",
    shell: "bash",
    ps: "powershell",
    ps1: "powershell",
    yml: "yaml"
  };
  return aliases[value] || value;
}

function shouldShowCodeLabel(language) {
  return Boolean(language) && !["text", "txt", "plain", "plaintext"].includes(language);
}

async function renderPdfWithChrome({ htmlPath, outputPath, chromePath }) {
  if (!chromePath) {
    throw new Error("Chrome or Edge was not found. Pass --chrome <path-to-chrome.exe>.");
  }

  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true
  });

  try {
    const page = await browser.newPage({
      viewport: {
        width: 674,
        height: 1011
      }
    });
    await page.goto(pathToFileURL(htmlPath).href, {
      waitUntil: "load",
      timeout: 60_000
    });
    await page.emulateMedia({ media: "print" });
    await page.evaluate(async () => {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
      window.applyConversationPageBreaks?.();
    });
    await page.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      outline: true,
      preferCSSPageSize: true,
      margin: {
        top: "56px",
        right: "60px",
        bottom: "56px",
        left: "60px"
      },
      headerTemplate: `<div style="width:100%;font-size:8px;color:#a3a3a3;padding:0 60px;font-family:'Helvetica Neue',Helvetica,Arial,'PingFang SC','Microsoft YaHei',sans-serif;"><span class="title" style="display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;"></span></div>`,
      footerTemplate: `<div style="width:100%;font-size:8px;color:#a3a3a3;padding:0 60px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;display:flex;justify-content:flex-end;gap:3px;"><span class="pageNumber"></span><span>/</span><span class="totalPages"></span></div>`
    });
  } finally {
    await browser.close();
  }
}

function buildPdfOutlineItems(messages) {
  return messages
    .map((message, index) => {
      const normalized = normalizeMessage(message, index);
      return {
        title: getMessageOutlineTitle(normalized, index),
        destName: getMessageAnchorId(normalized, index)
      };
    })
    .filter((item) => item.title && item.destName);
}

function getMessageOutlineTitle(message, index) {
  const markdownSource = stripAttachmentOnlyLines(cleanMarkdownForHtml(message.markdown || ""));
  const attachmentDescription = describeAttachmentOnlyMessage(message);
  const heading = formatTurnHeading(message, index);
  if (!markdownSource && attachmentDescription) {
    return `${heading}: ${attachmentDescription}`;
  }
  const source = markdownSource || cleanMarkdownForHtml(message.preview || message.thinkingMarkdown || "");
  const preview = stripMarkdown(source).trim().slice(0, 76);
  return preview ? `${heading}: ${preview}` : attachmentDescription ? `${heading}: ${attachmentDescription}` : heading;
}

function addPdfOutlines(pdfPath, outlineItems) {
  if (!outlineItems.length) {
    return { count: 0, warning: "no outline items" };
  }

  const original = fs.readFileSync(pdfPath);
  const source = original.toString("latin1");

  if (source.includes("/Outlines")) {
    return { count: 0, warning: "existing outline tree" };
  }

  const trailerInfo = readLatestTrailer(source);
  if (!trailerInfo.root || !Number.isFinite(trailerInfo.size)) {
    return { count: 0, warning: "PDF trailer missing Root or Size" };
  }

  const catalog = readPdfObject(source, trailerInfo.root.object, trailerInfo.root.generation);
  if (!catalog || !catalog.body.trim().startsWith("<<") || !catalog.body.trim().endsWith(">>")) {
    return { count: 0, warning: "PDF catalog dictionary not found" };
  }

  const outlineRootId = trailerInfo.size;
  const firstItemId = outlineRootId + 1;
  const itemObjects = outlineItems.map((item, index) => ({
    objectId: firstItemId + index,
    title: item.title,
    destName: item.destName
  }));
  const lastItemId = firstItemId + itemObjects.length - 1;
  const updatedCatalog = addCatalogOutlineEntries(catalog.body, outlineRootId);
  const objects = [
    {
      object: trailerInfo.root.object,
      generation: trailerInfo.root.generation,
      body: updatedCatalog
    },
    {
      object: outlineRootId,
      generation: 0,
      body: [
        "<<",
        "/Type /Outlines",
        `/First ${firstItemId} 0 R`,
        `/Last ${lastItemId} 0 R`,
        `/Count ${itemObjects.length}`,
        ">>"
      ].join("\n")
    },
    ...itemObjects.map((item, index) => ({
      object: item.objectId,
      generation: 0,
      body: buildOutlineItemDictionary({
        item,
        outlineRootId,
        previousId: index > 0 ? itemObjects[index - 1].objectId : 0,
        nextId: index < itemObjects.length - 1 ? itemObjects[index + 1].objectId : 0
      })
    }))
  ];

  const appended = buildIncrementalPdfUpdate({
    originalLength: original.length,
    objects,
    root: trailerInfo.root,
    info: trailerInfo.info,
    previousStartXref: trailerInfo.startXref,
    newSize: outlineRootId + itemObjects.length + 1
  });

  fs.writeFileSync(pdfPath, Buffer.concat([original, Buffer.from(appended, "latin1")]));
  return { count: outlineItems.length };
}

function readLatestTrailer(source) {
  const trailerIndex = source.lastIndexOf("trailer");
  const startXrefMatch = source.slice(trailerIndex).match(/startxref\s+(\d+)/);
  const trailerMatch = source.slice(trailerIndex).match(/trailer\s*(<<[\s\S]*?>>)\s*startxref/);

  if (trailerIndex < 0 || !trailerMatch || !startXrefMatch) {
    return {};
  }

  const trailer = trailerMatch[1];
  const rootMatch = trailer.match(/\/Root\s+(\d+)\s+(\d+)\s+R/);
  const infoMatch = trailer.match(/\/Info\s+(\d+)\s+(\d+)\s+R/);
  const sizeMatch = trailer.match(/\/Size\s+(\d+)/);

  return {
    startXref: Number(startXrefMatch[1]),
    size: sizeMatch ? Number(sizeMatch[1]) : NaN,
    root: rootMatch ? {
      object: Number(rootMatch[1]),
      generation: Number(rootMatch[2])
    } : null,
    info: infoMatch ? {
      object: Number(infoMatch[1]),
      generation: Number(infoMatch[2])
    } : null
  };
}

function readPdfObject(source, objectId, generation) {
  const objectPattern = new RegExp(`(?:^|\\n)${objectId}\\s+${generation}\\s+obj\\s*([\\s\\S]*?)\\s*endobj`);
  const match = source.match(objectPattern);

  return match ? {
    object: objectId,
    generation,
    body: match[1].trim()
  } : null;
}

function addCatalogOutlineEntries(catalogBody, outlineRootId) {
  const trimmed = catalogBody.trim().replace(/\/PageMode\s+\/[A-Za-z0-9]+\s*/g, "");
  return [
    trimmed.slice(0, -2).trimEnd(),
    `/Outlines ${outlineRootId} 0 R`,
    "/PageMode /UseOutlines",
    ">>"
  ].join("\n");
}

function buildOutlineItemDictionary({ item, outlineRootId, previousId, nextId }) {
  const lines = [
    "<<",
    `/Title ${encodePdfUtf16Hex(item.title)}`,
    `/Parent ${outlineRootId} 0 R`,
    `/Dest /${escapePdfName(item.destName)}`
  ];

  if (previousId) {
    lines.push(`/Prev ${previousId} 0 R`);
  }

  if (nextId) {
    lines.push(`/Next ${nextId} 0 R`);
  }

  lines.push(">>");
  return lines.join("\n");
}

function buildIncrementalPdfUpdate({ originalLength, objects, root, info, previousStartXref, newSize }) {
  const chunks = ["\n"];
  const offsets = new Map();
  let cursor = originalLength + 1;

  for (const entry of objects) {
    const objectText = `${entry.object} ${entry.generation} obj\n${entry.body}\nendobj\n`;
    offsets.set(entry.object, cursor);
    chunks.push(objectText);
    cursor += Buffer.byteLength(objectText, "latin1");
  }

  const xrefStart = cursor;
  const rootOffset = offsets.get(root.object);
  const newObjects = objects.filter((entry) => entry.object !== root.object);
  const firstNewObject = Math.min(...newObjects.map((entry) => entry.object));
  chunks.push([
    "xref",
    `${root.object} 1`,
    `${formatPdfOffset(rootOffset)} ${String(root.generation).padStart(5, "0")} n `,
    `${firstNewObject} ${newObjects.length}`,
    ...newObjects.map((entry) => `${formatPdfOffset(offsets.get(entry.object))} ${String(entry.generation).padStart(5, "0")} n `),
    "trailer",
    buildIncrementalTrailer({ newSize, root, info, previousStartXref }),
    "startxref",
    String(xrefStart),
    "%%EOF",
    ""
  ].join("\n"));

  return chunks.join("");
}

function buildIncrementalTrailer({ newSize, root, info, previousStartXref }) {
  const lines = [
    "<<",
    `/Size ${newSize}`,
    `/Root ${root.object} ${root.generation} R`
  ];

  if (info) {
    lines.push(`/Info ${info.object} ${info.generation} R`);
  }

  lines.push(`/Prev ${previousStartXref}`);
  lines.push(">>");
  return lines.join("\n");
}

function formatPdfOffset(offset) {
  return String(offset).padStart(10, "0");
}

function escapePdfName(value) {
  return String(value || "").replace(/[^A-Za-z0-9._-]/g, (character) => {
    return Buffer.from(character, "utf8").toString("hex").toUpperCase().replace(/../g, "#$&");
  });
}

function encodePdfUtf16Hex(value) {
  const text = String(value || "");
  const buffer = Buffer.alloc(2 + text.length * 2);
  buffer[0] = 0xfe;
  buffer[1] = 0xff;

  for (let index = 0; index < text.length; index += 1) {
    buffer.writeUInt16BE(text.charCodeAt(index), 2 + index * 2);
  }

  return `<${buffer.toString("hex").toUpperCase()}>`;
}

function findChromeExecutable() {
  const candidates = [
    process.env.CGCE_RENDER_BROWSER_PATH,
    process.env.CHROME_PATH,
    process.env.HUAWEI_BROWSER_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge"
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function buildCss() {
  return `
@page {
  size: A4;
  margin: 44px 34px;
}

* {
  box-sizing: border-box;
}

html {
  color-scheme: light;
}

body {
  margin: 0;
  color: #111827;
  background: #ffffff;
  font-family: Inter, "Noto Sans", "Noto Sans Arabic", "Noto Sans Hebrew", "Noto Sans SC", "Noto Sans CJK SC", "Noto Sans CJK JP", "Noto Sans CJK KR", "Noto Sans JP", "Noto Sans KR", "Microsoft YaHei", "PingFang SC", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, "Malgun Gothic", "Apple SD Gothic Neo", "Segoe UI", Arial, sans-serif;
  font-size: 13.1px;
  line-height: 1.6;
  letter-spacing: 0;
}

a {
  color: #2563eb;
  text-decoration: underline;
  text-decoration-thickness: .06em;
  text-underline-offset: .16em;
}

.page-break-after {
  break-after: page;
}

.page-break-before {
  break-before: page;
}

.intro-sheet {
  break-after: page;
}

.cover-card {
  margin: 8px 0 16px;
  padding: 20px 24px 21px;
  border: 1px solid #d8dee8;
  border-radius: 10px;
  background: #f8fbff;
  position: relative;
}

.cover-rule {
  height: 4px;
  background: #10a37f;
  border-radius: 999px;
  margin: -20px -6px 17px;
}

.cover-card h1 {
  margin: 0 0 8px;
  font-size: 27px;
  line-height: 1.18;
  font-weight: 800;
  color: #111827;
}

.cover-card p {
  margin: 4px 0;
  color: #6b7280;
}

.source {
  overflow-wrap: anywhere;
}

.toc {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 15px 18px 15px;
  background: #ffffff;
}

.intro-sheet-continuation .toc {
  margin-top: 8px;
}

.toc h2 {
  margin: 0 0 8px;
  font-size: 16px;
  line-height: 1.25;
}

.toc-grid {
  column-count: 2;
  column-gap: 26px;
}

.toc-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
  break-inside: avoid;
  min-height: 13px;
  padding: 1.5px 0;
  color: #334155;
  text-decoration: none;
  border-bottom: 1px dotted #e5eaf1;
  font-size: 9.6px;
  line-height: 1.2;
}

.toc-row.thinking {
  color: #7c3aed;
}

.toc-row.assistant {
  color: #2563eb;
}

.toc-row.has-thinking .toc-label::after {
  content: "";
  display: inline-block;
  width: 5px;
  height: 5px;
  margin-left: 5px;
  border-radius: 50%;
  background: #8b5cf6;
  vertical-align: middle;
}

.toc-row .toc-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toc-meta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #8a94a6;
  white-space: nowrap;
}

.toc-chip {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #8b5cf6;
  display: inline-block;
}

.toc-type {
  color: #8a94a6;
  font-size: 9.5px;
}

.conversation {
  padding-top: 4px;
}

.message {
  margin: 0;
}

.user-message {
  display: block;
  break-inside: auto;
  margin: 0 0 12px;
}

.user-stack {
  width: min(78%, 570px);
  display: block;
  margin-left: auto;
  break-inside: auto;
  text-align: right;
}

.user-stack > * {
  margin-top: 8px;
}

.user-stack > :first-child {
  margin-top: 0;
}

.user-meta-row {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-height: 28px;
  max-width: 100%;
  margin-left: auto;
}

.user-meta-row .turn-heading {
  flex: 0 0 auto;
  white-space: nowrap;
}

.turn-heading {
  margin: 0;
  color: #7b8494;
  font-size: 9.5px;
  line-height: 1.25;
  font-weight: 750;
  letter-spacing: 0;
  break-after: avoid;
}

.user-turn-heading {
  text-align: right;
}

.assistant-turn-heading {
  align-self: center;
}

.avatar,
.assistant-avatar {
  width: 27px;
  height: 27px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}

.avatar img,
.assistant-avatar img {
  width: 27px;
  height: 27px;
  object-fit: contain;
  display: block;
}

.avatar-fallback {
  font-size: 9px;
  font-weight: 800;
  color: #111827;
}

.user-avatar {
  display: flex;
  margin-left: auto;
  opacity: .95;
}

.bubble {
  width: fit-content;
  max-width: 100%;
  padding: 10px 15px 11px;
  border-radius: 19px;
  background: #f4f4f5;
  border: 1px solid #e7e9ee;
}

.user-bubble {
  border-bottom-right-radius: 7px;
  margin-left: auto;
  text-align: left;
}

.message-time {
  color: #9ca3af;
  font-size: 10.4px;
  font-style: italic;
}

.user-time {
  display: block;
  text-align: right;
}

.assistant-message {
  display: block;
  break-inside: auto;
  margin: 0 0 20px;
}

.user-message.force-page-before {
  break-before: page;
}

.assistant-row {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 11px;
  align-items: start;
}

.assistant-gutter {
  display: flex;
  justify-content: center;
  padding-top: 1px;
}

.assistant-main {
  min-width: 0;
}

.assistant-intro {
  min-width: 0;
  break-inside: auto;
  page-break-inside: auto;
}

.assistant-header {
  margin: 0 0 6px;
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: flex-start;
}

.assistant-title {
  min-width: 0;
  display: inline-flex;
  gap: 8px;
  align-items: center;
  justify-content: flex-start;
}

.assistant-avatar {
  opacity: .92;
}

.assistant-body {
  min-width: 0;
}

.assistant-content {
  padding-top: 0;
}

.thinking {
  margin: 0 0 14px;
  padding: 14px 16px;
  border: 1px solid #d4dce8;
  border-left: 4px solid #8b5cf6;
  border-radius: 9px;
  background: #faf8ff;
  break-inside: auto;
  page-break-inside: auto;
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}

.thinking h3 {
  margin: 0 0 8px;
  font-size: 15px;
  line-height: 1.25;
  color: #4c1d95;
  font-weight: 800;
  break-after: avoid;
  page-break-after: avoid;
}

.thinking .markdown-body {
  color: #4b5563;
  font-size: 12px;
}

.thinking ul {
  position: relative;
}

.thinking .markdown-body h4 {
  display: table;
  max-width: 100%;
  margin: 12px 0 7px;
  padding: 3px 9px;
  border: 1px solid #ddd1fe;
  border-radius: 999px;
  background: #f0ebff;
  color: #5b21b6;
  font-size: 11px;
  line-height: 1.35;
  font-weight: 800;
  overflow-wrap: anywhere;
  break-inside: avoid;
  page-break-inside: avoid;
}

.thinking .markdown-body h4:first-child {
  margin-top: 0;
}

.thinking .markdown-body h5 {
  display: table;
  max-width: 100%;
  margin: 10px 0 6px;
  padding: 2px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #ffffff;
  color: #475569;
  font-size: 10.5px;
  line-height: 1.35;
  font-weight: 800;
  overflow-wrap: anywhere;
  break-after: avoid;
  break-inside: avoid;
  page-break-inside: avoid;
}

.thinking .markdown-body h5 + pre {
  margin-top: 6px;
}

.thinking .markdown-body li {
  break-inside: avoid;
  page-break-inside: avoid;
}

.markdown-body {
  overflow-wrap: anywhere;
}

.markdown-body > :first-child {
  margin-top: 0;
}

.markdown-body > :last-child {
  margin-bottom: 0;
}

.markdown-body p {
  margin: 0 0 10px;
}

.markdown-body strong {
  font-weight: 800;
  color: #0f172a;
}

.markdown-body em {
  font-style: italic;
}

.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4 {
  margin: 17px 0 8px;
  line-height: 1.32;
  color: #0f172a;
  break-after: avoid;
}

.markdown-body h1 { font-size: 21px; }
.markdown-body h2 { font-size: 18px; border-top: 1px solid #edf1f5; padding-top: 14px; }
.markdown-body h3 { font-size: 15px; }
.markdown-body h4 { font-size: 13px; }

.markdown-body ul,
.markdown-body ol {
  margin: 8px 0 12px 22px;
  padding: 0;
}

.markdown-body li {
  margin: 4px 0;
  padding-left: 2px;
}

.markdown-body .footnote-ref {
  font-size: 0.72em;
  line-height: 0;
  margin-left: 1px;
}

.markdown-body .footnote-ref a {
  color: #2563eb;
  text-decoration: none;
  font-weight: 650;
}

.markdown-body .footnotes {
  margin-top: 14px;
  padding-top: 8px;
  border-top: 1px solid #e5e7eb;
  font-size: 10px;
  color: #4b5563;
}

.markdown-body .footnotes ol {
  margin: 0;
  padding-left: 18px;
}

.markdown-body .footnotes li {
  margin: 2px 0;
  word-break: break-word;
}

.markdown-body blockquote {
  margin: 12px 0;
  padding: 8px 12px 8px 14px;
  border-left: 4px solid #d7dde5;
  background: #f8fafc;
  color: #1f2937;
  font-style: italic;
  break-inside: avoid;
}

.markdown-body code {
  font-family: "Cascadia Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: .9em;
  padding: 1px 4px;
  border-radius: 4px;
  background: #eef2f7;
}

.markdown-body pre {
  margin: 12px 0 14px;
  padding: 14px 16px;
  border-radius: 8px;
  background: #f6f8fa;
  border: 1px solid #edf1f5;
  overflow: hidden;
  white-space: pre-wrap;
  break-inside: avoid;
}

.markdown-body pre code {
  display: block;
  padding: 0;
  background: transparent;
  font-size: 11px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.code-label {
  margin: 12px 0 -12px;
  padding: 3px 10px;
  border-radius: 8px 8px 0 0;
  background: #e8edf5;
  color: #64748b;
  font-family: "Cascadia Mono", Consolas, monospace;
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
}

.writing-block {
  margin: 12px 0 14px;
  border: 1px solid #dbe3ed;
  border-radius: 12px;
  background: #ffffff;
  break-inside: avoid;
  overflow: hidden;
}

.writing-label {
  padding: 6px 14px;
  border-bottom: 1px solid #edf1f5;
  background: #f8fafc;
  color: #64748b;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.writing-body {
  padding: 4px 16px;
}

.math-card {
  margin: 14px 0 16px;
  border: 1px solid #dbe3ed;
  border-radius: 9px;
  background: #fbfdff;
  break-inside: avoid;
  overflow: hidden;
}

.math-card figcaption {
  padding: 7px 11px;
  border-bottom: 1px solid #e5ebf3;
  background: #ffffff;
  color: #475569;
  font-size: 10.5px;
  font-weight: 800;
}

.math-display {
  padding: 14px 16px;
  text-align: center;
  color: #0f172a;
  font-family: "Cambria Math", "STIX Two Math", "Times New Roman", serif;
  font-size: 16px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.math-inline {
  display: inline-block;
  padding: 0 4px;
  border-radius: 4px;
  background: #f1f5f9;
  color: #0f172a;
  font-family: "Cambria Math", "STIX Two Math", "Times New Roman", serif;
  font-size: .96em;
}

.math-frac {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
  line-height: 1.08;
  margin: 0 2px;
}

.math-num {
  display: block;
  padding: 0 4px 2px;
  border-bottom: 1px solid currentColor;
  font-size: .86em;
}

.math-den {
  display: block;
  padding: 2px 4px 0;
  font-size: .86em;
}

.math-root {
  display: inline-flex;
  align-items: stretch;
  vertical-align: middle;
  margin: 0 2px;
}

.math-root-symbol {
  font-size: 1.18em;
  line-height: 1;
  padding-right: 1px;
}

.math-root-body {
  border-top: 1px solid currentColor;
  padding: 1px 3px 0;
}

.math-sup,
.math-sub {
  font-size: .72em;
  line-height: 0;
}

.math-align-space {
  display: inline-block;
  width: 16px;
}

.mermaid-card {
  margin: 14px 0 18px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #f8fafc;
  overflow: hidden;
  break-inside: avoid;
}

.mermaid-title {
  padding: 8px 12px;
  border-bottom: 1px solid #e5e7eb;
  background: #ffffff;
  color: #1f2937;
  font-size: 12px;
  font-weight: 700;
}

.mermaid-stage {
  padding: 16px 14px;
  background: #f8fafc;
}

.mermaid-svg {
  display: block;
  width: 100%;
  height: auto;
}

.mermaid-group rect {
  fill: #ffffff;
  stroke: #cbd5e1;
  stroke-width: 1.2;
}

.mermaid-group text {
  fill: #64748b;
  font-size: 10px;
  font-weight: 700;
}

.mermaid-node rect,
.mermaid-node ellipse {
  fill: #f8fafc;
  stroke: #94a3b8;
  stroke-width: 1.15;
}

.mermaid-node text {
  fill: #0f172a;
  font-size: 10.5px;
  font-weight: 650;
}

.mermaid-edge path {
  fill: none;
  stroke: #64748b;
  stroke-width: 1.1;
}

.mermaid-edge-label {
  fill: #475569;
  font-size: 9.5px;
  font-weight: 650;
  paint-order: stroke;
  stroke: #f8fafc;
  stroke-width: 3px;
}

.mermaid-fallback {
  margin-top: 0;
}

.diagram-degraded-note {
  padding: 9px 12px 0;
  color: #64748b;
  font-size: 10.5px;
  font-weight: 650;
}

.sequence-svg {
  display: block;
  width: 100%;
  height: auto;
}

.sequence-participant rect {
  fill: #ffffff;
  stroke: #94a3b8;
  stroke-width: 1.1;
}

.sequence-participant text {
  fill: #0f172a;
  font-size: 10.5px;
  font-weight: 760;
}

.sequence-participant line {
  stroke: #cbd5e1;
  stroke-width: 1;
  stroke-dasharray: 4 5;
}

.sequence-message line {
  stroke: #64748b;
  stroke-width: 1.25;
}

.sequence-message text,
.sequence-note text {
  fill: #334155;
  font-size: 10px;
  font-weight: 650;
  paint-order: stroke;
  stroke: #f8fafc;
  stroke-width: 3px;
}

.sequence-note rect {
  fill: #fff7ed;
  stroke: #fed7aa;
  stroke-width: 1;
}

.er-svg,
.state-svg,
.chart-svg {
  display: block;
  width: 100%;
  height: auto;
}

.er-relationship path,
.state-transition path {
  fill: none;
  stroke: #64748b;
  stroke-width: 1.15;
}

.er-relationship text,
.state-transition text {
  fill: #334155;
  font-size: 9.7px;
  font-weight: 700;
  paint-order: stroke;
  stroke: #f8fafc;
  stroke-width: 3px;
}

.er-entity rect {
  fill: #ffffff;
  stroke: #94a3b8;
  stroke-width: 1.15;
}

.er-entity line {
  stroke: #dbe3ed;
  stroke-width: 1;
}

.er-title {
  fill: #0f172a;
  font-size: 10.6px;
  font-weight: 800;
}

.er-attribute {
  fill: #475569;
  font-size: 9.2px;
  font-weight: 600;
}

.state-node rect {
  fill: #ffffff;
  stroke: #94a3b8;
  stroke-width: 1.15;
}

.state-node text {
  fill: #0f172a;
  font-size: 10.5px;
  font-weight: 750;
}

.state-terminal circle {
  fill: #0f172a;
  stroke: #0f172a;
}

.chart-card {
  margin: 14px 0 18px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #f8fafc;
  overflow: hidden;
  break-inside: avoid;
}

.chart-title {
  padding: 8px 12px;
  border-bottom: 1px solid #e5e7eb;
  background: #ffffff;
  color: #1f2937;
  font-size: 12px;
  font-weight: 800;
}

.chart-stage {
  padding: 14px 14px 8px;
  background: #f8fafc;
}

.chart-grid line {
  stroke: #e2e8f0;
  stroke-width: 1;
}

.chart-grid text,
.chart-label {
  fill: #64748b;
  font-size: 9.5px;
  font-weight: 650;
}

.chart-axis {
  stroke: #94a3b8;
  stroke-width: 1.2;
}

.chart-bar {
  fill: #10a37f;
}

.chart-line {
  fill: none;
  stroke: #2563eb;
  stroke-width: 2;
}

.chart-dot {
  fill: #ffffff;
  stroke: #2563eb;
  stroke-width: 2;
}

.chart-value {
  fill: #334155;
  font-size: 9.5px;
  font-weight: 750;
}

.chart-fallback {
  margin: 8px 12px 12px;
}

.markdown-body table {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0 16px;
  font-size: 11.5px;
  break-inside: avoid;
}

.markdown-body th,
.markdown-body td {
  border: 1px solid #dbe3ed;
  padding: 7px 8px;
  vertical-align: top;
}

.markdown-body th {
  background: #f1f5f9;
  font-weight: 800;
  color: #111827;
}

.markdown-body tr:nth-child(even) td {
  background: #fbfdff;
}

.inline-image {
  margin: 10px 0;
  break-inside: avoid;
}

.inline-image-link,
.attachment-card-link {
  color: inherit;
  text-decoration: none;
}

.inline-image img {
  display: block;
  max-width: 100%;
  max-height: 520px;
  border: 1px solid #dbe3ed;
  border-radius: 10px;
  object-fit: contain;
}

.inline-image figcaption {
  margin-top: 4px;
  font-size: 10px;
  color: #7b8494;
}

.user-attachments {
  display: grid;
  /* minmax(0, ...) keeps a wide screenshot from stretching the track past the page margin. */
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  break-inside: auto;
  text-align: right;
  width: min(470px, 100%);
  margin-left: auto;
}

.user-attachments.image-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.attachment-card {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 210px;
  max-width: 350px;
  padding: 8px 12px;
  border: 1px solid #e0e5ec;
  border-radius: 10px;
  background: #ffffff;
}

.attachment-card.with-thumb {
  display: flex;
  min-width: 0;
  width: min(470px, 100%);
  max-width: 470px;
  padding: 0;
  flex-direction: column;
  align-items: stretch;
  gap: 0;
  margin-left: auto;
  border: 0;
  border-radius: 14px;
  background: transparent;
  break-inside: avoid;
  page-break-inside: avoid;
}

.user-attachments .attachment-card-link,
.user-attachments .attachment-card {
  margin-left: auto;
  text-align: left;
}

.user-attachments .attachment-card-link {
  display: block;
  width: min(470px, 100%);
}

.user-attachments > .attachment-card {
  display: flex;
  width: max-content;
  max-width: 100%;
}

.user-attachments .attachment-card-link + .attachment-card-link,
.user-attachments .attachment-card-link + .attachment-card,
.user-attachments .attachment-card + .attachment-card-link,
.user-attachments .attachment-card + .attachment-card {
  margin-top: 0;
}

.attachment-thumb {
  width: 100%;
  max-height: 430px;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid #dfe6f0;
  background: #ffffff;
  flex: 0 0 auto;
  display: block;
}

.attachment-thumb img {
  width: 100%;
  height: auto;
  max-height: 430px;
  object-fit: contain;
  display: block;
}

.user-attachments > .attachment-card.with-thumb {
  width: 100%;
}

/* Screenshots carry the content being discussed, so grids scale them down
   instead of cropping them to a fixed height. */
.user-attachments.image-grid .attachment-thumb,
.user-attachments.image-grid .attachment-thumb img {
  height: auto;
  max-height: 320px;
}

.user-attachments.image-grid .attachment-thumb img {
  object-fit: contain;
}

.attachment-icon {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  background: #fee2e2;
  color: #ef4444;
  font-size: 8px;
  font-weight: 800;
}

.attachment-card.image .attachment-icon {
  background: #dbeafe;
  color: #2563eb;
}

.attachment-name {
  min-width: 0;
  color: #111827;
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-card.with-thumb .attachment-name {
  display: none;
}

.attachment-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: #eef2f7;
  color: #475569;
  font-size: 10.5px;
  font-weight: 650;
}

.remote-media-card {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  max-width: 100%;
  margin: 6px 0;
  padding: 8px 10px;
  border: 1px solid #dbe3ed;
  border-radius: 9px;
  background: #fbfdff;
  color: inherit;
  text-decoration: none;
  break-inside: avoid;
}

.remote-media-kind {
  width: 32px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 9px;
  font-weight: 900;
  flex: 0 0 auto;
}

.remote-media-main {
  min-width: 0;
  display: inline-flex;
  flex-direction: column;
  gap: 1px;
}

.remote-media-label {
  color: #111827;
  font-size: 11.2px;
  font-weight: 750;
  overflow-wrap: anywhere;
}

.remote-media-note {
  color: #64748b;
  font-size: 9.7px;
}

.object-link {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  max-width: 100%;
  margin: 3px 5px 4px 0;
  padding: 6px 9px 6px 7px;
  border: 1px solid #dbe3ed;
  border-radius: 8px;
  background: #ffffff;
  color: #1f2937;
  text-decoration: none;
  font-size: 11.2px;
  font-weight: 650;
  vertical-align: middle;
  overflow-wrap: anywhere;
}

.object-link::before {
  content: attr(data-object-kind);
  min-width: 28px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: #eef2ff;
  color: #4338ca;
  font-size: 8px;
  font-weight: 900;
  flex: 0 0 auto;
}

.object-media-link::before {
  background: #fee2e2;
  color: #b91c1c;
}

.object-interactive-link::before {
  background: #dcfce7;
  color: #166534;
}

.object-source-link::before {
  background: #e0f2fe;
  color: #075985;
}

.hljs {
  color: #24292f;
  background: #f6f8fa;
}

.hljs-keyword,
.hljs-selector-tag,
.hljs-built_in {
  color: #cf22d5;
}

.hljs-string,
.hljs-attr {
  color: #1a7f37;
}

.hljs-number,
.hljs-literal {
  color: #0969da;
}

.hljs-title,
.hljs-function {
  color: #0969da;
}

.hljs-comment {
  color: #6e7781;
}

.hljs-variable,
.hljs-params {
  color: #953800;
}

/* DIL (generative UI) answers drawn by dil-runtime.js */
.dil-message.dil-ok .dil-fallback,
.dil-message:not(.dil-ok) .dil-root {
  display: none;
}

.dil-root {
  font-size: 14px;
  line-height: 1.65;
  color: #0d0d0d;
}

.dil-root > * + * {
  margin-top: 12px;
}

.dil-box,
.dil-row,
.dil-grid {
  gap: 8px;
}

.dil-root > .dil-title:not(:first-child) {
  margin-top: 22px;
}

.dil-card,
.dil-pressable,
.dil-code,
.dil-image,
.dil-table {
  break-inside: avoid;
}

:where(.dil-text, .dil-caption, .dil-title) {
  margin: 0;
}

.dil-title {
  font-weight: 650;
  line-height: 1.35;
}

.dil-caption {
  color: #8f8f8f;
  font-size: 12px;
  line-height: 1.5;
}

.dil-badge {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.5;
  white-space: nowrap;
}

.dil-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
}

.dil-icon-inline {
  vertical-align: -2px;
  margin-right: 3px;
}

.dil-divider {
  width: 100%;
  margin: 2px 0;
  border: 0;
  border-top: 1px solid #ececec;
}

.dil-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  padding: 6px 14px;
  border-radius: 999px;
  background: #0d0d0d;
  color: #ffffff;
  font-size: 13px;
  font-weight: 550;
  line-height: 1.4;
}

.dil-button-outline,
.dil-button-secondary,
.dil-button-ghost {
  border: 1px solid #d9d9d9;
  background: #ffffff;
  color: #0d0d0d;
}

.dil-button-block {
  width: 100%;
  justify-content: center;
}

.dil-button-disabled {
  opacity: .45;
}

.dil-pressable {
  border: 1px solid #ececec;
  border-radius: 12px;
  padding: 12px;
}

.dil-radio-group {
  display: flex;
  gap: 8px;
}

.dil-radio {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 13.5px;
}

.dil-radio-dot,
.dil-checkbox {
  flex: none;
  width: 15px;
  height: 15px;
  border: 1.5px solid #b4b4b4;
  border-radius: 999px;
}

.dil-checkbox {
  border-radius: 4px;
}

.dil-radio-dot-on,
.dil-checkbox-on {
  border-color: #0d0d0d;
  box-shadow: inset 0 0 0 3px #ffffff;
  background: #0d0d0d;
}

.dil-list {
  margin: 0;
  padding-left: 20px;
}

.dil-blockquote {
  margin: 0;
  padding: 2px 0 2px 14px;
  border-left: 3px solid #e3e3e3;
  color: #4d4d4d;
}

.dil-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
  line-height: 1.5;
}

.dil-table th,
.dil-table td {
  padding: 7px 10px;
  border-bottom: 1px solid #ececec;
  text-align: left;
  vertical-align: top;
}

.dil-table th {
  border-bottom-color: #d9d9d9;
  font-weight: 650;
}

.dil-inline-code {
  padding: 0.12em 0.36em;
  border-radius: 5px;
  background: #ececec;
  font-size: 0.86em;
}

.dil-cite-group {
  white-space: nowrap;
}

.dil-cite {
  display: inline-block;
  margin-left: 4px;
  padding: 0 7px;
  border-radius: 999px;
  background: #f0f0f0;
  color: #5d5d5d;
  font-size: 10px;
  line-height: 1.7;
  text-decoration: none;
  vertical-align: 1px;
}

.dil-entity {
  text-decoration: underline dotted #b4b4b4;
  text-underline-offset: 3px;
}

.dil-link {
  color: #0d0d0d;
  text-decoration-color: #b4b4b4;
}

.dil-file-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #1f6fd1;
  font-weight: 550;
}

.dil-image {
  display: flex;
  align-items: flex-end;
  width: 100%;
  min-height: 56px;
  padding: 8px;
  border-radius: 12px;
  background: #f4f4f4;
  overflow: hidden;
}

.dil-image-caption {
  color: #8f8f8f;
  font-size: 9.5px;
  line-height: 1.3;
}

.dil-writing {
  border: 1px solid #e3e3e3;
  border-radius: 14px;
  overflow: hidden;
}

.dil-writing-label,
.dil-code-label {
  padding: 6px 14px;
  border-bottom: 1px solid #f0f0f0;
  color: #8f8f8f;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .04em;
  text-transform: uppercase;
}

.dil-writing-body {
  padding: 10px 16px;
  white-space: pre-wrap;
}

.dil-writing-body p {
  margin: 0;
}

.dil-writing-body p + p {
  margin-top: 10px;
}

.dil-code {
  border: 1px solid #ececec;
  border-radius: 12px;
  background: #f9f9f9;
  overflow: hidden;
}

.dil-code pre {
  margin: 0;
  padding: 12px 14px;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 11.5px;
  white-space: pre-wrap;
}

.dil-math {
  font-family: "Times New Roman", serif;
  font-style: italic;
}

/* ==========================================================================
   Reading theme: ChatGPT-like single reading column.
   Later rules override the base component styles above.
   ========================================================================== */

@page {
  size: A4;
  margin: 56px 60px;
}

body {
  color: #0d0d0d;
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "Noto Sans CJK SC", "Hiragino Sans", "Yu Gothic", "Noto Sans JP", "Noto Sans CJK JP", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", "Noto Sans CJK KR", "Noto Sans", "Noto Sans Arabic", "Noto Sans Hebrew", Helvetica, Arial, sans-serif;
  font-size: 14px;
  line-height: 1.7;
  -webkit-font-smoothing: antialiased;
}

a {
  color: #0d0d0d;
  text-decoration-color: #b4b4b4;
}

/* Cover and prompt index */
.cover-card {
  margin: 0 0 28px;
  padding: 0 0 22px;
  border: 0;
  border-bottom: 1px solid #ececec;
  border-radius: 0;
  background: transparent;
}

.cover-eyebrow {
  margin-bottom: 8px;
  color: #8f8f8f;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.cover-card h1 {
  margin: 0 0 10px;
  font-size: 26px;
  line-height: 1.25;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.cover-card p {
  margin: 2px 0;
  color: #6b6b6b;
  font-size: 12px;
}

.cover-card .source a {
  color: #6b6b6b;
}

.meta-dot {
  margin: 0 6px;
  color: #b4b4b4;
}

.toc {
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.toc h2 {
  margin: 0 0 10px;
  color: #6b6b6b;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.toc-grid {
  column-count: 2;
  column-gap: 28px;
  column-fill: auto;
}

.toc-row {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: 6px;
  min-height: 0;
  padding: 2.5px 0;
  border-bottom: 0;
  color: #2f2f2f;
  font-size: 10.5px;
  line-height: 1.35;
}

.toc-row.assistant {
  color: #2f2f2f;
}

.toc-number {
  color: #a3a3a3;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

/* Conversation */
.conversation {
  padding-top: 0;
}

.turn-heading {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.message-meta {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #9b9b9b;
  font-size: 10px;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
}

.user-meta {
  justify-content: flex-end;
}

.message-meta .avatar,
.message-meta .assistant-avatar,
.message-meta .avatar img,
.message-meta .assistant-avatar img {
  width: 18px;
  height: 18px;
}

.message-meta .avatar,
.message-meta .assistant-avatar {
  flex: 0 0 18px;
  margin: 0;
  border: 0;
  background: transparent;
}

.meta-speaker {
  color: #6b6b6b;
  font-weight: 600;
}

.user-message {
  margin: 26px 0 14px;
}

.conversation > .user-message:first-child {
  margin-top: 0;
}

.user-stack {
  width: 100%;
  text-align: right;
}

.user-stack > * {
  margin-top: 6px;
}

.user-bubble {
  display: inline-block;
  max-width: 76%;
  padding: 9px 16px;
  border: 0;
  border-radius: 18px;
  background: #f4f4f4;
  color: #0d0d0d;
  text-align: left;
  box-shadow: none;
}

.user-bubble .markdown-body {
  font-size: 14px;
}

.user-meta {
  margin-top: 5px;
}

.user-attachments {
  width: min(400px, 76%);
  gap: 6px;
}

.attachment-thumb,
.attachment-card.with-thumb {
  border-radius: 14px;
}

.attachment-thumb {
  border: 1px solid #ececec;
}

.assistant-message {
  margin: 0 0 8px;
}

.assistant-meta {
  margin-bottom: 4px;
}

.assistant-content {
  min-width: 0;
}

/* Answer typography */
.markdown-body {
  font-size: 14px;
  line-height: 1.7;
}

.markdown-body p {
  margin: 0 0 10px;
}

.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4 {
  margin: 20px 0 8px;
  padding-top: 0;
  border-top: 0;
  color: #0d0d0d;
  font-weight: 650;
  line-height: 1.35;
  break-after: avoid;
}

.markdown-body h1 { font-size: 20px; }
.markdown-body h2 { font-size: 18px; }
.markdown-body h3 { font-size: 16px; }
.markdown-body h4 { font-size: 14px; }

.markdown-body > :first-child {
  margin-top: 0;
}

.markdown-body strong {
  font-weight: 650;
}

.markdown-body ul,
.markdown-body ol {
  margin: 0 0 10px;
  padding-left: 22px;
}

.markdown-body li {
  margin: 3px 0;
}

.markdown-body li > p {
  margin: 0;
}

.markdown-body hr {
  height: 0;
  margin: 18px 0;
  border: 0;
  border-top: 1px solid #ececec;
  background: none;
}

.markdown-body blockquote {
  margin: 10px 0;
  padding: 2px 0 2px 14px;
  border-left: 3px solid #e3e3e3;
  border-radius: 0;
  background: transparent;
  color: #4d4d4d;
  font-style: normal;
}

.markdown-body code {
  padding: 0.12em 0.36em;
  border-radius: 5px;
  background: #ececec;
  color: #0d0d0d;
  font-size: 0.86em;
}

.markdown-body table {
  width: 100%;
  margin: 12px 0 14px;
  border: 0;
  border-collapse: collapse;
  font-size: 12.5px;
  line-height: 1.5;
}

.markdown-body th,
.markdown-body td {
  padding: 7px 10px;
  border: 0;
  border-bottom: 1px solid #ececec;
  background: transparent;
  text-align: left;
  vertical-align: top;
}

.markdown-body th {
  border-bottom-color: #d9d9d9;
  font-weight: 650;
  background: transparent;
}

.markdown-body tr:nth-child(even) td {
  background: transparent;
}

.code-label {
  margin: 12px 0 0;
  padding: 6px 14px;
  border: 1px solid #ececec;
  border-bottom: 0;
  border-radius: 12px 12px 0 0;
  background: #f9f9f9;
  color: #6b6b6b;
  font-family: ui-sans-serif, -apple-system, "Segoe UI", sans-serif;
  font-size: 10px;
  font-weight: 600;
  text-transform: lowercase;
}

.markdown-body pre {
  margin: 12px 0 14px;
  padding: 12px 14px;
  border: 1px solid #ececec;
  border-radius: 12px;
  background: #f9f9f9;
}

.code-label + pre {
  margin-top: 0;
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}

.markdown-body pre code {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 11.5px;
  line-height: 1.6;
}

.writing-block {
  border-color: #e3e3e3;
  border-radius: 14px;
}

.writing-label {
  background: transparent;
  color: #8f8f8f;
}

.writing-body {
  padding: 6px 16px 2px;
}

.markdown-body .footnotes {
  margin-top: 12px;
  border-top-color: #ececec;
  color: #6b6b6b;
}

.markdown-body .footnote-ref a {
  color: #6b6b6b;
}

.markdown-body .footnote-sep {
  font-size: 0.72em;
  line-height: 0;
  color: #9b9b9b;
}

.thinking {
  margin: 4px 0 12px;
  padding: 2px 0 2px 14px;
  border: 0;
  border-left: 2px solid #e3e3e3;
  border-radius: 0;
  background: transparent;
  color: #6b6b6b;
  font-size: 12px;
}

.thinking h3 {
  margin: 0 0 4px;
  color: #8f8f8f;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.thinking .markdown-body {
  font-size: 12px;
  line-height: 1.6;
}
`;
}

function sanitizeFilename(value) {
  return cleanText(value)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 96) || "chatgpt-conversation";
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "turn";
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function loadPngDataUri(filename) {
  try {
    const bytes = fs.readFileSync(path.join(ASSET_DIR, filename));
    return `data:image/png;base64,${bytes.toString("base64")}`;
  } catch (_) {
    return "";
  }
}

function formatDateTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return cleanText(value);
  }

  return date.toLocaleString();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
