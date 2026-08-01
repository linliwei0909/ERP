"use client";

import { useState, type FormEvent } from "react";
import pageStyles from "@/components/app-shell/page-contract.module.css";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  FormActions,
  Input,
  Section,
  Select,
  StatusBadge,
} from "@/components/ui";
import customerStyles from "../../../customers/customer-ui.module.css";

type Company = { id: string; code: string; name: string };
type Relation = {
  id: string;
  companyId: string;
  customerCode: string;
  status: "ACTIVE" | "INACTIVE";
  company: { code: string; name: string };
};
type Contact = {
  id: string;
  name: string;
  department: string | null;
  jobTitle: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  notes: string | null;
  isPrimary: boolean;
  status: "ACTIVE" | "INACTIVE";
};
type Location = {
  id: string;
  code: string;
  name: string;
  recipientName: string;
  phone: string;
  postalCode: string | null;
  city: string | null;
  district: string | null;
  addressLine: string;
  notes: string | null;
  isDefault: boolean;
  status: "ACTIVE" | "INACTIVE";
};
type ManagedCustomer = {
  id: string;
  customerType: "DOMESTIC" | "FOREIGN";
  name: string;
  taxId: string | null;
  countryCode: string | null;
  foreignIdentifier: string | null;
  status: "ACTIVE" | "INACTIVE";
  companyRelations: Relation[];
  contacts: Contact[];
  deliveryLocations: Location[];
};

async function request(
  url: string,
  method: "POST" | "PATCH",
  body: unknown,
) {
  const response = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      "idempotency-key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    throw new Error(payload?.error?.message ?? "操作失敗");
  }
}

function value(form: FormData, key: string): string {
  return String(form.get(key) ?? "");
}

function checked(form: FormData, key: string): boolean {
  return form.get(key) === "on";
}

function ContactForm({
  customerId,
  companyId,
  contact,
  onBusy,
}: {
  customerId: string;
  companyId: string;
  contact?: Contact;
  onBusy: (message: string | null) => void;
}) {
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    onBusy("儲存聯絡人中…");
    const form = new FormData(event.currentTarget);
    try {
      await request(
        contact
          ? `/api/customers/${customerId}/contacts/${contact.id}`
          : `/api/customers/${customerId}/contacts`,
        contact ? "PATCH" : "POST",
        {
          companyId,
          value: {
            name: value(form, "name"),
            department: value(form, "department"),
            jobTitle: value(form, "jobTitle"),
            phone: value(form, "phone"),
            mobile: value(form, "mobile"),
            email: value(form, "email"),
            notes: value(form, "notes"),
            isPrimary: checked(form, "isPrimary"),
            status: value(form, "status"),
          },
        },
      );
      window.location.reload();
    } catch (error) {
      onBusy(error instanceof Error ? error.message : "儲存失敗");
      setPending(false);
    }
  }

  return (
    <Card variant="subtle" padding="small">
      <form onSubmit={submit} className={pageStyles.formGrid}>
        <Field label="姓名" required><Input name="name" required defaultValue={contact?.name} /></Field>
        <Field label="部門"><Input name="department" defaultValue={contact?.department ?? ""} /></Field>
        <Field label="職稱"><Input name="jobTitle" defaultValue={contact?.jobTitle ?? ""} /></Field>
        <Field label="電話"><Input name="phone" defaultValue={contact?.phone ?? ""} /></Field>
        <Field label="手機"><Input name="mobile" defaultValue={contact?.mobile ?? ""} /></Field>
        <Field label="電子郵件"><Input name="email" type="email" defaultValue={contact?.email ?? ""} /></Field>
        <Field label="備註"><Input name="notes" defaultValue={contact?.notes ?? ""} /></Field>
        <Field label="狀態"><Select name="status" defaultValue={contact?.status ?? "ACTIVE"}><option value="ACTIVE">有效</option><option value="INACTIVE">停用</option></Select></Field>
        <Checkbox name="isPrimary" defaultChecked={contact?.isPrimary} label="設為主要聯絡人" />
        <FormActions className={pageStyles.fullSpan} align="start" primary={<Button type="submit" pending={pending} pendingLabel="儲存中…">{contact ? "儲存聯絡人" : "新增聯絡人"}</Button>} />
      </form>
    </Card>
  );
}

