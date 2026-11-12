import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  BashToolResultEvent,
  ExtensionAPI,
  SessionStartEvent,
  ToolResultEvent,
  TurnEndEvent,
} from "@oh-my-pi/pi-coding-agent";
import type { AssistantMessage, Context as CompletionContext, Model } from "@oh-my-pi/pi-ai";
import { getBundledModels } from "@oh-my-pi/pi-catalog";
import { BuddyCommandService } from "../../core/command-service.ts";
import type { Companion } from "../../core/model.ts";
import { registerBuddyCommands } from "./commands.ts";
import registerOmpBuddyExtension from "./index.ts";
import {
  deriveTurnComment,
  generatePersonality,
  generateTurnComment,
  isOmpBashToolResult,
  looksLikeTestFailure,
  resolveTurnCommentTimeoutMs,
  TURN_COMMENT_TIMEOUT_MS,
  registerOmpBuddyEvents,
  type OmpBuddyLog,
  type PersonalityCompleter,
  type TurnCommentCompleter,
} from "./events.ts";
import { OmpIdentityProvider } from "./identity.ts";
import { OmpBuddyLogger } from "./logger.ts";
import { OmpBuddyStorage } from "./storage.ts";
import { OmpBuddyUI } from "./ui.ts";
import type { OmpBuddyContext, OmpBuddyUiContext } from "./context.ts";
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

type EventHandler = (event: unknown, context: OmpBuddyContext) => unknown | Promise<unknown>;
type CommandHandler = (args: string, context: OmpBuddyUiContext) => unknown | Promise<unknown>;
function assistantMessage(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "openai-completions",
    provider: "openai",
    model: "test-model",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: 0,
  };
}


function createHarness(
  stateDir: string,
  options?: { completePersonality?: PersonalityCompleter },
) {
  const handlers = new Map<string, EventHandler>();
  const commands = new Map<string, CommandHandler>();
  const statuses: Array<{ key: string; text: string | undefined }> = [];
  const widgets: Array<{ key: string; content: string[] | undefined }> = [];
  const notifications: Array<{ message: string; type: string | undefined }> = [];

  const extensionApi = {
    on(event: string, handler: EventHandler) {
      handlers.set(event, handler);
    },
    registerCommand(
      name: string,
      command: { handler: CommandHandler },
    ) {
      commands.set(name, command.handler);
    },
  } as ExtensionAPI;

  const context = {
    ui: {
      setStatus(key: string, text: string | undefined) {
        statuses.push({ key, text });
      },
      setWidget(key: string, content: string[] | undefined) {
        widgets.push({ key, content });
      },
      notify(message: string, type?: "info" | "warning" | "error") {
        notifications.push({ message, type });
      },
    },
    model: undefined,
    modelRegistry: {
      find() {
        return undefined;
      },
      async getApiKeyForProvider() {
        return undefined;
      },
      getProviderHeaders() {
        return undefined;
      },
    },
    sessionManager: {
      getBranch() {
        return [];
      },
    },
  } satisfies OmpBuddyContext;

  const storage = new OmpBuddyStorage(stateDir);
  const identity = new OmpIdentityProvider(storage);
  const logger = new OmpBuddyLogger(storage);
  const service = new BuddyCommandService({
    identity,
    buddies: storage,
    reactions: storage,
    config: storage,
    events: storage,
  });
  const ui = new OmpBuddyUI(storage);

  registerOmpBuddyEvents(extensionApi, {
    service,
    storage,
    ui,
    logger,
    completePersonality: options?.completePersonality,
  });
  registerBuddyCommands(extensionApi, { service, storage, ui });

  return { commands, context, handlers, notifications, service, statuses, widgets };
}

async function emit(
  handlers: Map<string, EventHandler>,
  name: string,
  event: unknown,
  context: OmpBuddyContext,
): Promise<void> {
  const handler = handlers.get(name);
  expect(handler).toBeDefined();
  await handler?.(event, context);
}

