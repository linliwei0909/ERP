import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompanySettingsClient } from "../../src/app/(authenticated)/admin/company-settings/company-settings-client";
import { FreightRuleCreateClient } from "../../src/app/(authenticated)/admin/freight-rules/freight-rule-create-client";
import { FreightRuleEditor } from "../../src/app/(authenticated)/admin/freight-rules/[id]/freight-rule-editor";
import { MasterImportClient } from "../../src/app/(authenticated)/admin/master-import/master-import-client";

function source(path: string): string { return readFileSync(resolve(process.cwd(), path), "utf8"); }

describe("P4.4d Admin UI migration", () => {
  it("renders Company Settings fields, states and future actions", () => {
    const html = renderToStaticMarkup(<CompanySettingsClient companies={[{ id: "company-a", code: "A", name: "甲公司" }]} selectedCompanyId="company-a" selectedSettingKey="billing_cutoff_day" history={[{ id: "setting-a", settingKey: "billing_cutoff_day", settingValue: 25, effectiveFrom: "2099-01-01", state: "FUTURE", createdAt: "2026-08-02", updatedAt: "2026-08-02", cancelledAt: null }]} />);
    expect(html).toContain("管理公司");
    expect(html).toContain("尚未生效");
    expect(html).toContain("取消版本");
    expect(html).toContain('name="settingValue"');
    expect(html).toContain('name="effectiveFrom"');
  });

  it("renders Freight create/edit half-open fields without changing names", () => {
    const create = renderToStaticMarkup(<FreightRuleCreateClient companyId="company-a" locations={[{ id: "location-a", customerId: "customer-a", label: "客戶／地點" }]} />);
    const edit = renderToStaticMarkup(<FreightRuleEditor companyId="company-a" value={{ id: "freight-a", customerId: "customer-a", deliveryLocationId: "location-a", mode: "NO_CHARGE", unitFreight: null, fixedFreight: null, validFrom: "2026-08-01", validTo: null, status: "ACTIVE" }} />);
    for (const field of ["deliveryLocationId", "mode", "validFrom", "validTo", "status"]) expect(`${create}${edit}`).toContain(`name="${field}"`);
    expect(`${create}${edit}`).toContain("失效日（不含）");
  });

  it("renders Master Import contract fields and ConfirmDialog trigger", () => {
    const html = renderToStaticMarkup(<MasterImportClient companyId="company-a" />);
    for (const field of ["sourceSystem", "entityType", "file"]) expect(html).toContain(`name="${field}"`);
    expect(html).toContain("執行 Dry-run");
    expect(html).toContain("確認正式匯入");
    expect(source("src/app/(authenticated)/admin/master-import/master-import-client.tsx")).not.toContain("window.confirm");
  });

  it("keeps route, authorization, native action, endpoint and payload boundaries", () => {
    const routes = ["admin/company-settings/page.tsx", "admin/users/page.tsx", "admin/freight-rules/page.tsx", "admin/freight-rules/[id]/page.tsx", "admin/master-import/page.tsx", "admin/master-import/[id]/page.tsx"];
    for (const path of routes) {
      const page = source(`src/app/(authenticated)/${path}`);
      expect(page).not.toMatch(/max-w-|min-h-screen|px-6|py-12/);
      expect(page).not.toContain("<main");
    }
    const users = source("src/app/(authenticated)/admin/users/page.tsx");
    for (const action of ["/api/admin/users", "/status`", "/sessions/revoke`", "/access`"]) expect(users).toContain(action);
    for (const field of ["username", "password", "roleCodes", "companyIds", "defaultCompanyId", "status", "reason"]) expect(users).toContain(`name="${field}"`);
    const settings = source("src/app/(authenticated)/admin/company-settings/company-settings-client.tsx");
    for (const endpoint of ["/api/admin/company-settings", "/api/admin/company-settings/${id}", "/api/admin/company-settings/${id}/cancel"]) expect(settings).toContain(endpoint);
    const freight = source("src/app/(authenticated)/admin/freight-rules/freight-rule-create-client.tsx");
    expect(freight).toContain('fetch("/api/admin/freight-rules"');
    for (const field of ["customerId", "deliveryLocationId", "unitFreight", "fixedFreight", "validFrom", "validTo"]) expect(freight).toContain(field);
    const importClient = source("src/app/(authenticated)/admin/master-import/master-import-client.tsx");
    expect(importClient).toContain('fetch("/api/admin/master-import/batches"');
    for (const field of ["companyId", "entityType", "dryRun"]) expect(importClient).toContain(`body.set("${field}"`);
  });
});
