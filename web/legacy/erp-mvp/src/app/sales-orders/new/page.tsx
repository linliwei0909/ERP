import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createSalesOrder } from "@/app/sales-actions";
import { companyShortName } from "@/lib/company";
import { FlashMessage, PageHeader } from "@/components/procurement-ui";

export default async function NewSalesOrderPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const customers = await prisma.customer.findMany({ where: { status: "ACTIVE", company: { status: "ACTIVE" }, priceList: { status: "ACTIVE" } }, include: { company: true, shippingAddresses: { where: { status: "ACTIVE" }, orderBy: { label: "asc" } } }, orderBy: { code: "asc" } });
  const today = new Date().toISOString().slice(0, 10);
  return <><PageHeader eyebrow="銷售管理" title="新增銷售訂單" backHref="/sales-orders" description="先建立訂單表頭，儲存後再從該客戶價格表加入品項。" /><FlashMessage error={error} />
    <form action={createSalesOrder} className="panel space-y-6 p-6"><div className="grid gap-4 md:grid-cols-2">
      <label className="field-label">客戶 *<select className="field-input" name="customerId" required><option value="">請選擇</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.code} {customer.name}（{companyShortName(customer.company)}）</option>)}</select></label>
      <label className="field-label">額外送貨地址<select className="field-input" name="shippingAddressId"><option value="">使用客戶本身地址</option>{customers.flatMap((customer) => customer.shippingAddresses.map((address) => <option key={address.id} value={address.id}>{customer.code}｜{address.label}｜{address.address}</option>))}</select></label>
      <label className="field-label">訂單日期 *<input className="field-input" type="date" name="orderDate" defaultValue={today} required /></label>
      <label className="field-label">預計出貨日<input className="field-input" type="date" name="expectedShipDate" /></label>
      <label className="field-label md:col-span-2">備註<textarea className="field-textarea" name="note" /></label>
    </div><div className="action-row"><button className="primary-button" type="submit">建立銷售訂單</button><Link className="secondary-button inline-flex items-center" href="/sales-orders">取消</Link></div></form></>;
}