describe("OMP extension behavior", () => {
  test("registers the command and all four lifecycle handlers", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "omp-buddy-registration-"));
    temporaryDirectories.push(stateDir);
    const harness = createHarness(stateDir);

    expect([...harness.commands.keys()]).toEqual(["buddy"]);
    expect([...harness.handlers.keys()].sort()).toEqual([
      "input",
      "session_shutdown",
      "session_start",
      "tool_result",
      "turn_end",
    ]);
  });

  test("handles session, input, tool-result, turn-end, and command dispatch with native UI rendering", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "omp-buddy-lifecycle-"));
    temporaryDirectories.push(stateDir);
    const harness = createHarness(stateDir);
    const storage = new OmpBuddyStorage(stateDir);
    storage.saveOmpConfig({ commentCooldown: 0 });

    await emit(harness.handlers, "session_start", { type: "session_start" }, harness.context);
    const companion = storage.loadActive();
    expect(companion).not.toBeNull();
    expect(harness.statuses.at(-1)?.key).toBe("buddy");
    expect(harness.widgets.at(-1)?.content?.join("\n")).toContain(companion?.name ?? "");
    expect(harness.notifications.some(({ message }) => message.includes("hatched"))).toBe(true);

    await emit(
      harness.handlers,
      "input",
      { type: "input", source: "interactive", text: `hello ${companion?.name}` },
      harness.context,
    );
    expect(storage.loadLatest()?.reason).toBe("turn");

    const bashResult: BashToolResultEvent = {
      type: "tool_result",
      toolCallId: "tool-1",
      toolName: "bash",
      input: { command: "bun test" },
      content: [{ type: "text", text: "command failed at line 17" }],
      isError: false,
      details: { exitCode: 1 },
    };
    expect(isOmpBashToolResult(bashResult)).toBe(true);
    await emit(harness.handlers, "tool_result", bashResult, harness.context);
    expect(storage.loadLatest()?.reason).toBe("error");

    const turnEvent = {
      type: "turn_end",
      turnIndex: 1,
      message: assistantMessage(
        "The focused tests now pass for `adapters/omp/events.ts`.",
      ),
      toolResults: [],
    } satisfies TurnEndEvent;
    await emit(harness.handlers, "turn_end", turnEvent, harness.context);
    expect(storage.loadLatest()?.reaction).toContain("adapters/omp/events.ts");

    const buddyCommand = harness.commands.get("buddy");
    expect(buddyCommand).toBeDefined();
    await buddyCommand?.("pet", harness.context);
    expect(storage.loadLatest()?.reason).toBe("pet");
    expect(harness.statuses.length).toBeGreaterThanOrEqual(5);
    expect(harness.widgets.length).toBeGreaterThanOrEqual(5);
  });

  test("session_start increments sessions and active-day counters once", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "omp-buddy-session-count-"));
    temporaryDirectories.push(stateDir);
    const harness = createHarness(stateDir);
    const storage = new OmpBuddyStorage(stateDir);
    storage.saveOmpConfig({ commentCooldown: 0 });

    await emit(harness.handlers, "session_start", { type: "session_start" }, harness.context);
    expect(storage.loadCounters().sessions).toBe(1);
    expect(storage.loadCounters().days_active).toBe(1);

    await emit(harness.handlers, "session_start", { type: "session_start" }, harness.context);
    expect(storage.loadCounters().sessions).toBe(2);
  });

  test("matches name mentions for punctuation and emoji-ending names", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "omp-buddy-name-mention-"));
    temporaryDirectories.push(stateDir);
    const harness = createHarness(stateDir);
    const storage = new OmpBuddyStorage(stateDir);
    storage.saveOmpConfig({ commentCooldown: 0 });

    await emit(harness.handlers, "session_start", { type: "session_start" }, harness.context);
    const companion = storage.loadActive();
    expect(companion).not.toBeNull();

    await emit(
      harness.handlers,
      "input",
      { type: "input", source: "interactive", text: `${companion?.name}! you rock` },
      harness.context,
    );
    expect(storage.loadLatest()?.reason).toBe("turn");

    await emit(
      harness.handlers,
      "input",
      { type: "input", source: "interactive", text: `look at ${companion?.name}✨` },
      harness.context,
    );
    expect(storage.loadLatest()?.reason).toBe("turn");
  });

  test("classifies bash test failures before generic tool errors", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "omp-buddy-test-failure-"));
    temporaryDirectories.push(stateDir);
    const harness = createHarness(stateDir);
    const storage = new OmpBuddyStorage(stateDir);
    storage.saveOmpConfig({ commentCooldown: 0 });

    await emit(harness.handlers, "session_start", { type: "session_start" }, harness.context);

    const bashResult: BashToolResultEvent = {
      type: "tool_result",
      toolCallId: "tool-2",
      toolName: "bash",
      input: { command: "bun test" },
      content: [{ type: "text", text: "2 tests failed" }],
      isError: true,
      details: { exitCode: 1 },
    };
    await emit(harness.handlers, "tool_result", bashResult, harness.context);

    expect(storage.loadLatest()?.reason).toBe("test-fail");
    expect(storage.loadCounters().tests_failed).toBe(1);
    expect(storage.loadCounters().errors_seen).toBe(0);
  });

  test("gates test/diff/success heuristics to bash results", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "omp-buddy-non-execution-"));
    temporaryDirectories.push(stateDir);
    const harness = createHarness(stateDir);
    const storage = new OmpBuddyStorage(stateDir);
    storage.saveOmpConfig({ commentCooldown: 0 });

    await emit(harness.handlers, "session_start", { type: "session_start" }, harness.context);

    const readResult = {
      type: "tool_result",
      toolCallId: "tool-3",
      toolName: "read",
      input: { path: "/dev/null" },
      content: [{ type: "text", text: "2 tests failed" }],
      isError: false,
      details: undefined,
    } satisfies ToolResultEvent;
    await emit(harness.handlers, "tool_result", readResult, harness.context);
    expect(storage.loadCounters().tests_failed).toBe(0);
    expect(storage.loadCounters().errors_seen).toBe(0);

    const readError = {
      type: "tool_result",
      toolCallId: "tool-4",
      toolName: "read",
      input: { path: "/dev/null" },
      content: [{ type: "text", text: "command failed at line 17" }],
      isError: true,
      details: undefined,
    } satisfies ToolResultEvent;
    await emit(harness.handlers, "tool_result", readError, harness.context);
    expect(storage.loadLatest()?.reason).toBe("error");
    expect(storage.loadCounters().errors_seen).toBe(1);
    expect(storage.loadCounters().tests_failed).toBe(0);
  });
  test("still updates counters on cooldown without saving a passive reaction", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "omp-buddy-cooldown-counters-"));
    temporaryDirectories.push(stateDir);
    const storage = new OmpBuddyStorage(stateDir);
    storage.saveConfig({ commentCooldown: 60 });
    storage.saveLatest({ reaction: "*stays quiet*", reason: "turn", timestamp: Date.now() });
    const harness = createHarness(stateDir);

    await emit(harness.handlers, "session_start", { type: "session_start" } as SessionStartEvent, harness.context);

    const bashResult: BashToolResultEvent = {
      type: "tool_result",
      toolCallId: "tool-cooldown",
      toolName: "bash",
      input: { command: "bun test" },
      content: [{ type: "text", text: "2 tests failed" }],
      isError: true,
      details: { exitCode: 1 },
    };
    await emit(harness.handlers, "tool_result", bashResult, harness.context);
    expect(storage.loadCounters().tests_failed).toBe(1);
    expect(storage.loadLatest()?.reason).toBe("turn");

    await emit(harness.handlers, "tool_result", bashResult, harness.context);
    expect(storage.loadCounters().tests_failed).toBe(2);
  });
});

