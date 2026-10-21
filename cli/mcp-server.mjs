#!/usr/bin/env node

// Convo Vault as an MCP server (stdio, no dependencies). It lets chat apps that
// run local MCP servers (Claude desktop, Codex, Cursor...) export a ChatGPT
// conversation from a link or a screenshot, with the same engine as the CLI.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const cliPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "convo-vault.mjs");
const SERVER_INFO = {
  name: "convo-vault",
  version: JSON.parse(readFileSync(path.join(path.dirname(cliPath), "..", "package.json"), "utf8")).version
};
// Chat clients give up on tool calls after about a minute, so a slow export
// returns "running" and is finished through export_status.
const WAIT_MS = 45_000;
const exports = new Map();

const TOOLS = [
  {
    name: "export_conversation",
    description: "Export a ChatGPT conversation to a local folder (Markdown, PDF, structured JSON, thinking trace). Needs the conversation link (https://chatgpt.com/c/<id>), which is visible in the address bar of a screenshot. The user's browser must have the Convo Vault extension and be signed in to ChatGPT. If the result says it is still running, call export_status with the id until it finishes.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Conversation link like https://chatgpt.com/c/<id>, or the bare conversation id." },
        out_dir: { type: "string", description: "Folder to save into. Default: ~/Downloads/convo-vault." },
        pdf: { type: "boolean", description: "Set false to skip the PDF and export data only (faster). Default true." },
        files: { type: "boolean", description: "Set true to also download the files uploaded to and generated in the conversation (Word, PDF, zip...) into assets/files/. Default false: ask the user first; if they do not clearly say yes, leave it off." }
      },
      required: ["url"]
    }
  },
  {
    name: "export_status",
    description: "Check an export started by export_conversation that was still running.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] }
  },
  {
    name: "check_setup",
    description: "Check the Convo Vault installation (dependencies, extension build, browsers, skills) and explain what is missing.",
    inputSchema: { type: "object", properties: {} }
  }
];

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try { message = JSON.parse(line); } catch { return reply(null, undefined, { code: -32700, message: "Parse error" }); }
  void handle(message);
});

async function handle(message) {
  const { id, method, params } = message;
  const isRequest = id !== undefined && id !== null;

  try {
    if (method === "initialize") {
      return reply(id, {
        protocolVersion: params?.protocolVersion || "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO
      });
    }
    if (method === "ping") return reply(id, {});
    if (method === "tools/list") return reply(id, { tools: TOOLS });
    if (method === "tools/call") return reply(id, await callTool(params?.name, params?.arguments || {}));
    if (isRequest) reply(id, undefined, { code: -32601, message: `Method not found: ${method}` });
  } catch (error) {
    if (isRequest) reply(id, undefined, { code: -32603, message: error.message || String(error) });
  }
}

async function callTool(name, args) {
  if (name === "check_setup") {
    const run = await runCli(["doctor"], 30_000);
    return text(run.stdout + run.stderr, run.code !== 0);
  }

  if (name === "export_conversation") {
    const cliArgs = ["export", String(args.url || "")];
    if (args.out_dir) cliArgs.push("--out", String(args.out_dir));
    if (args.pdf === false) cliArgs.push("--no-pdf");
    if (args.files === true) cliArgs.push("--files");
    const id = randomBytes(6).toString("hex");
    const job = startCli(cliArgs);
    exports.set(id, job);
    return describeExport(id, await waitFor(job, WAIT_MS));
  }

  if (name === "export_status") {
    const job = exports.get(String(args.id || ""));
    if (!job) return text("Unknown export id.", true);
    return describeExport(String(args.id), await waitFor(job, WAIT_MS));
  }

  return text(`Unknown tool: ${name}`, true);
}

function describeExport(id, job) {
  if (!job.done) {
    const progress = job.stderr.trim().split("\n").pop() || "starting";
    return text(`Export ${id} is still running (${progress}). Call export_status with id "${id}" to wait for it.`);
  }
  if (job.code === 0) return text(job.stdout.trim());
  const reason = job.stderr.trim().split("\n").filter((line) => line.startsWith("Error:") || !line.startsWith("[convo-vault]")).join("\n");
  return text(reason || "The export failed.", true);
}

function startCli(args) {
  const job = { stdout: "", stderr: "", done: false, code: null, finished: null };
  const child = spawn(process.execPath, [cliPath, ...args], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  child.stdout.setEncoding("utf8").on("data", (chunk) => { job.stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk) => { job.stderr += chunk; });
  job.finished = new Promise((resolve) => {
    child.on("close", (code) => { job.done = true; job.code = code; resolve(); });
    child.on("error", (error) => { job.stderr += `Error: ${error.message}\n`; job.done = true; job.code = 1; resolve(); });
  });
  return job;
}

async function runCli(args, timeoutMs) {
  const job = startCli(args);
  await waitFor(job, timeoutMs);
  return { stdout: job.stdout, stderr: job.stderr, code: job.done ? job.code : 1 };
}

async function waitFor(job, timeoutMs) {
  await Promise.race([job.finished, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
  return job;
}

function text(content, isError = false) {
  return { content: [{ type: "text", text: content }], ...(isError ? { isError: true } : {}) };
}

function reply(id, result, error) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, ...(error ? { error } : { result }) })}\n`);
}
