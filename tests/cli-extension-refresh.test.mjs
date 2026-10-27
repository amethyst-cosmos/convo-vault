import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const repoRoot = path.resolve(import.meta.dirname, "..");
const cliPath = path.join(repoRoot, "cli", "convo-vault.mjs");
const manifestVersion = JSON.parse(await readFile(path.join(repoRoot, "extension", "manifest.json"), "utf8")).version;
const fixture = JSON.parse(await readFile(path.join(repoRoot, "tests", "fixtures", "multilingual-export.payload.json"), "utf8"));
const EXTENSION = { Origin: "chrome-extension://test" };

// Runs `export` for a browser the CLI remembers, with a simulated extension that answers each job the
// CLI opens (stderr shows the job ids) according to `script(options)`.
async function exportWithSimulatedExtension(t, { checkedVersion, script }) {
  const port = await getAvailablePort();
  const home = await mkdtemp(path.join(os.tmpdir(), "convo-vault-refresh-home-"));
  const outDir = await mkdtemp(path.join(os.tmpdir(), "convo-vault-refresh-out-"));
  t.after(async () => {
    await rawRequest(port, "POST", "/shutdown").catch(() => {});
    await rm(home, { recursive: true, force: true });
    await rm(outDir, { recursive: true, force: true });
  });

  await mkdir(home, { recursive: true });
  await writeFile(path.join(home, "config.json"), JSON.stringify({ browser: "Google Chrome", ...(checkedVersion ? { extensionVersionChecked: checkedVersion } : {}) }));

  const cli = spawn(process.execPath, [cliPath, "export", "fixture-conversation-3", "--out", outDir, "--no-pdf", "--no-extract"], {
    cwd: repoRoot,
    env: { ...process.env, CONVO_VAULT_HOME: home, CGCE_ADVANCED_PDF_PORT: String(port), CONVO_VAULT_NO_OPEN: "1" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  cli.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
  cli.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
  const exited = new Promise((resolve) => cli.on("exit", resolve));

  const handled = [];
  while (true) {
    const next = await waitFor(() => {
      const ids = [...stderr.matchAll(/#convo-vault-job=([a-f0-9]{48})/g)].map((match) => match[1]);
      return ids.find((id) => !handled.includes(id));
    }, () => stderr, 60_000);
    handled.push(next);

    const claimed = JSON.parse((await rawRequest(port, "POST", `/jobs/${next}/claim`, EXTENSION)).body);
    const kind = claimed.options.ping ? "ping" : claimed.options.reload ? "reload" : "export";
    const headers = { "Content-Type": "application/json", "X-Convo-Vault-Token": claimed.token, ...EXTENSION };
    const status = (message) => rawRequest(port, "POST", `/jobs/${next}/status`, headers, JSON.stringify({ state: "working", message }));

    if (kind === "ping") {
      await status(script.ping(handled.filter((id) => id).length));
    } else if (kind === "export") {
      const prepared = await fetch(`http://127.0.0.1:${port}/prepare-render-bundle`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Convo-Vault-Token": claimed.token },
        body: JSON.stringify({ jobId: next, skipPdf: true, exportPayload: fixture, fileName: "Refresh test.zip" })
      });
      assert.equal(prepared.ok, true, await prepared.clone().text());
      break;
    }
    script.seen.push(kind);
  }

  const code = await exited;
  const config = JSON.parse(await readFile(path.join(home, "config.json"), "utf8"));
  return { code, stdout, stderr, config };
}

test("export reloads a stale extension by itself, then exports", async (t) => {
  let pings = 0;
  const seen = [];
  const result = await exportWithSimulatedExtension(t, {
    script: {
      seen,
      ping: () => `Extension ${++pings === 1 ? "0.0.1" : manifestVersion} is installed and responding.`
    }
  });

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(seen, ["ping", "reload", "ping"], "ping, reload, confirm, then the export itself");
  assert.match(result.stderr, /The extension is 0\.0\.1 and this project is/);
  assert.match(result.stderr, new RegExp(`The extension is now ${manifestVersion.replaceAll(".", "\\.")}`));
  assert.equal(result.config.extensionVersionChecked, manifestVersion);
});

test("export does not touch the extension when it already matches, and remembers that", async (t) => {
  const seen = [];
  const result = await exportWithSimulatedExtension(t, {
    script: { seen, ping: () => `Extension ${manifestVersion} is installed and responding.` }
  });

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(seen, ["ping"]);
  assert.doesNotMatch(result.stderr, /Reloading the extension/);
  assert.equal(result.config.extensionVersionChecked, manifestVersion);
});

test("export skips the check once this project version was verified", async (t) => {
  const seen = [];
  const result = await exportWithSimulatedExtension(t, {
    checkedVersion: manifestVersion,
    script: { seen, ping: () => { throw new Error("no ping expected"); } }
  });

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(seen, []);
});

function rawRequest(port, method, route, headers = {}, body = "") {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: "127.0.0.1", port, method, path: route, headers: { ...headers, "Content-Length": Buffer.byteLength(body) } }, (response) => {
      let data = "";
      response.setEncoding("utf8").on("data", (chunk) => { data += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, body: data }));
    });
    request.on("error", reject);
    request.end(body);
  });
}

async function waitFor(read, getLogs, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out. Output so far:\n${getLogs()}`);
}

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}
