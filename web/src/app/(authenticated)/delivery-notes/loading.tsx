import { PageHeader } from "@/components/app-shell/page-header";
import pageStyles from "@/components/app-shell/page-contract.module.css";
import {
  Card,
  LoadingState,
  Skeleton,
  Table,
  TableBody,
  TableCaption,
  TableContainer,
  TableEmptyRow,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";

export default function DeliveryNotesLoading() {
  return (
    <main className={pageStyles.pageStack}>
      <PageHeader
        containerVariant="wide"
        context="銷貨作業"
        title="銷貨單清單"
        description="查詢銷貨進度與來源訂單。"
      />
      <LoadingState label="正在載入銷貨單清單">
        <Card>
          <div className={pageStyles.filterGrid}>
            <Skeleton variant="block" height={38} />
            <Skeleton variant="block" height={38} />
            <Skeleton variant="block" height={38} />
            <Skeleton variant="block" height={38} />
            <Skeleton variant="block" height={38} />
            <Skeleton variant="block" height={38} />
          </div>
        </Card>
        <TableContainer>
          <Table>
            <TableCaption>銷貨單查詢結果載入中</TableCaption>
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
              <TableEmptyRow colSpan={7}>
                <Skeleton variant="text" lines={5} />
              </TableEmptyRow>
            </TableBody>
          </Table>
        </TableContainer>
      </LoadingState>
    </main>
  );
}
