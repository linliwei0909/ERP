import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ItemCreateClient } from "../../src/app/(authenticated)/admin/items/item-create-client";
import { ItemManagerClient } from "../../src/app/(authenticated)/admin/items/[id]/item-manager-client";
import { ItemsListView } from "../../src/app/(authenticated)/items/item-list-view";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const managedItem = {
  id: "item-a",
  code: "ITEM-001",
  name: "測試品項",
  description: "說明",
  specification: "規格",
  baseUnit: "PCS",
  barcode: "471000000001",
  itemType: "PRODUCT" as const,
  salesEnabled: true,
  purchaseEnabled: false,
  inventoryEnabled: false,
  productionEnabled: false,
  status: "ACTIVE" as const,
  companyRelations: [
    {
      id: "relation-a",
      companyId: "company-a",
      companyItemCode: "A-001",
      salesEnabled: true,
      status: "ACTIVE" as const,
      company: { code: "A", name: "甲公司" },
    },
  ],
};

describe("P4.4b Items UI migration", () => {
  it("renders item data with unchanged detail href and query", () => {
    const html = renderToStaticMarkup(
      <ItemsListView
        context={{ authorizedCompanies: [{ id: "company-a", code: "A", name: "甲公司" }] }}
        companyId="company-a"
        query={{ search: "測試", itemType: "PRODUCT", page: "2" }}
        result={{
          items: [{
            id: "item-a",
            code: "ITEM-001",
            name: "測試品項",
            itemType: "PRODUCT",
            baseUnit: "PCS",
            barcode: "471000000001",
            companyRelations: [{ companyItemCode: "A-001" }],
          }],
          pagination: { page: 2, pageSize: 20, total: 41, totalPages: 3 },
        }}
      />,
    );

    expect(html).not.toContain("<main");
    expect(html.match(/<h1/g)).toHaveLength(1);
    for (const field of ["companyId", "search", "itemType"]) {
      expect(html).toContain(`name="${field}"`);
    }
    expect(html).toContain("A-001");
    expect(html).toContain("ITEM-001－測試品項");
    expect(html).toContain('href="/items/item-a?companyId=company-a"');
    expect(html).toContain('aria-label="品項清單分頁"');
    expect(html).toContain("search=%E6%B8%AC%E8%A9%A6");
    expect(html).toContain("itemType=PRODUCT");
    expect(html).toContain("page=1");
    expect(html).toContain("page=3");
  });

  it("distinguishes no data from filtered no-results", () => {
    const renderEmpty = (query: { search?: string; itemType?: string }) =>
      renderToStaticMarkup(
        <ItemsListView
          context={{ authorizedCompanies: [{ id: "company-a", code: "A", name: "甲公司" }] }}
          companyId="company-a"
          query={query}
          result={{ items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 } }}
        />,
      );

    expect(renderEmpty({})).toContain("尚無可銷售品項");
    expect(renderEmpty({ search: "不存在" })).toContain("查無符合條件的品項");
    expect(renderEmpty({ itemType: "RAW_MATERIAL" })).toContain("查無符合條件的品項");
    expect(renderEmpty({}).match(/aria-disabled="true"/g)).toHaveLength(2);
  });

  it("renders create and management fields with accessible required states", () => {
    const createHtml = renderToStaticMarkup(<ItemCreateClient selectedCompanyId="company-a" />);
    const managerHtml = renderToStaticMarkup(
      <ItemManagerClient
        item={managedItem}
        companies={[{ id: "company-a", code: "A", name: "甲公司" }]}
        selectedCompanyId="company-a"
      />,
    );

    for (const field of [
      "itemType", "companyItemCode", "code", "name", "baseUnit", "barcode",
      "specification", "description", "salesEnabled", "status",
    ]) {
      expect(`${createHtml}${managerHtml}`).toContain(`name="${field}"`);
    }
    expect(createHtml).toContain("（必填）");
    expect(managerHtml).toContain("公司授權");
    expect(managerHtml).toContain("此公司允許銷售");
    expect(managerHtml).not.toContain("<main");
  });

  it("keeps route, service, authorization, endpoint and payload boundaries", () => {
    const routeFiles = [
      "src/app/(authenticated)/items/page.tsx",
      "src/app/(authenticated)/items/[id]/page.tsx",
      "src/app/(authenticated)/admin/items/page.tsx",
      "src/app/(authenticated)/admin/items/[id]/page.tsx",
    ];
    for (const path of routeFiles) {
      const page = source(path);
      expect(page).not.toMatch(/max-w-|min-h-screen|px-6|py-12/);
      expect(page).not.toContain("<main");
      expect(page).not.toContain('"use client"');
    }

    const list = source("src/app/(authenticated)/items/page.tsx");
    expect(list).toContain("query.companyId ?? context.selectedCompany.id");
    expect(list).toContain("listSaleableItems(prisma");
    expect(list).toContain('pageSize: "20"');

    const adminList = source("src/app/(authenticated)/admin/items/page.tsx");
    expect(adminList).toContain("requireAdminWithAudit(prisma, context)");
    expect(adminList).toContain('name="companyId"');
    expect(adminList).toContain("listItems(prisma");

    const create = source("src/app/(authenticated)/admin/items/item-create-client.tsx");
    expect(create).toContain('fetch("/api/items"');
    expect(create).toContain('method: "POST"');
    for (const contract of [
      "companyId: selectedCompanyId", "purchaseEnabled: false", "inventoryEnabled: false",
      "productionEnabled: false", 'status: "ACTIVE"',
    ]) {
      expect(create).toContain(contract);
    }

    const manager = source("src/app/(authenticated)/admin/items/[id]/item-manager-client.tsx");
    expect(manager).toContain("`/api/items/${item.id}`");
    expect(manager).toContain("`/api/items/${item.id}/companies`");
    expect(manager).toContain('method: "PATCH"');
    expect(manager).toContain('method: "POST"');
    for (const flag of ["purchaseEnabled", "inventoryEnabled", "productionEnabled"]) {
      expect(manager).toContain(`${flag}: item.${flag}`);
    }
    expect(manager).toContain('"idempotency-key": crypto.randomUUID()');
  });
});
