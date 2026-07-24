"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { selectedIds, type DeleteResult } from "@/lib/delete-result";

const schema = z.object({
  companyId: z.coerce.number().int().positive("請選擇公司"),
  code: z.string().trim().min(1, "請輸入價格表代碼").max(50),
  name: z.string().trim().min(1, "請輸入價格表名稱").max(200),
  type: z.enum(["SHARED", "CUSTOMER_SPECIFIC"]),
  currency: z.enum(["TWD", "USD", "JPY", "CNY"]),
  note: z.string().trim(),
});

export type PriceListFormState = { success: boolean; message: string; errors?: Record<string, string[]> };

export async function createPriceList(
  _previousState: PriceListFormState,
  formData: FormData,
): Promise<PriceListFormState> {
  const parsed = schema.safeParse({
    companyId: formData.get("companyId"), code: formData.get("code"), name: formData.get("name"),
    type: formData.get("type"), currency: formData.get("currency"), note: formData.get("note") ?? "",
  });
  if (!parsed.success) return { success: false, message: "請檢查標示的欄位", errors: parsed.error.flatten().fieldErrors };

  const company = await prisma.company.findFirst({ where: { id: parsed.data.companyId, status: "ACTIVE" } });
  if (!company) return { success: false, message: "所選公司不存在或已停用" };

  try {
    await prisma.priceList.create({ data: { ...parsed.data, code: parsed.data.code.toUpperCase(), note: parsed.data.note || null } });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return { success: false, message: "同一公司內的價格表代碼不可重複" };
    }
    console.error("Failed to create price list", error);
    return { success: false, message: "新增價格表失敗，請稍後再試" };
  }
  revalidatePath("/price-lists");
  revalidatePath("/customers");
  return { success: true, message: `已新增 ${parsed.data.name}` };
}

const priceListItemSchema = z.object({
  priceListId: z.coerce.number().int().positive("請選擇價格表"),
  itemId: z.coerce.number().int().positive("請選擇品項"),
  unitPrice: z.coerce.number().min(0, "單價不可小於 0"),
});

export async function createPriceListItem(
  _previousState: PriceListFormState,
  formData: FormData,
): Promise<PriceListFormState> {
  const parsed = priceListItemSchema.safeParse({
    priceListId: formData.get("priceListId"),
    itemId: formData.get("itemId"),
    unitPrice: formData.get("unitPrice"),
  });
  if (!parsed.success) return { success: false, message: "請檢查標示的欄位", errors: parsed.error.flatten().fieldErrors };

  const [priceList, item] = await Promise.all([
    prisma.priceList.findUnique({ where: { id: parsed.data.priceListId } }),
    prisma.item.findUnique({ where: { id: parsed.data.itemId } }),
  ]);
  if (!priceList || priceList.status !== "ACTIVE") return { success: false, message: "價格表不存在或已停用" };
  if (!item || item.status !== "ACTIVE") return { success: false, message: "品項不存在或已停用" };
  try {
    await prisma.priceListItem.create({
      data: { priceListId: priceList.id, itemId: item.id, unitPrice: parsed.data.unitPrice.toString() },
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return { success: false, message: "此價格表已設定該品項" };
    }
    console.error("Failed to create price list item", error);
    return { success: false, message: "新增價格明細失敗，請稍後再試" };
  }
  revalidatePath("/price-lists");
  return { success: true, message: `已新增 ${item.name} 的單價` };
}

export async function deletePriceLists(_state: DeleteResult, formData: FormData): Promise<DeleteResult> {
  const ids = selectedIds(formData);
  if (!ids.length) return { success: false, deleted: [], deactivated: [], message: "請先選擇價格表" };
  const deleted: string[] = [];
  const deactivated: string[] = [];
  for (const id of ids) {
    const priceList = await prisma.priceList.findUnique({
      where: { id }, include: { _count: { select: { customers: true, items: true } } },
    });
    if (!priceList) continue;
    if (priceList._count.customers + priceList._count.items > 0) {
      await prisma.priceList.update({ where: { id }, data: { status: "INACTIVE" } });
      deactivated.push(`${priceList.name}：已有 ${priceList._count.customers} 位客戶或 ${priceList._count.items} 筆價格明細，已改為停用`);
    } else {
      await prisma.priceList.delete({ where: { id } });
      deleted.push(priceList.name);
    }
  }
  revalidatePath("/price-lists"); revalidatePath("/customers");
  return { success: true, deleted, deactivated, message: `已刪除 ${deleted.length} 筆；已停用 ${deactivated.length} 筆` };
}
