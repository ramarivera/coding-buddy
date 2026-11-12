import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deriveTurnComment,
  generatePersonality,
  generateTurnComment,
  looksLikeTestFailure,
  registerBuddyEvents,
  resolveTurnCommentModel,
  resolveTurnCommentTimeoutMs,
  TURN_COMMENT_TIMEOUT_MS,
  type PersonalityCompleter,
  type PiBuddyLog,
  type PiTurnCommentModelContext,
  type TurnCommentCompleter,
} from "./events.ts";
import { registerBuddyCommands } from "./commands.ts";
import { getNameReaction, getSuccessReaction } from "../../core/reactions.ts";
import type { Companion } from "../../core/model.ts";
import { getModels, type AssistantMessage, type Model, type Api, type Context as CompletionContext } from "@mariozechner/pi-ai";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  InputEvent,
  SessionStartEvent,
  ToolResultEvent,
  TurnEndEvent,
} from "@mariozechner/pi-coding-agent";
import { BuddyCommandService } from "../../core/command-service.ts";
import { PiIdentityProvider } from "./identity.ts";

import { PiBuddyLogger } from "./logger.ts";
import { PiBuddyStorage } from "./storage.ts";
import { PiBuddyUI } from "./ui.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function assistantMessage(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: text ? [{ type: "text", text }] : [],
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

const companion: Companion = {
  bones: {
    species: "snail",
    rarity: "common",
    shiny: false,
    eye: "·",
    hat: "none",
    peak: "PATIENCE",
    dump: "CHAOS",
    stats: {
      DEBUGGING: 60,
      PATIENCE: 88,
      CHAOS: 12,
      WISDOM: 55,
      SNARK: 34,
    },
  },
  name: "Ember",
  personality: "A patient snail.",
  hatchedAt: 0,
  userId: "user-123",
};

describe("getNameReaction", () => {
  test("uses Claude-style species-specific name reactions", () => {
    const reaction = getNameReaction(companion.bones.species);
    expect([
      "*slow head extension*",
      "...mmm?",
      "*trails slowly toward you*",
      "*antenna twitches*",
    ]).toContain(reaction);
  });
});

describe("getSuccessReaction", () => {
  test("uses Claude-style species-specific success reactions", () => {
    const reaction = getSuccessReaction(companion.bones.species);
    expect([
      "*slow satisfied nod*",
      "good things take time.",
      "*leaves victory slime*",
      "see? no rush was needed.",
    ]).toContain(reaction);
  });
});

