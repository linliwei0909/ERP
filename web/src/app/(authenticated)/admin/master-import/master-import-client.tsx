"use client";

import { useState } from "react";
import pageStyles from "@/components/app-shell/page-contract.module.css";
import { Alert, Button, Card, ConfirmDialog, Field, FormActions, Input, Section, Select } from "@/components/ui";
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [form, setForm] = useState<HTMLFormElement | null>(null);
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
    <Card><Section title="建立匯入批次" description="先執行 dry-run；只有既有 importer 可執行正式匯入。"><form
      className={pageStyles.formGrid}
      onSubmit={(event) => {
        event.preventDefault();
        void submit(event.currentTarget, true);
      }}
    >
      {message ? <Alert tone="danger" title="匯入處理失敗">{message}</Alert> : null}
      <Field label="來源系統" required><Input
          name="sourceSystem"
          defaultValue="RAGIC"
          required
          maxLength={50}
        /></Field>
      <Field label="Entity"><Select
          name="entityType"
          value={entityType}
          onChange={(event) =>
            setEntityType(event.target.value as keyof typeof entityLabels)
          }
        >
          {Object.entries(entityLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select></Field>
      <Field label="CSV 檔案" required className={pageStyles.fullSpan}><Input
          name="file"
          type="file"
          accept=".csv,text/csv"
          required
        /></Field>
      <Alert tone="info" className={pageStyles.fullSpan} title="執行範圍">
        Dry-run 不寫入正式主檔。正式匯入目前僅開放客戶、客戶公司關係、品項與品項公司關係；其餘六類只提供契約驗證。
      </Alert>
      <FormActions className={pageStyles.fullSpan} align="start" primary={<Button type="submit" pending={submitting} pendingLabel="執行中…">執行 Dry-run</Button>} secondary={<Button type="button" variant="secondary" disabled={submitting || !executable} onClick={(event) => { setForm(event.currentTarget.form); setConfirmOpen(true); }}>確認正式匯入</Button>} />
    </form></Section><ConfirmDialog open={confirmOpen} title="確認正式匯入" description="正式匯入會寫入核准範圍內的主檔資料，確定繼續？" confirmLabel="執行正式匯入" pending={submitting} onCancel={() => setConfirmOpen(false)} onConfirm={() => { if (form) void submit(form, false); }} /></Card>
  );
}
