import { companyShortName } from "@/lib/company";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { EmptyRow, FlashMessage, PageHeader, StatusPill } from "@/components/procurement-ui";
import { formatDate, formatMoney, paymentStatusLabel } from "@/lib/procurement";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string; success?: string }> }) {
  const { q = "", error, success } = await searchParams; const payments = await prisma.payment.findMany({ where: q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { supplier: { name: { contains: q, mode: "insensitive" } } }] } : undefined, include: { company: true, supplier: true, _count: { select: { allocations: true } } }, orderBy: [{ paymentDate: "desc" }, { id: "desc" }] });
  return <><PageHeader eyebrow="財務帳款" title="付款紀錄" description="每筆付款保留獨立紀錄與應付沖帳關聯。" /><FlashMessage error={error} success={success} /><div className="data-table-wrap"><table className="data-table"><thead><tr><th>付款單號</th><th>公司</th><th>供應商</th><th>付款日期</th><th>方式</th><th>金額</th><th>沖帳筆數</th><th>狀態</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id}><td><Link className="table-link" href={`/payments/${payment.id}`}>{payment.number}</Link></td><td>{companyShortName(payment.company)}</td><td>{payment.supplier.name}</td><td>{formatDate(payment.paymentDate)}</td><td>{payment.paymentMethod}</td><td>{formatMoney(payment.totalAmount, payment.currency)}</td><td>{payment._count.allocations}</td><td><StatusPill>{paymentStatusLabel[payment.status]}</StatusPill></td></tr>)}{payments.length === 0 ? <EmptyRow colSpan={8} /> : null}</tbody></table></div></>;
}
