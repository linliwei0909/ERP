"use client";

import { useState } from "react";
import { IMPLEMENTED_IMPORTERS } from "@/lib/master-import/contracts";

const entityLabels = {
  customers: "客戶",
  customer_companies: "客戶公司關係",
  customer_contacts: "客戶聯絡人",
  delivery_locations: "送貨地點",
  items: "品項",
  item_companies: "品項公司關係",
  price_lists: "價格表",
  item_prices: "價格明細",
  customer_price_list_assignments: "客戶價格表指派",
  freight_rules: "運費規則",
} as const;

export function MasterImportClient({
  companyId,
}: {
  companyId: string;
}) {
  const [entityType, setEntityType] =
    useState<keyof typeof entityLabels>("customers");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const executable = IMPLEMENTED_IMPORTERS.includes(
    entityType as (typeof IMPLEMENTED_IMPORTERS)[number],
  );

  async function submit(form: HTMLFormElement, dryRun: boolean) {
    setMessage("");
    setSubmitting(true);
    try {
      const body = new FormData(form);
      body.set("companyId", companyId);
      body.set("entityType", entityType);
      body.set("dryRun", String(dryRun));
      const response = await fetch("/api/admin/master-import/batches", {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body,
      });
      const payload = await response.json();
      if (!response.ok) {
        setMessage(payload.error?.message ?? "匯入處理失敗");
        return;
      }
      window.location.href = `/admin/master-import/${payload.batch.id}?companyId=${companyId}`;
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="mt-6 grid gap-4 rounded-2xl border bg-white p-6 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(event.currentTarget, true);
      }}
    >
      <h2 className="text-lg font-semibold md:col-span-2">建立匯入批次</h2>
      <label className="text-sm">
        來源系統
        <input
          name="sourceSystem"
          defaultValue="RAGIC"
          required
          maxLength={50}
          className="mt-1 w-full rounded-lg border px-3 py-2"
        />
      </label>
      <label className="text-sm">
        Entity
        <select
          name="entityType"
          value={entityType}
          onChange={(event) =>
            setEntityType(event.target.value as keyof typeof entityLabels)
          }
          className="mt-1 w-full rounded-lg border px-3 py-2"
        >
          {Object.entries(entityLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm md:col-span-2">
        CSV 檔案
        <input
          name="file"
          type="file"
          accept=".csv,text/csv"
          required
          className="mt-1 block w-full rounded-lg border px-3 py-2"
        />
      </label>
      <p className="text-sm text-slate-600 md:col-span-2">
        Dry-run 不寫入正式主檔。正式匯入目前僅開放客戶、客戶公司關係、品項與品項公司關係；其餘六類只提供契約驗證。
      </p>
      <div className="flex gap-3 md:col-span-2">
        <button
          disabled={submitting}
          className="rounded-lg border border-teal-700 px-4 py-2 text-teal-800 disabled:opacity-50"
        >
          執行 Dry-run
        </button>
        <button
          type="button"
          disabled={submitting || !executable}
          onClick={(event) => {
            const form = event.currentTarget.form;
            if (form && window.confirm("確認執行正式匯入？")) {
              void submit(form, false);
            }
          }}
          className="rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-40"
        >
          確認正式匯入
        </button>
      </div>
      {message ? (
        <p className="text-sm text-red-700 md:col-span-2">{message}</p>
      ) : null}
    </form>
  );
}
