// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import {
  SALES_ORDER_STATUS_LABELS,
  SalesOrderListView,
  salesOrderStatusTone,
  type SalesOrderListItemView,
} from "../../src/app/(authenticated)/sales-orders/sales-order-list-view";

afterEach(() => {
  cleanup();
});

const company = { code: "IN", name: "測試公司" };

function item(
  overrides: Partial<SalesOrderListItemView> = {},
): SalesOrderListItemView {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    orderNumber: "SO-IN-202607-000001",
    orderDate: "2026-07-27",
    customerName: "測試客戶",
    status: "CONFIRMED",
    totalAmount: "1200",
    ...overrides,
  };
}

describe("P4.5a sales order list view", () => {
  it("renders the normal list with columns, detail href and status label", () => {
    render(
      <SalesOrderListView
        company={company}
        items={[item()]}
        page={1}
        totalPages={1}
        total={1}
        query={{ search: "", status: "ALL" }}
      />,
    );

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "銷售訂單",
    );

    const link = screen.getByRole("link", { name: "SO-IN-202607-000001" });
    expect(link.getAttribute("href")).toBe(
      "/sales-orders/10000000-0000-4000-8000-000000000001",
    );
    expect(screen.getByText("測試客戶")).toBeTruthy();
    const table = screen.getByRole("table");
    expect(within(table).getByText("已確認")).toBeTruthy();
    expect(screen.getByText(/NT\$ 1200/)).toBeTruthy();

    expect(
      screen.getByRole("link", { name: "建立草稿" }).getAttribute("href"),
    ).toBe("/sales-orders/new");
  });

  it("associates every filter control with a visible label", () => {
    render(
      <SalesOrderListView
        company={company}
        items={[]}
        page={1}
        totalPages={1}
        total={0}
        query={{ search: "", status: "ALL" }}
      />,
    );
    expect(screen.getByLabelText("訂單號或客戶名稱")).toBeTruthy();
    expect(screen.getByLabelText("狀態")).toBeTruthy();
  });

  it("renders a no-data empty state when the list is empty without filters", () => {
    render(
      <SalesOrderListView
        company={company}
        items={[]}
        page={1}
        totalPages={1}
        total={0}
        query={{ search: "", status: "ALL" }}
      />,
    );
    expect(screen.getByText("尚無銷售訂單")).toBeTruthy();
  });

  it("renders a distinct filtered no-results empty state", () => {
    render(
      <SalesOrderListView
        company={company}
        items={[]}
        page={1}
        totalPages={1}
        total={0}
        query={{ search: "不存在的訂單", status: "ALL" }}
      />,
    );
    expect(screen.getByText("查無符合條件的訂單")).toBeTruthy();
    expect(screen.queryByText("尚無銷售訂單")).toBeNull();
  });

  it("preserves existing search/status filters and never adds a companyId param in pagination hrefs", () => {
    render(
      <SalesOrderListView
        company={company}
        items={[item()]}
        page={2}
        totalPages={3}
        total={45}
        query={{ search: "SO-IN", status: "CONFIRMED" }}
      />,
    );
    const prev = screen.getByRole("link", { name: "上一頁" });
    const next = screen.getByRole("link", { name: "下一頁" });
    expect(prev.getAttribute("href")).toBe(
      "/sales-orders?search=SO-IN&status=CONFIRMED&page=1",
    );
    expect(next.getAttribute("href")).toBe(
      "/sales-orders?search=SO-IN&status=CONFIRMED&page=3",
    );
    expect(prev.getAttribute("href")).not.toContain("companyId");
    expect(next.getAttribute("href")).not.toContain("companyId");
  });

  it("marks pagination controls as disabled and non-interactive at range boundaries", () => {
    render(
      <SalesOrderListView
        company={company}
        items={[item()]}
        page={1}
        totalPages={1}
        total={1}
        query={{ search: "", status: "ALL" }}
      />,
    );
    expect(screen.queryByRole("link", { name: "上一頁" })).toBeNull();
    expect(screen.queryByRole("link", { name: "下一頁" })).toBeNull();
    expect(screen.getByText("上一頁").getAttribute("aria-disabled")).toBe(
      "true",
    );
    expect(screen.getByText("下一頁").getAttribute("aria-disabled")).toBe(
      "true",
    );
  });

  it("maps every sales order status to its existing Chinese label and a distinct tone", () => {
    expect(SALES_ORDER_STATUS_LABELS).toEqual({
      DRAFT: "草稿",
      CONFIRMED: "已確認",
      DELIVERY_CREATED: "已建立銷貨單",
      SHIPPED: "已出貨",
      COMPLETED: "已完成",
      VOIDED: "作廢",
    });
    expect(salesOrderStatusTone("VOIDED")).toBe("danger");
    expect(salesOrderStatusTone("COMPLETED")).toBe("success");
    expect(salesOrderStatusTone("DRAFT")).toBe("neutral");
  });

  it("exposes an accessible table structure with a caption and column headers", () => {
    render(
      <SalesOrderListView
        company={company}
        items={[item()]}
        page={1}
        totalPages={1}
        total={1}
        query={{ search: "", status: "ALL" }}
      />,
    );
    const table = screen.getByRole("table");
    expect(within(table).getByText("銷售訂單查詢結果")).toBeTruthy();
    expect(screen.getAllByRole("columnheader")).toHaveLength(5);
  });

  it("does not render any sorting controls or unsupported filter fields", () => {
    render(
      <SalesOrderListView
        company={company}
        items={[item()]}
        page={1}
        totalPages={1}
        total={1}
        query={{ search: "", status: "ALL" }}
      />,
    );
    expect(screen.queryByRole("button", { name: /排序/ })).toBeNull();
    expect(screen.queryByLabelText(/日期/)).toBeNull();
    expect(screen.queryByLabelText(/每頁筆數/)).toBeNull();
    expect(screen.queryAllByRole("columnheader", { name: /排序/ })).toHaveLength(
      0,
    );
  });

  it("renders as a single fragment so the server page contract owns the only top-level main", () => {
    const html = renderToStaticMarkup(
      <main data-testid="page-main">
        <SalesOrderListView
          company={company}
          items={[item()]}
          page={1}
          totalPages={1}
          total={1}
          query={{ search: "", status: "ALL" }}
        />
      </main>,
    );
    expect(html.match(/<main/g)?.length).toBe(1);
  });
});
