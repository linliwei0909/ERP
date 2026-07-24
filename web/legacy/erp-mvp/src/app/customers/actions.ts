"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { selectedIds, type DeleteResult } from "@/lib/delete-result";

const customerSchema = z.object({
  companyId: z.coerce.number().int().positive("請選擇銷售公司"),
  priceListChoice: z.string().min(1, "請選擇價格表"),
  name: z.string().trim().min(1, "請輸入客戶名稱").max(200, "客戶名稱不可超過 200 字"),
  legalName: z.string().trim().max(200),
  taxId: z.string().trim().max(20),
  contactName: z.string().trim().max(100),
  contactTitle: z.string().trim().max(100),
  phone: z.string().trim().max(50),
  mobile: z.string().trim().max(50),
  email: z.string().trim().max(200).refine((value) => !value || z.email().safeParse(value).success, "Email 格式不正確"),
  website: z.string().trim().max(300),
  address: z.string().trim().max(500),
  invoiceAddress: z.string().trim().max(500),
  source: z.string().trim().max(100),
  note: z.string().trim(),
  type: z.enum(["DISTRIBUTOR", "RETAIL"]),
  status: z.enum(["ACTIVE", "INACTIVE"]),
  paymentTerms: z.string().trim().max(100),
  creditLimit: z.coerce.number().min(0, "信用額度不可小於 0"),
  salesOwner: z.string().trim().max(100),
});

export type CustomerFormState = {
  success: boolean;
  message: string;
  errors?: Record<string, string[]>;
};

export async function createCustomer(
  _previousState: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const values = Object.fromEntries(
    ["companyId", "priceListChoice", "name", "legalName", "taxId", "contactName", "contactTitle", "phone", "mobile", "email", "website", "address", "invoiceAddress", "source", "note", "type", "status", "paymentTerms", "creditLimit", "salesOwner"].map((key) => [key, formData.get(key) ?? ""]),
  );
  const parsed = customerSchema.safeParse(values);

  if (!parsed.success) {
    return { success: false, message: "請檢查標示的欄位", errors: parsed.error.flatten().fieldErrors };
  }

  const company = await prisma.company.findFirst({
    where: { id: parsed.data.companyId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!company) {
    return { success: false, message: "所選公司不存在或已停用" };
  }

  const nullable = (value: string) => value || null;

  try {
    const customerCode = await prisma.$transaction(async (tx) => {
      const [sequence] = await tx.$queryRaw<Array<{ nextval: bigint }>>`SELECT nextval('customer_code_seq')`;
      const code = `C${sequence.nextval.toString().padStart(6, "0")}`;
      let priceListId: number;
      if (parsed.data.priceListChoice === "CREATE_NEW") {
        const priceList = await tx.priceList.create({
          data: {
            companyId: parsed.data.companyId,
            code,
            name: `${parsed.data.name}專屬價格表`,
            type: "CUSTOMER_SPECIFIC",
            currency: "TWD",
          },
        });
        priceListId = priceList.id;
      } else {
        const selectedPriceListId = Number(parsed.data.priceListChoice);
        const priceList = await tx.priceList.findFirst({
          where: {
            id: selectedPriceListId,
            companyId: parsed.data.companyId,
            type: "SHARED",
            status: "ACTIVE",
          },
          select: { id: true },
        });
        if (!priceList) throw new Error("INVALID_SHARED_PRICE_LIST");
        priceListId = priceList.id;
      }

      await tx.customer.create({
        data: {
          companyId: parsed.data.companyId,
          priceListId,
          code,
          name: parsed.data.name,
          legalName: nullable(parsed.data.legalName),
          taxId: nullable(parsed.data.taxId),
          type: parsed.data.type,
          status: parsed.data.status,
          paymentTerms: nullable(parsed.data.paymentTerms),
          creditLimit: parsed.data.creditLimit.toString(),
          salesOwner: nullable(parsed.data.salesOwner),
          contactName: nullable(parsed.data.contactName),
          contactTitle: nullable(parsed.data.contactTitle),
          phone: nullable(parsed.data.phone),
          mobile: nullable(parsed.data.mobile),
          email: nullable(parsed.data.email),
          website: nullable(parsed.data.website),
          address: nullable(parsed.data.address),
          invoiceAddress: nullable(parsed.data.invoiceAddress),
          source: nullable(parsed.data.source),
          note: nullable(parsed.data.note),
        },
      });
      return code;
    });
    revalidatePath("/customers");
    revalidatePath("/price-lists");
    revalidatePath("/companies");
    return { success: true, message: `已新增 ${parsed.data.name}（${customerCode}）` };
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_SHARED_PRICE_LIST") {
      return { success: false, message: "所選共用價格表不存在、已停用或不屬於該公司" };
    }
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return { success: false, message: "統一編號或自動產生的客戶／價格表代碼已存在" };
    }
    console.error("Failed to create customer", error);
    return { success: false, message: "新增失敗，請稍後再試" };
  }

}

