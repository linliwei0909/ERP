import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import pageStyles from "@/components/app-shell/page-contract.module.css";
import { getPageRequestContext } from "@/lib/auth/request-context";
import {
  assertCompanySettingKey,
  COMPANY_SETTING_KEYS,
} from "@/lib/company-settings/registry";
import { listCompanySettingHistory } from "@/lib/company-settings/service";
import { prisma } from "@/lib/prisma";
import { CompanySettingsClient } from "./company-settings-client";

export default async function CompanySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string; settingKey?: string }>;
}) {
  let pageData;

  try {
    const context = await getPageRequestContext();
    const query = await searchParams;
    const requestedCompanyId = query.companyId;
    const companyId = requestedCompanyId ?? context.selectedCompany.id;
    const settingKey =
      query.settingKey ?? COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY;
    assertCompanySettingKey(settingKey);
    const history = await listCompanySettingHistory(
      prisma,
      context,
      companyId,
      settingKey,
    );
    pageData = { context, companyId, settingKey, history };
  } catch {
    redirect("/");
  }

  return (
    <div className={pageStyles.pageStack}>
      <PageHeader containerVariant="standard" context="管理員功能" title="公司參數管理" description="管理公司參數的未來版本與生效歷程。" />
      <CompanySettingsClient
        companies={pageData.context.authorizedCompanies}
        selectedCompanyId={pageData.companyId}
        selectedSettingKey={pageData.settingKey}
        history={pageData.history}
      />
    </div>
  );
}
