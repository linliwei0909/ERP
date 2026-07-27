import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.P1_TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

type Fixture = {
  companyId: string;
  userId: string;
  orderId: string;
  orderLineId: string;
  itemId: string;
};

let serial = 1;

describeDatabase("P3.2a delivery-note database contract", () => {
  const client = new Client({ connectionString: databaseUrl });

  beforeAll(async () => {
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  async function createFixture(companyId?: string): Promise<Fixture> {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
    const user = await client.query<{ id: string }>(
      `INSERT INTO users (
         username, normalized_username, password_hash, updated_at
       ) VALUES ($1, $2, 'not-a-real-password-hash', now())
       RETURNING id`,
      [`delivery-${suffix}`, `DELIVERY-${suffix}`],
    );
    const userId = user.rows[0]!.id;

    let actualCompanyId = companyId;
    if (!actualCompanyId) {
      const company = await client.query<{ id: string }>(
        `INSERT INTO companies (code, name, updated_at)
         VALUES ($1, $2, now())
         RETURNING id`,
        [`DN-${suffix}`, `Delivery note ${suffix}`],
      );
      actualCompanyId = company.rows[0]!.id;
    }

    const customer = await client.query<{ id: string }>(
      `INSERT INTO customers (
         customer_type, name, created_by, updated_by, updated_at
       ) VALUES ('DOMESTIC', $1, $2, $2, now())
       RETURNING id`,
      [`Customer ${suffix}`, userId],
    );
    const customerId = customer.rows[0]!.id;

    await client.query(
      `INSERT INTO customer_companies (
         customer_id, company_id, customer_code,
         normalized_customer_code, created_by, updated_by, updated_at
       ) VALUES ($1, $2, $3, $3, $4, $4, now())`,
      [customerId, actualCompanyId, `C-${suffix}`, userId],
    );

    const location = await client.query<{ id: string }>(
      `INSERT INTO delivery_locations (
         customer_id, code, name, recipient_name, phone,
         address_line, full_address, created_by, updated_by, updated_at
       ) VALUES ($1, $2, '測試地點', '測試收件人', '0200000000',
                 '測試地址', '測試完整地址', $3, $3, now())
       RETURNING id`,
      [customerId, `L-${suffix}`, userId],
    );

    const item = await client.query<{ id: string }>(
      `INSERT INTO items (
         code, normalized_code, name, base_unit, item_type,
         sales_enabled, created_by, updated_by, updated_at
       ) VALUES ($1, $1, '測試品項', 'EA', 'PRODUCT',
                 true, $2, $2, now())
       RETURNING id`,
      [`I-${suffix}`, userId],
    );
    const itemId = item.rows[0]!.id;

    await client.query(
      `INSERT INTO item_companies (
         item_id, company_id, company_item_code,
         normalized_company_item_code, sales_enabled,
         created_by, updated_by, updated_at
       ) VALUES ($1, $2, $3, $3, true, $4, $4, now())`,
      [itemId, actualCompanyId, `CI-${suffix}`, userId],
    );

    const orderSequence = String(serial++).padStart(6, "0");
    const order = await client.query<{ id: string }>(
      `INSERT INTO sales_orders (
         company_id, fiscal_year, fiscal_month, order_number, order_date,
         customer_id, delivery_location_id, customer_snapshot,
         customer_company_snapshot, delivery_snapshot, company_snapshot,
         created_by, updated_by, updated_at
       ) VALUES (
         $1, 2026, 7, $2, DATE '2026-07-27',
         $3, $4, '{"name":"customer"}'::jsonb,
         '{"code":"customer"}'::jsonb, '{"address":"delivery"}'::jsonb,
         '{"name":"company"}'::jsonb, $5, $5, now()
       )
       RETURNING id`,
      [
        actualCompanyId,
        `SO-TA-202607-${orderSequence}`,
        customerId,
        location.rows[0]!.id,
        userId,
      ],
    );
    const orderId = order.rows[0]!.id;

    const orderLine = await client.query<{ id: string }>(
      `INSERT INTO sales_order_lines (
         sales_order_id, company_id, line_number, item_id,
         item_snapshot, price_snapshot, quantity, unit_price,
         price_source, manual_price_reason, price_overridden_at,
         price_overridden_by, line_amount, created_by, updated_by, updated_at
       ) VALUES (
         $1, $2, 1, $3, '{"code":"item"}'::jsonb,
         '{"source":"MANUAL"}'::jsonb, 1, 10, 'MANUAL',
         'DB contract test', now(), $4, 10, $4, $4, now()
       )
       RETURNING id`,
      [orderId, actualCompanyId, itemId, userId],
    );

    return {
      companyId: actualCompanyId,
      userId,
      orderId,
      orderLineId: orderLine.rows[0]!.id,
      itemId,
    };
  }

  async function insertNote(
    fixture: Fixture,
    options: {
      status?: "ACTIVE" | "SHIPPED" | "RECEIVABLE_CREATED" | "VOIDED";
      replacedDeliveryNoteId?: string;
      numberOverride?: string;
      subtotal?: number;
      freightAmount?: number;
      totalAmount?: number;
      companySnapshot?: string;
    } = {},
  ): Promise<string> {
    const status = options.status ?? "ACTIVE";
    const noteSequence = String(serial++).padStart(6, "0");
    const isVoided = status === "VOIDED";
    const result = await client.query<{ id: string }>(
      `INSERT INTO delivery_notes (
         company_id, delivery_note_number, delivery_note_date,
         fiscal_year, fiscal_month, sales_order_id, sales_order_revision_no,
         status, void_source, company_snapshot, customer_snapshot,
         customer_company_snapshot, contact_snapshot, delivery_snapshot,
         freight_snapshot, subtotal, freight_amount, total_amount,
         replaced_delivery_note_id, created_by, updated_by, updated_at,
         voided_at, voided_by, void_reason
       ) VALUES (
         $1, $2, DATE '2026-07-27', 2026, 7, $3, 1,
         $4, $5, $6::jsonb, '{"name":"customer"}'::jsonb,
         '{"code":"customer"}'::jsonb, NULL, '{"address":"delivery"}'::jsonb,
         '{"mode":"NO_CHARGE"}'::jsonb, $7, $8, $9,
         $10, $11, $11, now(), $12, $13, $14
       )
       RETURNING id`,
      [
        fixture.companyId,
        options.numberOverride ?? `DN-TA-202607-${noteSequence}`,
        fixture.orderId,
        status,
        isVoided ? "ORDER_VOID" : null,
        options.companySnapshot ?? '{"name":"company"}',
        options.subtotal ?? 10,
        options.freightAmount ?? 0,
        options.totalAmount ?? 10,
        options.replacedDeliveryNoteId ?? null,
        fixture.userId,
        isVoided ? new Date() : null,
        isVoided ? fixture.userId : null,
        isVoided ? "DB contract test void" : null,
      ],
    );
    return result.rows[0]!.id;
  }

  it("installs the exact enum, table, trigger, and partial-index contract", async () => {
    const enumValues = await client.query<{ typname: string; enumlabel: string }>(
      `SELECT t.typname, e.enumlabel
         FROM pg_type t
         JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname IN ('delivery_note_status', 'delivery_note_void_source')
        ORDER BY t.typname, e.enumsortorder`,
    );
    expect(enumValues.rows).toEqual([
      { typname: "delivery_note_status", enumlabel: "ACTIVE" },
      { typname: "delivery_note_status", enumlabel: "SHIPPED" },
      { typname: "delivery_note_status", enumlabel: "RECEIVABLE_CREATED" },
      { typname: "delivery_note_status", enumlabel: "VOIDED" },
      {
        typname: "delivery_note_void_source",
        enumlabel: "ADMIN_DIRECT",
      },
      {
        typname: "delivery_note_void_source",
        enumlabel: "ORDER_REVISION_REBUILD",
      },
      {
        typname: "delivery_note_void_source",
        enumlabel: "ORDER_VOID",
      },
    ]);

    const objects = await client.query<{ object_name: string }>(
      `SELECT conname AS object_name
         FROM pg_constraint
        WHERE conname IN (
          'delivery_notes_revision_check',
          'delivery_notes_period_check',
          'delivery_notes_number_format_check',
          'delivery_notes_snapshot_check',
          'delivery_notes_amount_check',
          'delivery_notes_void_lifecycle_check',
          'delivery_notes_replacement_not_self_check',
          'delivery_note_lines_line_number_check',
          'delivery_note_lines_value_check',
          'delivery_note_lines_snapshot_check'
        )
       UNION ALL
       SELECT indexname
         FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'delivery_notes_one_non_voided_per_order_key'
       UNION ALL
       SELECT tgname
         FROM pg_trigger
        WHERE NOT tgisinternal
          AND tgname IN (
            'delivery_notes_replacement_chain_check',
            'sales_order_relations_addition_graph_check'
          )
       ORDER BY object_name`,
    );
    expect(objects.rows.map((row) => row.object_name)).toEqual([
      "delivery_note_lines_line_number_check",
      "delivery_note_lines_snapshot_check",
      "delivery_note_lines_value_check",
      "delivery_notes_amount_check",
      "delivery_notes_number_format_check",
      "delivery_notes_one_non_voided_per_order_key",
      "delivery_notes_period_check",
      "delivery_notes_replacement_chain_check",
      "delivery_notes_replacement_not_self_check",
      "delivery_notes_revision_check",
      "delivery_notes_snapshot_check",
      "delivery_notes_void_lifecycle_check",
      "sales_order_relations_addition_graph_check",
    ]);

    const partialIndex = await client.query<{ indexdef: string }>(
      `SELECT indexdef
         FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'delivery_notes_one_non_voided_per_order_key'`,
    );
    expect(partialIndex.rows[0]!.indexdef).toContain(
      "WHERE (status <> 'VOIDED'::delivery_note_status)",
    );
  });

  it.each([
    ["ACTIVE", "SHIPPED"],
    ["SHIPPED", "ACTIVE"],
    ["RECEIVABLE_CREATED", "ACTIVE"],
  ] as const)(
    "blocks a second non-VOIDED note after %s",
    async (firstStatus, secondStatus) => {
      const fixture = await createFixture();
      await insertNote(fixture, { status: firstStatus });
      await expect(
        insertNote(fixture, { status: secondStatus }),
      ).rejects.toMatchObject({ code: "23505" });
    },
  );

  it("preserves multiple VOIDED rows and permits a new ACTIVE row", async () => {
    const fixture = await createFixture();
    await insertNote(fixture, { status: "VOIDED" });
    await insertNote(fixture, { status: "VOIDED" });
    await expect(insertNote(fixture)).resolves.toBeDefined();
  });

  it("enforces void, period, number, amount, and snapshot checks", async () => {
    const fixture = await createFixture();

    await expect(
      insertNote(fixture, {
        status: "VOIDED",
        companySnapshot: "{}",
      }),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      insertNote(fixture, { numberOverride: "DN-TA-202608-999999" }),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      insertNote(fixture, {
        subtotal: 10,
        freightAmount: 5,
        totalAmount: 14,
      }),
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      client.query(
        `INSERT INTO delivery_notes (
           company_id, delivery_note_number, delivery_note_date,
           fiscal_year, fiscal_month, sales_order_id, sales_order_revision_no,
           status, company_snapshot, customer_snapshot,
           customer_company_snapshot, delivery_snapshot, freight_snapshot,
           subtotal, freight_amount, total_amount,
           created_by, updated_by, updated_at
         ) VALUES (
           $1, $2, DATE '2026-07-27', 2026, 7, $3, 1,
           'VOIDED', '{"name":"company"}', '{"name":"customer"}',
           '{"code":"customer"}', '{"address":"delivery"}',
           '{"mode":"NO_CHARGE"}', 10, 0, 10, $4, $4, now()
         )`,
        [
          fixture.companyId,
          `DN-TA-202607-${String(serial++).padStart(6, "0")}`,
          fixture.orderId,
          fixture.userId,
        ],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("enforces line value, snapshot, unique-line, and composite FK checks", async () => {
    const fixture = await createFixture();
    const noteId = await insertNote(fixture);
    const values = [
      noteId,
      fixture.companyId,
      fixture.orderLineId,
      fixture.itemId,
      fixture.userId,
    ];

    await client.query(
      `INSERT INTO delivery_note_lines (
         delivery_note_id, company_id, line_number, sales_order_line_id,
         item_id, item_snapshot, price_snapshot, quantity, unit_price,
         line_amount, created_by
       ) VALUES ($1, $2, 1, $3, $4, '{"code":"item"}',
                 '{"source":"MANUAL"}', 1, 10, 10, $5)`,
      values,
    );
    await expect(
      client.query(
        `INSERT INTO delivery_note_lines (
           delivery_note_id, company_id, line_number, sales_order_line_id,
           item_id, item_snapshot, price_snapshot, quantity, unit_price,
           line_amount, created_by
         ) VALUES ($1, $2, 1, $3, $4, '{"code":"item"}',
                   '{"source":"MANUAL"}', 1, 10, 10, $5)`,
        values,
      ),
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      client.query(
        `INSERT INTO delivery_note_lines (
           delivery_note_id, company_id, line_number, sales_order_line_id,
           item_id, item_snapshot, price_snapshot, quantity, unit_price,
           line_amount, created_by
         ) VALUES ($1, $2, 2, $3, $4, '{}', '{"source":"MANUAL"}',
                   0, -1, -1, $5)`,
        values,
      ),
    ).rejects.toMatchObject({ code: "23514" });

    const other = await createFixture();
    await expect(
      client.query(
        `INSERT INTO delivery_note_lines (
           delivery_note_id, company_id, line_number, sales_order_line_id,
           item_id, item_snapshot, price_snapshot, quantity, unit_price,
           line_amount, created_by
         ) VALUES ($1, $2, 3, $3, $4, '{"code":"item"}',
                   '{"source":"MANUAL"}', 1, 10, 10, $5)`,
        [
          noteId,
          fixture.companyId,
          other.orderLineId,
          fixture.itemId,
          fixture.userId,
        ],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("enforces replacement scope, uniqueness, self-reference, and cycles", async () => {
    const fixture = await createFixture();
    const first = await insertNote(fixture, { status: "VOIDED" });
    const second = await insertNote(fixture, {
      status: "VOIDED",
      replacedDeliveryNoteId: first,
    });
    const third = await insertNote(fixture, {
      status: "VOIDED",
      replacedDeliveryNoteId: second,
    });

    await expect(
      client.query(
        `UPDATE delivery_notes
            SET replaced_delivery_note_id = id
          WHERE id = $1`,
        [first],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      client.query(
        `UPDATE delivery_notes
            SET replaced_delivery_note_id = $1
          WHERE id = $2`,
        [third, first],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      insertNote(fixture, {
        status: "VOIDED",
        replacedDeliveryNoteId: first,
      }),
    ).rejects.toMatchObject({ code: "23505" });

    const other = await createFixture();
    await expect(
      insertNote(other, {
        status: "VOIDED",
        replacedDeliveryNoteId: first,
      }),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("enforces a same-company, one-level ADDITION graph", async () => {
    const root = await createFixture();
    const addition = await createFixture(root.companyId);
    const siblingRoot = await createFixture(root.companyId);
    const leaf = await createFixture(root.companyId);
    const crossCompany = await createFixture();

    await client.query(
      `INSERT INTO sales_order_relations (
         source_order_id, related_order_id, relation_type, reason, created_by
       ) VALUES ($1, $2, 'ADDITION', 'DB graph test', $3)`,
      [root.orderId, addition.orderId, root.userId],
    );

    await expect(
      client.query(
        `INSERT INTO sales_order_relations (
           source_order_id, related_order_id, relation_type, reason, created_by
         ) VALUES ($1, $2, 'ADDITION', 'duplicate root test', $3)`,
        [siblingRoot.orderId, addition.orderId, siblingRoot.userId],
      ),
    ).rejects.toMatchObject({ code: "23505" });

    await expect(
      client.query(
        `INSERT INTO sales_order_relations (
           source_order_id, related_order_id, relation_type, reason, created_by
         ) VALUES ($1, $2, 'ADDITION', 'addition source test', $3)`,
        [addition.orderId, leaf.orderId, addition.userId],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      client.query(
        `INSERT INTO sales_order_relations (
           source_order_id, related_order_id, relation_type, reason, created_by
         ) VALUES ($1, $2, 'ADDITION', 'cross-company test', $3)`,
        [root.orderId, crossCompany.orderId, root.userId],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      client.query(
        `INSERT INTO sales_order_relations (
           source_order_id, related_order_id, relation_type, reason, created_by
         ) VALUES ($1, $1, 'ADDITION', 'self test', $2)`,
        [root.orderId, root.userId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("uses only RESTRICT or NO ACTION delete behavior and creates no forbidden tables", async () => {
    const foreignKeys = await client.query<{ delete_action: string }>(
      `SELECT rc.delete_rule AS delete_action
         FROM information_schema.referential_constraints rc
        WHERE rc.constraint_schema = 'public'
          AND (
            rc.constraint_name LIKE 'delivery_notes_%_fkey'
            OR rc.constraint_name LIKE 'delivery_note_lines_%_fkey'
          )`,
    );
    expect(foreignKeys.rows.length).toBeGreaterThan(0);
    expect(
      foreignKeys.rows.every((row) =>
        ["RESTRICT", "NO ACTION"].includes(row.delete_action),
      ),
    ).toBe(true);

    const forbidden = await client.query<{ table_name: string }>(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN (
            'receivables', 'inventory', 'warehouses', 'lots',
            'procurement', 'accounting_postings'
          )`,
    );
    expect(forbidden.rows).toEqual([]);
  });
});
