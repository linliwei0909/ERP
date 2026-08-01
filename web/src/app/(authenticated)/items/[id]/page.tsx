import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import pageStyles from "@/components/app-shell/page-contract.module.css";
import {
  Card,
  DescriptionDetails,
  DescriptionItem,
  DescriptionList,
  DescriptionTerm,
  LinkButton,
  StatusBadge,
} from "@/components/ui";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { getItem } from "@/lib/items/service";
import { prisma } from "@/lib/prisma";
import itemStyles from "../item-ui.module.css";

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
    <div className={pageStyles.pageStack}>
      <PageHeader
        containerVariant="standard"
        context="品項明細"
        title={item.name}
        description="檢視品項基本資料與目前公司的品項代碼。"
        status={
          <StatusBadge
            label={item.itemType === "PRODUCT" ? "產品" : "原物料"}
            tone={item.itemType === "PRODUCT" ? "success" : "info"}
          />
        }
        actions={
          <LinkButton
            href={`/items?companyId=${companyId}`}
            variant="secondary"
          >
            返回清單
          </LinkButton>
        }
      />
      <Card>
        <DescriptionList columns={2}>
          <DescriptionItem><DescriptionTerm>品項代碼</DescriptionTerm><DescriptionDetails>{item.code}</DescriptionDetails></DescriptionItem>
          <DescriptionItem><DescriptionTerm>公司品項代碼</DescriptionTerm><DescriptionDetails>{relation?.companyItemCode ?? "—"}</DescriptionDetails></DescriptionItem>
          <DescriptionItem><DescriptionTerm>類型</DescriptionTerm><DescriptionDetails>{item.itemType === "PRODUCT" ? "產品" : "原物料"}</DescriptionDetails></DescriptionItem>
          <DescriptionItem><DescriptionTerm>基本單位</DescriptionTerm><DescriptionDetails>{item.baseUnit}</DescriptionDetails></DescriptionItem>
          <DescriptionItem><DescriptionTerm>條碼</DescriptionTerm><DescriptionDetails>{item.barcode ?? "—"}</DescriptionDetails></DescriptionItem>
          <DescriptionItem className={pageStyles.fullSpan}><DescriptionTerm>規格</DescriptionTerm><DescriptionDetails className={itemStyles.preWrap}>{item.specification ?? "—"}</DescriptionDetails></DescriptionItem>
          <DescriptionItem className={pageStyles.fullSpan}><DescriptionTerm>說明</DescriptionTerm><DescriptionDetails className={itemStyles.preWrap}>{item.description ?? "—"}</DescriptionDetails></DescriptionItem>
        </DescriptionList>
      </Card>
    </div>
  );
}