const shippingAddressSchema = z.object({
  customerId: z.coerce.number().int().positive("請選擇客戶"),
  label: z.string().trim().min(1, "請輸入地址名稱").max(100),
  recipientName: z.string().trim().max(100),
  recipientPhone: z.string().trim().max(50),
  postalCode: z.string().trim().max(20),
  address: z.string().trim().min(1, "請輸入完整地址").max(500),
  shippingFeeMarkup: z.coerce.number().min(0, "運費加價不可小於 0"),
  note: z.string().trim(),
});

export type ShippingAddressFormState = CustomerFormState;

export async function createShippingAddress(
  _previousState: ShippingAddressFormState,
  formData: FormData,
): Promise<ShippingAddressFormState> {
  const parsed = shippingAddressSchema.safeParse({
    customerId: formData.get("customerId"),
    label: formData.get("label"),
    recipientName: formData.get("recipientName") ?? "",
    recipientPhone: formData.get("recipientPhone") ?? "",
    postalCode: formData.get("postalCode") ?? "",
    address: formData.get("address"),
    shippingFeeMarkup: formData.get("shippingFeeMarkup") ?? 0,
    note: formData.get("note") ?? "",
  });

  if (!parsed.success) {
    return { success: false, message: "請檢查標示的欄位", errors: parsed.error.flatten().fieldErrors };
  }

  const nullable = (value: string) => value || null;
  try {
    await prisma.customerShippingAddress.create({
        data: {
          customerId: parsed.data.customerId,
          label: parsed.data.label,
          recipientName: nullable(parsed.data.recipientName),
          recipientPhone: nullable(parsed.data.recipientPhone),
          postalCode: nullable(parsed.data.postalCode),
          address: parsed.data.address,
          shippingFeeMarkup: parsed.data.shippingFeeMarkup.toString(),
          note: nullable(parsed.data.note),
        },
    });
  } catch (error) {
    console.error("Failed to create shipping address", error);
    return { success: false, message: "新增送貨地址失敗，請稍後再試" };
  }

  revalidatePath("/customers");
  return { success: true, message: `已新增送貨地址「${parsed.data.label}」` };
}

export async function deleteCustomers(_state: DeleteResult, formData: FormData): Promise<DeleteResult> {
  const ids = selectedIds(formData);
  if (!ids.length) return { success: false, deleted: [], deactivated: [], message: "請先選擇客戶" };
  const deleted: string[] = [];
  for (const id of ids) {
    const customer = await prisma.customer.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!customer) continue;
    await prisma.customer.delete({ where: { id } });
    deleted.push(customer.name);
  }
  revalidatePath("/customers"); revalidatePath("/companies"); revalidatePath("/price-lists");
  return { success: true, deleted, deactivated: [], message: `已刪除 ${deleted.length} 筆；已停用 0 筆` };
}