describe("resolveTurnCommentModel", () => {
  test("prefers configured buddy model override when found", () => {
    const model = getModels("google")[0];
    const sessionModel = getModels("openai-codex")[0];
    if (!model || !sessionModel) throw new Error("Expected Pi model fixtures.");
    const ctx = {
      model: sessionModel,
      modelRegistry: {
        find(provider: string, id: string) {
          return provider === model.provider && id === model.id ? model : undefined;
        },
      },
    } satisfies PiTurnCommentModelContext;

    expect(resolveTurnCommentModel(ctx, undefined, {
      provider: model.provider,
      model: model.id,
    })).toMatchObject({ provider: model.provider, id: model.id });
  });

  test("falls back to session model when configured override is missing", () => {
    const sessionModel = getModels("openai-codex")[0];
    if (!sessionModel) throw new Error("Expected a Pi session model fixture.");
    const ctx = {
      model: sessionModel,
      modelRegistry: {
        find() {
          return undefined;
        },
      },
    } satisfies PiTurnCommentModelContext;

    expect(resolveTurnCommentModel(ctx, undefined, {
      provider: "google",
      model: "does-not-exist",
    })).toMatchObject({ provider: sessionModel.provider, id: sessionModel.id });
  });
  test("uses configured model from a custom stateDir", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "pi-buddy-model-config-"));
    temporaryDirectories.push(stateDir);
    const storage = new PiBuddyStorage(stateDir);
    storage.savePiConfig({ turnCommentModel: { provider: "openai", model: "custom-buddy-model" } });

    const model = getModels("openai")[0];
    if (!model) throw new Error("Expected a Pi model fixture.");
    const ctx = {
      model: undefined,
      modelRegistry: {
        find(provider: string, id: string) {
          return provider === "openai" && id === "custom-buddy-model" ? { ...model, id: "custom-buddy-model" } : undefined;
        },
      },
    } as unknown as PiTurnCommentModelContext;

    const configured = storage.loadPiConfig().turnCommentModel;
    const result = resolveTurnCommentModel(ctx, undefined, configured);
    expect(result).not.toBeNull();
    expect(result).toMatchObject({ provider: "openai", id: "custom-buddy-model" });
  });

  test("explicit override takes precedence over session model", () => {
    const sessionModel = getModels("openai-codex")[0];
    const overrideModel = getModels("google")[0];
    if (!sessionModel || !overrideModel) throw new Error("Expected Pi model fixtures.");
    const ctx = {
      model: sessionModel,
      modelRegistry: {
        find(provider: string, id: string) {
          return provider === overrideModel.provider && id === overrideModel.id ? overrideModel : undefined;
        },
      },
    } satisfies PiTurnCommentModelContext;

    expect(resolveTurnCommentModel(ctx, undefined, {
      provider: overrideModel.provider,
      model: overrideModel.id,
    })).toMatchObject({ provider: overrideModel.provider, id: overrideModel.id });
  });
});
describe("generateTurnComment", () => {
  async function runWithDiagnostic(diagnostic: boolean) {
    const previous = process.env.BUDDY_DIAGNOSTIC_PREVIEWS;
    if (diagnostic) {
      process.env.BUDDY_DIAGNOSTIC_PREVIEWS = "1";
    } else {
      delete process.env.BUDDY_DIAGNOSTIC_PREVIEWS;
    }
    try {
      const stateDir = mkdtempSync(join(tmpdir(), "pi-buddy-payload-config-"));
      temporaryDirectories.push(stateDir);
      const storage = new PiBuddyStorage(stateDir);
      const model = getModels("openai")[0];
      if (!model) throw new Error("Expected a Pi model fixture.");
      storage.savePiConfig({ turnCommentModel: { provider: model.provider, model: model.id } });

      const longAssistant = "a".repeat(5000);
      const longTool = "b".repeat(5000);
      const longUser = "c".repeat(5000);

      const event = {
        type: "turn_end",
        turnIndex: 1,
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

      const branchEntry = {
        type: "message",
        message: {
          role: "user",
          content: [{ type: "text", text: longUser }],
        },
      };

      const ctx = {
        ui: { notify() {}, setStatus() {}, setWidget() {} },
        model: undefined,
        modelRegistry: {
          find(provider: string, id: string) {
            return provider === model.provider && id === model.id ? model : undefined;
          },
          async getApiKeyAndHeaders() {
            return { ok: true, apiKey: "secret-key", headers: {} };
          },
        },
        sessionManager: {
          getBranch() {
            return [branchEntry];
          },
        },
      } as unknown as ExtensionContext;

      const logs: Array<{ level: string; event: string; data: Record<string, unknown> }> = [];
      const logger: PiBuddyLog = {
        info(event, data) { logs.push({ level: "info", event, data: data ?? {} }); },
        warn(event, data) { logs.push({ level: "warn", event, data: data ?? {} }); },
        error(event, data) { logs.push({ level: "error", event, data: data ?? {} }); },
        debug(event, data) { logs.push({ level: "debug", event, data: data ?? {} }); },
      };

      const fakeComplete = async () => assistantMessage("*nods* done.");

      const result = await generateTurnComment(
        ctx,
        companion,
        event,
        logger,
        fakeComplete,
        { modelOverride: storage.loadPiConfig().turnCommentModel },
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
    expect(attempt!.data.promptLength).toBeGreaterThan(0);

    const prompt = logs.find((l) => l.event === "turn_comment_llm_prompt");
    expect(prompt).toBeDefined();
    expect(prompt!.data.assistantPreview).toBeUndefined();
    expect(prompt!.data.toolPreview).toBeUndefined();
    expect(prompt!.data.userTextPreview).toBeUndefined();
    expect(prompt!.data.systemPromptPreview).toBeUndefined();
    expect(prompt!.data.promptPreview).toBeUndefined();

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
    const stateDir = mkdtempSync(join(tmpdir(), "pi-buddy-hang-turn-comment-"));
    temporaryDirectories.push(stateDir);
    const storage = new PiBuddyStorage(stateDir);
    const model = getModels("openai")[0];
    if (!model) throw new Error("Expected a Pi model fixture.");
    storage.savePiConfig({ turnCommentModel: { provider: model.provider, model: model.id } });

    let seenSignal: AbortSignal | undefined;
    const hangingComplete: TurnCommentCompleter = async (_model, _request, options) => {
      seenSignal = options?.signal;
      await new Promise<never>(() => {});
      throw new Error("unreachable");
    };

    const logs: Array<{ level: string; event: string; data: Record<string, unknown> }> = [];
    const logger: PiBuddyLog = {
      info(event, data) { logs.push({ level: "info", event, data: data ?? {} }); },
      warn(event, data) { logs.push({ level: "warn", event, data: data ?? {} }); },
      error(event, data) { logs.push({ level: "error", event, data: data ?? {} }); },
      debug(event, data) { logs.push({ level: "debug", event, data: data ?? {} }); },
    };

    const ctx = {
      ui: { notify() {}, setStatus() {}, setWidget() {} },
      model: undefined,
      modelRegistry: {
        find(provider: string, id: string) {
          return provider === model.provider && id === model.id ? model : undefined;
        },
        async getApiKeyAndHeaders() {
          return { ok: true, apiKey: "secret-key", headers: {} };
        },
      },
      sessionManager: {
        getBranch() {
          return [];
        },
      },
    } as unknown as ExtensionContext;

    const event = {
      type: "turn_end",
      turnIndex: 4,
      message: assistantMessage(
        "I updated adapters/pi/events.ts to stop random turn chatter.",
      ),
      toolResults: [],
    } satisfies TurnEndEvent;

    const started = Date.now();
    const result = await generateTurnComment(
      ctx,
      companion,
      event,
      logger,
      hangingComplete,
      {
        modelOverride: storage.loadPiConfig().turnCommentModel,
        timeoutMs: 40,
      },
    );
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(1_000);
    expect(elapsed).toBeLessThan(TURN_COMMENT_TIMEOUT_MS);
    expect(seenSignal).toBeInstanceOf(AbortSignal);
    expect(seenSignal?.aborted).toBe(true);
    expect(result.source).toBe("fallback");
    expect(result.comment).toContain("adapters/pi/events.ts");
    expect(logs.some((entry) => entry.event === "turn_comment_llm_timeout")).toBe(true);
  });

  test("hanging auth aborts under budget and falls back", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "pi-buddy-hang-auth-"));
    temporaryDirectories.push(stateDir);
    const storage = new PiBuddyStorage(stateDir);
    const model = getModels("openai")[0];
    if (!model) throw new Error("Expected a Pi model fixture.");
    storage.savePiConfig({ turnCommentModel: { provider: model.provider, model: model.id } });

    let completionCalled = false;
    const hangingAuthCtx = {
      ui: { notify() {}, setStatus() {}, setWidget() {} },
      model: undefined,
      modelRegistry: {
        find(provider: string, id: string) {
          return provider === model.provider && id === model.id ? model : undefined;
        },
        async getApiKeyAndHeaders() {
          await new Promise<never>(() => {});
          return { ok: true, apiKey: "secret-key", headers: {} };
        },
      },
      sessionManager: {
        getBranch() {
          return [];
        },
      },
    } as unknown as ExtensionContext;

    const logs: Array<{ level: string; event: string; data: Record<string, unknown> }> = [];
    const logger: PiBuddyLog = {
      info(event, data) { logs.push({ level: "info", event, data: data ?? {} }); },
      warn(event, data) { logs.push({ level: "warn", event, data: data ?? {} }); },
      error(event, data) { logs.push({ level: "error", event, data: data ?? {} }); },
      debug(event, data) { logs.push({ level: "debug", event, data: data ?? {} }); },
    };

    const hangingComplete: TurnCommentCompleter = async () => {
      completionCalled = true;
      throw new Error("completion should not run when auth hangs");
    };

    const event = {
      type: "turn_end",
      turnIndex: 5,
      message: assistantMessage(
        "I updated adapters/pi/events.ts to stop random turn chatter.",
      ),
      toolResults: [],
    } satisfies TurnEndEvent;

    const started = Date.now();
    const result = await generateTurnComment(
      hangingAuthCtx,
      companion,
      event,
      logger,
      hangingComplete,
      {
        modelOverride: storage.loadPiConfig().turnCommentModel,
        timeoutMs: 40,
      },
    );
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(1_000);
    expect(elapsed).toBeLessThan(TURN_COMMENT_TIMEOUT_MS);
    expect(completionCalled).toBe(false);
    expect(result.source).toBe("fallback");
    expect(result.comment).toContain("adapters/pi/events.ts");
    expect(logs.some((entry) => entry.event === "turn_comment_llm_timeout")).toBe(true);
  });

  test("auth throw falls back instead of rejecting the handler", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "pi-buddy-auth-throw-"));
    temporaryDirectories.push(stateDir);
    const storage = new PiBuddyStorage(stateDir);
    const model = getModels("openai")[0];
    if (!model) throw new Error("Expected a Pi model fixture.");
    storage.savePiConfig({ turnCommentModel: { provider: model.provider, model: model.id } });

    const ctx = {
      ui: { notify() {}, setStatus() {}, setWidget() {} },
      model: undefined,
      modelRegistry: {
        find(provider: string, id: string) {
          return provider === model.provider && id === model.id ? model : undefined;
        },
        async getApiKeyAndHeaders() {
          throw new Error("auth storage exploded");
        },
      },
      sessionManager: {
        getBranch() {
          return [];
        },
      },
    } as unknown as ExtensionContext;

    const logs: Array<{ level: string; event: string; data: Record<string, unknown> }> = [];
    const logger: PiBuddyLog = {
      info(event, data) { logs.push({ level: "info", event, data: data ?? {} }); },
      warn(event, data) { logs.push({ level: "warn", event, data: data ?? {} }); },
      error(event, data) { logs.push({ level: "error", event, data: data ?? {} }); },
      debug(event, data) { logs.push({ level: "debug", event, data: data ?? {} }); },
    };

    const event = {
      type: "turn_end",
      turnIndex: 6,
      message: assistantMessage(
        "I updated adapters/pi/events.ts to stop random turn chatter.",
      ),
      toolResults: [],
    } satisfies TurnEndEvent;

    const result = await generateTurnComment(
      ctx,
      companion,
      event,
      logger,
      async () => {
        throw new Error("completion should not run when auth throws");
      },
      { modelOverride: storage.loadPiConfig().turnCommentModel },
    );

    expect(result.source).toBe("fallback");
    expect(result.comment).toContain("adapters/pi/events.ts");
    expect(logs.some((entry) => entry.event === "turn_comment_auth_unavailable")).toBe(true);
  });

  test("invalid timeoutMs values fall back to the default positive bound", async () => {
    expect(resolveTurnCommentTimeoutMs(undefined)).toBe(TURN_COMMENT_TIMEOUT_MS);
    expect(resolveTurnCommentTimeoutMs(0)).toBe(TURN_COMMENT_TIMEOUT_MS);
    expect(resolveTurnCommentTimeoutMs(-1)).toBe(TURN_COMMENT_TIMEOUT_MS);
    expect(resolveTurnCommentTimeoutMs(Number.NaN)).toBe(TURN_COMMENT_TIMEOUT_MS);
    expect(resolveTurnCommentTimeoutMs(null as unknown as number)).toBe(TURN_COMMENT_TIMEOUT_MS);
    expect(resolveTurnCommentTimeoutMs(250)).toBe(250);

    const stateDir = mkdtempSync(join(tmpdir(), "pi-buddy-invalid-timeout-"));
    temporaryDirectories.push(stateDir);
    const storage = new PiBuddyStorage(stateDir);
    const model = getModels("openai")[0];
    if (!model) throw new Error("Expected a Pi model fixture.");
    storage.savePiConfig({ turnCommentModel: { provider: model.provider, model: model.id } });

    const logs: Array<{ level: string; event: string; data: Record<string, unknown> }> = [];
    const logger: PiBuddyLog = {
      info(event, data) { logs.push({ level: "info", event, data: data ?? {} }); },
      warn(event, data) { logs.push({ level: "warn", event, data: data ?? {} }); },
      error(event, data) { logs.push({ level: "error", event, data: data ?? {} }); },
      debug(event, data) { logs.push({ level: "debug", event, data: data ?? {} }); },
    };

    const ctx = {
      ui: { notify() {}, setStatus() {}, setWidget() {} },
      model: undefined,
      modelRegistry: {
        find(provider: string, id: string) {
          return provider === model.provider && id === model.id ? model : undefined;
        },
        async getApiKeyAndHeaders() {
          return { ok: true, apiKey: "secret-key", headers: {} };
        },
      },
      sessionManager: {
        getBranch() {
          return [];
        },
      },
    } as unknown as ExtensionContext;

    const event = {
      type: "turn_end",
      turnIndex: 7,
      message: assistantMessage(
        "I updated adapters/pi/events.ts to stop random turn chatter.",
      ),
      toolResults: [],
    } satisfies TurnEndEvent;

    const result = await generateTurnComment(
      ctx,
      companion,
      event,
      logger,
      async () => assistantMessage("*nods* timeout sanitized."),
      {
        modelOverride: storage.loadPiConfig().turnCommentModel,
        timeoutMs: 0,
      },
    );

    expect(result).toEqual({ comment: "*nods* timeout sanitized.", source: "llm" });
    const attempt = logs.find((entry) => entry.event === "turn_comment_llm_attempt");
    expect(attempt?.data.timeoutMs).toBe(TURN_COMMENT_TIMEOUT_MS);
  });
});

