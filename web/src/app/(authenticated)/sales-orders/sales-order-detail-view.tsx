import pageStyles from "@/components/app-shell/page-contract.module.css";
import {
  Card,
  DescriptionDetails,
  DescriptionItem,
  DescriptionList,
  DescriptionTerm,
  EmptyState,
  Section,
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
import {
  SALES_ORDER_STATUS_LABELS,
  salesOrderStatusTone,
} from "./sales-order-list-view";

export type SalesOrderDetailLine = {
  id?: string;
  quantity: string;
  unitPrice: string;
  manualPriceReason: string;
  itemSnapshot?: unknown;
};

export type SalesOrderDetailOrder = {
  orderNumber: string;
  orderDate: string;
  status: string;
  revisionNo: number;
  subtotal: string;
  freightAmount: string;
  totalAmount: string;
  lines: SalesOrderDetailLine[];
  snapshots: {
    customer?: unknown;
    delivery?: unknown;
    contact?: unknown;
  };
};

function objectValue(value: unknown, key: string): string | null {
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

function itemLabel(itemSnapshot: unknown): string {
  const code =
    objectValue(itemSnapshot, "companyItemCode") ??
    objectValue(itemSnapshot, "code");
  const name = objectValue(itemSnapshot, "name");
  if (code && name) return `${code}－${name}`;
  return name ?? code ?? "—";
}

export function SalesOrderDetailView({
  order,
}: {
  order: SalesOrderDetailOrder;
}) {
  const customerName = objectValue(order.snapshots.customer, "name") ?? "—";
  const deliveryName = objectValue(order.snapshots.delivery, "name") ?? "—";
  const deliveryAddress =
    objectValue(order.snapshots.delivery, "fullAddress") ?? "—";
  const contactName = objectValue(order.snapshots.contact, "name") ?? "—";

  return (
    <div className={pageStyles.pageStack}>
      <Card>
        <DescriptionList columns={4}>
          <DescriptionItem>
            <DescriptionTerm>訂單號</DescriptionTerm>
            <DescriptionDetails>{order.orderNumber}</DescriptionDetails>
          </DescriptionItem>
          <DescriptionItem>
            <DescriptionTerm>狀態</DescriptionTerm>
            <DescriptionDetails>
              <StatusBadge
                label={SALES_ORDER_STATUS_LABELS[order.status] ?? order.status}
                tone={salesOrderStatusTone(order.status)}
              />
            </DescriptionDetails>
          </DescriptionItem>
          <DescriptionItem>
            <DescriptionTerm>修訂版次</DescriptionTerm>
            <DescriptionDetails>{order.revisionNo}</DescriptionDetails>
          </DescriptionItem>
          <DescriptionItem>
            <DescriptionTerm>訂單日期</DescriptionTerm>
            <DescriptionDetails>{order.orderDate}</DescriptionDetails>
          </DescriptionItem>
        </DescriptionList>
      </Card>

      <Card>
        <Section title="客戶與送貨資料">
          <DescriptionList columns={2}>
            <DescriptionItem>
              <DescriptionTerm>客戶</DescriptionTerm>
              <DescriptionDetails>{customerName}</DescriptionDetails>
            </DescriptionItem>
            <DescriptionItem>
              <DescriptionTerm>送貨地點</DescriptionTerm>
              <DescriptionDetails>
                {deliveryName}
                {deliveryAddress !== "—" ? (
                  <div className={pageStyles.tableSubtext}>
                    {deliveryAddress}
                  </div>
                ) : null}
              </DescriptionDetails>
            </DescriptionItem>
            <DescriptionItem>
              <DescriptionTerm>聯絡人</DescriptionTerm>
              <DescriptionDetails>{contactName}</DescriptionDetails>
            </DescriptionItem>
          </DescriptionList>
        </Section>
      </Card>

      <Card>
        <Section title="訂單明細">
          <TableContainer>
            <Table>
              <TableCaption>訂單明細（唯讀）</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>品項</TableHead>
                  <TableHead align="right">數量</TableHead>
                  <TableHead align="right">未稅成交單價</TableHead>
                  <TableHead>人工價格理由</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.lines.map((line, index) => (
                  <TableRow key={line.id ?? index}>
                    <TableCell>{itemLabel(line.itemSnapshot)}</TableCell>
                    <TableCell align="right" numeric>
                      {line.quantity}
                    </TableCell>
                    <TableCell align="right" numeric>
                      {line.unitPrice}
                    </TableCell>
                    <TableCell>{line.manualPriceReason || "—"}</TableCell>
                  </TableRow>
                ))}
                {order.lines.length === 0 ? (
                  <TableEmptyRow colSpan={4}>
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
            <DescriptionTerm>未稅小計</DescriptionTerm>
            <DescriptionDetails>NT$ {order.subtotal}</DescriptionDetails>
          </DescriptionItem>
          <DescriptionItem>
            <DescriptionTerm>運費</DescriptionTerm>
            <DescriptionDetails>NT$ {order.freightAmount}</DescriptionDetails>
          </DescriptionItem>
          <DescriptionItem>
            <DescriptionTerm>合計</DescriptionTerm>
            <DescriptionDetails>NT$ {order.totalAmount}</DescriptionDetails>
          </DescriptionItem>
        </DescriptionList>
      </Card>
    </div>
  );
}
