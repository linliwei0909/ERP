"use client";

import { useState } from "react";
import type { ShellCompany } from "@/lib/app-shell/context";

export function CompanySwitcher({
  companies,
  selectedCompany,
}: {
  companies: ShellCompany[];
  selectedCompany: ShellCompany;
}) {
  const [pending, setPending] = useState(false);

  if (companies.length <= 1) {
    return (
      <div className="shell-company-static" aria-label="目前公司">
        <span>{selectedCompany.name}</span>
        <small>{selectedCompany.code}</small>
      </div>
    );
  }

  return (
    <form
      method="post"
      action="/api/auth/company"
      className="shell-company-switcher"
      aria-label="切換公司"
      onSubmit={() => setPending(true)}
    >
      <label>
        <span className="sr-only">目前公司</span>
        <select
          name="companyId"
          defaultValue={selectedCompany.id}
          disabled={pending}
          aria-busy={pending}
          onChange={(event) => {
            setPending(true);
            event.currentTarget.form?.requestSubmit();
          }}
        >
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.code}－{company.name}
              {company.id === selectedCompany.id ? "（目前）" : ""}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending}>
        {pending ? "切換中…" : "切換"}
      </button>
    </form>
  );
}
