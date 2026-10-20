# Security policy

## Reporting a vulnerability

Please report security problems privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Do not open a public issue for it. Include the affected version, what you can do with it, and steps to reproduce.

We aim to acknowledge a report within a few days. Convo Vault is maintained by a small team, so there is no formal SLA.

## Supported versions

Only the latest release receives fixes.

## What is in scope

Convo Vault runs a local service and a browser extension, so the interesting boundaries are:

- The local renderer on `127.0.0.1`: its token check, its handling of requests that carry a browser `Origin`, and the `Host` check on job endpoints.
- Export jobs: creating one must be limited to local programs, and claiming one to the extension, once.
- The extension: what a ChatGPT page, or any other web page, can make it do.
- The CLI, MCP server and skill: anything that could read, expose or send the user's ChatGPT session, cookies or tokens, or conversation content, outside the machine.

## What is out of scope

- Anything that needs an attacker who already controls the user's account on the machine.
- ChatGPT itself and its private API. Report those to OpenAI.
- Findings against a modified copy of the code.

## Design rules

These hold for every change and are reasonable things to test:

- Conversation content is never sent to a remote service.
- No component reads browser cookies or stores the user's ChatGPT credentials. The extension uses the session already in the page.
- The renderer only listens on `127.0.0.1`.
