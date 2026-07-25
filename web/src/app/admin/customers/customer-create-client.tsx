"use client";

import { useState, type FormEvent } from "react";

async function errorMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;
  return body?.error?.message ?? "操作失敗";
}

export function CustomerCreateClient({
  selectedCompanyId,
}: {
  selectedCompanyId: string;
}) {
  const [customerType, setCustomerType] = useState<"DOMESTIC" | "FOREIGN">(
    "DOMESTIC",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const customer =
      customerType === "DOMESTIC"
        ? {
            customerType,
            name: form.get("name"),
            taxId: form.get("taxId"),
          }
        : {
            customerType,
            name: form.get("name"),
            countryCode: form.get("countryCode"),
            foreignIdentifier: form.get("foreignIdentifier"),
          };
    const response = await fetch("/api/customers", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        companyId: selectedCompanyId,
        customer,
        customerCode: form.get("customerCode"),
      }),
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      setBusy(false);
      return;
    }
    const result = (await response.json()) as { id: string };
    window.location.assign(
      `/admin/customers/${result.id}?companyId=${selectedCompanyId}`,
    );
  }

  return (
    <section className="mt-6 rounded-2xl border bg-white p-6">
      <h2 className="text-xl font-bold">建立客戶</h2>
      {message ? <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{message}</p> : null}
      <form onSubmit={submit} className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium">
          客戶類型
          <select
            value={customerType}
            onChange={(event) =>
              setCustomerType(event.target.value as "DOMESTIC" | "FOREIGN")
            }
            className="mt-1 w-full rounded-lg border px-3 py-2"
          >
            <option value="DOMESTIC">境內</option>
            <option value="FOREIGN">境外</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          公司客戶代碼
          <input name="customerCode" required maxLength={50} className="mt-1 w-full rounded-lg border px-3 py-2" />
        </label>
        <label className="text-sm font-medium md:col-span-2">
          客戶名稱
          <input name="name" required maxLength={200} className="mt-1 w-full rounded-lg border px-3 py-2" />
        </label>
        {customerType === "DOMESTIC" ? (
          <label className="text-sm font-medium">
            統一編號（可空白）
            <input name="taxId" maxLength={32} className="mt-1 w-full rounded-lg border px-3 py-2" />
          </label>
        ) : (
          <>
            <label className="text-sm font-medium">
              國別碼
              <input name="countryCode" required minLength={2} maxLength={2} className="mt-1 w-full rounded-lg border px-3 py-2 uppercase" />
            </label>
            <label className="text-sm font-medium">
              境外識別碼
              <input name="foreignIdentifier" required maxLength={100} className="mt-1 w-full rounded-lg border px-3 py-2" />
            </label>
          </>
        )}
        <button disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-50 md:col-span-2 md:justify-self-start">
          {busy ? "建立中…" : "建立客戶"}
        </button>
      </form>
    </section>
  );
}
