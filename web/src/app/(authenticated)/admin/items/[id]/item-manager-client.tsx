"use client";

import { useState, type FormEvent } from "react";
import pageStyles from "@/components/app-shell/page-contract.module.css";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Field,
  FormActions,
  Input,
  Section,
  Select,
  StatusBadge,
  Textarea,
} from "@/components/ui";
import itemStyles from "../../../items/item-ui.module.css";

type CompanyOption = { id: string; code: string; name: string };
type ItemRelation = {
  id: string;
  companyId: string;
  companyItemCode: string;
  salesEnabled: boolean;
  status: "ACTIVE" | "INACTIVE";
  company: { code: string; name: string };
};

export type ManagedItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  specification: string | null;
  baseUnit: string;
  barcode: string | null;
  itemType: "PRODUCT" | "RAW_MATERIAL";
  salesEnabled: boolean;
  purchaseEnabled: boolean;
  inventoryEnabled: boolean;
  productionEnabled: boolean;
  status: "ACTIVE" | "INACTIVE";
  companyRelations: ItemRelation[];
};

async function responseMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;
  return body?.error?.message ?? "操作失敗";
}

export function ItemManagerClient({
  item,
  companies,
  selectedCompanyId,
}: {
  item: ManagedItem;
  companies: CompanyOption[];
  selectedCompanyId: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function updateItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
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
            purchaseEnabled: item.purchaseEnabled,
            inventoryEnabled: item.inventoryEnabled,
            productionEnabled: item.productionEnabled,
            status: form.get("status"),
          },
        }),
      });
      if (!response.ok) {
        setMessage(await responseMessage(response));
        return;
      }
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失敗");
    } finally {
      setBusy(false);
    }
  }

  async function saveCompanyRelation(
    event: FormEvent<HTMLFormElement>,
    companyId: string,
  ) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/items/${item.id}/companies`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          companyId,
          relation: {
            companyItemCode: form.get("companyItemCode"),
            salesEnabled: form.get("salesEnabled") === "on",
            status: form.get("status"),
          },
        }),
      });
      if (!response.ok) {
        setMessage(await responseMessage(response));
        return;
      }
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={pageStyles.pageStack}>
      {message ? (
        <Alert tone="danger" title="操作失敗">
          {message}
        </Alert>
      ) : null}

      <Card>
        <Section title="品項資料" description="維持既有品項代碼、類型、單位與啟用規則。">
        <form onSubmit={updateItem} className={pageStyles.formGrid}>
          <Field label="品項類型">
            <Select name="itemType" defaultValue={item.itemType}>
            <option value="PRODUCT">產品</option>
            <option value="RAW_MATERIAL">原物料</option>
            </Select>
          </Field>
          <Field label="狀態">
            <Select name="status" defaultValue={item.status}>
            <option value="ACTIVE">有效</option>
            <option value="INACTIVE">停用</option>
            </Select>
          </Field>
          <Field label="品項代碼" required><Input name="code" required maxLength={100} defaultValue={item.code} /></Field>
          <Field label="品項名稱" required><Input name="name" required maxLength={200} defaultValue={item.name} /></Field>
          <Field label="基本單位" required><Input name="baseUnit" required maxLength={50} defaultValue={item.baseUnit} /></Field>
          <Field label="條碼（可空白）"><Input name="barcode" maxLength={100} defaultValue={item.barcode ?? ""} /></Field>
          <Field label="規格" className={pageStyles.fullSpan}><Textarea name="specification" rows={2} defaultValue={item.specification ?? ""} /></Field>
          <Field label="說明" className={pageStyles.fullSpan}><Textarea name="description" rows={2} defaultValue={item.description ?? ""} /></Field>
          <Checkbox name="salesEnabled" defaultChecked={item.salesEnabled} label="品項允許銷售" />
          <FormActions className={pageStyles.fullSpan} align="start" primary={<Button type="submit" pending={busy} pendingLabel="儲存中…">儲存品項</Button>} />
        </form>
        </Section>
      </Card>

      <Card>
        <Section title="公司授權" description="品項與公司關係皆有效且兩層均允許銷售時，才會出現在可銷售清單。">
        <div className={itemStyles.formStack}>
          {companies.map((company) => {
            const relation = item.companyRelations.find(
              (entry) => entry.companyId === company.id,
            );
            return (
              <form
                key={company.id}
                onSubmit={(event) => saveCompanyRelation(event, company.id)}
                className={pageStyles.formGrid}
              >
                <div className={`${itemStyles.companyHeader} ${pageStyles.fullSpan}`}>
                  <p className={itemStyles.companyName}>{company.code}－{company.name}</p>
                  <StatusBadge
                    label={!relation ? "尚未建立" : relation.status === "INACTIVE" ? "停用" : "有效"}
                    tone={relation?.status === "ACTIVE" ? "success" : "neutral"}
                  />
                </div>
                <Field label="公司品項代碼" required><Input name="companyItemCode" required maxLength={100} defaultValue={relation?.companyItemCode ?? ""} /></Field>
                <Field label="關係狀態"><Select name="status" defaultValue={relation?.status ?? "ACTIVE"}><option value="ACTIVE">有效</option><option value="INACTIVE">停用</option></Select></Field>
                <Checkbox name="salesEnabled" defaultChecked={relation?.salesEnabled ?? false} label="此公司允許銷售" />
                <FormActions className={pageStyles.fullSpan} align="start" primary={<Button type="submit" variant="secondary" pending={busy} pendingLabel="儲存中…">{relation ? "更新關係" : "建立關係"}</Button>} />
              </form>
            );
          })}
        </div>
        </Section>
      </Card>
    </div>
  );
}
