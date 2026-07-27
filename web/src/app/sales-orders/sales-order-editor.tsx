"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type CustomerOption = {
  id: string;
  code: string;
  name: string;
  contacts: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; code: string; name: string }>;
};

type ItemOption = {
  id: string;
  code: string;
  name: string;
  baseUnit: string;
};

type EditorLine = {
  id?: string;
  itemId: string;
  quantity: string;
  unitPrice: string;
  manualPriceReason: string;
};

type InitialOrder = {
  id: string;
  orderNumber: string;
  orderDate: string;
  customerId: string;
  deliveryLocationId: string;
  customerContactId: string | null;
  paymentTermsText: string | null;
  status: string;
  revisionNo: number;
  subtotal: string;
  freightAmount: string;
  totalAmount: string;
  lines: EditorLine[];
  snapshots: unknown;
};

function idempotencyHeaders() {
  return {
    "content-type": "application/json",
    "idempotency-key": crypto.randomUUID(),
  };
}
export function SalesOrderEditor({
  customers,
  items,
  initial,
}: {
  customers: CustomerOption[];
  items: ItemOption[];
  initial?: InitialOrder;
}) {
  const router = useRouter();
  const [orderDate, setOrderDate] = useState(
    initial?.orderDate ?? new Date().toISOString().slice(0, 10),
  );
  const [customerId, setCustomerId] = useState(
    initial?.customerId ?? customers[0]?.id ?? "",
  );
  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === customerId),
    [customerId, customers],
  );
  const [deliveryLocationId, setDeliveryLocationId] = useState(
    initial?.deliveryLocationId ??
      selectedCustomer?.locations[0]?.id ??
      "",
  );
  const [customerContactId, setCustomerContactId] = useState(
    initial?.customerContactId ?? "",
  );
  const [paymentTermsText, setPaymentTermsText] = useState(
    initial?.paymentTermsText ?? "",
  );
  const [lines, setLines] = useState<EditorLine[]>(
    initial?.lines ?? [
      {
        itemId: items[0]?.id ?? "",
        quantity: "1",
        unitPrice: "",
        manualPriceReason: "",
      },
    ],
  );
  const [message, setMessage] = useState("");
  const editable = !initial || initial.status === "DRAFT";

  function draftPayload() {
    return {
      orderDate,
      customerId,
      deliveryLocationId,
      customerContactId: customerContactId || null,
      paymentTermsText: paymentTermsText || null,
      lines: lines.map((line) => ({
        ...(line.id ? { id: line.id } : {}),
        itemId: line.itemId,
        quantity: line.quantity,
        ...(line.unitPrice ? { unitPrice: line.unitPrice } : {}),
        manualPriceReason: line.manualPriceReason || null,
      })),
    };
  }

  async function request(
    url: string,
    method: "POST" | "PATCH",
    body: unknown,
  ) {
    setMessage("處理中…");
    const response = await fetch(url, {
      method,
      headers: idempotencyHeaders(),
      body: JSON.stringify(body),
    });
    const value = await response.json();
    if (!response.ok) {
      setMessage(value.error?.message ?? "操作失敗");
      return null;
    }
    setMessage("操作完成");
    return value;
  }

  async function save() {
    const value = await request(
      initial ? `/api/sales-orders/${initial.id}` : "/api/sales-orders",
      initial ? "PATCH" : "POST",
      { draft: draftPayload() },
    );
    if (value?.id) router.push(`/sales-orders/${value.id}`);
    router.refresh();
  }

  async function action(name: "confirm" | "revision" | "void") {
    if (!initial) return;
    const reason =
      name === "void" ? window.prompt("請輸入作廢理由")?.trim() : undefined;
    if (name === "void" && !reason) {
      setMessage("作廢理由必填");
      return;
    }
    const value = await request(
      `/api/sales-orders/${initial.id}/${name}`,
      "POST",
      name === "void" ? { reason } : {},
    );
    if (value) router.refresh();
  }

  return (
    <div className="mt-8 space-y-6">
      {initial ? (
        <section className="grid gap-3 rounded-2xl border bg-white p-5 md:grid-cols-4">
          <div>
            <span className="text-xs text-slate-500">訂單號</span>
            <p className="font-semibold">{initial.orderNumber}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">狀態</span>
            <p className="font-semibold">{initial.status}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">修訂版次</span>
            <p className="font-semibold">{initial.revisionNo}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">金額</span>
            <p className="font-semibold">
              未稅 {initial.subtotal} + 運費 {initial.freightAmount} ={" "}
              {initial.totalAmount}
            </p>
          </div>
        </section>
      ) : (
        <p className="rounded-lg bg-teal-50 p-3 text-sm text-teal-900">
          訂單號由系統在草稿建立成功時產生。
        </p>
      )}

      <section className="grid gap-4 rounded-2xl border bg-white p-6 md:grid-cols-2">
        <label>
          訂單日期
          <input
            type="date"
            value={orderDate}
            disabled={!editable}
            onChange={(event) => setOrderDate(event.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label>
          客戶
          <select
            value={customerId}
            disabled={!editable}
            onChange={(event) => {
              const next = customers.find(
                (customer) => customer.id === event.target.value,
              );
              setCustomerId(event.target.value);
              setDeliveryLocationId(next?.locations[0]?.id ?? "");
              setCustomerContactId("");
            }}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          >
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.code}－{customer.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          送貨地點
          <select
            value={deliveryLocationId}
            disabled={!editable}
            onChange={(event) => setDeliveryLocationId(event.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          >
            {selectedCustomer?.locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.code}－{location.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          聯絡人（可不選）
          <select
            value={customerContactId}
            disabled={!editable}
            onChange={(event) => setCustomerContactId(event.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          >
            <option value="">預設主要聯絡人／不指定</option>
            {selectedCustomer?.contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.name}
              </option>
            ))}
          </select>
        </label>
        <label className="md:col-span-2">
          付款條件文字
          <input
            value={paymentTermsText}
            disabled={!editable}
            onChange={(event) => setPaymentTermsText(event.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
      </section>

      <section className="rounded-2xl border bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">訂單明細</h2>
          {editable ? (
            <button
              type="button"
              onClick={() =>
                setLines((current) => [
                  ...current,
                  {
                    itemId: items[0]?.id ?? "",
                    quantity: "1",
                    unitPrice: "",
                    manualPriceReason: "",
                  },
                ])
              }
              className="rounded-lg border px-3 py-2"
            >
              新增明細
            </button>
          ) : null}
        </div>
        <div className="mt-4 space-y-3">
          {lines.map((line, index) => (
            <div
              key={line.id ?? index}
              className="grid gap-3 rounded-xl border p-4 md:grid-cols-5"
            >
              <select
                value={line.itemId}
                disabled={!editable}
                onChange={(event) =>
                  setLines((current) =>
                    current.map((entry, position) =>
                      position === index
                        ? { ...entry, itemId: event.target.value }
                        : entry,
                    ),
                  )
                }
                className="rounded-lg border px-3 py-2 md:col-span-2"
              >
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code}－{item.name}（{item.baseUnit}）
                  </option>
                ))}
              </select>
              <input
                value={line.quantity}
                disabled={!editable}
                aria-label="數量"
                onChange={(event) =>
                  setLines((current) =>
                    current.map((entry, position) =>
                      position === index
                        ? { ...entry, quantity: event.target.value }
                        : entry,
                    ),
                  )
                }
                placeholder="數量"
                className="rounded-lg border px-3 py-2"
              />
              <input
                value={line.unitPrice}
                disabled={!editable}
                aria-label="未稅成交單價"
                onChange={(event) =>
                  setLines((current) =>
                    current.map((entry, position) =>
                      position === index
                        ? { ...entry, unitPrice: event.target.value }
                        : entry,
                    ),
                  )
                }
                placeholder="未稅成交單價；空白取標準價"
                className="rounded-lg border px-3 py-2"
              />
              <div className="flex gap-2">
                <input
                  value={line.manualPriceReason}
                  disabled={!editable}
                  aria-label="人工價格理由"
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((entry, position) =>
                        position === index
                          ? {
                              ...entry,
                              manualPriceReason: event.target.value,
                            }
                          : entry,
                      ),
                    )
                  }
                  placeholder="人工價格理由"
                  className="min-w-0 flex-1 rounded-lg border px-3 py-2"
                />
                {editable ? (
                  <button
                    type="button"
                    onClick={() =>
                      setLines((current) =>
                        current.filter((_, position) => position !== index),
                      )
                    }
                    className="rounded-lg border border-red-300 px-3 text-red-700"
                  >
                    移除
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-slate-500">
          數量最多四位小數，未稅單價最多五位小數；明細金額以 half-up
          四捨五入至元。人工價格及標準價改價均須填寫理由。
        </p>
      </section>

      <div className="flex flex-wrap gap-3">
        {editable ? (
          <button
            type="button"
            onClick={save}
            className="rounded-lg bg-teal-700 px-4 py-2 text-white"
          >
            {initial ? "儲存草稿" : "建立草稿"}
          </button>
        ) : null}
        {initial?.status === "DRAFT" ? (
          <button
            type="button"
            onClick={() => action("confirm")}
            className="rounded-lg bg-blue-700 px-4 py-2 text-white"
          >
            確認訂單
          </button>
        ) : null}
        {initial?.status === "CONFIRMED" ? (
          <button
            type="button"
            onClick={() => action("revision")}
            className="rounded-lg border px-4 py-2"
          >
            開始修訂
          </button>
        ) : null}
        {initial && ["DRAFT", "CONFIRMED"].includes(initial.status) ? (
          <button
            type="button"
            onClick={() => action("void")}
            className="rounded-lg border border-red-500 px-4 py-2 text-red-700"
          >
            作廢訂單
          </button>
        ) : null}
        <span className="self-center text-sm text-slate-600">{message}</span>
      </div>

      {initial ? (
        <details className="rounded-2xl border bg-white p-5">
          <summary className="cursor-pointer font-semibold">
            快照與來源資訊（唯讀）
          </summary>
          <pre className="mt-4 overflow-auto whitespace-pre-wrap text-xs">
            {JSON.stringify(initial.snapshots, null, 2)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
