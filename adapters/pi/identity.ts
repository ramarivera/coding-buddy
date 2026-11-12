import type { IdentityProvider } from "../../core/ports.ts";
import { PiBuddyStorage } from "./storage.ts";

export class PiIdentityProvider implements IdentityProvider {
  constructor(private readonly storage: PiBuddyStorage) {}

  getStableUserId(): string {
    return this.storage.ensureStableIdentity();
  }
}
