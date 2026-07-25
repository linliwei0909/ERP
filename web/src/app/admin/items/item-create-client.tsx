"use client";

import { useState, type FormEvent } from "react";

async function errorMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;
  return body?.error?.message ?? "操作失敗";
}

export function ItemCreateClient({
  selectedCompanyId,
}: {
  selectedCompanyId: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/items", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        companyId: selectedCompanyId,
        item: {
          code: form.get("code"),
          name: form.get("name"),
          description: form.get("description"),
          specification: form.get("specification"),
          baseUnit: form.get("baseUnit"),
          barcode: form.get("barcode"),
          itemType: form.get("itemType"),
          salesEnabled: form.get("salesEnabled") === "on",
          purchaseEnabled: false,
          inventoryEnabled: false,
          productionEnabled: false,
        },
        companyRelation: {
          companyItemCode: form.get("companyItemCode"),
          salesEnabled: form.get("companySalesEnabled") === "on",
          status: "ACTIVE",
        },
      }),
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      setBusy(false);
      return;
    }
    const result = (await response.json()) as { id: string };
    window.location.assign(
      `/admin/items/${result.id}?companyId=${selectedCompanyId}`,
    );
  }

  return (
    <section className="mt-6 rounded-2xl border bg-white p-6">
      <h2 className="text-xl font-bold">建立品項</h2>
      {message ? (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {message}
        </p>
      ) : null}
      <form onSubmit={submit} className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium">
          品項類型
          <select
            name="itemType"
            className="mt-1 w-full rounded-lg border px-3 py-2"
          >
            <option value="PRODUCT">產品</option>
            <option value="RAW_MATERIAL">原物料</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          公司品項代碼
          <input
            name="companyItemCode"
            required
            maxLength={100}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium">
          全系統品項代碼
          <input
            name="code"
            required
            maxLength={100}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium">
          品項名稱
          <input
            name="name"
            required
            maxLength={200}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium">
          基本單位
          <input
            name="baseUnit"
            required
            maxLength={50}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium">
          條碼（可空白）
          <input
            name="barcode"
            maxLength={100}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium md:col-span-2">
          規格
          <textarea
            name="specification"
            rows={2}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium md:col-span-2">
          說明
          <textarea
            name="description"
            rows={2}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input name="salesEnabled" type="checkbox" />
          品項允許銷售
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input name="companySalesEnabled" type="checkbox" />
          此公司允許銷售
        </label>
        <button
          disabled={busy}
          className="rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-50 md:col-span-2 md:justify-self-start"
        >
          {busy ? "建立中…" : "建立品項"}
        </button>
      </form>
    </section>
  );
}
