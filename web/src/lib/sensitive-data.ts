const sensitiveKeyPattern =
  /password|passphrase|secret|token|authorization|cookie|credential|session/i;

const sensitiveTextPatterns = [
  /(password|passphrase|secret|token|authorization|cookie|credential)\s*[:=]\s*[^\s,;]+/gi,
  /bearer\s+[A-Za-z0-9._~+/-]+=*/gi,
];

export function sanitizeText(value: string): string {
  return sensitiveTextPatterns.reduce(
    (result, pattern) => result.replace(pattern, "$1=[REDACTED]"),
    value,
  );
}

export function sanitizeSensitive(value: unknown, key = ""): unknown {
  if (sensitiveKeyPattern.test(key)) {
    return "[REDACTED]";
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeText(value.message),
      ...(process.env.NODE_ENV === "production"
        ? {}
        : { stack: value.stack ? sanitizeText(value.stack) : undefined }),
    };
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeSensitive(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeSensitive(entryValue, entryKey),
      ]),
    );
  }

  return typeof value === "string" ? sanitizeText(value) : value;
}
