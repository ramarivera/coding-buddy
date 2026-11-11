import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { BuddyCommandService, mergeAchievements } from "../../core/command-service.ts";
import { renderBuddyStats } from "./renderers.ts";
import { PiBuddyStorage, slugifySlot } from "./storage.ts";
import { PiBuddyUI } from "./ui.ts";

interface RegisterBuddyCommandsDeps {
  service: BuddyCommandService;
  storage: PiBuddyStorage;
  ui: PiBuddyUI;
}

export function registerBuddyCommands(pi: ExtensionAPI, deps: RegisterBuddyCommandsDeps): void {
  pi.registerCommand("buddy", {
    description: "Manage your coding companion",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const input = args.trim();
      const [command, ...rest] = input ? input.split(/\s+/) : [];
      const remainder = rest.join(" ").trim();

      try {
        switch (command) {
          case undefined:
          case "show": {
            const ensured = deps.service.ensureCompanion();
            const commandAchievements = deps.service.incrementCommandsRun();
            const achievements = mergeAchievements(ensured.achievements, commandAchievements);
            const reaction = deps.storage.loadLatest();
            deps.ui.refresh(ctx, ensured.companion, reaction, achievements);
            if (ensured.created) {
              ctx.ui.notify(`Meet ${ensured.companion.name}!`, "info");
            } else {
              ctx.ui.notify(deps.service.formatCompanionSummary(ensured.companion), "info");
            }
            deps.ui.notifyAchievements(ctx, achievements);
            return;
          }

          case "pet": {
            const commandAchievements = deps.service.incrementCommandsRun();
            const result = deps.service.petBuddy();
            const achievements = mergeAchievements(commandAchievements, result.achievements);
            deps.ui.refresh(ctx, result.companion, result.state, achievements);
            ctx.ui.notify(`${result.companion.name} seems pleased.`, "info");
            deps.ui.notifyAchievements(ctx, achievements);
            return;
          }

          case "stats": {
            const ensured = deps.service.ensureCompanion();
            const commandAchievements = deps.service.incrementCommandsRun();
            const achievements = mergeAchievements(ensured.achievements, commandAchievements);
            ctx.ui.setWidget("buddy", renderBuddyStats(ensured.companion));
            ctx.ui.notify(`${ensured.companion.name}'s stats`, "info");
            deps.ui.notifyAchievements(ctx, achievements);
            return;
          }

          case "rename": {
            if (!remainder) throw new Error("Usage: /buddy rename <name>");
            const commandAchievements = deps.service.incrementCommandsRun();
            const companion = deps.service.renameBuddy(remainder);
            const ensured = deps.service.ensureCompanion();
            const achievements = mergeAchievements(commandAchievements, ensured.achievements);
            deps.ui.refresh(ctx, companion, deps.storage.loadLatest(), achievements);
            ctx.ui.notify(`Buddy renamed to ${companion.name}.`, "info");
            deps.ui.notifyAchievements(ctx, achievements);
            return;
          }

          case "personality": {
            if (!remainder) throw new Error("Usage: /buddy personality <text>");
            const commandAchievements = deps.service.incrementCommandsRun();
            const companion = deps.service.setPersonality(remainder);
            const ensured = deps.service.ensureCompanion();
            const achievements = mergeAchievements(commandAchievements, ensured.achievements);
            deps.ui.refresh(ctx, companion, deps.storage.loadLatest(), achievements);
            ctx.ui.notify(`${companion.name}'s personality was updated.`, "info");
            deps.ui.notifyAchievements(ctx, achievements);
            return;
          }

          case "off": {
            const commandAchievements = deps.service.incrementCommandsRun();
            deps.storage.setMuted(true);
            const ensured = deps.service.ensureCompanion();
            const achievements = mergeAchievements(commandAchievements, ensured.achievements);
            deps.ui.refresh(ctx, ensured.companion, null, achievements);
            ctx.ui.notify(`${ensured.companion.name} goes quiet.`, "info");
            deps.ui.notifyAchievements(ctx, achievements);
            return;
          }

          case "on": {
            const commandAchievements = deps.service.incrementCommandsRun();
            deps.storage.setMuted(false);
            const result = deps.service.recordComment("*stretches* I'm back!");
            const achievements = mergeAchievements(commandAchievements, result.achievements);
            deps.ui.refresh(ctx, result.companion, result.state, achievements);
            ctx.ui.notify(`${result.companion.name} is back.`, "info");
            deps.ui.notifyAchievements(ctx, achievements);
            return;
          }

          case "save": {
            const commandAchievements = deps.service.incrementCommandsRun();
            const result = deps.service.saveBuddy(remainder || undefined);
            const ensured = deps.service.ensureCompanion();
            const achievements = mergeAchievements(commandAchievements, ensured.achievements);
            deps.ui.refresh(ctx, result.companion, deps.storage.loadLatest(), achievements);
            ctx.ui.notify(`Saved ${result.companion.name} to [${result.slot}].`, "info");
            deps.ui.notifyAchievements(ctx, achievements);
            return;
          }

          case "summon": {
            const commandAchievements = deps.service.incrementCommandsRun();
            const result = deps.service.summonBuddy(remainder || undefined);
            if (!result) throw new Error("No saved buddy found for that slot.");
            const ensured = deps.service.ensureCompanion();
            const achievements = mergeAchievements(commandAchievements, ensured.achievements);
            deps.ui.refresh(ctx, result.companion, deps.storage.loadLatest(), achievements);
            ctx.ui.notify(`${result.companion.name} arrives from [${result.slot}].`, "info");
            deps.ui.notifyAchievements(ctx, achievements);
            return;
          }

          case "list": {
            const commandAchievements = deps.service.incrementCommandsRun();
            const active = deps.storage.loadActiveSlot();
            const companions = deps.service.listCompanions();
            if (companions.length === 0) {
              ctx.ui.notify("No saved buddies yet.", "info");
              deps.ui.notifyAchievements(ctx, commandAchievements);
              return;
            }
            ctx.ui.setWidget(
              "buddy",
              companions.map(({ slot, companion }) => {
                const marker = slot === active ? " <- active" : "";
                return `${companion.name} [${slot}] - ${companion.bones.rarity} ${companion.bones.species}${marker}`;
              }),
            );
            ctx.ui.notify(`Saved buddies: ${companions.length}`, "info");
            deps.ui.notifyAchievements(ctx, commandAchievements);
            return;
          }

          case "dismiss": {
            if (!remainder) throw new Error("Usage: /buddy dismiss <slot>");
            const commandAchievements = deps.service.incrementCommandsRun();
            const result = deps.service.dismissBuddy(remainder);
            const ensured = deps.service.ensureCompanion();
            const achievements = mergeAchievements(commandAchievements, ensured.achievements);
            deps.ui.refresh(ctx, ensured.companion, deps.storage.loadLatest(), achievements);
            ctx.ui.notify(`Dismissed ${result.companion.name} [${result.slot}].`, "info");
            deps.ui.notifyAchievements(ctx, achievements);
            return;
          }

          case "achievements": {
            const commandAchievements = deps.service.incrementCommandsRun();
            const activeSlot = deps.storage.loadActiveSlot() ?? undefined;
            const progress = deps.service.getAchievementProgress(activeSlot);
            deps.ui.showAchievements(ctx, progress.unlocked, progress.remaining);
            deps.ui.notifyAchievements(ctx, commandAchievements);
            return;
          }

          case "help":
          default: {
            const commandAchievements = deps.service.incrementCommandsRun();
            ctx.ui.setWidget("buddy", [
              "/buddy",
              "/buddy pet",
              "/buddy stats",
              "/buddy rename <name>",
              "/buddy personality <text>",
              "/buddy off | on",
              "/buddy save [slot]",
              "/buddy summon [slot]",
              "/buddy list",
              "/buddy dismiss <slot>",
              "/buddy achievements",
            ]);
            ctx.ui.notify("Buddy commands ready.", "info");
            deps.ui.notifyAchievements(ctx, commandAchievements);
            return;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(message, "error");
        if (command === "save" && remainder) {
          ctx.ui.notify(`Try a different slot, for example: ${slugifySlot(remainder)}-2`, "info");
        }
      }
    },
  });
}