const completionCompanion: Companion = {
  bones: {
    species: "owl",
    rarity: "common",
    shiny: false,
    eye: "·",
    hat: "none",
    peak: "WISDOM",
    dump: "CHAOS",
    stats: { DEBUGGING: 50, PATIENCE: 50, CHAOS: 5, WISDOM: 90, SNARK: 40 },
  },
  name: "Nimbus",
  personality: "Careful and concise.",
  hatchedAt: 0,
  userId: "test-user",
};

describe("OMP turn-comment adaptation", () => {
  test("uses OMP getApiKeyForProvider and provider headers for contextual completion", async () => {
    const calls: string[] = [];
    let completionOptions: Parameters<TurnCommentCompleter>[2] | undefined;
    let authOptions: { baseUrl?: string; modelId?: string; signal?: AbortSignal } | undefined;
    const model = getBundledModels("openai")[0];
    if (!model) throw new Error("Expected an OpenAI model fixture.");
    const context = {
      ui: {
        notify() {},
        setStatus() {},
        setWidget() {},
      },
      model,
      modelRegistry: {
        find() {
          return model;
        },
        async getApiKeyForProvider(
          provider: string,
          _sessionId?: string,
          options?: { baseUrl?: string; modelId?: string; signal?: AbortSignal },
        ) {
          calls.push(`key:${provider}:${options?.modelId ?? ""}`);
          authOptions = options;
          return "secret-key";
        },
        getProviderHeaders(provider: string) {
          calls.push(`headers:${provider}`);
          return { "x-provider-header": "present" };
        },
      },
      sessionManager: {
        getBranch() {
          return [];
        },
      },
    } satisfies OmpBuddyContext;
    const completeTurnComment: TurnCommentCompleter = async (selectedModel, _request, options) => {
      completionOptions = options;
      const response: AssistantMessage = {
        role: "assistant",
        content: [{ type: "text", text: "*nods* the provider header made it through." }],
        api: selectedModel.api,
        provider: selectedModel.provider,
        model: selectedModel.id,
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "stop",
        timestamp: 0,
      };
      return response;
    };
    const logger = {
      info() {},
      warn() {},
      error() {},
      debug() {},
    } satisfies OmpBuddyLog;
    const event = {
      type: "turn_end",
      turnIndex: 2,
      message: assistantMessage(
        "Updated the OMP credential adapter and verified the headers.",
      ),
      toolResults: [],
    } satisfies TurnEndEvent;

    const result = await generateTurnComment(
      context,
      completionCompanion,
      event,
      logger,
      completeTurnComment,
    );

    expect(calls).toEqual([`key:${model.provider}:${model.id}`, "headers:openai"]);
    expect(authOptions?.baseUrl).toBe(model.baseUrl);
    expect(authOptions?.modelId).toBe(model.id);
    expect(authOptions?.signal).toBeInstanceOf(AbortSignal);
    expect(completionOptions).toMatchObject({
      apiKey: "secret-key",
      headers: { "x-provider-header": "present" },
    });
    expect(completionOptions?.signal).toBeInstanceOf(AbortSignal);
    expect(completionOptions?.signal?.aborted).toBe(false);
    expect(result).toEqual({
      comment: "*nods* the provider header made it through.",
      source: "llm",
    });
  });

  test("falls back deterministically when no completion model is available", () => {
    const message = assistantMessage(
      "The focused tests for `core/engine.ts` now pass.",
    );

    const first = deriveTurnComment(completionCompanion, message);
    const second = deriveTurnComment(completionCompanion, message);
    expect(first).toBe("*takes note* core/engine.ts got the attention this turn.");
    expect(second).toBe(first);
  });
  async function runWithDiagnostic(diagnostic: boolean) {
    const previous = process.env.BUDDY_DIAGNOSTIC_PREVIEWS;
    if (diagnostic) {
      process.env.BUDDY_DIAGNOSTIC_PREVIEWS = "1";
    } else {
      delete process.env.BUDDY_DIAGNOSTIC_PREVIEWS;
    }
    try {
      const longAssistant = "a".repeat(5000);
      const longTool = "b".repeat(5000);
      const longUser = "c".repeat(5000);
      const model = getBundledModels("openai")[0];
      if (!model) throw new Error("Expected an OpenAI model fixture.");

      const logs: Array<{ level: string; event: string; data: Record<string, unknown> }> = [];
      const logger: OmpBuddyLog = {
        info(event, data) { logs.push({ level: "info", event, data: data ?? {} }); },
        warn(event, data) { logs.push({ level: "warn", event, data: data ?? {} }); },
        error(event, data) { logs.push({ level: "error", event, data: data ?? {} }); },
        debug(event, data) { logs.push({ level: "debug", event, data: data ?? {} }); },
      };

      const context = {
        ui: { notify() {}, setStatus() {}, setWidget() {} },
        model,
        modelRegistry: {
          find() {
            return model;
          },
          async getApiKeyForProvider() {
            return "secret-key";
          },
          getProviderHeaders() {
            return {};
          },
        },
        sessionManager: {
          getBranch() {
            return [
              {
                type: "message",
                message: {
                  role: "user",
                  content: [{ type: "text", text: longUser }],
                },
              },
            ];
          },
        },
      } as unknown as OmpBuddyContext;

      const completeTurnComment: TurnCommentCompleter = async () => ({
        role: "assistant",
        content: [{ type: "text", text: "*nods* done." }],
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "stop",
        timestamp: 0,
      });

      const event = {
        type: "turn_end",
        turnIndex: 2,
        message: assistantMessage(longAssistant),
        toolResults: [
          {
            role: "toolResult",
            toolCallId: "tool-1",
            toolName: "bash",
            content: [{ type: "text", text: longTool }],
            isError: false,
            details: { exitCode: 0 },
            timestamp: 0,
          },
        ],
      } satisfies TurnEndEvent;

      const result = await generateTurnComment(
        context,
        completionCompanion,
        event,
        logger,
        completeTurnComment,
      );

      return { result, logs, longAssistant, longTool, longUser };
    } finally {
      if (previous === undefined) {
        delete process.env.BUDDY_DIAGNOSTIC_PREVIEWS;
      } else {
        process.env.BUDDY_DIAGNOSTIC_PREVIEWS = previous;
      }
    }
  }

  test("logs only lengths and metadata at info; omits content previews by default", async () => {
    const { result, logs, longAssistant, longTool, longUser } = await runWithDiagnostic(false);

    expect(result).toEqual({ comment: "*nods* done.", source: "llm" });

    const attempt = logs.find((l) => l.event === "turn_comment_llm_attempt");
    expect(attempt).toBeDefined();
    expect(attempt!.data.assistantPreview).toBeUndefined();
    expect(attempt!.data.toolPreview).toBeUndefined();
    expect(attempt!.data.userTextPreview).toBeUndefined();
    expect(attempt!.data.assistantLength).toBe(longAssistant.length);
    expect(attempt!.data.toolLength).toBe(Math.min(longTool.length, 4000));
    expect(attempt!.data.userTextLength).toBe(Math.min(longUser.length, 4000));

    const prompt = logs.find((l) => l.event === "turn_comment_llm_prompt");
    expect(prompt).toBeDefined();
    expect(prompt!.data.assistantPreview).toBeUndefined();
    expect(prompt!.data.toolPreview).toBeUndefined();
    expect(prompt!.data.userTextPreview).toBeUndefined();
    expect(prompt!.data.systemPromptPreview).toBeUndefined();
    expect(prompt!.data.promptPreview).toBeUndefined();
    expect(prompt!.data.assistantLength).toBe(longAssistant.length);
    expect(prompt!.data.toolLength).toBe(Math.min(longTool.length, 4000));
    expect(prompt!.data.userTextLength).toBe(Math.min(longUser.length, 4000));

    const resultLog = logs.find((l) => l.event === "turn_comment_llm_result");
    expect(resultLog).toBeDefined();
    expect(resultLog!.data.normalized).toBeUndefined();
    expect(resultLog!.data.rawPreview).toBeUndefined();
    expect(resultLog!.data.rawLength).toBe(12);
    expect(resultLog!.data.normalizedLength).toBe(12);
  });

  test("includes bounded previews in debug logs when diagnostic opt-in is enabled", async () => {
    const { result, logs, longAssistant, longTool, longUser } = await runWithDiagnostic(true);

    expect(result).toEqual({ comment: "*nods* done.", source: "llm" });

    const attempt = logs.find((l) => l.event === "turn_comment_llm_attempt");
    expect(attempt).toBeDefined();
    expect(attempt!.data.assistantPreview).toBeUndefined();

    const prompt = logs.find((l) => l.event === "turn_comment_llm_prompt");
    expect(prompt).toBeDefined();
    expect(prompt!.data.assistantPreview).toBe(longAssistant.slice(0, 200));
    expect(prompt!.data.toolPreview).toBe(longTool.slice(0, 200));
    expect(prompt!.data.userTextPreview).toBe(longUser.slice(0, 200));
    if (typeof prompt!.data.systemPromptPreview === "string") {
      expect(prompt!.data.systemPromptPreview.length).toBeLessThanOrEqual(800);
    }
    if (typeof prompt!.data.promptPreview === "string") {
      expect(prompt!.data.promptPreview.length).toBeLessThanOrEqual(1200);
    }
  });

  test("hanging completion aborts under budget and falls back", async () => {
    const model = getBundledModels("openai")[0];
    if (!model) throw new Error("Expected an OpenAI model fixture.");

    let seenSignal: AbortSignal | undefined;
    const hangingComplete: TurnCommentCompleter = async (_model, _request, options) => {
      seenSignal = options?.signal;
      await new Promise<never>(() => {});
      throw new Error("unreachable");
    };

    const logs: Array<{ level: string; event: string; data: Record<string, unknown> }> = [];
    const logger: OmpBuddyLog = {
      info(event, data) { logs.push({ level: "info", event, data: data ?? {} }); },
      warn(event, data) { logs.push({ level: "warn", event, data: data ?? {} }); },
      error(event, data) { logs.push({ level: "error", event, data: data ?? {} }); },
      debug(event, data) { logs.push({ level: "debug", event, data: data ?? {} }); },
    };

    const context = {
      ui: { notify() {}, setStatus() {}, setWidget() {} },
      model,
      modelRegistry: {
        find() {
          return model;
        },
        async getApiKeyForProvider() {
          return "secret-key";
        },
        getProviderHeaders() {
          return {};
        },
      },
      sessionManager: {
        getBranch() {
          return [];
        },
      },
    } satisfies OmpBuddyContext;

    const event = {
      type: "turn_end",
      turnIndex: 3,
      message: assistantMessage(
        "The focused tests for `adapters/omp/events.ts` now pass.",
      ),
      toolResults: [],
    } satisfies TurnEndEvent;

    const started = Date.now();
    const result = await generateTurnComment(
      context,
      completionCompanion,
      event,
      logger,
      hangingComplete,
      { timeoutMs: 40 },
    );
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(1_000);
    expect(elapsed).toBeLessThan(TURN_COMMENT_TIMEOUT_MS);
    expect(seenSignal).toBeInstanceOf(AbortSignal);
    expect(seenSignal?.aborted).toBe(true);
    expect(result.source).toBe("fallback");
    expect(result.comment).toContain("adapters/omp/events.ts");
    expect(logs.some((entry) => entry.event === "turn_comment_llm_timeout")).toBe(true);
  });

  test("hanging auth aborts under budget and falls back", async () => {
    const model = getBundledModels("openai")[0];
    if (!model) throw new Error("Expected an OpenAI model fixture.");

    let seenSignal: AbortSignal | undefined;
    let completionCalled = false;
    const hangingAuthContext = {
      ui: { notify() {}, setStatus() {}, setWidget() {} },
      model,
      modelRegistry: {
        find() {
          return model;
        },
        async getApiKeyForProvider(
          _provider: string,
          _sessionId?: string,
          options?: { signal?: AbortSignal },
        ) {
          seenSignal = options?.signal;
          await new Promise<never>(() => {});
          return "secret-key";
        },
        getProviderHeaders() {
          return {};
        },
      },
      sessionManager: {
        getBranch() {
          return [];
        },
      },
    } satisfies OmpBuddyContext;

    const completeTurnComment: TurnCommentCompleter = async () => {
      completionCalled = true;
      throw new Error("completion should not run when auth hangs");
    };

    const logs: Array<{ level: string; event: string; data: Record<string, unknown> }> = [];
    const logger: OmpBuddyLog = {
      info(event, data) { logs.push({ level: "info", event, data: data ?? {} }); },
      warn(event, data) { logs.push({ level: "warn", event, data: data ?? {} }); },
      error(event, data) { logs.push({ level: "error", event, data: data ?? {} }); },
      debug(event, data) { logs.push({ level: "debug", event, data: data ?? {} }); },
    };

    const event = {
      type: "turn_end",
      turnIndex: 5,
      message: assistantMessage(
        "The focused tests for `adapters/omp/events.ts` now pass.",
      ),
      toolResults: [],
    } satisfies TurnEndEvent;

    const started = Date.now();
    const result = await generateTurnComment(
      hangingAuthContext,
      completionCompanion,
      event,
      logger,
      completeTurnComment,
      { timeoutMs: 40 },
    );
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(1_000);
    expect(elapsed).toBeLessThan(TURN_COMMENT_TIMEOUT_MS);
    expect(seenSignal).toBeInstanceOf(AbortSignal);
    expect(seenSignal?.aborted).toBe(true);
    expect(completionCalled).toBe(false);
    expect(result.source).toBe("fallback");
    expect(result.comment).toContain("adapters/omp/events.ts");
    expect(logs.some((entry) => entry.event === "turn_comment_llm_timeout")).toBe(true);
  });

  test("invalid timeoutMs values fall back to the default positive bound", async () => {
    expect(resolveTurnCommentTimeoutMs(undefined)).toBe(TURN_COMMENT_TIMEOUT_MS);
    expect(resolveTurnCommentTimeoutMs(0)).toBe(TURN_COMMENT_TIMEOUT_MS);
    expect(resolveTurnCommentTimeoutMs(-1)).toBe(TURN_COMMENT_TIMEOUT_MS);
    expect(resolveTurnCommentTimeoutMs(Number.NaN)).toBe(TURN_COMMENT_TIMEOUT_MS);
    expect(resolveTurnCommentTimeoutMs(Number.POSITIVE_INFINITY)).toBe(TURN_COMMENT_TIMEOUT_MS);
    expect(resolveTurnCommentTimeoutMs(null as unknown as number)).toBe(TURN_COMMENT_TIMEOUT_MS);
    expect(resolveTurnCommentTimeoutMs(250)).toBe(250);

    const model = getBundledModels("openai")[0];
    if (!model) throw new Error("Expected an OpenAI model fixture.");

    const logs: Array<{ level: string; event: string; data: Record<string, unknown> }> = [];
    const logger: OmpBuddyLog = {
      info(event, data) { logs.push({ level: "info", event, data: data ?? {} }); },
      warn(event, data) { logs.push({ level: "warn", event, data: data ?? {} }); },
      error(event, data) { logs.push({ level: "error", event, data: data ?? {} }); },
      debug(event, data) { logs.push({ level: "debug", event, data: data ?? {} }); },
    };

    const context = {
      ui: { notify() {}, setStatus() {}, setWidget() {} },
      model,
      modelRegistry: {
        find() {
          return model;
        },
        async getApiKeyForProvider() {
          return "secret-key";
        },
        getProviderHeaders() {
          return {};
        },
      },
      sessionManager: {
        getBranch() {
          return [];
        },
      },
    } satisfies OmpBuddyContext;

    const completeTurnComment: TurnCommentCompleter = async () => ({
      role: "assistant",
      content: [{ type: "text", text: "*nods* timeout sanitized." }],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: 0,
    });

    const event = {
      type: "turn_end",
      turnIndex: 6,
      message: assistantMessage(
        "The focused tests for `adapters/omp/events.ts` now pass.",
      ),
      toolResults: [],
    } satisfies TurnEndEvent;

    const result = await generateTurnComment(
      context,
      completionCompanion,
      event,
      logger,
      completeTurnComment,
      { timeoutMs: 0 },
    );

    expect(result).toEqual({
      comment: "*nods* timeout sanitized.",
      source: "llm",
    });
    const attempt = logs.find((entry) => entry.event === "turn_comment_llm_attempt");
    expect(attempt?.data.timeoutMs).toBe(TURN_COMMENT_TIMEOUT_MS);
  });

  test("hanging turn_end completion still renders fallback widget under handler budget", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "omp-buddy-hang-turn-"));
    temporaryDirectories.push(stateDir);
    const model = getBundledModels("openai")[0];
    if (!model) throw new Error("Expected an OpenAI model fixture.");

    const handlers = new Map<string, EventHandler>();
    const commands = new Map<string, CommandHandler>();
    const statuses: Array<{ key: string; text: string | undefined }> = [];
    const widgets: Array<{ key: string; content: string[] | undefined }> = [];
    const notifications: Array<{ message: string; type: string | undefined }> = [];

    const extensionApi = {
      on(event: string, handler: EventHandler) {
        handlers.set(event, handler);
      },
      registerCommand(name: string, command: { handler: CommandHandler }) {
        commands.set(name, command.handler);
      },
    } as ExtensionAPI;

    const context = {
      ui: {
        setStatus(key: string, text: string | undefined) {
          statuses.push({ key, text });
        },
        setWidget(key: string, content: string[] | undefined) {
          widgets.push({ key, content });
        },
        notify(message: string, type?: "info" | "warning" | "error") {
          notifications.push({ message, type });
        },
      },
      model,
      modelRegistry: {
        find(provider: string, id: string) {
          return provider === model.provider && id === model.id ? model : undefined;
        },
        async getApiKeyForProvider() {
          return "secret-key";
        },
        getProviderHeaders() {
          return {};
        },
      },
      sessionManager: {
        getBranch() {
          return [];
        },
      },
    } satisfies OmpBuddyContext;

    const hangingComplete: TurnCommentCompleter = async () => {
      await new Promise<never>(() => {});
      throw new Error("unreachable");
    };

    registerOmpBuddyExtension(extensionApi, {
      stateDir,
      completeTurnComment: hangingComplete,
    });

    const storage = new OmpBuddyStorage(stateDir);
    storage.saveOmpConfig({
      commentCooldown: 0,
      turnCommentModel: { provider: model.provider, model: model.id },
      turnCommentTimeoutMs: 40,
    });

    await emit(handlers, "session_start", { type: "session_start" }, context);
    const companion = storage.loadActive();
    expect(companion).not.toBeNull();

    const turnEvent = {
      type: "turn_end",
      turnIndex: 1,
      message: assistantMessage(
        "The focused tests now pass for `adapters/omp/events.ts`.",
      ),
      toolResults: [],
    } satisfies TurnEndEvent;

    const started = Date.now();
    await emit(handlers, "turn_end", turnEvent, context);
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(1_000);
    expect(elapsed).toBeLessThan(30_000);
    const latest = storage.loadLatest();
    expect(latest?.reason).toBe("turn");
    expect(latest?.reaction).toContain("adapters/omp/events.ts");
    const widget = widgets.at(-1)?.content?.join("\n") ?? "";
    expect(widget).toContain(companion?.name ?? "");
    expect(widget).toContain("adapters/omp/events.ts");
    expect(commands.size).toBe(1);
    expect(statuses.at(-1)?.key).toBe("buddy");
    expect(notifications.length).toBeGreaterThan(0);
  });
});
describe("OMP looksLikeTestFailure", () => {
  test("detects explicit failure counts", () => {
    expect(looksLikeTestFailure("2 tests failed")).toBe(true);
    expect(looksLikeTestFailure("1 spec failing")).toBe(true);
  });

  test("ignores generic failure glyphs without test runner context", () => {
    expect(looksLikeTestFailure("random ✗ marker")).toBe(false);
    expect(looksLikeTestFailure("FAIL")).toBe(false);
    expect(looksLikeTestFailure("not ok")).toBe(false);
  });

  test("detects generic failure markers when test runner context is nearby", () => {
    expect(looksLikeTestFailure("bun test\nFAIL")).toBe(true);
    expect(looksLikeTestFailure("npm test\n✗")).toBe(true);
    expect(looksLikeTestFailure("pytest\nnot ok")).toBe(true);
  });
});

