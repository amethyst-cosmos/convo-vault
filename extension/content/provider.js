  // Which chat site this page is. The capture, the payload's provider field and the
  // renderer's labels follow it.
  // Pictures only the page can fetch, as data URIs keyed by the address their Markdown points at
  // (the same shape downloadChatGptFileImages returns).
  //   Gemini: blob: pictures drawn to a canvas while the page was open (see capture-gemini.js).
  //   Grok: assets.grok.com refuses a request that does not come from grok.com (a fetch from the
  //   extension's background gets a 403), so the page fetches them with its own Referer and session.
  async function downloadProviderPageImages(messages, options = {}) {
    const images = {};
    const failures = {};
    const provider = getProviderId();

    if (provider === "gemini") {
      Object.assign(images, getGeminiPageImages());
      return { images, failures };
    }

    if (provider !== "grok") {
      return { images, failures };
    }

    const sources = uniqueStrings(messages.flatMap((message) => [
      ...extractMarkdownImageUrls(message?.markdown),
      ...extractMarkdownImageUrls(message?.thinkingMarkdown)
    ]).filter((source) => source.startsWith("https://assets.grok.com/")));
    let cursor = 0;
    let finished = 0;

    async function worker() {
      while (cursor < sources.length) {
        const source = sources[cursor];
        cursor += 1;

        try {
          images[source] = await blobToDataUri(await fetchGrokImage(source));
        } catch (error) {
          failures[source] = error?.message || String(error);
        }

        finished += 1;
        options.onProgress?.(`Downloading images ${finished}/${sources.length}...`);
      }
    }

    await Promise.all(Array.from({ length: Math.min(3, sources.length) }, () => worker()));
    return { images, failures };
  }

  // A failed answer can be kept by the browser's cache, so the second try bypasses it.
  async function fetchGrokImage(source) {
    let lastStatus = 0;

    for (const cache of ["default", "reload"]) {
      const response = await fetchWithTimeout(source, { timeoutMs: BUNDLE_IMAGE_DOWNLOAD_TIMEOUT_MS, credentials: "include", cache });
      lastStatus = response.status;

      if (response.ok) {
        const type = response.headers.get("content-type") || "";
        if (!/^image\//i.test(type)) throw new Error(`image download returned ${type || "no content type"}`);
        return response.blob();
      }
    }

    throw new Error(`image download HTTP ${lastStatus}`);
  }

  function getProviderId() {
    if (location.hostname === "grok.com") return "grok";
    if (location.hostname === "gemini.google.com") return "gemini";
    return "chatgpt";
  }
