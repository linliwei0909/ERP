// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PageHeader } from "../../src/components/app-shell/page-header";
import { Card, LinkButton, Section } from "../../src/components/ui";
import {
  DeliveryNoteDetailView,
  DeliveryNoteListView,
  deliveryNoteStatusTone,
} from "../../src/app/(authenticated)/delivery-notes/delivery-note-view";
import type {
  DeliveryNoteDetailDto,
  DeliveryNoteSummaryDto,
} from "../../src/lib/delivery-notes/api-types";

const ids = {
  company: "10000000-0000-4000-8000-000000000001",
  order: "10000000-0000-4000-8000-000000000002",
  note: "10000000-0000-4000-8000-000000000003",
  note2: "10000000-0000-4000-8000-000000000010",
  line: "10000000-0000-4000-8000-000000000004",
  orderLine: "10000000-0000-4000-8000-000000000005",
  item: "10000000-0000-4000-8000-000000000006",
  actor: "10000000-0000-4000-8000-000000000007",
};

function summary(
  overrides: Partial<DeliveryNoteSummaryDto> = {},
): DeliveryNoteSummaryDto {
  return {
    id: ids.note,
    companyId: ids.company,
    deliveryNoteNumber: "DN-IN-202607-000001",
    deliveryNoteDate: "2026-07-27",
    fiscalYear: 2026,
    fiscalMonth: 7,
    salesOrderId: ids.order,
    salesOrderNumber: "SO-IN-202607-000001",
    salesOrderRevisionNo: 1,
    status: "ACTIVE",
    customer: { name: "測試客戶" },
    subtotal: "100",
    freightAmount: "20",
    totalAmount: "120",
    voidSource: null,
    voidedAt: null,
    voidReason: null,
    createdAt: "2026-07-27T03:00:00.000Z",
    ...overrides,
  };
}

