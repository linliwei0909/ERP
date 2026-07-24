"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { selectedIds, type DeleteResult } from "@/lib/delete-result";

const itemTypes = ["FINISHED_GOOD", "RAW_MATERIAL", "PACKAGING", "CONSUMABLE", "OTHER"] as const;
const typeCodes: Record<(typeof itemTypes)[number], string> = {
  FINISHED_GOOD: "G", RAW_MATERIAL: "R", PACKAGING: "P", CONSUMABLE: "C", OTHER: "O",
};
const optionalId = z.preprocess(
  (value) => value === "" || value === null ? undefined : value,
  z.coerce.number().int().positive().optional(),
);

const itemSchema = z.object({
  companyId: z.coerce.number().int().positive("請選擇公司"),
  type: z.enum(itemTypes, { message: "請選擇品項類型" }),
  categoryId: optionalId,
  name: z.string().trim().min(1, "請輸入正式品名").max(200, "品名不可超過 200 字"),
  shortName: z.string().trim().max(100, "簡稱不可超過 100 字"),
  code: z.string().trim().length(10, "系統品號必須為 10 碼").regex(/^[A-Za-z0-9]{10}$/, "系統品號只能使用英文字母或數字"),
  codeCustomized: z.boolean(),
  spec: z.string().trim().min(1, "請輸入規格").max(200, "規格不可超過 200 字"),
  packageTypeId: z.coerce.number().int().positive("請選擇包裝"),
  barcode: z.string().trim().max(100, "條碼不可超過 100 字"),
  safetyStock: z.coerce.number().min(0, "安全庫存不可小於 0"),
  trackLot: z.boolean(),
  trackExpiry: z.boolean(),
});

export type ItemFormState = { success: boolean; message: string; errors?: Record<string, string[]> };

export async function createItem(
  _previousState: ItemFormState,
  formData: FormData,
): Promise<ItemFormState> {
  const parsed = itemSchema.safeParse({
    companyId: formData.get("companyId"), type: formData.get("type"), categoryId: formData.get("categoryId"),
    name: formData.get("name"), shortName: formData.get("shortName") ?? "", code: formData.get("code"),
    codeCustomized: formData.get("codeCustomized") === "true", spec: formData.get("spec"),
    packageTypeId: formData.get("packageTypeId"), barcode: formData.get("barcode") ?? "",
    safetyStock: formData.get("safetyStock") ?? 0, trackLot: formData.get("trackLot") === "on",
    trackExpiry: formData.get("trackExpiry") === "on",
  });
  if (!parsed.success) return { success: false, message: "請檢查標示的欄位", errors: parsed.error.flatten().fieldErrors };

  const { data } = parsed;
  const [company, category, packageType] = await Promise.all([
    prisma.company.findFirst({ where: { id: data.companyId, status: "ACTIVE" } }),
    data.categoryId ? prisma.itemCategory.findFirst({ where: { id: data.categoryId, status: "ACTIVE" } }) : null,
    prisma.packageType.findFirst({ where: { id: data.packageTypeId, status: "ACTIVE" } }),
  ]);
  if (!company) return { success: false, message: "所選公司不存在或已停用" };
  if (!packageType) return { success: false, message: "所選包裝不存在或已停用" };
  if (category && category.itemType !== data.type) return { success: false, message: "分類與品項類型不符" };
  if ((data.type === "FINISHED_GOOD" || data.type === "RAW_MATERIAL") && !category) {
    return { success: false, message: "此品項類型必須選擇分類" };
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const sequenceScope = `${data.companyId}:${data.type}:${data.categoryId ?? 0}`;
      const latest = await tx.item.findFirst({
        where: { sequenceScope }, orderBy: { sequence: "desc" }, select: { sequence: true },
      });
      const sequence = (latest?.sequence ?? 0) + 1;
      const generatedCode = `${company.skuPrefix}${typeCodes[data.type]}${category?.code ?? "XX"}${String(sequence).padStart(5, "0")}`;
      const code = (data.codeCustomized ? data.code : generatedCode).toUpperCase();
      return tx.item.create({
        data: {
          companyId: data.companyId, categoryId: data.categoryId ?? null, packageTypeId: packageType.id,
          sequence, sequenceScope, code, name: data.name, shortName: data.shortName || null, type: data.type,
          spec: data.spec, unit: packageType.name, barcode: data.barcode || null,
          safetyStock: data.safetyStock.toString(), trackLot: data.trackLot, trackExpiry: data.trackExpiry,
        },
      });
    }, { isolationLevel: "Serializable" });

    revalidatePath("/items");
    revalidatePath("/");
    return { success: true, message: `已新增 ${created.name}（${created.code}）` };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return { success: false, message: "品號或流水號已被使用，請重新整理後再試" };
    }
    console.error("Failed to create item", error);
    return { success: false, message: "新增失敗，請稍後再試" };
  }
}

