import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createPurchaseRequisition } from "@/app/procurement-actions";
import { companyShortName } from "@/lib/company";
import { FlashMessage, PageHeader } from "@/components/procurement-ui";

export default async function NewPurchaseRequisitionPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams; const companies = await prisma.company.findMany({ where: { status: "ACTIVE" }, orderBy: { code: "asc" } });
  const today = new Date().toISOString().slice(0, 10);
  return <><PageHeader eyebrow="採購管理" title="新增請購單" backHref="/purchase-requisitions" description="先建立表頭，儲存後再加入一筆或多筆請購明細。" /><FlashMessage error={error} />
    <form action={createPurchaseRequisition} className="panel space-y-6 p-6"><div className="grid gap-4 md:grid-cols-2">
      <label className="field-label">請購公司 *<select className="field-input" name="companyId" required><option value="">請選擇</option>{companies.map((company) => <option key={company.id} value={company.id}>{companyShortName(company)}</option>)}</select></label>
      <label className="field-label">申請日期 *<input className="field-input" type="date" name="requestDate" defaultValue={today} required /></label><label className="field-label">需求日期<input className="field-input" type="date" name="requiredDate" /></label>
      <label className="field-label">申請人<input className="field-input" name="requester" /></label><label className="field-label">部門<input className="field-input" name="department" /></label><label className="field-label">用途<input className="field-input" name="purpose" /></label>
      <label className="field-label md:col-span-2">備註<textarea className="field-textarea" name="note" /></label>
    </div><div className="action-row"><button className="primary-button" type="submit">建立請購單</button><Link className="secondary-button inline-flex items-center" href="/purchase-requisitions">取消</Link></div></form></>;
}
