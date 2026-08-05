# P4.5a Sales Order List UI Validation

文件狀態：P4.5a IMPLEMENTED AND LOCALLY VALIDATED（僅涵蓋清單切片，未涵蓋 P4.5b／c／d）

版本日期：2026-08-03

## 1. Git 起始基線

- Branch：`codex/p4-5-sales-orders-ui`
- 起始 HEAD／`origin/codex/p4-5-sales-orders-ui`：`89b24751c58143ec93223ab7bcc7dcb510a9b19b`
- `origin/main`：`0bab47236a048be6df42a2012866cddebff89a90`
- 相對 `origin/main`：ahead 1／behind 0
- 起始 `git status --short`：僅一個未追蹤檔案 `docs/INVENTORY_PRODUCTION_BLUEPRINT.md`
- 起始 tracked／staged diff：皆為空
- `git diff --check`／`git diff --cached --check`：皆通過（無空白錯誤）

## 2. Blueprint 保護

僅檢查 metadata／hash，未開啟、搜尋、讀取、引用或修改內容：

- Size：20,880 bytes（相符）
- Modified：2026-07-27 11:03:17（相符）
- SHA-256：`930121B91B470DFF25596AE50309060155CF7C0F4B78251184EB13B493AF95B7`（相符）

## 3. Route Inventory

- Route：`/sales-orders`（`web/src/app/(authenticated)/sales-orders/page.tsx`）
- Server page：`page.tsx` — 呼叫 `getPageRequestContext()` 與 `listSalesOrders(prisma, {...})`（皆未修改）
- 新增 list presentation 元件：`web/src/app/(authenticated)/sales-orders/sales-order-list-view.tsx`（`SalesOrderListView`）
- Query contract：`search`、`status`、`page`，固定 `pageSize=20`（`salesOrderQuerySchema`，`web/src/lib/sales-orders/validation.ts`，未修改）
- Pagination contract：`listSalesOrders` 回傳 `{ page, pageSize, total, totalPages }`（`web/src/lib/sales-orders/service.ts:1269-1326`，未修改）
- Company context：由 `context.selectedCompany.id`（session 決定）傳入，未使用 URL companyId（未修改，符合 Preflight 第 3 節）
- Permission boundary：`listSalesOrders` 內部呼叫 `assertSalesOrderPermission(context, companyId, "sales_orders.read")`（`service.ts:1277-1281`，未修改）；`page.tsx` 維持原本的 try/catch → `redirect("/login")` 邏輯，未新增或變更任何權限分支
- Service call／DB query：未修改
- Status mapping：中文標籤（`SALES_ORDER_STATUS_LABELS`）與原 `STATUS_LABELS` 完全相同，僅搬移至 `sales-order-list-view.tsx` 並額外新增純呈現用 `salesOrderStatusTone()`（決定 `StatusBadge` 顏色，不影響狀態列舉或文字）
- Create href：`/sales-orders/new`（不變）
- Detail href：`` `/sales-orders/${order.id}` ``（不變）

## 4. Existing Behavior Contract（遷移前後對照）

| 項目 | 遷移前 | 遷移後 |
| --- | --- | --- |
| Query 參數 | `search`、`status`、`page`（固定 `pageSize=20`） | 不變 |
| 排序 | `orderDate desc, orderNumber desc`（server 固定） | 不變（UI 未新增排序控制） |
| Columns | 訂單號、訂單日期、客戶、狀態、未稅總額 | 不變（欄位與順序相同） |
| Detail 連結互動 | 整列可點擊 | 僅訂單號儲存格為連結（與 P4.3 `delivery-notes` 既有模式一致），href 值不變 |
| Empty state | 單一「查無訂單。」文字 | 依是否有篩選條件區分 `no-data`／`no-results`（見第 7 節） |
| Pagination | 無分頁 UI（僅 server 固定 20 筆/頁，無法翻頁） | 使用共用 `Pagination`，保留 query 並可翻頁；邊界時停用並標記 `aria-disabled` |
| Permission／Company | Session 決定 company；權限由 service 斷言 | 不變 |

