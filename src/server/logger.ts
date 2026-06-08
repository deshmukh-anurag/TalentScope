// Minimal structured logger for the server.
//
// Replaces the scattered `console.log` debug statements with leveled logging
// that stays quiet in production. Set LOG_LEVEL=debug to see verbose output.

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const configuredLevel = (): Level => {
  const fromEnv = (process.env.LOG_LEVEL || "").toLowerCase();
  if (fromEnv in LEVEL_ORDER) return fromEnv as Level;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
};

const threshold = LEVEL_ORDER[configuredLevel()];

const emit = (level: Level, scope: string, message: string, meta?: unknown) => {
  if (LEVEL_ORDER[level] < threshold) return;
  const prefix = `[${level}] ${scope}:`;
  const sink = level === "debug" ? console.log : console[level];
  if (meta !== undefined) {
    sink(prefix, message, meta);
  } else {
    sink(prefix, message);
  }
};

export const createLogger = (scope: string) => ({
  debug: (message: string, meta?: unknown) => emit("debug", scope, message, meta),
  info: (message: string, meta?: unknown) => emit("info", scope, message, meta),
  warn: (message: string, meta?: unknown) => emit("warn", scope, message, meta),
  error: (message: string, meta?: unknown) => emit("error", scope, message, meta),
});

export type Logger = ReturnType<typeof createLogger>;
