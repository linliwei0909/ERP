"use client";

import { useState, type FormEvent } from "react";
import pageStyles from "@/components/app-shell/page-contract.module.css";
import {
  Alert,
  Button,
  Card,
  Field,
  FormActions,
  Input,
  Section,
  Select,
} from "@/components/ui";

async function errorMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;
  return body?.error?.message ?? "操作失敗";
}

export function CustomerCreateClient({
  selectedCompanyId,
}: {
  selectedCompanyId: string;
}) {
  const [customerType, setCustomerType] = useState<"DOMESTIC" | "FOREIGN">(
    "DOMESTIC",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const customer =
      customerType === "DOMESTIC"
        ? {
            customerType,
            name: form.get("name"),
            taxId: form.get("taxId"),
          }
        : {
            customerType,
            name: form.get("name"),
            countryCode: form.get("countryCode"),
            foreignIdentifier: form.get("foreignIdentifier"),
          };
    try {
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          customer,
          customerCode: form.get("customerCode"),
        }),
      });
      if (!response.ok) {
        setMessage(await errorMessage(response));
        return;
      }
      const result = (await response.json()) as { id: string };
      window.location.assign(
        `/admin/customers/${result.id}?companyId=${selectedCompanyId}`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Section title="建立客戶" description="建立客戶基本資料與目前公司的客戶代碼。">
      {message ? <Alert tone="danger" title="無法建立客戶">{message}</Alert> : null}
      <form onSubmit={submit} className={pageStyles.formGrid}>
        <Field label="客戶類型">
          <Select
            value={customerType}
            onChange={(event) =>
              setCustomerType(event.target.value as "DOMESTIC" | "FOREIGN")
            }
          >
            <option value="DOMESTIC">境內</option>
            <option value="FOREIGN">境外</option>
          </Select>
        </Field>
        <Field label="公司客戶代碼" required>
          <Input name="customerCode" required maxLength={50} />
        </Field>
        <Field label="客戶名稱" required className={pageStyles.fullSpan}>
          <Input name="name" required maxLength={200} />
        </Field>
        {customerType === "DOMESTIC" ? (
          <Field label="統一編號" description="可留空。">
            <Input name="taxId" maxLength={32} />
          </Field>
        ) : (
          <>
            <Field label="國別碼" required>
              <Input name="countryCode" required minLength={2} maxLength={2} className="uppercase" />
            </Field>
            <Field label="境外識別碼" required>
              <Input name="foreignIdentifier" required maxLength={100} />
            </Field>
          </>
        )}
        <FormActions
          className={pageStyles.fullSpan}
          align="start"
          primary={<Button type="submit" pending={busy} pendingLabel="建立中…">建立客戶</Button>}
        />
      </form>
      </Section>
    </Card>
  );
}
