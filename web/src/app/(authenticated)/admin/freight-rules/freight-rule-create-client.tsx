"use client";

import { useState } from "react";
import pageStyles from "@/components/app-shell/page-contract.module.css";
import { Alert, Button, Card, Field, FormActions, Input, Section, Select } from "@/components/ui";

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
  const [busy, setBusy] = useState(false);

  return (
    <Card><Section title="新增運費規則" description="失效日採不含該日的既有期間規則。"><form
      className={pageStyles.formGrid}
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setMessage("");
        const form = new FormData(event.currentTarget);
        const location = locations.find(
          (entry) => entry.id === form.get("deliveryLocationId"),
        );
        if (!location) {
          setMessage("請選擇送貨地點");
          setBusy(false);
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
          setBusy(false);
          return;
        }
        window.location.reload();
      }}
    >
      {message ? <Alert tone="danger" title="新增失敗">{message}</Alert> : null}
      <Field label="客戶與送貨地點" required><Select
          name="deliveryLocationId"
          required
        >
          <option value="">請選擇</option>
          {locations.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </Select></Field>
      <Field label="計價方式"><Select
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
        >
          <option value="NO_CHARGE">不收運費</option>
          <option value="QUANTITY_BASED">按數量收費</option>
          <option value="FIXED_PER_LOCATION">地點固定金額</option>
        </Select></Field>
      {mode === "QUANTITY_BASED" ? (
        <Field label="每單位運費（元）" required><Input
            name="unitFreight"
            inputMode="numeric"
            required
          /></Field>
      ) : null}
      {mode === "FIXED_PER_LOCATION" ? (
        <Field label="固定運費（元）" required><Input
            name="fixedFreight"
            inputMode="numeric"
            required
          /></Field>
      ) : null}
      <Field label="生效日" required><Input
          name="validFrom"
          type="date"
          required
        /></Field>
      <Field label="失效日（不含）"><Input
          name="validTo"
          type="date"
        /></Field>
      <FormActions className={pageStyles.fullSpan} align="start" primary={<Button type="submit" pending={busy} pendingLabel="新增中…">新增規則</Button>} />
    </form></Section></Card>
  );
}
