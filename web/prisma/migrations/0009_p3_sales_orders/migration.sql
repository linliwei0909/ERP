-- P3.1 sales-order baseline. This migration intentionally does not create
-- delivery notes, receivables, inventory, warehouse or accounting objects.

-- CreateEnum
CREATE TYPE "sales_order_status" AS ENUM (
  'DRAFT',
  'CONFIRMED',
  'DELIVERY_CREATED',
  'SHIPPED',
  'COMPLETED',
  'VOIDED'
);

CREATE TYPE "price_source" AS ENUM (
  'STANDARD',
  'STANDARD_OVERRIDE',
  'MANUAL'
);

CREATE TYPE "sales_order_relation_type" AS ENUM ('ADDITION');

-- Extend the existing sequence model without creating a parallel sequence.
ALTER TABLE "document_sequences"
ADD COLUMN "fiscal_month" INTEGER NOT NULL DEFAULT 0;

DROP INDEX "document_sequences_company_year_type_key";
DROP INDEX "document_sequences_type_year_idx";

CREATE UNIQUE INDEX "document_sequences_company_period_type_key"
ON "document_sequences" (
  "company_id",
  "fiscal_year",
  "fiscal_month",
  "document_type"
);

CREATE INDEX "document_sequences_type_period_idx"
ON "document_sequences" (
  "document_type",
  "fiscal_year",
  "fiscal_month"
);

ALTER TABLE "document_sequences"
ADD CONSTRAINT "document_sequences_fiscal_month_check"
CHECK ("fiscal_month" BETWEEN 0 AND 12);

