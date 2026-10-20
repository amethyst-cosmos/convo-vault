const SETTINGS_STORAGE_KEY = "convoVaultSettings";
const DEFAULT_SETTINGS = {
  backendRoot: "",
  port: 38474,
  cacheDir: "",
  browserPath: "",
  backendToken: ""
};

const exportButton = document.getElementById("exportButton");
const statusEl = document.getElementById("status");
const backendDot = document.getElementById("backendDot");
const backendStatus = document.getElementById("backendStatus");
const checkBackendButton = document.getElementById("checkBackendButton");
const copyStartButton = document.getElementById("copyStartButton");
const stopBackendButton = document.getElementById("stopBackendButton");
const backendRootInput = document.getElementById("backendRootInput");

let currentSettings = { ...DEFAULT_SETTINGS };

document.addEventListener("DOMContentLoaded", async () => {
  currentSettings = await loadSettings();
  if (!currentSettings.backendToken) {
    currentSettings = {
      ...currentSettings,
      backendToken: createLocalApiToken()
    };
    await saveSettings(currentSettings);
  }
  renderSettings(currentSettings);
  checkBackend();
});

exportButton.addEventListener("click", async () => {
  setBusy(true, "Opening selector...");

  try {
    await saveSettingsFromForm({ quiet: true });
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id || !isChatGptUrl(tab.url)) {
      throw new Error("Open a ChatGPT conversation tab first.");
    }

    const response = await sendOpenSelectorMessage(tab.id);

    if (!response?.ok) {
      throw new Error(response?.error || "Could not open the message selector.");
    }

    setStatus("Selector opened on the page.");
    window.close();
  } catch (error) {
    setStatus(error.message || String(error));
  } finally {
    setBusy(false);
  }
});

checkBackendButton.addEventListener("click", async () => {
  await saveSettingsFromForm({ quiet: true });
  checkBackend({ announce: true });
});

copyStartButton.addEventListener("click", async () => {
  try {
    await saveSettingsFromForm({ quiet: true });
    const command = buildStartCommand(currentSettings);

    await navigator.clipboard.writeText(command);
    setStatus("Start command copied. Paste it into your terminal.");
  } catch (error) {
    setStatus(error.message || String(error));
  }
});

stopBackendButton.addEventListener("click", async () => {
  setBackendBusy(true);
  setStatus("Stopping local renderer...");

  try {
    const response = await fetch(`${getRendererUrl()}/shutdown`, {
      method: "POST",
      headers: getLocalApiHeaders()
    });

    if (!response.ok) {
      throw new Error(`Stop failed (${response.status}).`);
    }

    setBackendState("stopped", "Local renderer stopped");
    setStatus("Local renderer stopped.");
  } catch (error) {
    setStatus(error.message || String(error));
    await checkBackend();
  } finally {
    setBackendBusy(false);
  }
});

async function checkBackend(options = {}) {
  setBackendState("checking", "Checking local renderer...");
  setBackendBusy(true);

  try {
    const response = await fetch(`${getRendererUrl()}/health`, {
      method: "GET",
      cache: "no-store",
      headers: getLocalApiHeaders()
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error("Local renderer needs the popup token. Copy a fresh start command and restart it.");
    }

    if (!response.ok) {
      throw new Error(`Health check failed (${response.status}).`);
    }

    const health = await response.json();
    const version = health.version ? ` v${health.version}` : "";
    const authLabel = health.authRequired === false ? " without token" : "";
    setBackendState("running", `Local renderer running${version}${authLabel}`);

    if (options.announce) {
      setStatus(health.authRequired === false
        ? "Local renderer is running without token. Copy Start will create a protected start command."
        : "Local renderer is running.");
    }
  } catch (error) {
    setBackendState("stopped", "Local renderer not running");

    if (options.announce) {
      setStatus(error.message || "Local renderer is not running. Copy the start command first.");
    }
  } finally {
    setBackendBusy(false);
  }
}

async function saveSettingsFromForm(options = {}) {
  const nextSettings = readSettingsFromForm();
  currentSettings = nextSettings;
  await saveSettings(nextSettings);

  if (!options.quiet) {
    setStatus("Settings saved.");
  }

  return nextSettings;
}

function readSettingsFromForm() {
  return {
    backendRoot: backendRootInput.value.trim(),
    port: DEFAULT_SETTINGS.port,
    cacheDir: DEFAULT_SETTINGS.cacheDir,
    browserPath: DEFAULT_SETTINGS.browserPath,
    backendToken: currentSettings.backendToken || createLocalApiToken()
  };
}

function renderSettings(settings) {
  backendRootInput.value = settings.backendRoot || "";
}

function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get([SETTINGS_STORAGE_KEY], (result) => {
      resolve(normalizeSettings(result?.[SETTINGS_STORAGE_KEY]));
    });
  });
}

