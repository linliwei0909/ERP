import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import pageStyles from "@/components/app-shell/page-contract.module.css";
import {
  Card,
  DescriptionDetails,
  DescriptionItem,
  DescriptionList,
  DescriptionTerm,
  EmptyState,
  LinkButton,
  Section,
  StatusBadge,
} from "@/components/ui";
import { getPageRequestContext } from "@/lib/auth/request-context";
import { hasRole } from "@/lib/auth/rbac";
import { getCustomer } from "@/lib/customers/service";
import { prisma } from "@/lib/prisma";
import customerStyles from "../customer-ui.module.css";

export default async function CustomerDetailPage({
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
    const customer = await getCustomer(prisma, {
      context,
      companyId,
      customerId: (await params).id,
      includeInactive: hasRole(context.roleCodes, "ADMIN"),
    });
    pageData = { context, companyId, customer };
  } catch {
    redirect("/customers");
  }
  const { context, companyId, customer } = pageData;

  return (
    <div className={pageStyles.pageStack}>
      <PageHeader
        containerVariant="wide"
        context="客戶明細"
        title={customer.name}
        description="檢視客戶識別資料、聯絡人與有效送貨地點。"
        status={
          <StatusBadge
            label={customer.status === "ACTIVE" ? "有效" : "停用"}
            tone={customer.status === "ACTIVE" ? "success" : "neutral"}
          />
        }
        actions={
          <>
          {hasRole(context.roleCodes, "ADMIN") ? (
            <LinkButton
              href={`/admin/customers/${customer.id}?companyId=${companyId}`}
            >
              管理客戶
            </LinkButton>
          ) : null}
          <LinkButton
            variant="secondary"
            href={`/customers?companyId=${companyId}`}
          >
            返回清單
          </LinkButton>
          </>
        }
      />

      <Card>
        <DescriptionList columns={3}>
          <DescriptionItem><DescriptionTerm>類型</DescriptionTerm><DescriptionDetails>{customer.customerType === "DOMESTIC" ? "境內" : "境外"}</DescriptionDetails></DescriptionItem>
          <DescriptionItem><DescriptionTerm>統一編號</DescriptionTerm><DescriptionDetails>{customer.taxId ?? "—"}</DescriptionDetails></DescriptionItem>
          <DescriptionItem><DescriptionTerm>境外識別</DescriptionTerm><DescriptionDetails>{[customer.countryCode, customer.foreignIdentifier].filter(Boolean).join(" / ") || "—"}</DescriptionDetails></DescriptionItem>
          <DescriptionItem><DescriptionTerm>目前公司客戶代碼</DescriptionTerm><DescriptionDetails>{customer.companyRelations.find((relation) => relation.companyId === companyId)?.customerCode ?? "—"}</DescriptionDetails></DescriptionItem>
        </DescriptionList>
      </Card>

      <Card>
        <Section title="聯絡人" description="目前有效的客戶聯絡窗口。">
        {customer.contacts.length > 0 ? <div className={customerStyles.cardGrid}>
          {customer.contacts.map((contact) => (
            <Card key={contact.id} variant="subtle" padding="small">
              <strong>{contact.name}{contact.isPrimary ? "（主要）" : ""}</strong>
              <p className={customerStyles.mutedText}>{[contact.department, contact.jobTitle].filter(Boolean).join("／") || "—"}</p>
              <p className={customerStyles.detailText}>{[contact.phone, contact.mobile, contact.email].filter(Boolean).join("／") || "—"}</p>
            </Card>
          ))}
        </div> : <EmptyState variant="no-data" title="尚無有效聯絡人" description="此客戶目前沒有可顯示的有效聯絡人。" />}
        </Section>
      </Card>

      <Card>
        <Section title="送貨地點" description="目前有效的客戶送貨地址。">
        {customer.deliveryLocations.length > 0 ? <div className={customerStyles.cardGrid}>
          {customer.deliveryLocations.map((location) => (
            <Card key={location.id} variant="subtle" padding="small">
              <strong>{location.code}－{location.name}{location.isDefault ? "（預設）" : ""}</strong>
              <p className={customerStyles.detailText}>{location.fullAddress}</p>
              <p className={customerStyles.mutedText}>{location.recipientName}／{location.phone}</p>
            </Card>
          ))}
        </div> : <EmptyState variant="no-data" title="尚無有效送貨地點" description="此客戶目前沒有可顯示的有效送貨地點。" />}
        </Section>
      </Card>
    </div>
  );
}
