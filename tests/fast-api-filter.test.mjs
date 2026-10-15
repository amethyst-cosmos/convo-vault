import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("Fast API parser filters hidden and internal assistant nodes", async () => {
  const fast = await loadFastCaptureModule();
  const events = [];
  const data = {
    current_node: "final-answer",
    mapping: {
      root: { id: "root", parent: "", message: null },
      prompt: {
        id: "prompt",
        parent: "root",
        message: makeMessage("user", "How should I start?")
      },
      hidden: {
        id: "hidden",
        parent: "prompt",
        message: makeMessage("assistant", "hidden setup", {
          metadata: { is_visually_hidden_from_conversation: true }
        })
      },
      search: {
        id: "search",
        parent: "hidden",
        message: makeMessage("assistant", '{"search_query":[{"q":"example"}]}', {
          end_turn: false,
          recipient: "web.run"
        })
      },
      code: {
        id: "code",
        parent: "search",
        message: makeMessage("assistant", "import math", {
          contentType: "code",
          end_turn: false,
          recipient: "python"
        })
      },
      "final-answer": {
        id: "final-answer",
        parent: "code",
        message: makeMessage("assistant", "Start with a small checklist.", {
          channel: "final",
          end_turn: true,
          recipient: "all"
        })
      }
    }
  };

  const messages = fast.buildMessagesFromConversationApi(data, {
    event(name, payload) {
      events.push({ name, payload });
    }
  });

  assert.deepEqual(Array.from(messages, (message) => message.role), ["user", "assistant"]);
  assert.equal(messages[0].markdown, "How should I start?");
  assert.equal(messages[1].markdown, "Start with a small checklist.");
  assert.deepEqual(JSON.parse(JSON.stringify(events.find((event) => event.name === "fastCapture.filteredSummary")?.payload.filtered)), {
    hidden: 1,
    "assistant-not-final": 2
  });
});

