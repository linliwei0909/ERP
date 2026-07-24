import { companyShortName } from "@/lib/company";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { EmptyRow, PageHeader, StatusPill } from "@/components/procurement-ui";
import { formatDate, formatMoney, formatQuantity } from "@/lib/procurement";
import { SearchButton } from "@/components/search-button";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const [lots, movements] = await Promise.all([
    prisma.inventoryLot.findMany({
      where: q ? { OR: [{ item: { code: { contains: q, mode: "insensitive" } } }, { item: { name: { contains: q, mode: "insensitive" } } }, { lotNumber: { contains: q, mode: "insensitive" } }] } : undefined,
      include: { item: { include: { company: true } }, warehouse: true }, orderBy: [{ item: { code: "asc" } }, { expiryDate: "asc" }],
    }),
    prisma.stockMovement.findMany({ include: { item: true, warehouse: true, goodsReceiptLot: { include: { goodsReceiptLine: { include: { goodsReceipt: true } } } }, salesDeliveryLot: { include: { salesDeliveryLine: { include: { salesDelivery: true } } } } }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 100 }),
  ]);
  return <><PageHeader eyebrow="庫存／倉儲" title="庫存與異動" description="批號庫存由已完成的入庫／出庫交易更新；異動紀錄永久保留來源。" />
    <form className="panel mb-5 flex gap-2 p-3"><input className="field-input !mt-0" name="q" defaultValue={q} placeholder="搜尋品號、品名或批號" /><SearchButton /></form>
    <section className="mb-8"><h2 className="mb-3 text-lg font-extrabold">目前庫存</h2><div className="data-table-wrap"><table className="data-table"><thead><tr><th>公司</th><th>品號</th><th>品名</th><th>倉庫</th><th>批號</th><th>效期</th><th>數量</th><th>單位成本</th><th>狀態</th></tr></thead><tbody>{lots.map((lot) => <tr key={lot.id}><td>{companyShortName(lot.item.company)}</td><td>{lot.item.code}</td><td>{lot.item.name}</td><td>{lot.warehouse.name}</td><td>{lot.lotNumber ?? "不管理"}</td><td>{formatDate(lot.expiryDate)}</td><td>{formatQuantity(lot.quantity)} {lot.item.unit}</td><td>{lot.unitCost ? formatMoney(lot.unitCost) : "—"}</td><td><StatusPill>{lot.status}</StatusPill></td></tr>)}{lots.length === 0 ? <EmptyRow colSpan={9} /> : null}</tbody></table></div></section>
    <section><h2 className="mb-3 text-lg font-extrabold">最近 100 筆庫存異動</h2><div className="data-table-wrap"><table className="data-table"><thead><tr><th>日期</th><th>類型</th><th>品號</th><th>倉庫</th><th>數量</th><th>來源</th><th>備註</th></tr></thead><tbody>{movements.map((movement) => <tr key={movement.id}><td>{formatDate(movement.occurredAt)}</td><td>{movement.movementType}</td><td>{movement.item.code} {movement.item.name}</td><td>{movement.warehouse.name}</td><td>{formatQuantity(movement.quantity)}</td><td>{movement.goodsReceiptLot ? <Link className="table-link" href={`/goods-receipts/${movement.goodsReceiptLot.goodsReceiptLine.goodsReceiptId}`}>{movement.sourceNo}</Link> : movement.salesDeliveryLot ? <Link className="table-link" href={`/sales-deliveries/${movement.salesDeliveryLot.salesDeliveryLine.salesDeliveryId}`}>{movement.sourceNo}</Link> : movement.sourceNo ?? movement.sourceType}</td><td>{movement.note ?? "—"}</td></tr>)}{movements.length === 0 ? <EmptyRow colSpan={7} /> : null}</tbody></table></div></section>
  </>;
}
