"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { selectedIds, type DeleteResult } from "@/lib/delete-result";

const companySchema = z.object({
  code: z.string().trim().length(4, "公司代碼必須為 4 碼").regex(/^[A-Za-z0-9]{4}$/, "公司代碼只能使用英文字母或數字"),
  skuPrefix: z.string().trim().length(2, "SKU 前綴必須為 2 碼").regex(/^[A-Za-z0-9]{2}$/, "SKU 前綴只能使用英文字母或數字"),
  name: z.string().trim().min(1, "請輸入公司名稱").max(200),
  note: z.string().trim(),
});

const updateCompanySchema = companySchema.extend({
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

export type CompanyFormState = { success: boolean; message: string; errors?: Record<string, string[]> };

export async function createCompany(
  _previousState: CompanyFormState,
  formData: FormData,
): Promise<CompanyFormState> {
  const parsed = companySchema.safeParse({
    code: formData.get("code"), skuPrefix: formData.get("skuPrefix"), name: formData.get("name"), note: formData.get("note") ?? "",
  });
  if (!parsed.success) return { success: false, message: "請檢查標示的欄位", errors: parsed.error.flatten().fieldErrors };

  try {
    await prisma.company.create({
      data: { code: parsed.data.code.toUpperCase(), skuPrefix: parsed.data.skuPrefix.toUpperCase(), name: parsed.data.name, note: parsed.data.note || null },
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return { success: false, message: "公司代碼或 SKU 前綴已存在" };
    }
    console.error("Failed to create company", error);
    return { success: false, message: "新增公司失敗，請稍後再試" };
  }
  revalidatePath("/companies");
  revalidatePath("/price-lists");
  revalidatePath("/customers");
  return { success: true, message: `已新增 ${parsed.data.name}` };
}

export async function updateCompany(
  companyId: number,
  _previousState: CompanyFormState,
  formData: FormData,
): Promise<CompanyFormState> {
  const parsed = updateCompanySchema.safeParse({
    code: formData.get("code"), skuPrefix: formData.get("skuPrefix"), name: formData.get("name"),
    status: formData.get("status"), note: formData.get("note") ?? "",
  });
  if (!parsed.success) return { success: false, message: "請檢查標示的欄位", errors: parsed.error.flatten().fieldErrors };

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return { success: false, message: "公司不存在或已被刪除" };

  try {
    await prisma.company.update({
      where: { id: companyId },
      data: {
        code: parsed.data.code.toUpperCase(), skuPrefix: parsed.data.skuPrefix.toUpperCase(),
        name: parsed.data.name, status: parsed.data.status, note: parsed.data.note || null,
      },
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return { success: false, message: "公司代碼或 SKU 前綴已被其他公司使用" };
    }
    console.error("Failed to update company", error);
    return { success: false, message: "更新公司失敗，請稍後再試" };
  }

  revalidatePath("/companies");
  revalidatePath("/items");
  revalidatePath("/price-lists");
  revalidatePath("/customers");
  return { success: true, message: `已更新 ${parsed.data.name}` };
}

export async function deleteCompanies(_state: DeleteResult, formData: FormData): Promise<DeleteResult> {
  const ids = selectedIds(formData);
  if (!ids.length) return { success: false, deleted: [], deactivated: [], message: "請先選擇公司" };
  const deleted: string[] = [];
  const deactivated: string[] = [];
  for (const id of ids) {
    const company = await prisma.company.findUnique({
      where: { id }, include: { _count: { select: { customers: true, priceLists: true, items: true } } },
    });
    if (!company) continue;
    const references = company._count.customers + company._count.priceLists + company._count.items;
    if (references > 0) {
      await prisma.company.update({ where: { id }, data: { status: "INACTIVE" } });
      deactivated.push(`${company.name}：已有 ${company._count.customers} 位客戶、${company._count.priceLists} 張價格表、${company._count.items} 個品項，已改為停用`);
    } else {
      await prisma.company.delete({ where: { id } });
      deleted.push(company.name);
    }
  }
  revalidatePath("/companies"); revalidatePath("/customers"); revalidatePath("/items"); revalidatePath("/price-lists");
  return { success: true, deleted, deactivated, message: `已刪除 ${deleted.length} 筆；已停用 ${deactivated.length} 筆` };
}
