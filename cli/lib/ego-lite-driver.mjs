// Runs inside `ego-browser nodejs` (see ego-lite.mjs). ego lite is a Chromium browser that lets
// local programs drive its pages, so the extension is not needed there: this driver injects the
// built content script into the chat page and runs the extension's own background.js in a Node
// sandbox. The two talk through a stand-in chrome.runtime that this driver relays, so the capture,
// the integrity gate and the renderer requests are the same code the extension runs.
import { promises as fs } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const JOB_HASH_KEY = "convo-vault-job";
const JOB_ID_RE = /^[a-f0-9]{48}$/;
const IDLE_POLL_MS = 250;
const MAX_DRAIN_CHARACTERS = 8 * 1024 * 1024;
const RUN_TIMEOUT_MS = 20 * 60_000;
// A job nobody claims (the page never ran the script) gives up after this long.
const CLAIM_TIMEOUT_MS = 60_000;

/**
 * Opens `url` (a chat page with #convo-vault-job=<ids>) in ego lite and runs its jobs.
 * Returns once every job is finished or failed, or the page asked to close.
 */
export async function runEgoLiteJobs({ taskSpace, url, repoRoot, rendererUrl, log = () => {} }) {
  const jobIds = readJobIds(url);
  const [contentScript, backgroundScript] = await Promise.all([
    fs.readFile(path.join(repoRoot, "dist", "convo-vault-extension", "content.js"), "utf8"),
    fs.readFile(path.join(repoRoot, "dist", "convo-vault-extension", "background.js"), "utf8")
  ]);

  const task = await taskSpace(`Convo Vault ${jobIds[0]?.slice(0, 8) || new Date().toISOString()}`);
  const page = task.page("p1");
  let closeRequested = false;

  try {
    await page.goto(url);
    await page.waitForLoadState();
    const pageUrl = await page.url();
    log(`Opened ${new URL(pageUrl).origin} in ego lite.`);

    const background = createBackground(backgroundScript, {
      pageUrl,
      onCloseTab: () => { closeRequested = true; }
    });

    // The chat app may drop the hash while it boots; the content script reads its jobs from it.
    const hash = JSON.stringify(`${JOB_HASH_KEY}=${jobIds.join(",")}`);
    await page.evaluate(`if (!location.hash.includes(${JSON.stringify(JOB_HASH_KEY)})) history.replaceState(history.state, "", location.pathname + location.search + "#" + ${hash}); true;`);
    await page.evaluate(`${PAGE_BRIDGE_SOURCE}\n(function (chrome) {\n${contentScript}\n}).call(window, window.__convoVaultBridge.chrome);\ntrue;`);

    const startedAt = Date.now();
    while (!closeRequested && Date.now() - startedAt < RUN_TIMEOUT_MS) {
      const outgoing = await page.evaluate((maxCharacters) => globalThis.__convoVaultBridge.drain(maxCharacters), MAX_DRAIN_CHARACTERS);
      for (const item of outgoing) await background.receive(item);

      const deliveries = background.takeDeliveries();
      if (deliveries.length) await page.evaluate((items) => globalThis.__convoVaultBridge.deliver(items), deliveries);

      if (!outgoing.length && !deliveries.length) {
        if (await allJobsSettled(rendererUrl, jobIds, startedAt) && !background.busy()) break;
        await sleep(IDLE_POLL_MS);
      }
    }
  } catch (error) {
    log(`Stopped: ${error?.message || error}`);
    throw error;
  } finally {
    // The page closes when the content script asks to (closeTab); a failed export or --keep-tab
    // keeps it open, like the extension keeps its tab.
    await task.finish({ keep: closeRequested ? [] : ["p1"] }).catch(() => {});
  }
}