## 5. Implementation Summary

- 修改：`web/src/app/(authenticated)/sales-orders/page.tsx` — 移除 raw Tailwind 版面與 route-local `<main>`，改為 `<main className={pageStyles.pageStack}>` 包裹新的 `SalesOrderListView`；資料抓取、query 預設值、try/catch/redirect 完全不變，僅新增將 Prisma 結果映射為純資料 `SalesOrderListItemView[]`（不含任何 domain 邏輯）。
- 新增：`web/src/app/(authenticated)/sales-orders/sales-order-list-view.tsx` — 呈現層元件，採用 P4.3 共用元件：`PageHeader`、`Card`、`Field`、`Input`、`Select`、`Button`、`LinkButton`、`TableContainer`／`Table`／`TableCaption`／`TableHeader`／`TableRow`／`TableHead`／`TableBody`／`TableCell`／`TableEmptyRow`、`StatusBadge`、`Pagination`、`EmptyState`。版面沿用既有 `page-contract.module.css`（`pageStack`、`filterGrid`、`tableFooter`、`resultCount`、`tableLink`），未新增任何 CSS 檔案或 class。
- 未建立平行 UI primitives；未修改 `web/src/components/ui/*` 或 `web/src/components/app-shell/*` 任一共用元件。
- 已處理的既有落差：P3.1 階段文字保留於 `PageHeader` 的 `context`（沿用原文案，未新增新資訊）、移除 route-local 重複外框與 max-width/padding、移除 raw status pill 改用 `StatusBadge`、移除 raw 分頁缺失改用 `Pagination`、移除未標記的 filter control 改用 `Field`、empty state 依情境區分。

## 6. Query／Pagination Preservation

- Query 名稱、預設值（`search ?? ""`、`status ?? "ALL"`）、固定 `pageSize: "20"` 皆未變動。
- `SalesOrderListView` 的 `pageHref()` 以 `search`、`status`、`page` 組成分頁連結，並在值為空或 `status === "ALL"` 時移除該參數（與 `delivery-notes` 既有模式一致）；不产生 `companyId` 參數。
- DOM 測試（見第 12 節）驗證分頁連結精確保留既有 `search`／`status` 值，且不含 `companyId`。

## 7. Company Context

- 未新增 local companyId selector（Preflight 已確認現況無此元件，維持 active company，不新增 URL company target）。
- 未修改 App Shell company switcher、session 或 authorization。
- 不宣稱 OQ-053／OQ-054 已關閉。

## 8. Permission Boundary

- `sales_orders.read` 權限斷言仍完全由 `listSalesOrders` 內部（`assertSalesOrderPermission`）執行，未於 `page.tsx` 或 `sales-order-list-view.tsx` 新增、移除或變更任何權限檢查。
- `page.tsx` 對任何錯誤（含權限被拒絕）維持原本 `redirect("/login")` 行為，未拆分為 `AuthorizationError`／`SessionAuthenticationError` 等不同導向（此差異化行為存在於 `delivery-notes`／`sales-orders/[id]`，但屬於既有行為擴充而非本切片授權範圍，未採用以避免觸碰 permission/authorization 呈現以外的行為）。
- 角色權限矩陣（`ADMIN`／`ORDER_ENTRY` 對 `sales_orders.read`／`sales_orders.manage`）由既有 `web/tests/unit/sales-orders.test.ts` 覆蓋，未修改亦未重複造輪。

## 9. Status Mapping

`SALES_ORDER_STATUS_LABELS`（`sales-order-list-view.tsx`）與原 `STATUS_LABELS` 逐一相同：