function LocationForm({
  customerId,
  companyId,
  location,
  onBusy,
}: {
  customerId: string;
  companyId: string;
  location?: Location;
  onBusy: (message: string | null) => void;
}) {
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    onBusy("儲存送貨地點中…");
    const form = new FormData(event.currentTarget);
    try {
      await request(
        location
          ? `/api/customers/${customerId}/locations/${location.id}`
          : `/api/customers/${customerId}/locations`,
        location ? "PATCH" : "POST",
        {
          companyId,
          value: {
            code: value(form, "code"),
            name: value(form, "name"),
            recipientName: value(form, "recipientName"),
            phone: value(form, "phone"),
            postalCode: value(form, "postalCode"),
            city: value(form, "city"),
            district: value(form, "district"),
            addressLine: value(form, "addressLine"),
            notes: value(form, "notes"),
            isDefault: checked(form, "isDefault"),
            status: value(form, "status"),
          },
        },
      );
      window.location.reload();
    } catch (error) {
      onBusy(error instanceof Error ? error.message : "儲存失敗");
      setPending(false);
    }
  }

  return (
    <Card variant="subtle" padding="small">
      <form onSubmit={submit} className={pageStyles.formGrid}>
        <Field label="地點代碼" required><Input name="code" required defaultValue={location?.code} /></Field>
        <Field label="地點名稱" required><Input name="name" required defaultValue={location?.name} /></Field>
        <Field label="收件人" required><Input name="recipientName" required defaultValue={location?.recipientName} /></Field>
        <Field label="電話" required><Input name="phone" required defaultValue={location?.phone} /></Field>
        <Field label="郵遞區號"><Input name="postalCode" defaultValue={location?.postalCode ?? ""} /></Field>
        <Field label="城市"><Input name="city" defaultValue={location?.city ?? ""} /></Field>
        <Field label="行政區"><Input name="district" defaultValue={location?.district ?? ""} /></Field>
        <Field label="地址" required><Input name="addressLine" required defaultValue={location?.addressLine} /></Field>
        <Field label="備註"><Input name="notes" defaultValue={location?.notes ?? ""} /></Field>
        <Field label="狀態"><Select name="status" defaultValue={location?.status ?? "ACTIVE"}><option value="ACTIVE">有效</option><option value="INACTIVE">停用</option></Select></Field>
        <Checkbox name="isDefault" defaultChecked={location?.isDefault} label="設為預設地點" />
        <FormActions className={pageStyles.fullSpan} align="start" primary={<Button type="submit" pending={pending} pendingLabel="儲存中…">{location ? "儲存地點" : "新增地點"}</Button>} />
      </form>
    </Card>
  );
}

