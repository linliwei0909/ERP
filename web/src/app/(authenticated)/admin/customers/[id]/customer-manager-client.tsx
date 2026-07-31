"use client";

import { useState, type FormEvent } from "react";

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
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-xl border p-4 md:grid-cols-3">
      <input name="name" required defaultValue={contact?.name} placeholder="姓名*" className="rounded-lg border px-3 py-2" />
      <input name="department" defaultValue={contact?.department ?? ""} placeholder="部門" className="rounded-lg border px-3 py-2" />
      <input name="jobTitle" defaultValue={contact?.jobTitle ?? ""} placeholder="職稱" className="rounded-lg border px-3 py-2" />
      <input name="phone" defaultValue={contact?.phone ?? ""} placeholder="電話" className="rounded-lg border px-3 py-2" />
      <input name="mobile" defaultValue={contact?.mobile ?? ""} placeholder="手機" className="rounded-lg border px-3 py-2" />
      <input name="email" type="email" defaultValue={contact?.email ?? ""} placeholder="Email" className="rounded-lg border px-3 py-2" />
      <input name="notes" defaultValue={contact?.notes ?? ""} placeholder="備註" className="rounded-lg border px-3 py-2 md:col-span-2" />
      <select name="status" defaultValue={contact?.status ?? "ACTIVE"} className="rounded-lg border px-3 py-2">
        <option value="ACTIVE">有效</option>
        <option value="INACTIVE">停用</option>
      </select>
      <label className="text-sm"><input name="isPrimary" type="checkbox" defaultChecked={contact?.isPrimary} /> 設為主要聯絡人</label>
      <button className="rounded-lg bg-slate-900 px-3 py-2 text-white md:justify-self-start">{contact ? "儲存聯絡人" : "新增聯絡人"}</button>
    </form>
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
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-xl border p-4 md:grid-cols-4">
      <input name="code" required defaultValue={location?.code} placeholder="地點代碼*" className="rounded-lg border px-3 py-2" />
      <input name="name" required defaultValue={location?.name} placeholder="地點名稱*" className="rounded-lg border px-3 py-2" />
      <input name="recipientName" required defaultValue={location?.recipientName} placeholder="收件人*" className="rounded-lg border px-3 py-2" />
      <input name="phone" required defaultValue={location?.phone} placeholder="電話*" className="rounded-lg border px-3 py-2" />
      <input name="postalCode" defaultValue={location?.postalCode ?? ""} placeholder="郵遞區號" className="rounded-lg border px-3 py-2" />
      <input name="city" defaultValue={location?.city ?? ""} placeholder="城市" className="rounded-lg border px-3 py-2" />
      <input name="district" defaultValue={location?.district ?? ""} placeholder="行政區" className="rounded-lg border px-3 py-2" />
      <input name="addressLine" required defaultValue={location?.addressLine} placeholder="地址*" className="rounded-lg border px-3 py-2" />
      <input name="notes" defaultValue={location?.notes ?? ""} placeholder="備註" className="rounded-lg border px-3 py-2 md:col-span-2" />
      <select name="status" defaultValue={location?.status ?? "ACTIVE"} className="rounded-lg border px-3 py-2">
        <option value="ACTIVE">有效</option>
        <option value="INACTIVE">停用</option>
      </select>
      <label className="text-sm"><input name="isDefault" type="checkbox" defaultChecked={location?.isDefault} /> 設為預設地點</label>
      <button className="rounded-lg bg-slate-900 px-3 py-2 text-white md:justify-self-start">{location ? "儲存地點" : "新增地點"}</button>
    </form>
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

  async function updateCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    }
  }

  async function assignCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    }
  }

  return (
    <>
      {message ? <p role="status" className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{message}</p> : null}
      <section className="mt-6 rounded-2xl border bg-white p-6">
        <h2 className="text-xl font-bold">客戶基本資料</h2>
        <form onSubmit={updateCustomer} className="mt-4 grid gap-3 md:grid-cols-3">
          <select value={customerType} onChange={(event) => setCustomerType(event.target.value as "DOMESTIC" | "FOREIGN")} className="rounded-lg border px-3 py-2">
            <option value="DOMESTIC">境內</option>
            <option value="FOREIGN">境外</option>
          </select>
          <input name="name" required defaultValue={customer.name} placeholder="客戶名稱" className="rounded-lg border px-3 py-2" />
          <select name="status" defaultValue={customer.status} className="rounded-lg border px-3 py-2">
            <option value="ACTIVE">有效</option>
            <option value="INACTIVE">停用</option>
          </select>
          {customerType === "DOMESTIC" ? (
            <input name="taxId" defaultValue={customer.taxId ?? ""} placeholder="統一編號" className="rounded-lg border px-3 py-2" />
          ) : (
            <>
              <input name="countryCode" required defaultValue={customer.countryCode ?? ""} placeholder="國別碼" maxLength={2} className="rounded-lg border px-3 py-2 uppercase" />
              <input name="foreignIdentifier" required defaultValue={customer.foreignIdentifier ?? ""} placeholder="境外識別碼" className="rounded-lg border px-3 py-2" />
            </>
          )}
          <button className="rounded-lg bg-slate-900 px-4 py-2 text-white md:col-span-3 md:justify-self-start">儲存客戶</button>
        </form>
      </section>

      <section className="mt-6 rounded-2xl border bg-white p-6">
        <h2 className="text-xl font-bold">公司授權</h2>
        <ul className="mt-3 text-sm">
          {customer.companyRelations.map((relation) => <li key={relation.id}>{relation.company.code}：{relation.customerCode}（{relation.status === "ACTIVE" ? "有效" : "停用"}）</li>)}
        </ul>
        <form onSubmit={assignCompany} className="mt-4 grid gap-3 md:grid-cols-4">
          <select name="companyId" defaultValue={selectedCompanyId} className="rounded-lg border px-3 py-2">
            {companies.map((company) => <option key={company.id} value={company.id}>{company.code}－{company.name}</option>)}
          </select>
          <input name="customerCode" required placeholder="公司客戶代碼" className="rounded-lg border px-3 py-2" />
          <select name="status" defaultValue="ACTIVE" className="rounded-lg border px-3 py-2"><option value="ACTIVE">有效</option><option value="INACTIVE">停用</option></select>
          <button className="rounded-lg bg-slate-900 px-4 py-2 text-white">新增或更新授權</button>
        </form>
      </section>

      <section className="mt-6 rounded-2xl border bg-white p-6">
        <h2 className="text-xl font-bold">聯絡人</h2>
        <div className="mt-4 space-y-3">
          <ContactForm customerId={customer.id} companyId={selectedCompanyId} onBusy={setMessage} />
          {customer.contacts.map((contact) => <ContactForm key={contact.id} customerId={customer.id} companyId={selectedCompanyId} contact={contact} onBusy={setMessage} />)}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border bg-white p-6">
        <h2 className="text-xl font-bold">送貨地點</h2>
        <div className="mt-4 space-y-3">
          <LocationForm customerId={customer.id} companyId={selectedCompanyId} onBusy={setMessage} />
          {customer.deliveryLocations.map((location) => <LocationForm key={location.id} customerId={customer.id} companyId={selectedCompanyId} location={location} onBusy={setMessage} />)}
        </div>
      </section>
    </>
  );
}