test("Fast API parser keeps final assistant code answers", async () => {
  const fast = await loadFastCaptureModule();
  const data = {
    current_node: "answer",
    mapping: {
      root: { id: "root", parent: "", message: null },
      prompt: {
        id: "prompt",
        parent: "root",
        message: makeMessage("user", "Show me code.")
      },
      answer: {
        id: "answer",
        parent: "prompt",
        message: makeMessage("assistant", "```python\nprint('ok')\n```", {
          end_turn: true,
          recipient: "all"
        })
      }
    }
  };

  const messages = fast.buildMessagesFromConversationApi(data);

  assert.equal(messages.length, 2);
  assert.match(messages[1].markdown, /```python/);
});

test("Fast API parser emits image asset pointers as markdown images", async () => {
  const fast = await loadFastCaptureModule();
  const data = {
    current_node: "prompt",
    mapping: {
      root: { id: "root", parent: "", message: null },
      prompt: {
        id: "prompt",
        parent: "root",
        message: makeMessage("user", "", {
          contentType: "multimodal_text",
          parts: [
            "Please review this.",
            {
              asset_pointer: "file-service://file-image-123",
              content_type: "image/png",
              name: "diagram.png"
            }
          ],
          metadata: {
            attachments: [
              {
                id: "file-image-123",
                name: "diagram.png",
                mime_type: "image/png"
              }
            ]
          }
        })
      }
    }
  };

  const messages = fast.buildMessagesFromConversationApi(data);

  assert.equal(messages.length, 1);
  assert.match(messages[0].markdown, /Please review this\./);
  assert.match(messages[0].markdown, /!\[diagram\.png]\(file-service:\/\/file-image-123\)/);
  assert.doesNotMatch(messages[0].markdown, /\[File: diagram\.png]/);
  assert.equal(messages[0].imageCount, 1);
  assert.equal(messages[0].fileCount, 0);
});

test("Fast API parser keeps sediment image pointers for embedding", async () => {
  const fast = await loadFastCaptureModule();
  const data = {
    current_node: "prompt",
    mapping: {
      root: { id: "root", parent: "", message: null },
      prompt: {
        id: "prompt",
        parent: "root",
        message: makeMessage("user", "", {
          contentType: "multimodal_text",
          parts: [
            {
              asset_pointer: "sediment://file_00000000c1e071fa9d934c60d95d7f69",
              content_type: "image/jpeg"
            },
            "What can you see?"
          ]
        })
      }
    }
  };

  const messages = fast.buildMessagesFromConversationApi(data);

  assert.equal(messages.length, 1);
  assert.match(messages[0].markdown, /!\[Image]\(sediment:\/\/file_00000000c1e071fa9d934c60d95d7f69\)/);
  assert.equal(messages[0].imageCount, 1);
});

test("Fast API parser cleans citation control markers", async () => {
  const fast = await loadFastCaptureModule();
  const data = {
    current_node: "answer",
    mapping: {
      root: { id: "root", parent: "", message: null },
      answer: {
        id: "answer",
        parent: "root",
        message: makeMessage("assistant", "This supports images. \uE200cite\uE202turn0search21\uE202turn0search2\uE201", {
          end_turn: true,
          recipient: "all"
        })
      }
    }
  };

  const messages = fast.buildMessagesFromConversationApi(data);

  assert.equal(messages.length, 1);
  assert.equal(messages[0].markdown, "This supports images.");
});

test("Fast API parser merges non-final assistant thinking into final answers", async () => {
  const fast = await loadFastCaptureModule();
  const events = [];
  const data = {
    current_node: "answer",
    mapping: {
      root: { id: "root", parent: "", message: null },
      prompt: {
        id: "prompt",
        parent: "root",
        message: makeMessage("user", "Please analyze this.")
      },
      thinking: {
        id: "thinking",
        parent: "prompt",
        message: makeMessage("assistant", "Checking the uploaded file and comparing the visible details.", {
          end_turn: false,
          channel: "analysis"
        })
      },
      answer: {
        id: "answer",
        parent: "thinking",
        message: makeMessage("assistant", "The file looks relevant.", {
          end_turn: true,
          recipient: "all"
        })
      }
    }
  };

  const messages = fast.buildMessagesFromConversationApi(data, {
    event(name, payload) {
      events.push({ name, payload });
    }
  });

  assert.equal(messages.length, 2);
  assert.equal(messages[1].markdown, "The file looks relevant.");
  assert.match(messages[1].thinkingMarkdown, /Checking the uploaded file and comparing the visible details\./);
  assert.deepEqual(JSON.parse(JSON.stringify(events.find((event) => event.name === "fastCapture.thinkingMerged")?.payload)), {
    applied: 1
  });
});

test("Fast API parser enriches citations as footnotes and replaces citation tokens", async () => {
  const fast = await loadFastCaptureModule();
  const data = {
    current_node: "answer",
    mapping: {
      root: { id: "root", parent: "", message: null },
      prompt: {
        id: "prompt",
        parent: "root",
        message: makeMessage("user", "What is the competitor analysis?")
      },
      answer: {
        id: "answer",
        parent: "prompt",
        message: makeMessage("assistant", "This document focuses on ToB pet care fileciteturn0file0L2-L2.", {
          channel: "final",
          end_turn: true,
          recipient: "all",
          metadata: {
            citations: [
              {
                metadata: {
                  title: "Direct Competitor Research",
                  url: "https://docs.google.com/document/d/123"
                }
              }
            ]
          }
        })
      }
    }
  };

  const messages = fast.buildMessagesFromConversationApi(data);
  assert.equal(messages.length, 2);
  assert.match(messages[1].markdown, /ToB pet care \[\^1\]/);
  assert.match(messages[1].markdown, /\[\^1\]: \[Direct Competitor Research\]\(https:\/\/docs\.google\.com\/document\/d\/123\)/);
});

test("Fast API parser enriches memory context and thinking duration", async () => {
  const fast = await loadFastCaptureModule();
  const data = {
    current_node: "answer",
    mapping: {
      root: { id: "root", parent: "", message: null },
      prompt: {
        id: "prompt",
        parent: "root",
        message: makeMessage("user", "Summarize previous notes.")
      },
      answer: {
        id: "answer",
        parent: "prompt",
        message: makeMessage("assistant", "Here is the summary memcite.", {
          channel: "final",
          end_turn: true,
          recipient: "all",
          metadata: {
            finished_duration_sec: 11,
            thoughts: "Analyzed past discussions.",
            conversation_context_citation_metadata: [
              {
                citation: {
                  title: "Desktop pet interaction changed to simulation first",
                  attribution: "Memory"
                }
              }
            ]
          }
        })
      }
    }
  };

  const messages = fast.buildMessagesFromConversationApi(data);
  assert.equal(messages.length, 2);
  assert.match(messages[1].thinkingMarkdown, /> 💭 \*\*Thinking Process \(Worked for 11s\)\*\*/);
  assert.match(messages[1].thinkingMarkdown, /Analyzed past discussions\./);
  assert.match(messages[1].markdown, /> 🧠 \*\*Memory & Context\*\*:/);
  assert.match(messages[1].markdown, /> - \*\*Memory\*\*: Desktop pet interaction changed to simulation first/);
});

test("Fast API parser synthesizes multi-step assistant turn with DALL-E generated image parts", async () => {
  const fast = await loadFastCaptureModule();
  const data = {
    current_node: "tool-result",
    mapping: {
      root: { id: "root", parent: "", message: null },
      prompt: {
        id: "prompt",
        parent: "root",
        message: makeMessage("user", "Make this icon without background.")
      },
      dalleCall: {
        id: "dalleCall",
        parent: "prompt",
        message: makeMessage("assistant", "Generating transparent icon...", {
          recipient: "dalle.text2im",
          end_turn: false
        })
      },
      "tool-result": {
        id: "tool-result",
        parent: "dalleCall",
        message: {
          id: "tool-msg-1",
          author: { role: "tool", name: "dalle.text2im" },
          content: {
            content_type: "multimodal_text",
            parts: [
              {
                content_type: "image_asset_pointer",
                asset_pointer: "sediment://file_00000000436882308a7266db7496bbd1",
                name: "transparent_icon.png"
              }
            ]
          }
        }
      }
    }
  };

  const messages = fast.buildMessagesFromConversationApi(data);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "user");
  assert.equal(messages[1].role, "assistant");
  assert.match(messages[1].markdown, /!\[transparent_icon\.png\]\(sediment:\/\/file_00000000436882308a7266db7496bbd1\)/);
});

test("Fast API parser extracts agentTrace with document slices and keeps answer clean", async () => {
  const fast = await loadFastCaptureModule();
  const data = {
    current_node: "answer",
    mapping: {
      root: { id: "root", parent: "", message: null },
      prompt: {
        id: "prompt",
        parent: "root",
        message: makeMessage("user", "Summarize attached doc.")
      },
      fileIngest: {
        id: "fileIngest",
        parent: "prompt",
        message: makeMessage("tool", "[L1] <PARSED TEXT FOR PAGE: 1 / 3>\n[L2] Scenario 11", {
          recipient: "myfiles_browser"
        })
      },
      reasoning: {
        id: "reasoning",
        parent: "fileIngest",
        message: makeMessage("assistant", "Read doc and plan response.", {
          channel: "commentary",
          metadata: { finished_duration_sec: 5 }
        })
      },
      answer: {
        id: "answer",
        parent: "reasoning",
        message: makeMessage("assistant", "Here is the clear summary.", {
          channel: "final",
          end_turn: true
        })
      }
    }
  };

  const messages = fast.buildMessagesFromConversationApi(data);
  assert.equal(messages.length, 2);
  assert.equal(messages[1].markdown, "Here is the clear summary.");
  assert.ok(messages[1].agentTrace);
  assert.equal(messages[1].agentTrace.fileIngestions.length, 1);
  assert.match(messages[1].agentTrace.fileIngestions[0].rawText, /\[L1\] <PARSED TEXT FOR PAGE/);
  assert.equal(messages[1].agentTrace.thinkingNodes.length, 1);
});

test("Fast API parser extracts multi-step thoughts with both summary and full content without dropping snippet", async () => {
  const fast = await loadFastCaptureModule();
  const data = {
    current_node: "answer",
    mapping: {
      root: { id: "root", parent: "", message: null },
      prompt: {
        id: "prompt",
        parent: "root",
        message: makeMessage("user", "Design two UI schemes.")
      },
      thoughtNode: {
        id: "thoughtNode",
        parent: "prompt",
        message: {
          id: "msg-thought-1",
          author: { role: "assistant" },
          content: {
            content_type: "thoughts",
            thoughts: [
              {
                summary: "设计两套界面",
                content: "我会基于现有截图保留信息结构，制作两张独立的手机端抽卡界面：一张走高级清透的植物疗愈风，另一张采用更活泼、有趣的卡牌游戏风。"
              },
              {
                summary: "Designed two interface concepts",
                content: "Prepared two distinct high-fidelity UI wireframes."
              }
            ]
          },
          metadata: {
            finished_duration_sec: 81
          }
        }
      },
      answer: {
        id: "answer",
        parent: "thoughtNode",
        message: makeMessage("assistant", "Here are the two UI schemes.", {
          channel: "final",
          end_turn: true
        })
      }
    }
  };

  const messages = fast.buildMessagesFromConversationApi(data);
  assert.equal(messages.length, 2);
  const assistantMsg = messages[1];
  assert.equal(assistantMsg.markdown, "Here are the two UI schemes.");

  // 1. Verify thinkingMarkdown contains BOTH summary title and detailed prose
  assert.match(assistantMsg.thinkingMarkdown, /💭 \*\*Thinking Process \(Worked for 1m 21s\)\*\*/);
  assert.match(assistantMsg.thinkingMarkdown, /🧠 \*\*推理思考\*\*: \*\*设计两套界面\*\*/);
  assert.match(assistantMsg.thinkingMarkdown, /我会基于现有截图保留信息结构，制作两张独立的手机端抽卡界面/);
  assert.match(assistantMsg.thinkingMarkdown, /🧠 \*\*推理思考\*\*: \*\*Designed two interface concepts\*\*/);
  assert.match(assistantMsg.thinkingMarkdown, /Prepared two distinct high-fidelity UI wireframes\./);

  // 2. Verify agentTrace contains discrete thinkingNodes with non-empty content
  assert.ok(assistantMsg.agentTrace);
  assert.equal(assistantMsg.agentTrace.thinkingNodes.length, 2);
  assert.equal(assistantMsg.agentTrace.thinkingNodes[0].summary, "设计两套界面");
  assert.match(assistantMsg.agentTrace.thinkingNodes[0].content, /我会基于现有截图保留信息结构/);
  assert.equal(assistantMsg.agentTrace.thinkingNodes[0].durationSeconds, 81);
  assert.equal(assistantMsg.agentTrace.thinkingNodes[1].summary, "Designed two interface concepts");
  assert.equal(assistantMsg.agentTrace.thinkingNodes[1].content, "Prepared two distinct high-fidelity UI wireframes.");

  // 3. Verify activities have non-empty snippet
  const reasoningActs = assistantMsg.agentTrace.activities.filter((a) => a.type === "reasoning");
  assert.equal(reasoningActs.length, 2);
  assert.equal(reasoningActs[0].summary, "设计两套界面");
  assert.match(reasoningActs[0].snippet, /我会基于现有截图保留信息结构/);
  assert.equal(reasoningActs[1].summary, "Designed two interface concepts");
  assert.match(reasoningActs[1].snippet, /Prepared two distinct high-fidelity UI wireframes\./);
});

test("Fast API parser extracts reasoning search operations and reasoning recap into timeline and agentTrace", async () => {
  const fast = await loadFastCaptureModule();
  const data = {
    current_node: "answer",
    mapping: {
      root: { id: "root", parent: "", message: null },
      prompt: {
        id: "prompt",
        parent: "root",
        message: makeMessage("user", "Find low poly island assets.")
      },
      searchCall: {
        id: "searchCall",
        parent: "prompt",
        message: {
          id: "msg-search-call",
          author: { role: "assistant" },
          content: {
            content_type: "code",
            parts: ["site:quaternius.com floating island"]
          },
          metadata: {
            reasoning_status: "is_reasoning",
            reasoning_title: "查找岛屿素材库",
            search_queries: ["quaternius.com floating island low poly pack"]
          }
        }
      },
      searchResult: {
        id: "searchResult",
        parent: "searchCall",
        message: {
          id: "msg-search-result",
          author: { role: "tool" },
          content: {
            content_type: "text",
            parts: ["done"]
          },
          metadata: {
            search_result_groups: [
              {
                domain: "quaternius.com",
                search_query: "quaternius.com floating island low poly pack",
                entries: [
                  {
                    title: "Quaternius • Free Game Assets",
                    url: "https://quaternius.com/packs/platformergamekit.html"
                  }
                ]
              }
            ]
          }
        }
      },
      recapNode: {
        id: "recapNode",
        parent: "searchResult",
        message: {
          id: "msg-recap",
          author: { role: "assistant" },
          content: {
            content_type: "reasoning_recap",
            content: "思考了 35 秒并完成了素材检索"
          },
          metadata: {
            finished_duration_sec: 35
          }
        }
      },
      answer: {
        id: "answer",
        parent: "recapNode",
        message: makeMessage("assistant", "Found the Quaternius platformer pack.", {
          channel: "final",
          end_turn: true
        })
      }
    }
  };

  const messages = fast.buildMessagesFromConversationApi(data);
  assert.equal(messages.length, 2);
  const assistantMsg = messages[1];

  // Verify search step in thinking timeline
  assert.match(assistantMsg.thinkingMarkdown, /🔍 \*\*网页搜索\*\*: 查找岛屿素材库/);
  assert.match(assistantMsg.thinkingMarkdown, /quaternius\.com floating island low poly pack/);
  assert.match(assistantMsg.thinkingMarkdown, /\[Quaternius • Free Game Assets\]\(https:\/\/quaternius\.com\/packs\/platformergamekit\.html\)/);
  assert.match(assistantMsg.thinkingMarkdown, /⏱️ \*\*思考总结\*\*: 思考了 35 秒并完成了素材检索/);

  // Verify agentTrace captures search
  assert.ok(assistantMsg.agentTrace);
  assert.equal(assistantMsg.agentTrace.searches.length, 1);
  assert.equal(assistantMsg.agentTrace.searches[0].queries[0], "quaternius.com floating island low poly pack");
  assert.equal(assistantMsg.agentTrace.searches[0].results[0].title, "Quaternius • Free Game Assets");
});

test("Fast API parser triggers fidelity warnings on empty thought bodies when debugLog is active", async () => {
  const fast = await loadFastCaptureModule();
  const warnings = [];
  const diagnostics = [];
  const mockDebugLog = {
    fidelityWarning(warning) {
      warnings.push(warning);
    },
    recordThinkingDiagnostic(diag) {
      diagnostics.push(diag);
    },
    event() {}
  };

  const data = {
    current_node: "answer",
    mapping: {
      root: { id: "root", parent: "", message: null },
      prompt: {
        id: "prompt",
        parent: "root",
        message: makeMessage("user", "Analyze")
      },
      thoughtNode: {
        id: "thoughtNode",
        parent: "prompt",
        message: {
          id: "msg-thought-empty",
          author: { role: "assistant" },
          content: {
            content_type: "thoughts",
            thoughts: [
              {
                summary: "Only summary title",
                content: ""
              }
            ]
          },
          metadata: { finished_duration_sec: 10 }
        }
      },
      answer: {
        id: "answer",
        parent: "thoughtNode",
        message: makeMessage("assistant", "Answer", { end_turn: true })
      }
    }
  };

  const messages = fast.buildMessagesFromConversationApi(data, mockDebugLog);
  assert.equal(messages.length, 2);

  // Warning was properly triggered for empty thought body
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].code, "EMPTY_THOUGHT_CONTENT");
  assert.equal(warnings[0].details.summary, "Only summary title");

  // Diagnostic was recorded
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].totalSteps, 1);
  assert.equal(diagnostics[0].stepsWithSummaryOnly, 1);
  assert.equal(diagnostics[0].stepsWithFullContent, 0);
});

test("Fast API fetch loads every page from the plural conversations endpoint", async () => {
  const conversationId = "conversation-pagination-test";
  const accessToken = "bootstrap-access-token-12345678901234567890";
  const requests = [];
  const events = [];
  const newestPage = {
    current_node: "message-4",
    messages: [
      makeMessage("user", "Latest question", { id: "message-3" }),
      makeMessage("assistant", "Latest answer", { id: "message-4", end_turn: true })
    ],
    page_info: {
      start_cursor: "cursor-before-message-3",
      end_cursor: "cursor-message-4",
      has_previous_page: true,
      has_next_page: false
    }
  };
  const olderPage = {
    current_node: "message-3",
    messages: [
      makeMessage("user", "First question", { id: "message-1" }),
      makeMessage("assistant", "First answer", { id: "message-2", end_turn: true }),
      makeMessage("user", "Stale boundary copy", { id: "message-3" })
    ],
    page_info: {
      start_cursor: "cursor-message-1",
      end_cursor: "cursor-before-message-3",
      has_previous_page: false,
      has_next_page: true
    }
  };
  const fast = await loadFastCaptureModule({
    document: {
      querySelectorAll() {
        return [{ textContent: JSON.stringify({ session: { accessToken } }) }];
      }
    },
    location: {
      origin: "https://chatgpt.com",
      href: `https://chatgpt.com/c/${conversationId}`,
      pathname: `/c/${conversationId}`,
      search: ""
    },
    async fetch(url, options = {}) {
      requests.push({ url: String(url), headers: options.headers || {} });

      if (String(url).endsWith("/api/auth/session")) {
        return makeJsonResponse(404, {});
      }

      if (String(url).includes(`/backend-api/conversations/${conversationId}`)) {
        const parsed = new URL(url);
        return makeJsonResponse(200, parsed.searchParams.has("before") ? olderPage : newestPage);
      }

      return makeJsonResponse(404, {});
    }
  });

  const data = await fast.fetchConversationData(conversationId, {
    timeoutMs: 1_000,
    debugLog: {
      event(name, payload) {
        events.push({ name, payload });
      }
    }
  });
  const messages = fast.buildMessagesFromConversationApi(data);
  const apiRequests = requests.filter((request) => request.url.includes("/backend-api/conversations/"));

  assert.equal(apiRequests.length, 2);
  assert.match(apiRequests[0].url, /\/backend-api\/conversations\/conversation-pagination-test\?/);
  assert.match(apiRequests[0].url, /include_has_versions=true/);
  assert.match(apiRequests[0].url, /num_turns=100/);
  assert.match(apiRequests[1].url, /before=cursor-before-message-3/);
  assert.ok(apiRequests.every((request) => request.headers.authorization === `Bearer ${accessToken}`));
  assert.deepEqual(Array.from(data.messages, (message) => message.id), [
    "message-1",
    "message-2",
    "message-3",
    "message-4"
  ]);
  assert.equal(data.messages[2].content.parts[0], "Latest question");
  assert.equal(data.page_info.has_previous_page, false);
  assert.deepEqual(Array.from(messages, (message) => message.markdown), [
    "First question",
    "First answer",
    "Latest question",
    "Latest answer"
  ]);
  assert.deepEqual(
    JSON.parse(JSON.stringify(events.find((event) => event.name === "conversationApi.pagination.complete")?.payload)),
    {
      label: "bearer:/backend-api/conversations/conversation-pagination-test?include_has_versions=true&num_turns=100",
      pageCount: 2,
      totalRawMessages: 4
    }
  );
});

