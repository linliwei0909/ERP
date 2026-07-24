"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { nextDocumentNumber, parseDate } from "@/lib/procurement";

const positiveId = z.coerce.number().int().positive();
const nonNegativeNumber = z.coerce.number().min(0);
const positiveNumber = z.coerce.number().positive();

function messagePath(path: string, kind: "error" | "success", message: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${kind}=${encodeURIComponent(message)}`;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "操作失敗，請稍後再試";
}

export async function createSupplier(formData: FormData) {
  const parsed = z.object({
    code: z.string().trim().min(1).max(50),
    name: z.string().trim().min(1).max(200),
    taxId: z.string().trim().max(20),
    contactName: z.string().trim().max(100),
    phone: z.string().trim().max(50),
    email: z.string().trim().max(200),
    address: z.string().trim().max(500),
    paymentTerms: z.string().trim().max(100),
    legacyCode: z.string().trim().max(100),
    note: z.string().trim(),
  }).safeParse(Object.fromEntries(formData));
  const companyIds = formData.getAll("companyIds").map(Number).filter(Number.isInteger);
  if (!parsed.success || companyIds.length === 0) {
    redirect(messagePath("/suppliers/new", "error", "請完整填寫供應商名稱、代碼及至少一家可用公司"));
  }

  let supplierId: number | null = null;
  let failure: string | null = null;
  try {
    supplierId = await prisma.$transaction(async (tx) => {
      const companies = await tx.company.count({ where: { id: { in: companyIds }, status: "ACTIVE" } });
      if (companies !== new Set(companyIds).size) throw new Error("所選公司不存在或已停用");
      const supplier = await tx.supplier.create({
        data: {
          code: parsed.data.code.toUpperCase(),
          name: parsed.data.name,
          taxId: parsed.data.taxId || null,
          contactName: parsed.data.contactName || null,
          phone: parsed.data.phone || null,
          email: parsed.data.email || null,
          address: parsed.data.address || null,
          legacyCode: parsed.data.legacyCode || null,
          note: parsed.data.note || null,
          companies: {
            create: companyIds.map((companyId) => ({
              companyId,
              paymentTerms: parsed.data.paymentTerms || null,
            })),
          },
        },
      });
      return supplier.id;
    });
  } catch (error) {
    failure = errorMessage(error).includes("Unique") ? "供應商代碼、統編或舊系統代碼已存在" : errorMessage(error);
  }
  if (failure || supplierId === null) redirect(messagePath("/suppliers/new", "error", failure ?? "新增失敗"));
  revalidatePath("/suppliers");
  redirect(`/suppliers/${supplierId}?success=${encodeURIComponent("已建立供應商")}`);
}

export async function addSupplierItem(supplierId: number, formData: FormData) {
  const parsed = z.object({
    itemId: positiveId,
    supplierItemCode: z.string().trim().max(100),
    purchaseUnit: z.string().trim().min(1).max(20),
    conversionRate: positiveNumber,
    minimumOrderQuantity: nonNegativeNumber,
    leadTimeDays: z.coerce.number().int().min(0).optional(),
    unitPrice: nonNegativeNumber,
    effectiveFrom: z.string().min(1),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(messagePath(`/suppliers/${supplierId}`, "error", "請檢查供貨資料欄位"));

  let failure: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      const [supplier, item] = await Promise.all([
        tx.supplier.findUnique({ where: { id: supplierId }, include: { companies: true } }),
        tx.item.findUnique({ where: { id: parsed.data.itemId } }),
      ]);
      if (!supplier || supplier.status !== "ACTIVE") throw new Error("供應商不存在或已停用");
      if (!item || item.status !== "ACTIVE") throw new Error("品項不存在或已停用");
      if (!supplier.companies.some((relation) => relation.companyId === item.companyId && relation.status === "ACTIVE")) {
        throw new Error("供應商未開放給該品項所屬公司");
      }
      await tx.supplierItem.create({
        data: {
          supplierId,
          itemId: item.id,
          supplierItemCode: parsed.data.supplierItemCode || null,
          purchaseUnit: parsed.data.purchaseUnit,
          conversionRate: parsed.data.conversionRate.toString(),
          minimumOrderQuantity: parsed.data.minimumOrderQuantity.toString(),
          leadTimeDays: parsed.data.leadTimeDays ?? null,
          prices: {
            create: {
              unitPrice: parsed.data.unitPrice.toString(),
              effectiveFrom: parseDate(parsed.data.effectiveFrom, true)!,
            },
          },
        },
      });
    });
  } catch (error) {
    failure = errorMessage(error);
  }
  if (failure) redirect(messagePath(`/suppliers/${supplierId}`, "error", failure));
  revalidatePath(`/suppliers/${supplierId}`);
  redirect(messagePath(`/suppliers/${supplierId}`, "success", "已新增供貨品項"));
}

export async function createPurchaseRequisition(formData: FormData) {
  const parsed = z.object({
    companyId: positiveId,
    requestDate: z.string().min(1),
    requiredDate: z.string(),
    requester: z.string().trim().max(100),
    department: z.string().trim().max(100),
    purpose: z.string().trim().max(300),
    note: z.string().trim(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(messagePath("/purchase-requisitions/new", "error", "請檢查請購資料"));

  let id: number | null = null;
  let failure: string | null = null;
  try {
    id = await prisma.$transaction(async (tx) => {
      const company = await tx.company.findFirst({ where: { id: parsed.data.companyId, status: "ACTIVE" } });
      if (!company) throw new Error("公司不存在或已停用");
      const requestDate = parseDate(parsed.data.requestDate, true)!;
      const number = await nextDocumentNumber(tx, company.id, "PURCHASE_REQUISITION", "PR", requestDate);
      const requisition = await tx.purchaseRequisition.create({
        data: {
          companyId: company.id,
          number,
          requestDate,
          requiredDate: parseDate(parsed.data.requiredDate),
          requester: parsed.data.requester || null,
          department: parsed.data.department || null,
          purpose: parsed.data.purpose || null,
          note: parsed.data.note || null,
        },
      });
      return requisition.id;
    });
  } catch (error) {
    failure = errorMessage(error);
  }
  if (failure || id === null) redirect(messagePath("/purchase-requisitions/new", "error", failure ?? "新增失敗"));
  revalidatePath("/purchase-requisitions");
  redirect(`/purchase-requisitions/${id}?success=${encodeURIComponent("請購單已建立，請新增明細")}`);
}

export async function addPurchaseRequisitionLine(requisitionId: number, formData: FormData) {
  const parsed = z.object({
    itemId: positiveId,
    suggestedSupplierId: z.preprocess((value) => value === "" ? undefined : value, positiveId.optional()),
    requestedQuantity: positiveNumber,
    estimatedUnitPrice: nonNegativeNumber,
    requiredDate: z.string(),
    purpose: z.string().trim().max(300),
    note: z.string().trim(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(messagePath(`/purchase-requisitions/${requisitionId}`, "error", "請檢查請購明細"));

  let failure: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      const requisition = await tx.purchaseRequisition.findUnique({ where: { id: requisitionId } });
      if (!requisition || requisition.status !== "DRAFT") throw new Error("只有草稿請購單可以新增明細");
      const item = await tx.item.findFirst({ where: { id: parsed.data.itemId, status: "ACTIVE" } });
      if (!item) throw new Error("品項不存在或已停用");
      if (item.companyId !== requisition.companyId) throw new Error("第一版請購只允許選擇與請購公司相同產品公司的品項");
      if (parsed.data.suggestedSupplierId) {
        const relation = await tx.supplierCompany.findFirst({
          where: { supplierId: parsed.data.suggestedSupplierId, companyId: requisition.companyId, status: "ACTIVE" },
        });
        if (!relation) throw new Error("建議供應商未開放給此公司");
      }
      const latest = await tx.purchaseRequisitionLine.findFirst({
        where: { requisitionId }, orderBy: { lineNo: "desc" }, select: { lineNo: true },
      });
      await tx.purchaseRequisitionLine.create({
        data: {
          requisitionId,
          lineNo: (latest?.lineNo ?? 0) + 1,
          itemId: item.id,
          suggestedSupplierId: parsed.data.suggestedSupplierId ?? null,
          itemCodeSnapshot: item.code,
          itemNameSnapshot: item.name,
          itemSpecSnapshot: item.spec,
          unitSnapshot: item.unit,
          productCompanyIdSnapshot: item.companyId,
          requestedQuantity: parsed.data.requestedQuantity.toString(),
          estimatedUnitPrice: parsed.data.estimatedUnitPrice.toString(),
          requiredDate: parseDate(parsed.data.requiredDate),
          purpose: parsed.data.purpose || null,
          note: parsed.data.note || null,
        },
      });
    });
  } catch (error) {
    failure = errorMessage(error);
  }
  if (failure) redirect(messagePath(`/purchase-requisitions/${requisitionId}`, "error", failure));
  revalidatePath(`/purchase-requisitions/${requisitionId}`);
  redirect(messagePath(`/purchase-requisitions/${requisitionId}`, "success", "已新增請購明細"));
}

export async function submitPurchaseRequisition(requisitionId: number) {
  const requisition = await prisma.purchaseRequisition.findUnique({
    where: { id: requisitionId }, include: { _count: { select: { lines: true } } },
  });
  if (!requisition || requisition.status !== "DRAFT" || requisition._count.lines === 0) {
    redirect(messagePath(`/purchase-requisitions/${requisitionId}`, "error", "請購單必須是含有明細的草稿"));
  }
  await prisma.purchaseRequisition.update({ where: { id: requisitionId }, data: { status: "PENDING_APPROVAL" } });
  revalidatePath(`/purchase-requisitions/${requisitionId}`);
  redirect(messagePath(`/purchase-requisitions/${requisitionId}`, "success", "已送出核准"));
}

export async function approvePurchaseRequisition(requisitionId: number) {
  const result = await prisma.purchaseRequisition.updateMany({
    where: { id: requisitionId, status: "PENDING_APPROVAL" },
    data: { status: "APPROVED", approvedAt: new Date(), approvedBy: "系統使用者" },
  });
  if (result.count !== 1) redirect(messagePath(`/purchase-requisitions/${requisitionId}`, "error", "只有待核准請購單可以核准"));
  revalidatePath(`/purchase-requisitions/${requisitionId}`);
  redirect(messagePath(`/purchase-requisitions/${requisitionId}`, "success", "請購單已核准"));
}

export async function createPurchaseOrderFromRequisition(requisitionId: number, formData: FormData) {
  const parsed = z.object({ supplierId: positiveId, orderDate: z.string().min(1), expectedDeliveryDate: z.string() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(messagePath(`/purchase-requisitions/${requisitionId}`, "error", "請選擇供應商與採購日期"));

  let purchaseOrderId: number | null = null;
  let failure: string | null = null;
  try {
    purchaseOrderId = await prisma.$transaction(async (tx) => {
      const requisition = await tx.purchaseRequisition.findUnique({ where: { id: requisitionId }, include: { lines: true } });
      if (!requisition || !["APPROVED", "PARTIALLY_ORDERED"].includes(requisition.status)) throw new Error("請購單尚未核准或已完成轉單");
      const relation = await tx.supplierCompany.findFirst({
        where: { supplierId: parsed.data.supplierId, companyId: requisition.companyId, status: "ACTIVE", supplier: { status: "ACTIVE" } },
        include: { supplier: true },
      });
      if (!relation) throw new Error("供應商未開放給此公司");
      const remainingLines = requisition.lines.filter((line) => Number(line.requestedQuantity) > Number(line.orderedQuantity));
      if (remainingLines.length === 0) throw new Error("請購單沒有未轉採購數量");
      const orderDate = parseDate(parsed.data.orderDate, true)!;
      const number = await nextDocumentNumber(tx, requisition.companyId, "PURCHASE_ORDER", "PO", orderDate);
      const order = await tx.purchaseOrder.create({
        data: {
          companyId: requisition.companyId,
          supplierId: relation.supplierId,
          number,
          orderDate,
          expectedDeliveryDate: parseDate(parsed.data.expectedDeliveryDate),
          currency: relation.currency,
          paymentTermsSnapshot: relation.paymentTerms,
          taxType: relation.taxType,
          supplierNameSnapshot: relation.supplier.name,
          supplierTaxIdSnapshot: relation.supplier.taxId,
          supplierContactSnapshot: relation.supplier.contactName,
          supplierAddressSnapshot: relation.supplier.address,
        },
      });
      for (const [index, line] of remainingLines.entries()) {
        if (line.productCompanyIdSnapshot !== requisition.companyId) throw new Error("請購明細含有不同產品公司的品項");
        const quantity = Number(line.requestedQuantity) - Number(line.orderedQuantity);
        const supplierItem = await tx.supplierItem.findUnique({
          where: { supplierId_itemId: { supplierId: relation.supplierId, itemId: line.itemId } },
          include: { prices: { where: { effectiveFrom: { lte: orderDate } }, orderBy: { effectiveFrom: "desc" }, take: 1 } },
        });
        const unitPrice = Number(supplierItem?.prices[0]?.unitPrice ?? line.estimatedUnitPrice ?? 0);
        const netAmount = quantity * unitPrice;
        const orderLine = await tx.purchaseOrderLine.create({
          data: {
            purchaseOrderId: order.id,
            lineNo: index + 1,
            itemId: line.itemId,
            productCompanyIdSnapshot: line.productCompanyIdSnapshot,
            itemCodeSnapshot: line.itemCodeSnapshot,
            itemNameSnapshot: line.itemNameSnapshot,
            itemSpecSnapshot: line.itemSpecSnapshot,
            supplierItemCodeSnapshot: supplierItem?.supplierItemCode,
            // 採購單第一版仍以品項庫存單位記錄數量。供應商採購單位與
            // conversionRate 已保留在主檔，待換算與四捨五入規則確認後再啟用。
            unitSnapshot: line.unitSnapshot,
            orderedQuantity: quantity.toString(),
            unitPrice: unitPrice.toString(),
            netAmount: netAmount.toFixed(2),
            totalAmount: netAmount.toFixed(2),
            expectedDeliveryDate: parseDate(parsed.data.expectedDeliveryDate) ?? line.requiredDate,
          },
        });
        await tx.purchaseOrderLineSource.create({
          data: { purchaseOrderLineId: orderLine.id, requisitionLineId: line.id, quantity: quantity.toString() },
        });
        await tx.purchaseRequisitionLine.update({ where: { id: line.id }, data: { orderedQuantity: { increment: quantity } } });
      }
      await tx.purchaseRequisition.update({ where: { id: requisition.id }, data: { status: "COMPLETED" } });
      return order.id;
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    failure = errorMessage(error);
  }
  if (failure || purchaseOrderId === null) redirect(messagePath(`/purchase-requisitions/${requisitionId}`, "error", failure ?? "轉採購失敗"));
  revalidatePath("/purchase-requisitions");
  revalidatePath("/purchase-orders");
  redirect(`/purchase-orders/${purchaseOrderId}?success=${encodeURIComponent("已由請購單建立採購單")}`);
}

export async function confirmPurchaseOrder(purchaseOrderId: number) {
  let failure: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.findUnique({ where: { id: purchaseOrderId }, include: { lines: true } });
      if (!order || order.status !== "DRAFT" || order.lines.length === 0) throw new Error("只有含明細的草稿採購單可以確認");
      if (order.lines.some((line) => line.productCompanyIdSnapshot !== order.companyId)) throw new Error("採購單包含不同產品公司的品項");
      await tx.purchaseOrder.update({ where: { id: order.id }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
    });
  } catch (error) { failure = errorMessage(error); }
  if (failure) redirect(messagePath(`/purchase-orders/${purchaseOrderId}`, "error", failure));
  revalidatePath(`/purchase-orders/${purchaseOrderId}`);
  redirect(messagePath(`/purchase-orders/${purchaseOrderId}`, "success", "採購單已確認"));
}

export async function createGoodsReceiptFromPurchaseOrder(purchaseOrderId: number, formData: FormData) {
  const parsed = z.object({ warehouseId: positiveId, receiptDate: z.string().min(1), note: z.string().trim() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(messagePath(`/purchase-orders/${purchaseOrderId}`, "error", "請選擇倉庫與收貨日期"));
  let receiptId: number | null = null;
  let failure: string | null = null;
  try {
    receiptId = await prisma.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.findUnique({
        where: { id: purchaseOrderId }, include: { supplier: true, lines: { include: { item: true } } },
      });
      if (!order || !["CONFIRMED", "PARTIALLY_RECEIVED"].includes(order.status)) throw new Error("採購單尚未確認或已完成");
      const warehouse = await tx.warehouse.findFirst({ where: { id: parsed.data.warehouseId, status: "ACTIVE" } });
      if (!warehouse) throw new Error("倉庫不存在或已停用");
      const outstanding = order.lines.filter((line) => Number(line.receivedQuantity) + Number(line.cancelledQuantity) < Number(line.orderedQuantity));
      if (outstanding.length === 0) throw new Error("採購單沒有未進貨數量");
      const receiptDate = parseDate(parsed.data.receiptDate, true)!;
      const number = await nextDocumentNumber(tx, order.companyId, "GOODS_RECEIPT", "GR", receiptDate);
      const receipt = await tx.goodsReceipt.create({
        data: {
          companyId: order.companyId,
          supplierId: order.supplierId,
          purchaseOrderId: order.id,
          warehouseId: warehouse.id,
          number,
          receiptDate,
          supplierNameSnapshot: order.supplierNameSnapshot,
          note: parsed.data.note || null,
        },
      });
      for (const [index, line] of outstanding.entries()) {
        const quantity = Number(line.orderedQuantity) - Number(line.receivedQuantity) - Number(line.cancelledQuantity);
        const createdLine = await tx.goodsReceiptLine.create({
          data: {
            goodsReceiptId: receipt.id,
            purchaseOrderLineId: line.id,
            lineNo: index + 1,
            itemId: line.itemId,
            productCompanyIdSnapshot: line.productCompanyIdSnapshot,
            itemCodeSnapshot: line.itemCodeSnapshot,
            itemNameSnapshot: line.itemNameSnapshot,
            itemSpecSnapshot: line.itemSpecSnapshot,
            unitSnapshot: line.unitSnapshot,
            receivedQuantity: quantity.toString(),
            acceptedQuantity: quantity.toString(),
            unitCost: line.unitPrice,
          },
        });
        if (!line.item.trackLot && !line.item.trackExpiry) {
          await tx.goodsReceiptLot.create({ data: { goodsReceiptLineId: createdLine.id, quantity: quantity.toString() } });
        }
      }
      return receipt.id;
    }, { isolationLevel: "Serializable" });
  } catch (error) { failure = errorMessage(error); }
  if (failure || receiptId === null) redirect(messagePath(`/purchase-orders/${purchaseOrderId}`, "error", failure ?? "建立進貨單失敗"));
  revalidatePath("/goods-receipts");
  redirect(`/goods-receipts/${receiptId}?success=${encodeURIComponent("進貨單已建立，請確認批號與效期")}`);
}

export async function addGoodsReceiptLot(receiptId: number, lineId: number, formData: FormData) {
  const parsed = z.object({ lotNumber: z.string().trim().max(100), expiryDate: z.string(), quantity: positiveNumber }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(messagePath(`/goods-receipts/${receiptId}`, "error", "請檢查批號、效期與數量"));
  let failure: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      const line = await tx.goodsReceiptLine.findFirst({
        where: { id: lineId, goodsReceiptId: receiptId }, include: { goodsReceipt: true, item: true, lots: true },
      });
      if (!line || line.goodsReceipt.status !== "DRAFT") throw new Error("只有草稿進貨單可以新增批次");
      if (line.item.trackLot && !parsed.data.lotNumber) throw new Error("此品項必須填寫批號");
      if (line.item.trackExpiry && !parsed.data.expiryDate) throw new Error("此品項必須填寫效期");
      const total = line.lots.reduce((sum, lot) => sum + Number(lot.quantity), 0) + parsed.data.quantity;
      if (total > Number(line.acceptedQuantity)) throw new Error("批次數量合計不可超過合格數量");
      await tx.goodsReceiptLot.create({
        data: {
          goodsReceiptLineId: line.id,
          lotNumber: parsed.data.lotNumber || null,
          expiryDate: parseDate(parsed.data.expiryDate),
          quantity: parsed.data.quantity.toString(),
        },
      });
    });
  } catch (error) { failure = errorMessage(error); }
  if (failure) redirect(messagePath(`/goods-receipts/${receiptId}`, "error", failure));
  revalidatePath(`/goods-receipts/${receiptId}`);
  redirect(messagePath(`/goods-receipts/${receiptId}`, "success", "已新增批次資料"));
}

export async function updateGoodsReceiptLineQuantities(receiptId: number, lineId: number, formData: FormData) {
  const parsed = z.object({
    receivedQuantity: positiveNumber,
    acceptedQuantity: positiveNumber,
    rejectedQuantity: nonNegativeNumber,
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(messagePath(`/goods-receipts/${receiptId}`, "error", "請檢查實收、合格與拒收數量"));

  let failure: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      const line = await tx.goodsReceiptLine.findFirst({
        where: { id: lineId, goodsReceiptId: receiptId },
        include: { goodsReceipt: true, purchaseOrderLine: true, item: true, lots: true },
      });
      if (!line || line.goodsReceipt.status !== "DRAFT") throw new Error("只有草稿進貨單可以調整驗收數量");

      const received = parsed.data.receivedQuantity;
      const accepted = parsed.data.acceptedQuantity;
      const rejected = parsed.data.rejectedQuantity;
      if (Math.abs(accepted + rejected - received) > 0.0001) throw new Error("合格數量加拒收數量必須等於實收數量");

      const remaining = Number(line.purchaseOrderLine.orderedQuantity)
        - Number(line.purchaseOrderLine.receivedQuantity)
        - Number(line.purchaseOrderLine.cancelledQuantity);
      if (received > remaining + 0.0001) throw new Error("實收數量不可超過採購未交量");

      const lotTotal = line.lots.reduce((sum, lot) => sum + Number(lot.quantity), 0);
      if ((line.item.trackLot || line.item.trackExpiry) && lotTotal > accepted + 0.0001) {
        throw new Error("合格數量不可小於已建立的批次數量合計");
      }

      await tx.goodsReceiptLine.update({
        where: { id: line.id },
        data: {
          receivedQuantity: received.toString(),
          acceptedQuantity: accepted.toString(),
          rejectedQuantity: rejected.toString(),
        },
      });

      if (!line.item.trackLot && !line.item.trackExpiry) {
        const systemLot = line.lots[0];
        if (!systemLot) {
          await tx.goodsReceiptLot.create({ data: { goodsReceiptLineId: line.id, quantity: accepted.toString() } });
        } else {
          await tx.goodsReceiptLot.update({ where: { id: systemLot.id }, data: { quantity: accepted.toString() } });
        }
      }
    });
  } catch (error) { failure = errorMessage(error); }
  if (failure) redirect(messagePath(`/goods-receipts/${receiptId}`, "error", failure));
  revalidatePath(`/goods-receipts/${receiptId}`);
  redirect(messagePath(`/goods-receipts/${receiptId}`, "success", "驗收數量已更新"));
}

export async function postGoodsReceipt(receiptId: number) {
  let failure: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      const receipt = await tx.goodsReceipt.findUnique({
        where: { id: receiptId },
        include: { lines: { include: { item: true, lots: true, purchaseOrderLine: true } } },
      });
      if (!receipt || receipt.status !== "DRAFT" || receipt.postedAt) throw new Error("進貨單不存在、已入庫或狀態不允許入庫");
      if (receipt.lines.length === 0) throw new Error("進貨單沒有明細");
      for (const line of receipt.lines) {
        if (line.productCompanyIdSnapshot !== receipt.companyId || line.item.companyId !== receipt.companyId) throw new Error("進貨明細公司歸屬不正確");
        const accepted = Number(line.acceptedQuantity);
        const lotTotal = line.lots.reduce((sum, lot) => sum + Number(lot.quantity), 0);
        if (Math.abs(lotTotal - accepted) > 0.0001) throw new Error(`${line.itemCodeSnapshot} 的批次數量合計必須等於合格數量`);
        const remaining = Number(line.purchaseOrderLine.orderedQuantity) - Number(line.purchaseOrderLine.receivedQuantity) - Number(line.purchaseOrderLine.cancelledQuantity);
        if (accepted > remaining + 0.0001) throw new Error(`${line.itemCodeSnapshot} 的入庫量超過採購未交量`);
        for (const lot of line.lots) {
          if (line.item.trackLot && !lot.lotNumber) throw new Error(`${line.itemCodeSnapshot} 必須填寫批號`);
          if (line.item.trackExpiry && !lot.expiryDate) throw new Error(`${line.itemCodeSnapshot} 必須填寫效期`);
          const existing = await tx.inventoryLot.findFirst({
            where: { itemId: line.itemId, warehouseId: receipt.warehouseId, lotNumber: lot.lotNumber, expiryDate: lot.expiryDate },
          });
          const inventoryLot = existing
            ? await tx.inventoryLot.update({
                where: { id: existing.id },
                data: { quantity: { increment: lot.quantity }, unitCost: line.unitCost ?? existing.unitCost },
              })
            : await tx.inventoryLot.create({
                data: {
                  itemId: line.itemId,
                  warehouseId: receipt.warehouseId,
                  lotNumber: lot.lotNumber,
                  expiryDate: lot.expiryDate,
                  quantity: lot.quantity,
                  unitCost: line.unitCost,
                },
              });
          await tx.goodsReceiptLot.update({ where: { id: lot.id }, data: { inventoryLotId: inventoryLot.id } });
          await tx.stockMovement.create({
            data: {
              itemId: line.itemId,
              warehouseId: receipt.warehouseId,
              inventoryLotId: inventoryLot.id,
              goodsReceiptLotId: lot.id,
              movementType: "RECEIPT",
              quantity: lot.quantity,
              unitCost: line.unitCost,
              occurredAt: receipt.receiptDate,
              sourceType: "GOODS_RECEIPT",
              sourceNo: receipt.number,
              note: `採購進貨 ${receipt.number}`,
            },
          });
        }
        await tx.purchaseOrderLine.update({ where: { id: line.purchaseOrderLineId }, data: { receivedQuantity: { increment: accepted } } });
      }
      await tx.goodsReceipt.update({ where: { id: receipt.id }, data: { status: "RECEIVED", postedAt: new Date() } });
      const orderLines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: receipt.purchaseOrderId } });
      const complete = orderLines.every((line) => Number(line.receivedQuantity) + Number(line.cancelledQuantity) >= Number(line.orderedQuantity));
      await tx.purchaseOrder.update({ where: { id: receipt.purchaseOrderId }, data: { status: complete ? "COMPLETED" : "PARTIALLY_RECEIVED" } });
    }, { isolationLevel: "Serializable" });
  } catch (error) { failure = errorMessage(error); }
  if (failure) redirect(messagePath(`/goods-receipts/${receiptId}`, "error", failure));
  revalidatePath("/goods-receipts");
  revalidatePath("/purchase-orders");
  revalidatePath("/");
  redirect(messagePath(`/goods-receipts/${receiptId}`, "success", "入庫完成，已建立庫存異動"));
}

export async function createApInvoiceFromGoodsReceipt(receiptId: number, formData: FormData) {
  const parsed = z.object({ supplierInvoiceNumber: z.string().trim().max(100), invoiceDate: z.string().min(1), dueDate: z.string(), note: z.string().trim() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(messagePath(`/goods-receipts/${receiptId}`, "error", "請檢查應付發票資料"));
  let invoiceId: number | null = null;
  let failure: string | null = null;
  try {
    invoiceId = await prisma.$transaction(async (tx) => {
      const receipt = await tx.goodsReceipt.findUnique({
        where: { id: receiptId }, include: { supplier: true, lines: { include: { apInvoiceSources: true } } },
      });
      if (!receipt || receipt.status !== "RECEIVED") throw new Error("進貨單尚未完成入庫");
      if (receipt.lines.some((line) => line.apInvoiceSources.length > 0)) throw new Error("此進貨單已建立過應付發票");
      const invoiceDate = parseDate(parsed.data.invoiceDate, true)!;
      const number = await nextDocumentNumber(tx, receipt.companyId, "AP_INVOICE", "AP", invoiceDate);
      const lineValues = receipt.lines.map((line) => {
        const quantity = Number(line.acceptedQuantity);
        const unitPrice = Number(line.unitCost ?? 0);
        return { line, quantity, unitPrice, amount: quantity * unitPrice };
      });
      const total = lineValues.reduce((sum, value) => sum + value.amount, 0);
      const invoice = await tx.apInvoice.create({
        data: {
          companyId: receipt.companyId,
          supplierId: receipt.supplierId,
          number,
          supplierInvoiceNumber: parsed.data.supplierInvoiceNumber || null,
          sourceType: "PURCHASE",
          invoiceDate,
          billingMonth: invoiceDate.toISOString().slice(0, 7).replace("-", ""),
          dueDate: parseDate(parsed.data.dueDate),
          supplierNameSnapshot: receipt.supplierNameSnapshot,
          supplierTaxIdSnapshot: receipt.supplier.taxId,
          netAmount: total.toFixed(2),
          totalAmount: total.toFixed(2),
          remainingBalance: total.toFixed(2),
          note: parsed.data.note || null,
        },
      });
      for (const [index, value] of lineValues.entries()) {
        const invoiceLine = await tx.apInvoiceLine.create({
          data: {
            apInvoiceId: invoice.id,
            lineNo: index + 1,
            itemId: value.line.itemId,
            itemCodeSnapshot: value.line.itemCodeSnapshot,
            descriptionSnapshot: value.line.itemNameSnapshot,
            itemSpecSnapshot: value.line.itemSpecSnapshot,
            unitSnapshot: value.line.unitSnapshot,
            quantity: value.quantity.toString(),
            unitPrice: value.unitPrice.toString(),
            netAmount: value.amount.toFixed(2),
            totalAmount: value.amount.toFixed(2),
          },
        });
        await tx.apInvoiceLineSource.create({
          data: {
            apInvoiceLineId: invoiceLine.id,
            purchaseOrderLineId: value.line.purchaseOrderLineId,
            goodsReceiptLineId: value.line.id,
            matchedQuantity: value.quantity.toString(),
            matchedAmount: value.amount.toFixed(2),
          },
        });
      }
      return invoice.id;
    }, { isolationLevel: "Serializable" });
  } catch (error) { failure = errorMessage(error); }
  if (failure || invoiceId === null) redirect(messagePath(`/goods-receipts/${receiptId}`, "error", failure ?? "建立應付發票失敗"));
  revalidatePath("/ap-invoices");
  redirect(`/ap-invoices/${invoiceId}?success=${encodeURIComponent("已由進貨單建立應付發票")}`);
}

export async function createManualApInvoice(formData: FormData) {
  const parsed = z.object({
    companyId: positiveId,
    supplierId: positiveId,
    sourceType: z.enum(["MANUAL_EXPENSE", "FIXED_ASSET", "LEGACY_IMPORT"]),
    supplierInvoiceNumber: z.string().trim().max(100),
    invoiceDate: z.string().min(1),
    dueDate: z.string(),
    itemId: z.preprocess((value) => value === "" ? undefined : value, positiveId.optional()),
    description: z.string().trim().min(1).max(300),
    unit: z.string().trim().max(20),
    quantity: positiveNumber,
    unitPrice: nonNegativeNumber,
    taxRate: nonNegativeNumber,
    freightAmount: nonNegativeNumber,
    legacyCode: z.string().trim().max(100),
    note: z.string().trim(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(messagePath("/ap-invoices/new", "error", "請檢查應付發票與明細資料"));
  let invoiceId: number | null = null;
  let failure: string | null = null;
  try {
    invoiceId = await prisma.$transaction(async (tx) => {
      const relation = await tx.supplierCompany.findFirst({
        where: { companyId: parsed.data.companyId, supplierId: parsed.data.supplierId, status: "ACTIVE", supplier: { status: "ACTIVE" } },
        include: { supplier: true },
      });
      if (!relation) throw new Error("供應商未開放給此公司");
      const item = parsed.data.itemId ? await tx.item.findFirst({ where: { id: parsed.data.itemId, status: "ACTIVE" } }) : null;
      if (parsed.data.itemId && !item) throw new Error("品項不存在或已停用");
      if (item && item.companyId !== parsed.data.companyId) throw new Error("第一版人工應付只允許選擇與單據公司相同產品公司的品項");
      const invoiceDate = parseDate(parsed.data.invoiceDate, true)!;
      const number = await nextDocumentNumber(tx, parsed.data.companyId, "AP_INVOICE", "AP", invoiceDate);
      const netAmount = parsed.data.quantity * parsed.data.unitPrice;
      const taxAmount = netAmount * (parsed.data.taxRate / 100);
      const totalAmount = netAmount + taxAmount + parsed.data.freightAmount;
      const invoice = await tx.apInvoice.create({
        data: {
          companyId: parsed.data.companyId,
          supplierId: parsed.data.supplierId,
          number,
          supplierInvoiceNumber: parsed.data.supplierInvoiceNumber || null,
          sourceType: parsed.data.sourceType,
          invoiceDate,
          billingMonth: invoiceDate.toISOString().slice(0, 7).replace("-", ""),
          dueDate: parseDate(parsed.data.dueDate),
          currency: relation.currency,
          supplierNameSnapshot: relation.supplier.name,
          supplierTaxIdSnapshot: relation.supplier.taxId,
          netAmount: netAmount.toFixed(2),
          taxAmount: taxAmount.toFixed(2),
          freightAmount: parsed.data.freightAmount.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          remainingBalance: totalAmount.toFixed(2),
          legacySystem: parsed.data.sourceType === "LEGACY_IMPORT" ? "RAGIC" : null,
          legacyCode: parsed.data.legacyCode || null,
          note: parsed.data.note || null,
          lines: {
            create: {
              lineNo: 1,
              itemId: item?.id,
              itemCodeSnapshot: item?.code,
              descriptionSnapshot: parsed.data.description,
              itemSpecSnapshot: item?.spec,
              unitSnapshot: parsed.data.unit || item?.unit,
              quantity: parsed.data.quantity.toString(),
              unitPrice: parsed.data.unitPrice.toString(),
              taxRate: parsed.data.taxRate.toString(),
              netAmount: netAmount.toFixed(2),
              taxAmount: taxAmount.toFixed(2),
              totalAmount: (netAmount + taxAmount).toFixed(2),
            },
          },
        },
      });
      return invoice.id;
    }, { isolationLevel: "Serializable" });
  } catch (error) { failure = errorMessage(error); }
  if (failure || invoiceId === null) redirect(messagePath("/ap-invoices/new", "error", failure ?? "建立應付發票失敗"));
  revalidatePath("/ap-invoices");
  redirect(`/ap-invoices/${invoiceId}?success=${encodeURIComponent("人工應付發票已建立")}`);
}

export async function postApInvoice(invoiceId: number) {
  const result = await prisma.apInvoice.updateMany({
    where: { id: invoiceId, status: { in: ["DRAFT", "PENDING_MATCH"] } },
    data: { status: "POSTED", postedAt: new Date() },
  });
  if (result.count !== 1) redirect(messagePath(`/ap-invoices/${invoiceId}`, "error", "應付發票狀態不允許立帳"));
  revalidatePath("/ap-invoices");
  redirect(messagePath(`/ap-invoices/${invoiceId}`, "success", "應付發票已立帳"));
}

export async function createPaymentForInvoice(invoiceId: number, formData: FormData) {
  const parsed = z.object({ paymentDate: z.string().min(1), paymentMethod: z.string().trim().min(1).max(50), amount: positiveNumber, note: z.string().trim() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(messagePath(`/ap-invoices/${invoiceId}`, "error", "請檢查付款資料"));
  let paymentId: number | null = null;
  let failure: string | null = null;
  try {
    paymentId = await prisma.$transaction(async (tx) => {
      const invoice = await tx.apInvoice.findUnique({ where: { id: invoiceId } });
      if (!invoice || !["POSTED", "PARTIALLY_PAID"].includes(invoice.status)) throw new Error("只有已立帳或部分付款的應付發票可以付款");
      if (parsed.data.amount > Number(invoice.remainingBalance)) throw new Error("付款金額不可超過未付餘額");
      const paymentDate = parseDate(parsed.data.paymentDate, true)!;
      const number = await nextDocumentNumber(tx, invoice.companyId, "PAYMENT", "PAY", paymentDate);
      const payment = await tx.payment.create({
        data: {
          companyId: invoice.companyId,
          supplierId: invoice.supplierId,
          number,
          paymentDate,
          paymentMethod: parsed.data.paymentMethod,
          currency: invoice.currency,
          exchangeRate: invoice.exchangeRate,
          totalAmount: parsed.data.amount.toFixed(2),
          status: "ALLOCATED",
          confirmedAt: new Date(),
          note: parsed.data.note || null,
          allocations: { create: { apInvoiceId: invoice.id, amount: parsed.data.amount.toFixed(2) } },
        },
      });
      const remaining = Number(invoice.remainingBalance) - parsed.data.amount;
      await tx.apInvoice.update({
        where: { id: invoice.id },
        data: { remainingBalance: remaining.toFixed(2), status: remaining <= 0.0001 ? "PAID" : "PARTIALLY_PAID" },
      });
      return payment.id;
    }, { isolationLevel: "Serializable" });
  } catch (error) { failure = errorMessage(error); }
  if (failure || paymentId === null) redirect(messagePath(`/ap-invoices/${invoiceId}`, "error", failure ?? "付款失敗"));
  revalidatePath("/ap-invoices");
  revalidatePath("/payments");
  redirect(`/payments/${paymentId}?success=${encodeURIComponent("付款與沖帳已完成")}`);
}
