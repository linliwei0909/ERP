import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createSupplier } from "@/app/procurement-actions";
import { companyShortName } from "@/lib/company";
import { FlashMessage, PageHeader } from "@/components/procurement-ui";

export default async function NewSupplierPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const companies = await prisma.company.findMany({ where: { status: "ACTIVE" }, orderBy: { code: "asc" } });
  return (
    <>
      <PageHeader eyebrow="採購管理" title="新增供應商" backHref="/suppliers" description="供應商建立後，可在明細頁維護供貨品項、採購單位與價格歷史。" />
      <FlashMessage error={error} />
      <form action={createSupplier} className="panel space-y-6 p-6">
        <fieldset className="form-section"><legend>基本資料</legend><div className="grid gap-4 md:grid-cols-2">
          <label className="field-label">供應商代碼 *<input className="field-input" name="code" required maxLength={50} /></label>
          <label className="field-label">供應商名稱 *<input className="field-input" name="name" required maxLength={200} /></label>
          <label className="field-label">統一編號<input className="field-input" name="taxId" maxLength={20} /></label>
          <label className="field-label">Ragic 舊代碼<input className="field-input" name="legacyCode" maxLength={100} /></label>
          <label className="field-label">主要聯絡人<input className="field-input" name="contactName" maxLength={100} /></label>
          <label className="field-label">電話<input className="field-input" name="phone" maxLength={50} /></label>
          <label className="field-label">Email<input className="field-input" name="email" type="email" maxLength={200} /></label>
          <label className="field-label">付款條件<input className="field-input" name="paymentTerms" maxLength={100} /></label>
          <label className="field-label md:col-span-2">地址<input className="field-input" name="address" maxLength={500} /></label>
        </div></fieldset>
        <fieldset className="form-section"><legend>可用公司 *</legend><div className="flex flex-wrap gap-4">
          {companies.map((company) => <label key={company.id} className="flex items-center gap-2 text-sm font-semibold"><input className="checkbox" type="checkbox" name="companyIds" value={company.id} />{companyShortName(company)}</label>)}
        </div></fieldset>
        <label className="field-label">備註<textarea className="field-textarea" name="note" /></label>
        <div className="action-row"><button className="primary-button" type="submit">儲存供應商</button><Link className="secondary-button inline-flex items-center" href="/suppliers">取消</Link></div>
      </form>
    </>
  );
}
