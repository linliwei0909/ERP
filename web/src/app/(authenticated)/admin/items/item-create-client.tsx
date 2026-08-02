"use client";

import { useState, type FormEvent } from "react";
import pageStyles from "@/components/app-shell/page-contract.module.css";
import {
  Button,
  Checkbox,
  ErrorSummary,
  Field,
  FormActions,
  Input,
  Section,
  Select,
  Textarea,
} from "@/components/ui";

async function errorMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;
  return body?.error?.message ?? "操作失敗";
}

export function ItemCreateClient({
  selectedCompanyId,
}: {
  selectedCompanyId: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/items", {
        method: "POST",
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
            purchaseEnabled: false,
            inventoryEnabled: false,
            productionEnabled: false,
          },
          companyRelation: {
            companyItemCode: form.get("companyItemCode"),
            salesEnabled: form.get("companySalesEnabled") === "on",
            status: "ACTIVE",
          },
        }),
      });
      if (!response.ok) {
        setMessage(await errorMessage(response));
        return;
      }
      const result = (await response.json()) as { id: string };
      window.location.assign(
        `/admin/items/${result.id}?companyId=${selectedCompanyId}`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="建立品項" description="建立全系統品項及目前公司的品項關聯。">
      {message ? (
        <ErrorSummary title="品項建立失敗" message={message} />
      ) : null}
      <form onSubmit={submit} className={pageStyles.formGrid}>
        <Field label="品項類型">
          <Select name="itemType">
            <option value="PRODUCT">產品</option>
            <option value="RAW_MATERIAL">原物料</option>
          </Select>
        </Field>
        <Field label="公司品項代碼" required>
          <Input
            name="companyItemCode"
            required
            maxLength={100}
          />
        </Field>
        <Field label="全系統品項代碼" required>
          <Input
            name="code"
            required
            maxLength={100}
          />
        </Field>
        <Field label="品項名稱" required>
          <Input
            name="name"
            required
            maxLength={200}
          />
        </Field>
        <Field label="基本單位" required>
          <Input
            name="baseUnit"
            required
            maxLength={50}
          />
        </Field>
        <Field label="條碼（可空白）">
          <Input name="barcode" maxLength={100} />
        </Field>
        <Field label="規格" className={pageStyles.fullSpan}>
          <Textarea name="specification" rows={2} />
        </Field>
        <Field label="說明" className={pageStyles.fullSpan}>
          <Textarea name="description" rows={2} />
        </Field>
        <div className={`${pageStyles.checkboxGrid} ${pageStyles.fullSpan}`}>
          <Checkbox name="salesEnabled" label="品項允許銷售" />
          <Checkbox name="companySalesEnabled" label="此公司允許銷售" />
        </div>
        <FormActions
          className={pageStyles.fullSpan}
          align="start"
          primary={
            <Button type="submit" pending={busy} pendingLabel="建立中…">
              建立品項
            </Button>
          }
        />
      </form>
    </Section>
  );
}