async function loadFastCaptureModule(overrides = {}) {
  const source = (await Promise.all([
    "chatgpt-markup.js",
    "conversation-manifest.js",
    "capture-fast.js"
  ].map((file) => readFile(path.join(repoRoot, "src", "content", file), "utf8")))).join("\n");
  const context = vm.createContext({
    AbortController,
    CONVERSATION_API_FETCH_TIMEOUT_MS: 15_000,
    CONVERSATION_API_ATTEMPT_TIMEOUT_MS: 4_500,
    URL,
    URLSearchParams,
    cleanMarkdown,
    countMarkdownImages,
    createCaptureCancelledError(reason) {
      return new Error(String(reason || "Capture cancelled."));
    },
    document: {
      querySelectorAll() {
        return [];
      }
    },
    filenameFromUrl,
    formatConversationTimestamp,
    isCaptureCancelledError() {
      return false;
    },
    getCodeBlockDiagnostics,
    makeFence,
    escapeMarkdownLinkLabel,
    normalizeCaptureMode(value) {
      const mode = String(value || "").toLowerCase();
      return ["fast", "full", "hybrid"].includes(mode) ? mode : "full";
    },
    location: {
      origin: "https://chatgpt.com",
      href: "https://chatgpt.com/c/test-conversation",
      pathname: "/c/test-conversation",
      search: ""
    },
    sanitizeFileAttachmentName,
    throwIfCaptureCancelled() {},
    truncatePreview,
    uniqueStrings,
    window: {
      clearTimeout,
      setTimeout
    },
    ...overrides
  });

  vm.runInContext(`${source}\nglobalThis.__fastCaptureTest = {
    buildConversationApiAttempts,
    buildConversationManifest,
    buildMessagesFromConversationApi,
    collectFastConversationMessages,
    fetchConversationData,
    mergeConversationApiPages,
    renderChatGptInlineTokens,
    renderDilSourceAsMarkdown
  };`, context);
  return context.__fastCaptureTest;
}

