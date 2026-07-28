import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.P1_TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe.sequential : describe.skip;
const migration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/0012_p3_delivery_note_print_version_contract/migration.sql",
  ),
  "utf8",
);

describeDatabase("P3.3b2 contract migration behavior", () => {
  const client = new Client({ connectionString: databaseUrl });

  beforeAll(async () => {
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  function schemaName(): string {
    return `p3_3b2_${randomUUID().replaceAll("-", "")}`;
  }

  async function createPreMigrationTables(schema: string): Promise<void> {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}", public`);
    await client.query(`
      CREATE TABLE delivery_notes (
        id UUID PRIMARY KEY,
        company_snapshot JSONB NOT NULL,
        customer_snapshot JSONB NOT NULL,
        customer_company_snapshot JSONB NOT NULL,
        contact_snapshot JSONB,
        delivery_snapshot JSONB NOT NULL,
        freight_snapshot JSONB NOT NULL
      );
      CREATE TABLE delivery_note_print_versions (
        id UUID PRIMARY KEY
      );
    `);
  }

  async function dropSchema(schema: string): Promise<void> {
    await client.query("SET search_path TO public");
    await client.query(`DROP SCHEMA "${schema}" CASCADE`);
  }

  it("backfills existing notes without changing frozen JSON", async () => {
    const schema = schemaName();
    await createPreMigrationTables(schema);
    const noteId = randomUUID();
    const snapshots = {
      company: { name: "company", nested: { value: 1 } },
      customer: { name: "customer" },
      customerCompany: { code: "C001" },
      contact: { name: "contact" },
      delivery: { address: "delivery" },
      freight: { mode: "NO_CHARGE" },
    };

    try {
      await client.query(
        `INSERT INTO delivery_notes (
           id, company_snapshot, customer_snapshot,
           customer_company_snapshot, contact_snapshot,
           delivery_snapshot, freight_snapshot
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          noteId,
          snapshots.company,
          snapshots.customer,
          snapshots.customerCompany,
          snapshots.contact,
          snapshots.delivery,
          snapshots.freight,
        ],
      );
      const before = await client.query(
        `SELECT company_snapshot, customer_snapshot,
                customer_company_snapshot, contact_snapshot,
                delivery_snapshot, freight_snapshot
           FROM delivery_notes
          WHERE id = $1`,
        [noteId],
      );

      await client.query(migration);

      const after = await client.query(
        `SELECT company_snapshot, customer_snapshot,
                customer_company_snapshot, contact_snapshot,
                delivery_snapshot, freight_snapshot, snapshot_version
           FROM delivery_notes
          WHERE id = $1`,
        [noteId],
      );
      expect(after.rows[0]).toMatchObject({
        ...before.rows[0],
        snapshot_version: "delivery-note-snapshot-v1",
      });

      const columns = await client.query<{
        table_name: string;
        column_name: string;
        is_nullable: string;
        column_default: string | null;
      }>(
        `SELECT table_name, column_name, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_schema = $1
            AND (
              (table_name = 'delivery_notes'
                AND column_name = 'snapshot_version')
              OR
              (table_name = 'delivery_note_print_versions'
                AND column_name IN (
                  'renderer_version', 'font_version', 'snapshot_version'
                ))
            )
          ORDER BY table_name, column_name`,
        [schema],
      );
      expect(columns.rows).toHaveLength(4);
      expect(
        columns.rows.every(
          (column) =>
            column.is_nullable === "NO" && column.column_default === null,
        ),
      ).toBe(true);
    } finally {
      await dropSchema(schema);
    }
  });

  it("fails fast and preserves an existing print version row", async () => {
    const schema = schemaName();
    await createPreMigrationTables(schema);
    const printVersionId = randomUUID();

    try {
      await client.query(
        "INSERT INTO delivery_note_print_versions (id) VALUES ($1)",
        [printVersionId],
      );

      await expect(client.query(migration)).rejects.toMatchObject({
        code: "P0001",
        message: expect.stringContaining("contains 1 existing row(s)"),
      });
      await client.query("ROLLBACK");

      const existing = await client.query(
        "SELECT id FROM delivery_note_print_versions WHERE id = $1",
        [printVersionId],
      );
      expect(existing.rows).toEqual([{ id: printVersionId }]);

      const addedColumns = await client.query(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = $1
            AND table_name = 'delivery_note_print_versions'
            AND column_name IN (
              'renderer_version', 'font_version', 'snapshot_version'
            )`,
        [schema],
      );
      expect(addedColumns.rows).toEqual([]);
    } finally {
      await dropSchema(schema);
    }
  });
});
