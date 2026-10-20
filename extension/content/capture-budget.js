  function getConversationScanBudget(options = {}) {
    const scrollTarget = getBestScrollTarget();
    const maxScrollTop = getMaxScrollTop(scrollTarget);
    const pageTurnDiagnostics = getPageTurnDiagnostics();
    const availableTurnCount = getAvailableConversationTurnOrders().length;
    const estimatedTurnsByHeight = Math.ceil(maxScrollTop / 1800);
    const expectedTurnCount = Number(options?.expectedTurnCount || 0);
    const pageTurnCount = Math.max(
      pageTurnDiagnostics.dataTurnIdCount || 0,
      availableTurnCount,
      estimatedTurnsByHeight,
      expectedTurnCount
    );
    const isLargeConversation = pageTurnCount >= 36 || maxScrollTop >= 30_000;
    const maxScanMs = isLargeConversation
      ? Math.min(MAX_ADAPTIVE_SCAN_MS, Math.max(MAX_SCAN_MS, pageTurnCount * 1400))
      : MAX_SCAN_MS;
    const hydrateReservedMs = isLargeConversation
      ? Math.min(MAX_ADAPTIVE_HYDRATE_RESERVED_MS, Math.max(HYDRATE_RESERVED_MS, pageTurnCount * 350))
      : HYDRATE_RESERVED_MS;

    return {
      pageTurnCount,
      availableTurnCount,
      maxScanMs,
      hydrateReservedMs,
      adaptive: isLargeConversation
    };
  }

  function getMissingRecoveryBudgetMs(missingCount, pageTurnCount = 0) {
    if (!missingCount) {
      return MISSING_TURN_RECOVERY_MS;
    }

    const needsAdaptiveRecovery = pageTurnCount >= 36 || missingCount >= 10;

    if (!needsAdaptiveRecovery) {
      return MISSING_TURN_RECOVERY_MS;
    }

    return Math.min(
      MAX_ADAPTIVE_MISSING_RECOVERY_MS,
      Math.max(MISSING_TURN_RECOVERY_MS, missingCount * 1800)
    );
  }