function makeMessage(role, text, options = {}) {
  return {
    id: options.id || `${role}-${hashText(text)}`,
    author: { role },
    content: {
      content_type: options.contentType || "text",
      parts: options.parts || [text]
    },
    channel: options.channel || "",
    end_turn: options.end_turn,
    metadata: options.metadata || {},
    recipient: options.recipient || ""
  };
}

function makeJsonResponse(status, data) {
  const body = JSON.stringify(data);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return String(name).toLowerCase() === "content-type" ? "application/json" : "";
      }
    },
    async json() {
      return JSON.parse(body);
    },
    async text() {
      return body;
    }
  };
}

function escapeMarkdownLinkLabel(text) {
  return String(text || "").replace(/[[\]\\]/g, "\\$&");
}

function makeFence(code) {
  const longest = Math.max(2, ...[...String(code || "").matchAll(/`+/g)].map((match) => match[0].length));
  return "`".repeat(longest + 1);
}

function cleanMarkdown(value) {
  return String(value || "").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function truncatePreview(value, maxLength) {
  const text = cleanMarkdown(value).replace(/\s+/g, " ");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function formatConversationTimestamp() {
  return "";
}

function getCodeBlockDiagnostics() {
  return [];
}

function countMarkdownImages(value) {
  return (String(value || "").match(/!\[[^\]]*]\(/g) || []).length;
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function sanitizeFileAttachmentName(value) {
  return String(value || "").trim();
}

function filenameFromUrl(value) {
  return String(value || "").split("/").filter(Boolean).pop() || "";
}

function hashText(value) {
  let hash = 0;
  for (const char of String(value)) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return Math.abs(hash).toString(36);
}
