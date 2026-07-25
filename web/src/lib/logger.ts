type LogLevel = "debug" | "info" | "warn" | "error";
export type LogContext = Record<string, unknown>;
import { sanitizeSensitive } from "@/lib/sensitive-data";

const levelWeight: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function write(level: LogLevel, message: string, context: LogContext = {}) {
  const configuredLevel = process.env.LOG_LEVEL;
  const minimumLevel =
    configuredLevel && configuredLevel in levelWeight
      ? (configuredLevel as LogLevel)
      : "info";

  if (levelWeight[level] < levelWeight[minimumLevel]) {
    return;
  }

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(sanitizeSensitive(context) as LogContext),
  };

  const serialized = JSON.stringify(entry);

  if (level === "error") {
    console.error(serialized);
  } else if (level === "warn") {
    console.warn(serialized);
  } else {
    console.log(serialized);
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) =>
    write("debug", message, context),
  info: (message: string, context?: LogContext) =>
    write("info", message, context),
  warn: (message: string, context?: LogContext) =>
    write("warn", message, context),
  error: (message: string, context?: LogContext) =>
    write("error", message, context),
};
