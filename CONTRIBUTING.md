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
- Every change someone would install or test bumps the version. Run `npm run version:set -- X.Y.Z`: it writes the version into every file that carries it and adds an empty entry to `CHANGELOG.md` and `CHANGELOG.zh-CN.md`. Write those two entries; `tests/version.test.mjs` fails while a placeholder is left.
- Add a test with the change. Export bugs are best captured as a fixture in `tests/fixtures/` (see `tests/fixtures/README.md`).
- Keep the integrity gate honest: never make an incomplete capture look complete.

## Reporting a bad export

Open an issue with the template. The most useful things to include are the version, the integrity report or the CLI error and a small conversation that reproduces it. Please remove private content first: exports contain your whole conversation.

## Security

See [SECURITY.md](SECURITY.md). Do not report vulnerabilities in public issues.
