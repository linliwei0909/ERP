"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import pageStyles from "@/components/app-shell/page-contract.module.css";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  FormActions,
  Input,
  Section,
  Select,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableContainer,
  TableEmptyRow,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { ItemCombobox } from "./item-combobox";
import soStyles from "./sales-orders-ui.module.css";

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

// Scoped to the draft save flow only (create/update). Status actions live in
// sales-order-status-actions.tsx with their own independent request helper —
// they must not share this one.
type SaveRequestOutcome<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; message: string };

async function performSaveRequest<T = unknown>(
  url: string,
  method: "POST" | "PATCH",
  body: unknown,
): Promise<SaveRequestOutcome<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: idempotencyHeaders(),
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, message: "網路連線異常，請稍後再試一次" };
  }
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    return { ok: false, message: "伺服器回應格式異常，請稍後再試一次" };
  }
  if (!response.ok) {
    const message =
      (value as { error?: { message?: string } } | null)?.error?.message ??
      "操作失敗";
    return { ok: false, message };
  }
  return { ok: true, value: value as T };
}

// Re-exported for backward compatibility with existing imports (e.g.
// tests/unit/sales-orders.test.ts); canonical implementation now lives in
// sales-order-status-actions.tsx, which owns all status-action presentation.
export {
  canStartSalesOrderRevision,
  canVoidSalesOrder,
} from "./sales-order-status-actions";

