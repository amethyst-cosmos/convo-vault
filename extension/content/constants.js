  // A 2,700-node conversation takes about 10 s as one tree and 5-8 s per
  // 100-turn page, so requests get a generous timeout; broken routes still
  // fail fast with an HTTP error.
  const CONVERSATION_API_FETCH_TIMEOUT_MS = 45_000;
  const CONVERSATION_API_ATTEMPT_TIMEOUT_MS = 45_000;
  const DEBUG_EVENT_LIMIT = 500;
  const BUNDLE_IMAGE_DOWNLOAD_CONCURRENCY = 12;
  const BUNDLE_IMAGE_DOWNLOAD_TIMEOUT_MS = 20_000;
  const DEFAULT_ADVANCED_PDF_RENDERER_URL = "http://127.0.0.1:38474";
  const LOCAL_RENDERER_BUNDLE_PORT = "CONVO_VAULT_LOCAL_RENDERER_BUNDLE";
  const LOCAL_RENDERER_REQUEST_CHUNK_CHARACTERS = 512 * 1024;
  const MAX_LOCAL_RENDERER_REQUEST_BYTES = 256 * 1024 * 1024;
