import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home from "../../src/app/(authenticated)/page";
import { ItemCreateClient } from "../../src/app/(authenticated)/admin/items/item-create-client";
import { CustomersListView } from "../../src/app/(authenticated)/customers/customer-list-view";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("P4.3d representative page integration", () => {
  it("renders the home contract with one main, one h1 and shared feedback", async () => {
    const page = await Home({
      searchParams: Promise.resolve({ error: "company_access_denied" }),
    });
    const html = renderToStaticMarkup(page);

    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("作業首頁");
    expect(html).toContain("公司切換失敗");
    expect(html).toContain('role="alert"');
    expect(html).toContain('data-page-container-variant="standard"');
  });

  it("renders the item form with accessible labels and unchanged field names", () => {
    const html = renderToStaticMarkup(
      <ItemCreateClient selectedCompanyId="company-a" />,
    );

    for (const field of [
      "itemType",
      "companyItemCode",
      "code",
      "name",
      "baseUnit",
      "barcode",
      "specification",
      "description",
      "salesEnabled",
      "companySalesEnabled",
    ]) {
      expect(html).toContain(`name="${field}"`);
    }
    expect(html).toContain("建立品項");
    expect(html).not.toContain("<main");
  });

  it("renders the customer filters, table, empty state and safe pagination", () => {
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

    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("客戶查詢");
    expect(html).toContain("公司");
    expect(html).toContain("搜尋");
    expect(html).toContain("<table");
    expect(html).toContain("客戶查詢結果");
    expect(html).toContain("查無可使用客戶");
    expect(html).toContain('aria-label="客戶清單分頁"');
    expect(html).toContain("companyId=company-a");
    expect(html).toContain("search=%E6%B8%AC%E8%A9%A6");
  });

  it("keeps representative data and authorization behavior at the page boundary", () => {
    const customers = source("src/app/(authenticated)/customers/page.tsx");
    expect(customers).toContain("getPageRequestContext()");
    expect(customers).toContain("listCustomers(prisma");
    expect(customers).toContain("companyId,");
    const customerView = source(
      "src/app/(authenticated)/customers/customer-list-view.tsx",
    );
    expect(customerView).toContain("pageHref");
    expect(customerView).toContain(
      'href={`/customers/${customer.id}?companyId=${companyId}`}',
    );

    const items = source("src/app/(authenticated)/admin/items/page.tsx");
    expect(items).toContain("requireAdminWithAudit(prisma, context)");
    expect(items).toContain("listItems(prisma");
    expect(items).toContain('<Field label="公司">');

    const create = source(
      "src/app/(authenticated)/admin/items/item-create-client.tsx",
    );
    expect(create).toContain('fetch("/api/items"');
    expect(create).toContain('"idempotency-key": crypto.randomUUID()');
    expect(create).toContain('purchaseEnabled: false');
    expect(create).toContain('inventoryEnabled: false');
    expect(create).toContain('productionEnabled: false');
  });

  it("does not duplicate page padding or max-width in representative routes", () => {
    for (const path of [
      "src/app/(authenticated)/page.tsx",
      "src/app/(authenticated)/customers/customer-list-view.tsx",
      "src/app/(authenticated)/admin/items/page.tsx",
      "src/app/(authenticated)/delivery-notes/page.tsx",
    ]) {
      const page = source(path);
      expect(page).not.toMatch(/max-w-|min-h-screen|px-6|py-12/);
      expect(page.match(/<main\b/g)?.length).toBeGreaterThanOrEqual(1);
      expect(page.match(/<main\b/g)).toHaveLength(
        page.match(/<\/main>/g)?.length,
      );
    }
  });
});
