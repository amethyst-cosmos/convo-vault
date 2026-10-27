import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Chromium-family browsers that can load the extension, in the order tried.
const BROWSERS = [
  { name: "Google Chrome", mac: "Google Chrome", win: "chrome", linux: ["google-chrome", "google-chrome-stable"], scheme: "chrome" },
  { name: "Microsoft Edge", mac: "Microsoft Edge", win: "msedge", linux: ["microsoft-edge", "microsoft-edge-stable"], scheme: "edge" },
  { name: "Brave Browser", mac: "Brave Browser", win: "brave", linux: ["brave-browser"], scheme: "brave" },
  { name: "Arc", mac: "Arc", win: "", linux: [], scheme: "arc" },
  { name: "Chromium", mac: "Chromium", win: "", linux: ["chromium", "chromium-browser"], scheme: "chrome" }
];

export function findBrowser(query) {
  const needle = String(query || "").toLowerCase();
  return BROWSERS.find((browser) => browser.name.toLowerCase().includes(needle) || browser.scheme === needle) || null;
}

/** Installed browsers that can host the extension, in the order to try them. */
export function listInstalledBrowsers() {
  return BROWSERS.filter(isInstalled);
}

function isInstalled(browser) {
  if (process.platform === "darwin") {
    const bundle = `${browser.mac}.app`;
    return [path.join("/Applications", bundle), path.join(os.homedir(), "Applications", bundle)].some(existsSync);
  }

  if (process.platform === "win32") {
    return Boolean(browser.win) && spawnSync("where", [browser.win], { stdio: "ignore", shell: true }).status === 0
      || windowsExecutableCandidates(browser).some(existsSync);
  }

  return browser.linux.some((command) => spawnSync("which", [command], { stdio: "ignore" }).status === 0);
}

function windowsExecutableCandidates(browser) {
  const roots = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean);
  const relative = {
    "Google Chrome": "Google\\Chrome\\Application\\chrome.exe",
    "Microsoft Edge": "Microsoft\\Edge\\Application\\msedge.exe",
    "Brave Browser": "BraveSoftware\\Brave-Browser\\Application\\brave.exe"
  }[browser.name];
  return relative ? roots.map((root) => path.join(root, relative)) : [];
}

/**
 * Opens a URL in the given browser (or the system default when none is given).
 * background: true asks the system not to bring the browser to the front (macOS `open -g`),
 * for the tabs an export opens so they do not pull the user away from what they are doing.
 */
export function openInBrowser(url, browser, options = {}) {
  if (process.env.CONVO_VAULT_NO_OPEN) {
    process.stderr.write(`[convo-vault] (not opening a browser) ${url}\n`);
    return;
  }

  let command;
  let args;

  if (process.platform === "darwin") {
    command = "open";
    const background = options.background ? ["-g"] : [];
    args = browser ? [...background, "-a", browser.mac, url] : [...background, url];
  } else if (process.platform === "win32") {
    command = "cmd";
    args = browser?.win ? ["/c", "start", "", browser.win, url] : ["/c", "start", "", url];
  } else {
    command = browser ? browser.linux.find((candidate) => spawnSync("which", [candidate], { stdio: "ignore" }).status === 0) || "xdg-open" : "xdg-open";
    args = [url];
  }

  spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true }).unref();
}

export function extensionsPageUrl(browser) {
  return `${browser?.scheme || "chrome"}://extensions`;
}
