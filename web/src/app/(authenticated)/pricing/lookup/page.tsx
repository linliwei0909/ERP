import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import pageStyles from "@/components/app-shell/page-contract.module.css";
import {
  Alert,
  Button,
  Card,
  DescriptionDetails,
  DescriptionItem,
  DescriptionList,
  DescriptionTerm,
  Field,
  Input,
  Select,
  Section,
} from "@/components/ui";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { listCustomers } from "@/lib/customers/service";
import { listSaleableItems } from "@/lib/items/service";
import { getEffectivePrice, PriceNotFoundError } from "@/lib/pricing/service";
import { prisma } from "@/lib/prisma";

export default async function PriceLookupPage({ searchParams }: {
  searchParams: Promise<{ companyId?: string; customerId?: string; itemId?: string; effectiveDate?: string }>;
}) {
  let data;
  try {
    const context = await getPageRequestContext();
    const query = await searchParams;
    const companyId = query.companyId ?? context.selectedCompany.id;
    const [customers, items] = await Promise.all([
      listCustomers(prisma, { context, companyId, query: { pageSize: 100 } }),
      listSaleableItems(prisma, { context, companyId, query: { pageSize: 100 } }),
    ]);
    let result = null;
    let notFound = false;
    if (query.customerId && query.itemId && query.effectiveDate) {
      try {
        result = await getEffectivePrice(prisma, {
          context, companyId, customerId: query.customerId, itemId: query.itemId, effectiveDate: query.effectiveDate,
        });
      } catch (error) {
        if (error instanceof PriceNotFoundError) notFound = true;
        else throw error;
      }
    }
    data = { context, query, companyId, customers, items, result, notFound };
  } catch { redirect("/"); }

  return (
    <div className={pageStyles.pageStack}>
      <PageHeader
        containerVariant="standard"
        context="正式價格"
        title="正式價格查詢"
        description="依公司、客戶、品項與生效日查詢唯一有效的未稅單價。"
      />
      <Card>
        <form className={pageStyles.formGrid}>
          <Field label="公司"><Select name="companyId" defaultValue={data.companyId}>{data.context.authorizedCompanies.map((company) => <option key={company.id} value={company.id}>{company.code}－{company.name}</option>)}</Select></Field>
          <Field label="客戶" required><Select name="customerId" required defaultValue={data.query.customerId ?? ""}><option value="" disabled>選擇客戶</option>{data.customers.items.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</Select></Field>
          <Field label="品項" required><Select name="itemId" required defaultValue={data.query.itemId ?? ""}><option value="" disabled>選擇品項</option>{data.items.items.map((item) => <option key={item.id} value={item.id}>{item.code}－{item.name}</option>)}</Select></Field>
          <Field label="生效日" required><Input name="effectiveDate" required type="date" defaultValue={data.query.effectiveDate ?? ""} /></Field>
          <div className={pageStyles.fullSpan}><Button type="submit">查詢正式價格</Button></div>
        </form>
      </Card>
      {data.result ? (
        <Card>
          <Section title="查詢結果" description="符合指定條件的正式價格版本。">
            <DescriptionList columns={2}>
              <DescriptionItem><DescriptionTerm>有效未稅單價</DescriptionTerm><DescriptionDetails>{data.result.unitPrice}</DescriptionDetails></DescriptionItem>
              <DescriptionItem><DescriptionTerm>有效期間</DescriptionTerm><DescriptionDetails>{data.result.validFrom} ～ {data.result.validTo ?? "無期限"}</DescriptionDetails></DescriptionItem>
            </DescriptionList>
          </Section>
        </Card>
      ) : null}
      {data.notFound ? <Alert role="alert" tone="warning" title="找不到正式價格">PRICE_NOT_FOUND：指定條件找不到有效正式價格。</Alert> : null}
    </div>
  );
}
