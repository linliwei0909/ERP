import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminWithAudit } from "@/lib/auth/authorization";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { getItem } from "@/lib/items/service";
import { prisma } from "@/lib/prisma";
import {
  ItemManagerClient,
  type ManagedItem,
} from "./item-manager-client";

export default async function AdminItemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ companyId?: string }>;
}) {
  let pageData;
  try {
    const context = await getPageRequestContext();
    await requireAdminWithAudit(prisma, context);
    const companyId =
      (await searchParams).companyId ?? context.selectedCompany.id;
    const item = await getItem(prisma, {
      context,
      companyId,
      itemId: (await params).id,
      includeInactive: true,
    });
    pageData = { context, companyId, item };
  } catch {
    redirect("/admin/items");
  }
  const { context, companyId, item } = pageData;
  const serializedItem = JSON.parse(JSON.stringify(item)) as ManagedItem;

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-teal-700">品項主檔管理</p>
          <h1 className="text-3xl font-bold">{item.name}</h1>
        </div>
        <Link
          href={`/admin/items?companyId=${companyId}`}
          className="rounded-lg border px-4 py-2"
        >
          返回清單
        </Link>
      </div>
      <ItemManagerClient
        item={serializedItem}
        companies={context.authorizedCompanies}
        selectedCompanyId={companyId}
      />
    </main>
  );
}
