import type { IdentityProvider } from "../../core/ports.ts";
import { OmpBuddyStorage } from "./storage.ts";

export class OmpIdentityProvider implements IdentityProvider {
  constructor(private readonly storage: OmpBuddyStorage) {}

  getStableUserId(): string {
    return this.storage.ensureStableIdentity();
  }
}
