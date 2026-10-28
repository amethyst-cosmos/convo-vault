const fs = require("fs");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright-core");
const { cleanMarkdownForHtml, describeAttachmentOnlyMessage, formatTurnHeading, getMessageAnchorId, normalizeMessage, stripAttachmentOnlyLines, stripMarkdown } = require("./text.js");
const { getProvider } = require("./provider.js");

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

function buildPdfOutlineItems(messages, provider) {
  return messages
    .map((message, index) => {
      const normalized = normalizeMessage({ ...message, provider: getProvider(provider).id }, index);
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

module.exports = {
  addPdfOutlines,
  buildPdfOutlineItems,
  findChromeExecutable,
  renderPdfWithChrome
};
