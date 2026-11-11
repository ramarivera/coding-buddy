import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";

export interface OmpBuddyUi {
  notify(message: string, type?: "info" | "warning" | "error"): void;
  setStatus(key: string, text: string | undefined): void;
  setWidget(key: string, content: string[] | undefined): void;
}

export interface OmpBuddyUiContext {
  ui: OmpBuddyUi;
  setTimeout?: (callback: () => void, ms?: number) => Timer;
  clearTimer?: (timer: Timer) => void;
}

export interface OmpBuddyContext extends OmpBuddyUiContext {
  model: ExtensionContext["model"];
  modelRegistry: Pick<
    ExtensionContext["modelRegistry"],
    "find" | "getApiKeyForProvider" | "getProviderHeaders"
  >;
  sessionManager: Pick<ExtensionContext["sessionManager"], "getBranch">;
}
