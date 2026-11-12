import { afterEach, describe, expect, test } from "bun:test";
import { ACHIEVEMENTS } from "../../core/achievements.ts";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  watch,
  writeFileSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileBuddyStorage } from "./file-storage.ts";
import type { BuddyBones } from "../../core/engine.ts";
import type { Companion } from "../../core/model.ts";
const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});


describe("cross-process locking", () => {
  test("concurrent same-root increments do not lose updates", async () => {
    const parent = mkdtempSync(join(tmpdir(), "buddy-lock-concurrency-"));
    temporaryDirectories.push(parent);
    const stateDir = join(parent, "state");
    mkdirSync(stateDir, { recursive: true });
    const storage = new FileBuddyStorage(stateDir);

    const workerPath = join(parent, "worker.ts");
    const workerCode = `import { FileBuddyStorage } from "${join(import.meta.dir, "file-storage.ts")}";\n` +
      "const stateDir = process.argv[2];\n" +
      "const count = Number(process.argv[3]);\n" +
      "const storage = new FileBuddyStorage(stateDir);\n" +
      "for (let i = 0; i < count; i++) storage.increment(\"commands_run\");\n";
    writeFileSync(workerPath, workerCode, "utf8");

    const workers = 4;
    const increments = 25;
    const children: Promise<void>[] = [];
    for (let i = 0; i < workers; i++) {
      children.push(
        new Promise<void>((resolve, reject) => {
          const child = spawn("bun", ["run", workerPath, stateDir, String(increments)], {
            stdio: "ignore",
          });
          child.on("exit", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Worker exited with code ${code}`));
          });
          child.on("error", reject);
        }),
      );
    }
    await Promise.all(children);

    expect(storage.loadCounters().commands_run).toBe(workers * increments);
  });

  test("concurrent increments in separate roots remain independent", async () => {
    const parent = mkdtempSync(join(tmpdir(), "buddy-lock-separate-roots-"));
    temporaryDirectories.push(parent);
    const piRoot = join(parent, "pi");
    const ompRoot = join(parent, "omp");
    mkdirSync(piRoot, { recursive: true });
    mkdirSync(ompRoot, { recursive: true });

    const workerPath = join(parent, "worker.ts");
    const workerCode = `import { FileBuddyStorage } from "${join(import.meta.dir, "file-storage.ts")}";\n` +
      "const stateDir = process.argv[2];\n" +
      "const count = Number(process.argv[3]);\n" +
      "const storage = new FileBuddyStorage(stateDir);\n" +
      "for (let i = 0; i < count; i++) storage.increment(\"commands_run\");\n";
    writeFileSync(workerPath, workerCode, "utf8");

    const workers = 3;
    const increments = 20;
    const runRoot = (root: string) =>
      Promise.all(
        Array.from({ length: workers }, () =>
          new Promise<void>((resolve, reject) => {
            const child = spawn("bun", ["run", workerPath, root, String(increments)], {
              stdio: "ignore",
            });
            child.on("exit", (code) => {
              if (code === 0) resolve();
              else reject(new Error(`Worker exited with code ${code}`));
            });
            child.on("error", reject);
          }),
        ),
      );

    await Promise.all([runRoot(piRoot), runRoot(ompRoot)]);

    const piStorage = new FileBuddyStorage(piRoot);
    const ompStorage = new FileBuddyStorage(ompRoot);
    expect(piStorage.loadCounters().commands_run).toBe(workers * increments);
    expect(ompStorage.loadCounters().commands_run).toBe(workers * increments);
  });

  test("recovers from a stale lock left by a dead process", () => {
    const parent = mkdtempSync(join(tmpdir(), "buddy-lock-stale-"));
    temporaryDirectories.push(parent);
    const stateDir = join(parent, "state");
    mkdirSync(stateDir, { recursive: true });
    const storage = new FileBuddyStorage(stateDir);

    // Leave a stale directory lock with an ancient mtime.
    const lockDir = join(stateDir, ".lock");
    mkdirSync(lockDir, { recursive: true });
    utimesSync(lockDir, 0, 0);

    storage.increment("commands_run");

    expect(storage.loadCounters().commands_run).toBe(1);
  });
  test("does not remove a fresh live lock", async () => {
    const parent = mkdtempSync(join(tmpdir(), "buddy-fresh-lock-"));
    temporaryDirectories.push(parent);
    const stateDir = join(parent, "state");
    mkdirSync(stateDir, { recursive: true });
    const lockDir = join(stateDir, ".lock");
    const readyFile = join(parent, "holder-ready");
    const releaseFile = join(parent, "release");

    const holderPath = join(parent, "fresh-lock-holder.ts");
    const holderCode =
      `import { existsSync, mkdirSync, rmdirSync, watch, writeFileSync } from "node:fs";\n` +
      `const lockDir = "${lockDir}";\n` +
      `const readyFile = "${readyFile}";\n` +
      `const releaseFile = "${releaseFile}";\n` +
      `const parentDir = "${parent}";\n` +
      `mkdirSync(lockDir, { recursive: true });\n` +
      `let watcher;\n` +
      `function releaseLock() {\n` +
      `  if (existsSync(releaseFile)) {\n` +
      `    watcher.close();\n` +
      `    rmdirSync(lockDir);\n` +
      `    process.exit(0);\n` +
      `  }\n` +
      `}\n` +
      `watcher = watch(parentDir, () => releaseLock());\n` +
      `releaseLock();\n` +
      `writeFileSync(readyFile, "");\n`;
    writeFileSync(holderPath, holderCode, "utf8");

    const incrementerPath = join(parent, "fresh-lock-incrementer.ts");
    const fileStoragePath = join(import.meta.dir, "file-storage.ts");
    const startedFile = join(parent, "started");
    const doneFile = join(parent, "done.json");
    const incrementerCode =
      `import { FileBuddyStorage } from "${fileStoragePath}";\n` +
      `import { writeFileSync } from "node:fs";\n` +
      `const stateDir = "${stateDir}";\n` +
      `const startedFile = "${startedFile}";\n` +
      `const doneFile = "${doneFile}";\n` +
      `writeFileSync(startedFile, "");\n` +
      `new FileBuddyStorage(stateDir).increment("commands_run");\n` +
      `writeFileSync(doneFile, JSON.stringify({ commands_run: new FileBuddyStorage(stateDir).loadCounters().commands_run }));\n`;
    writeFileSync(incrementerPath, incrementerCode, "utf8");
    const holder = spawn("bun", ["run", holderPath], { stdio: "ignore" });
    const holderDone = Promise.withResolvers<void>();
    holder.on("exit", (code) =>
      code === 0 ? holderDone.resolve() : holderDone.reject(new Error(`Holder exited with code ${code}`))
    );
    holder.on("error", (err) => holderDone.reject(err));

    await (async function waitForFile(file: string) {
      if (existsSync(file)) return;
      const { promise, resolve, reject } = Promise.withResolvers<void>();
      const watcher = watch(parent, () => {
        if (existsSync(file)) resolve();
      });
      watcher.on("error", (err) => reject(err));
      await promise.finally(() => watcher.close());
    })(readyFile);

    expect(existsSync(lockDir)).toBe(true);

    const incrementer = spawn("bun", ["run", incrementerPath], { stdio: "ignore" });
    const incrementerDone = Promise.withResolvers<void>();
    incrementer.on("exit", (code) =>
      code === 0 ? incrementerDone.resolve() : incrementerDone.reject(new Error(`Incrementer exited with code ${code}`))
    );
    incrementer.on("error", (err) => incrementerDone.reject(err));

    await (async function waitForFile(file: string) {
      if (existsSync(file)) return;
      const { promise, resolve, reject } = Promise.withResolvers<void>();
      const watcher = watch(parent, () => {
        if (existsSync(file)) resolve();
      });
      watcher.on("error", (err) => reject(err));
      await promise.finally(() => watcher.close());
    })(startedFile);

    writeFileSync(releaseFile, "");
    await incrementerDone.promise;
    await holderDone.promise;

    expect(JSON.parse(readFileSync(doneFile, "utf8")).commands_run).toBe(1);
  });
  test("concurrent saveSlot and saveActiveSlot calls do not lose companions", async () => {
    const parent = mkdtempSync(join(tmpdir(), "buddy-slot-concurrency-"));
    temporaryDirectories.push(parent);
    const stateDir = join(parent, "state");
    mkdirSync(stateDir, { recursive: true });
    const storage = new FileBuddyStorage(stateDir);

    const fileStoragePath = join(import.meta.dir, "file-storage.ts");
    const modelPath = join(import.meta.dir, "../../core/model.ts");
    const enginePath = join(import.meta.dir, "../../core/engine.ts");

    const workerPath = join(parent, "slot-worker.ts");
    const workerCode =
      `import { FileBuddyStorage } from "${fileStoragePath}";\n` +
      `import type { BuddyBones } from "${enginePath}";\n` +
      `import type { Companion } from "${modelPath}";\n` +
      "const stateDir = process.argv[2];\n" +
      "const workerIndex = process.argv[3];\n" +
      "const slotCount = Number(process.argv[4]);\n" +
      "const storage = new FileBuddyStorage(stateDir);\n" +
      "const bones: BuddyBones = { rarity: 'common', species: 'duck', eye: '°', hat: 'none', shiny: false, stats: { DEBUGGING: 50, PATIENCE: 50, CHAOS: 50, WISDOM: 50, SNARK: 50 }, peak: 'DEBUGGING', dump: 'PATIENCE' };\n" +
      "for (let i = 0; i < slotCount; i++) {\n" +
      "  const slot = `${workerIndex}-${i}`;\n" +
      "  const companion: Companion = { bones, name: `updated-${workerIndex}-${i}`, personality: 'test', hatchedAt: 0, userId: `u-${workerIndex}-${i}` };\n" +
      "  storage.saveSlot(slot, companion);\n" +
      "  storage.saveActiveSlot(slot);\n" +
      "}\n";
    writeFileSync(workerPath, workerCode, "utf8");

    const workers = 4;
    const slotCount = 5;
    const children: Promise<void>[] = [];
    for (let i = 0; i < workers; i++) {
      children.push(
        new Promise<void>((resolve, reject) => {
          const child = spawn("bun", ["run", workerPath, stateDir, String(i), String(slotCount)], { stdio: "ignore" });
          child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`Worker ${i} exited with code ${code}`))));
          child.on("error", reject);
        }),
      );
    }
    await Promise.all(children);

    const slots = storage.listSlots();
    expect(slots.length).toBe(workers * slotCount);
    for (let i = 0; i < workers; i++) {
      for (let j = 0; j < slotCount; j++) {
        const slot = `${i}-${j}`;
        const companion = storage.loadSlot(slot);
        expect(companion).not.toBeNull();
        expect(companion?.name).toBe(`updated-${i}-${j}`);
      }
    }
  });

  test("concurrent saveActive calls do not corrupt the active slot", async () => {
    const parent = mkdtempSync(join(tmpdir(), "buddy-save-active-concurrency-"));
    temporaryDirectories.push(parent);
    const stateDir = join(parent, "state");
    mkdirSync(stateDir, { recursive: true });
    const storage = new FileBuddyStorage(stateDir);

    const fileStoragePath = join(import.meta.dir, "file-storage.ts");
    const modelPath = join(import.meta.dir, "../../core/model.ts");
    const enginePath = join(import.meta.dir, "../../core/engine.ts");

    const workerPath = join(parent, "save-active-worker.ts");
    const workerCode =
      `import { FileBuddyStorage } from "${fileStoragePath}";\n` +
      `import type { BuddyBones } from "${enginePath}";\n` +
      `import type { Companion } from "${modelPath}";\n` +
      "const stateDir = process.argv[2];\n" +
      "const workerIndex = process.argv[3];\n" +
      "const storage = new FileBuddyStorage(stateDir);\n" +
      "const bones: BuddyBones = { rarity: 'common', species: 'duck', eye: '°', hat: 'none', shiny: false, stats: { DEBUGGING: 50, PATIENCE: 50, CHAOS: 50, WISDOM: 50, SNARK: 50 }, peak: 'DEBUGGING', dump: 'PATIENCE' };\n" +
      "const companion: Companion = { bones, name: `worker-${workerIndex}`, personality: 'test', hatchedAt: 0, userId: `u-${workerIndex}` };\n" +
      "storage.saveActive(companion);\n";
    writeFileSync(workerPath, workerCode, "utf8");

    const bones: BuddyBones = { rarity: 'common', species: 'duck', eye: '°', hat: 'none', shiny: false, stats: { DEBUGGING: 50, PATIENCE: 50, CHAOS: 50, WISDOM: 50, SNARK: 50 }, peak: 'DEBUGGING', dump: 'PATIENCE' };
    const seed: Companion = { bones, name: "seed", personality: "seed", hatchedAt: 0, userId: "seed" };
    storage.saveSlot("buddy", seed);
    storage.saveActiveSlot("buddy");

    const workers = 6;
    const children: Promise<void>[] = [];
    for (let i = 0; i < workers; i++) {
      children.push(
        new Promise<void>((resolve, reject) => {
          const child = spawn("bun", ["run", workerPath, stateDir, String(i)], { stdio: "ignore" });
          child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`Worker ${i} exited with code ${code}`))));
          child.on("error", reject);
        }),
      );
    }
    await Promise.all(children);

    const slots = storage.listSlots();
    expect(slots.length).toBe(1);
    const active = storage.loadActive();
    expect(active).not.toBeNull();
    const expectedNames = new Set<string>();
    for (let i = 0; i < workers; i++) expectedNames.add(`worker-${i}`);
    expect(expectedNames.has(active!.name)).toBe(true);
  });
  test("concurrent ensureStableIdentity calls agree on a single id", async () => {
    const parent = mkdtempSync(join(tmpdir(), "buddy-identity-concurrency-"));
    temporaryDirectories.push(parent);
    const stateDir = join(parent, "state");
    mkdirSync(stateDir, { recursive: true });

    const fileStoragePath = join(import.meta.dir, "file-storage.ts");
    const workerPath = join(parent, "identity-worker.ts");
    const workerCode =
      `import { FileBuddyStorage } from "${fileStoragePath}";\n` +
      "const stateDir = process.argv[2];\n" +
      "const storage = new FileBuddyStorage(stateDir);\n" +
      "const id = storage.ensureStableIdentity();\n" +
      "process.stdout.write(id + '\\n');\n";
    writeFileSync(workerPath, workerCode, "utf8");

    const workers = 6;
    const outputs: string[] = [];
    const children: Promise<void>[] = [];
    for (let i = 0; i < workers; i++) {
      children.push(
        new Promise<void>((resolve, reject) => {
          let out = "";
          const child = spawn("bun", ["run", workerPath, stateDir], { stdio: ["ignore", "pipe", "ignore"] });
          child.stdout!.on("data", (data) => { out += data.toString(); });
          child.on("exit", (code) => {
            if (code === 0) {
              outputs.push(out.trim());
              resolve();
            } else {
              reject(new Error(`Worker ${i} exited with code ${code}`));
            }
          });
          child.on("error", reject);
        }),
      );
    }
    await Promise.all(children);

    const storage = new FileBuddyStorage(stateDir);
    const identity = storage.ensureStableIdentity();
    expect(new Set(outputs).size).toBe(1);
    expect(outputs[0]).toBe(identity);
  });
  test("lock acquisition cleans up unique temp files after contention", async () => {
    const parent = mkdtempSync(join(tmpdir(), "buddy-lock-cleanup-"));
    temporaryDirectories.push(parent);
    const stateDir = join(parent, "state");
    mkdirSync(stateDir, { recursive: true });

    const workerPath = join(parent, "cleanup-worker.ts");
    const workerCode = `import { FileBuddyStorage } from "${join(import.meta.dir, "file-storage.ts")}";\n` +
      "const stateDir = process.argv[2];\n" +
      "const count = Number(process.argv[3]);\n" +
      "const storage = new FileBuddyStorage(stateDir);\n" +
      "for (let i = 0; i < count; i++) storage.increment(\"commands_run\");\n";
    writeFileSync(workerPath, workerCode, "utf8");

    const workers = 4;
    const increments = 25;
    const children: Promise<void>[] = [];
    for (let i = 0; i < workers; i++) {
      children.push(
        new Promise<void>((resolve, reject) => {
          const child = spawn("bun", ["run", workerPath, stateDir, String(increments)], {
            stdio: "ignore",
          });
          child.on("exit", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Worker exited with code ${code}`));
          });
          child.on("error", reject);
        }),
      );
    }
    await Promise.all(children);

    const storage = new FileBuddyStorage(stateDir);
    expect(storage.loadCounters().commands_run).toBe(workers * increments);

    const leftovers = readdirSync(stateDir).filter((name) => name.startsWith(".lock-"));
    expect(leftovers).toEqual([]);
  });
  test("concurrent ensureCompanion calls agree on a single created companion", async () => {
    const parent = mkdtempSync(join(tmpdir(), "buddy-ensure-companion-concurrency-"));
    temporaryDirectories.push(parent);
    const stateDir = join(parent, "state");
    mkdirSync(stateDir, { recursive: true });
    const storage = new FileBuddyStorage(stateDir);
    const fileStoragePath = join(import.meta.dir, "file-storage.ts");
    const enginePath = join(import.meta.dir, "../../core/engine.ts");
    const modelPath = join(import.meta.dir, "../../core/model.ts");

    const workerPath = join(parent, "ensure-companion-worker.ts");
    const workerCode =
      `import { FileBuddyStorage } from "${fileStoragePath}";\n` +
      `import type { BuddyBones } from "${enginePath}";\n` +
      `import type { Companion } from "${modelPath}";\n` +
      "const stateDir = process.argv[2];\n" +
      "const storage = new FileBuddyStorage(stateDir);\n" +
      "const bones: BuddyBones = { rarity: 'common', species: 'duck', eye: '°', hat: 'none', shiny: false, stats: { DEBUGGING: 50, PATIENCE: 50, CHAOS: 50, WISDOM: 50, SNARK: 50 }, peak: 'DEBUGGING', dump: 'PATIENCE' };\n" +
      "const create = (existingSlots: string[]) => {\n" +
      "  const slot = existingSlots.length === 0 ? 'ember' : `ember-${existingSlots.length}`;\n" +
      "  const companion: Companion = { bones, name: 'Ember', personality: 'test', hatchedAt: 0, userId: 'u-1' };\n" +
      "  return { companion, slot };\n" +
      "};\n" +
      "const result = storage.ensureCompanion('u-1', create);\n" +
      "process.stdout.write(JSON.stringify({ slot: result.slot, name: result.companion.name }) + '\\n');\n";
    writeFileSync(workerPath, workerCode, "utf8");

    const workers = 4;
    const outputs: string[] = [];
    const children: Promise<void>[] = [];
    for (let i = 0; i < workers; i++) {
      children.push(
        new Promise<void>((resolve, reject) => {
          let out = "";
          const child = spawn("bun", ["run", workerPath, stateDir], { stdio: ["ignore", "pipe", "ignore"] });
          child.stdout!.on("data", (data) => { out += data.toString(); });
          child.on("exit", (code) => {
            if (code === 0) {
              outputs.push(out.trim());
              resolve();
            } else {
              reject(new Error(`Worker ${i} exited with code ${code}`));
            }
          });
          child.on("error", reject);
        }),
      );
    }
    await Promise.all(children);

    const slots = storage.listSlots();
    expect(slots.length).toBe(1);
    expect(new Set(outputs).size).toBe(1);
  });

  test("concurrent unlockAchievements do not duplicate newly unlocked entries", async () => {
    const parent = mkdtempSync(join(tmpdir(), "buddy-unlock-concurrency-"));
    temporaryDirectories.push(parent);
    const stateDir = join(parent, "state");
    mkdirSync(stateDir, { recursive: true });
    const storage = new FileBuddyStorage(stateDir);
    const fileStoragePath = join(import.meta.dir, "file-storage.ts");

    const powerUser = ACHIEVEMENTS.find((a) => a.id === "power_user");
    expect(powerUser).toBeDefined();

    storage.increment("commands_run", 50);

    const workerPath = join(parent, "unlock-worker.ts");
    const workerCode =
      `import { FileBuddyStorage } from "${fileStoragePath}";\n` +
      "const stateDir = process.argv[2];\n" +
      "const storage = new FileBuddyStorage(stateDir);\n" +
      "const evaluate = (counters: { commands_run: number }, unlockedIds: Set<string>) => {\n" +
      "  if (counters.commands_run >= 50 && !unlockedIds.has('power_user')) {\n" +
      "    return [{ id: 'power_user', name: 'Power User', description: 'Run 50 buddy commands', icon: '⚡', check: () => false, secret: false }];\n" +
      "  }\n" +
      "  return [];\n" +
      "};\n" +
      "const newly = storage.unlockAchievements(undefined, evaluate);\n" +
      "process.stdout.write(JSON.stringify(newly) + '\\n');\n";
    writeFileSync(workerPath, workerCode, "utf8");

    const workers = 4;
    const outputs: string[][] = [];
    const children: Promise<void>[] = [];
    for (let i = 0; i < workers; i++) {
      children.push(
        new Promise<void>((resolve, reject) => {
          let out = "";
          const child = spawn("bun", ["run", workerPath, stateDir], { stdio: ["ignore", "pipe", "ignore"] });
          child.stdout!.on("data", (data) => { out += data.toString(); });
          child.on("exit", (code) => {
            if (code === 0) {
              try {
                outputs.push(JSON.parse(out.trim()));
                resolve();
              } catch {
                reject(new Error(`Worker ${i} returned invalid JSON: ${out}`));
              }
            } else {
              reject(new Error(`Worker ${i} exited with code ${code}`));
            }
          });
          child.on("error", reject);
        }),
      );
    }
    await Promise.all(children);

    const unlocked = storage.loadUnlocked();
    expect(unlocked.filter((entry) => entry.id === "power_user").length).toBe(1);
    expect(outputs.filter((list) => list.length > 0).length).toBe(1);
  });
});
