import type { PrismaClient } from "@/generated/prisma/client";

export const EXPECTED_MIGRATIONS = [
  "0001_p1_foundation_baseline",
  "0002_p1_authentication_and_access",
  "0003_p1_operational_foundation",
  "0004_p2_customer_master",
  "0005_p2_item_master",
  "0006_p2_pricing_master",
  "0007_p2_freight_rules",
  "0008_p2_master_import_foundation",
  "0009_p3_sales_orders",
] as const;

export async function assertExpectedMigrations(
  db: PrismaClient,
): Promise<void> {
  const rows = await db.$queryRaw<Array<{ migration_name: string }>>`
    SELECT "migration_name"
    FROM "_prisma_migrations"
    WHERE "finished_at" IS NOT NULL
      AND "rolled_back_at" IS NULL
    ORDER BY "migration_name"
  `;
  const actual = rows.map((row) => row.migration_name);
  if (
    actual.length !== EXPECTED_MIGRATIONS.length ||
    actual.some((name, index) => name !== EXPECTED_MIGRATIONS[index])
  ) {
    throw new Error("Database migration state does not match the application");
  }
}
