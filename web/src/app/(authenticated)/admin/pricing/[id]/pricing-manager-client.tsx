"use client";

import { useState, type FormEvent } from "react";
import pageStyles from "@/components/app-shell/page-contract.module.css";
import { Alert, Button, Card, EmptyState, Field, FormActions, Input, Section, Select, StatusBadge } from "@/components/ui";
import pricingStyles from "../pricing-ui.module.css";

type Option = { id: string; label: string };
type Version = { id: string; itemId: string; unitPrice: string; validFrom: string; validTo: string | null; status: "ACTIVE" | "INACTIVE"; item: { code: string; name: string } };
type Assignment = { id: string; customerId: string; validFrom: string; validTo: string | null; status: "ACTIVE" | "INACTIVE"; customer: { name: string } };
export type ManagedPriceList = { id: string; code: string; name: string; status: "ACTIVE" | "INACTIVE"; itemPrices: Version[]; assignments: Assignment[] };

async function send(url: string, method: string, body: unknown) {
  const response = await fetch(url, { method, headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? "操作失敗");
  return result;
}

export function PricingManagerClient({ priceList, companyId, items, customers }: {
  priceList: ManagedPriceList; companyId: string; items: Option[]; customers: Option[];
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setMessage(null);
    try { await action(); window.location.reload(); } catch (error) { setMessage(error instanceof Error ? error.message : "操作失敗"); setBusy(false); }
  }
  return (
    <div className={pageStyles.pageStack}>
      {message ? <Alert tone="danger" title="操作失敗">{message}</Alert> : null}

      <Card>
        <Section title="價格表資料" description="維持既有價格表代碼、名稱與有效狀態。">
          <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); void run(() => send(`/api/admin/price-lists/${priceList.id}`, "PATCH", { companyId, priceList: { code: form.get("code"), name: form.get("name"), status: form.get("status") } })); }} className={pageStyles.formGrid}>
            <Field label="價格表代碼" required><Input name="code" required defaultValue={priceList.code} /></Field>
            <Field label="價格表名稱" required><Input name="name" required defaultValue={priceList.name} /></Field>
            <Field label="狀態"><Select name="status" defaultValue={priceList.status}><option value="ACTIVE">有效</option><option value="INACTIVE">停用</option></Select></Field>
            <FormActions className={pageStyles.fullSpan} align="start" primary={<Button type="submit" pending={busy} pendingLabel="儲存中…">儲存價格表</Button>} />
          </form>
        </Section>
      </Card>

      <Card>
        <Section title="品項價格版本" description="有效期間與重疊限制由既有 pricing domain 規則驗證。">
          <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void run(() => send(`/api/admin/price-lists/${priceList.id}/prices`, "POST", { companyId, price: { itemId: form.get("itemId"), unitPrice: form.get("unitPrice"), validFrom: form.get("validFrom"), validTo: form.get("validTo"), status: "ACTIVE" } })); }} className={pricingStyles.createGrid}>
            <Field label="品項" required><Select name="itemId" required>{items.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</Select></Field>
            <Field label="未稅單價" required><Input name="unitPrice" required inputMode="decimal" /></Field>
            <Field label="生效日" required><Input name="validFrom" type="date" required /></Field>
            <Field label="結束日"><Input name="validTo" type="date" /></Field>
            <FormActions className={pageStyles.fullSpan} align="start" primary={<Button type="submit" pending={busy} pendingLabel="新增中…">新增版本</Button>} />
          </form>
          <div className={pricingStyles.recordStack}>
            {priceList.itemPrices.length > 0 ? priceList.itemPrices.map((version) => (
              <form key={version.id} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void run(() => send(`/api/admin/item-prices/${version.id}`, "PATCH", { companyId, adjustment: { validFrom: form.get("validFrom"), validTo: form.get("validTo"), status: form.get("status") } })); }} className={pricingStyles.recordGrid}>
                <div className={pricingStyles.recordSummary}><strong>{version.item.code}－{version.item.name}</strong><span>{version.unitPrice}</span><StatusBadge label={version.status === "ACTIVE" ? "有效" : "停用"} tone={version.status === "ACTIVE" ? "success" : "neutral"} /></div>
                <Field label="生效日"><Input name="validFrom" type="date" defaultValue={version.validFrom} /></Field>
                <Field label="結束日"><Input name="validTo" type="date" defaultValue={version.validTo ?? ""} /></Field>
                <Field label="狀態"><Select name="status" defaultValue={version.status}><option value="ACTIVE">有效</option><option value="INACTIVE">停用</option></Select></Field>
                <FormActions className={pageStyles.fullSpan} align="start" primary={<Button type="submit" variant="secondary" pending={busy} pendingLabel="調整中…">調整期間</Button>} />
              </form>
            )) : <EmptyState variant="no-data" title="尚無品項價格版本" />}
          </div>
        </Section>
      </Card>

      <Card>
        <Section title="客戶價格表指派" description="指派期間與重疊限制由既有 pricing domain 規則驗證。">
          <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void run(() => send("/api/admin/customer-price-list-assignments", "POST", { companyId, assignment: { customerId: form.get("customerId"), priceListId: priceList.id, validFrom: form.get("validFrom"), validTo: form.get("validTo"), status: "ACTIVE" } })); }} className={pricingStyles.assignmentGrid}>
            <Field label="客戶" required><Select name="customerId" required>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.label}</option>)}</Select></Field>
            <Field label="生效日" required><Input name="validFrom" type="date" required /></Field>
            <Field label="結束日"><Input name="validTo" type="date" /></Field>
            <FormActions className={pageStyles.fullSpan} align="start" primary={<Button type="submit" pending={busy} pendingLabel="新增中…">新增指派</Button>} />
          </form>
          <div className={pricingStyles.recordStack}>
            {priceList.assignments.length > 0 ? priceList.assignments.map((assignment) => (
              <form key={assignment.id} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void run(() => send(`/api/admin/customer-price-list-assignments/${assignment.id}`, "PATCH", { companyId, adjustment: { validFrom: form.get("validFrom"), validTo: form.get("validTo"), status: form.get("status") } })); }} className={pricingStyles.recordGrid}>
                <div className={pricingStyles.recordSummary}><strong>{assignment.customer.name}</strong><StatusBadge label={assignment.status === "ACTIVE" ? "有效" : "停用"} tone={assignment.status === "ACTIVE" ? "success" : "neutral"} /></div>
                <Field label="生效日"><Input name="validFrom" type="date" defaultValue={assignment.validFrom} /></Field>
                <Field label="結束日"><Input name="validTo" type="date" defaultValue={assignment.validTo ?? ""} /></Field>
                <Field label="狀態"><Select name="status" defaultValue={assignment.status}><option value="ACTIVE">有效</option><option value="INACTIVE">停用</option></Select></Field>
                <FormActions className={pageStyles.fullSpan} align="start" primary={<Button type="submit" variant="secondary" pending={busy} pendingLabel="調整中…">調整期間</Button>} />
              </form>
            )) : <EmptyState variant="no-data" title="尚無客戶價格表指派" />}
          </div>
        </Section>
      </Card>
    </div>
  );
}
