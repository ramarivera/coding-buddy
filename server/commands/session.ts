import { generateBones, generatePersonality, type Companion } from "../../core/engine.ts";
import { loadCompanion, resolveUserId, writeStatusState, loadActiveSlot, saveActiveSlot, slugify, unusedName, saveCompanionSlot, listCompanionSlots } from "../state";
import { incrementEvent, checkAndAward, trackActiveDay } from "../achievements";

export function ensureCompanion(): Companion {
  let companion = loadCompanion();
  if (companion) return companion;

  // Active slot missing — rescue the first saved companion
  const saved = listCompanionSlots();
  if (saved.length > 0) {
    const { slot, companion: rescued } = saved[0];
    saveActiveSlot(slot);
    writeStatusState(rescued, `*${rescued.name} arrives*`);
    return rescued;
  }

  // Menagerie is empty — generate a fresh companion in a new slot
  const userId = resolveUserId();
  const bones = generateBones(userId);
  const name = unusedName();
  companion = {
    bones,
    name,
    personality: generatePersonality(bones, userId),
    hatchedAt: Date.now(),
    userId,
  };
  const slot = slugify(name);
  saveCompanionSlot(companion, slot);
  saveActiveSlot(slot);
  writeStatusState(companion);

  checkAndAward(slot);
  trackActiveDay();
  incrementEvent("sessions", 1);
  incrementEvent("buddies_collected", 1);

  return companion;
}

export function activeSlot(): string {
  return loadActiveSlot();
}
