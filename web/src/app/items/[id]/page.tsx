import Link from "next/link";
import { redirect } from "next/navigation";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { getItem } from "@/lib/items/service";
import { prisma } from "@/lib/prisma";

export default async function ItemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ companyId?: string }>;
}) {
  let pageData;
  try {
    const context = await getPageRequestContext();
    const companyId =
      (await searchParams).companyId ?? context.selectedCompany.id;
    const item = await getItem(prisma, {
      context,
      companyId,
      itemId: (await params).id,
    });
    pageData = { companyId, item };
  } catch {
    redirect("/items");
  }
  const { companyId, item } = pageData;
  const relation = item.companyRelations.find(
    (entry) => entry.companyId === companyId,
  );

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-teal-700">品項明細</p>
          <h1 className="text-3xl font-bold">{item.name}</h1>
        </div>
        <Link
          href={`/items?companyId=${companyId}`}
          className="rounded-lg border px-4 py-2"
        >
          返回清單
        </Link>
      </div>
      <dl className="mt-8 grid gap-4 rounded-2xl border bg-white p-6 md:grid-cols-2">
        <div>
          <dt className="text-sm text-slate-500">品項代碼</dt>
          <dd className="font-medium">{item.code}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-500">公司品項代碼</dt>
          <dd className="font-medium">{relation?.companyItemCode ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-500">類型</dt>
          <dd>{item.itemType === "PRODUCT" ? "產品" : "原物料"}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-500">基本單位</dt>
          <dd>{item.baseUnit}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-500">條碼</dt>
          <dd>{item.barcode ?? "—"}</dd>
        </div>
        <div className="md:col-span-2">
          <dt className="text-sm text-slate-500">規格</dt>
          <dd className="whitespace-pre-wrap">{item.specification ?? "—"}</dd>
        </div>
        <div className="md:col-span-2">
          <dt className="text-sm text-slate-500">說明</dt>
          <dd className="whitespace-pre-wrap">{item.description ?? "—"}</dd>
        </div>
      </dl>
    </main>
  );
}
