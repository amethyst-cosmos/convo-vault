  function createCaptureJobManager() {
    let nextJobId = 0;
    let activeJob = null;
    let loadedSnapshot = null;

    return {
      start(captureMode) {
        this.cancel("Superseded by a newer capture job.");
        loadedSnapshot = null;
        const controller = new AbortController();
        activeJob = Object.freeze({
          id: ++nextJobId,
          captureMode: normalizeCaptureMode(captureMode),
          controller,
          signal: controller.signal,
          startedAt: Date.now()
        });
        return activeJob;
      },
      cancel(reason = "Capture cancelled.") {
        const job = activeJob;
        activeJob = null;

        if (job && !job.signal.aborted) {
          job.controller.abort(reason);
        }

        return job;
      },
      isCurrent(job) {
        return Boolean(job && activeJob?.id === job.id && !job.signal.aborted);
      },
      commit(job, result) {
        if (!this.isCurrent(job)) {
          throw createCaptureCancelledError("A stale capture job cannot replace the loaded snapshot.");
        }

        const snapshot = Object.freeze({
          jobId: job.id,
          captureMode: job.captureMode,
          messages: Object.freeze([...(result?.messages || [])]),
          debugLog: result?.debugLog || null,
          completeness: result?.completeness || null,
          reconciliationReport: result?.reconciliationReport || null,
          completedAt: Date.now()
        });
        activeJob = null;
        loadedSnapshot = snapshot;
        return snapshot;
      },
      fail(job) {
        if (activeJob?.id === job?.id) {
          activeJob = null;
        }
      },
      clearSnapshot() {
        loadedSnapshot = null;
      },
      getActiveJob() {
        return activeJob;
      },
      getLoadedSnapshot() {
        return loadedSnapshot;
      }
    };
  }