function readJobIds(url) {
  const hash = new URL(url).hash.replace(/^#/, "");
  return (new URLSearchParams(hash).get(JOB_HASH_KEY) || "").split(",").filter((id) => JOB_ID_RE.test(id));
}

async function allJobsSettled(rendererUrl, jobIds, startedAt) {
  for (const jobId of jobIds) {
    const response = await fetch(`${rendererUrl}/jobs/${jobId}`).catch(() => null);
    const job = response?.ok ? await response.json().catch(() => null) : null;
    if (!job) continue;
    if (job.state === "waiting" && Date.now() - startedAt < CLAIM_TIMEOUT_MS) return false;
    if (job.state === "claimed" || job.state === "working") return false;
  }
  return true;
}

/**
 * Loads background.js into a sandbox with a chrome object that records what it sends back to the
 * page. Messages arrive from the page bridge as { kind, ... } items (see PAGE_BRIDGE_SOURCE).
 */
export function createBackground(source, { pageUrl, onCloseTab, fetchImpl = fetch }) {
  const messageListeners = [];
  const connectListeners = [];
  const storage = {};
  const ports = new Map();
  let deliveries = [];
  let pending = 0;

  const sender = { tab: { id: 1, url: pageUrl }, url: pageUrl };
  const chrome = {
    runtime: {
      lastError: undefined,
      onMessage: { addListener: (listener) => messageListeners.push(listener) },
      onConnect: { addListener: (listener) => connectListeners.push(listener) },
      // Nothing to reload: every run injects the current build.
      reload() {}
    },
    storage: {
      local: {
        get(_keys, callback) { callback(structuredClone(storage)); },
        set(items, callback) { Object.assign(storage, structuredClone(items)); callback?.(); }
      }
    },
    tabs: { remove() { onCloseTab?.(); } },
    downloads: {
      // Jobs hand their bundle to the CLI through the renderer; the browser never downloads it.
      download(_options, callback) {
        chrome.runtime.lastError = { message: "ego lite runs export jobs only." };
        callback(undefined);
        chrome.runtime.lastError = undefined;
      }
    }
  };

  const context = vm.createContext({
    chrome,
    fetch: fetchImpl,
    Blob,
    URL,
    TextEncoder,
    AbortController,
    crypto: globalThis.crypto,
    atob,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval
  });
  vm.runInContext(source, context, { filename: "background.js" });

  function makeEvent() {
    const listeners = new Set();
    return {
      addListener: (listener) => listeners.add(listener),
      removeListener: (listener) => listeners.delete(listener),
      emit: (...args) => { for (const listener of [...listeners]) listener(...args); }
    };
  }

  function track(promise) {
    pending += 1;
    return Promise.resolve(promise).finally(() => { pending -= 1; });
  }

  async function receive(item) {
    if (item?.kind === "message") {
      const response = await track(new Promise((resolve) => {
        let answered = false;
        const sendResponse = (value) => {
          if (!answered) {
            answered = true;
            resolve(value);
          }
        };
        const keepsChannel = messageListeners.map((listener) => listener(item.message, sender, sendResponse)).some((result) => result === true);
        if (!keepsChannel) sendResponse(undefined);
      }));
      deliveries.push({ kind: "response", id: item.id, response });
      return;
    }

    if (item?.kind === "connect") {
      const onMessage = makeEvent();
      const onDisconnect = makeEvent();
      let open = true;
      const port = {
        name: item.name,
        sender,
        onMessage,
        onDisconnect,
        postMessage(message) {
          if (!open) throw new Error("Attempting to use a disconnected port object");
          deliveries.push({ kind: "port-message", port: item.port, message });
        },
        disconnect() {
          if (!open) return;
          open = false;
          ports.delete(item.port);
          deliveries.push({ kind: "port-disconnect", port: item.port });
        }
      };
      ports.set(item.port, { port, onMessage, onDisconnect, close: () => { open = false; } });
      for (const listener of connectListeners) listener(port);
      return;
    }

    const entry = ports.get(item?.port);
    if (!entry) return;

    if (item.kind === "port-message") {
      entry.onMessage.emit(item.message);
    } else if (item.kind === "port-disconnect") {
      ports.delete(item.port);
      entry.close();
      entry.onDisconnect.emit();
    }
  }

  return {
    receive,
    takeDeliveries() {
      const taken = deliveries;
      deliveries = [];
      return taken;
    },
    // Work still running in background.js, such as a bundle render: its reply is not sent yet.
    busy: () => pending > 0 || ports.size > 0,
    storage
  };
}

// Defines window.__convoVaultBridge in the chat page: a chrome.runtime stand-in whose messages wait
// in an outbox until the driver drains them, and whose replies the driver delivers.
export const PAGE_BRIDGE_SOURCE = `window.__convoVaultBridge = window.__convoVaultBridge || (() => {
  const outbox = [];
  const callbacks = new Map();
  const ports = new Map();
  let nextId = 1;

  const makeEvent = () => {
    const listeners = new Set();
    return {
      addListener: (listener) => listeners.add(listener),
      removeListener: (listener) => listeners.delete(listener),
      emit: (...args) => { for (const listener of [...listeners]) listener(...args); }
    };
  };

  const chrome = {
    runtime: {
      lastError: undefined,
      sendMessage(message, callback) {
        const id = nextId++;
        if (typeof callback === "function") callbacks.set(id, callback);
        outbox.push({ kind: "message", id, message });
      },
      connect({ name } = {}) {
        const id = nextId++;
        const onMessage = makeEvent();
        const onDisconnect = makeEvent();
        let open = true;
        const port = {
          name,
          onMessage,
          onDisconnect,
          postMessage(message) {
            if (!open) throw new Error("Attempting to use a disconnected port object");
            outbox.push({ kind: "port-message", port: id, message });
          },
          disconnect() {
            if (!open) return;
            open = false;
            ports.delete(id);
            outbox.push({ kind: "port-disconnect", port: id });
          }
        };
        ports.set(id, { onMessage, onDisconnect, close: () => { open = false; } });
        outbox.push({ kind: "connect", port: id, name });
        return port;
      }
    }
  };

  return {
    chrome,
    drain(maxCharacters) {
      // Bounded, so a large export body crosses over in several rounds.
      const taken = [];
      let size = 0;
      while (outbox.length) {
        const itemSize = JSON.stringify(outbox[0]).length;
        if (taken.length && size + itemSize > maxCharacters) break;
        size += itemSize;
        taken.push(outbox.shift());
      }
      return taken;
    },
    deliver(items) {
      for (const item of items) {
        if (item.kind === "response") {
          const callback = callbacks.get(item.id);
          callbacks.delete(item.id);
          callback?.(item.response);
        } else if (item.kind === "port-message") {
          ports.get(item.port)?.onMessage.emit(item.message);
        } else if (item.kind === "port-disconnect") {
          const entry = ports.get(item.port);
          ports.delete(item.port);
          entry?.close();
          entry?.onDisconnect.emit();
        }
      }
    }
  };
})();`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