-- A document company code is immutable once used. Keeping it unique across
-- retained versions prevents two companies from ever sharing the same code.
CREATE UNIQUE INDEX "company_settings_document_company_code_key"
ON "company_settings" (
  UPPER(BTRIM("setting_value" #>> '{}'))
)
WHERE "setting_key" = 'document_company_code';

ALTER TABLE "company_settings"
ADD CONSTRAINT "company_settings_document_company_code_check"
CHECK (
  "setting_key" <> 'document_company_code'
  OR (
    jsonb_typeof("setting_value") = 'string'
    AND ("setting_value" #>> '{}') ~ '^[A-Z]{2}$'
  )
);

-- CreateTable
CREATE TABLE "sales_orders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "fiscal_year" INTEGER NOT NULL,
  "fiscal_month" INTEGER NOT NULL,
  "order_number" VARCHAR(32) NOT NULL,
  "order_date" DATE NOT NULL,
  "customer_id" UUID NOT NULL,
  "delivery_location_id" UUID NOT NULL,
  "customer_contact_id" UUID,
  "status" "sales_order_status" NOT NULL DEFAULT 'DRAFT',
  "revision_no" INTEGER NOT NULL DEFAULT 1,
  "customer_snapshot" JSONB NOT NULL,
  "customer_company_snapshot" JSONB NOT NULL,
  "contact_snapshot" JSONB,
  "delivery_snapshot" JSONB NOT NULL,
  "company_snapshot" JSONB NOT NULL,
  "payment_terms_text" TEXT,
  "subtotal" NUMERIC(18,0) NOT NULL DEFAULT 0,
  "freight_rule_id" UUID,
  "freight_mode" "freight_mode",
  "freight_snapshot" JSONB,
  "freight_amount" NUMERIC(18,0) NOT NULL DEFAULT 0,
  "total_amount" NUMERIC(18,0) NOT NULL DEFAULT 0,
  "confirmed_at" TIMESTAMPTZ(3),
  "confirmed_by" UUID,
  "voided_at" TIMESTAMPTZ(3),
  "voided_by" UUID,
  "void_reason" TEXT,
  "created_by" UUID NOT NULL,
  "updated_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales_order_lines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "sales_order_id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "line_number" INTEGER NOT NULL,
  "item_id" UUID NOT NULL,
  "price_list_id" UUID,
  "item_price_id" UUID,
  "item_snapshot" JSONB NOT NULL,
  "price_snapshot" JSONB NOT NULL,
  "quantity" NUMERIC(18,4) NOT NULL,
  "standard_unit_price" NUMERIC(18,5),
  "unit_price" NUMERIC(18,5) NOT NULL,
  "price_source" "price_source" NOT NULL,
  "manual_price_reason" TEXT,
  "price_overridden_at" TIMESTAMPTZ(3),
  "price_overridden_by" UUID,
  "line_amount" NUMERIC(18,0) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "removed_at" TIMESTAMPTZ(3),
  "removed_by" UUID,
  "created_by" UUID NOT NULL,
  "updated_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "sales_order_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales_order_relations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "source_order_id" UUID NOT NULL,
  "related_order_id" UUID NOT NULL,
  "relation_type" "sales_order_relation_type" NOT NULL,
  "reason" TEXT NOT NULL,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sales_order_relations_pkey" PRIMARY KEY ("id")
);

-- Indexes and uniqueness.
CREATE UNIQUE INDEX "sales_orders_company_period_number_key"
ON "sales_orders" (
  "company_id",
  "fiscal_year",
  "fiscal_month",
  "order_number"
);

CREATE UNIQUE INDEX "sales_orders_id_company_key"
ON "sales_orders" ("id", "company_id");

CREATE INDEX "sales_orders_company_status_date_idx"
ON "sales_orders" ("company_id", "status", "order_date" DESC);

CREATE INDEX "sales_orders_company_customer_date_idx"
ON "sales_orders" ("company_id", "customer_id", "order_date" DESC);

CREATE INDEX "sales_orders_location_date_idx"
ON "sales_orders" ("delivery_location_id", "order_date" DESC);

CREATE UNIQUE INDEX "sales_order_lines_order_line_key"
ON "sales_order_lines" ("sales_order_id", "line_number");

CREATE INDEX "sales_order_lines_company_item_order_idx"
ON "sales_order_lines" ("company_id", "item_id", "sales_order_id");

CREATE INDEX "sales_order_lines_price_source_idx"
ON "sales_order_lines" ("price_list_id", "item_price_id");

CREATE UNIQUE INDEX "sales_order_relations_source_related_type_key"
ON "sales_order_relations" (
  "source_order_id",
  "related_order_id",
  "relation_type"
);

CREATE INDEX "sales_order_relations_related_type_idx"
ON "sales_order_relations" ("related_order_id", "relation_type");

-- Business and consistency checks.
ALTER TABLE "sales_orders"
ADD CONSTRAINT "sales_orders_period_check"
CHECK (
  "fiscal_year" BETWEEN 1 AND 9999
  AND "fiscal_month" BETWEEN 1 AND 12
  AND "fiscal_year" = EXTRACT(YEAR FROM "order_date")
  AND "fiscal_month" = EXTRACT(MONTH FROM "order_date")
),
ADD CONSTRAINT "sales_orders_number_check"
CHECK ("order_number" ~ '^SO-[A-Z]{2}-[0-9]{6}-[0-9]{6}$'),
ADD CONSTRAINT "sales_orders_revision_check"
CHECK ("revision_no" >= 1),
ADD CONSTRAINT "sales_orders_amount_check"
CHECK (
  "subtotal" >= 0
  AND "freight_amount" >= 0
  AND "total_amount" >= 0
  AND "total_amount" = "subtotal" + "freight_amount"
),
ADD CONSTRAINT "sales_orders_snapshots_check"
CHECK (
  "customer_snapshot" <> '{}'::jsonb
  AND "customer_company_snapshot" <> '{}'::jsonb
  AND "delivery_snapshot" <> '{}'::jsonb
  AND "company_snapshot" <> '{}'::jsonb
),
ADD CONSTRAINT "sales_orders_confirmation_check"
CHECK (
  ("status" = 'DRAFT' AND "confirmed_at" IS NULL AND "confirmed_by" IS NULL)
  OR (
    "status" IN ('CONFIRMED', 'DELIVERY_CREATED', 'SHIPPED', 'COMPLETED')
    AND "confirmed_at" IS NOT NULL
    AND "confirmed_by" IS NOT NULL
  )
  OR "status" = 'VOIDED'
),
ADD CONSTRAINT "sales_orders_void_check"
CHECK (
  (
    "status" = 'VOIDED'
    AND "voided_at" IS NOT NULL
    AND "voided_by" IS NOT NULL
    AND NULLIF(BTRIM("void_reason"), '') IS NOT NULL
  )
  OR (
    "status" <> 'VOIDED'
    AND "voided_at" IS NULL
    AND "voided_by" IS NULL
    AND "void_reason" IS NULL
  )
),
ADD CONSTRAINT "sales_orders_freight_snapshot_check"
CHECK (
  "status" IN ('DRAFT', 'VOIDED')
  OR (
    "freight_rule_id" IS NOT NULL
    AND "freight_mode" IS NOT NULL
    AND "freight_snapshot" IS NOT NULL
    AND "freight_snapshot" <> '{}'::jsonb
  )
);

ALTER TABLE "sales_order_lines"
ADD CONSTRAINT "sales_order_lines_number_check"
CHECK ("line_number" > 0),
ADD CONSTRAINT "sales_order_lines_quantity_check"
CHECK ("quantity" > 0),
ADD CONSTRAINT "sales_order_lines_amount_check"
CHECK (
  "unit_price" >= 0
  AND ("standard_unit_price" IS NULL OR "standard_unit_price" >= 0)
  AND "line_amount" >= 0
),
ADD CONSTRAINT "sales_order_lines_snapshots_check"
CHECK (
  "item_snapshot" <> '{}'::jsonb
  AND "price_snapshot" <> '{}'::jsonb
),
ADD CONSTRAINT "sales_order_lines_price_source_check"
CHECK (
  (
    "price_source" = 'STANDARD'
    AND "standard_unit_price" IS NOT NULL
    AND "unit_price" = "standard_unit_price"
    AND "price_list_id" IS NOT NULL
    AND "item_price_id" IS NOT NULL
    AND "manual_price_reason" IS NULL
    AND "price_overridden_at" IS NULL
    AND "price_overridden_by" IS NULL
  )
  OR (
    "price_source" = 'STANDARD_OVERRIDE'
    AND "standard_unit_price" IS NOT NULL
    AND "price_list_id" IS NOT NULL
    AND "item_price_id" IS NOT NULL
    AND NULLIF(BTRIM("manual_price_reason"), '') IS NOT NULL
    AND "price_overridden_at" IS NOT NULL
    AND "price_overridden_by" IS NOT NULL
  )
  OR (
    "price_source" = 'MANUAL'
    AND "standard_unit_price" IS NULL
    AND "price_list_id" IS NULL
    AND "item_price_id" IS NULL
    AND NULLIF(BTRIM("manual_price_reason"), '') IS NOT NULL
    AND "price_overridden_at" IS NOT NULL
    AND "price_overridden_by" IS NOT NULL
  )
),
ADD CONSTRAINT "sales_order_lines_removal_check"
CHECK (
  (
    "is_active" = true
    AND "removed_at" IS NULL
    AND "removed_by" IS NULL
  )
  OR (
    "is_active" = false
    AND "removed_at" IS NOT NULL
    AND "removed_by" IS NOT NULL
  )
);

ALTER TABLE "sales_order_relations"
ADD CONSTRAINT "sales_order_relations_not_self_check"
CHECK ("source_order_id" <> "related_order_id"),
ADD CONSTRAINT "sales_order_relations_reason_check"
CHECK (NULLIF(BTRIM("reason"), '') IS NOT NULL);

-- Foreign keys use RESTRICT / NO ACTION. No transactional data cascades.
ALTER TABLE "sales_orders"
ADD CONSTRAINT "sales_orders_company_id_fkey"
FOREIGN KEY ("company_id") REFERENCES "companies"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT,
ADD CONSTRAINT "sales_orders_customer_id_fkey"
FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT,
ADD CONSTRAINT "sales_orders_customer_id_company_id_fkey"
FOREIGN KEY ("customer_id", "company_id")
REFERENCES "customer_companies"("customer_id", "company_id")
ON DELETE RESTRICT ON UPDATE RESTRICT,
ADD CONSTRAINT "sales_orders_delivery_location_id_customer_id_fkey"
FOREIGN KEY ("delivery_location_id", "customer_id")
REFERENCES "delivery_locations"("id", "customer_id")
ON DELETE RESTRICT ON UPDATE RESTRICT,
ADD CONSTRAINT "sales_orders_customer_contact_id_fkey"
FOREIGN KEY ("customer_contact_id") REFERENCES "customer_contacts"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT,
ADD CONSTRAINT "sales_orders_freight_rule_id_fkey"
FOREIGN KEY ("freight_rule_id") REFERENCES "freight_rules"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT,
ADD CONSTRAINT "sales_orders_confirmed_by_fkey"
FOREIGN KEY ("confirmed_by") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT,
ADD CONSTRAINT "sales_orders_voided_by_fkey"
FOREIGN KEY ("voided_by") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT,
ADD CONSTRAINT "sales_orders_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT,
ADD CONSTRAINT "sales_orders_updated_by_fkey"
FOREIGN KEY ("updated_by") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "sales_order_lines"
ADD CONSTRAINT "sales_order_lines_sales_order_id_company_id_fkey"
FOREIGN KEY ("sales_order_id", "company_id")
REFERENCES "sales_orders"("id", "company_id")
ON DELETE RESTRICT ON UPDATE RESTRICT,
ADD CONSTRAINT "sales_order_lines_item_id_fkey"
FOREIGN KEY ("item_id") REFERENCES "items"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT,
ADD CONSTRAINT "sales_order_lines_item_id_company_id_fkey"
FOREIGN KEY ("item_id", "company_id")
REFERENCES "item_companies"("item_id", "company_id")
ON DELETE RESTRICT ON UPDATE RESTRICT,
ADD CONSTRAINT "sales_order_lines_price_list_id_fkey"
FOREIGN KEY ("price_list_id") REFERENCES "price_lists"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT,
ADD CONSTRAINT "sales_order_lines_item_price_id_fkey"
FOREIGN KEY ("item_price_id") REFERENCES "item_prices"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT,
ADD CONSTRAINT "sales_order_lines_price_overridden_by_fkey"
FOREIGN KEY ("price_overridden_by") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT,
ADD CONSTRAINT "sales_order_lines_removed_by_fkey"
FOREIGN KEY ("removed_by") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT,
ADD CONSTRAINT "sales_order_lines_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT,
ADD CONSTRAINT "sales_order_lines_updated_by_fkey"
FOREIGN KEY ("updated_by") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "sales_order_relations"
ADD CONSTRAINT "sales_order_relations_source_order_id_fkey"
FOREIGN KEY ("source_order_id") REFERENCES "sales_orders"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT,
ADD CONSTRAINT "sales_order_relations_related_order_id_fkey"
FOREIGN KEY ("related_order_id") REFERENCES "sales_orders"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT,
ADD CONSTRAINT "sales_order_relations_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE RESTRICT;
