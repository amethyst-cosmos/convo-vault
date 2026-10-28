import { promises as fs } from "node:fs";
import path from "node:path";

export const INCLUDE_FILES = {
  "constants": "constants.js",
  "selectors": "selectors.js",
  "capture-orchestrator": "capture-orchestrator.js",
  "capture-validation": "capture-validation.js",
  "message-snapshot": "message-snapshot.js",
  "date-format": "date-format.js",
  "dom-utils": "dom-utils.js",
  "page-utils": "page-utils.js",
  "text-utils": "text-utils.js",
  "auto-export": "auto-export.js",
  "bundle-export": "bundle-export.js",
  "chatgpt-files": "chatgpt-files.js",
  "debug-log": "debug-log.js",
  "agent-trace": "agent-trace.js",
  "capture-fast": "capture-fast.js",
  "capture-grok": "capture-grok.js",
  "provider": "provider.js",
  "message-discovery": "message-discovery.js",
  "chatgpt-dom": "chatgpt-dom.js",
  "chatgpt-markup": "chatgpt-markup.js",
  "conversation-manifest": "conversation-manifest.js",
  "conversation-list": "conversation-list.js",
  "dom-serializer": "dom-serializer.js"
};

/** Concatenates extension/content/index.js with its include fragments into one content script. */
export async function buildContentScript(repoRoot) {
  const srcDir = path.join(repoRoot, "extension", "content");
  const indexPath = path.join(srcDir, "index.js");
  const content = await fs.readFile(indexPath, "utf8");

  return replaceIncludes(content, srcDir);
}

async function replaceIncludes(content, srcDir) {
  const lines = content.split(/\r?\n/);
  const output = [];

  for (const line of lines) {
    const match = line.match(/^(\s*)\/\/ @convo-vault-include ([a-z0-9-]+)\s*$/i);

    if (!match) {
      output.push(line);
      continue;
    }

    const indent = match[1] || "";
    const includeName = match[2];
    const includeFile = INCLUDE_FILES[includeName];

    if (!includeFile) {
      throw new Error(`Unknown content include: ${includeName}`);
    }

    const includeContent = await fs.readFile(path.join(srcDir, includeFile), "utf8");
    output.push(...includeContent
      .replace(/\s+$/g, "")
      .split(/\r?\n/)
      .map((includeLine) => includeLine ? includeLine : ""));

    if (indent && !includeContent.startsWith(indent)) {
      // The include fragments are expected to carry their own indentation.
      // Keep this branch as a low-noise hook for future generated fragments.
    }
  }

  return `${output.join("\n").replace(/\s+$/g, "")}\n`;
}
