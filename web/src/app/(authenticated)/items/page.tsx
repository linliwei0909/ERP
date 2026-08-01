import { redirect } from "next/navigation";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { listSaleableItems } from "@/lib/items/service";
import { prisma } from "@/lib/prisma";
import { ItemsListView, type ItemListQuery } from "./item-list-view";

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<ItemListQuery>;
}) {
  let pageData;
  try {
    const context = await getPageRequestContext();
    const query = await searchParams;
    const companyId = query.companyId ?? context.selectedCompany.id;
    const result = await listSaleableItems(prisma, {
      context,
      companyId,
      query: {
        search: query.search ?? "",
        itemType: query.itemType ?? "ALL",
        page: query.page ?? "1",
        pageSize: "20",
      },
    });
    pageData = { context, query, companyId, result };
  } catch {
    redirect("/");
  }

  return <ItemsListView {...pageData} />;
}
