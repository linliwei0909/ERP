import type { ReactNode } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/app-shell/page-header";
import pageStyles from "@/components/app-shell/page-contract.module.css";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  LinkButton,
  Pagination,
  Select,
  StatusBadge as SharedStatusBadge,
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
      <PageHeader
        containerVariant="wide"
        context="銷貨作業"
        title="銷貨單清單"
        description="查詢銷貨進度與來源訂單。"
        metadata={[{ label: "目前公司", value: `${company.code}－${company.name}` }]}
        actions={
          <>
            <LinkButton href="/" variant="secondary">返回首頁</LinkButton>
            <LinkButton href="/sales-orders">前往銷售訂單</LinkButton>
          </>
        }
      />

      <Card>
        <form className={pageStyles.filterGrid}>
          <Field label="銷貨單號">
            <Input name="deliveryNoteNumber" defaultValue={query.deliveryNoteNumber} />
          </Field>
          <Field label="客戶名稱">
            <Input name="customerKeyword" defaultValue={query.customerKeyword} />
          </Field>
          <Field label="狀態">
            <Select name="status" defaultValue={query.status}>
              <option value="ALL">全部狀態</option>
              <option value="ACTIVE">有效</option>
              <option value="SHIPPED">已出貨</option>
              <option value="RECEIVABLE_CREATED">已建立應收</option>
              <option value="VOIDED">已作廢</option>
            </Select>
          </Field>
          <Field label="銷貨日起日">
            <Input type="date" name="deliveryNoteDateFrom" defaultValue={query.deliveryNoteDateFrom} />
          </Field>
          <Field label="銷貨日迄日">
            <Input type="date" name="deliveryNoteDateTo" defaultValue={query.deliveryNoteDateTo} />
          </Field>
          <Button type="submit">查詢</Button>
        </form>
      </Card>

      <TableContainer>
        <Table>
          <TableCaption>銷貨單查詢結果</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>銷貨單</TableHead>
              <TableHead>公司</TableHead>
              <TableHead>訂單</TableHead>
              <TableHead>客戶</TableHead>
              <TableHead>狀態</TableHead>
              <TableHead>建立者</TableHead>
              <TableHead>建立時間</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((note) => (
              <TableRow key={note.id}>
                <TableCell monospace>
                  <Link href={`/delivery-notes/${note.id}`} className={pageStyles.tableLink}>
                    {note.deliveryNoteNumber}
                  </Link>
                  <div className={pageStyles.tableSubtext}>{note.deliveryNoteDate}</div>
                  {note.status === "VOIDED" ? (
                    <div className={`${pageStyles.tableSubtext} ${pageStyles.dangerText}`}>
                      作廢：{note.voidReason ?? "未提供原因"}（{formatTimestamp(note.voidedAt)}）
                    </div>
                  ) : null}
                </TableCell>
                <TableCell monospace>{company.code}</TableCell>
                <TableCell monospace>{note.salesOrderNumber}</TableCell>
                <TableCell>{note.customer.name ?? "—"}</TableCell>
                <TableCell>
                  <SharedStatusBadge
                    label={STATUS_LABELS[note.status] ?? note.status}
                    tone={note.status === "VOIDED" ? "danger" : note.status === "ACTIVE" ? "success" : "info"}
                  />
                </TableCell>
                <TableCell>{note.createdBy.username}</TableCell>
                <TableCell>{formatTimestamp(note.createdAt)}</TableCell>
              </TableRow>
            ))}
            {items.length === 0 ? (
              <TableEmptyRow colSpan={7}>
                <EmptyState
                  variant="no-results"
                  title="查無銷貨單"
                  description="請調整篩選條件，或由已確認的銷售訂單建立銷貨單。"
                />
              </TableEmptyRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>

      <div className={pageStyles.tableFooter}>
        <p className={pageStyles.resultCount}>共 {total} 筆</p>
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          previousHref={page > 1 ? pageHref(page - 1) : undefined}
          nextHref={page < totalPages ? pageHref(page + 1) : undefined}
          label="銷貨單清單分頁"
        />
      </div>
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
