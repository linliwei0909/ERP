import { redirect } from "next/navigation";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { listCustomers } from "@/lib/customers/service";
import { prisma } from "@/lib/prisma";
import {
  CustomersListView,
  type CustomerListQuery,
} from "./customer-list-view";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<CustomerListQuery>;
}) {
  let pageData;
  try {
    const context = await getPageRequestContext();
    const query = await searchParams;
    const companyId = query.companyId ?? context.selectedCompany.id;
    const result = await listCustomers(prisma, {
      context,
      companyId,
      query: {
        search: query.search ?? "",
        status: query.status ?? "ACTIVE",
        page: query.page ?? "1",
        pageSize: "20",
      },
    });
    pageData = { context, query, companyId, result };
  } catch {
    redirect("/");
  }

  return <CustomersListView {...pageData} />;
}