export function CustomerManagerClient({
  customer,
  companies,
  selectedCompanyId,
}: {
  customer: ManagedCustomer;
  companies: Company[];
  selectedCompanyId: string;
}) {
  const [customerType, setCustomerType] = useState(customer.customerType);
  const [message, setMessage] = useState<string | null>(null);
  const [customerPending, setCustomerPending] = useState(false);
  const [relationPending, setRelationPending] = useState(false);

  async function updateCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCustomerPending(true);
    setMessage("儲存客戶中…");
    const form = new FormData(event.currentTarget);
    const customerValue =
      customerType === "DOMESTIC"
        ? {
            customerType,
            name: value(form, "name"),
            taxId: value(form, "taxId"),
            status: value(form, "status"),
          }
        : {
            customerType,
            name: value(form, "name"),
            countryCode: value(form, "countryCode"),
            foreignIdentifier: value(form, "foreignIdentifier"),
            status: value(form, "status"),
          };
    try {
      await request(`/api/customers/${customer.id}`, "PATCH", {
        companyId: selectedCompanyId,
        customer: customerValue,
      });
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "儲存失敗");
      setCustomerPending(false);
    }
  }

  async function assignCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRelationPending(true);
    setMessage("儲存公司授權中…");
    const form = new FormData(event.currentTarget);
    try {
      await request(`/api/customers/${customer.id}/companies`, "POST", {
        companyId: value(form, "companyId"),
        relation: {
          customerCode: value(form, "customerCode"),
          status: value(form, "status"),
        },
      });
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "儲存失敗");
      setRelationPending(false);
    }
  }

  return (
    <>
      {message ? <Alert tone={message.endsWith("中…") ? "info" : "danger"} title={message.endsWith("中…") ? "處理中" : "操作失敗"}>{message}</Alert> : null}
      <Card>
        <Section title="客戶基本資料" description="維持既有客戶類型、識別資料與狀態規則。">
        <form onSubmit={updateCustomer} className={pageStyles.formGrid}>
          <Field label="客戶類型"><Select value={customerType} onChange={(event) => setCustomerType(event.target.value as "DOMESTIC" | "FOREIGN")}><option value="DOMESTIC">境內</option><option value="FOREIGN">境外</option></Select></Field>
          <Field label="客戶名稱" required><Input name="name" required defaultValue={customer.name} /></Field>
          <Field label="狀態"><Select name="status" defaultValue={customer.status}><option value="ACTIVE">有效</option><option value="INACTIVE">停用</option></Select></Field>
          {customerType === "DOMESTIC" ? (
            <Field label="統一編號"><Input name="taxId" defaultValue={customer.taxId ?? ""} /></Field>
          ) : (
            <>
              <Field label="國別碼" required><Input name="countryCode" required defaultValue={customer.countryCode ?? ""} maxLength={2} className="uppercase" /></Field>
              <Field label="境外識別碼" required><Input name="foreignIdentifier" required defaultValue={customer.foreignIdentifier ?? ""} /></Field>
            </>
          )}
          <FormActions className={pageStyles.fullSpan} align="start" primary={<Button type="submit" pending={customerPending} pendingLabel="儲存中…">儲存客戶</Button>} />
        </form>
        </Section>
      </Card>

      <Card>
        <Section title="公司授權" description="管理客戶在既有授權公司中的代碼與有效狀態。">
        {customer.companyRelations.length > 0 ? <ul className={customerStyles.compactList}>
          {customer.companyRelations.map((relation) => <li className={customerStyles.relationRow} key={relation.id}><span>{relation.company.code}－{relation.company.name}：<strong>{relation.customerCode}</strong></span><StatusBadge label={relation.status === "ACTIVE" ? "有效" : "停用"} tone={relation.status === "ACTIVE" ? "success" : "neutral"} /></li>)}
        </ul> : <EmptyState variant="no-data" title="尚無公司授權" />}
        <form onSubmit={assignCompany} className={pageStyles.formGrid}>
          <Field label="公司"><Select name="companyId" defaultValue={selectedCompanyId}>{companies.map((company) => <option key={company.id} value={company.id}>{company.code}－{company.name}</option>)}</Select></Field>
          <Field label="公司客戶代碼" required><Input name="customerCode" required /></Field>
          <Field label="狀態"><Select name="status" defaultValue="ACTIVE"><option value="ACTIVE">有效</option><option value="INACTIVE">停用</option></Select></Field>
          <FormActions className={pageStyles.fullSpan} align="start" primary={<Button type="submit" pending={relationPending} pendingLabel="儲存中…">新增或更新授權</Button>} />
        </form>
        </Section>
      </Card>

      <Card>
        <Section title="聯絡人" description="新增或維護聯絡方式；電話、手機或電子郵件至少一項必填的既有驗證維持不變。">
        <div className={customerStyles.formStack}>
          <ContactForm customerId={customer.id} companyId={selectedCompanyId} onBusy={setMessage} />
          {customer.contacts.map((contact) => <ContactForm key={contact.id} customerId={customer.id} companyId={selectedCompanyId} contact={contact} onBusy={setMessage} />)}
        </div>
        </Section>
      </Card>

      <Card>
        <Section title="送貨地點" description="新增或維護結構化地址與預設地點。">
        <div className={customerStyles.formStack}>
          <LocationForm customerId={customer.id} companyId={selectedCompanyId} onBusy={setMessage} />
          {customer.deliveryLocations.map((location) => <LocationForm key={location.id} customerId={customer.id} companyId={selectedCompanyId} location={location} onBusy={setMessage} />)}
        </div>
        </Section>
      </Card>
    </>
  );
}
