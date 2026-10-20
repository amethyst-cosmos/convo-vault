# Convo Vault Local Renderer

Local service that turns the extension's structured export payload into the
export bundle: Markdown, PDF, payload JSON, data sidecars, an asset manifest,
and the image assets themselves. Nothing leaves the machine.

## Install

From this directory:

```bash
pnpm install
```

The `.npmrc` file sets `node-linker=hoisted` because some removable/exFAT drives
do not support pnpm symlinks.

## Start the service

Start it from the extension popup with **Copy Start**. The copied command sets
`CGCE_LOCAL_API_TOKEN`; browser-origin requests must send that token in
`X-Convo-Vault-Token`. For local development, from the repository root:

```bash
npm run backend
```

The service listens on `127.0.0.1:38474` by default (`CGCE_ADVANCED_PDF_PORT`
changes it; save the same port in the popup settings).

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Availability, version, and cache directory. |
| `POST /export-sessions` | Opens a session for staging image bytes. |
| `PUT /export-sessions/:id/assets/:sourceKey` | Stores one image (keyed by the SHA-256 of its source reference). |
| `DELETE /export-sessions/:id` | Discards a session. |
| `POST /prepare-render-bundle` | Renders the bundle for an `exportPayload` and returns a download path. |
| `GET /download-bundle/:id` | Downloads a prepared bundle once. |
| `POST /jobs`, `GET /jobs/:id` | Export jobs for the CLI and agents (local programs only). |
| `POST /jobs/:id/claim`, `POST /jobs/:id/status` | Used by the extension to claim a job and report progress. |
| `POST /shutdown` | Stops the service. |

The extension's background service worker is the only client: the content
script downloads ChatGPT images with the page session, the background stages
them in an export session, then calls `/prepare-render-bundle`.

## Layout

```
renderer/
  server.js            HTTP entry: routing, idle exit
  render.js            CLI: payload -> HTML -> PDF
  lib/
    config.js          ports, limits, paths, token
    http-utils.js      JSON bodies, CORS, token and local-process checks
    jobs.js            export jobs (create, claim, status, bundle)
    export-sessions.js staging image bytes sent by the extension
    bundle.js          assembles the bundle: Markdown, data files, PDF, zip
    zip.js             streaming ZIP writer
    bundle-content.js  payload normalization, Markdown, data sidecars
    agent-trace-files.js  *.agent-trace.json and *.agent-trace.md
    assets.js          asset manifest, SHA-256 store, output-object accounting
    document.js        builds the PDF's HTML document
    messages.js, markdown.js, math.js, charts.js, mermaid.js, images.js, text.js, util.js
    pagination.js      in-page script that decides page breaks
    pdf.js             prints through Chrome and adds PDF bookmarks
    dil-runtime.js     draws ChatGPT generative-UI answers in the PDF page
  static/              render.css, avatar images
```

## Render a payload directly

```bash
node renderer/render.js path/to/payload.json --out output/pdf/conversation.pdf --html tmp/conversation.html
```

`render.js` uses local Chrome, Edge, or another Chromium build. Set
`CGCE_RENDER_BROWSER_PATH` (or pass `--chrome`) to choose one.

## PDF layout

The PDF reads like the ChatGPT page: one reading column, prompts as
right-aligned bubbles with uncropped screenshots, answers as full-width text,
a one-line meta row (avatar, speaker, turn, time) per message, a prompt index
instead of a full table of contents, clickable footnotes, formatted writing
blocks, static formula, Mermaid, and chart rendering, and page breaks that keep
each prompt with the start of its answer.

## Generative UI (DIL) answers

ChatGPT stores a generative answer as compiled JavaScript
(`metadata.model_dil_v2.code`) plus constants, resolved component results, and
client-defined widgets. Fast capture exports these as the message's `dil`
blocks. `lib/document.js` writes each block as JSON beside an empty `.dil-root`, and
`lib/dil-runtime.js` runs the program with static stand-ins for ChatGPT's globals
(`DIL`, `__dil`, `GenUI`, `Cite`, `Entity`, `Link`, `AsyncImage`), drawing
boxes, rows, grids, badges, icons, lists, tables, buttons, radio groups,
citation chips, and writing/code widgets as HTML. Hooks return their initial
state and actions do nothing. The page's Content-Security-Policy blocks all
network access. If a program throws, the message shows the Markdown fallback.
`AsyncImage` results carry only titles, so images render as captioned
placeholders.
