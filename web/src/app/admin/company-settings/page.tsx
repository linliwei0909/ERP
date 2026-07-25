import Link from "next/link";
import { redirect } from "next/navigation";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { COMPANY_SETTING_KEYS } from "@/lib/company-settings/registry";
import { listCompanySettingHistory } from "@/lib/company-settings/service";
import { prisma } from "@/lib/prisma";
import { CompanySettingsClient } from "./company-settings-client";

export default async function CompanySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  let pageData;

  try {
    const context = await getPageRequestContext();
    const requestedCompanyId = (await searchParams).companyId;
    const companyId = requestedCompanyId ?? context.selectedCompany.id;
    const history = await listCompanySettingHistory(
      prisma,
      context,
      companyId,
      COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY,
    );
    pageData = { context, companyId, history };
  } catch {
    redirect("/");
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-teal-700">P2.1</p>
          <h1 className="text-3xl font-bold">公司參數管理</h1>
        </div>
        <Link href="/" className="rounded-lg border px-4 py-2">
          返回首頁
        </Link>
      </div>
      <CompanySettingsClient
        companies={pageData.context.authorizedCompanies}
        selectedCompanyId={pageData.companyId}
        history={pageData.history}
      />
    </main>
  );
}
