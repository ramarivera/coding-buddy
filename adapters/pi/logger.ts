import { mkdirSync } from "node:fs";
import { join } from "node:path";
import pino, { type Logger } from "pino";
import { PiBuddyStorage } from "./storage.ts";

function resolveLogLevel(): pino.LevelWithSilent {
  const level = (process.env.PI_BUDDY_LOG_LEVEL
    ?? process.env.CODING_BUDDY_LOG_LEVEL
    ?? "info").toLowerCase();

  if (["fatal", "error", "warn", "info", "debug", "trace", "silent"].includes(level)) {
    return level as pino.LevelWithSilent;
  }

  return "info";
}

export class PiBuddyLogger {
  readonly filePath: string;
  readonly logger: Logger;

  constructor(storage: PiBuddyStorage) {
    const logDir = join(storage.stateDir, "logs");
    mkdirSync(logDir, { recursive: true });
    this.filePath = join(logDir, "buddy.log");
    this.logger = pino(
      {
        name: "pi-buddy",
        level: resolveLogLevel(),
        base: undefined,
        timestamp: pino.stdTimeFunctions.isoTime,
      },
      pino.destination({ dest: this.filePath, append: true, mkdir: true, sync: true }),
    );
  }

  info(event: string, data: Record<string, unknown> = {}): void {
    this.logger.info({ event, ...data });
  }

  warn(event: string, data: Record<string, unknown> = {}): void {
    this.logger.warn({ event, ...data });
  }

  error(event: string, data: Record<string, unknown> = {}): void {
    this.logger.error({ event, ...data });
  }

  debug(event: string, data: Record<string, unknown> = {}): void {
    this.logger.debug({ event, ...data });
  }
}