| 狀態 | 中文標籤 | StatusBadge tone（僅呈現） |
| --- | --- | --- |
| DRAFT | 草稿 | neutral |
| CONFIRMED | 已確認 | info |
| DELIVERY_CREATED | 已建立銷貨單 | info |
| SHIPPED | 已出貨 | warning |
| COMPLETED | 已完成 | success |
| VOIDED | 作廢 | danger |

狀態列舉本身（`web/prisma/schema.prisma` `SalesOrderStatus`）與狀態機未修改。

## 10. Accessibility

- 唯一 `<h1>`：`PageHeader` 產生單一標題「銷售訂單」（DOM 測試驗證 `getAllByRole("heading", {level:1})` 長度為 1）。
- App Shell `#main-content` 維持唯一（`app-shell.tsx` 未修改，仍為 `<div id="main-content">`）；route 本身使用 `<main className={pageStyles.pageStack}>`，與既有 `delivery-notes` 遷移模式一致，未產生巢狀 `<main>`（DOM 測試以 `renderToStaticMarkup` 驗證輸出僅含 1 個 `<main` 標籤）。
- Filter controls 透過 `Field` 元件自動關聯可見 `<label>`（`htmlFor`/`id`），DOM 測試以 `getByLabelText("訂單號或客戶名稱")`、`getByLabelText("狀態")` 驗證。
- Table 具 `TableCaption`（「銷售訂單查詢結果」，`sr-only` 但可被 accessibility tree 讀取）與正確 `scope="col"` 表頭（`role=columnheader`）。
- 狀態不僅依賴顏色：`StatusBadge` 同時輸出文字標籤與圖示點（`aria-hidden`），非純色塊。
- 停用分頁以 `aria-disabled="true"` 標記且不可點擊（`<span>` 而非 `<a>`），DOM 測試驗證邊界頁無 `role=link` 的上一頁／下一頁。
- Keyboard／focus-visible：沿用共用 `LinkButton`／`Pagination`／`Input`／`Select` 既有樣式與焦點行為，未覆寫或移除。

## 11. Responsive Evidence

**無法安全執行即時瀏覽器驗證（誠實回報，未虛構）。**

- 本機 Postgres（`localhost:5432`，`.env` 之 `DATABASE_URL` 指向的 `erp` 資料庫）未啟動（`Connection refused`），且依 Preflight 第 8 節，啟動全新 disposable DB 屬於另需授權的 DB／browser workflow gate，不在本次純 UI 呈現切片的授權範圍內。
- 因 `/sales-orders` 為 authenticated server route，`getPageRequestContext()`／`listSalesOrders()` 皆需要可連線的資料庫與已登入 session，故無法在不啟動資料庫的情況下於瀏覽器實際開啟該 route 進行 1280×900／360×800 螢幕截圖與 console/hydration 檢查。
- 已完成的替代結構性驗證（非螢幕截圖，但為真實、可重現的證據）：
  - 遷移未新增任何 CSS 檔案或 class；完全重用既有 `page-contract.module.css`（`filterGrid` 於 `≤56rem` 收為 2 欄、於 `≤40rem` 收為 1 欄；`tableFooter` 於 `≤40rem` 改為垂直堆疊——皆為既有規則，未修改）與 `ui/ui.module.css` 的 `.tableContainer { overflow-x: auto; }`（`web/src/components/ui/table.tsx:11`），確保表格橫向捲動僅發生在局部容器。
  - 上述 CSS／primitives 與 P4.4 admin、`delivery-notes` 既有遷移共用同一套規則，兩者已於先前切片完成 360px 驗證；本切片未變更這些規則。
  - DOM 測試（第 12 節）驗證的是與視窗尺寸無關的結構性 contract（唯一 h1、caption、labelled controls、disabled pagination markup），在任何視窗寬度下皆成立。
- 此項列為明確延遲項目：正式 1280×900／360×800 瀏覽器截圖與 console/hydration 檢查，需於取得可用 disposable DB 授權後另行補做，不計入本次 P4.5a 結案宣稱。

## 12. Automated Tests