function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.local.set({
      [SETTINGS_STORAGE_KEY]: normalizeSettings(settings)
    }, resolve);
  });
}

function normalizeSettings(settings = {}) {
  return {
    backendRoot: String(settings.backendRoot || "").trim(),
    port: DEFAULT_SETTINGS.port,
    cacheDir: DEFAULT_SETTINGS.cacheDir,
    browserPath: DEFAULT_SETTINGS.browserPath,
    backendToken: normalizeLocalApiToken(settings.backendToken)
  };
}

function getRendererUrl(settings = currentSettings) {
  const port = normalizeSettings(settings).port;
  return `http://127.0.0.1:${port}`;
}

function getLocalApiHeaders(settings = currentSettings) {
  const token = normalizeSettings(settings).backendToken;
  return token ? { "X-Convo-Vault-Token": token } : {};
}

function buildStartCommand(settings) {
  const normalized = normalizeSettings(settings);

  if (!normalized.backendRoot) {
    throw new Error("Set the Convo Vault folder first.");
  }

  if (!normalized.backendToken) {
    throw new Error("Local backend token is missing. Reopen the popup and try again.");
  }

  const args = [
    "node",
    "scripts/start-local-backend.mjs",
    "--detached"
  ];

  if (getPreferredShellKind() === "powershell") {
    const command = args
      .map((arg, index) => index < 4 ? arg : quotePowerShellSingle(arg))
      .join(" ");

    return `$env:CGCE_LOCAL_API_TOKEN=${quotePowerShellSingle(normalized.backendToken)}; Set-Location -LiteralPath ${quotePowerShellSingle(normalized.backendRoot)}; ${command}; Remove-Item Env:CGCE_LOCAL_API_TOKEN -ErrorAction SilentlyContinue`;
  }

  const command = args.map(quotePosixSingle).join(" ");
  return `cd ${quotePosixSingle(normalized.backendRoot)} && CGCE_LOCAL_API_TOKEN=${quotePosixSingle(normalized.backendToken)} ${command}`;
}

function normalizeLocalApiToken(value) {
  return String(value || "").trim();
}

function createLocalApiToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function quotePowerShellSingle(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function quotePosixSingle(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function getPreferredShellKind() {
  const platform = String(
    navigator.userAgentData?.platform ||
    navigator.platform ||
    ""
  ).toLowerCase();

  return platform.includes("win") ? "powershell" : "posix";
}

function setBackendState(state, label) {
  backendDot.classList.toggle("running", state === "running");
  backendDot.classList.toggle("stopped", state === "stopped");
  backendStatus.textContent = label;
  stopBackendButton.disabled = state !== "running";
}

function setBackendBusy(isBusy) {
  checkBackendButton.disabled = isBusy;
  copyStartButton.disabled = false;
  if (isBusy) {
    stopBackendButton.disabled = true;
  }
}

function isChatGptUrl(url = "") {
  try {
    const { hostname } = new URL(url);
    return hostname === "chatgpt.com" || hostname === "chat.openai.com";
  } catch {
    return false;
  }
}

async function sendOpenSelectorMessage(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, {
      type: "OPEN_CHATGPT_EXPORT_SELECTOR"
    });
  } catch (firstError) {
    // If the tab was already open before the extension was loaded, inject the
    // content script once and try again.
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });

    return chrome.tabs.sendMessage(tabId, {
      type: "OPEN_CHATGPT_EXPORT_SELECTOR"
    });
  }
}

function setBusy(isBusy, message) {
  exportButton.disabled = isBusy;
  if (message) {
    setStatus(message);
  }
}

function setStatus(message) {
  statusEl.textContent = message;
}
