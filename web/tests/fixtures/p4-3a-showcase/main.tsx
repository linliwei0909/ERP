import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../../../src/app/globals.css";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  DescriptionDetails,
  DescriptionItem,
  DescriptionList,
  DescriptionTerm,
  Dialog,
  EmptyState,
  ErrorSummary,
  Field,
  FormActions,
  IconButton,
  InfoIcon,
  Input,
  LinkButton,
  LoadingState,
  Pagination,
  SearchIcon,
  Section,
  Select,
  Skeleton,
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
  Textarea,
} from "../../../src/components/ui";
import "./showcase.css";

function Showcase() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingConfirmOpen, setPendingConfirmOpen] = useState(false);

  return (
    <main className="showcase">
      <header>
        <p className="showcase-kicker">P4.3a／P4.3b／P4.3c isolated fixture</p>
        <h1>Design System 元件驗證</h1>
        <p>V4 teal／slate、表單、feedback、資料展示、overlay 與 360px 人工驗證。</p>
      </header>

      <section aria-labelledby="buttons-title">
        <h2 id="buttons-title">Button variants</h2>
        <div className="showcase-row">
          <Button>主要操作</Button>
          <Button variant="secondary">次要操作</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">刪除</Button>
        </div>
        <div className="showcase-row">
          <Button size="small">Small 34px</Button>
          <Button size="medium">Medium 38px</Button>
          <Button disabled>已停用</Button>
          <Button pending pendingLabel="儲存中">
            儲存資料
          </Button>
          <LinkButton href="#controls" variant="secondary">
            前往控制項
          </LinkButton>
          <IconButton accessibleName="搜尋" icon={<SearchIcon />} />
        </div>
      </section>

      <section id="controls" aria-labelledby="controls-title">
        <h2 id="controls-title">Native controls</h2>
        <div className="showcase-grid">
          <label>
            <span>一般輸入</span>
            <Input placeholder="請輸入內容" />
          </label>
          <label>
            <span>唯讀輸入</span>
            <Input defaultValue="不可編輯內容" readOnly />
          </label>
          <label>
            <span>無效輸入</span>
            <Input defaultValue="格式錯誤" invalid aria-describedby="input-error" />
            <small id="input-error">請修正欄位內容</small>
          </label>
          <label>
            <span>停用輸入</span>
            <Input defaultValue="已停用" disabled />
          </label>
          <label>
            <span>原生選單</span>
            <Select defaultValue="a">
              <option value="a">甲公司</option>
              <option value="b">乙公司</option>
            </Select>
          </label>
          <label className="showcase-wide">
            <span>備註</span>
            <Textarea defaultValue="可垂直調整高度。" />
          </label>
        </div>
        <div className="showcase-row">
          <Checkbox label="啟用銷售" defaultChecked />
          <Checkbox label="必填確認" required />
          <Checkbox label="無效選項" invalid aria-describedby="checkbox-error" />
          <span id="checkbox-error" className="showcase-error">
            請確認此選項
          </span>
        </div>
      </section>

      <section aria-labelledby="fields-title">
        <h2 id="fields-title">Field composition</h2>
        <div className="showcase-grid">
          <Field label="一般欄位">
            <Input id="fixture-name" placeholder="請輸入內容" />
          </Field>
          <Field label="含說明欄位" description="說明與控制項由 aria-describedby 關聯。">
            <Input defaultValue="說明範例" />
          </Field>
          <Field label="必填錯誤欄位" required error="請修正欄位內容">
            <Input defaultValue="格式錯誤" />
          </Field>
          <Field label="停用欄位">
            <Select defaultValue="disabled" disabled>
              <option value="disabled">已停用</option>
            </Select>
          </Field>
          <Field className="showcase-wide" label="唯讀備註" description="Field 不管理欄位值或 mutation。">
            <Textarea defaultValue="這是唯讀內容。" readOnly />
          </Field>
        </div>
      </section>

      <section aria-labelledby="errors-actions-title">
        <h2 id="errors-actions-title">Error summary and form actions</h2>
        <ErrorSummary
          title="請修正以下問題"
          message="資料尚未送出。"
          errors={[
            { fieldId: "fixture-name", message: "名稱不得空白" },
            { message: "請確認表單內容" },
          ]}
        />
        <FormActions
          destructive={<Button variant="ghost">停用</Button>}
          secondary={<Button variant="secondary">取消</Button>}
          primary={<Button>儲存</Button>}
        />
      </section>

      <section aria-labelledby="alerts-title">
        <h2 id="alerts-title">Alert tones</h2>
        <div className="showcase-feedback-grid">
          <Alert tone="info" title="資訊">
            提供非中斷式操作說明。
          </Alert>
          <Alert tone="success" title="完成">
            資料已成功儲存。
          </Alert>
          <Alert tone="warning" title="注意">
            請在繼續前確認內容。
          </Alert>
          <Alert tone="danger" title="無法處理">
            請修正錯誤後再試。
          </Alert>
        </div>
      </section>

      <section aria-labelledby="empty-title">
        <h2 id="empty-title">Empty-state meanings</h2>
        <div className="showcase-empty-grid">
          <EmptyState
            variant="no-data"
            title="尚未建立資料"
            description="建立第一筆資料後會顯示於此。"
            icon={<InfoIcon />}
            primaryAction={<Button size="small">建立資料</Button>}
          />
          <EmptyState
            variant="no-results"
            title="查無符合結果"
            description="請調整或清除目前篩選條件。"
            primaryAction={<Button size="small">清除篩選</Button>}
          />
          <EmptyState
            variant="permission-limited"
            title="目前沒有可檢視資料"
            description="可見範圍依目前權限與公司範圍決定。"
            secondaryAction={<LinkButton href="#fields-title" size="small" variant="secondary">返回表單</LinkButton>}
          />
        </div>
      </section>

      <section aria-labelledby="loading-title">
        <h2 id="loading-title">Loading and skeleton</h2>
        <LoadingState label="正在載入資料">
          <div className="showcase-skeletons">
            <Skeleton variant="circle" />
            <Skeleton variant="text" lines={3} />
            <Skeleton variant="block" height={72} />
          </div>
        </LoadingState>
      </section>

      <section aria-labelledby="cards-title">
        <h2 id="cards-title">Card and section composition</h2>
        <div className="showcase-card-grid">
          <Card>
            <strong>Default card</strong>
            <p>低陰影的企業 ERP 容器。</p>
          </Card>
          <Card variant="subtle" padding="small">
            <strong>Subtle card</strong>
            <p>次要資訊使用較克制的表面。</p>
          </Card>
        </div>
        <Section
          title="訂單摘要"
          description="標題、說明、操作與內容維持可組合語意。"
          actions={<Button size="small">編輯</Button>}
          divider
        >
          <DescriptionList columns={3}>
            <DescriptionItem>
              <DescriptionTerm>單號</DescriptionTerm>
              <DescriptionDetails>SO-2026-0001</DescriptionDetails>
            </DescriptionItem>
            <DescriptionItem>
              <DescriptionTerm>客戶</DescriptionTerm>
              <DescriptionDetails>遠景商事</DescriptionDetails>
            </DescriptionItem>
            <DescriptionItem>
              <DescriptionTerm>金額</DescriptionTerm>
              <DescriptionDetails>NT$ 128,600</DescriptionDetails>
            </DescriptionItem>
          </DescriptionList>
        </Section>
      </section>

      <section aria-labelledby="status-title">
        <h2 id="status-title">Semantic status tones</h2>
        <div className="showcase-row">
          <StatusBadge tone="neutral" label="草稿" />
          <StatusBadge tone="info" label="處理中" />
          <StatusBadge tone="success" label="已完成" />
          <StatusBadge tone="warning" label="待確認" />
          <StatusBadge tone="danger" label="已作廢" />
        </div>
      </section>

      <section aria-labelledby="table-title">
        <h2 id="table-title">Semantic table and pagination</h2>
        <TableContainer aria-label="銷售訂單資料區">
          <Table>
            <TableCaption>銷售訂單清單</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>單號</TableHead>
                <TableHead>客戶</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead align="right" numeric>金額</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableHead scope="row" monospace>SO-2026-0001</TableHead>
                <TableCell>遠景商事</TableCell>
                <TableCell><StatusBadge tone="success" label="已完成" /></TableCell>
                <TableCell align="right" numeric>128,600</TableCell>
              </TableRow>
              <TableRow>
                <TableHead scope="row" monospace>SO-2026-0002</TableHead>
                <TableCell>山海企業</TableCell>
                <TableCell><StatusBadge tone="warning" label="待確認" /></TableCell>
                <TableCell align="right" numeric>42,800</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
        <Pagination
          currentPage={2}
          totalPages={8}
          previousHref="#table-title"
          nextHref="#table-title"
        />
        <TableContainer aria-label="空資料區">
          <Table>
            <TableCaption>空資料示例</TableCaption>
            <TableBody>
              <TableEmptyRow colSpan={4}>查無符合條件的資料</TableEmptyRow>
            </TableBody>
          </Table>
        </TableContainer>
      </section>

      <section aria-labelledby="pagination-title">
        <h2 id="pagination-title">Pagination boundaries</h2>
        <div className="showcase-pagination-stack">
          <Pagination currentPage={1} totalPages={8} nextHref="#pagination-title" />
          <Pagination currentPage={4} totalPages={8} previousHref="#pagination-title" nextHref="#pagination-title" />
          <Pagination currentPage={8} totalPages={8} previousHref="#pagination-title" />
        </div>
      </section>

      <section aria-labelledby="overlay-title">
        <h2 id="overlay-title">Dialog and confirmation</h2>
        <div className="showcase-row">
          <Button onClick={() => setDialogOpen(true)}>開啟 Dialog</Button>
          <Button variant="secondary" onClick={() => setConfirmOpen(true)}>開啟確認</Button>
          <Button variant="destructive" onClick={() => setPendingConfirmOpen(true)}>開啟 pending 確認</Button>
        </div>
        <Dialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title="編輯訂單"
          description="焦點留在原生 modal dialog 內，關閉後返回觸發按鈕。"
          actions={
            <div className="showcase-row">
              <Button variant="secondary" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button onClick={() => setDialogOpen(false)}>儲存</Button>
            </div>
          }
        >
          <Field label="訂單備註">
            <Textarea autoFocus defaultValue="人工驗證焦點起點" />
          </Field>
        </Dialog>
        <ConfirmDialog
          open={confirmOpen}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => setConfirmOpen(false)}
          title="確認完成訂單？"
          description="完成後將保留狀態異動紀錄。"
          confirmLabel="確認完成"
        />
        <ConfirmDialog
          open={pendingConfirmOpen}
          onCancel={() => setPendingConfirmOpen(false)}
          onConfirm={() => undefined}
          title="正在作廢訂單"
          description="pending 期間不可取消、按 Escape 或點擊 backdrop 關閉。"
          confirmLabel="確認作廢"
          destructive
          pending
        />
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Showcase />);
