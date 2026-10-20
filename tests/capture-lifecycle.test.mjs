import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";

const repoRoot = path.resolve(import.meta.dirname, "..");
const source = await readFile(path.join(repoRoot, "extension", "content", "index.js"), "utf8");

test("capture job manager cancels superseded work and rejects stale commits", () => {
  const context = loadFunctions([
    "createCaptureCancelledError",
    "normalizeCaptureMode",
    "createCaptureJobManager"
  ]);
  const manager = context.createCaptureJobManager();
  const first = manager.start("hybrid");
  const second = manager.start("full");

  assert.equal(first.captureMode, "hybrid");
  assert.equal(first.signal.aborted, true);
  assert.equal(second.captureMode, "full");
  assert.equal(Object.isFrozen(second), true);
  assert.throws(
    () => manager.commit(first, { messages: [] }),
    /stale capture job/i
  );

  const snapshot = manager.commit(second, {
    messages: [{ id: "m1", role: "user" }],
    completeness: { complete: true }
  });

  assert.equal(snapshot.captureMode, "full");
  assert.equal(snapshot.messages.length, 1);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.messages), true);
  assert.equal(manager.getActiveJob(), null);
  assert.equal(manager.getLoadedSnapshot(), snapshot);
});

test("capture mode defaults to Fast", () => {
  const context = loadFunctions(["normalizeCaptureMode"]);

  assert.equal(context.normalizeCaptureMode(), "fast");
  assert.equal(context.normalizeCaptureMode("unknown"), "fast");
  assert.equal(context.normalizeCaptureMode("full"), "full");
});

test("completeness gate blocks the 28 user plus 17 assistant regression", () => {
  const context = loadCompletenessFunction();
  const messages = [
    ...Array.from({ length: 28 }, (_, index) => ({
      id: `u${index + 1}`,
      role: "user",
      order: index * 2 + 1,
      markdown: `Question ${index + 1}`
    })),
    ...Array.from({ length: 17 }, (_, index) => ({
      id: `a${index + 1}`,
      role: "assistant",
      order: index * 2 + 2,
      markdown: `Answer ${index + 1}`
    }))
  ].sort((left, right) => left.order - right.order);
  const report = context.buildCaptureCompletenessReport(messages, {
    captureMode: "full",
    expectedStructure: makeExpectedStructure(56, 28, 28)
  });

  assert.equal(report.complete, false);
  assert.equal(report.requiresOverride, true);
  assert.equal(report.captured.userMessages, 28);
  assert.equal(report.captured.assistantMessages, 17);
  assert.deepEqual(Array.from(report.missingConversationOrders), [36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56]);
  assert.ok(report.issues.some((issue) => issue.code === "missing-assistant-messages"));
  assert.ok(report.issues.some((issue) => issue.code === "missing-orders"));
});

test("completeness gate accepts structurally complete Full capture", () => {
  const context = loadCompletenessFunction();
  const messages = Array.from({ length: 56 }, (_, index) => ({
    id: `m${index + 1}`,
    role: index % 2 === 0 ? "user" : "assistant",
    order: index + 1,
    markdown: index === 55 ? "![garden](sediment://garden-image)" : `Message ${index + 1}`,
    imagesFailed: 0
  }));
  const report = context.buildCaptureCompletenessReport(messages, {
    captureMode: "full",
    expectedStructure: makeExpectedStructure(56, 28, 28)
  });

  assert.equal(report.complete, true);
  assert.equal(report.captured.uniqueIdentities, 56);
  assert.equal(report.missingConversationOrders.length, 0);
  assert.equal(report.images.references, 1);
  assert.equal(report.images.uniqueIdentities, 1);
});

