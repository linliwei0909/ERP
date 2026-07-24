import { companyShortName } from "@/lib/company";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { EmptyRow, FlashMessage, PageHeader, StatusPill } from "@/components/procurement-ui";
import { formatDate, goodsReceiptStatusLabel } from "@/lib/procurement";
import { SearchButton } from "@/components/search-button";

export default async function GoodsReceiptsPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string; success?: string }> }) {
  const { q = "", error, success } = await searchParams;
  const receipts = await prisma.goodsReceipt.findMany({ where: q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { supplierNameSnapshot: { contains: q, mode: "insensitive" } }, { purchaseOrder: { number: { contains: q, mode: "insensitive" } } }] } : undefined, include: { company: true, purchaseOrder: true, warehouse: true }, orderBy: [{ receiptDate: "desc" }, { id: "desc" }] });
  return <><PageHeader eyebrow="採購／庫存" title="進貨與入庫" description="進貨單記錄收貨與驗收；按下完成入庫後才會增加批號庫存。" /><FlashMessage error={error} success={success} />
    <form className="panel mb-5 flex gap-2 p-3"><input className="field-input !mt-0" name="q" defaultValue={q} placeholder="搜尋進貨單、採購單或供應商" /><SearchButton /></form>
    <div className="data-table-wrap"><table className="data-table"><thead><tr><th>進貨單號</th><th>採購單號</th><th>公司</th><th>供應商</th><th>倉庫</th><th>收貨日期</th><th>狀態</th></tr></thead><tbody>{receipts.map((receipt) => <tr key={receipt.id}><td><Link className="table-link" href={`/goods-receipts/${receipt.id}`}>{receipt.number}</Link></td><td><Link className="table-link" href={`/purchase-orders/${receipt.purchaseOrderId}`}>{receipt.purchaseOrder.number}</Link></td><td>{companyShortName(receipt.company)}</td><td>{receipt.supplierNameSnapshot}</td><td>{receipt.warehouse.name}</td><td>{formatDate(receipt.receiptDate)}</td><td><StatusPill>{goodsReceiptStatusLabel[receipt.status]}</StatusPill></td></tr>)}{receipts.length === 0 ? <EmptyRow colSpan={7} /> : null}</tbody></table></div></>;
}
