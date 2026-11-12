import { getAgentDir } from "@mariozechner/pi-coding-agent";
import { join } from "node:path";
import { sharedStateDir } from "../../core/identity.ts";
import {
  FileBuddyStorage,
  slugifySlot,
  type FileBuddyConfig,
} from "../shared/file-storage.ts";

export const DEFAULT_PI_BUDDY_STATE_DIR = join(getAgentDir(), "buddy");

function defaultPiBuddyStateDir(): string {
  return sharedStateDir() ?? DEFAULT_PI_BUDDY_STATE_DIR;
}

export class PiBuddyStorage extends FileBuddyStorage {
  constructor(stateDir = defaultPiBuddyStateDir()) {
    super(stateDir);
  }

  loadPiConfig(): FileBuddyConfig {
    return this.loadHostConfig();
  }

  savePiConfig(config: Partial<FileBuddyConfig>): FileBuddyConfig {
    return this.saveHostConfig(config);
  }
}

export { slugifySlot };