const updateItemSchema = z.object({
  code: z.string().trim().length(10, "系統品號必須為 10 碼").regex(/^[A-Za-z0-9]{10}$/, "系統品號只能使用英文字母或數字"),
  name: z.string().trim().min(1, "請輸入正式品名").max(200, "品名不可超過 200 字"),
  shortName: z.string().trim().max(100, "簡稱不可超過 100 字"),
  spec: z.string().trim().min(1, "請輸入規格").max(200, "規格不可超過 200 字"),
  packageTypeId: z.coerce.number().int().positive("請選擇包裝"),
  barcode: z.string().trim().max(100, "條碼不可超過 100 字"),
  safetyStock: z.coerce.number().min(0, "安全庫存不可小於 0"),
  status: z.enum(["ACTIVE", "INACTIVE"]),
  trackLot: z.boolean(),
  trackExpiry: z.boolean(),
});

export async function updateItem(
  itemId: number,
  _previousState: ItemFormState,
  formData: FormData,
): Promise<ItemFormState> {
  const parsed = updateItemSchema.safeParse({
    code: formData.get("code"), name: formData.get("name"), shortName: formData.get("shortName") ?? "",
    spec: formData.get("spec"), packageTypeId: formData.get("packageTypeId"), barcode: formData.get("barcode") ?? "",
    safetyStock: formData.get("safetyStock") ?? 0, status: formData.get("status"),
    trackLot: formData.get("trackLot") === "on", trackExpiry: formData.get("trackExpiry") === "on",
  });
  if (!parsed.success) return { success: false, message: "請檢查標示的欄位", errors: parsed.error.flatten().fieldErrors };

  const [item, packageType] = await Promise.all([
    prisma.item.findUnique({ where: { id: itemId } }),
    prisma.packageType.findFirst({ where: { id: parsed.data.packageTypeId, status: "ACTIVE" } }),
  ]);
  if (!item) return { success: false, message: "品項不存在或已被刪除" };
  if (!packageType) return { success: false, message: "所選包裝不存在或已停用" };

  try {
    await prisma.item.update({
      where: { id: itemId },
      data: {
        code: parsed.data.code.toUpperCase(), name: parsed.data.name, shortName: parsed.data.shortName || null,
        spec: parsed.data.spec, packageTypeId: packageType.id, unit: packageType.name,
        barcode: parsed.data.barcode || null, safetyStock: parsed.data.safetyStock.toString(),
        status: parsed.data.status, trackLot: parsed.data.trackLot, trackExpiry: parsed.data.trackExpiry,
      },
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return { success: false, message: "同一公司內的品號或條碼已存在" };
    }
    console.error("Failed to update item", error);
    return { success: false, message: "更新失敗，請稍後再試" };
  }

  revalidatePath("/items");
  revalidatePath("/price-lists");
  redirect(`/items?id=${itemId}`);
}

export async function deleteItems(_state: DeleteResult, formData: FormData): Promise<DeleteResult> {
  const ids = selectedIds(formData);
  if (!ids.length) return { success: false, deleted: [], deactivated: [], message: "請先選擇品項" };
  const deleted: string[] = [];
  const deactivated: string[] = [];
  for (const id of ids) {
    const item = await prisma.item.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            inventoryLots: true,
            movements: true,
            priceListItems: true,
            supplierItems: true,
            requisitionLines: true,
            purchaseOrderLines: true,
            goodsReceiptLines: true,
            apInvoiceLines: true,
            salesOrderLines: true,
            salesDeliveryLines: true,
            arInvoiceLines: true,
          },
        },
      },
    });
    if (!item) continue;
    const references = Object.values(item._count).reduce((total, count) => total + count, 0);
    if (references > 0) {
      await prisma.item.update({ where: { id }, data: { status: "INACTIVE" } });
      deactivated.push(`${item.name}：已有主檔、庫存或交易資料引用，已改為停用`);
    } else {
      try {
        await prisma.item.delete({ where: { id } });
        deleted.push(item.name);
      } catch (error) {
        const isForeignKeyConstraint =
          typeof error === "object" && error !== null && "code" in error && error.code === "P2003";
        if (!isForeignKeyConstraint) throw error;

        await prisma.item.update({ where: { id }, data: { status: "INACTIVE" } });
        deactivated.push(`${item.name}：已有關聯資料引用，已改為停用`);
      }
    }
  }
  revalidatePath("/items"); revalidatePath("/price-lists");
  return { success: true, deleted, deactivated, message: `已刪除 ${deleted.length} 筆；已停用 ${deactivated.length} 筆` };
}
