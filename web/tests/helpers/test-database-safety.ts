const DISPOSABLE_DATABASE_PATTERN =
  /^erp_[a-z0-9_]*(?:test|closeout)[a-z0-9_]*_\d{8}_[a-z0-9]+$/;
const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const TEST_DATABASE_PORT = "55432";
const TEST_DATABASE_ROLE = "p1_test";

export interface TestDatabaseTarget {
  connectionString: string;
  database: string;
  host: string;
  password: string;
  port: number;
  role: string;
}

export interface QueryClient {
  query<T extends Record<string, unknown>>(
    text: string,
  ): Promise<{ rows: T[] }>;
}

function safetyError(message: string): Error {
  return new Error(`DB test safety preflight failed: ${message}`);
}

function parseTarget(
  variableName: string,
  connectionString: string | undefined,
): TestDatabaseTarget {
  if (!connectionString) {
    throw safetyError(`${variableName} is required; DB tests may not be skipped.`);
  }

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw safetyError(`${variableName} is not a valid PostgreSQL URL.`);
  }

  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw safetyError(`${variableName} must use the PostgreSQL protocol.`);
  }

  const host = url.hostname.toLowerCase();
  const port = url.port;
  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  const role = decodeURIComponent(url.username);
  const schema = url.searchParams.get("schema");

  if (!ALLOWED_HOSTS.has(host)) {
    throw safetyError(`${variableName} must target an explicitly local host.`);
  }
  if (port !== TEST_DATABASE_PORT) {
    throw safetyError(
      `${variableName} must use the isolated test port ${TEST_DATABASE_PORT}.`,
    );
  }
  if (role !== TEST_DATABASE_ROLE) {
    throw safetyError(
      `${variableName} must use the dedicated ${TEST_DATABASE_ROLE} role.`,
    );
  }
  if (!DISPOSABLE_DATABASE_PATTERN.test(database)) {
    throw safetyError(
      `${variableName} database must use the ERP disposable naming contract with a date and unique suffix.`,
    );
  }
  if (schema && schema !== "public") {
    throw safetyError(`${variableName} may only target the public schema.`);
  }

  return {
    connectionString,
    database,
    host,
    password: decodeURIComponent(url.password),
    port: Number(port),
    role,
  };
}

export function validateTestDatabaseEnvironment(
  environment: Record<string, string | undefined>,
): TestDatabaseTarget {
  const testTarget = parseTarget(
    "P1_TEST_DATABASE_URL",
    environment.P1_TEST_DATABASE_URL,
  );
  const runtimeTarget = parseTarget("DATABASE_URL", environment.DATABASE_URL);

  if (
    runtimeTarget.host !== testTarget.host ||
    runtimeTarget.port !== testTarget.port ||
    runtimeTarget.database !== testTarget.database ||
    runtimeTarget.role !== testTarget.role
  ) {
    throw safetyError(
      "DATABASE_URL and P1_TEST_DATABASE_URL must resolve to the same disposable database target.",
    );
  }

  return testTarget;
}

export function formatTestDatabaseTarget(target: TestDatabaseTarget): string {
  return [
    `host=${target.host}`,
    `port=${target.port}`,
    `database=${target.database}`,
    `role=${target.role}`,
  ].join(" ");
}

export function redactTestDatabaseError(
  error: unknown,
  target: TestDatabaseTarget,
): string {
  const original = error instanceof Error ? error.message : String(error);
  const secrets = [
    target.connectionString,
    target.password,
    encodeURIComponent(target.password),
  ].filter(Boolean);

  return secrets.reduce(
    (message, secret) => message.replaceAll(secret, "[REDACTED]"),
    original,
  );
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export async function assertDisposableDatabaseIsClean(
  client: QueryClient,
): Promise<void> {
  const tables = await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename",
  );
  const populatedTables: string[] = [];

  for (const { tablename } of tables.rows) {
    const result = await client.query<{ has_rows: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM ${quoteIdentifier("public")}.${quoteIdentifier(tablename)} LIMIT 1) AS has_rows`,
    );
    if (result.rows[0]?.has_rows) {
      populatedTables.push(tablename);
    }
  }

  if (populatedTables.length > 0) {
    throw safetyError(
      `disposable database is not clean; populated tables: ${populatedTables.join(", ")}. No automatic cleanup was performed.`,
    );
  }
}
