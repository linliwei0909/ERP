type CompanyIdentity = {
  code?: string | null;
  name?: string | null;
};

/**
 * Returns the compact company label used throughout ERP reference fields.
 * Company master data remains unchanged; unknown or newly added companies
 * fall back to their maintained name, then code.
 */
export function companyShortName(company: CompanyIdentity): string {
  const code = company.code?.trim().toUpperCase();
  const name = company.name?.trim() ?? "";

  if (code === "CI01" || name.includes("奇麗實業")) return "實業";
  if (code === "CB01" || name.includes("奇麗生技")) return "生技";

  return name || code || "—";
}
