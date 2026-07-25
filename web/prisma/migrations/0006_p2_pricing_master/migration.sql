-- Required for UUID equality operators in GiST exclusion constraints.
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateTable
CREATE TABLE "price_lists" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "normalized_code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "status" "record_status" NOT NULL DEFAULT 'ACTIVE',
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "price_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_prices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "price_list_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "unit_price" DECIMAL(18,5) NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "status" "record_status" NOT NULL DEFAULT 'ACTIVE',
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "item_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_price_list_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "price_list_id" UUID NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "status" "record_status" NOT NULL DEFAULT 'ACTIVE',
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customer_price_list_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "price_lists_company_status_name_idx" ON "price_lists"("company_id", "status", "name");

-- CreateIndex
CREATE UNIQUE INDEX "price_lists_company_code_key" ON "price_lists"("company_id", "normalized_code");

-- CreateIndex
CREATE UNIQUE INDEX "price_lists_id_company_key" ON "price_lists"("id", "company_id");

-- CreateIndex
CREATE INDEX "item_prices_lookup_idx" ON "item_prices"("price_list_id", "item_id", "valid_from" DESC);

-- CreateIndex
CREATE INDEX "item_prices_item_status_period_idx" ON "item_prices"("item_id", "status", "valid_from", "valid_to");

-- CreateIndex
CREATE INDEX "price_assignments_customer_company_lookup_idx" ON "customer_price_list_assignments"("customer_id", "company_id", "valid_from" DESC);

-- CreateIndex
CREATE INDEX "price_assignments_price_list_period_idx" ON "customer_price_list_assignments"("price_list_id", "company_id", "valid_from", "valid_to");

-- Custom checks and all-history period exclusion constraints.
ALTER TABLE "price_lists"
ADD CONSTRAINT "price_lists_required_text_not_blank_check"
CHECK (
    btrim("code") <> ''
    AND btrim("normalized_code") <> ''
    AND btrim("name") <> ''
);

ALTER TABLE "item_prices"
ADD CONSTRAINT "item_prices_unit_price_nonnegative_check"
CHECK ("unit_price" >= 0),
ADD CONSTRAINT "item_prices_valid_period_check"
CHECK ("valid_to" IS NULL OR "valid_to" > "valid_from"),
ADD CONSTRAINT "item_prices_period_exclusion"
EXCLUDE USING gist (
    "price_list_id" WITH =,
    "item_id" WITH =,
    daterange("valid_from", "valid_to", '[)') WITH &&
);

ALTER TABLE "customer_price_list_assignments"
ADD CONSTRAINT "price_assignments_valid_period_check"
CHECK ("valid_to" IS NULL OR "valid_to" > "valid_from"),
ADD CONSTRAINT "price_assignments_period_exclusion"
EXCLUDE USING gist (
    "customer_id" WITH =,
    "company_id" WITH =,
    daterange("valid_from", "valid_to", '[)') WITH &&
);

-- AddForeignKey
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "item_prices" ADD CONSTRAINT "item_prices_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_lists"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "item_prices" ADD CONSTRAINT "item_prices_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "item_prices" ADD CONSTRAINT "item_prices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "item_prices" ADD CONSTRAINT "item_prices_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "customer_price_list_assignments" ADD CONSTRAINT "customer_price_list_assignments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "customer_price_list_assignments" ADD CONSTRAINT "customer_price_list_assignments_customer_id_company_id_fkey" FOREIGN KEY ("customer_id", "company_id") REFERENCES "customer_companies"("customer_id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "customer_price_list_assignments" ADD CONSTRAINT "customer_price_list_assignments_price_list_id_company_id_fkey" FOREIGN KEY ("price_list_id", "company_id") REFERENCES "price_lists"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "customer_price_list_assignments" ADD CONSTRAINT "customer_price_list_assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "customer_price_list_assignments" ADD CONSTRAINT "customer_price_list_assignments_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