describe("OMP session_start notifications", () => {
  test("notifies achievements on every session start while hatch notice is creation-only", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "omp-buddy-session-notify-"));
    temporaryDirectories.push(stateDir);
    const harness = createHarness(stateDir);
    const storage = new OmpBuddyStorage(stateDir);
    storage.saveOmpConfig({ commentCooldown: 0 });

    await emit(harness.handlers, "session_start", { type: "session_start" }, harness.context);
    expect(harness.notifications.some((n) => n.message.includes("hatched"))).toBe(true);
    expect(harness.notifications.some((n) => n.message.includes("Unlocked:"))).toBe(true);

    harness.notifications.length = 0;
    storage.increment("commands_run", 50);

    await emit(harness.handlers, "session_start", { type: "session_start" }, harness.context);
    expect(harness.notifications.some((n) => n.message.includes("hatched"))).toBe(false);
    expect(harness.notifications.some((n) => n.message.includes("Power User"))).toBe(true);
  });
});

describe("OMP buddy command achievements", () => {
  test("show command merges achievements from incrementCommandsRun into notifications", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "omp-buddy-command-merge-"));
    temporaryDirectories.push(stateDir);
    const harness = createHarness(stateDir);
    const storage = new OmpBuddyStorage(stateDir);
    storage.saveOmpConfig({ commentCooldown: 0 });
    storage.increment("commands_run", 49);

    const handler = harness.commands.get("buddy");
    expect(handler).toBeDefined();
    await handler!("show", harness.context);

    expect(storage.loadCounters().commands_run).toBe(50);
    expect(harness.notifications.some((n) => n.message.includes("Power User"))).toBe(true);
    expect(harness.notifications.some((n) => n.message.includes(storage.loadActive()?.name ?? ""))).toBe(true);
  });
});
function getTextFromUserMessage(request: CompletionContext): string {
  const message = request.messages[0];
  if (!message || message.role !== "user") return "";
  if (typeof message.content === "string") return message.content;
  const textBlock = message.content.find((block) => block.type === "text");
  return textBlock?.type === "text" ? textBlock.text : "";
}

