import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, TurnEndEvent } from "@oh-my-pi/pi-coding-agent";
import type { AssistantMessage, Model } from "@oh-my-pi/pi-ai";
import { getBundledModels } from "@oh-my-pi/pi-catalog";
import { BuddyCommandService } from "../../core/command-service.ts";
import { OmpIdentityProvider } from "./identity.ts";
import { OmpBuddyStorage } from "./storage.ts";
import { OmpBuddyUI } from "./ui.ts";
import { registerBuddyCommands } from "./commands.ts";
import { registerOmpBuddyEvents, type OmpBuddyLog } from "./events.ts";
import type { OmpBuddyContext } from "./context.ts";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function assistantMessage(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "openai-completions",
    provider: "openai",
    model: "session-test",
    usage: {
      input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

describe("OMP reaction session isolation", () => {
  test("keeps command and generated reactions scoped to their originating session", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "omp-session-reactions-"));
    temporaryDirectories.push(stateDir);
    const handlers = new Map<string, (event: unknown, ctx: OmpBuddyContext) => unknown>();
    const commands = new Map<string, (args: string, ctx: OmpBuddyContext) => unknown>();
    const widgets = new Map<string, string[][]>();
    let activeSession = "session-a";
    let finishCompletion!: (message: AssistantMessage) => void;
    let completionStarted!: () => void;
    const started = new Promise<void>((resolve) => { completionStarted = resolve; });
    const completion = new Promise<AssistantMessage>((resolve) => { finishCompletion = resolve; });

    const api = {
      on(event: string, handler: (event: unknown, ctx: OmpBuddyContext) => unknown) {
        handlers.set(event, handler);
      },
      registerCommand(name: string, command: { handler: (args: string, ctx: OmpBuddyContext) => unknown }) {
        commands.set(name, command.handler);
      },
    } as ExtensionAPI;
    const model = getBundledModels("openai")[0] as Model;
    const ctx = {
      ui: {
        setStatus() {},
        setWidget(_key: string, lines: string[] | undefined) {
          if (lines) widgets.set(activeSession, [...(widgets.get(activeSession) ?? []), lines]);
        },
        notify() {},
      },
      model,
      modelRegistry: {
        find() { return model; },
        getApiKeyForProvider: async () => "test-key",
        getProviderHeaders: () => ({}),
      },
      sessionManager: {
        getBranch: () => [],
        getSessionId: () => activeSession,
      },
    } as unknown as OmpBuddyContext;

    const storage = new OmpBuddyStorage(stateDir);
    const service = new BuddyCommandService({
      identity: new OmpIdentityProvider(storage),
      buddies: storage,
      reactions: storage,
      config: storage,
      events: storage,
    });
    const ui = new OmpBuddyUI(storage);
    const logger: OmpBuddyLog = { info() {}, warn() {}, error() {}, debug() {} };
    registerOmpBuddyEvents(api, {
      service,
      storage,
      ui,
      logger,
      completeTurnComment: async () => {
        completionStarted();
        return completion;
      },
    });
    registerBuddyCommands(api, { service, storage, ui });
    storage.saveOmpConfig({
      commentCooldown: 0,
      turnCommentModel: { provider: model.provider, model: model.id },
      turnCommentTimeoutMs: 1_000,
    });

    const buddyCommand = commands.get("buddy");
    if (!buddyCommand) throw new Error("buddy command wasn't registered");
    await buddyCommand("pet", ctx);
    const commandReaction = storage.loadLatest("session-a")?.reaction;
    expect(commandReaction).toBeTruthy();
    activeSession = "session-b";
    await buddyCommand("show", ctx);
    expect(storage.loadLatest("session-b")).toBeNull();
    expect(storage.loadLatest("session-a")?.reaction).toBe(commandReaction);
    activeSession = "session-a";

    await handlers.get("session_start")?.({ type: "session_start" }, ctx);
    const turn: TurnEndEvent = {
      type: "turn_end",
      turnIndex: 1,
      message: assistantMessage("A generated a reaction."),
      toolResults: [],
    };
    const turnEnd = handlers.get("turn_end");
    if (!turnEnd) throw new Error("turn_end handler wasn't registered");
    const pendingTurn = turnEnd(turn, ctx);
    await started;

    activeSession = "session-b";
    finishCompletion(assistantMessage("*session A reaction*"));
    await pendingTurn;

    expect(storage.loadLatest("session-a")?.reaction).toBe("*session A reaction*");
    expect(storage.loadLatest("session-b")).toBeNull();

    const switchSession = handlers.get("session_switch");
    if (!switchSession) throw new Error("session_switch handler wasn't registered");
    switchSession({ type: "session_switch", reason: "resume", previousSessionFile: undefined }, ctx);
    const bWidget = widgets.get("session-b")?.at(-1)?.join("\n") ?? "";
    expect(bWidget).not.toContain("session A reaction");

    activeSession = "session-a";
    switchSession({ type: "session_switch", reason: "resume", previousSessionFile: undefined }, ctx);
    const aWidget = widgets.get("session-a")?.at(-1)?.join("\n") ?? "";
    expect(aWidget).toContain("session A reaction");
  });
});
