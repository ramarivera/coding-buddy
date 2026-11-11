import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { BuddyCommandService } from "../../core/command-service.ts";
import { registerBuddyCommands } from "./commands.ts";
import { registerOmpBuddyEvents, type PersonalityCompleter, type TurnCommentCompleter } from "./events.ts";
import { OmpIdentityProvider } from "./identity.ts";
import { OmpBuddyLogger } from "./logger.ts";
import { OmpBuddyStorage } from "./storage.ts";
import { OmpBuddyUI } from "./ui.ts";

export interface OmpBuddyExtensionOptions {
  stateDir?: string;
  completeTurnComment?: TurnCommentCompleter;
  completePersonality?: PersonalityCompleter;
}

export default function registerOmpBuddyExtension(
  omp: ExtensionAPI,
  options: OmpBuddyExtensionOptions = {},
): void {
  const storage = new OmpBuddyStorage(options.stateDir);
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

  registerBuddyCommands(omp, { service, storage, ui });
  registerOmpBuddyEvents(omp, {
    service,
    storage,
    ui,
    logger,
    completeTurnComment: options.completeTurnComment,
    completePersonality: options.completePersonality,
  });
}
