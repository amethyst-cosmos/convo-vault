# Contributing

Thanks for helping. Bug reports, fixtures from conversations that export badly, and pull requests are all welcome.

## Set up

```bash
git clone https://github.com/amethyst-cosmos/convo-vault.git
cd convo-vault
(cd renderer && pnpm install)    # or: node cli/convo-vault.mjs setup
npm run build:extension
npm test
```

Node 20 or newer is required. PDF rendering needs a local Chrome or Chromium.

## Before you open a pull request

- Run `npm run lint` (needs `npm install` once), `npm run check` and `npm test`. CI runs both on Ubuntu, macOS and Windows.
- The content script is generated from `extension/content/*.js` by `npm run build:extension` (output in `dist/`). Edit the modules, not the output. `npm run check` fails if it no longer builds.
- Every change someone would install or test bumps the version. Keep it identical in `package.json`, `renderer/package.json`, `extension/manifest.json`, `extension/content/index.js` (`EXPORTER_VERSION`), `extension/popup/popup.html`, `README.md`, `README.zh-CN.md`, `CHANGELOG.md` and `CHANGELOG.zh-CN.md`. `tests/version.test.mjs` checks it.
- Add a test with the change. Export bugs are best captured as a fixture in `tests/fixtures/` (see `tests/fixtures/README.md`).
- Keep the integrity gate honest: never make an incomplete capture look complete.

## Reporting a bad export

Open an issue with the template. The most useful things to include are the version, the integrity report or the CLI error and a small conversation that reproduces it. Please remove private content first: exports contain your whole conversation.

## Security

See [SECURITY.md](SECURITY.md). Do not report vulnerabilities in public issues.
