import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminWithAudit } from "@/lib/auth/authorization";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { getFreightRule } from "@/lib/freight/service";
import { toDateText } from "@/lib/freight/validation";
import { prisma } from "@/lib/prisma";
import { FreightRuleEditor } from "./freight-rule-editor";

export default async function FreightRuleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ companyId?: string }>;
}) {
  let data;
  try {
    const context = await getPageRequestContext();
    await requireAdminWithAudit(prisma, context);
    const query = await searchParams;
    const companyId = query.companyId ?? context.selectedCompany.id;
    const value = await getFreightRule(prisma, {
      context,
      companyId,
      freightRuleId: (await params).id,
    });
    data = { companyId, value };
  } catch {
    redirect("/admin/freight-rules");
  }
  const { companyId, value } = data;
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-12">
      <div className="flex justify-between">
        <div>
          <p className="text-sm font-semibold text-teal-700">運費規則明細</p>
          <h1 className="text-3xl font-bold">
            {value.customerCompany.customer.name}／{value.deliveryLocation.name}
          </h1>
        </div>
        <Link
          href={`/admin/freight-rules?companyId=${companyId}`}
          className="rounded-lg border px-4 py-2"
        >
          返回清單
        </Link>
      </div>
      <p className="mt-4 text-sm text-slate-600">
        已生效版本僅能調整期間或狀態；模式或金額異動請建立未來版本。
      </p>
      <FreightRuleEditor
        companyId={companyId}
        value={{
          id: value.id,
          customerId: value.customerId,
          deliveryLocationId: value.deliveryLocationId,
          mode: value.mode,
          unitFreight: value.unitFreight?.toFixed(0) ?? null,
          fixedFreight: value.fixedFreight?.toFixed(0) ?? null,
          validFrom: toDateText(value.validFrom),
          validTo: value.validTo ? toDateText(value.validTo) : null,
          status: value.status,
        }}
      />
    </main>
  );
}