describe("deriveTurnComment", () => {
  test("extracts file-aware comments from assistant text", () => {
    const comment = deriveTurnComment(
      companion,
      assistantMessage("I updated adapters/pi/events.ts to stop random turn chatter."),
    );

    expect(comment).toContain("adapters/pi/events.ts");
  });

  test("uses contextual test wording when tests are mentioned", () => {
    const comment = deriveTurnComment(
      companion,
      assistantMessage("I added a regression test and verified the tests pass."),
    );

    expect(comment).toBe("*nods slowly* good. keep the tests honest.");
  });

  test("returns null when there is no assistant text", () => {
    const comment = deriveTurnComment(companion, assistantMessage(""));

    expect(comment).toBeNull();
  });
});

type PiEventHandler = (event: unknown, context: ExtensionContext) => unknown | Promise<unknown>;

type PiCommandHandler = (args: string, context: ExtensionCommandContext) => Promise<void>;

function createPiHarness(
  stateDir: string,
  options?: { completePersonality?: PersonalityCompleter },
) {
  const handlers = new Map<string, PiEventHandler>();
  const commands = new Map<string, PiCommandHandler>();
  const notifications: { message: string; type: string }[] = [];
  const notifyAchievementsCalls: unknown[][] = [];

  const api = {
    on(event: string, handler: PiEventHandler) {
      handlers.set(event, handler);
    },
    registerCommand(name: string, command: { description: string; handler: PiCommandHandler }) {
      commands.set(name, command.handler);
    },
  } as unknown as ExtensionAPI;

  const ctx = {
    ui: {
      setStatus() {},
      setWidget() {},
      notify(message: string, type: string) {
        notifications.push({ message, type });
      },
    },
  } as unknown as ExtensionContext;

  const commandCtx = {
    ui: {
      notify(message: string, type: string) {
        notifications.push({ message, type });
      },
      setStatus() {},
      setWidget() {},
    },
  } as unknown as ExtensionCommandContext;

  const storage = new PiBuddyStorage(stateDir);
  const identity = new PiIdentityProvider(storage);
  const logger = new PiBuddyLogger(storage);
  const service = new BuddyCommandService({
    identity,
    buddies: storage,
    reactions: storage,
    config: storage,
    events: storage,
  });
  const ui = new PiBuddyUI(storage);
  const originalNotifyAchievements = ui.notifyAchievements.bind(ui);
  ui.notifyAchievements = (ctx, achievements) => {
    notifyAchievementsCalls.push(achievements);
    originalNotifyAchievements(ctx, achievements);
  };

  registerBuddyEvents(api, {
    service,
    storage,
    ui,
    logger,
    completePersonality: options?.completePersonality,
  });
  registerBuddyCommands(api, { service, storage, ui });

  async function runCommand(args: string): Promise<void> {
    const handler = commands.get("buddy");
    expect(handler).toBeDefined();
    await handler!(args, commandCtx);
  }

  return { handlers, ctx, service, storage, runCommand, notifications, notifyAchievementsCalls };
}

