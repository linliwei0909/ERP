"use client";

import { useState } from "react";

type FreightRuleValue = {
  id: string;
  customerId: string;
  deliveryLocationId: string;
  mode: "NO_CHARGE" | "QUANTITY_BASED" | "FIXED_PER_LOCATION";
  unitFreight: string | null;
  fixedFreight: string | null;
  validFrom: string;
  validTo: string | null;
  status: "ACTIVE" | "INACTIVE";
};

export function FreightRuleEditor({
  companyId,
  value,
}: {
  companyId: string;
  value: FreightRuleValue;
}) {
  const [mode, setMode] = useState(value.mode);
  const [message, setMessage] = useState("");

  return (
    <form
      className="mt-8 grid gap-4 rounded-2xl border bg-white p-6 md:grid-cols-2"
      onSubmit={async (event) => {
        event.preventDefault();
        setMessage("");
        const form = new FormData(event.currentTarget);
        const response = await fetch(`/api/admin/freight-rules/${value.id}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "idempotency-key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            companyId,
            freightRule: {
              customerId: value.customerId,
              deliveryLocationId: value.deliveryLocationId,
              mode,
              unitFreight:
                mode === "QUANTITY_BASED" ? form.get("unitFreight") : null,
              fixedFreight:
                mode === "FIXED_PER_LOCATION"
                  ? form.get("fixedFreight")
                  : null,
              validFrom: form.get("validFrom"),
              validTo: form.get("validTo") || null,
              status: form.get("status"),
            },
          }),
        });
        const payload = await response.json();
        setMessage(
          response.ok ? "已更新運費規則" : payload.error?.message ?? "更新失敗",
        );
        if (response.ok) window.location.reload();
      }}
    >
      <label className="text-sm">
        計價方式
        <select
          value={mode}
          onChange={(event) =>
            setMode(
              event.target.value as
                | "NO_CHARGE"
                | "QUANTITY_BASED"
                | "FIXED_PER_LOCATION",
            )
          }
          className="mt-1 w-full rounded-lg border px-3 py-2"
        >
          <option value="NO_CHARGE">不收運費</option>
          <option value="QUANTITY_BASED">按數量收費</option>
          <option value="FIXED_PER_LOCATION">地點固定金額</option>
        </select>
      </label>
      {mode === "QUANTITY_BASED" ? (
        <label className="text-sm">
          每單位運費（元）
          <input
            name="unitFreight"
            defaultValue={value.unitFreight ?? ""}
            required
            inputMode="numeric"
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
      ) : null}
      {mode === "FIXED_PER_LOCATION" ? (
        <label className="text-sm">
          固定運費（元）
          <input
            name="fixedFreight"
            defaultValue={value.fixedFreight ?? ""}
            required
            inputMode="numeric"
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
      ) : null}
      <label className="text-sm">
        生效日
        <input
          name="validFrom"
          type="date"
          defaultValue={value.validFrom}
          required
          className="mt-1 w-full rounded-lg border px-3 py-2"
        />
      </label>
      <label className="text-sm">
        失效日（不含）
        <input
          name="validTo"
          type="date"
          defaultValue={value.validTo ?? ""}
          className="mt-1 w-full rounded-lg border px-3 py-2"
        />
      </label>
      <label className="text-sm">
        狀態
        <select
          name="status"
          defaultValue={value.status}
          className="mt-1 w-full rounded-lg border px-3 py-2"
        >
          <option value="ACTIVE">有效</option>
          <option value="INACTIVE">停用</option>
        </select>
      </label>
      <div className="flex items-end">
        <button className="rounded-lg bg-teal-700 px-4 py-2 text-white">
          儲存
        </button>
      </div>
      {message ? (
        <p className="text-sm text-slate-700 md:col-span-2">{message}</p>
      ) : null}
    </form>
  );
}
