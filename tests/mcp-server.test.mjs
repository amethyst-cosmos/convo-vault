import { spawn } from "node:child_process";
import path from "node:path";
import { createInterface } from "node:readline";
import { test } from "node:test";
import assert from "node:assert/strict";

const serverPath = path.resolve(import.meta.dirname, "..", "cli", "mcp-server.mjs");

test("MCP server answers the handshake, lists tools and reports bad links as tool errors", async () => {
  const child = spawn(process.execPath, [serverPath], { stdio: ["pipe", "pipe", "inherit"], env: { ...process.env, CONVO_VAULT_NO_OPEN: "1" } });
  const pending = new Map();
  createInterface({ input: child.stdout }).on("line", (line) => {
    const message = JSON.parse(line);
    pending.get(message.id)?.(message);
  });
  let nextId = 1;
  const request = (method, params) => new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });

  try {
    const init = await request("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    assert.equal(init.result.protocolVersion, "2025-03-26");
    assert.equal(init.result.serverInfo.name, "convo-vault");

    const tools = await request("tools/list");
    assert.deepEqual(tools.result.tools.map((tool) => tool.name), ["export_conversation", "export_status", "check_setup"]);

    const bad = await request("tools/call", { name: "export_conversation", arguments: { url: "https://example.com/c/abcdefgh" } });
    assert.equal(bad.result.isError, true);
    assert.match(bad.result.content[0].text, /Only chatgpt\.com and grok\.com conversations/);

    const unknown = await request("nope");
    assert.equal(unknown.error.code, -32601);
  } finally {
    child.kill();
  }
});
