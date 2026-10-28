  // Which chat site this page is. The capture, the payload's provider field and the
  // renderer's labels follow it.
  function getProviderId() {
    if (location.hostname === "grok.com") return "grok";
    if (location.hostname === "gemini.google.com") return "gemini";
    return "chatgpt";
  }
