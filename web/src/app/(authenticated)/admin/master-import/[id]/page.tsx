import Link from "next/link";
import { redirect } from "next/navigation";
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
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <div className="flex justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-teal-700">匯入批次</p>
          <h1 className="text-3xl font-bold">{batch.entityType}</h1>
          <p className="mt-2 text-sm text-slate-500">{batch.id}</p>
        </div>
        <Link
          href={`/admin/master-import?companyId=${companyId}`}
          className="rounded-lg border px-4 py-2"
        >
          返回匯入管理
        </Link>
      </div>
      <dl className="mt-8 grid gap-4 rounded-2xl border bg-white p-6 md:grid-cols-4">
        <div><dt className="text-slate-500">狀態</dt><dd className="font-semibold">{batch.status}</dd></div>
        <div><dt className="text-slate-500">來源筆數</dt><dd className="font-semibold">{batch.totalCount}</dd></div>
        <div><dt className="text-slate-500">匯入／略過／失敗</dt><dd className="font-semibold">{batch.importedCount}／{batch.skippedCount}／{batch.failedCount}</dd></div>
        <div><dt className="text-slate-500">Correlation ID</dt><dd className="break-all font-mono text-xs">{batch.correlationId}</dd></div>
      </dl>
      <section className="mt-6 rounded-2xl border bg-white p-6">
        <h2 className="text-lg font-semibold">Reconciliation</h2>
        {batch.reconciliations.map((entry) => (
          <p key={entry.id} className="mt-3 text-sm">
            {entry.entityType}：{entry.reconciliationStatus}（來源 {entry.sourceCount}、匯入 {entry.importedCount}、略過 {entry.skippedCount}、失敗 {entry.failedCount}）
          </p>
        ))}
      </section>
      <section className="mt-6 overflow-x-auto rounded-2xl border bg-white p-6">
        <h2 className="text-lg font-semibold">Validation issues</h2>
        <table className="mt-4 w-full text-left text-sm">
          <thead><tr className="border-b"><th className="py-2">列</th><th>等級</th><th>代碼</th><th>訊息</th><th>狀態</th></tr></thead>
          <tbody>
            {batch.issues.map((entry) => (
              <tr key={entry.id} className="border-b">
                <td className="py-3">{entry.rowNumber ?? "—"}</td>
                <td>{entry.severity}</td>
                <td>{entry.issueCode}</td>
                <td>{entry.message}</td>
                <td>{entry.resolutionStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {batch.issues.length === 0 ? <p className="py-4 text-slate-500">無 issue。</p> : null}
      </section>
      <section className="mt-6 overflow-x-auto rounded-2xl border bg-white p-6">
        <h2 className="text-lg font-semibold">Legacy mappings</h2>
        <table className="mt-4 w-full text-left text-sm">
          <thead><tr className="border-b"><th className="py-2">Entity</th><th>Legacy ID</th><th>正式 UUID</th></tr></thead>
          <tbody>
            {batch.legacyMappings.map((entry) => (
              <tr key={entry.id} className="border-b">
                <td className="py-3">{entry.entityType}</td>
                <td>{entry.legacyId}</td>
                <td className="font-mono text-xs">{entry.localId}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {batch.legacyMappings.length === 0 ? <p className="py-4 text-slate-500">無 mapping。</p> : null}
      </section>
    </main>
  );
}
