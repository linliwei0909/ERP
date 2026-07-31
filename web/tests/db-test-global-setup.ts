import { Client } from "pg";
import {
  assertDisposableDatabaseIsClean,
  formatTestDatabaseTarget,
  redactTestDatabaseError,
  validateTestDatabaseEnvironment,
} from "./helpers/test-database-safety";

export async function setup() {
  const target = validateTestDatabaseEnvironment(process.env);
  console.info(`[DB test safety] target ${formatTestDatabaseTarget(target)}`);

  const client = new Client({ connectionString: target.connectionString });
  try {
    await client.connect();
    const identity = await client.query<{
      database: string;
      role: string;
    }>("SELECT current_database() AS database, current_user AS role");

    if (
      identity.rows[0]?.database !== target.database ||
      identity.rows[0]?.role !== target.role
    ) {
      throw new Error(
        "runtime database identity does not match the validated URL target",
      );
    }

    await assertDisposableDatabaseIsClean(client);
    console.info("[DB test safety] disposable database cleanliness check passed");
  } catch (error) {
    throw new Error(
      `DB test safety preflight failed for ${formatTestDatabaseTarget(target)}: ${redactTestDatabaseError(error, target)}`,
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}
