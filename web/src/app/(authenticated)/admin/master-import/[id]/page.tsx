import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import pageStyles from "@/components/app-shell/page-contract.module.css";
import { Card, DescriptionDetails, DescriptionItem, DescriptionList, DescriptionTerm, EmptyState, LinkButton, Section, StatusBadge, Table, TableBody, TableCaption, TableCell, TableContainer, TableEmptyRow, TableHead, TableHeader, TableRow } from "@/components/ui";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { getMigrationBatch } from "@/lib/master-import/service";
import { prisma } from "@/lib/prisma";

export default async function MasterImportBatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ companyId?: string }>;
}) {
  let data;
  try {
    const context = await getPageRequestContext();
    const query = await searchParams;
    const companyId = query.companyId ?? context.selectedCompany.id;
    const result = await getMigrationBatch(prisma, {
      context,
      companyId,
      batchId: (await params).id,
    });
    data = { companyId, result };
  } catch {
    redirect("/");
  }
  const { companyId, result } = data;
  const { batch } = result;

  return (
    <div className={pageStyles.pageStack}>
      <PageHeader containerVariant="wide" context="匯入批次" title={batch.entityType} description={batch.id} status={<StatusBadge label={batch.status} tone={batch.status === "COMPLETED" ? "success" : batch.status === "FAILED" ? "danger" : "info"} />} actions={<LinkButton href={`/admin/master-import?companyId=${companyId}`} variant="secondary">返回匯入管理</LinkButton>} />
      <Card><DescriptionList columns={4}><DescriptionItem><DescriptionTerm>狀態</DescriptionTerm><DescriptionDetails>{batch.status}</DescriptionDetails></DescriptionItem><DescriptionItem><DescriptionTerm>來源筆數</DescriptionTerm><DescriptionDetails>{batch.totalCount}</DescriptionDetails></DescriptionItem><DescriptionItem><DescriptionTerm>匯入／略過／失敗</DescriptionTerm><DescriptionDetails>{batch.importedCount}／{batch.skippedCount}／{batch.failedCount}</DescriptionDetails></DescriptionItem><DescriptionItem><DescriptionTerm>Correlation ID</DescriptionTerm><DescriptionDetails>{batch.correlationId}</DescriptionDetails></DescriptionItem></DescriptionList></Card>
      <Card><Section title="Reconciliation">
        {batch.reconciliations.map((entry) => (
          <p key={entry.id} className="mt-3 text-sm">
            {entry.entityType}：{entry.reconciliationStatus}（來源 {entry.sourceCount}、匯入 {entry.importedCount}、略過 {entry.skippedCount}、失敗 {entry.failedCount}）
          </p>
        ))}
        {batch.reconciliations.length === 0 ? <EmptyState variant="no-data" title="尚無 reconciliation" /> : null}
      </Section></Card>
      <TableContainer><Table><TableCaption>Validation issues</TableCaption><TableHeader><TableRow><TableHead>列</TableHead><TableHead>等級</TableHead><TableHead>代碼</TableHead><TableHead>訊息</TableHead><TableHead>狀態</TableHead></TableRow></TableHeader><TableBody>
            {batch.issues.map((entry) => (
              <TableRow key={entry.id}><TableCell>{entry.rowNumber ?? "—"}</TableCell><TableCell>{entry.severity}</TableCell><TableCell>{entry.issueCode}</TableCell><TableCell>{entry.message}</TableCell><TableCell>{entry.resolutionStatus}</TableCell></TableRow>
            ))}
        {batch.issues.length === 0 ? <TableEmptyRow colSpan={5}><EmptyState variant="no-data" title="無 validation issue" /></TableEmptyRow> : null}
      </TableBody></Table></TableContainer>
      <TableContainer><Table><TableCaption>Legacy mappings</TableCaption><TableHeader><TableRow><TableHead>Entity</TableHead><TableHead>Legacy ID</TableHead><TableHead>正式 UUID</TableHead></TableRow></TableHeader><TableBody>
            {batch.legacyMappings.map((entry) => (
              <TableRow key={entry.id}><TableCell>{entry.entityType}</TableCell><TableCell monospace>{entry.legacyId}</TableCell><TableCell monospace>{entry.localId}</TableCell></TableRow>
            ))}
        {batch.legacyMappings.length === 0 ? <TableEmptyRow colSpan={3}><EmptyState variant="no-data" title="無 legacy mapping" /></TableEmptyRow> : null}
      </TableBody></Table></TableContainer>
    </div>
  );
}
