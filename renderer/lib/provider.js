// Which chat site an export came from. The extension writes payload.provider; an older
// payload without it is ChatGPT. The name labels the cover, the answers and the outline.
const PROVIDERS = {
  chatgpt: { id: "chatgpt", name: "ChatGPT" },
  grok: { id: "grok", name: "Grok" },
  gemini: { id: "gemini", name: "Gemini" }
};

function getProvider(value) {
  const id = String(value?.provider ?? value ?? "").toLowerCase();
  return PROVIDERS[id] || PROVIDERS.chatgpt;
}

module.exports = {
  PROVIDERS,
  getProvider
};
