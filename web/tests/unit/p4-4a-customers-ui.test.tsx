import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CustomerCreateClient } from "../../src/app/(authenticated)/admin/customers/customer-create-client";
import { CustomerManagerClient } from "../../src/app/(authenticated)/admin/customers/[id]/customer-manager-client";
import { CustomersListView } from "../../src/app/(authenticated)/customers/customer-list-view";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("P4.4a Customers UI migration", () => {
  it("renders customer data with unchanged detail href and query", () => {
    const html = renderToStaticMarkup(
      <CustomersListView
        context={{
          authorizedCompanies: [
            { id: "company-a", code: "A", name: "甲公司" },
          ],
        }}
        companyId="company-a"
        query={{ search: "測試", status: "ACTIVE", page: "1" }}
        result={{
          items: [
            {
              id: "customer-a",
              name: "測試客戶",
              customerType: "DOMESTIC",
              taxId: "12345678",
              countryCode: null,
              foreignIdentifier: null,
              companyRelations: [{ customerCode: "C001" }],
            },
          ],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        }}
      />,
    );

    expect(html).not.toContain("<main");
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('name="companyId"');
    expect(html).toContain('name="search"');
    expect(html).toContain('name="status"');
    expect(html).toContain("測試客戶");
    expect(html).toContain("C001");
    expect(html).toContain(
      'href="/customers/customer-a?companyId=company-a"',
    );
    expect(html).toContain('aria-label="客戶清單分頁"');
  });

  it("distinguishes an empty list from filtered no-results", () => {
    const renderEmpty = (search?: string) =>
      renderToStaticMarkup(
        <CustomersListView
          context={{
            authorizedCompanies: [
              { id: "company-a", code: "A", name: "甲公司" },
            ],
          }}
          companyId="company-a"
          query={{ search, status: "ACTIVE", page: "1" }}
          result={{
            items: [],
            pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
          }}
        />,
      );

    const empty = renderEmpty();
    expect(empty).toContain("尚無可使用客戶");
    expect(empty).not.toContain("查無符合條件的客戶");

    const filtered = renderEmpty("不存在");
    expect(filtered).toContain("查無符合條件的客戶");
    expect(filtered).not.toContain("尚無可使用客戶");
  });

  it("renders enabled and disabled pagination with preserved filters", () => {
    const html = renderToStaticMarkup(
      <CustomersListView
        context={{
          authorizedCompanies: [
            { id: "company-a", code: "A", name: "甲公司" },
          ],
        }}
        companyId="company-a"
        query={{ search: "測試", status: "ACTIVE", page: "2" }}
        result={{
          items: [],
          pagination: { page: 2, pageSize: 20, total: 0, totalPages: 3 },
        }}
      />,
    );

    expect(html).toContain("companyId=company-a");
    expect(html).toContain("search=%E6%B8%AC%E8%A9%A6");
    expect(html).toContain("page=1");
    expect(html).toContain("page=3");

    const boundary = renderToStaticMarkup(
      <CustomersListView
        context={{
          authorizedCompanies: [
            { id: "company-a", code: "A", name: "甲公司" },
          ],
        }}
        companyId="company-a"
        query={{ status: "ACTIVE", page: "1" }}
        result={{
          items: [],
          pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
        }}
      />,
    );
    expect(boundary.match(/aria-disabled="true"/g)).toHaveLength(2);
  });

  it("renders the create form with labels, required fields and pending support", () => {
    const html = renderToStaticMarkup(
      <CustomerCreateClient selectedCompanyId="company-a" />,
    );

    for (const field of ["customerCode", "name", "taxId"]) {
      expect(html).toContain(`name="${field}"`);
    }
    expect(html).toContain("公司客戶代碼");
    expect(html).toContain("客戶名稱");
    expect(html).toContain("（必填）");
    expect(html).not.toContain("<main");

    const createSource = source(
      "src/app/(authenticated)/admin/customers/customer-create-client.tsx",
    );
    expect(createSource).toContain('fetch("/api/customers"');
    expect(createSource).toContain('"idempotency-key": crypto.randomUUID()');
    expect(createSource).toContain("companyId: selectedCompanyId");
    expect(createSource).toContain('pendingLabel="建立中…"');
  });

  it("renders accessible customer, relation, contact and location forms", () => {
    const html = renderToStaticMarkup(
      <CustomerManagerClient
        selectedCompanyId="company-a"
        companies={[{ id: "company-a", code: "A", name: "甲公司" }]}
        customer={{
          id: "customer-a",
          customerType: "DOMESTIC",
          name: "測試客戶",
          taxId: "12345678",
          countryCode: null,
          foreignIdentifier: null,
          status: "ACTIVE",
          companyRelations: [
            {
              id: "relation-a",
              companyId: "company-a",
              customerCode: "C001",
              status: "ACTIVE",
              company: { code: "A", name: "甲公司" },
            },
          ],
          contacts: [],
          deliveryLocations: [],
        }}
      />,
    );

    for (const field of [
      "name",
      "status",
      "taxId",
      "companyId",
      "customerCode",
      "department",
      "jobTitle",
      "phone",
      "mobile",
      "email",
      "notes",
      "isPrimary",
      "code",
      "recipientName",
      "postalCode",
      "city",
      "district",
      "addressLine",
      "isDefault",
    ]) {
      expect(html).toContain(`name="${field}"`);
    }
    expect(html).toContain("設為主要聯絡人");
    expect(html).toContain("設為預設地點");
    expect(html).not.toContain("<main");
  });

  it("keeps route, query, authorization, endpoint and payload boundaries", () => {
    const routeFiles = [
      "src/app/(authenticated)/customers/page.tsx",
      "src/app/(authenticated)/customers/[id]/page.tsx",
      "src/app/(authenticated)/admin/customers/page.tsx",
      "src/app/(authenticated)/admin/customers/[id]/page.tsx",
    ];
    for (const path of routeFiles) {
      const page = source(path);
      expect(page).not.toMatch(/max-w-|min-h-screen|px-6|py-12/);
      expect(page).not.toContain("<main");
    }

    const list = source("src/app/(authenticated)/customers/page.tsx");
    expect(list).toContain("query.companyId ?? context.selectedCompany.id");
    expect(list).toContain("listCustomers(prisma");

    const adminList = source(
      "src/app/(authenticated)/admin/customers/page.tsx",
    );
    expect(adminList).toContain("requireAdminWithAudit(prisma, context)");
    expect(adminList).toContain('name="companyId"');
    expect(adminList).toContain("pageHref");

    const manager = source(
      "src/app/(authenticated)/admin/customers/[id]/customer-manager-client.tsx",
    );
    for (const endpoint of [
      "/api/customers/${customer.id}",
      "/api/customers/${customer.id}/companies",
      "/api/customers/${customerId}/contacts",
      "/api/customers/${customerId}/locations",
    ]) {
      expect(manager).toContain(endpoint);
    }
    expect(manager).toContain("companyId: selectedCompanyId");
    expect(manager).toContain('"idempotency-key": crypto.randomUUID()');

    const clientFiles = [
      "src/app/(authenticated)/admin/customers/customer-create-client.tsx",
      "src/app/(authenticated)/admin/customers/[id]/customer-manager-client.tsx",
    ];
    for (const path of clientFiles) {
      expect(source(path)).toMatch(/^"use client";/);
    }
    for (const path of routeFiles) {
      expect(source(path)).not.toContain('"use client"');
    }
    expect(
      source("src/app/(authenticated)/customers/customer-list-view.tsx"),
    ).not.toContain('"use client"');
  });
});
