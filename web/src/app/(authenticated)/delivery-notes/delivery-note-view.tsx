import Link from "next/link";
import { PageHeader } from "@/components/app-shell/page-header";
import pageStyles from "@/components/app-shell/page-contract.module.css";
import {
  Button,
  Card,
  DescriptionDetails,
  DescriptionItem,
  DescriptionList,
  DescriptionTerm,
  EmptyState,
  Field,
  Input,
  LinkButton,
  Pagination,
  Section,
  Select,
  StatusBadge,
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
import type { StatusTone } from "@/components/ui";
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

export function deliveryNoteStatusTone(status: string): StatusTone {
  if (status === "VOIDED") return "danger";
  if (status === "ACTIVE") return "success";
  return "info";
}

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
                  <StatusBadge
                    label={STATUS_LABELS[note.status] ?? note.status}
                    tone={deliveryNoteStatusTone(note.status)}
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

export function DeliveryNoteDetailView({
  note,
}: {
  note: DeliveryNoteDetailDto;
}) {
  const deliveryName = objectValue(note.deliverySnapshot, "name");
  const deliveryAddress = objectValue(note.deliverySnapshot, "fullAddress");
  const recipient = objectValue(note.deliverySnapshot, "recipientName");
  const contactName = objectValue(note.contactSnapshot, "name");
  const companyName =
    objectValue(note.companySnapshot, "companyName") ?? "—";

  return (
    <div className={pageStyles.pageStack}>
      <Card>
        <DescriptionList columns={4}>
          <DescriptionItem>
            <DescriptionTerm>銷貨單號</DescriptionTerm>
            <DescriptionDetails>{note.deliveryNoteNumber}</DescriptionDetails>
          </DescriptionItem>
          <DescriptionItem>
            <DescriptionTerm>狀態</DescriptionTerm>
            <DescriptionDetails>
              <StatusBadge
                label={STATUS_LABELS[note.status] ?? note.status}
                tone={deliveryNoteStatusTone(note.status)}
              />
            </DescriptionDetails>
          </DescriptionItem>
          <DescriptionItem>
            <DescriptionTerm>銷貨日</DescriptionTerm>
            <DescriptionDetails>{note.deliveryNoteDate}</DescriptionDetails>
          </DescriptionItem>
          <DescriptionItem>
            <DescriptionTerm>公司</DescriptionTerm>
            <DescriptionDetails>{companyName}</DescriptionDetails>
          </DescriptionItem>
          <DescriptionItem>
            <DescriptionTerm>來源訂單</DescriptionTerm>
            <DescriptionDetails>
              <Link
                href={`/sales-orders/${note.salesOrderId}`}
                className={pageStyles.tableLink}
              >
                {note.salesOrderNumber}
              </Link>
            </DescriptionDetails>
          </DescriptionItem>
          <DescriptionItem>
            <DescriptionTerm>訂單 Revision</DescriptionTerm>
            <DescriptionDetails>{note.salesOrderRevisionNo}</DescriptionDetails>
          </DescriptionItem>
          <DescriptionItem>
            <DescriptionTerm>客戶</DescriptionTerm>
            <DescriptionDetails>{note.customer.name ?? "—"}</DescriptionDetails>
          </DescriptionItem>
          <DescriptionItem>
            <DescriptionTerm>付款條件</DescriptionTerm>
            <DescriptionDetails>{note.paymentTermsText ?? "—"}</DescriptionDetails>
          </DescriptionItem>
          <DescriptionItem>
            <DescriptionTerm>建立者</DescriptionTerm>
            <DescriptionDetails>{note.createdBy.username}</DescriptionDetails>
          </DescriptionItem>
          <DescriptionItem>
            <DescriptionTerm>建立時間</DescriptionTerm>
            <DescriptionDetails>{formatTimestamp(note.createdAt)}</DescriptionDetails>
          </DescriptionItem>
        </DescriptionList>
      </Card>

      {note.formalPdf ? (
        <Card>
          <Section title="正式列印摘要">
            <DescriptionList columns={4}>
              <DescriptionItem>
                <DescriptionTerm>實際出貨日</DescriptionTerm>
                <DescriptionDetails>{note.actualDeliveryDate ?? "—"}</DescriptionDetails>
              </DescriptionItem>
              <DescriptionItem>
                <DescriptionTerm>首次正式列印</DescriptionTerm>
                <DescriptionDetails>{formatTimestamp(note.firstPrintedAt)}</DescriptionDetails>
              </DescriptionItem>
              <DescriptionItem>
                <DescriptionTerm>首次列印者</DescriptionTerm>
                <DescriptionDetails>{note.firstPrintedBy?.username ?? "—"}</DescriptionDetails>
              </DescriptionItem>
              <DescriptionItem>
                <DescriptionTerm>補印次數</DescriptionTerm>
                <DescriptionDetails>{note.reprintCount}</DescriptionDetails>
              </DescriptionItem>
              <DescriptionItem>
                <DescriptionTerm>正式 PDF</DescriptionTerm>
                <DescriptionDetails>{note.formalPdf.filename}</DescriptionDetails>
              </DescriptionItem>
              <DescriptionItem>
                <DescriptionTerm>檔案大小</DescriptionTerm>
                <DescriptionDetails>
                  {note.formalPdf.byteSize.toLocaleString("zh-TW")} bytes
                </DescriptionDetails>
              </DescriptionItem>
              <DescriptionItem>
                <DescriptionTerm>產生時間</DescriptionTerm>
                <DescriptionDetails>{formatTimestamp(note.formalPdf.generatedAt)}</DescriptionDetails>
              </DescriptionItem>
              <DescriptionItem>
                <DescriptionTerm>產生者</DescriptionTerm>
                <DescriptionDetails>{note.formalPdf.generatedBy.username}</DescriptionDetails>
              </DescriptionItem>
            </DescriptionList>
          </Section>
        </Card>
      ) : null}

      <Card>
        <Section title="送貨與聯絡資料">
          <DescriptionList columns={2}>
            <DescriptionItem>
              <DescriptionTerm>送貨地點</DescriptionTerm>
              <DescriptionDetails>
                {deliveryName ?? "—"}
                <div className={pageStyles.tableSubtext}>{deliveryAddress ?? "—"}</div>
              </DescriptionDetails>
            </DescriptionItem>
            <DescriptionItem>
              <DescriptionTerm>收件人</DescriptionTerm>
              <DescriptionDetails>{recipient ?? "—"}</DescriptionDetails>
            </DescriptionItem>
            <DescriptionItem>
              <DescriptionTerm>聯絡人</DescriptionTerm>
              <DescriptionDetails>{contactName ?? "—"}</DescriptionDetails>
            </DescriptionItem>
          </DescriptionList>
        </Section>
      </Card>

      <Card>
        <Section title="銷貨明細">
          <TableContainer>
            <Table>
              <TableCaption>銷貨明細（唯讀）</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>項次</TableHead>
                  <TableHead>品項</TableHead>
                  <TableHead>單位</TableHead>
                  <TableHead align="right">數量</TableHead>
                  <TableHead align="right">單價</TableHead>
                  <TableHead align="right">金額</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {note.lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>{line.lineNumber}</TableCell>
                    <TableCell>
                      <strong>{objectValue(line.itemSnapshot, "name") ?? line.itemId}</strong>
                      <div className={pageStyles.tableSubtext}>
                        {objectValue(line.itemSnapshot, "companyItemCode") ??
                          objectValue(line.itemSnapshot, "code") ??
                          "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      {objectValue(line.itemSnapshot, "baseUnit") ?? "—"}
                    </TableCell>
                    <TableCell align="right" numeric>
                      {line.quantity}
                    </TableCell>
                    <TableCell align="right" numeric>
                      NT$ {formatAmount(line.unitPrice)}
                    </TableCell>
                    <TableCell align="right" numeric>
                      NT$ {formatAmount(line.lineAmount)}
                    </TableCell>
                  </TableRow>
                ))}
                {note.lines.length === 0 ? (
                  <TableEmptyRow colSpan={6}>
                    <EmptyState variant="no-data" title="查無明細" />
                  </TableEmptyRow>
                ) : null}
              </TableBody>
            </Table>
          </TableContainer>
        </Section>
      </Card>

      <Card>
        <DescriptionList columns={3}>
          <DescriptionItem>
            <DescriptionTerm>小計</DescriptionTerm>
            <DescriptionDetails>NT$ {formatAmount(note.subtotal)}</DescriptionDetails>
          </DescriptionItem>
          <DescriptionItem>
            <DescriptionTerm>運費</DescriptionTerm>
            <DescriptionDetails>NT$ {formatAmount(note.freightAmount)}</DescriptionDetails>
          </DescriptionItem>
          <DescriptionItem>
            <DescriptionTerm>總計</DescriptionTerm>
            <DescriptionDetails>NT$ {formatAmount(note.totalAmount)}</DescriptionDetails>
          </DescriptionItem>
        </DescriptionList>
      </Card>

      {note.replacedDeliveryNote || note.replacementDeliveryNote ? (
        <Card>
          <Section title="重建歷程">
            <div className="flex flex-wrap gap-3">
              {note.replacedDeliveryNote ? (
                <LinkButton
                  href={`/delivery-notes/${note.replacedDeliveryNote.id}`}
                  variant="secondary"
                  size="small"
                >
                  前一張：{note.replacedDeliveryNote.deliveryNoteNumber}
                </LinkButton>
              ) : null}
              {note.replacementDeliveryNote ? (
                <LinkButton
                  href={`/delivery-notes/${note.replacementDeliveryNote.id}`}
                  variant="secondary"
                  size="small"
                >
                  替代單：{note.replacementDeliveryNote.deliveryNoteNumber}
                </LinkButton>
              ) : null}
            </div>
          </Section>
        </Card>
      ) : null}

      {note.status === "VOIDED" ? (
        <Card>
          <Section title="作廢資訊">
            <DescriptionList columns={3}>
              <DescriptionItem>
                <DescriptionTerm>作廢原因</DescriptionTerm>
                <DescriptionDetails>{note.voidReason ?? "—"}</DescriptionDetails>
              </DescriptionItem>
              <DescriptionItem>
                <DescriptionTerm>作廢者</DescriptionTerm>
                <DescriptionDetails>{note.voidedBy?.username ?? "系統"}</DescriptionDetails>
              </DescriptionItem>
              <DescriptionItem>
                <DescriptionTerm>作廢時間</DescriptionTerm>
                <DescriptionDetails>{formatTimestamp(note.voidedAt)}</DescriptionDetails>
              </DescriptionItem>
            </DescriptionList>
          </Section>
        </Card>
      ) : null}
    </div>
  );
}
