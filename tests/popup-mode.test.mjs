import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";

const repoRoot = path.resolve(import.meta.dirname, "..");

function createElement() {
  const listeners = {};
  return {
    listeners,
    hidden: false,
    checked: false,
    disabled: false,
    value: "",
    textContent: "",
    classList: { toggle() {} },
    addEventListener(type, handler) {
      listeners[type] = handler;
    }
  };
}

async function openPopup(storedSettings) {
  const source = await readFile(path.join(repoRoot, "extension", "popup", "popup.js"), "utf8");
  const elements = new Map();
  const documentListeners = {};
  const storage = storedSettings === undefined ? {} : { convoVaultSettings: storedSettings };
  const fetchCalls = [];

  const context = vm.createContext({
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, createElement());
        return elements.get(id);
      },
      addEventListener(type, handler) {
        documentListeners[type] = handler;
      }
    },
    chrome: {
      storage: {
        local: {
          get(_keys, callback) {
            callback({ ...storage });
          },
          set(values, callback) {
            Object.assign(storage, values);
            callback?.();
          }
        }
      }
    },
    navigator: { platform: "MacIntel" },
    crypto: globalThis.crypto,
    fetch: async (url) => {
      fetchCalls.push(String(url));
      throw new Error("renderer not running");
    },
    URL
  });

  vm.runInContext(source, context);
  await documentListeners.DOMContentLoaded();
  return { elements, storage, fetchCalls };
}

test("the popup hides the manual controls by default and leaves exports to the agent", async () => {
  const { elements, storage, fetchCalls } = await openPopup();

  assert.equal(elements.get("manualControls").hidden, true);
  assert.equal(elements.get("manualToggle").checked, false);
  assert.match(elements.get("modeHint").textContent, /agent/i);
  assert.equal(fetchCalls.length, 0, "no renderer check while the manual controls are hidden");
  assert.equal(storage.convoVaultSettings.manualControls, false);
  assert.ok(storage.convoVaultSettings.backendToken, "the local token is still created");
});

test("turning on manual controls shows them, checks the renderer and remembers the choice", async () => {
  const { elements, storage, fetchCalls } = await openPopup();
  const toggle = elements.get("manualToggle");

  toggle.checked = true;
  await toggle.listeners.change();

  assert.equal(elements.get("manualControls").hidden, false);
  assert.equal(storage.convoVaultSettings.manualControls, true);
  assert.ok(fetchCalls.some((url) => url.endsWith("/health")));

  toggle.checked = false;
  await toggle.listeners.change();

  assert.equal(elements.get("manualControls").hidden, true);
  assert.equal(storage.convoVaultSettings.manualControls, false);
});

test("a saved manual choice is restored, and the token the renderer handed out survives it", async () => {
  const { elements, storage, fetchCalls } = await openPopup({ backendToken: "from-renderer", manualControls: true });

  assert.equal(elements.get("manualControls").hidden, false);
  assert.equal(elements.get("manualToggle").checked, true);
  assert.ok(fetchCalls.some((url) => url.endsWith("/health")));
  assert.equal(storage.convoVaultSettings.backendToken, "from-renderer");
  assert.equal(storage.convoVaultSettings.manualControls, true);
});
