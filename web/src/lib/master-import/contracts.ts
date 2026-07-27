import { z } from "zod";

export const IMPORT_ENTITY_TYPES = [
  "customers",
  "customer_companies",
  "customer_contacts",
  "delivery_locations",
  "items",
  "item_companies",
  "price_lists",
  "item_prices",
  "customer_price_list_assignments",
  "freight_rules",
] as const;

export type ImportEntityType = (typeof IMPORT_ENTITY_TYPES)[number];

export const IMPLEMENTED_IMPORTERS = [
  "customers",
  "customer_companies",
  "items",
  "item_companies",
] as const satisfies readonly ImportEntityType[];

export const importEntityTypeSchema = z.enum(IMPORT_ENTITY_TYPES);

export const IMPORT_HEADERS: Record<ImportEntityType, readonly string[]> = {
  customers: [
    "legacy_id",
    "company_code",
    "customer_code",
    "customer_type",
    "name",
    "tax_id",
    "country_code",
    "foreign_identifier",
  ],
  customer_companies: [
    "legacy_id",
    "customer_legacy_id",
    "company_code",
    "customer_code",
    "status",
  ],
  customer_contacts: [
    "legacy_id",
    "customer_legacy_id",
    "name",
    "department",
    "job_title",
    "phone",
    "mobile",
    "email",
    "notes",
    "is_primary",
    "status",
  ],
  delivery_locations: [
    "legacy_id",
    "customer_legacy_id",
    "code",
    "name",
    "recipient_name",
    "phone",
    "postal_code",
    "city",
    "district",
    "address_line",
    "full_address",
    "notes",
    "is_default",
    "status",
  ],
  items: [
    "legacy_id",
    "company_code",
    "company_item_code",
    "code",
    "name",
    "description",
    "specification",
    "base_unit",
    "barcode",
    "item_type",
    "sales_enabled",
    "purchase_enabled",
    "inventory_enabled",
    "production_enabled",
  ],
  item_companies: [
    "legacy_id",
    "item_legacy_id",
    "company_code",
    "company_item_code",
    "sales_enabled",
    "status",
  ],
  price_lists: ["legacy_id", "company_code", "code", "name", "status"],
  item_prices: [
    "legacy_id",
    "price_list_legacy_id",
    "item_legacy_id",
    "unit_price",
    "valid_from",
    "valid_to",
    "status",
  ],
  customer_price_list_assignments: [
    "legacy_id",
    "customer_legacy_id",
    "company_code",
    "price_list_legacy_id",
    "valid_from",
    "valid_to",
    "status",
  ],
  freight_rules: [
    "legacy_id",
    "customer_legacy_id",
    "company_code",
    "delivery_location_legacy_id",
    "mode",
    "unit_freight",
    "fixed_freight",
    "valid_from",
    "valid_to",
    "status",
  ],
};

const requiredText = z.string().trim().min(1);
const optionalText = z.string().trim().transform((value) => value || null);
const booleanText = z.enum(["true", "false"]).transform((value) => value === "true");
const statusText = z.enum(["ACTIVE", "INACTIVE"]);

export const customerImportRowSchema = z
  .object({
    legacy_id: requiredText.max(255),
    company_code: requiredText.max(32),
    customer_code: requiredText.max(50),
    customer_type: z.enum(["DOMESTIC", "FOREIGN"]),
    name: requiredText.max(200),
    tax_id: optionalText,
    country_code: optionalText,
    foreign_identifier: optionalText,
  })
  .superRefine((value, context) => {
    if (
      value.customer_type === "DOMESTIC" &&
      (value.country_code || value.foreign_identifier)
    ) {
      context.addIssue({
        code: "custom",
        message: "境內客戶不得填寫境外識別欄位",
      });
    }
    if (
      value.customer_type === "FOREIGN" &&
      (!value.country_code || !value.foreign_identifier)
    ) {
      context.addIssue({
        code: "custom",
        message: "境外客戶必須填寫國別及境外識別",
      });
    }
  });

export const customerCompanyImportRowSchema = z.object({
  legacy_id: requiredText.max(255),
  customer_legacy_id: requiredText.max(255),
  company_code: requiredText.max(32),
  customer_code: requiredText.max(50),
  status: statusText,
});

export const itemImportRowSchema = z.object({
  legacy_id: requiredText.max(255),
  company_code: requiredText.max(32),
  company_item_code: requiredText.max(100),
  code: requiredText.max(100),
  name: requiredText.max(200),
  description: optionalText,
  specification: optionalText,
  base_unit: requiredText.max(50),
  barcode: optionalText,
  item_type: z.enum(["PRODUCT", "RAW_MATERIAL"]),
  sales_enabled: booleanText,
  purchase_enabled: booleanText,
  inventory_enabled: booleanText,
  production_enabled: booleanText,
});

export const itemCompanyImportRowSchema = z.object({
  legacy_id: requiredText.max(255),
  item_legacy_id: requiredText.max(255),
  company_code: requiredText.max(32),
  company_item_code: requiredText.max(100),
  sales_enabled: booleanText,
  status: statusText,
});

export type CustomerImportRow = z.infer<typeof customerImportRowSchema>;
export type CustomerCompanyImportRow = z.infer<
  typeof customerCompanyImportRowSchema
>;
export type ItemImportRow = z.infer<typeof itemImportRowSchema>;
export type ItemCompanyImportRow = z.infer<typeof itemCompanyImportRowSchema>;

export function isImplementedImporter(
  entityType: ImportEntityType,
): entityType is (typeof IMPLEMENTED_IMPORTERS)[number] {
  return (IMPLEMENTED_IMPORTERS as readonly string[]).includes(entityType);
}
