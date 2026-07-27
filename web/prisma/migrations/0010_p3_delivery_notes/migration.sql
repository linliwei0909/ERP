-- CreateEnum
CREATE TYPE "delivery_note_status" AS ENUM ('ACTIVE', 'SHIPPED', 'RECEIVABLE_CREATED', 'VOIDED');

-- CreateEnum
CREATE TYPE "delivery_note_void_source" AS ENUM ('ADMIN_DIRECT', 'ORDER_REVISION_REBUILD', 'ORDER_VOID');

-- CreateTable
CREATE TABLE "delivery_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "delivery_note_number" VARCHAR(32) NOT NULL,
    "delivery_note_date" DATE NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "fiscal_month" INTEGER NOT NULL,
    "sales_order_id" UUID NOT NULL,
    "sales_order_revision_no" INTEGER NOT NULL,
    "status" "delivery_note_status" NOT NULL,
    "void_source" "delivery_note_void_source",
    "company_snapshot" JSONB NOT NULL,
    "customer_snapshot" JSONB NOT NULL,
    "customer_company_snapshot" JSONB NOT NULL,
    "contact_snapshot" JSONB,
    "delivery_snapshot" JSONB NOT NULL,
    "payment_terms_text" TEXT,
    "freight_snapshot" JSONB NOT NULL,
    "subtotal" DECIMAL(18,0) NOT NULL,
    "freight_amount" DECIMAL(18,0) NOT NULL,
    "total_amount" DECIMAL(18,0) NOT NULL,
    "replaced_delivery_note_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID NOT NULL,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by" UUID,
    "void_reason" TEXT,

    CONSTRAINT "delivery_notes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "delivery_notes_revision_check"
      CHECK ("sales_order_revision_no" >= 1),
    CONSTRAINT "delivery_notes_period_check"
      CHECK (
        "fiscal_year" BETWEEN 1 AND 9999
        AND "fiscal_month" BETWEEN 1 AND 12
        AND "fiscal_year" = EXTRACT(YEAR FROM "delivery_note_date")::INTEGER
        AND "fiscal_month" = EXTRACT(MONTH FROM "delivery_note_date")::INTEGER
      ),
    CONSTRAINT "delivery_notes_number_format_check"
      CHECK (
        "delivery_note_number" ~ '^DN-[A-Z]{2}-[0-9]{6}-[0-9]{6}$'
        AND substring("delivery_note_number" FROM 7 FOR 6)
          = lpad("fiscal_year"::TEXT, 4, '0')
            || lpad("fiscal_month"::TEXT, 2, '0')
      ),
    CONSTRAINT "delivery_notes_snapshot_check"
      CHECK (
        jsonb_typeof("company_snapshot") = 'object'
        AND "company_snapshot" <> '{}'::JSONB
        AND jsonb_typeof("customer_snapshot") = 'object'
        AND "customer_snapshot" <> '{}'::JSONB
        AND jsonb_typeof("customer_company_snapshot") = 'object'
        AND "customer_company_snapshot" <> '{}'::JSONB
        AND (
          "contact_snapshot" IS NULL
          OR (
            jsonb_typeof("contact_snapshot") = 'object'
            AND "contact_snapshot" <> '{}'::JSONB
          )
        )
        AND jsonb_typeof("delivery_snapshot") = 'object'
        AND "delivery_snapshot" <> '{}'::JSONB
        AND jsonb_typeof("freight_snapshot") = 'object'
        AND "freight_snapshot" <> '{}'::JSONB
      ),
    CONSTRAINT "delivery_notes_amount_check"
      CHECK (
        "subtotal" >= 0
        AND "freight_amount" >= 0
        AND "total_amount" >= 0
        AND "total_amount" = "subtotal" + "freight_amount"
      ),
    CONSTRAINT "delivery_notes_void_lifecycle_check"
      CHECK (
        (
          "status" = 'VOIDED'
          AND "void_source" IS NOT NULL
          AND "voided_at" IS NOT NULL
          AND "voided_by" IS NOT NULL
          AND "void_reason" IS NOT NULL
          AND btrim("void_reason") <> ''
        )
        OR
        (
          "status" <> 'VOIDED'
          AND "void_source" IS NULL
          AND "voided_at" IS NULL
          AND "voided_by" IS NULL
          AND "void_reason" IS NULL
        )
      ),
    CONSTRAINT "delivery_notes_replacement_not_self_check"
      CHECK (
        "replaced_delivery_note_id" IS NULL
        OR "replaced_delivery_note_id" <> "id"
      )
);

