  // Automatic export. A local program (the CLI or an agent skill) creates jobs on the
  // local renderer and opens a ChatGPT page with #convo-vault-job=<id>[,<id>...]. The page
  // claims each job in turn, exports (or lists) on its own and reports back, so nobody has
  // to open the selector or press a button. A batch of conversations runs in ONE tab: each
  // job names the conversation it wants, so the tab is not reopened per conversation. The
  // integrity gate still applies to every export.
  const AUTO_EXPORT_HASH_KEY = "convo-vault-job";
  const AUTO_EXPORT_STATUS_INTERVAL_MS = 1000;
  const AUTO_EXPORT_JOB_ID_RE = /^[a-f0-9]{48}$/;
  const startedAutoExportJobs = new Set();

  function readAutoExportJobIds() {
    const hash = location.hash.replace(/^#/, "");
    const value = new URLSearchParams(hash).get(AUTO_EXPORT_HASH_KEY) || "";
    return value.split(",").filter((jobId) => AUTO_EXPORT_JOB_ID_RE.test(jobId));
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
    const jobIds = readAutoExportJobIds().filter((jobId) => !startedAutoExportJobs.has(jobId));

    if (!jobIds.length) {
      return;
    }

    for (const jobId of jobIds) {
      startedAutoExportJobs.add(jobId);
    }
    removeAutoExportHash();

    // One tab, one job after another. The last job decides whether the tab closes.
    let closeTab = false;
    for (const jobId of jobIds) {
      closeTab = await runAutoExportJob(jobId);
    }

    if (closeTab) {
      await sendAutoExportMessage({ action: "close-tab", jobId: jobIds[jobIds.length - 1] });
    }
  }

  // Runs one job. Returns true when the tab should close once the whole run is over.
  async function runAutoExportJob(jobId) {
    const claim = await sendAutoExportMessage({ action: "claim", jobId });

    if (!claim?.ok) {
      // Another browser already took the job, or the renderer is not running.
      console.warn(`[Convo Vault] Export job not started: ${claim?.error || "unknown error"}`);
      return false;
    }

    if (claim.options?.reload) {
      await sendAutoExportMessage({ action: "status", jobId, state: "working", message: "Reloading the extension." });
      await sendAutoExportMessage({ action: "close-tab", jobId });
      await sendAutoExportMessage({ action: "reload-extension", jobId });
      return false;
    }

    if (claim.options?.ping) {
      await sendAutoExportMessage({ action: "status", jobId, state: "working", message: `Extension ${EXPORTER_VERSION} is installed and responding.` });
      return claim.options?.closeTab !== false;
    }

    let lastStatusAt = 0;
    const report = (message, state = "working", options = {}) => {
      const now = Date.now();

      if (!options.force && now - lastStatusAt < AUTO_EXPORT_STATUS_INTERVAL_MS) {
        return Promise.resolve();
      }

      lastStatusAt = now;
      return sendAutoExportMessage({ action: "status", jobId, state, message });
    };

    if (claim.options?.list) {
      try {
        await report("Listing conversations...", "working", { force: true });
        const data = await listConversations(claim.options.list);
        const done = await sendAutoExportMessage({
          action: "result",
          jobId,
          data,
          message: `Listed ${data.conversations.length} conversation(s).`
        });
        if (!done?.ok) {
          await report(done?.error || "The list could not be sent to the local renderer.", "error", { force: true });
        }
      } catch (error) {
        await report(error?.message || String(error), "error", { force: true });
        return false;
      }
      return claim.options?.closeTab !== false;
    }

    try {
      setActiveExportContext(claim.options?.conversationId ? { conversationId: claim.options.conversationId } : null);
      await report("Reading the conversation from ChatGPT...", "working", { force: true });
      await exportCurrentConversation({
        jobId,
        allowIncomplete: claim.options?.allowIncomplete === true,
        skipPdf: claim.options?.pdf === false,
        downloadFiles: claim.options?.files === true,
        onProgress: (message) => report(message)
      });
      return claim.options?.closeTab !== false;
    } catch (error) {
      await report(error?.message || String(error), "error", { force: true });
      // The tab stays open for a failed single export (to look at); a batch carries on with the next job.
      return false;
    } finally {
      setActiveExportContext(null);
    }
  }

  window.addEventListener("hashchange", () => {
    void runAutoExportFromLocation();
  });
  void runAutoExportFromLocation();
