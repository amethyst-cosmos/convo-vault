#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { buildDocumentHtml } = require("./lib/document.js");
const { cleanText, sanitizeFilename } = require("./lib/util.js");
const { addPdfOutlines, buildPdfOutlineItems, findChromeExecutable, renderPdfWithChrome } = require("./lib/pdf.js");

const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), "output", "pdf");
const DEFAULT_HTML_DIR = path.resolve(process.cwd(), "tmp", "renderer");

main().catch((error) => {
  console.error(`[renderer] ${error.stack || error.message || error}`);
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
    console.log(`[renderer] HTML written: ${htmlPath}`);
    return;
  }

  await renderPdfWithChrome({
    htmlPath,
    outputPath,
    chromePath: args.chrome || findChromeExecutable()
  });

  const outlineResult = addPdfOutlines(outputPath, buildPdfOutlineItems(payload.messages));
  const sizeMb = fs.statSync(outputPath).size / 1024 / 1024;
  console.log(`[renderer] PDF written: ${outputPath} (${sizeMb.toFixed(2)} MB)`);
  if (outlineResult.count) {
    console.log(`[renderer] PDF bookmarks: ${outlineResult.count}`);
  } else if (outlineResult.warning) {
    console.warn(`[renderer] PDF bookmarks skipped: ${outlineResult.warning}`);
  }
  console.log(`[renderer] HTML source: ${htmlPath}`);
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
  node renderer/render.js <export-debug-or-payload.json> [--out output.pdf] [--html output.html]

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
