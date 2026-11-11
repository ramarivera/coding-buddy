import { getAgentDir } from "@oh-my-pi/pi-utils";
import { join } from "node:path";
import { sharedStateDir } from "../../core/identity.ts";
import {
  FileBuddyStorage,
  slugifySlot,
  type FileBuddyConfig,
} from "../shared/file-storage.ts";

export const DEFAULT_OMP_BUDDY_STATE_DIR = join(getAgentDir(), "buddy");

function defaultOmpBuddyStateDir(): string {
  return sharedStateDir() ?? DEFAULT_OMP_BUDDY_STATE_DIR;
}

export class OmpBuddyStorage extends FileBuddyStorage {
  constructor(stateDir = defaultOmpBuddyStateDir()) {
    super(stateDir);
  }

  loadOmpConfig(): FileBuddyConfig {
    return this.loadHostConfig();
  }

  saveOmpConfig(config: Partial<FileBuddyConfig>): FileBuddyConfig {
    return this.saveHostConfig(config);
  }
}

export { slugifySlot };
