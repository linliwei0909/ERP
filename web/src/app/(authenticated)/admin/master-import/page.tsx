import Link from "next/link";
import { redirect } from "next/navigation";
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
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <div className="flex justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-teal-700">P2.6 管理員功能</p>
          <h1 className="text-3xl font-bold">主檔匯入管理</h1>
        </div>
        <Link href="/" className="rounded-lg border px-4 py-2">
          返回首頁
        </Link>
      </div>
      <form className="mt-8 rounded-2xl border bg-white p-5">
        <label className="text-sm">
          匯入公司
          <select
            name="companyId"
            defaultValue={companyId}
            className="ml-3 rounded-lg border px-3 py-2"
          >
            {context.authorizedCompanies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.code}－{company.name}
              </option>
            ))}
          </select>
        </label>
        <button className="ml-3 rounded-lg border px-4 py-2">切換</button>
      </form>
      <MasterImportClient companyId={companyId} />
      <section className="mt-6 overflow-x-auto rounded-2xl border bg-white p-6">
        <h2 className="text-lg font-semibold">最近批次</h2>
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">時間</th>
              <th>Entity</th>
              <th>模式</th>
              <th>狀態</th>
              <th>筆數</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {batches.map((batch) => (
              <tr key={batch.id} className="border-b">
                <td className="py-3">
                  {batch.startedAt.toLocaleString("zh-TW")}
                </td>
                <td>{batch.entityType}</td>
                <td>{batch.dryRun ? "Dry-run" : "正式匯入"}</td>
                <td>{statusLabels[batch.status] ?? batch.status}</td>
                <td>
                  {batch.importedCount}/{batch.totalCount}
                </td>
                <td className="text-right">
                  <Link
                    href={`/admin/master-import/${batch.id}?companyId=${companyId}`}
                    className="rounded-lg border px-3 py-2"
                  >
                    查看
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {batches.length === 0 ? (
          <p className="py-4 text-slate-500">尚無匯入批次。</p>
        ) : null}
      </section>
    </main>
  );
}
