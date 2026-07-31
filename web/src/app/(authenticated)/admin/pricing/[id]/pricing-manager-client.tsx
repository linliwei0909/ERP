"use client";
import { useState, type FormEvent } from "react";

type Option = { id: string; label: string };
type Version = { id: string; itemId: string; unitPrice: string; validFrom: string; validTo: string | null; status: "ACTIVE" | "INACTIVE"; item: { code: string; name: string } };
type Assignment = { id: string; customerId: string; validFrom: string; validTo: string | null; status: "ACTIVE" | "INACTIVE"; customer: { name: string } };
export type ManagedPriceList = { id: string; code: string; name: string; status: "ACTIVE" | "INACTIVE"; itemPrices: Version[]; assignments: Assignment[] };

async function send(url: string, method: string, body: unknown) {
  const response = await fetch(url, { method, headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? "操作失敗");
  return result;
}

export function PricingManagerClient({ priceList, companyId, items, customers }: {
  priceList: ManagedPriceList; companyId: string; items: Option[]; customers: Option[];
}) {
  const [message, setMessage] = useState<string | null>(null);
  async function run(action: () => Promise<unknown>) {
    setMessage(null);
    try { await action(); window.location.reload(); } catch (error) { setMessage(error instanceof Error ? error.message : "操作失敗"); }
  }
  return (
    <div className="mt-6 space-y-6">
      {message ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{message}</p> : null}
      <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); void run(() => send(`/api/admin/price-lists/${priceList.id}`, "PATCH", { companyId, priceList: { code: form.get("code"), name: form.get("name"), status: form.get("status") } })); }} className="grid gap-3 rounded-2xl border bg-white p-6 md:grid-cols-4">
        <h2 className="text-xl font-bold md:col-span-4">價格表資料</h2>
        <input name="code" required defaultValue={priceList.code} className="rounded-lg border px-3 py-2" />
        <input name="name" required defaultValue={priceList.name} className="rounded-lg border px-3 py-2" />
        <select name="status" defaultValue={priceList.status} className="rounded-lg border px-3 py-2"><option value="ACTIVE">有效</option><option value="INACTIVE">停用</option></select>
        <button className="rounded-lg bg-slate-900 px-4 py-2 text-white">儲存</button>
      </form>
      <section className="rounded-2xl border bg-white p-6">
        <h2 className="text-xl font-bold">品項價格版本</h2>
        <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void run(() => send(`/api/admin/price-lists/${priceList.id}/prices`, "POST", { companyId, price: { itemId: form.get("itemId"), unitPrice: form.get("unitPrice"), validFrom: form.get("validFrom"), validTo: form.get("validTo"), status: "ACTIVE" } })); }} className="mt-4 grid gap-3 md:grid-cols-5">
          <select name="itemId" required className="rounded-lg border px-3 py-2">{items.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
          <input name="unitPrice" required inputMode="decimal" placeholder="未稅單價" className="rounded-lg border px-3 py-2" />
          <input name="validFrom" type="date" required className="rounded-lg border px-3 py-2" />
          <input name="validTo" type="date" className="rounded-lg border px-3 py-2" />
          <button className="rounded-lg bg-slate-900 px-3 py-2 text-white">新增版本</button>
        </form>
        <div className="mt-4 space-y-3">{priceList.itemPrices.map((version) => (
          <form key={version.id} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void run(() => send(`/api/admin/item-prices/${version.id}`, "PATCH", { companyId, adjustment: { validFrom: form.get("validFrom"), validTo: form.get("validTo"), status: form.get("status") } })); }} className="grid gap-2 rounded-lg border p-3 md:grid-cols-6">
            <span>{version.item.code}－{version.item.name}<br />{version.unitPrice}</span>
            <input name="validFrom" type="date" defaultValue={version.validFrom} className="rounded border px-2" />
            <input name="validTo" type="date" defaultValue={version.validTo ?? ""} className="rounded border px-2" />
            <select name="status" defaultValue={version.status} className="rounded border px-2"><option value="ACTIVE">有效</option><option value="INACTIVE">停用</option></select>
            <button className="rounded border px-2 md:col-span-2">調整期間</button>
          </form>
        ))}</div>
      </section>
      <section className="rounded-2xl border bg-white p-6">
        <h2 className="text-xl font-bold">客戶價格表指派</h2>
        <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void run(() => send("/api/admin/customer-price-list-assignments", "POST", { companyId, assignment: { customerId: form.get("customerId"), priceListId: priceList.id, validFrom: form.get("validFrom"), validTo: form.get("validTo"), status: "ACTIVE" } })); }} className="mt-4 grid gap-3 md:grid-cols-4">
          <select name="customerId" required className="rounded-lg border px-3 py-2">{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.label}</option>)}</select>
          <input name="validFrom" type="date" required className="rounded-lg border px-3 py-2" />
          <input name="validTo" type="date" className="rounded-lg border px-3 py-2" />
          <button className="rounded-lg bg-slate-900 px-3 py-2 text-white">新增指派</button>
        </form>
        <div className="mt-4 space-y-3">{priceList.assignments.map((assignment) => (
          <form key={assignment.id} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void run(() => send(`/api/admin/customer-price-list-assignments/${assignment.id}`, "PATCH", { companyId, adjustment: { validFrom: form.get("validFrom"), validTo: form.get("validTo"), status: form.get("status") } })); }} className="grid gap-2 rounded-lg border p-3 md:grid-cols-5">
            <span>{assignment.customer.name}</span>
            <input name="validFrom" type="date" defaultValue={assignment.validFrom} className="rounded border px-2" />
            <input name="validTo" type="date" defaultValue={assignment.validTo ?? ""} className="rounded border px-2" />
            <select name="status" defaultValue={assignment.status} className="rounded border px-2"><option value="ACTIVE">有效</option><option value="INACTIVE">停用</option></select>
            <button className="rounded border px-2">調整期間</button>
          </form>
        ))}</div>
      </section>
    </div>
  );
}
