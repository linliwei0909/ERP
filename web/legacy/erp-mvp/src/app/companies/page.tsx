import { prisma } from "@/lib/prisma";
import { CompanyManager } from "./company-manager";

export default async function CompaniesPage() {
  const companies = await prisma.company.findMany({
    include: { _count: { select: { customers: true, priceLists: true } } },
    orderBy: { code: "asc" },
  });

  return <div className="space-y-7"><CompanyManager companies={companies.map((company) => ({
    id: company.id, code: company.code, skuPrefix: company.skuPrefix, name: company.name,
    status: company.status, note: company.note, customerCount: company._count.customers,
    priceListCount: company._count.priceLists,
  }))} /></div>;
}
