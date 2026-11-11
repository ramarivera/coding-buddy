import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { BuddyCommandService } from "../../core/command-service.ts";
import { PiIdentityProvider } from "./identity.ts";
import { PiBuddyLogger } from "./logger.ts";
import { registerBuddyCommands } from "./commands.ts";
import { registerBuddyEvents, type TurnCommentCompleter, type PersonalityCompleter } from "./events.ts";
import { PiBuddyStorage } from "./storage.ts";
import { PiBuddyUI } from "./ui.ts";

export interface PiBuddyExtensionOptions {
  stateDir?: string;
  completeTurnComment?: TurnCommentCompleter;
  completePersonality?: PersonalityCompleter;
}

export default function registerPiBuddyExtension(
  pi: ExtensionAPI,
  options: PiBuddyExtensionOptions = {},
): void {
  const storage = new PiBuddyStorage(options.stateDir);
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

  registerBuddyCommands(pi, { service, storage, ui });
  registerBuddyEvents(pi, {
    service,
    storage,
    ui,
    logger,
    completeTurnComment: options.completeTurnComment,
    completePersonality: options.completePersonality,
  });
}