async function emitPi(
  handlers: Map<string, PiEventHandler>,
  name: string,
  event: unknown,
  context: ExtensionContext,
): Promise<void> {
  const handler = handlers.get(name);
  expect(handler).toBeDefined();
  await handler?.(event, context);
}

describe("Pi extension event behavior", () => {
  test("session_start increments sessions and active-day counters once", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "pi-buddy-session-count-"));
    temporaryDirectories.push(stateDir);
    const harness = createPiHarness(stateDir);
    const storage = harness.storage;
    storage.savePiConfig({ commentCooldown: 0 });

    await emitPi(harness.handlers, "session_start", { type: "session_start" } as SessionStartEvent, harness.ctx);
    expect(storage.loadCounters().sessions).toBe(1);
    expect(storage.loadCounters().days_active).toBe(1);

    await emitPi(harness.handlers, "session_start", { type: "session_start" } as SessionStartEvent, harness.ctx);
    expect(storage.loadCounters().sessions).toBe(2);
  });

  test("matches name mentions for punctuation and emoji-ending names", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "pi-buddy-name-mention-"));
    temporaryDirectories.push(stateDir);
    const harness = createPiHarness(stateDir);
    const storage = harness.storage;
    storage.savePiConfig({ commentCooldown: 0 });

    await emitPi(harness.handlers, "session_start", { type: "session_start" } as SessionStartEvent, harness.ctx);
    const companion = storage.loadActive();
    expect(companion).not.toBeNull();

    await emitPi(
      harness.handlers,
      "input",
      { type: "input", source: "interactive", text: `${companion?.name}! you rock` } as InputEvent,
      harness.ctx,
    );
    expect(storage.loadLatest()?.reason).toBe("turn");

    await emitPi(
      harness.handlers,
      "input",
      { type: "input", source: "interactive", text: `look at ${companion?.name}✨` } as InputEvent,
      harness.ctx,
    );
    expect(storage.loadLatest()?.reason).toBe("turn");
  });

  test("classifies bash test failures before generic tool errors", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "pi-buddy-test-failure-"));
    temporaryDirectories.push(stateDir);
    const harness = createPiHarness(stateDir);
    const storage = harness.storage;
    storage.savePiConfig({ commentCooldown: 0 });

    await emitPi(harness.handlers, "session_start", { type: "session_start" } as SessionStartEvent, harness.ctx);

    const bashResult = {
      type: "tool_result",
      toolCallId: "tool-2",
      toolName: "bash",
      input: { command: "bun test" },
      content: [{ type: "text", text: "2 tests failed" }],
      isError: true,
      details: undefined,
    } satisfies ToolResultEvent;
    await emitPi(harness.handlers, "tool_result", bashResult, harness.ctx);

    expect(storage.loadLatest()?.reason).toBe("test-fail");
    expect(storage.loadCounters().tests_failed).toBe(1);
    expect(storage.loadCounters().errors_seen).toBe(0);
  });

  test("gates test/diff/success heuristics to bash results", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "pi-buddy-non-execution-"));
    temporaryDirectories.push(stateDir);
    const harness = createPiHarness(stateDir);
    const storage = harness.storage;
    storage.savePiConfig({ commentCooldown: 0 });

    await emitPi(harness.handlers, "session_start", { type: "session_start" } as SessionStartEvent, harness.ctx);

    const readResult = {
      type: "tool_result",
      toolCallId: "tool-3",
      toolName: "read",
      input: { path: "/dev/null" },
      content: [{ type: "text", text: "2 tests failed" }],
      isError: false,
      details: undefined,
    } satisfies ToolResultEvent;
    await emitPi(harness.handlers, "tool_result", readResult, harness.ctx);
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
    await emitPi(harness.handlers, "tool_result", readError, harness.ctx);
    expect(storage.loadLatest()?.reason).toBe("error");
    expect(storage.loadCounters().errors_seen).toBe(1);
    expect(storage.loadCounters().tests_failed).toBe(0);
  });
  test("still updates counters on cooldown without saving a passive reaction", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "pi-buddy-cooldown-counters-"));
    temporaryDirectories.push(stateDir);
    const harness = createPiHarness(stateDir);
    const storage = harness.storage;
    storage.savePiConfig({ commentCooldown: 60 });
    storage.saveLatest({ reaction: "*stays quiet*", reason: "turn", timestamp: Date.now() });

    await emitPi(harness.handlers, "session_start", { type: "session_start" } as SessionStartEvent, harness.ctx);

    const bashResult = {
      type: "tool_result",
      toolCallId: "tool-cooldown",
      toolName: "bash",
      input: { command: "bun test" },
      content: [{ type: "text", text: "2 tests failed" }],
      isError: true,
      details: undefined,
    } satisfies ToolResultEvent;

    await emitPi(harness.handlers, "tool_result", bashResult, harness.ctx);
    expect(storage.loadCounters().tests_failed).toBe(1);
    expect(storage.loadLatest()?.reason).toBe("turn");
    // session_start already notified first_steps; cooldown must not add another notification.
    expect(harness.notifyAchievementsCalls.length).toBe(1);

    await emitPi(harness.handlers, "tool_result", bashResult, harness.ctx);
    expect(storage.loadCounters().tests_failed).toBe(2);
  });
});
describe("looksLikeTestFailure", () => {
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

describe("Pi session_start notifications", () => {
  test("notifies achievements on every session start while hatch notice is creation-only", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "pi-buddy-session-notify-"));
    temporaryDirectories.push(stateDir);
    const harness = createPiHarness(stateDir);

    await emitPi(harness.handlers, "session_start", { type: "session_start" } as SessionStartEvent, harness.ctx);
    expect(harness.notifications.some((n) => n.message.includes("hatched"))).toBe(true);
    expect(harness.notifyAchievementsCalls.length).toBe(1);
    expect(harness.notifyAchievementsCalls[0]?.some((a) => (a as { id: string }).id === "first_steps")).toBe(true);

    harness.notifications.length = 0;
    harness.notifyAchievementsCalls.length = 0;

    await emitPi(harness.handlers, "session_start", { type: "session_start" } as SessionStartEvent, harness.ctx);
    expect(harness.notifications.some((n) => n.message.includes("hatched"))).toBe(false);
    expect(harness.notifyAchievementsCalls.length).toBe(1);
  });
});