-- CreateTable
CREATE TABLE "delivery_note_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "delivery_note_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "sales_order_line_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "item_snapshot" JSONB NOT NULL,
    "price_snapshot" JSONB NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit_price" DECIMAL(18,5) NOT NULL,
    "line_amount" DECIMAL(18,0) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "delivery_note_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "delivery_note_lines_line_number_check"
      CHECK ("line_number" > 0),
    CONSTRAINT "delivery_note_lines_value_check"
      CHECK (
        "quantity" > 0
        AND "unit_price" >= 0
        AND "line_amount" >= 0
      ),
    CONSTRAINT "delivery_note_lines_snapshot_check"
      CHECK (
        jsonb_typeof("item_snapshot") = 'object'
        AND "item_snapshot" <> '{}'::JSONB
        AND jsonb_typeof("price_snapshot") = 'object'
        AND "price_snapshot" <> '{}'::JSONB
      )
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_notes_number_key"
  ON "delivery_notes"("delivery_note_number");

-- CreateIndex
CREATE INDEX "delivery_notes_company_date_idx"
  ON "delivery_notes"("company_id", "delivery_note_date" DESC);

-- CreateIndex
CREATE INDEX "delivery_notes_company_status_date_idx"
  ON "delivery_notes"("company_id", "status", "delivery_note_date" DESC);

