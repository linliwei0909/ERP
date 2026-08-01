import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import pageStyles from "@/components/app-shell/page-contract.module.css";
import { Button, Card, EmptyState, Field, LinkButton, Select, StatusBadge, Table, TableBody, TableCaption, TableCell, TableContainer, TableEmptyRow, TableHead, TableHeader, TableRow } from "@/components/ui";
import { requireAdminWithAudit } from "@/lib/auth/authorization";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { listMigrationBatches } from "@/lib/master-import/service";
import { prisma } from "@/lib/prisma";
import { MasterImportClient } from "./master-import-client";

const statusLabels: Record<string, string> = {
  PENDING: "等待中",
  VALIDATING: "驗證中",
  VALIDATED: "驗證完成",
  IMPORTING: "匯入中",
  COMPLETED: "完成",
  COMPLETED_WITH_ERRORS: "部分錯誤",
  FAILED: "失敗",
};

export default async function AdminMasterImportPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  let data;
  try {
    const context = await getPageRequestContext();
    await requireAdminWithAudit(prisma, context);
    const query = await searchParams;
    const companyId = query.companyId ?? context.selectedCompany.id;
    const batches = await listMigrationBatches(prisma, { context, companyId });
    data = { context, companyId, batches };
  } catch {
    redirect("/");
  }
  const { context, companyId, batches } = data;

  return (
    <div className={pageStyles.pageStack}>
      <PageHeader containerVariant="wide" context="管理員功能" title="主檔匯入管理" description="建立 dry-run 或核准範圍內的正式匯入批次。" />
      <Card><form className={pageStyles.filterGrid}>
        <Field label="匯入公司"><Select
            name="companyId"
            defaultValue={companyId}
          >
            {context.authorizedCompanies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.code}－{company.name}
              </option>
            ))}
          </Select></Field>
        <Button type="submit" variant="secondary">切換</Button>
      </form></Card>
      <MasterImportClient companyId={companyId} />
      <TableContainer><Table><TableCaption>最近匯入批次</TableCaption><TableHeader><TableRow><TableHead>時間</TableHead><TableHead>Entity</TableHead><TableHead>模式</TableHead><TableHead>狀態</TableHead><TableHead>筆數</TableHead><TableHead>操作</TableHead></TableRow></TableHeader><TableBody>
            {batches.map((batch) => (
              <TableRow key={batch.id}>
                <TableCell>
                  {batch.startedAt.toLocaleString("zh-TW")}
                </TableCell>
                <TableCell>{batch.entityType}</TableCell>
                <TableCell>{batch.dryRun ? "Dry-run" : "正式匯入"}</TableCell>
                <TableCell><StatusBadge label={statusLabels[batch.status] ?? batch.status} tone={batch.status === "COMPLETED" ? "success" : batch.status === "FAILED" || batch.status === "COMPLETED_WITH_ERRORS" ? "danger" : "info"} /></TableCell>
                <TableCell>
                  {batch.importedCount}/{batch.totalCount}
                </TableCell>
                <TableCell>
                  <LinkButton
                    href={`/admin/master-import/${batch.id}?companyId=${companyId}`}
                    variant="secondary" size="small"
                  >
                    查看
                  </LinkButton>
                </TableCell>
              </TableRow>
            ))}
        {batches.length === 0 ? (
          <TableEmptyRow colSpan={6}><EmptyState variant="no-data" title="尚無匯入批次" /></TableEmptyRow>
        ) : null}
      </TableBody></Table></TableContainer>
    </div>
  );
}
