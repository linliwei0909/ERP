"use client";

import { useState, type FormEvent } from "react";

type CompanyOption = { id: string; code: string; name: string };
type ItemRelation = {
  id: string;
  companyId: string;
  companyItemCode: string;
  salesEnabled: boolean;
  status: "ACTIVE" | "INACTIVE";
  company: { code: string; name: string };
};

export type ManagedItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  specification: string | null;
  baseUnit: string;
  barcode: string | null;
  itemType: "PRODUCT" | "RAW_MATERIAL";
  salesEnabled: boolean;
  purchaseEnabled: boolean;
  inventoryEnabled: boolean;
  productionEnabled: boolean;
  status: "ACTIVE" | "INACTIVE";
  companyRelations: ItemRelation[];
};

async function responseMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;
  return body?.error?.message ?? "操作失敗";
}

export function ItemManagerClient({
  item,
  companies,
  selectedCompanyId,
}: {
  item: ManagedItem;
  companies: CompanyOption[];
  selectedCompanyId: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function updateItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/items/${item.id}`, {
      method: "PATCH",
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
          purchaseEnabled: item.purchaseEnabled,
          inventoryEnabled: item.inventoryEnabled,
          productionEnabled: item.productionEnabled,
          status: form.get("status"),
        },
      }),
    });
    if (!response.ok) {
      setMessage(await responseMessage(response));
      setBusy(false);
      return;
    }
    window.location.reload();
  }

  async function saveCompanyRelation(
    event: FormEvent<HTMLFormElement>,
    companyId: string,
  ) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/items/${item.id}/companies`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        companyId,
        relation: {
          companyItemCode: form.get("companyItemCode"),
          salesEnabled: form.get("salesEnabled") === "on",
          status: form.get("status"),
        },
      }),
    });
    if (!response.ok) {
      setMessage(await responseMessage(response));
      setBusy(false);
      return;
    }
    window.location.reload();
  }

  return (
    <div className="mt-6 space-y-6">
      {message ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {message}
        </p>
      ) : null}

      <form
        onSubmit={updateItem}
        className="grid gap-4 rounded-2xl border bg-white p-6 md:grid-cols-2"
      >
        <h2 className="text-xl font-bold md:col-span-2">品項資料</h2>
        <label className="text-sm font-medium">
          品項類型
          <select
            name="itemType"
            defaultValue={item.itemType}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          >
            <option value="PRODUCT">產品</option>
            <option value="RAW_MATERIAL">原物料</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          狀態
          <select
            name="status"
            defaultValue={item.status}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          >
            <option value="ACTIVE">有效</option>
            <option value="INACTIVE">停用</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          品項代碼
          <input
            name="code"
            required
            maxLength={100}
            defaultValue={item.code}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium">
          品項名稱
          <input
            name="name"
            required
            maxLength={200}
            defaultValue={item.name}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium">
          基本單位
          <input
            name="baseUnit"
            required
            maxLength={50}
            defaultValue={item.baseUnit}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium">
          條碼（可空白）
          <input
            name="barcode"
            maxLength={100}
            defaultValue={item.barcode ?? ""}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium md:col-span-2">
          規格
          <textarea
            name="specification"
            rows={2}
            defaultValue={item.specification ?? ""}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium md:col-span-2">
          說明
          <textarea
            name="description"
            rows={2}
            defaultValue={item.description ?? ""}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            name="salesEnabled"
            type="checkbox"
            defaultChecked={item.salesEnabled}
          />
          品項允許銷售
        </label>
        <button
          disabled={busy}
          className="rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-50 md:col-span-2 md:justify-self-start"
        >
          儲存品項
        </button>
      </form>

      <section className="rounded-2xl border bg-white p-6">
        <h2 className="text-xl font-bold">公司授權</h2>
        <p className="mt-1 text-sm text-slate-500">
          品項與公司關係皆有效且兩層均允許銷售時，才會出現在可銷售清單。
        </p>
        <div className="mt-4 space-y-4">
          {companies.map((company) => {
            const relation = item.companyRelations.find(
              (entry) => entry.companyId === company.id,
            );
            return (
              <form
                key={company.id}
                onSubmit={(event) => saveCompanyRelation(event, company.id)}
                className="grid gap-3 rounded-xl border p-4 md:grid-cols-4"
              >
                <div className="font-semibold">
                  {company.code}－{company.name}
                </div>
                <input
                  name="companyItemCode"
                  required
                  maxLength={100}
                  defaultValue={relation?.companyItemCode ?? ""}
                  placeholder="公司品項代碼"
                  className="rounded-lg border px-3 py-2"
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    name="salesEnabled"
                    type="checkbox"
                    defaultChecked={relation?.salesEnabled ?? false}
                  />
                  此公司允許銷售
                </label>
                <select
                  name="status"
                  defaultValue={relation?.status ?? "ACTIVE"}
                  className="rounded-lg border px-3 py-2"
                >
                  <option value="ACTIVE">有效</option>
                  <option value="INACTIVE">停用</option>
                </select>
                <button
                  disabled={busy}
                  className="rounded-lg border px-3 py-2 text-sm md:col-start-4"
                >
                  {relation ? "更新關係" : "建立關係"}
                </button>
              </form>
            );
          })}
        </div>
      </section>
    </div>
  );
}
