import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");
const outputDir = path.join(repoRoot, "tmp", "tests", "pdf-pagination");
const chromePath = [
  process.env.CGCE_RENDER_BROWSER_PATH,
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium"
].filter(Boolean).find((candidate) => existsSync(candidate));

// Answers of varied length, a thinking quote taller than half a page, and a
// card that must not split, so the conversation crosses many page boundaries.
function buildPayload() {
  const messages = [];
  const lengths = [3, 28, 9, 41, 6, 17, 33, 4, 22, 12];
  lengths.forEach((paragraphs, index) => {
    messages.push({ id: `u${index}`, role: "user", turnNumber: index * 2 + 1, markdown: `Question ${index + 1}: ${"please explain the plan in detail. ".repeat(3 + (index % 4) * 4)}` });
    const body = Array.from({ length: paragraphs }, (_, line) => `Paragraph ${line + 1} of answer ${index + 1}. ${"The local model handles prompts and translation. ".repeat(2)}`);
    if (index === 3) body.splice(4, 0, "| Model | Memory |\n| --- | --- |\n| 27B | 18GB |\n| 9B | 7GB |");
    messages.push({
      id: `a${index}`,
      role: "assistant",
      turnNumber: index * 2 + 2,
      markdown: body.join("\n\n"),
      thinkingMarkdown: index === 1 ? Array.from({ length: 40 }, (_, line) => `> - Step ${line + 1}: checking the next source and comparing results.`).join("\n") : ""
    });
  });
  return { title: "Pagination regression", exportedAt: "2026-10-15T00:00:00.000Z", messages };
}

test("PDF page breaks keep answer meta with its content and move cramped prompts to a new page", { skip: !chromePath && "Chrome not found" }, async () => {
  const { chromium } = require("../tools/advanced-pdf/node_modules/playwright-core");
  const payloadPath = path.join(outputDir, "payload.json");
  const htmlPath = path.join(outputDir, "pagination.html");

  await mkdir(outputDir, { recursive: true });
  await writeFile(payloadPath, JSON.stringify(buildPayload()), "utf8");
  await execFileAsync(process.execPath, [path.join(repoRoot, "tools", "advanced-pdf", "render.js"), payloadPath, "--html", htmlPath, "--html-only"], { cwd: repoRoot });

  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 674, height: 1011 } });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
    await page.emulateMedia({ media: "print" });
    const result = await page.evaluate(() => {
      window.applyConversationPageBreaks();
      const conversation = document.querySelector(".conversation");
      document.documentElement.classList.add("paginating");
      const origin = conversation.getBoundingClientRect();
      const locate = (rect) => ({ page: Math.round((rect.left - origin.left) / 674), top: rect.top - origin.top, bottom: rect.bottom - origin.top });
      const fragments = (element) => Array.from(element.getClientRects()).filter((rect) => rect.height > 0).map(locate);
      const messages = Array.from(conversation.querySelectorAll(":scope > .message"));
      const report = messages.map((message, index) => {
        const meta = message.querySelector(".message-meta");
        const firstText = Array.from(message.querySelectorAll(".thinking li, .markdown-body > p")).find((element) => element.getClientRects().length);
        const previous = messages[index - 1];
        return {
          role: message.classList.contains("user-message") ? "user" : "assistant",
          forced: message.classList.contains("force-page-before"),
          start: fragments(message)[0],
          metaPage: meta ? locate(meta.getClientRects()[0]).page : null,
          contentPage: firstText ? locate(firstText.getClientRects()[0]).page : null,
          previousEnd: previous ? fragments(previous).pop() : null
        };
      });
      document.documentElement.classList.remove("paginating");
      return { report, released: Array.from(document.querySelectorAll(".break-released"), (element) => element.tagName) };
    });

    // The 40-line thinking quote is taller than the unbreakable-block limit.
    assert.ok(result.released.includes("BLOCKQUOTE"));
    assert.ok(result.report.some((entry) => entry.forced), "expected at least one forced page break");

    for (const entry of result.report) {
      if (entry.role === "assistant") {
        assert.equal(entry.metaPage, entry.contentPage, "answer meta row must share a page with the first content line");
      } else if (entry.previousEnd) {
        if (entry.forced) {
          // Only the prompt's own top margin (kept after a forced break) precedes it.
          assert.ok(entry.start.top <= 30, "a forced prompt starts at the top of its page");
        } else {
          assert.equal(entry.start.page, entry.previousEnd.page, "an unforced prompt continues on the page where the answer ended");
          assert.ok(1011 - entry.previousEnd.bottom >= 1011 * 0.25, "an unforced prompt never starts in the last quarter of a page");
        }
      }
    }
  } finally {
    await browser.close();
  }
});