function buildOmpPersonalityContext(options: {
  model?: Model;
  apiKey?: string;
  headers?: Record<string, string>;
}) {
  const model = options.model ?? getBundledModels("openai")[0];
  if (!model) throw new Error("Expected an OMP model fixture.");
  return {
    ui: { notify() {}, setStatus() {}, setWidget() {} },
    model,
    modelRegistry: {
      find() {
        return model;
      },
      async getApiKeyForProvider() {
        return options.apiKey;
      },
      getProviderHeaders() {
        return options.headers;
      },
    },
    sessionManager: { getBranch() { return []; } },
  } satisfies OmpBuddyContext;
}

describe("generatePersonality", () => {
  test("returns a generated personality and exercises the prompt helper", async () => {
    const model = getBundledModels("openai")[0];
    if (!model) throw new Error("Expected an OMP model fixture.");
    let capturedRequest: CompletionContext | undefined;
    const completePersonality: PersonalityCompleter = async (_model, request) => {
      capturedRequest = request;
      return assistantMessage(JSON.stringify({ name: "Nimbus", personality: "A watchful owl." }));
    };
    const ctx = buildOmpPersonalityContext({ model, apiKey: "secret-key" });

    const result = await generatePersonality(ctx, completionCompanion, { info() {}, warn() {}, error() {}, debug() {} }, completePersonality);

    expect(result).toBe("A watchful owl.");
    const promptText = getTextFromUserMessage(capturedRequest!);
    expect(promptText).toContain(`Species: ${completionCompanion.bones.species}`);
    expect(promptText).toContain(`Rarity: ${completionCompanion.bones.rarity.toUpperCase()}`);
    expect(promptText).toContain("Stats:");
    expect(promptText).toContain('"personality"');
  });

  test("prefers configured turnCommentModel and uses resolveTurnCommentModel", async () => {
    const model = getBundledModels("openai")[0];
    if (!model) throw new Error("Expected an OMP model fixture.");
    let findArgs: { provider: string; model: string } | undefined;
    const base = buildOmpPersonalityContext({ model, apiKey: "secret-key" });
    const ctx = {
      ...base,
      model: undefined,
      modelRegistry: {
        ...base.modelRegistry,
        find(provider: string, modelId: string) {
          findArgs = { provider, model: modelId };
          return provider === "openai" && modelId === model.id ? model : undefined;
        },
      },
    } satisfies OmpBuddyContext;
    const completePersonality: PersonalityCompleter = async () =>
      assistantMessage(JSON.stringify({ personality: "Config chosen." }));

    const result = await generatePersonality(
      ctx,
      completionCompanion,
      { info() {}, warn() {}, error() {}, debug() {} },
      completePersonality,
      { modelOverride: { provider: "openai", model: model.id } },
    );

    expect(result).toBe("Config chosen.");
    expect(findArgs).toEqual({ provider: "openai", model: model.id });
  });

  test("falls back to session model when configured turnCommentModel is missing", async () => {
    const model = getBundledModels("openai")[0];
    if (!model) throw new Error("Expected an OMP model fixture.");
    const base = buildOmpPersonalityContext({ model, apiKey: "secret-key" });
    const ctx = {
      ...base,
      modelRegistry: {
        ...base.modelRegistry,
        find(provider: string, modelId: string) {
          return provider === "openai" && modelId === model.id ? model : undefined;
        },
      },
    } satisfies OmpBuddyContext;
    let receivedModel: Model | undefined;
    const completePersonality: PersonalityCompleter = async (m) => {
      receivedModel = m as Model;
      return assistantMessage(JSON.stringify({ personality: "Fallback." }));
    };

    const result = await generatePersonality(
      ctx,
      completionCompanion,
      { info() {}, warn() {}, error() {}, debug() {} },
      completePersonality,
      { modelOverride: { provider: "missing", model: "missing" } },
    );

    expect(result).toBe("Fallback.");
    expect(receivedModel).toBe(model);
  });


  test("falls back to null for malformed or empty responses", async () => {
    const cases: PersonalityCompleter[] = [
      async () => assistantMessage("not json"),
      async () => assistantMessage(JSON.stringify({ name: "Nimbus" })),
      async () => assistantMessage(JSON.stringify({ personality: "" })),
      async () => assistantMessage(JSON.stringify({ personality: "x".repeat(501) })),
    ];
    for (const completePersonality of cases) {
      const ctx = buildOmpPersonalityContext({ apiKey: "secret-key" });
      const result = await generatePersonality(ctx, completionCompanion, { info() {}, warn() {}, error() {}, debug() {} }, completePersonality);
      expect(result).toBeNull();
    }
  });

  test("falls back when there is no model, no auth, an abort, or a provider error", async () => {
    const model = getBundledModels("openai")[0];
    if (!model) throw new Error("Expected an OMP model fixture.");
    const logger = { info() {}, warn() {}, error() {}, debug() {} };

    const noModelCtx = { ...buildOmpPersonalityContext({ model, apiKey: "secret-key" }), model: undefined } satisfies OmpBuddyContext;
    expect(await generatePersonality(noModelCtx, completionCompanion, logger)).toBeNull();

    const noAuthCtx = buildOmpPersonalityContext({ model, apiKey: undefined });
    expect(await generatePersonality(noAuthCtx, completionCompanion, logger)).toBeNull();

    const throwingAuthCtx = {
      ...buildOmpPersonalityContext({ model }),
      modelRegistry: {
        find() { return model; },
        async getApiKeyForProvider() { throw new Error("auth failed"); },
        getProviderHeaders() { return {}; },
      },
    } satisfies OmpBuddyContext;
    expect(await generatePersonality(throwingAuthCtx, completionCompanion, logger)).toBeNull();

    const abortedCompleter: PersonalityCompleter = async () => ({ ...assistantMessage("anything"), stopReason: "aborted" as const });
    expect(await generatePersonality(buildOmpPersonalityContext({ model, apiKey: "secret-key" }), completionCompanion, logger, abortedCompleter)).toBeNull();

    const throwingCompleter: PersonalityCompleter = async () => {
      throw new Error("provider down");
    };
    expect(await generatePersonality(buildOmpPersonalityContext({ model, apiKey: "secret-key" }), completionCompanion, logger, throwingCompleter)).toBeNull();
  });

  test("falls back to null when generation exceeds the timeout", async () => {
    const model = getBundledModels("openai")[0];
    if (!model) throw new Error("Expected an OMP model fixture.");
    const logger = { info() {}, warn() {}, error() {}, debug() {} };
    const { promise } = Promise.withResolvers<AssistantMessage>();
    const neverCompleter: PersonalityCompleter = async () => promise;
    const ctx = buildOmpPersonalityContext({ model, apiKey: "secret-key" });

    const result = await generatePersonality(
      ctx,
      completionCompanion,
      logger,
      neverCompleter,
      { timeoutMs: 10 },
    );

    expect(result).toBeNull();
  });

});

