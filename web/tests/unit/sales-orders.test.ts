import { describe, expect, it } from "vitest";
import { hasPermission } from "../../src/lib/auth/rbac";
import {
  addIntegerAmounts,
  addQuantities,
  calculateLineAmount,
  normalizeQuantity,
  normalizeUnitPrice,
} from "../../src/lib/sales-orders/money";
import {
  assertP31SalesOrderTransition,
  SalesOrderStatusTransitionError,
} from "../../src/lib/sales-orders/state-machine";
import { salesOrderDraftInputSchema } from "../../src/lib/sales-orders/validation";
import {
  COMPANY_SETTING_KEYS,
  validateCompanySetting,
} from "../../src/lib/company-settings/registry";
import {
  canStartSalesOrderRevision,
  canVoidSalesOrder,
} from "../../src/app/(authenticated)/sales-orders/sales-order-editor";

describe("P3.1 sales-order rules", () => {
  it("normalizes quantity and unit price without JavaScript floating point", () => {
    expect(normalizeQuantity("1.2300")).toBe("1.23");
    expect(normalizeUnitPrice("10.12340")).toBe("10.1234");
    expect(() => normalizeQuantity("0")).toThrow("數量必須大於 0");
    expect(() => normalizeQuantity("1.00001")).toThrow();
    expect(() => normalizeUnitPrice("-1")).toThrow();
  });

  it("rounds line amounts half-up to whole TWD", () => {
    expect(calculateLineAmount("1", "10.49999")).toBe("10");
    expect(calculateLineAmount("1", "10.50000")).toBe("11");
    expect(calculateLineAmount("1.2345", "3")).toBe("4");
    expect(addIntegerAmounts(["10", "20", "0"])).toBe("30");
    expect(addQuantities(["1.0001", "2.0002"])).toBe("3.0003");
  });

  it("permits only P3.1 state transitions", () => {
    expect(() => assertP31SalesOrderTransition("DRAFT", "CONFIRMED")).not.toThrow();
    expect(() => assertP31SalesOrderTransition("CONFIRMED", "DRAFT")).not.toThrow();
    expect(() => assertP31SalesOrderTransition("DRAFT", "VOIDED")).not.toThrow();
    expect(() =>
      assertP31SalesOrderTransition("DRAFT", "DELIVERY_CREATED"),
    ).toThrow(SalesOrderStatusTransitionError);
    expect(() =>
      assertP31SalesOrderTransition("SHIPPED", "VOIDED"),
    ).toThrow(SalesOrderStatusTransitionError);
  });

  it("grants both formal roles read and manage access", () => {
    expect(hasPermission(["ADMIN"], "sales_orders.read")).toBe(true);
    expect(hasPermission(["ADMIN"], "sales_orders.manage")).toBe(true);
    expect(hasPermission(["ORDER_ENTRY"], "sales_orders.read")).toBe(true);
    expect(hasPermission(["ORDER_ENTRY"], "sales_orders.manage")).toBe(true);
  });

  it("exposes revision and void actions for delivery-created orders", () => {
    expect(canStartSalesOrderRevision("CONFIRMED")).toBe(true);
    expect(canStartSalesOrderRevision("DELIVERY_CREATED")).toBe(true);
    expect(canStartSalesOrderRevision("DRAFT")).toBe(false);
    expect(canStartSalesOrderRevision("SHIPPED")).toBe(false);

    expect(canVoidSalesOrder("DRAFT")).toBe(true);
    expect(canVoidSalesOrder("CONFIRMED")).toBe(true);
    expect(canVoidSalesOrder("DELIVERY_CREATED")).toBe(true);
    expect(canVoidSalesOrder("SHIPPED")).toBe(false);
    expect(canVoidSalesOrder("RECEIVABLE_CREATED")).toBe(false);
    expect(canVoidSalesOrder("VOIDED")).toBe(false);
  });

  it("validates the draft contract and rejects client-owned fields", () => {
    const valid = {
      orderDate: "2026-07-27",
      customerId: "10000000-0000-4000-8000-000000000001",
      deliveryLocationId: "10000000-0000-4000-8000-000000000002",
      lines: [
        {
          itemId: "10000000-0000-4000-8000-000000000003",
          quantity: "1",
        },
      ],
    };
    expect(salesOrderDraftInputSchema.parse(valid).lines).toHaveLength(1);
    expect(() =>
      salesOrderDraftInputSchema.parse({
        ...valid,
        orderNumber: "SO-FAKE",
      }),
    ).toThrow();
  });

  it("validates formal company setting keys and values", () => {
    expect(
      validateCompanySetting(
        COMPANY_SETTING_KEYS.DOCUMENT_COMPANY_CODE,
        " in ",
      ),
    ).toBe("IN");
    expect(() =>
      validateCompanySetting(
        COMPANY_SETTING_KEYS.DOCUMENT_COMPANY_CODE,
        "IND",
      ),
    ).toThrow();
    expect(
      validateCompanySetting(
        COMPANY_SETTING_KEYS.COMPANY_TAX_ID,
        "01234567",
      ),
    ).toBe("01234567");
    expect(() =>
      validateCompanySetting(
        COMPANY_SETTING_KEYS.COMPANY_TAX_ID,
        12345678,
      ),
    ).toThrow();
    expect(
      validateCompanySetting(
        COMPANY_SETTING_KEYS.COMPANY_PHONE,
        " 02-29571175 ",
      ),
    ).toBe("02-29571175");
  });
});
