"use client";

import { useState } from "react";
import pageStyles from "@/components/app-shell/page-contract.module.css";
import { Alert, Button, Card, Field, FormActions, Input, Section, Select } from "@/components/ui";

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
  const [busy, setBusy] = useState(false);

  return (
    <Card><Section title="規則資料" description="保留既有運費模式、金額與 half-open 有效期間。"><form
      className={pageStyles.formGrid}
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
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
        if (!response.ok) setBusy(false);
        if (response.ok) window.location.reload();
      }}
    >
      {message ? <Alert tone={message === "已更新運費規則" ? "success" : "danger"} title={message === "已更新運費規則" ? "更新成功" : "更新失敗"}>{message}</Alert> : null}
      <Field label="計價方式"><Select
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
            defaultValue={value.unitFreight ?? ""}
            required
            inputMode="numeric"
          /></Field>
      ) : null}
      {mode === "FIXED_PER_LOCATION" ? (
        <Field label="固定運費（元）" required><Input
            name="fixedFreight"
            defaultValue={value.fixedFreight ?? ""}
            required
            inputMode="numeric"
          /></Field>
      ) : null}
      <Field label="生效日" required><Input
          name="validFrom"
          type="date"
          defaultValue={value.validFrom}
          required
        /></Field>
      <Field label="失效日（不含）"><Input
          name="validTo"
          type="date"
          defaultValue={value.validTo ?? ""}
        /></Field>
      <Field label="狀態"><Select
          name="status"
          defaultValue={value.status}
        >
          <option value="ACTIVE">有效</option>
          <option value="INACTIVE">停用</option>
        </Select></Field>
      <FormActions className={pageStyles.fullSpan} align="start" primary={<Button type="submit" pending={busy} pendingLabel="儲存中…">儲存規則</Button>} />
    </form></Section></Card>
  );
}
