import type { ReactNode } from "react";
import Link from "next/link";
import type {
  DeliveryNoteActorDto,
  DeliveryNoteDetailDto,
  DeliveryNoteSummaryDto,
} from "@/lib/delivery-notes/api-types";

export type DeliveryNoteListItemView = DeliveryNoteSummaryDto & {
  createdBy: DeliveryNoteActorDto;
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "有效",
  SHIPPED: "已送貨",
  RECEIVABLE_CREATED: "已建立應收",
  VOIDED: "已作廢",
};

function objectValue(
  value: unknown,
  key: string,
): string | null {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    key in value
  ) {
    const item = (value as Record<string, unknown>)[key];
    return typeof item === "string" && item ? item : null;
  }
  return null;
}

export function formatAmount(value: string): string {
  const [integer, decimal] = value.split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decimal ? `${grouped}.${decimal}` : grouped;
}

export function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function StatusBadge({ status }: { status: string }) {
  const style =
    status === "VOIDED"
      ? "bg-rose-100 text-rose-800"
      : status === "ACTIVE"
        ? "bg-emerald-100 text-emerald-800"
        : "bg-slate-100 text-slate-700";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function DeliveryNoteListView({
  company,
  items,
  page,
  totalPages,
  total,
  query,
}: {
  company: { code: string; name: string };
  items: DeliveryNoteListItemView[];
  page: number;
  totalPages: number;
  total: number;
  query: {
    status: string;
    deliveryNoteNumber: string;
    customerKeyword: string;
    deliveryNoteDateFrom: string;
    deliveryNoteDateTo: string;
  };
}) {
  const pageHref = (target: number) => {
    const params = new URLSearchParams({
      ...query,
      page: String(target),
    });
    for (const [key, value] of [...params.entries()]) {
      if (!value || (key === "status" && value === "ALL")) {
        params.delete(key);
      }
    }
    return `/delivery-notes?${params.toString()}`;
  };

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-teal-700">P3.2 銷貨單</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">銷貨單清單</h1>
          <p className="mt-2 text-sm text-slate-500">
            目前公司：{company.code}－{company.name}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/" className="rounded-lg border border-slate-300 px-4 py-2">
            返回首頁
          </Link>
          <Link
            href="/sales-orders"
            className="rounded-lg bg-teal-700 px-4 py-2 text-white"
          >
            前往銷售訂單
          </Link>
        </div>
      </header>

      <form className="mt-8 grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 lg:grid-cols-6">
        <input
          name="deliveryNoteNumber"
          defaultValue={query.deliveryNoteNumber}
          placeholder="銷貨單號"
          className="rounded-lg border border-slate-300 px-3 py-2"
        />
        <input
          name="customerKeyword"
          defaultValue={query.customerKeyword}
          placeholder="客戶名稱"
          className="rounded-lg border border-slate-300 px-3 py-2"
        />
        <select
          name="status"
          defaultValue={query.status}
          className="rounded-lg border border-slate-300 px-3 py-2"
        >
          <option value="ALL">全部狀態</option>
          <option value="ACTIVE">有效</option>
          <option value="SHIPPED">已出貨</option>
          <option value="RECEIVABLE_CREATED">已建立應收</option>
          <option value="VOIDED">已作廢</option>
        </select>
        <input
          aria-label="銷貨日起日"
          type="date"
          name="deliveryNoteDateFrom"
          defaultValue={query.deliveryNoteDateFrom}
          className="rounded-lg border border-slate-300 px-3 py-2"
        />
        <input
          aria-label="銷貨日迄日"
          type="date"
          name="deliveryNoteDateTo"
          defaultValue={query.deliveryNoteDateTo}
          className="rounded-lg border border-slate-300 px-3 py-2"
        />
        <button className="rounded-lg bg-slate-900 px-4 py-2 text-white">
          查詢
        </button>
      </form>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="hidden grid-cols-[1.25fr_1fr_1fr_1fr_0.8fr_1fr_1fr] gap-3 border-b bg-slate-50 px-5 py-3 text-xs font-semibold text-slate-500 lg:grid">
          <span>銷貨單</span>
          <span>公司</span>
          <span>訂單</span>
          <span>客戶</span>
          <span>狀態</span>
          <span>建立者</span>
          <span>建立時間</span>
        </div>
        <div className="divide-y divide-slate-100">
          {items.map((note) => (
            <Link
              key={note.id}
              href={`/delivery-notes/${note.id}`}
              className="grid gap-2 px-5 py-4 hover:bg-slate-50 lg:grid-cols-[1.25fr_1fr_1fr_1fr_0.8fr_1fr_1fr] lg:items-center"
            >
              <div>
                <strong className="text-slate-950">{note.deliveryNoteNumber}</strong>
                <p className="text-xs text-slate-500">{note.deliveryNoteDate}</p>
              </div>
              <span>{company.code}</span>
              <span>{note.salesOrderNumber}</span>
              <span>{note.customer.name ?? "—"}</span>
              <StatusBadge status={note.status} />
              <span>{note.createdBy.username}</span>
              <span className="text-sm text-slate-600">
                {formatTimestamp(note.createdAt)}
              </span>
              {note.status === "VOIDED" ? (
                <p className="lg:col-span-7 text-sm text-rose-700">
                  作廢：{note.voidReason ?? "未提供原因"}（
                  {formatTimestamp(note.voidedAt)}）
                </p>
              ) : null}
            </Link>
          ))}
          {items.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <p className="font-semibold text-slate-700">查無銷貨單</p>
              <p className="mt-1 text-sm text-slate-500">
                請調整篩選條件，或由已確認的銷售訂單建立銷貨單。
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <footer className="mt-4 flex items-center justify-between text-sm text-slate-600">
        <span>共 {total} 筆</span>
        <div className="flex items-center gap-3">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="rounded-lg border px-3 py-2">
              上一頁
            </Link>
          ) : null}
          <span>
            第 {page}／{totalPages} 頁
          </span>
          {page < totalPages ? (
            <Link href={pageHref(page + 1)} className="rounded-lg border px-3 py-2">
              下一頁
            </Link>
          ) : null}
        </div>
      </footer>
    </>
  );
}

