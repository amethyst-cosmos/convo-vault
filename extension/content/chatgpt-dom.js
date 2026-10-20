  // ============================================================================
  // CHATGPT DOM SCHEMA: MESSAGE UNITS (2026-10)
  // ============================================================================
  //
  // Current ChatGPT pages render one [data-turn-key] container per exchange.
  // Each message inside it is a unit:
  //
  //   [data-turn-key="<user message id>"]
  //     [data-chatgpt-search-unit-key="<turn>:<index>:user"]
  //        data-chatgpt-search-message-ids="<message id>"
  //       [data-user-message-bubble]                       user body
  //     [data-chatgpt-search-unit-key="<turn>:<index>:assistant"]
  //        data-chatgpt-search-message-ids="<message id> ..."
  //       [data-markdown-text-style="assistant-message"]   assistant body
  //
  // The unit key carries the role, and the message ids match the conversation
  // API, so units are the message nodes for Full capture. The <turn> prefix is
  // a render-window key (for example "fallback-turn-3"), not a global order.
  // Legacy pages ([data-message-author-role], conversation-turn-N) keep using
  // the selectors in index.js.

