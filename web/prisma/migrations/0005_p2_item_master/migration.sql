-- CreateEnum
CREATE TYPE "item_type" AS ENUM ('PRODUCT', 'RAW_MATERIAL');

-- CreateTable
CREATE TABLE "items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(100) NOT NULL,
    "normalized_code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "specification" TEXT,
    "base_unit" VARCHAR(50) NOT NULL,
    "barcode" VARCHAR(100),
    "item_type" "item_type" NOT NULL,
    "sales_enabled" BOOLEAN NOT NULL DEFAULT false,
    "purchase_enabled" BOOLEAN NOT NULL DEFAULT false,
    "inventory_enabled" BOOLEAN NOT NULL DEFAULT false,
    "production_enabled" BOOLEAN NOT NULL DEFAULT false,
    "status" "record_status" NOT NULL DEFAULT 'ACTIVE',
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_companies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "item_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "company_item_code" VARCHAR(100) NOT NULL,
    "normalized_company_item_code" VARCHAR(100) NOT NULL,
    "sales_enabled" BOOLEAN NOT NULL DEFAULT false,
    "status" "record_status" NOT NULL DEFAULT 'ACTIVE',
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "item_companies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "items_normalized_code_key" ON "items"("normalized_code");

-- Custom partial unique index: non-empty normalized barcodes are globally unique.
CREATE UNIQUE INDEX "items_barcode_present_key"
ON "items" ("barcode")
WHERE "barcode" IS NOT NULL;

-- CreateIndex
CREATE INDEX "items_status_sales_type_name_idx" ON "items"("status", "sales_enabled", "item_type", "name");

-- CreateIndex
CREATE INDEX "items_type_status_name_idx" ON "items"("item_type", "status", "name");

-- CreateIndex
CREATE INDEX "item_companies_company_status_sales_item_idx" ON "item_companies"("company_id", "status", "sales_enabled", "item_id");

-- CreateIndex
CREATE INDEX "item_companies_item_status_idx" ON "item_companies"("item_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "item_companies_item_company_key" ON "item_companies"("item_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_companies_company_code_key" ON "item_companies"("company_id", "normalized_company_item_code");

-- Custom business-rule checks that Prisma schema cannot fully express.
ALTER TABLE "items"
ADD CONSTRAINT "items_required_text_not_blank_check"
CHECK (
    btrim("code") <> ''
    AND btrim("normalized_code") <> ''
    AND btrim("name") <> ''
    AND btrim("base_unit") <> ''
),
ADD CONSTRAINT "items_barcode_not_blank_check"
CHECK ("barcode" IS NULL OR btrim("barcode") <> '');

ALTER TABLE "item_companies"
ADD CONSTRAINT "item_companies_code_not_blank_check"
CHECK (
    btrim("company_item_code") <> ''
    AND btrim("normalized_company_item_code") <> ''
);

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "item_companies" ADD CONSTRAINT "item_companies_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "item_companies" ADD CONSTRAINT "item_companies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "item_companies" ADD CONSTRAINT "item_companies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "item_companies" ADD CONSTRAINT "item_companies_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