function detail(
  overrides: Partial<DeliveryNoteDetailDto> = {},
): DeliveryNoteDetailDto {
  return {
    ...summary(),
    companySnapshot: { companyName: "測試公司" },
    customerSnapshot: { name: "測試客戶" },
    customerCompanySnapshot: { customerCode: "C001" },
    contactSnapshot: { name: "王小明" },
    deliverySnapshot: {
      name: "台北倉",
      recipientName: "收件人",
      fullAddress: "台北市測試路 1 號",
    },
    paymentTermsText: "月結 30 天",
    freightSnapshot: { mode: "FIXED_PER_LOCATION" },
    createdById: ids.actor,
    createdBy: { id: ids.actor, username: "admin" },
    replacedDeliveryNoteId: null,
    replacementDeliveryNoteId: null,
    replacedDeliveryNote: null,
    replacementDeliveryNote: null,
    voidedById: null,
    voidedBy: null,
    actualDeliveryDate: null,
    firstPrintedAt: null,
    firstPrintedById: null,
    firstPrintedBy: null,
    reprintCount: 0,
    formalPdf: null,
    printCapabilities: {
      canFormalPrint: true,
      canReprint: false,
      canDownload: false,
    },
    lines: [
      {
        id: ids.line,
        lineNumber: 1,
        salesOrderLineId: ids.orderLine,
        itemId: ids.item,
        itemSnapshot: {
          companyItemCode: "ITEM-001",
          name: "測試品項",
          baseUnit: "PCS",
        },
        priceSnapshot: { priceSource: "STANDARD" },
        quantity: "2.0000",
        unitPrice: "50.00000",
        lineAmount: "100",
      },
    ],
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe("P4.6a delivery-note-view status tone mapping", () => {
  it.each([
    ["ACTIVE", "success"],
    ["SHIPPED", "info"],
    ["RECEIVABLE_CREATED", "info"],
    ["VOIDED", "danger"],
  ] as const)("maps status %s to tone %s", (status, tone) => {
    expect(deliveryNoteStatusTone(status)).toBe(tone);
  });

  it("uses the same shared status tone in list and detail views, exactly once per render", () => {
    const item = {
      ...summary({ status: "VOIDED" }),
      createdBy: { id: ids.actor, username: "admin" },
    };
    const listHtml = renderToStaticMarkup(
      <DeliveryNoteListView
        company={{ code: "IN", name: "測試公司" }}
        items={[item]}
        page={1}
        totalPages={1}
        total={1}
        query={{
          status: "ALL",
          deliveryNoteNumber: "",
          customerKeyword: "",
          deliveryNoteDateFrom: "",
          deliveryNoteDateTo: "",
        }}
      />,
    );
    const detailHtml = renderToStaticMarkup(
      <DeliveryNoteDetailView note={detail({ status: "VOIDED" })} />,
    );
    expect(listHtml.match(/data-tone="danger"/g)?.length).toBe(1);
    expect(detailHtml.match(/data-tone="danger"/g)?.length).toBe(1);
  });
});

describe("P4.6a DeliveryNoteDetailView legacy markup removal", () => {
  it("no longer renders the outdated P3.2 phase label", () => {
    render(<DeliveryNoteDetailView note={detail()} />);
    expect(screen.queryByText(/P3\.2/)).toBeNull();
  });

  it("does not render print or void action controls inside DeliveryNoteDetailView", () => {
    render(<DeliveryNoteDetailView note={detail()} />);
    expect(screen.queryByText("正式列印")).toBeNull();
    expect(screen.queryByText("補印")).toBeNull();
    expect(screen.queryByText("管理員作廢")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("exposes an accessible read-only line table with caption and column headers", () => {
    render(<DeliveryNoteDetailView note={detail()} />);
    const table = screen.getByRole("table");
    expect(within(table).getByText("銷貨明細（唯讀）")).toBeTruthy();
    expect(screen.getAllByRole("columnheader")).toHaveLength(6);
  });

  it("shows an explicit placeholder when the delivery address snapshot is missing", () => {
    render(
      <DeliveryNoteDetailView
        note={detail({
          deliverySnapshot: {
            name: "台北倉",
            recipientName: "收件人",
            fullAddress: null,
          },
        })}
      />,
    );
    const deliveryLocationItem = screen
      .getByText("送貨地點")
      .closest("div") as HTMLElement;
    expect(within(deliveryLocationItem).getByText("台北倉")).toBeTruthy();
    expect(within(deliveryLocationItem).getByText("—")).toBeTruthy();
  });

  it("renders an empty-line placeholder instead of an empty table body when there are no lines", () => {
    render(<DeliveryNoteDetailView note={detail({ lines: [] })} />);
    expect(screen.getByText("查無明細")).toBeTruthy();
    expect(screen.queryByText("測試品項")).toBeNull();
  });
});

describe("P4.6a page composition (mirrors [id]/page.tsx)", () => {
  function renderRoute(child: React.ReactNode) {
    return renderToStaticMarkup(
      <main data-testid="route-main">
        <PageHeader
          containerVariant="wide"
          context="銷貨作業"
          title="銷貨單明細"
          actions={
            <LinkButton href="/delivery-notes" variant="secondary">
              返回清單
            </LinkButton>
          }
        />
        <Card>
          <Section title="銷貨單操作">{null}</Section>
        </Card>
        {child}
      </main>,
    );
  }

  it("keeps a single h1 and a single top-level main when showing the read-only detail view", () => {
    const html = renderRoute(<DeliveryNoteDetailView note={detail()} />);
    expect(html.match(/<main/g)?.length).toBe(1);
    expect(html.match(/<h1/g)?.length).toBe(1);
    expect(html).toContain("返回清單");
    expect(html).toContain("銷貨單操作");
  });

  it("keeps a single h1 and a single top-level main for a VOIDED note with replacement history", () => {
    const html = renderRoute(
      <DeliveryNoteDetailView
        note={detail({
          status: "VOIDED",
          voidReason: "資料錯誤",
          voidedAt: "2026-07-27T04:00:00.000Z",
          voidedById: ids.actor,
          voidedBy: { id: ids.actor, username: "admin" },
          replacementDeliveryNote: {
            id: ids.note2,
            deliveryNoteNumber: "DN-IN-202607-000002",
            deliveryNoteDate: "2026-07-28",
            salesOrderRevisionNo: 2,
            status: "ACTIVE",
          },
        })}
      />,
    );
    expect(html.match(/<main/g)?.length).toBe(1);
    expect(html.match(/<h1/g)?.length).toBe(1);
    expect(html).toContain("重建歷程");
    expect(html).toContain("DN-IN-202607-000002");
  });
});
