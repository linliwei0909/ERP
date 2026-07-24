export class CompanyAccessError extends Error {
  readonly code = "COMPANY_ACCESS_DENIED";

  constructor() {
    super("沒有該公司的使用權限");
  }
}

export function hasCompanyAccess(
  authorizedCompanyIds: readonly string[],
  companyId: string,
): boolean {
  return authorizedCompanyIds.includes(companyId);
}

export function assertCompanyAccess(
  authorizedCompanyIds: readonly string[],
  companyId: string,
): void {
  if (!hasCompanyAccess(authorizedCompanyIds, companyId)) {
    throw new CompanyAccessError();
  }
}

export function chooseSelectedCompany(input: {
  authorizedCompanyIds: readonly string[];
  selectedCompanyId?: string | null;
  defaultCompanyId?: string | null;
}): string | null {
  if (
    input.selectedCompanyId &&
    hasCompanyAccess(input.authorizedCompanyIds, input.selectedCompanyId)
  ) {
    return input.selectedCompanyId;
  }

  if (
    input.defaultCompanyId &&
    hasCompanyAccess(input.authorizedCompanyIds, input.defaultCompanyId)
  ) {
    return input.defaultCompanyId;
  }

  return input.authorizedCompanyIds[0] ?? null;
}

export function assertSelectedCompany<T>(
  selectedCompany: T | null,
): asserts selectedCompany is T {
  if (selectedCompany === null) {
    throw new CompanyAccessError();
  }
}
