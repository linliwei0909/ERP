import { companyShortName } from "@/lib/company";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { CustomerForm } from "./customer-form";
import { ShippingAddressForm } from "./shipping-address-form";
import { SearchButton } from "@/components/search-button";
import { BulkDeleteForm, DeleteRecordButton, RowCheckbox, SelectAllCheckbox } from "@/components/delete-controls";
import { deleteCustomers } from "./actions";

const statusTones: Record<string, string> = { ACTIVE: "customer-active", INACTIVE: "customer-invalid" };

type CustomersPageProps = {
  searchParams: Promise<{ q?: string; mode?: string; id?: string; shipping?: string }>;
};

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const selectedId = Number(params.id);
  const showNewCustomer = params.mode === "new";
  const showNewShippingAddress = params.shipping === "new";
  const [customers, companies] = await Promise.all([
    prisma.customer.findMany({
      include: {
        company: true,
        priceList: true,
        shippingAddresses: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.company.findMany({
      where: { status: "ACTIVE" },
      include: { priceLists: { where: { status: "ACTIVE", type: "SHARED" }, orderBy: { code: "asc" } } },
      orderBy: { code: "asc" },
    }),
  ]);
  const activeCount = customers.filter((customer) => customer.status === "ACTIVE").length;
  const filteredCustomers = query
    ? customers.filter((customer) => [
        customer.code,
        customer.name,
        customer.legalName,
        customer.taxId,
        customer.contactName,
        customer.phone,
        customer.mobile,
        customer.email,
        customer.company.name,
        customer.priceList.name,
      ].filter(Boolean).join(" ").toLowerCase().includes(query.toLowerCase()))
    : customers;
  const selectedCustomer = customers.find((customer) => customer.id === selectedId) ?? null;

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="eyebrow">銷售基礎資料</p><h1 className="page-title">客戶管理</h1><p className="mt-2 text-sm text-slate-500">每位客戶歸屬一家銷售公司；交易與帳務均依該公司歸屬。</p></div>
        <div className="flex flex-wrap gap-2 text-sm font-semibold"><Link href="/customers?mode=new" className="primary-button">新增客戶</Link><span className="rounded-full border border-slate-200 bg-white px-4 py-2 text-slate-600 shadow-sm">共 {customers.length} 筆</span><span className="rounded-full bg-emerald-50 px-4 py-2 text-emerald-700">啟用 {activeCount} 筆</span></div>
      </header>

      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div><h2 className="font-bold text-slate-900">客戶清單</h2><p className="mt-1 text-xs text-slate-500">點選客戶查看完整資料與送貨地址</p></div>
          <form className="flex min-w-64 gap-2"><input name="q" defaultValue={query} className="field-input mt-0" placeholder="搜尋客戶、公司或價格表" /><SearchButton /></form>
        </div>
        <BulkDeleteForm key={customers.map((customer) => customer.id).join("-")} action={deleteCustomers} noun="客戶">{customers.length === 0 ? (
          <div className="flex min-h-80 flex-col items-center justify-center px-6 text-center"><div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-teal-50 text-2xl">客</div><h3 className="font-bold text-slate-800">尚未建立客戶</h3><p className="mt-2 text-sm text-slate-500">點選新增客戶建立第一筆客戶主檔。</p></div>
        ) : filteredCustomers.length === 0 ? (
          <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">找不到符合的客戶。</div>
        ) : (
          <div className="overflow-x-auto"><table className="data-table min-w-[1280px]">
            <thead><tr><th><SelectAllCheckbox /></th><th>客戶編號</th><th>客戶名稱</th><th>統一編號</th><th>銷售公司</th><th>類型</th><th>價格表</th><th>狀態</th><th>電話</th><th>Email</th><th>送貨地址</th><th className="text-right">操作</th></tr></thead>
            <tbody>{filteredCustomers.map((customer) => <tr key={customer.id}><td><RowCheckbox id={customer.id} label={customer.name} /></td>
              <td><Link href={`/customers?id=${customer.id}`} className="font-mono font-semibold text-teal-700 hover:underline">{customer.code}</Link></td>
              <td className="font-semibold text-slate-800">{customer.name}</td>
              <td>{customer.taxId || "—"}</td>
              <td>{companyShortName(customer.company)}</td>
              <td>{customer.type === "DISTRIBUTOR" ? "經銷" : "零售"}</td>
              <td>{customer.priceList.name}</td>
              <td><span className={`customer-status ${statusTones[customer.status]}`}>{customer.status === "ACTIVE" ? "啟用" : "停用"}</span></td>
              <td>{customer.phone || customer.mobile || "—"}</td>
              <td>{customer.email || "—"}</td>
              <td>{(customer.address ? 1 : 0) + customer.shippingAddresses.length} 筆</td>
              <td className="text-right"><Link href={`/customers?id=${customer.id}`} className="font-semibold text-teal-700 hover:underline">查看明細</Link></td>
            </tr>)}</tbody>
          </table></div>
        )}</BulkDeleteForm>
      </section>

      {showNewCustomer && <div className="modal-backdrop" role="presentation"><section className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="new-customer-title"><header className="modal-header"><div><p className="eyebrow">客戶主檔</p><h2 id="new-customer-title" className="mt-1 text-2xl font-bold">新增客戶</h2></div><Link href="/customers" className="modal-close" aria-label="關閉新增客戶視窗">×</Link></header><div className="modal-body"><CustomerForm companies={companies.map((company) => ({ id: company.id, code: company.code, name: company.name, priceLists: company.priceLists.map(({ id, code, name }) => ({ id, code, name })) }))} /></div></section></div>}

      {selectedCustomer && <div className="modal-backdrop" role="presentation"><section className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="customer-detail-title"><header className="modal-header"><div><p className="eyebrow">客戶明細</p><h2 id="customer-detail-title" className="mt-1 text-2xl font-bold">{selectedCustomer.name}</h2><p className="mt-1 font-mono text-xs text-teal-700">{selectedCustomer.code}</p></div><Link href="/customers" className="modal-close" aria-label="關閉客戶明細">×</Link></header><div className="modal-body space-y-7">
        {!showNewShippingAddress && <>
          <dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="font-semibold text-slate-400">統一編號</dt><dd className="mt-1">{selectedCustomer.taxId || "—"}</dd></div><div><dt className="font-semibold text-slate-400">聯絡人</dt><dd className="mt-1">{selectedCustomer.contactName || "—"}</dd></div><div><dt className="font-semibold text-slate-400">電話</dt><dd className="mt-1">{selectedCustomer.phone || selectedCustomer.mobile || "—"}</dd></div><div><dt className="font-semibold text-slate-400">Email</dt><dd className="mt-1">{selectedCustomer.email || "—"}</dd></div><div className="sm:col-span-2"><dt className="font-semibold text-slate-400">帳單／發票地址</dt><dd className="mt-1">{selectedCustomer.invoiceAddress || "—"}</dd></div></dl>
          <section><h3 className="font-bold text-slate-900">銷售歸屬與價格</h3><article className="mt-3 rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center gap-2"><strong>{companyShortName(selectedCustomer.company)}</strong><span className="status-pill">{selectedCustomer.type === "DISTRIBUTOR" ? "經銷" : "零售"}</span><span className={`customer-status ${statusTones[selectedCustomer.status]}`}>{selectedCustomer.status === "ACTIVE" ? "啟用" : "停用"}</span></div><p className="mt-2 text-sm text-slate-600">價格表：{selectedCustomer.priceList.name}</p><p className="mt-1 text-xs text-slate-400">{selectedCustomer.paymentTerms || "付款條件未設定"} · 額度 {Number(selectedCustomer.creditLimit).toLocaleString()}{selectedCustomer.salesOwner ? ` · 業務 ${selectedCustomer.salesOwner}` : ""}</p><p className="mt-2 text-xs text-slate-500">訂單、發票、應收帳款與營業額均歸屬此銷售公司；價格表可包含其他產品公司的品項。</p></article></section>
          <section><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold text-slate-900">送貨地址</h3><p className="mt-1 text-xs text-slate-500">客戶本身地址為訂單預設地址</p></div><Link href={`/customers?id=${selectedCustomer.id}&shipping=new`} className="primary-button">新增送貨地址</Link></div><div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
            <article className="grid gap-2 bg-teal-50/40 p-4 sm:grid-cols-[1fr_auto]"><div><div className="flex items-center gap-2"><strong>客戶本身地址</strong><span className="status-pill">訂單預設</span></div><p className="mt-1 text-sm text-slate-600">{selectedCustomer.address || "尚未設定"}</p></div><p className="font-bold text-teal-700">加價 NT$ 0</p></article>
            {selectedCustomer.shippingAddresses.map((address) => <article key={address.id} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto]"><div><strong>{address.label}</strong><p className="mt-1 text-sm text-slate-600">{address.postalCode ? `${address.postalCode} ` : ""}{address.address}</p><p className="mt-1 text-xs text-slate-400">{[address.recipientName, address.recipientPhone].filter(Boolean).join(" · ") || "未設定收件人"}</p></div><p className="font-bold text-amber-600">加價 NT$ {Number(address.shippingFeeMarkup).toLocaleString()}</p></article>)}
          </div></section><div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5"><DeleteRecordButton action={deleteCustomers} id={selectedCustomer.id} name={selectedCustomer.name} /><Link href="/customers" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">關閉</Link></div>
        </>}
        {showNewShippingAddress && <section><div className="mb-5"><p className="eyebrow">配送地點</p><h3 className="mt-1 text-xl font-bold">新增送貨地址</h3></div><ShippingAddressForm customer={{ id: selectedCustomer.id, code: selectedCustomer.code, name: selectedCustomer.name }} /></section>}
      </div></section></div>}
    </div>
  );
}
