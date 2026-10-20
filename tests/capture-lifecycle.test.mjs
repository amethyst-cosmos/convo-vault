import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildContentScript } from "../scripts/lib/content-build.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const source = await buildContentScript(repoRoot);

test("capture mode defaults to Fast", () => {
  const context = loadFunctions(["normalizeCaptureMode"]);

  assert.equal(context.normalizeCaptureMode(), "fast");
  assert.equal(context.normalizeCaptureMode("unknown"), "fast");
  assert.equal(context.normalizeCaptureMode("full"), "full");
});

function loadFunctions(names) {
  const context = { AbortController, Object, Error, Date, String };
  vm.createContext(context);
  const declarations = names.map(extractFunction).join("\n");
  vm.runInContext(`${declarations}\n${names.map((name) => `this.${name} = ${name};`).join("\n")}`, context);
  return context;
}

function extractFunction(name) {
  const marker = `  function ${name}(`;
  const start = source.indexOf(marker);

  if (start < 0) {
    throw new Error(`Function not found: ${name}`);
  }

  const signatureEnd = source.indexOf(")", start);
  const bodyStart = source.indexOf("{", signatureEnd);
  let depth = 0;
  let quote = "";
  let escaped = false;

  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }

    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }

    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;

    if (depth === 0) {
      return source.slice(start, index + 1).trim();
    }
  }

  throw new Error(`Function was not closed: ${name}`);
}
