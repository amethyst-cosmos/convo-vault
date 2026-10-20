  // A small in-memory log of what a capture did. It is not exported; it keeps
  // fidelity warnings and timing marks next to the code that raises them.
  function createDebugLog(options = {}) {
    const startedAt = Date.now();
    const events = [];
    const fidelityWarnings = [];
    const maxEvents = options.maxEvents || DEBUG_EVENT_LIMIT;

    return {
      event(type, data = {}) {
        if (events.length < maxEvents) {
          events.push({ type, atMs: Date.now() - startedAt, ...data });
        }
      },
      mark(name) {
        this.event("mark", { name });
      },
      progress(type, data = {}) {
        this.event(`progress.${type}`, data);
      },
      fidelityWarning(warning = {}) {
        fidelityWarnings.push({
          atMs: Date.now() - startedAt,
          severity: warning.severity || "warning",
          code: warning.code || "FIDELITY_ANOMALY",
          turnNumber: warning.turnNumber || null,
          message: warning.message || "",
          details: warning.details || {}
        });
        this.event("fidelity.warning", { code: warning.code, turnNumber: warning.turnNumber, message: warning.message });
      },
      recordThinkingDiagnostic(diagnostic = {}) {
        this.event("thinking.diagnostic", diagnostic);
      },
      finish(messages) {
        this.event("capture.finished", { messages: messages.length });
      },
      toJSON() {
        return { startedAt: new Date(startedAt).toISOString(), events, fidelityWarnings };
      }
    };
  }