test("completeness gate ignores duplicate unnumbered turn shells and accepts deferred images", () => {
  const context = loadCompletenessFunction();
  const imageMarkdown = Array.from({ length: 8 }, (_, index) => `![image-${index + 1}](https://example.test/image-${index + 1}.png)`).join("\n\n");
  const messages = Array.from({ length: 6 }, (_, index) => ({
    id: `m${index + 1}`,
    role: index % 2 === 0 ? "user" : "assistant",
    order: index + 1,
    markdown: index === 0 ? imageMarkdown : `Message ${index + 1}`,
    imagesDeferred: index === 0 ? 8 : 0,
    imagesFailed: 0
  }));
  context.mockTurns.push(
    ...messages.map((message) => ({
      identity: `order:${message.order}`,
      order: message.order,
      role: message.role
    })),
    { identity: "turn:duplicate-user-shell", order: Number.NaN, role: "user" }
  );

  const report = context.buildCaptureCompletenessReport(messages, { captureMode: "full" });

  assert.equal(report.complete, true);
  assert.equal(report.expected.uniqueIdentities, 6);
  assert.equal(report.expected.userMessages, 3);
  assert.equal(report.expected.assistantMessages, 3);
  assert.equal(report.captured.userMessages, 3);
  assert.equal(report.captured.assistantMessages, 3);
  assert.equal(report.images.references, 8);
  assert.equal(report.images.deferred, 8);
  assert.equal(report.images.failures, 0);
});

test("completeness gate still blocks real image failures", () => {
  const context = loadCompletenessFunction();
  const messages = [
    { id: "u1", role: "user", order: 1, markdown: "Question" },
    {
      id: "a1",
      role: "assistant",
      order: 2,
      markdown: "![failed](https://example.test/failed.png)",
      imagesFailed: 1
    }
  ];
  const report = context.buildCaptureCompletenessReport(messages, {
    captureMode: "full",
    expectedStructure: makeExpectedStructure(2, 1, 1)
  });

  assert.equal(report.complete, false);
  assert.equal(report.images.failures, 1);
  assert.ok(report.issues.some((issue) => issue.code === "image-failures"));
});

test("completeness gate keeps debug-summary turn coverage after DOM virtualization", () => {
  const context = loadCompletenessFunction();
  const messages = [
    { id: "u1", role: "user", order: 1, markdown: "Question 1" },
    { id: "a1", role: "assistant", order: 2, markdown: "Answer 1" },
    { id: "u2", role: "user", order: 3, markdown: "Question 2" }
  ];
  const report = context.buildCaptureCompletenessReport(messages, {
    captureMode: "full",
    expectedSummary: {
      expectedTurnCount: 4,
      capturedTurnOrders: [1, 2, 3],
      missingTurnOrders: [4]
    }
  });

  assert.equal(report.complete, false);
  assert.equal(report.expected.uniqueIdentities, 4);
  assert.deepEqual(Array.from(report.missingConversationOrders), [4]);
  assert.ok(report.issues.some((issue) => issue.code === "missing-orders"));
});

test("Hybrid Full-only messages make the snapshot incomplete", () => {
  const context = loadCompletenessFunction();
  const messages = [
    { id: "u1", role: "user", order: 1, markdown: "Question" },
    { id: "a1", role: "assistant", order: 2, markdown: "Answer" }
  ];
  const report = context.buildCaptureCompletenessReport(messages, {
    captureMode: "hybrid",
    expectedStructure: makeExpectedStructure(2, 1, 1),
    reconciliationReport: {
      substantiveFullOnlyMessages: 1,
      substantiveFullOnlyAssistantMessages: 1,
      substantiveSamples: [{ order: 2, role: "assistant" }]
    }
  });

  assert.equal(report.complete, false);
  assert.ok(report.issues.some((issue) => issue.code === "hybrid-full-only-messages"));
});

test("completeness gate catches missing sequence gaps like 49-51 in 56-turn conversation", () => {
  const context = loadCompletenessFunction();
  const capturedOrders = [
    ...Array.from({ length: 48 }, (_, index) => index + 1),
    52, 53, 54, 55, 56
  ];
  const messages = capturedOrders.map((order) => ({
    id: `m${order}`,
    role: order % 2 === 1 ? "user" : "assistant",
    order,
    markdown: `Message ${order}`,
    imagesFailed: 0
  }));

  // Mock DOM nodes only present at the end of the scan (e.g. bottom turns)
  context.mockTurns.push(
    ...messages.slice(48).map((message) => ({
      identity: `order:${message.order}`,
      order: message.order,
      role: message.role
    }))
  );

  const report = context.buildCaptureCompletenessReport(messages, {
    captureMode: "full",
    expectedSummary: {
      expectedTurnCount: 53,
      capturedTurnOrders: capturedOrders,
      missingTurnOrders: []
    }
  });

  assert.equal(report.complete, false);
  assert.equal(report.requiresOverride, true);
  assert.equal(report.expected.uniqueIdentities, 56);
  assert.deepEqual(Array.from(report.missingConversationOrders), [49, 50, 51]);
  assert.ok(report.issues.some((issue) => issue.code === "missing-orders"));
});