describe("Pi buddy command achievements", () => {
  test("show command merges achievements from incrementCommandsRun into notifications", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "pi-buddy-command-merge-"));
    temporaryDirectories.push(stateDir);
    const harness = createPiHarness(stateDir);
    harness.storage.increment("commands_run", 49);

    await harness.runCommand("show");

    expect(harness.storage.loadCounters().commands_run).toBe(50);
    expect(harness.notifyAchievementsCalls.length).toBeGreaterThan(0);
    const lastCall = harness.notifyAchievementsCalls[harness.notifyAchievementsCalls.length - 1] as { id: string }[];
    expect(lastCall.some((a) => a.id === "power_user")).toBe(true);
    const name = harness.storage.loadActive()?.name ?? "";
    expect(harness.notifications.some((n) => n.type === "info" && n.message.includes(name))).toBe(true);
  });
});
function getTextFromUserMessage(request: CompletionContext): string {
  const message = request.messages[0];
  if (!message || message.role !== "user") return "";
  if (typeof message.content === "string") return message.content;
  const textBlock = message.content.find((block) => block.type === "text");
  return textBlock?.type === "text" ? textBlock.text : "";
}

function buildPiPersonalityContext(options: {
  model?: Model<Api>;
  auth?: { ok: true; apiKey: string; headers?: Record<string, string> } | { ok: false; error: string };
}) {
  const model = options.model ?? getModels("openai")[0];
  if (!model) throw new Error("Expected a Pi model fixture.");
  return {
    ui: { notify() {}, setStatus() {}, setWidget() {} },
    model,
    modelRegistry: {
      find() {
        return model;
      },
      async getApiKeyAndHeaders() {
        return options.auth ?? { ok: true, apiKey: "secret-key", headers: {} };
      },
    },
    sessionManager: { getBranch() { return []; } },
  } as unknown as ExtensionContext;
}

