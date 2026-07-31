"use client";
import { useState, type FormEvent } from "react";

export function PriceListCreateClient({ companyId }: { companyId: string }) {
  const [message, setMessage] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/price-lists", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({
        companyId,
        priceList: { code: form.get("code"), name: form.get("name") },
      }),
    });
    const body = await response.json();
    if (!response.ok) return setMessage(body.error?.message ?? "操作失敗");
    window.location.assign(`/admin/pricing/${body.id}?companyId=${companyId}`);
  }
  return (
    <form onSubmit={submit} className="mt-6 grid gap-3 rounded-2xl border bg-white p-5 md:grid-cols-3">
      <h2 className="text-xl font-bold md:col-span-3">新增價格表</h2>
      {message ? <p role="alert" className="text-sm text-red-700 md:col-span-3">{message}</p> : null}
      <input name="code" required maxLength={100} placeholder="價格表代碼" className="rounded-lg border px-3 py-2" />
      <input name="name" required maxLength={200} placeholder="價格表名稱" className="rounded-lg border px-3 py-2" />
      <button className="rounded-lg bg-slate-900 px-4 py-2 text-white">建立</button>
    </form>
  );
}
