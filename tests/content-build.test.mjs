import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildContentScript } from "../scripts/lib/content-build.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("content script is generated from its modules and keeps the Fast capture, image and renderer bridges", async () => {
  const generated = await buildContentScript(repoRoot);
  const debugModule = await readFile(path.join(repoRoot, "extension", "content", "debug-log.js"), "utf8");
  const fastModule = await readFile(path.join(repoRoot, "extension", "content", "capture-fast.js"), "utf8");
  const background = await readFile(path.join(repoRoot, "extension", "background.js"), "utf8");
  const rendererLib = path.join(repoRoot, "renderer", "lib");
  const backendServer = [
    await readFile(path.join(repoRoot, "renderer", "server.js"), "utf8"),
    ...await Promise.all((await readdir(rendererLib)).filter((name) => name.endsWith(".js")).map((name) => readFile(path.join(rendererLib, name), "utf8")))
  ].join("\n");
  const backendRender = [
    await readFile(path.join(repoRoot, "renderer", "render.js"), "utf8"),
    ...await Promise.all((await readdir(rendererLib)).filter((name) => name.endsWith(".js")).map((name) => readFile(path.join(rendererLib, name), "utf8"))),
    await readFile(path.join(repoRoot, "renderer", "static", "render.css"), "utf8")
  ].join("\n");
  const manifest = JSON.parse(await readFile(path.join(repoRoot, "extension", "manifest.json"), "utf8"));
  const popupHtml = await readFile(path.join(repoRoot, "extension", "popup", "popup.html"), "utf8");
  const popupJs = await readFile(path.join(repoRoot, "extension", "popup", "popup.js"), "utf8");

  assert.match(generated, /function createDebugLog/);
  assert.match(generated, /function buildConversationManifest/);
  assert.match(generated, /function buildManifestCompletenessReport/);
  assert.match(generated, /function renderChatGptInlineTokens/);
  assert.match(generated, /function getDilFallbackMarkdown/);
  assert.match(generated, /async function collectFastConversationMessages/);
  assert.match(generated, /\/api\/auth\/session/);
  assert.match(generated, /Bearer \$\{attempt\.accessToken\}/);
  assert.match(generated, /\/backend-api\/conversations\/\$\{encodedId\}/);
  assert.match(generated, /include_has_versions=true&num_turns=\$\{FAST_CONVERSATION_API_PAGE_SIZE\}/);
  assert.match(generated, /conversationApi\.pagination\.complete/);
  assert.match(generated, /pageUrl\.searchParams\.set\("before", cursor\)/);
  assert.match(generated, /getChatGptAccessTokenFromPageBootstrap/);
  assert.match(generated, /tree_format=true/);
  assert.match(generated, /routes\/_conversation\.g\.\$gizmoId\.c\.\$conversationId/);
  assert.match(generated, /function downloadChatGptFileImages/);
  assert.match(generated, /imagesDeferred/);
  assert.doesNotMatch(generated, /base64 embedding disabled during message scan/);
  assert.match(generated, /function dedupeMarkdownImageReferences/);
  assert.match(generated, /chatgpt-asset:/);
  assert.match(generated, /assetDownload\.done/);
  assert.match(generated, /function fetchChatGptFileImage/);
  assert.match(generated, /sediment/);
  assert.match(generated, /BUNDLE_IMAGE_DOWNLOAD_CONCURRENCY/);
  assert.match(generated, /CONVO_VAULT_LOCAL_RENDERER_BUNDLE/);
  assert.match(generated, /function requestBackgroundBundleExport/);
  assert.doesNotMatch(generated, /fetch\(`\$\{rendererUrl\}\/render-bundle`/);
  assert.match(fastModule, /function buildMessagesFromConversationApi/);
  assert.match(fastModule, /function isApiInternalToolCallNode/);
  assert.match(fastModule, /asset_pointer/);
  assert.match(fastModule, /fastCapture\.thinkingMerged/);
  assert.match(fastModule, /removeApiPrivateUseArtifacts/);
  // ChatGPT-hosted images are downloaded by the page; the worker only fetches public images.
  assert.match(generated, /\/backend-api\/files\/download\//);
  assert.match(background, /credentials: "omit"/);
  assert.doesNotMatch(background, /\/api\/auth\/session/);
  assert.doesNotMatch(background, /FETCH_IMAGE_AS_DATA_URI/);
  assert.match(background, /CONVO_VAULT_LOCAL_RENDERER_BUNDLE/);
  assert.match(background, /\/prepare-render-bundle/);
  assert.match(background, /chrome\.downloads\.download/);
  assert.ok(manifest.permissions.includes("downloads"));
  assert.match(backendServer, /captureMode: payload\.captureMode \|\| ""/);
  assert.match(backendServer, /CGCE_LOCAL_API_TOKEN/);
  assert.match(backendServer, /X-Convo-Vault-Token/);
  assert.match(backendServer, /X-Bundle-Timings/);
  assert.match(backendServer, /\/prepare-render-bundle/);
  assert.match(backendServer, /\/download-bundle\//);
  assert.match(backendServer, /externalizeEmbeddedImageAssets/);
  assert.match(backendServer, /buildBundleAssetEntries/);
  assert.match(backendServer, /compactMarkdownSourceLinks/);
  assert.match(backendServer, /message\.counts\?\.images/);
  assert.match(backendServer, /language: payload\.language \|\| payload\.locale \|\| payload\.documentLanguage/);
  assert.match(backendServer, /language: payload\.language \|\| ""/);
  assert.match(backendServer, /buildOutputObjectIndex/);
  assert.match(backendServer, /outputObjects/);
  assert.match(backendServer, /degradedObjectCount/);
  assert.match(backendRender, /@page {\n  size: A4;\n  margin: 56px 60px;\n}/);
  assert.match(backendRender, /<html lang="\$\{escapeAttr\(documentLanguage\)\}">/);
  assert.match(backendRender, /normalizeDocumentLanguage/);
  assert.match(backendRender, /language: payload\.language \|\| payload\.locale \|\| payload\.documentLanguage/);
  assert.match(backendRender, /Noto Sans CJK JP/);
  assert.match(backendRender, /Noto Sans CJK KR/);
  assert.match(backendRender, /Noto Sans Arabic/);
  assert.match(backendRender, /Noto Sans Hebrew/);
  assert.match(backendRender, /dir="auto"/);
  assert.match(backendRender, /\.user-meta-row\s*{\s*display: inline-flex;/);
  assert.match(backendRender, /assistant-row/);
  assert.match(backendRender, /assistant-title/);
  assert.match(backendRender, /stripAttachmentOnlyLines/);
  assert.match(backendRender, /compactMarkdownSourceLinks/);
  assert.match(backendRender, /renderMermaidDiagram/);
  assert.match(backendRender, /parseMermaidFlowchart/);
  assert.match(backendRender, /parseMermaidSequence/);
  assert.match(backendRender, /parseMermaidErDiagram/);
  assert.match(backendRender, /parseMermaidStateDiagram/);
  assert.match(backendRender, /math_block/);
  assert.match(backendRender, /math-frac/);
  assert.match(backendRender, /renderChartBlock/);
  assert.match(backendRender, /chart-svg/);
  assert.match(backendRender, /remote-media-card/);
  assert.match(backendRender, /shouldShowCodeLabel/);
  assert.doesNotMatch(popupHtml, /portInput|cacheDirInput|browserPathInput|saveSettingsButton|resetSettingsButton/);
  assert.doesNotMatch(popupJs, /portInput|cacheDirInput|browserPathInput|saveSettingsButton|resetSettingsButton/);
  assert.doesNotMatch(popupJs, /--port|--cache-dir|--browser-path/);
  assert.match(popupJs, /CGCE_LOCAL_API_TOKEN/);
  assert.match(popupJs, /createLocalApiToken/);
  assert.doesNotMatch(generated, /@convo-vault-include/);
});
