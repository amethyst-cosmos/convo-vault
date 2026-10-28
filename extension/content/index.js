(() => {
  const EXPORTER_VERSION = "0.15.1";
  const installedState = window.__chatGptConversationExporterInstalled;

  if (
    installedState
    && typeof installedState === "object"
    && installedState.version === EXPORTER_VERSION
  ) {
    return;
  }

  if (
    installedState === true
    && window.__chatGptConversationExporterVersion === EXPORTER_VERSION
  ) {
    return;
  }

  window.__chatGptConversationExporterInstalled = {
    version: EXPORTER_VERSION,
    installedAt: Date.now()
  };
  window.__chatGptConversationExporterVersion = EXPORTER_VERSION;
  // @convo-vault-include constants
  // @convo-vault-include selectors

  // @convo-vault-include capture-orchestrator



  // @convo-vault-include capture-validation

  // @convo-vault-include bundle-export
  // @convo-vault-include chatgpt-files

  function countMarkdownImages(markdown) {
    return (String(markdown || "").match(/!\[[^\]]*]\([^)]+\)/g) || []).length;
  }

  // @convo-vault-include debug-log
  // @convo-vault-include message-snapshot



  // @convo-vault-include message-discovery

  // @convo-vault-include chatgpt-markup
  // @convo-vault-include chatgpt-dom
  // @convo-vault-include conversation-manifest
  // @convo-vault-include conversation-list

  // @convo-vault-include agent-trace
  // @convo-vault-include capture-fast
  // @convo-vault-include capture-grok
  // @convo-vault-include capture-gemini
  // @convo-vault-include provider
  // @convo-vault-include date-format


  // @convo-vault-include dom-utils

  // @convo-vault-include dom-serializer

  // @convo-vault-include page-utils

  // @convo-vault-include text-utils

  // @convo-vault-include auto-export
})();
