-- Required for UUID equality operators in GiST exclusion constraints.
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateEnum
CREATE TYPE "freight_mode" AS ENUM ('NO_CHARGE', 'QUANTITY_BASED', 'FIXED_PER_LOCATION');

-- CreateTable
CREATE TABLE "freight_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "delivery_location_id" UUID NOT NULL,
    "mode" "freight_mode" NOT NULL,
    "unit_freight" DECIMAL(18,0),
    "fixed_freight" DECIMAL(18,0),
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "status" "record_status" NOT NULL DEFAULT 'ACTIVE',
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "freight_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "freight_rules_lookup_idx" ON "freight_rules"("company_id", "customer_id", "delivery_location_id", "status", "valid_from", "valid_to");

-- CreateIndex
CREATE INDEX "freight_rules_history_idx" ON "freight_rules"("company_id", "customer_id", "delivery_location_id", "valid_from" DESC);

-- Custom mode, amount, period and all-history overlap constraints.
ALTER TABLE "freight_rules"
ADD CONSTRAINT "freight_rules_amount_nonnegative_check"
CHECK (
    ("unit_freight" IS NULL OR "unit_freight" >= 0)
    AND ("fixed_freight" IS NULL OR "fixed_freight" >= 0)
),
ADD CONSTRAINT "freight_rules_mode_amount_check"
CHECK (
    ("mode" = 'NO_CHARGE' AND "unit_freight" IS NULL AND "fixed_freight" IS NULL)
    OR ("mode" = 'QUANTITY_BASED' AND "unit_freight" IS NOT NULL AND "fixed_freight" IS NULL)
    OR ("mode" = 'FIXED_PER_LOCATION' AND "unit_freight" IS NULL AND "fixed_freight" IS NOT NULL)
),
ADD CONSTRAINT "freight_rules_valid_period_check"
CHECK ("valid_to" IS NULL OR "valid_to" > "valid_from"),
ADD CONSTRAINT "freight_rules_period_exclusion"
EXCLUDE USING gist (
    "company_id" WITH =,
    "customer_id" WITH =,
    "delivery_location_id" WITH =,
    daterange("valid_from", "valid_to", '[)') WITH &&
);

-- AddForeignKey
ALTER TABLE "freight_rules" ADD CONSTRAINT "freight_rules_customer_id_company_id_fkey" FOREIGN KEY ("customer_id", "company_id") REFERENCES "customer_companies"("customer_id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "freight_rules" ADD CONSTRAINT "freight_rules_delivery_location_id_customer_id_fkey" FOREIGN KEY ("delivery_location_id", "customer_id") REFERENCES "delivery_locations"("id", "customer_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "freight_rules" ADD CONSTRAINT "freight_rules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "freight_rules" ADD CONSTRAINT "freight_rules_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
