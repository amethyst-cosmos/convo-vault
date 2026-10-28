  // Which chat site this page is. The capture, the payload's provider field and the
  // renderer's labels follow it.
  function getProviderId() {
    return location.hostname === "grok.com" ? "grok" : "chatgpt";
  }
