-- CreateEnum
CREATE TYPE "customer_type" AS ENUM ('DOMESTIC', 'FOREIGN');

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_type" "customer_type" NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "tax_id" VARCHAR(32),
    "normalized_tax_id" VARCHAR(32),
    "country_code" VARCHAR(2),
    "foreign_identifier" VARCHAR(100),
    "status" "record_status" NOT NULL DEFAULT 'ACTIVE',
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_companies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "customer_code" VARCHAR(50) NOT NULL,
    "normalized_customer_code" VARCHAR(50) NOT NULL,
    "status" "record_status" NOT NULL DEFAULT 'ACTIVE',
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customer_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "department" VARCHAR(100),
    "job_title" VARCHAR(100),
    "phone" VARCHAR(50),
    "mobile" VARCHAR(50),
    "email" VARCHAR(320),
    "notes" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "status" "record_status" NOT NULL DEFAULT 'ACTIVE',
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customer_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_locations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "recipient_name" VARCHAR(200) NOT NULL,
    "phone" VARCHAR(50) NOT NULL,
    "postal_code" VARCHAR(20),
    "city" VARCHAR(100),
    "district" VARCHAR(100),
    "address_line" VARCHAR(300) NOT NULL,
    "full_address" VARCHAR(500) NOT NULL,
    "notes" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "status" "record_status" NOT NULL DEFAULT 'ACTIVE',
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "delivery_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_status_name_idx" ON "customers"("status", "name");

-- CreateIndex
CREATE INDEX "customers_type_status_idx" ON "customers"("customer_type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "customers_country_foreign_identifier_key" ON "customers"("country_code", "foreign_identifier");

-- Custom partial unique index: normalized domestic tax IDs are globally unique when present.
CREATE UNIQUE INDEX "customers_normalized_tax_id_active_value_key"
ON "customers" ("normalized_tax_id")
WHERE "normalized_tax_id" IS NOT NULL;

-- CreateIndex
CREATE INDEX "customer_companies_company_status_customer_idx" ON "customer_companies"("company_id", "status", "customer_id");

-- CreateIndex
CREATE INDEX "customer_companies_customer_status_idx" ON "customer_companies"("customer_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "customer_companies_customer_company_key" ON "customer_companies"("customer_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_companies_company_code_key" ON "customer_companies"("company_id", "normalized_customer_code");

-- CreateIndex
CREATE INDEX "customer_contacts_customer_status_primary_idx" ON "customer_contacts"("customer_id", "status", "is_primary" DESC);

-- CreateIndex
CREATE INDEX "customer_contacts_email_idx" ON "customer_contacts"("email");

-- CreateIndex
CREATE INDEX "delivery_locations_customer_status_default_idx" ON "delivery_locations"("customer_id", "status", "is_default" DESC);

-- CreateIndex
CREATE INDEX "delivery_locations_city_district_idx" ON "delivery_locations"("city", "district");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_locations_customer_code_key" ON "delivery_locations"("customer_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_locations_id_customer_key" ON "delivery_locations"("id", "customer_id");

-- Custom partial unique indexes for the single active primary/default rules.
CREATE UNIQUE INDEX "customer_contacts_one_active_primary_key"
ON "customer_contacts" ("customer_id")
WHERE "status" = 'ACTIVE' AND "is_primary" = true;

CREATE UNIQUE INDEX "delivery_locations_one_active_default_key"
ON "delivery_locations" ("customer_id")
WHERE "status" = 'ACTIVE' AND "is_default" = true;

-- Custom business-rule checks that Prisma schema cannot fully express.
ALTER TABLE "customers"
ADD CONSTRAINT "customers_name_not_blank_check"
CHECK (btrim("name") <> ''),
ADD CONSTRAINT "customers_identity_by_type_check"
CHECK (
    (
        "customer_type" = 'DOMESTIC'
        AND "country_code" IS NULL
        AND "foreign_identifier" IS NULL
        AND (
            ("tax_id" IS NULL AND "normalized_tax_id" IS NULL)
            OR (
                NULLIF(btrim("tax_id"), '') IS NOT NULL
                AND NULLIF(btrim("normalized_tax_id"), '') IS NOT NULL
            )
        )
    )
    OR
    (
        "customer_type" = 'FOREIGN'
        AND "tax_id" IS NULL
        AND "normalized_tax_id" IS NULL
        AND "country_code" ~ '^[A-Z]{2}$'
        AND NULLIF(btrim("foreign_identifier"), '') IS NOT NULL
    )
);

ALTER TABLE "customer_companies"
ADD CONSTRAINT "customer_companies_codes_not_blank_check"
CHECK (
    btrim("customer_code") <> ''
    AND btrim("normalized_customer_code") <> ''
);

ALTER TABLE "customer_contacts"
ADD CONSTRAINT "customer_contacts_name_not_blank_check"
CHECK (btrim("name") <> ''),
ADD CONSTRAINT "customer_contacts_method_required_check"
CHECK (
    NULLIF(btrim("phone"), '') IS NOT NULL
    OR NULLIF(btrim("mobile"), '') IS NOT NULL
    OR NULLIF(btrim("email"), '') IS NOT NULL
);

ALTER TABLE "delivery_locations"
ADD CONSTRAINT "delivery_locations_required_text_check"
CHECK (
    btrim("code") <> ''
    AND btrim("name") <> ''
    AND btrim("recipient_name") <> ''
    AND btrim("phone") <> ''
    AND btrim("address_line") <> ''
    AND btrim("full_address") <> ''
);

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "customer_companies" ADD CONSTRAINT "customer_companies_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "customer_companies" ADD CONSTRAINT "customer_companies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "customer_companies" ADD CONSTRAINT "customer_companies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "customer_companies" ADD CONSTRAINT "customer_companies_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "delivery_locations" ADD CONSTRAINT "delivery_locations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "delivery_locations" ADD CONSTRAINT "delivery_locations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "delivery_locations" ADD CONSTRAINT "delivery_locations_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