describe("generatePersonality", () => {
  test("returns a generated personality and exercises the prompt helper", async () => {
    const model = getModels("openai")[0];
    if (!model) throw new Error("Expected a Pi model fixture.");
    let capturedRequest: CompletionContext | undefined;
    const completePersonality: PersonalityCompleter = async (_model, request) => {
      capturedRequest = request;
      return assistantMessage(JSON.stringify({ name: "Spark", personality: "A curious coder." }));
    };
    const ctx = buildPiPersonalityContext({ model });

    const result = await generatePersonality(ctx, companion, { info() {}, warn() {}, error() {}, debug() {} }, completePersonality);

    expect(result).toBe("A curious coder.");
    const promptText = getTextFromUserMessage(capturedRequest!);
    expect(promptText).toContain(`Species: ${companion.bones.species}`);
    expect(promptText).toContain(`Rarity: ${companion.bones.rarity.toUpperCase()}`);
    expect(promptText).toContain("Stats:");
    expect(promptText).toContain('"personality"');
  });

  test("prefers configured turnCommentModel and uses resolveTurnCommentModel", async () => {
    const model = getModels("openai")[0];
    if (!model) throw new Error("Expected a Pi model fixture.");
    let findArgs: { provider: string; model: string } | undefined;
    const base = buildPiPersonalityContext({ model });
    const ctx = {
      ...base,
      model: undefined,
      modelRegistry: {
        ...base.modelRegistry,
        find(provider: string, modelId: string) {
          findArgs = { provider, model: modelId };
          return provider === "openai" && modelId === model.id ? model : null;
        },
      },
    } as unknown as ExtensionContext;
    const completePersonality: PersonalityCompleter = async () =>
      assistantMessage(JSON.stringify({ personality: "Config chosen." }));

    const result = await generatePersonality(
      ctx,
      companion,
      { info() {}, warn() {}, error() {}, debug() {} },
      completePersonality,
      { modelOverride: { provider: "openai", model: model.id } },
    );

    expect(result).toBe("Config chosen.");
    expect(findArgs).toEqual({ provider: "openai", model: model.id });
  });

  test("falls back to session model when configured turnCommentModel is missing", async () => {
    const model = getModels("openai")[0];
    if (!model) throw new Error("Expected a Pi model fixture.");
    const base = buildPiPersonalityContext({ model });
    const ctx = {
      ...base,
      modelRegistry: {
        ...base.modelRegistry,
        find(provider: string, modelId: string) {
          return provider === "openai" && modelId === model.id ? model : null;
        },
      },
    } as unknown as ExtensionContext;
    let receivedModel: Model<Api> | undefined;
    const completePersonality: PersonalityCompleter = async (m) => {
      receivedModel = m as Model<Api>;
      return assistantMessage(JSON.stringify({ personality: "Fallback." }));
    };

    const result = await generatePersonality(
      ctx,
      companion,
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
      async () => assistantMessage(JSON.stringify({ name: "Spark" })),
      async () => assistantMessage(JSON.stringify({ personality: "" })),
      async () => assistantMessage(JSON.stringify({ personality: "x".repeat(501) })),
    ];
    for (const completePersonality of cases) {
      const ctx = buildPiPersonalityContext({});
      const result = await generatePersonality(ctx, companion, { info() {}, warn() {}, error() {}, debug() {} }, completePersonality);
      expect(result).toBeNull();
    }
  });

  test("falls back when there is no model, no auth, an abort, or a provider error", async () => {
    const model = getModels("openai")[0];
    if (!model) throw new Error("Expected a Pi model fixture.");
    const logger = { info() {}, warn() {}, error() {}, debug() {} };

    const noModelCtx = { ...buildPiPersonalityContext({ model }), model: undefined } as unknown as ExtensionContext;
    expect(await generatePersonality(noModelCtx, companion, logger)).toBeNull();

    const noAuthCtx = buildPiPersonalityContext({ model, auth: { ok: false, error: "no auth" } });
    expect(await generatePersonality(noAuthCtx, companion, logger)).toBeNull();

    const noKeyCtx = buildPiPersonalityContext({ model, auth: { ok: true, apiKey: "" } });
    expect(await generatePersonality(noKeyCtx, companion, logger)).toBeNull();

    const abortedCompleter: PersonalityCompleter = async () => ({ ...assistantMessage("anything"), stopReason: "aborted" as const });
    expect(await generatePersonality(buildPiPersonalityContext({ model }), companion, logger, abortedCompleter)).toBeNull();

    const throwingCompleter: PersonalityCompleter = async () => {
      throw new Error("provider down");
    };
    expect(await generatePersonality(buildPiPersonalityContext({ model }), companion, logger, throwingCompleter)).toBeNull();
  });

  test("falls back to null when generation exceeds the timeout", async () => {
    const model = getModels("openai")[0];
    if (!model) throw new Error("Expected a Pi model fixture.");
    const logger = { info() {}, warn() {}, error() {}, debug() {} };
    const { promise } = Promise.withResolvers<AssistantMessage>();
    const neverCompleter: PersonalityCompleter = async () => promise;
    const ctx = buildPiPersonalityContext({ model });

    const result = await generatePersonality(
      ctx,
      companion,
      logger,
      neverCompleter,
      { timeoutMs: 10 },
    );

    expect(result).toBeNull();
  });

});

