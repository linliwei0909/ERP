type LogLevel = "debug" | "info" | "warn" | "error";
type LogContext = Record<string, unknown>;

const sensitiveKeyPattern =
  /password|passphrase|secret|token|authorization|cookie/i;

const levelWeight: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function normalizeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  return value;
}

function redact(value: unknown, key = ""): unknown {
  if (sensitiveKeyPattern.test(key)) {
    return "[REDACTED]";
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redact(entry));
  }

  if (value && typeof value === "object" && !(value instanceof Error)) {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redact(entryValue, entryKey),
      ]),
    );
  }

  return normalizeValue(value);
}

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
    ...Object.fromEntries(
      Object.entries(context).map(([key, value]) => [
        key,
        redact(value, key),
      ]),
    ),
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
