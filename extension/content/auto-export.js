  // Automatic export. A local program (the CLI or an agent skill) creates a job on
  // the local renderer and opens this conversation with #convo-vault-job=<id>. The
  // page then scans, validates and exports on its own and reports back, so nobody
  // has to open the selector or press a button. The integrity gate still applies.
  const AUTO_EXPORT_HASH_KEY = "convo-vault-job";
  const AUTO_EXPORT_STATUS_INTERVAL_MS = 1000;
  const startedAutoExportJobs = new Set();

  function readAutoExportJobId() {
    const hash = location.hash.replace(/^#/, "");
    const jobId = new URLSearchParams(hash).get(AUTO_EXPORT_HASH_KEY) || "";
    return /^[a-f0-9]{48}$/.test(jobId) ? jobId : "";
  }

  function removeAutoExportHash() {
    const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
    hash.delete(AUTO_EXPORT_HASH_KEY);
    const rest = hash.toString();
    history.replaceState(history.state, "", `${location.pathname}${location.search}${rest ? `#${rest}` : ""}`);
  }

  function sendAutoExportMessage(payload) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "CONVO_VAULT_JOB", ...payload }, (response) => {
          resolve(chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : response);
        });
      } catch (error) {
        resolve({ ok: false, error: error?.message || String(error) });
      }
    });
  }

  async function runAutoExportFromLocation() {
    const jobId = readAutoExportJobId();

    if (!jobId || startedAutoExportJobs.has(jobId)) {
      return;
    }

    startedAutoExportJobs.add(jobId);
    removeAutoExportHash();

    const claim = await sendAutoExportMessage({ action: "claim", jobId });

    if (!claim?.ok) {
      // Another browser already took the job, or the renderer is not running.
      console.warn(`[Convo Vault] Export job not started: ${claim?.error || "unknown error"}`);
      return;
    }

    if (claim.options?.ping) {
      await sendAutoExportMessage({ action: "status", jobId, state: "working", message: "Extension is installed and responding." });
      await sendAutoExportMessage({ action: "close-tab", jobId });
      return;
    }

    const captureMode = normalizeCaptureMode(claim.options?.captureMode);
    let lastStatusAt = 0;
    const report = (message, state = "working", options = {}) => {
      const now = Date.now();

      if (!options.force && now - lastStatusAt < AUTO_EXPORT_STATUS_INTERVAL_MS) {
        return Promise.resolve();
      }

      lastStatusAt = now;
      return sendAutoExportMessage({ action: "status", jobId, state, message });
    };

    try {
      await report(`Scanning with ${formatCaptureMode(captureMode)} capture...`, "working", { force: true });
      const capture = await messageExtractor.collect({ captureMode, onProgress: (message) => report(message) });
      const messages = capture?.messages || [];

      if (!messages.length) {
        throw new Error("The conversation has no messages to export.");
      }

      await report(`Captured ${messages.length} messages. Rendering the bundle...`, "working", { force: true });
      await exportSelectedMessages(messages, {
        captureMode: capture.captureMode,
        completeness: capture.completeness,
        allowIncomplete: claim.options?.allowIncomplete === true,
        jobId,
        skipPdf: claim.options?.pdf === false,
        onProgress: (message) => report(message)
      });

      if (claim.options?.closeTab !== false) {
        await sendAutoExportMessage({ action: "close-tab", jobId });
      }
    } catch (error) {
      await report(error?.message || String(error), "error", { force: true });
    }
  }

  window.addEventListener("hashchange", () => {
    void runAutoExportFromLocation();
  });
  void runAutoExportFromLocation();