新增：`web/tests/unit/p4-5a-sales-orders-list-ui.test.tsx`（10 tests，皆通過）：

1. 一般清單：欄位、detail href、狀態徽章、建立草稿 href、唯一 h1
2. Filter 控制項與可見 label 關聯
3. Empty list（無篩選）→ `no-data` 呈現「尚無銷售訂單」
4. Filtered no-results（有篩選）→ `no-results` 呈現「查無符合條件的訂單」，且與 no-data 文案互斥
5. 分頁連結保留既有 `search`／`status`，且不含 `companyId`
6. 分頁邊界（`totalPages=1`）時上一頁／下一頁皆為不可點擊且標記 `aria-disabled`
7. 狀態中文標籤與既有列舉逐一相符，tone 對應存在且可辨識
8. 可及 table 結構：`role=table`、caption、5 個 `columnheader`
9. 未渲染任何排序控制或未授權的新 filter（如日期範圍、每頁筆數選擇器）
10. 單一 `<main>`（無巢狀 main）

既有相關測試盤點：`web/tests/unit/sales-orders.test.ts`（money／state machine／validation／RBAC，未修改）、`web/tests/db/sales-order-workflow.test.ts`（service 層，未修改，`test:db` 範圍，本次未執行）。未刪除任何既有測試。

## 13. Quality Gates

在 `web/` 目錄執行（皆為非 DB gate）：

| Gate | 結果 |
| --- | --- |
| `npm run lint` | PASS（無輸出，無新增 warning） |
| `npm run typecheck` | PASS（`next typegen` + `tsc`） |
| `npm run test` | PASS；42 files／349 tests（41 files／337 tests + 1 file／12 tests，`delivery-note-print.test.ts` 依現有腳本邏輯獨立執行；無 skip） |
| `npm run build` | PASS；37 pages generated（與 Preflight 基線一致） |
| `git diff --check` | PASS（無空白錯誤） |
| `git diff --cached --check` | PASS（無空白錯誤） |

Build 保留既有 Delivery Note font／renderer NFT tracing warning（`next.config.ts` → `src/lib/delivery-notes/font.ts` 追蹤路徑），與 Preflight 記錄一致，非本次 Sales Orders UI 變更產生，亦未修改。

## 14. Scope Proof

Diff 僅包含：

- `web/src/app/(authenticated)/sales-orders/page.tsx`（修改）
- `web/src/app/(authenticated)/sales-orders/sales-order-list-view.tsx`（新增）
- `web/tests/unit/p4-5a-sales-orders-list-ui.test.tsx`（新增）
- `docs/P4_5A_SALES_ORDER_LIST_UI_VALIDATION.md`（本文件，新增）

未包含：Blueprint、schema、migration、API route、RBAC、state machine、`sales-order-editor.tsx`、`sales-orders/new`、`sales-orders/[id]`、`delivery-note-order-actions.tsx`，或任何 P4.5b／c／d／P4.6／P5 範圍檔案。共用 `components/ui`、`components/app-shell` 元件均未修改。

## 15. Deferred Items

- P4.5b：`/sales-orders/new` 與 `SalesOrderEditor` 的 editable presentation 遷移。
- P4.5c：`/sales-orders/[id]` 明細、狀態動作與銷貨單關聯 UI 遷移。
- P4.5d：Closure（跨切片 regression、fresh disposable DB workflow、schema diff、正式 desktop／360px browser matrix）。
- 正式即時瀏覽器截圖驗證（見第 11 節）：待取得 disposable DB 授權後補做。
- Draft editor、detail／status actions、Delivery Note UI、全 ERP accessibility：均未完成，不在本次宣稱範圍內。

## 16. P4.5a Closure Decision

**P4.5a IMPLEMENTED AND LOCALLY VALIDATED**（僅清單切片；不代表 P4.5 全部完成、不代表 draft editor／detail／status actions／Delivery Note UI 完成；瀏覽器截圖驗證延遲至可用 disposable DB 時補做）。