describe("session_start personality generation", () => {
  test("persists a generated personality for a newly created companion", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "pi-buddy-personality-success-"));
    temporaryDirectories.push(stateDir);
    let capturedRequest: CompletionContext | undefined;
    const completePersonality: PersonalityCompleter = async (_model, request) => {
      capturedRequest = request;
      return assistantMessage(JSON.stringify({ name: "Spark", personality: "A generated companion." }));
    };
    const harness = createPiHarness(stateDir, { completePersonality });
    const model = getModels("openai")[0];
    if (!model) throw new Error("Expected a Pi model fixture.");
    const ctx = buildPiPersonalityContext({ model });

    await emitPi(harness.handlers, "session_start", { type: "session_start" } as SessionStartEvent, ctx);

    const companion = harness.storage.loadActive();
    expect(companion).not.toBeNull();
    expect(companion?.personality).toBe("A generated companion.");
    expect(getTextFromUserMessage(capturedRequest!)).toContain(`Species: ${companion?.bones.species}`);
  });

  test("keeps the generic fallback when generation fails", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "pi-buddy-personality-fallback-"));
    temporaryDirectories.push(stateDir);
    const completePersonality: PersonalityCompleter = async () => assistantMessage("not json");
    const harness = createPiHarness(stateDir, { completePersonality });
    const model = getModels("openai")[0];
    if (!model) throw new Error("Expected a Pi model fixture.");
    const ctx = buildPiPersonalityContext({ model });

    await emitPi(harness.handlers, "session_start", { type: "session_start" } as SessionStartEvent, ctx);

    const companion = harness.storage.loadActive();
    expect(companion).not.toBeNull();
    expect(companion?.personality).toContain(companion?.bones.species);
  });

  test("does not overwrite a personality edited while generating", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "pi-buddy-personality-concurrent-"));
    temporaryDirectories.push(stateDir);
    const model = getModels("openai")[0];
    if (!model) throw new Error("Expected a Pi model fixture.");

    const harness = createPiHarness(stateDir, {
      completePersonality: async () => {
        harness.service.setPersonality("User edited");
        return assistantMessage(JSON.stringify({ name: "Spark", personality: "A generated companion." }));
      },
    });
    const ctx = buildPiPersonalityContext({ model });

    await emitPi(harness.handlers, "session_start", { type: "session_start" } as SessionStartEvent, ctx);

    const active = harness.storage.loadActive();
    expect(active).not.toBeNull();
    expect(active?.personality).toBe("User edited");
  });

});
