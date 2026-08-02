"use client";

import { useState, type FormEvent } from "react";
import pageStyles from "@/components/app-shell/page-contract.module.css";
import { Alert, Button, Card, Field, FormActions, Input, Section } from "@/components/ui";

export function PriceListCreateClient({ companyId }: { companyId: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    try {
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失敗");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <Section title="新增價格表" description="建立目前公司的正式價格表。">
        {message ? <Alert tone="danger" title="價格表建立失敗">{message}</Alert> : null}
        <form onSubmit={submit} className={pageStyles.formGrid}>
          <Field label="價格表代碼" required><Input name="code" required maxLength={100} /></Field>
          <Field label="價格表名稱" required><Input name="name" required maxLength={200} /></Field>
          <FormActions className={pageStyles.fullSpan} align="start" primary={<Button type="submit" pending={busy} pendingLabel="建立中…">建立價格表</Button>} />
        </form>
      </Section>
    </Card>
  );
}