function SummaryField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-900">{children}</dd>
    </div>
  );
}

export function DeliveryNoteDetailView({
  note,
  actions,
}: {
  note: DeliveryNoteDetailDto;
  actions?: ReactNode;
}) {
  const deliveryName = objectValue(note.deliverySnapshot, "name");
  const deliveryAddress = objectValue(note.deliverySnapshot, "fullAddress");
  const recipient = objectValue(note.deliverySnapshot, "recipientName");
  const contactName = objectValue(note.contactSnapshot, "name");
  const companyName =
    objectValue(note.companySnapshot, "companyName") ?? "—";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-teal-700">P3.2 銷貨單明細</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">
            {note.deliveryNoteNumber}
          </h1>
          <div className="mt-3 flex items-center gap-3">
            <StatusBadge status={note.status} />
            <span className="text-sm text-slate-500">
              銷貨日 {note.deliveryNoteDate}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {actions}
          <Link
            href="/delivery-notes"
            className="rounded-lg border border-slate-300 px-4 py-2"
          >
            返回清單
          </Link>
        </div>
      </header>

      <dl className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-6 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryField label="公司">{companyName}</SummaryField>
        <SummaryField label="來源訂單">
          <Link className="text-teal-700" href={`/sales-orders/${note.salesOrderId}`}>
            {note.salesOrderNumber}
          </Link>
        </SummaryField>
        <SummaryField label="訂單 Revision">
          {note.salesOrderRevisionNo}
        </SummaryField>
        <SummaryField label="客戶">{note.customer.name ?? "—"}</SummaryField>
        <SummaryField label="建立者">{note.createdBy.username}</SummaryField>
        <SummaryField label="建立時間">
          {formatTimestamp(note.createdAt)}
        </SummaryField>
        <SummaryField label="付款條件">
          {note.paymentTermsText ?? "—"}
        </SummaryField>
        <SummaryField label="狀態">
          {STATUS_LABELS[note.status] ?? note.status}
        </SummaryField>
      </dl>

      {note.formalPdf ? (
        <section className="rounded-2xl border border-teal-200 bg-teal-50 p-6">
          <h2 className="text-lg font-bold text-teal-950">正式列印摘要</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryField label="實際出貨日">
              {note.actualDeliveryDate ?? "—"}
            </SummaryField>
            <SummaryField label="首次正式列印">
              {formatTimestamp(note.firstPrintedAt)}
            </SummaryField>
            <SummaryField label="首次列印者">
              {note.firstPrintedBy?.username ?? "—"}
            </SummaryField>
            <SummaryField label="補印次數">
              {note.reprintCount}
            </SummaryField>
            <SummaryField label="正式 PDF">
              {note.formalPdf.filename}
            </SummaryField>
            <SummaryField label="檔案大小">
              {note.formalPdf.byteSize.toLocaleString("zh-TW")} bytes
            </SummaryField>
            <SummaryField label="產生時間">
              {formatTimestamp(note.formalPdf.generatedAt)}
            </SummaryField>
            <SummaryField label="產生者">
              {note.formalPdf.generatedBy.username}
            </SummaryField>
          </dl>
        </section>
      ) : null}

      <section className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-6 md:grid-cols-2">
        <div>
          <h2 className="text-lg font-bold">送貨資料</h2>
          <p className="mt-3 font-semibold">{deliveryName ?? "—"}</p>
          <p className="mt-1 text-sm text-slate-600">{deliveryAddress ?? "—"}</p>
          <p className="mt-1 text-sm text-slate-600">
            收件人：{recipient ?? "—"}
          </p>
        </div>
        <div>
          <h2 className="text-lg font-bold">聯絡資料</h2>
          <p className="mt-3 text-sm text-slate-600">
            聯絡人：{contactName ?? "—"}
          </p>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-bold">銷貨明細</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-5 py-3">項次</th>
                <th className="px-5 py-3">品項</th>
                <th className="px-5 py-3">單位</th>
                <th className="px-5 py-3 text-right">數量</th>
                <th className="px-5 py-3 text-right">單價</th>
                <th className="px-5 py-3 text-right">金額</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {note.lines.map((line) => (
                <tr key={line.id}>
                  <td className="px-5 py-4">{line.lineNumber}</td>
                  <td className="px-5 py-4">
                    <strong>{objectValue(line.itemSnapshot, "name") ?? line.itemId}</strong>
                    <p className="text-xs text-slate-500">
                      {objectValue(line.itemSnapshot, "companyItemCode") ??
                        objectValue(line.itemSnapshot, "code") ??
                        "—"}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    {objectValue(line.itemSnapshot, "baseUnit") ?? "—"}
                  </td>
                  <td className="px-5 py-4 text-right">{line.quantity}</td>
                  <td className="px-5 py-4 text-right">
                    NT$ {formatAmount(line.unitPrice)}
                  </td>
                  <td className="px-5 py-4 text-right font-semibold">
                    NT$ {formatAmount(line.lineAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="ml-auto grid max-w-sm gap-2 border-t px-6 py-5 text-sm">
          <div className="flex justify-between">
            <dt>小計</dt>
            <dd>NT$ {formatAmount(note.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>運費</dt>
            <dd>NT$ {formatAmount(note.freightAmount)}</dd>
          </div>
          <div className="flex justify-between text-base font-bold">
            <dt>總計</dt>
            <dd>NT$ {formatAmount(note.totalAmount)}</dd>
          </div>
        </dl>
      </section>

      {note.replacedDeliveryNote || note.replacementDeliveryNote ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-bold">重建歷程</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {note.replacedDeliveryNote ? (
              <Link
                href={`/delivery-notes/${note.replacedDeliveryNote.id}`}
                className="rounded-lg border px-4 py-3 text-sm"
              >
                前一張：{note.replacedDeliveryNote.deliveryNoteNumber}
              </Link>
            ) : null}
            {note.replacementDeliveryNote ? (
              <Link
                href={`/delivery-notes/${note.replacementDeliveryNote.id}`}
                className="rounded-lg border px-4 py-3 text-sm"
              >
                替代單：{note.replacementDeliveryNote.deliveryNoteNumber}
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      {note.status === "VOIDED" ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
          <h2 className="text-lg font-bold text-rose-900">作廢資訊</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
            <SummaryField label="作廢原因">
              {note.voidReason ?? "—"}
            </SummaryField>
            <SummaryField label="作廢者">
              {note.voidedBy?.username ?? "系統"}
            </SummaryField>
            <SummaryField label="作廢時間">
              {formatTimestamp(note.voidedAt)}
            </SummaryField>
          </dl>
        </section>
      ) : null}
    </div>
  );
}