-- CreateIndex
CREATE INDEX "delivery_notes_order_status_idx"
  ON "delivery_notes"("sales_order_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_notes_id_company_key"
  ON "delivery_notes"("id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_notes_id_order_company_key"
  ON "delivery_notes"("id", "sales_order_id", "company_id");

-- A nullable PostgreSQL unique index permits multiple NULL values. Combined with
-- the composite self-FK, this guarantees that one old note has at most one direct
-- replacement in the same company and sales order.
CREATE UNIQUE INDEX "delivery_notes_replaced_order_company_key"
  ON "delivery_notes"("replaced_delivery_note_id", "sales_order_id", "company_id");

-- DEC-047 / DEC-057: all non-VOIDED states occupy the one-current-note slot.
CREATE UNIQUE INDEX "delivery_notes_one_non_voided_per_order_key"
  ON "delivery_notes"("sales_order_id")
  WHERE "status" <> 'VOIDED';

-- CreateIndex
CREATE INDEX "delivery_note_lines_order_line_idx"
  ON "delivery_note_lines"("sales_order_line_id");

-- CreateIndex
CREATE INDEX "delivery_note_lines_company_item_note_idx"
  ON "delivery_note_lines"("company_id", "item_id", "delivery_note_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_note_lines_note_line_key"
  ON "delivery_note_lines"("delivery_note_id", "line_number");

-- Supporting unique for the company-scoped delivery-note-line FK.
CREATE UNIQUE INDEX "sales_order_lines_id_company_key"
  ON "sales_order_lines"("id", "company_id");

-- AddForeignKey
ALTER TABLE "delivery_notes"
  ADD CONSTRAINT "delivery_notes_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- This composite FK subsumes the single-column sales_order_id reference while
-- additionally proving that the delivery note and order belong to one company.
ALTER TABLE "delivery_notes"
  ADD CONSTRAINT "delivery_notes_sales_order_id_company_id_fkey"
  FOREIGN KEY ("sales_order_id", "company_id")
  REFERENCES "sales_orders"("id", "company_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- This composite self-FK proves existence plus same order and company.
ALTER TABLE "delivery_notes"
  ADD CONSTRAINT "delivery_notes_replaced_delivery_note_id_sales_order_id_co_fkey"
  FOREIGN KEY ("replaced_delivery_note_id", "sales_order_id", "company_id")
  REFERENCES "delivery_notes"("id", "sales_order_id", "company_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "delivery_notes"
  ADD CONSTRAINT "delivery_notes_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "delivery_notes"
  ADD CONSTRAINT "delivery_notes_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "delivery_notes"
  ADD CONSTRAINT "delivery_notes_voided_by_fkey"
  FOREIGN KEY ("voided_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- The composite FK subsumes delivery_note_id existence and enforces company scope.
ALTER TABLE "delivery_note_lines"
  ADD CONSTRAINT "delivery_note_lines_delivery_note_id_company_id_fkey"
  FOREIGN KEY ("delivery_note_id", "company_id")
  REFERENCES "delivery_notes"("id", "company_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- The composite FK subsumes sales_order_line_id existence and enforces company scope.
ALTER TABLE "delivery_note_lines"
  ADD CONSTRAINT "delivery_note_lines_sales_order_line_id_company_id_fkey"
  FOREIGN KEY ("sales_order_line_id", "company_id")
  REFERENCES "sales_order_lines"("id", "company_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "delivery_note_lines"
  ADD CONSTRAINT "delivery_note_lines_item_id_fkey"
  FOREIGN KEY ("item_id") REFERENCES "items"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "delivery_note_lines"
  ADD CONSTRAINT "delivery_note_lines_item_id_company_id_fkey"
  FOREIGN KEY ("item_id", "company_id")
  REFERENCES "item_companies"("item_id", "company_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "delivery_note_lines"
  ADD CONSTRAINT "delivery_note_lines_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Replacement chain integrity. The composite FK handles same company/order.
-- The transaction-scoped advisory lock serializes replacement mutations per order,
-- while the recursive walk prevents indirect cycles.
CREATE FUNCTION "enforce_delivery_note_replacement_chain"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  "old_company_id" UUID;
  "old_sales_order_id" UUID;
  "cycle_found" BOOLEAN;
BEGIN
  IF NEW."replaced_delivery_note_id" IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('delivery_note_replacement:' || NEW."sales_order_id"::TEXT, 0)
  );

  IF NEW."replaced_delivery_note_id" = NEW."id" THEN
    RAISE EXCEPTION 'delivery note cannot replace itself'
      USING ERRCODE = '23514',
            CONSTRAINT = 'delivery_notes_replacement_not_self_check';
  END IF;

  SELECT "company_id", "sales_order_id"
    INTO "old_company_id", "old_sales_order_id"
    FROM "delivery_notes"
   WHERE "id" = NEW."replaced_delivery_note_id";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'replaced delivery note does not exist'
      USING ERRCODE = '23503',
            CONSTRAINT = 'delivery_notes_replaced_delivery_note_id_sales_order_id_co_fkey';
  END IF;

  IF "old_company_id" <> NEW."company_id"
     OR "old_sales_order_id" <> NEW."sales_order_id" THEN
    RAISE EXCEPTION 'replacement must remain in the same company and sales order'
      USING ERRCODE = '23514',
            CONSTRAINT = 'delivery_notes_replacement_scope_check';
  END IF;

  WITH RECURSIVE "replacement_ancestors" AS (
    SELECT "id", "replaced_delivery_note_id"
      FROM "delivery_notes"
     WHERE "id" = NEW."replaced_delivery_note_id"
    UNION
    SELECT "delivery_notes"."id", "delivery_notes"."replaced_delivery_note_id"
      FROM "delivery_notes"
      JOIN "replacement_ancestors"
        ON "delivery_notes"."id" = "replacement_ancestors"."replaced_delivery_note_id"
  )
  SELECT EXISTS (
    SELECT 1
      FROM "replacement_ancestors"
     WHERE "id" = NEW."id"
  )
  INTO "cycle_found";

  IF "cycle_found" THEN
    RAISE EXCEPTION 'delivery note replacement cycle is not allowed'
      USING ERRCODE = '23514',
            CONSTRAINT = 'delivery_notes_replacement_cycle_check';
  END IF;

  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER "delivery_notes_replacement_chain_check"
AFTER INSERT OR UPDATE OF
  "replaced_delivery_note_id", "sales_order_id", "company_id"
ON "delivery_notes"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW
EXECUTE FUNCTION "enforce_delivery_note_replacement_chain"();

-- ADDITION forms a one-level root-to-addition graph. A global transaction-scoped
-- advisory lock serializes the low-frequency graph mutation, including concurrent
-- inserts that would otherwise both pass row-local checks.
CREATE FUNCTION "enforce_sales_order_addition_graph"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  "source_company_id" UUID;
  "related_company_id" UUID;
  "cycle_found" BOOLEAN;
BEGIN
  IF NEW."relation_type" <> 'ADDITION' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('sales_order_relations:ADDITION', 0)
  );

  IF NEW."source_order_id" = NEW."related_order_id" THEN
    RAISE EXCEPTION 'sales order relation cannot reference itself'
      USING ERRCODE = '23514',
            CONSTRAINT = 'sales_order_relations_not_self_check';
  END IF;

  SELECT "company_id"
    INTO "source_company_id"
    FROM "sales_orders"
   WHERE "id" = NEW."source_order_id";

  SELECT "company_id"
    INTO "related_company_id"
    FROM "sales_orders"
   WHERE "id" = NEW."related_order_id";

  IF "source_company_id" IS NULL OR "related_company_id" IS NULL THEN
    RAISE EXCEPTION 'sales order relation endpoint does not exist'
      USING ERRCODE = '23503';
  END IF;

  IF "source_company_id" <> "related_company_id" THEN
    RAISE EXCEPTION 'addition orders must belong to the same company'
      USING ERRCODE = '23514',
            CONSTRAINT = 'sales_order_relations_addition_company_check';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM "sales_order_relations"
     WHERE "relation_type" = 'ADDITION'
       AND "related_order_id" = NEW."related_order_id"
       AND "id" <> NEW."id"
  ) THEN
    RAISE EXCEPTION 'addition order already has a root source'
      USING ERRCODE = '23505',
            CONSTRAINT = 'sales_order_relations_addition_related_unique';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM "sales_order_relations"
     WHERE "relation_type" = 'ADDITION'
       AND "related_order_id" = NEW."source_order_id"
       AND "id" <> NEW."id"
  ) THEN
    RAISE EXCEPTION 'an addition order cannot be another addition source'
      USING ERRCODE = '23514',
            CONSTRAINT = 'sales_order_relations_addition_source_root_check';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM "sales_order_relations"
     WHERE "relation_type" = 'ADDITION'
       AND "source_order_id" = NEW."related_order_id"
       AND "id" <> NEW."id"
  ) THEN
    RAISE EXCEPTION 'an existing source cannot become an addition order'
      USING ERRCODE = '23514',
            CONSTRAINT = 'sales_order_relations_addition_related_leaf_check';
  END IF;

  WITH RECURSIVE "addition_descendants" AS (
    SELECT "related_order_id"
      FROM "sales_order_relations"
     WHERE "relation_type" = 'ADDITION'
       AND "source_order_id" = NEW."related_order_id"
       AND "id" <> NEW."id"
    UNION
    SELECT "relations"."related_order_id"
      FROM "sales_order_relations" AS "relations"
      JOIN "addition_descendants"
        ON "relations"."source_order_id" = "addition_descendants"."related_order_id"
     WHERE "relations"."relation_type" = 'ADDITION'
       AND "relations"."id" <> NEW."id"
  )
  SELECT EXISTS (
    SELECT 1
      FROM "addition_descendants"
     WHERE "related_order_id" = NEW."source_order_id"
  )
  INTO "cycle_found";

  IF "cycle_found" THEN
    RAISE EXCEPTION 'sales order addition cycle is not allowed'
      USING ERRCODE = '23514',
            CONSTRAINT = 'sales_order_relations_addition_cycle_check';
  END IF;

  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER "sales_order_relations_addition_graph_check"
AFTER INSERT OR UPDATE OF
  "source_order_id", "related_order_id", "relation_type"
ON "sales_order_relations"
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW
EXECUTE FUNCTION "enforce_sales_order_addition_graph"();