describe("session_start personality generation", () => {
  test("persists a generated personality for a newly created companion", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "omp-buddy-personality-success-"));
    temporaryDirectories.push(stateDir);
    let capturedRequest: CompletionContext | undefined;
    const completePersonality: PersonalityCompleter = async (_model, request) => {
      capturedRequest = request;
      return assistantMessage(JSON.stringify({ name: "Nimbus", personality: "A generated companion." }));
    };
    const harness = createHarness(stateDir, { completePersonality });
    const model = getBundledModels("openai")[0];
    if (!model) throw new Error("Expected an OMP model fixture.");
    const ctx = buildOmpPersonalityContext({ model, apiKey: "secret-key" });

    await emit(harness.handlers, "session_start", { type: "session_start" } as SessionStartEvent, ctx);

    const storage = new OmpBuddyStorage(stateDir);
    const active = storage.loadActive();
    expect(active).not.toBeNull();
    expect(active?.personality).toBe("A generated companion.");
    expect(getTextFromUserMessage(capturedRequest!)).toContain(`Species: ${active?.bones.species}`);
  });

  test("keeps the generic fallback when generation fails", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "omp-buddy-personality-fallback-"));
    temporaryDirectories.push(stateDir);
    const completePersonality: PersonalityCompleter = async () => assistantMessage("not json");
    const harness = createHarness(stateDir, { completePersonality });
    const model = getBundledModels("openai")[0];
    if (!model) throw new Error("Expected an OMP model fixture.");
    const ctx = buildOmpPersonalityContext({ model, apiKey: "secret-key" });

    await emit(harness.handlers, "session_start", { type: "session_start" } as SessionStartEvent, ctx);

    const storage = new OmpBuddyStorage(stateDir);
    const active = storage.loadActive();
    expect(active).not.toBeNull();
    expect(active?.personality).toContain(active?.bones.species);
  });

  test("does not overwrite a personality edited while generating", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "omp-buddy-personality-concurrent-"));
    temporaryDirectories.push(stateDir);
    const model = getBundledModels("openai")[0];
    if (!model) throw new Error("Expected an OMP model fixture.");

    const harness = createHarness(stateDir, {
      completePersonality: async () => {
        harness.service.setPersonality("User edited");
        return assistantMessage(JSON.stringify({ name: "Nimbus", personality: "A generated companion." }));
      },
    });
    const ctx = buildOmpPersonalityContext({ model, apiKey: "secret-key" });

    await emit(harness.handlers, "session_start", { type: "session_start" } as SessionStartEvent, ctx);

    const storage = new OmpBuddyStorage(stateDir);
    const active = storage.loadActive();
    expect(active).not.toBeNull();
    expect(active?.personality).toBe("User edited");
  });

});