function makeExpectedStructure(count, userMessages, assistantMessages) {
  return {
    identities: Array.from({ length: count }, (_, index) => `order:${index + 1}`),
    orders: Array.from({ length: count }, (_, index) => index + 1),
    roles: { user: userMessages, assistant: assistantMessages },
    startRole: "user",
    endRole: "assistant",
    sameRolePairs: []
  };
}

function loadCompletenessFunction() {
  const mockTurns = [];
  const context = {
    mockTurns,
    normalizeCaptureMode(value) {
      const mode = String(value || "").toLowerCase();
      return ["fast", "full", "hybrid"].includes(mode) ? mode : "full";
    },
    getCapturedConversationOrder(message) {
      const order = Number(message?.conversationOrder ?? message?.order ?? message?.turnNumber);
      return Number.isFinite(order) ? Math.floor(order) : Number.NaN;
    },
    getCapturedMessageIdentity(message, index = 0) {
      const order = Number(message?.conversationOrder ?? message?.order ?? message?.turnNumber);
      return Number.isFinite(order) ? `order:${Math.floor(order)}` : `capture-index:${index}`;
    },
    getRoleSequenceDiagnostics(messages) {
      const sameRolePairs = [];
      for (let index = 1; index < messages.length; index += 1) {
        if (messages[index].role === messages[index - 1].role) {
          sameRolePairs.push({ role: messages[index].role, order: messages[index].order });
        }
      }
      return {
        userMessages: messages.filter((message) => message.role === "user").length,
        assistantMessages: messages.filter((message) => message.role === "assistant").length,
        sameRolePairs
      };
    },
    getCaptureImageCompletenessStats(messages) {
      const urls = messages.flatMap((message) => [...String(`${message.markdown || ""}\n${message.thinkingMarkdown || ""}`).matchAll(/!\[[^\]]*]\(([^)\s]+)/g)].map((match) => match[1]));
      return {
        references: urls.length,
        uniqueIdentities: new Set(urls).size,
        embedded: urls.filter((url) => url.startsWith("data:image/")).length,
        deferred: messages.reduce((sum, message) => sum + Number(message.imagesDeferred || 0), 0),
        failures: messages.reduce((sum, message) => sum + Number(message.imagesFailed || 0), 0)
      };
    },
    formatNumberRanges(values) {
      return values.join(", ");
    },
    getAllTurnNodes() {
      return mockTurns;
    },
    getExpectedTurnIdentity(turn, index = 0) {
      const order = Number(turn?.order);
      return Number.isFinite(order) ? `order:${Math.floor(order)}` : turn?.identity || `dom-index:${index}`;
    },
    getConversationTurnNumber(turn) {
      const order = Number(turn?.order);
      return Number.isFinite(order) ? order : Number.NaN;
    },
    detectRoleDetails(turn) {
      return { role: turn?.role || "unknown" };
    }
  };
  vm.createContext(context);
  vm.runInContext(`${extractFunction("getExpectedConversationStructure")}\n${extractFunction("buildCaptureCompletenessReport")}\nthis.buildCaptureCompletenessReport = buildCaptureCompletenessReport;`, context);
  return context;
}

function loadFunctions(names) {
  const context = { AbortController, Object, Error, Date, String };
  vm.createContext(context);
  const declarations = names.map(extractFunction).join("\n");
  vm.runInContext(`${declarations}\n${names.map((name) => `this.${name} = ${name};`).join("\n")}`, context);
  return context;
}

function extractFunction(name) {
  const marker = `  function ${name}(`;
  const start = source.indexOf(marker);

  if (start < 0) {
    throw new Error(`Function not found: ${name}`);
  }

  const signatureEnd = source.indexOf(")", start);
  const bodyStart = source.indexOf("{", signatureEnd);
  let depth = 0;
  let quote = "";
  let escaped = false;

  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }

    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }

    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;

    if (depth === 0) {
      return source.slice(start, index + 1).trim();
    }
  }

  throw new Error(`Function was not closed: ${name}`);
}