export function SalesOrderEditor({
  customers,
  items,
  initial,
  canManage = true,
}: {
  customers: CustomerOption[];
  items: ItemOption[];
  initial?: InitialOrder;
  canManage?: boolean;
}) {
  const router = useRouter();
  const [orderDate, setOrderDate] = useState(
    initial?.orderDate ?? new Date().toISOString().slice(0, 10),
  );
  const [customerId, setCustomerId] = useState(
    initial?.customerId ?? customers[0]?.id ?? "",
  );
  const selectedCustomer = customers.find(
    (customer) => customer.id === customerId,
  );
  const [deliveryLocationId, setDeliveryLocationId] = useState(
    initial?.deliveryLocationId ?? selectedCustomer?.locations[0]?.id ?? "",
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
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveInFlightRef = useRef(false);
  const editable = canManage && (!initial || initial.status === "DRAFT");

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

  function addLine() {
    setLines((current) => [
      ...current,
      {
        itemId: items[0]?.id ?? "",
        quantity: "1",
        unitPrice: "",
        manualPriceReason: "",
      },
    ]);
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, position) => position !== index));
  }

  function updateLine(index: number, patch: Partial<EditorLine>) {
    setLines((current) =>
      current.map((entry, position) =>
        position === index ? { ...entry, ...patch } : entry,
      ),
    );
  }

  async function save() {
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const outcome = await performSaveRequest<{ id?: string }>(
        initial ? `/api/sales-orders/${initial.id}` : "/api/sales-orders",
        initial ? "PATCH" : "POST",
        { draft: draftPayload() },
      );
      if (!outcome.ok) {
        setSaveError(outcome.message);
        return;
      }
      if (outcome.value?.id) router.push(`/sales-orders/${outcome.value.id}`);
      router.refresh();
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div className={pageStyles.pageStack}>
      {!initial ? (
        <Card>
          <Alert tone="info">訂單號由系統在草稿建立成功時產生。</Alert>
        </Card>
      ) : null}

      <Card>
        <Section title="客戶與送貨資料">
          <div className={pageStyles.formGrid}>
            <Field label="訂單日期">
              <Input
                type="date"
                value={orderDate}
                disabled={!editable}
                onChange={(event) => setOrderDate(event.target.value)}
              />
            </Field>
            <Field label="客戶">
              <Select
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
              >
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.code}－{customer.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="送貨地點">
              <Select
                value={deliveryLocationId}
                disabled={!editable}
                onChange={(event) => setDeliveryLocationId(event.target.value)}
              >
                {selectedCustomer?.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.code}－{location.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="聯絡人（可不選）">
              <Select
                value={customerContactId}
                disabled={!editable}
                onChange={(event) => setCustomerContactId(event.target.value)}
              >
                <option value="">預設主要聯絡人／不指定</option>
                {selectedCustomer?.contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Section>

        <Section title="付款條件">
          <Field label="付款條件文字">
            <Input
              value={paymentTermsText}
              disabled={!editable}
              onChange={(event) => setPaymentTermsText(event.target.value)}
            />
          </Field>
        </Section>
      </Card>

      <Card>
        <Section
          title="訂單明細"
          actions={
            editable ? (
              <Button type="button" variant="secondary" onClick={addLine}>
                新增明細
              </Button>
            ) : null
          }
        >
          <TableContainer>
            <Table className={soStyles.lineTable}>
              <TableCaption>訂單明細</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>品項</TableHead>
                  <TableHead>數量</TableHead>
                  <TableHead>未稅成交單價</TableHead>
                  <TableHead>人工價格理由</TableHead>
                  {editable ? <TableHead>操作</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line, index) => (
                  <TableRow key={line.id ?? index}>
                    <TableCell className={soStyles.lineCell}>
                      <ItemCombobox
                        items={items}
                        value={line.itemId}
                        disabled={!editable}
                        label="品項"
                        onChange={(itemId) => updateLine(index, { itemId })}
                      />
                    </TableCell>
                    <TableCell className={soStyles.lineCell}>
                      <Input
                        value={line.quantity}
                        disabled={!editable}
                        aria-label="數量"
                        placeholder="數量"
                        onChange={(event) =>
                          updateLine(index, { quantity: event.target.value })
                        }
                      />
                    </TableCell>
                    <TableCell className={soStyles.lineCell}>
                      <Input
                        value={line.unitPrice}
                        disabled={!editable}
                        aria-label="未稅成交單價"
                        placeholder="未稅成交單價；空白取標準價"
                        onChange={(event) =>
                          updateLine(index, { unitPrice: event.target.value })
                        }
                      />
                    </TableCell>
                    <TableCell className={soStyles.lineCell}>
                      <Input
                        value={line.manualPriceReason}
                        disabled={!editable}
                        aria-label="人工價格理由"
                        placeholder="人工價格理由"
                        onChange={(event) =>
                          updateLine(index, {
                            manualPriceReason: event.target.value,
                          })
                        }
                      />
                    </TableCell>
                    {editable ? (
                      <TableCell className={soStyles.lineCell}>
                        <Button
                          type="button"
                          variant="secondary"
                          aria-label={`移除第 ${index + 1} 列`}
                          onClick={() => removeLine(index)}
                        >
                          移除
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
                {lines.length === 0 ? (
                  <TableEmptyRow colSpan={editable ? 5 : 4}>
                    <EmptyState
                      variant="no-data"
                      title="尚無明細"
                      description="請新增至少一筆明細。"
                    />
                  </TableEmptyRow>
                ) : null}
              </TableBody>
            </Table>
          </TableContainer>
          <p className={pageStyles.tableSubtext}>
            數量最多四位小數，未稅單價最多五位小數；明細金額以 half-up
            四捨五入至元。人工價格及標準價改價均須填寫理由。
          </p>
        </Section>
      </Card>

      {editable ? (
        <Card>
          {saveError ? (
            <Alert tone="danger" title="儲存失敗">
              {saveError}
            </Alert>
          ) : null}
          <FormActions
            align="start"
            primary={
              <Button
                type="button"
                onClick={save}
                pending={saving}
                pendingLabel={initial ? "儲存中…" : "建立中…"}
              >
                {initial ? "儲存草稿" : "建立草稿"}
              </Button>
            }
          />
        </Card>
      ) : null}
    </div>
  );
}
