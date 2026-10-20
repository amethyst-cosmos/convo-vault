  function createMessageSelectorUI() {
    const hostId = "chatgpt-exporter-selector-host";
    let host = null;
    let shadow = null;
    let messages = [];
    let selectedIds = new Set();
    let api = null;
    let panelPhase = "idle";
    const captureJobs = createCaptureJobManager();

    return {
      open(nextApi) {
        api = nextApi;
        ensurePanel();
        const activeJob = captureJobs.getActiveJob();
        const loadedSnapshot = captureJobs.getLoadedSnapshot();

        if (activeJob) {
          setPanelPhase("scanning", `Scanning with ${formatCaptureMode(activeJob.captureMode)}...`);
        } else if (loadedSnapshot) {
          setPanelPhase(loadedSnapshot.completeness?.complete ? "ready" : "incomplete");
        } else {
          renderMessageList();
          renderCompletenessReport(null);
          setPanelPhase("idle", "Choose a mode, then click Start Scan. Opening the selector does not scan.");
        }

        return { ok: true, panelOpen: true };
      }
    };

    function ensurePanel() {
      host = document.getElementById(hostId);

      if (!host) {
        host = document.createElement("div");
        host.id = hostId;
        document.documentElement.append(host);
        shadow = host.attachShadow({ mode: "open" });
        shadow.innerHTML = getSelectorPanelMarkup();
        bindPanelEvents();
      } else {
        shadow = host.shadowRoot;
      }

      host.style.display = "block";
    }

    function bindPanelEvents() {
      shadow.querySelector("[data-action='close']").addEventListener("click", () => {
        cancelActiveScan("Capture cancelled because the selector was closed.");
        host.style.display = "none";
      });
      shadow.querySelector("[data-action='start-scan']").addEventListener("click", () => {
        startScan();
      });
      shadow.querySelector("[data-action='cancel-scan']").addEventListener("click", () => {
        cancelActiveScan("Capture cancelled by the user.");
      });
      shadow.querySelector("[data-action='select-all']").addEventListener("click", () => {
        selectedIds = new Set(messages.map((message) => message.id));
        syncCheckboxes();
      });
      shadow.querySelector("[data-action='select-users']").addEventListener("click", () => {
        selectedIds = new Set(messages.filter((message) => message.role === "user").map((message) => message.id));
        syncCheckboxes();
      });
      shadow.querySelector("[data-action='select-assistants']").addEventListener("click", () => {
        selectedIds = new Set(messages.filter((message) => message.role === "assistant").map((message) => message.id));
        syncCheckboxes();
      });
      shadow.querySelector("[data-action='invert']").addEventListener("click", () => {
        selectedIds = new Set(messages.filter((message) => !selectedIds.has(message.id)).map((message) => message.id));
        syncCheckboxes();
      });
      shadow.querySelector("[data-action='export']").addEventListener("click", () => {
        exportCheckedMessages();
      });
      shadow.querySelector("[data-option='capture-mode']").addEventListener("change", () => {
        cancelActiveScan("Capture cancelled because the mode changed.");
        captureJobs.clearSnapshot();
        messages = [];
        selectedIds = new Set();
        resetIncompleteOverride();
        renderMessageList();
        renderCompletenessReport(null);
        updateExportButtonLabel();
        setPanelPhase("idle", `Mode set to ${formatCaptureMode(getSelectedCaptureMode())}. Click Start Scan.`);
      });
      shadow.querySelector("[data-option='allow-incomplete']").addEventListener("change", () => {
        updateExportAvailability();
      });
      shadow.querySelector(".cgce-list").addEventListener("change", (event) => {
        const checkbox = event.target.closest("input[type='checkbox'][data-message-id]");

        if (!checkbox) {
          return;
        }

        if (checkbox.checked) {
          selectedIds.add(checkbox.dataset.messageId);
        } else {
          selectedIds.delete(checkbox.dataset.messageId);
        }

        updateSelectionSummary();
      });
      shadow.querySelector(".cgce-list").addEventListener("dblclick", (event) => {
        const row = event.target.closest(".cgce-message[data-message-id]");

        if (!row) {
          return;
        }

        const message = messages.find((candidate) => candidate.id === row.dataset.messageId);
        scrollToMessage(message);
      });
    }

    function renderMessageList() {
      const list = shadow.querySelector(".cgce-list");

      if (!messages.length) {
        list.innerHTML = '<div class="cgce-empty">No scan loaded. Choose a mode and click Start Scan.</div>';
        return;
      }

      list.innerHTML = "";

      for (const message of messages) {
        list.append(createMessageRow(message));
      }
    }

    async function startScan() {
      if (!api) {
        setPanelStatus("The capture service is not ready.", true);
        return;
      }

      const job = captureJobs.start(getSelectedCaptureMode());
      messages = [];
      selectedIds = new Set();
      resetIncompleteOverride();
      renderMessageList();
      renderCompletenessReport(null);
      setPanelPhase("scanning", `Starting one ${formatCaptureMode(job.captureMode)} capture job...`);

      try {
        const result = await api.loadMessages((message) => {
          if (captureJobs.isCurrent(job)) {
            setPanelStatus(message);
          }
        }, {
          captureMode: job.captureMode,
          signal: job.signal
        });

        if (!captureJobs.isCurrent(job)) {
          return;
        }

        setPanelPhase("validating", "Validating conversation structure and media coverage...");
        throwIfCaptureCancelled(job.signal);
        const completeness = result?.completeness || buildCaptureCompletenessReport(result?.messages || result, {
          captureMode: job.captureMode,
          reconciliationReport: result?.reconciliationReport || null
        });
        const snapshot = captureJobs.commit(job, {
          ...result,
          messages: result?.messages || result,
          completeness
        });
        messages = [...snapshot.messages];
        selectedIds = new Set(messages.map((message) => message.id));
        renderMessageList();
        renderCompletenessReport(snapshot.completeness);
        updateSelectionSummary();

        if (snapshot.completeness?.complete) {
          setPanelPhase("ready", `Ready. ${messages.length} messages validated with ${formatCaptureMode(snapshot.captureMode)}.`);
        } else {
          setPanelPhase("incomplete", formatIncompleteCaptureStatus(snapshot.completeness), true);
        }
      } catch (error) {
        const isCurrent = captureJobs.isCurrent(job);
        captureJobs.fail(job);

        if (isCaptureCancelledError(error) || job.signal.aborted || !isCurrent) {
          return;
        }

        messages = [];
        selectedIds = new Set();
        renderMessageList();
        renderCompletenessReport(null);
        setPanelPhase("idle", error.message || String(error), true);
      }
    }

    function cancelActiveScan(reason) {
      const cancelledJob = captureJobs.cancel(reason);

      if (!cancelledJob) {
        return false;
      }

      messages = [];
      selectedIds = new Set();
      captureJobs.clearSnapshot();
      resetIncompleteOverride();
      renderMessageList();
      renderCompletenessReport(null);
      setPanelPhase("cancelled", reason);
      return true;
    }

    function createMessageRow(message) {
      const label = document.createElement("label");
      label.className = `cgce-message cgce-message-${sanitizeCssClass(message.role)}`;
      label.dataset.messageId = message.id;
      label.title = "Double-click to jump to this message";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selectedIds.has(message.id);
      checkbox.dataset.messageId = message.id;

      const content = document.createElement("span");
      content.className = "cgce-message-content";

      const meta = document.createElement("span");
      meta.className = "cgce-message-meta";

      const role = document.createElement("span");
      role.className = "cgce-role";
      role.textContent = formatRole(message.role);

      const stats = document.createElement("span");
      stats.className = "cgce-stats";
      stats.textContent = getMessageStats(message);

      meta.append(role, stats);

      const preview = document.createElement("span");
      preview.className = "cgce-preview";
      preview.textContent = message.preview || messageExtractor.preview(message);

      content.append(meta, preview);
      label.append(checkbox, content);
      return label;
    }

    function scrollToMessage(message) {
      const node = resolveMessageNode(message);

      if (!node?.isConnected) {
        setPanelStatus("That message is not currently mounted in the page. Run the scan again if you need to jump to it.", true);
        return;
      }

      node.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest"
      });
      highlightMessageNode(node);
      setPanelStatus(`Jumped to ${formatRole(message.role)} message.`);
    }

    function resolveMessageNode(message) {
      if (message?.sourceNode?.isConnected) {
        return message.sourceNode;
      }

      if (message?.sourceTurnId) {
        const byTurnId = document.querySelector(`[data-turn-id="${cssString(message.sourceTurnId)}"]`);

        if (byTurnId) {
          return normalizeMessageNode(byTurnId) || byTurnId;
        }
      }

      if (message?.sourceMessageId) {
        const byMessageId = document.querySelector(`[data-message-id="${cssString(message.sourceMessageId)}"]`);

        if (byMessageId) {
          return normalizeMessageNode(byMessageId) || byMessageId;
        }
      }

      if (message?.sourceTestId) {
        return document.querySelector(`[data-testid="${cssString(message.sourceTestId)}"]`);
      }

      return null;
    }

    function syncCheckboxes() {
      for (const checkbox of shadow.querySelectorAll("input[type='checkbox'][data-message-id]")) {
        checkbox.checked = selectedIds.has(checkbox.dataset.messageId);
      }

      updateSelectionSummary();
    }

    function updateSelectionSummary() {
      const selected = messages.filter((message) => selectedIds.has(message.id));
      const userCount = selected.filter((message) => message.role === "user").length;
      const assistantCount = selected.filter((message) => message.role === "assistant").length;

      setPanelStatus(`${selected.length}/${messages.length} selected. ${userCount} user, ${assistantCount} assistant.`);
      updateExportButtonLabel();
      updateExportAvailability();
    }

    function getSelectedMessages() {
      return messages.filter((message) => selectedIds.has(message.id));
    }

    function getSelectedCaptureMode() {
      return normalizeCaptureMode(shadow.querySelector("[data-option='capture-mode']")?.value);
    }

    function exportCheckedMessages() {
      const selected = getSelectedMessages();
      const snapshot = captureJobs.getLoadedSnapshot();

      if (!selected.length) {
        setPanelStatus("Select at least one message first.", true);
        return;
      }

      if (!snapshot) {
        setPanelStatus("Run and validate a scan before exporting.", true);
        return;
      }

      if (!snapshot.completeness?.complete && !allowsIncompleteExport()) {
        setPanelStatus("This capture is incomplete. Review the missing coverage and explicitly enable the override to export it.", true);
        return;
      }

      runExport(selected, {
        format: "bundle",
        captureMode: snapshot.captureMode,
        completeness: snapshot.completeness,
        allowIncomplete: allowsIncompleteExport(),
        debugLog: shouldDownloadDebugLog() ? snapshot.debugLog : null
      });
    }

    async function runExport(selected, options) {
      try {
        const busyLabel = options.format === "bundle"
          ? "Generating export bundle..."
          : "Exporting selected messages...";
        setPanelPhase("exporting", busyLabel);
        const result = await api.exportMessages(selected, {
          ...options,
          onProgress: (message) => setPanelStatus(message)
        });
        const snapshot = captureJobs.getLoadedSnapshot();
        setPanelPhase(snapshot?.completeness?.complete ? "ready" : "incomplete", formatExportResult(result));
      } catch (error) {
        const snapshot = captureJobs.getLoadedSnapshot();
        setPanelPhase(snapshot?.completeness?.complete ? "ready" : snapshot ? "incomplete" : "idle", error.message || String(error), true);
      }
    }

    function formatExportResult(result) {
      const imageSummary = result.imagesEmbedded || result.imagesFailed
        ? `, ${result.imagesEmbedded} image(s) embedded`
        : "";
      const failedSummary = result.imagesFailed ? `, ${result.imagesFailed} image(s) could not be downloaded and are left as links` : "";
      return `Saved ${result.filename}. ${result.messageCount} message(s), Markdown + PDF + data files${imageSummary}${failedSummary}.`;
    }


    function updateExportButtonLabel() {
      const exportButton = shadow.querySelector("[data-action='export']");
      const snapshot = captureJobs.getLoadedSnapshot();
      exportButton.textContent = snapshot
        ? `Export Loaded ${formatCaptureMode(snapshot.captureMode)} Bundle`
        : "Export Bundle";
    }

    function shouldDownloadDebugLog() {
      return Boolean(shadow.querySelector("[data-option='debug-log']")?.checked);
    }

    function setPanelPhase(nextPhase, message = "", isError = false) {
      panelPhase = nextPhase;
      const isCaptureBusy = nextPhase === "scanning" || nextPhase === "validating";
      const isBusy = isCaptureBusy || nextPhase === "exporting";
      const hasMessages = messages.length > 0;
      const modeSelect = shadow.querySelector("[data-option='capture-mode']");
      const startButton = shadow.querySelector("[data-action='start-scan']");
      const cancelButton = shadow.querySelector("[data-action='cancel-scan']");

      modeSelect.disabled = isBusy;
      startButton.disabled = isBusy || !api;
      startButton.textContent = captureJobs.getLoadedSnapshot() ? "Scan Again" : "Start Scan";
      cancelButton.disabled = !isCaptureBusy;
      cancelButton.hidden = !isCaptureBusy;

      for (const action of shadow.querySelectorAll(".cgce-action")) {
        action.disabled = isBusy || !hasMessages;
      }

      shadow.querySelector(".cgce-panel").classList.toggle("is-busy", isBusy);
      shadow.querySelector(".cgce-panel").dataset.phase = nextPhase;
      updateExportAvailability();

      if (message) {
        setPanelStatus(message, isError);
      }
    }

    function updateExportAvailability() {
      const exportButton = shadow.querySelector("[data-action='export']");
      const snapshot = captureJobs.getLoadedSnapshot();
      const phaseAllowsExport = panelPhase === "ready" || panelPhase === "incomplete";
      const completenessAllowsExport = Boolean(snapshot?.completeness?.complete || allowsIncompleteExport());
      exportButton.disabled = !phaseAllowsExport
        || !snapshot
        || selectedIds.size === 0
        || !completenessAllowsExport;
      updateOverrideVisibility();
    }

    function allowsIncompleteExport() {
      return Boolean(shadow.querySelector("[data-option='allow-incomplete']")?.checked);
    }

    function resetIncompleteOverride() {
      const checkbox = shadow.querySelector("[data-option='allow-incomplete']");

      if (checkbox) {
        checkbox.checked = false;
      }
    }

    function updateOverrideVisibility() {
      const wrapper = shadow.querySelector("[data-control='incomplete-override']");
      const snapshot = captureJobs.getLoadedSnapshot();

      if (wrapper) {
        wrapper.hidden = !snapshot || Boolean(snapshot.completeness?.complete);
      }
    }

    function renderCompletenessReport(report) {
      const container = shadow.querySelector(".cgce-integrity");
      container.replaceChildren();
      container.hidden = !report;

      if (!report) {
        return;
      }

      container.classList.toggle("is-incomplete", !report.complete);
      const heading = document.createElement("strong");
      heading.textContent = report.complete ? "Completeness check passed" : "Incomplete capture";
      const metrics = document.createElement("span");
      metrics.textContent = [
        `${report.captured.uniqueIdentities}/${report.expected.uniqueIdentities} identities`,
        `${report.captured.userMessages}/${report.expected.userMessages} user`,
        `${report.captured.assistantMessages}/${report.expected.assistantMessages} assistant`,
        `${report.images.references} image refs`,
        `${report.images.uniqueIdentities} unique`,
        `${report.images.embedded} embedded`,
        `${report.images.deferred} deferred`,
        `${report.images.failures} failed`
      ].join(" | ");
      container.append(heading, metrics);

      if (report.issues.length) {
        const list = document.createElement("ul");

        for (const issue of report.issues) {
          const item = document.createElement("li");
          item.textContent = issue.message;
          list.append(item);
        }

        container.append(list);
      }

      if (report.warnings.length) {
        const warning = document.createElement("span");
        warning.textContent = report.warnings.map((item) => item.message).join(" ");
        container.append(warning);
      }
    }

    function formatIncompleteCaptureStatus(report) {
      const missing = report?.missingConversationOrders || [];
      const missingSummary = missing.length
        ? ` Missing order(s): ${formatNumberRanges(missing)}.`
        : "";
      return `Incomplete: ${report?.captured?.messages || 0} captured, ${report?.captured?.userMessages || 0} user + ${report?.captured?.assistantMessages || 0} assistant.${missingSummary} Normal export is blocked.`;
    }

    function setPanelStatus(message, isError = false) {
      const status = shadow.querySelector(".cgce-status");
      status.textContent = message || "";
      status.classList.toggle("is-error", isError);
    }

    function getSelectorPanelMarkup() {
      return `
        <style>
          :host {
            all: initial;
            color-scheme: light;
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }

          .cgce-panel {
            position: fixed;
            top: 18px;
            right: 18px;
            bottom: 18px;
            z-index: 2147483647;
            width: min(430px, calc(100vw - 36px));
            display: grid;
            grid-template-rows: auto auto 1fr auto;
            overflow: hidden;
            background: #ffffff;
            border: 1px solid #d7dde8;
            border-radius: 8px;
            box-shadow: 0 24px 70px rgba(15, 23, 42, 0.24);
            color: #111827;
          }

          .cgce-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
            padding: 16px 16px 12px;
            border-bottom: 1px solid #e6eaf0;
          }

          .cgce-title {
            margin: 0;
            font-size: 16px;
            line-height: 1.25;
            font-weight: 700;
          }

          .cgce-subtitle {
            margin: 4px 0 0;
            max-width: 300px;
            font-size: 12px;
            line-height: 1.4;
            color: #5b6472;
          }

          .cgce-icon-buttons {
            display: flex;
            gap: 6px;
          }

          .cgce-icon-button {
            width: 32px;
            height: 32px;
            border: 1px solid #d7dde8;
            border-radius: 6px;
            background: #ffffff;
            color: #243042;
            font-size: 18px;
            line-height: 1;
            cursor: pointer;
          }

          .cgce-icon-button:disabled {
            cursor: wait;
            opacity: 0.55;
          }

          .cgce-actions {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 8px;
            padding: 12px 16px;
            border-bottom: 1px solid #e6eaf0;
            background: #f8fafc;
          }

          .cgce-action {
            min-height: 32px;
            border: 1px solid #cfd7e3;
            border-radius: 6px;
            background: #ffffff;
            color: #172033;
            font-size: 12px;
            font-weight: 650;
            cursor: pointer;
          }

          .cgce-list {
            overflow: auto;
            min-height: 0;
            padding: 6px 8px 8px;
            background: #ffffff;
          }

          .cgce-message {
            display: grid;
            grid-template-columns: 14px 1fr;
            gap: 6px;
            align-items: center;
            padding: 4px 6px;
            margin: 0 0 3px;
            border: 1px solid #e3e8f0;
            border-radius: 4px;
            background: #ffffff;
            cursor: pointer;
          }

          .cgce-message:hover {
            border-color: #9aa8bb;
            background: #f9fbfd;
          }

          .cgce-message input {
            width: 13px;
            height: 13px;
            margin: 0;
            accent-color: #0f766e;
          }

          .cgce-message-content {
            min-width: 0;
            display: grid;
            grid-template-columns: auto minmax(0, 1fr) auto;
            gap: 5px;
            align-items: center;
          }

          .cgce-message-meta {
            display: contents;
          }

          .cgce-role {
            display: inline-flex;
            align-items: center;
            min-height: 16px;
            padding: 0 5px;
            border-radius: 999px;
            background: #eef6f5;
            color: #0f766e;
            font-size: 9px;
            font-weight: 750;
            text-transform: uppercase;
            letter-spacing: 0;
          }

          .cgce-message-assistant .cgce-role {
            background: #eff4ff;
            color: #3159a8;
          }

          .cgce-stats {
            overflow: hidden;
            color: #64748b;
            font-size: 10px;
            white-space: nowrap;
            text-overflow: ellipsis;
          }

          .cgce-preview {
            display: block;
            overflow: hidden;
            color: #1f2937;
            font-size: 11px;
            line-height: 1.25;
            white-space: nowrap;
            text-overflow: ellipsis;
          }

          .cgce-footer {
            display: grid;
            gap: 10px;
            padding: 12px 16px 14px;
            border-top: 1px solid #e6eaf0;
            background: #ffffff;
          }

          .cgce-status {
            min-height: 17px;
            color: #4b5563;
            font-size: 12px;
            line-height: 1.35;
          }

          .cgce-status.is-error {
            color: #b42318;
          }

          .cgce-integrity {
            display: grid;
            gap: 4px;
            padding: 9px 10px;
            border: 1px solid #b7dfd7;
            border-radius: 6px;
            background: #f0fdfa;
            color: #134e4a;
            font-size: 11px;
            line-height: 1.4;
          }

          .cgce-integrity.is-incomplete {
            border-color: #f2b8b5;
            background: #fff5f4;
            color: #8a1c13;
          }

          .cgce-integrity ul {
            margin: 2px 0 0;
            padding-left: 18px;
          }

          [hidden] {
            display: none !important;
          }

          .cgce-option {
            display: flex;
            align-items: center;
            gap: 8px;
            color: #334155;
            font-size: 12px;
            line-height: 1.3;
          }

          .cgce-option input {
            width: 14px;
            height: 14px;
            margin: 0;
            accent-color: #0f766e;
          }

          .cgce-footer-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 10px;
            align-items: center;
          }

          .cgce-format {
            display: grid;
            grid-template-columns: auto minmax(110px, 1fr);
            gap: 8px;
            align-items: center;
            color: #334155;
            font-size: 12px;
          }

          .cgce-select,
          .cgce-input {
            min-height: 32px;
            min-width: 0;
            border: 1px solid #cfd7e3;
            border-radius: 6px;
            background: #ffffff;
            color: #172033;
            font: inherit;
            font-size: 13px;
          }

          .cgce-select {
            padding: 0 8px;
          }

          .cgce-input {
            box-sizing: border-box;
            width: 100%;
            padding: 0 10px;
          }

          .cgce-scan-controls {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 8px;
          }

          .cgce-scan,
          .cgce-cancel {
            min-height: 36px;
            border: 1px solid #0f766e;
            border-radius: 7px;
            background: #ffffff;
            color: #0f766e;
            font-size: 13px;
            font-weight: 750;
            cursor: pointer;
          }

          .cgce-scan {
            background: #0f766e;
            color: #ffffff;
          }

          .cgce-cancel {
            border-color: #cfd7e3;
            color: #334155;
          }

          .cgce-scan:disabled,
          .cgce-cancel:disabled,
          .cgce-action:disabled,
          .cgce-select:disabled {
            cursor: not-allowed;
            opacity: 0.58;
          }

          .cgce-export {
            min-height: 40px;
            border: 0;
            border-radius: 7px;
            background: #0f766e;
            color: #ffffff;
            font-size: 14px;
            font-weight: 750;
            cursor: pointer;
          }

          .cgce-export:disabled {
            cursor: not-allowed;
            opacity: 0.58;
          }

          .cgce-empty {
            padding: 18px;
            color: #64748b;
            font-size: 13px;
            text-align: center;
          }

          @media (max-width: 520px) {
            .cgce-panel {
              inset: 0;
              width: auto;
              border-radius: 0;
            }

            .cgce-footer-row {
              grid-template-columns: 1fr;
            }
          }
        </style>
        <aside class="cgce-panel" aria-label="ChatGPT export message selector">
          <header class="cgce-header">
            <div>
              <h2 class="cgce-title">Select messages <span style="font-size: 11px; font-weight: 500; color: #64748b; margin-left: 6px;">v${EXPORTER_VERSION}</span></h2>
              <p class="cgce-subtitle">Choose a capture mode, review loaded turns, then export the bundle.</p>
            </div>
            <div class="cgce-icon-buttons">
              <button class="cgce-icon-button" type="button" data-action="close" title="Close" aria-label="Close">X</button>
            </div>
          </header>
          <div class="cgce-actions" aria-label="Selection tools">
            <button class="cgce-action" type="button" data-action="select-all">All</button>
            <button class="cgce-action" type="button" data-action="select-users">Questions</button>
            <button class="cgce-action" type="button" data-action="select-assistants">Answers</button>
            <button class="cgce-action" type="button" data-action="invert">Invert</button>
          </div>
          <div class="cgce-list" role="list"></div>
          <footer class="cgce-footer">
            <div class="cgce-status" role="status" aria-live="polite"></div>
            <div class="cgce-integrity" hidden></div>
            <div class="cgce-footer-row">
              <label class="cgce-format">
                <span>Mode</span>
                <select class="cgce-select" data-option="capture-mode">
                  <option value="fast" selected>Fast (Recommended)</option>
                  <option value="hybrid">Hybrid (Fast + page details)</option>
                  <option value="full">Full (page scan only)</option>
                </select>
              </label>
              <label class="cgce-option">
                <input type="checkbox" data-option="debug-log">
                <span>Debug log</span>
              </label>
            </div>
            <div class="cgce-scan-controls">
              <button class="cgce-scan" type="button" data-action="start-scan">Start Scan</button>
              <button class="cgce-cancel" type="button" data-action="cancel-scan" hidden disabled>Cancel</button>
            </div>
            <label class="cgce-option" data-control="incomplete-override" hidden>
              <input type="checkbox" data-option="allow-incomplete">
              <span>Export this incomplete snapshot anyway</span>
            </label>
            <button class="cgce-export" type="button" data-action="export" disabled>Export Bundle</button>
          </footer>
        </aside>
      `;
    }
  }
