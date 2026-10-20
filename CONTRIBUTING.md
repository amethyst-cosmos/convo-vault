# Contributing

Thanks for helping. Bug reports, fixtures from conversations that export badly, and pull requests are all welcome.

## Set up

```bash
git clone https://github.com/amethyst-cosmos/convo-vault.git
cd convo-vault
(cd renderer && pnpm install)    # or: node scripts/convo-vault.mjs setup
npm run build:extension
npm test
```

Node 20 or newer is required. PDF rendering needs a local Chrome or Chromium.

## Before you open a pull request

- Run `npm run check` and `npm test`. CI runs both on Ubuntu, macOS and Windows.
- `content.js` is generated. Edit `src/content/*.js`, then run `npm run build:extension`. `npm run check` fails if they disagree.
- Every change someone would install or test bumps the version. Keep it identical in `package.json`, `manifest.json`, `renderer/package.json`, `src/content/index.js` (`EXPORTER_VERSION`), `popup.html`, `README.md`, `README.zh-CN.md`, `CHANGELOG.md` and `CHANGELOG.zh-CN.md`. `tests/version.test.mjs` checks it.
- Add a test with the change. Export bugs are best captured as a fixture in `tests/fixtures/` (see `tests/fixtures/README.md`).
- Keep the integrity gate honest: never make an incomplete capture look complete.

## Reporting a bad export

Open an issue with the template. The most useful things to include are the version, the capture mode, the integrity report from the panel (or the CLI error) and a small conversation that reproduces it. Please remove private content first: exports contain your whole conversation.

## Security

See [SECURITY.md](SECURITY.md). Do not report vulnerabilities in public issues.
