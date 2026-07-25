"use client";

import { useState } from "react";

type LocationOption = {
  id: string;
  customerId: string;
  label: string;
};

export function FreightRuleCreateClient({
  companyId,
  locations,
}: {
  companyId: string;
  locations: LocationOption[];
}) {
  const [mode, setMode] = useState<
    "NO_CHARGE" | "QUANTITY_BASED" | "FIXED_PER_LOCATION"
  >("NO_CHARGE");
  const [message, setMessage] = useState("");

  return (
    <form
      className="mt-6 grid gap-3 rounded-2xl border bg-white p-5 md:grid-cols-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setMessage("");
        const form = new FormData(event.currentTarget);
        const location = locations.find(
          (entry) => entry.id === form.get("deliveryLocationId"),
        );
        if (!location) {
          setMessage("請選擇送貨地點");
          return;
        }
        const response = await fetch("/api/admin/freight-rules", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            companyId,
            freightRule: {
              customerId: location.customerId,
              deliveryLocationId: location.id,
              mode,
              unitFreight:
                mode === "QUANTITY_BASED" ? form.get("unitFreight") : null,
              fixedFreight:
                mode === "FIXED_PER_LOCATION"
                  ? form.get("fixedFreight")
                  : null,
              validFrom: form.get("validFrom"),
              validTo: form.get("validTo") || null,
              status: "ACTIVE",
            },
          }),
        });
        const payload = await response.json();
        if (!response.ok) {
          setMessage(payload.error?.message ?? "新增失敗");
          return;
        }
        window.location.reload();
      }}
    >
      <h2 className="text-lg font-semibold md:col-span-3">新增運費規則</h2>
      <label className="text-sm">
        客戶與送貨地點
        <select
          name="deliveryLocationId"
          required
          className="mt-1 w-full rounded-lg border px-3 py-2"
        >
          <option value="">請選擇</option>
          {locations.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        計價方式
        <select
          name="mode"
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
            inputMode="numeric"
            required
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
      ) : null}
      {mode === "FIXED_PER_LOCATION" ? (
        <label className="text-sm">
          固定運費（元）
          <input
            name="fixedFreight"
            inputMode="numeric"
            required
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
      ) : null}
      <label className="text-sm">
        生效日
        <input
          name="validFrom"
          type="date"
          required
          className="mt-1 w-full rounded-lg border px-3 py-2"
        />
      </label>
      <label className="text-sm">
        失效日（不含）
        <input
          name="validTo"
          type="date"
          className="mt-1 w-full rounded-lg border px-3 py-2"
        />
      </label>
      <div className="flex items-end">
        <button className="rounded-lg bg-teal-700 px-4 py-2 text-white">
          新增規則
        </button>
      </div>
      {message ? (
        <p className="text-sm text-red-700 md:col-span-3">{message}</p>
      ) : null}
    </form>
  );
}
