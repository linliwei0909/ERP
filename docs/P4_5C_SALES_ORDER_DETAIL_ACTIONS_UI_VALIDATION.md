# P4.5c Sales Order Detail／Status Actions／Delivery Note Actions UI Validation

文件狀態：P4.5c IMPLEMENTED AND LOCALLY VALIDATED（僅涵蓋明細／狀態動作／銷貨單動作切片；不涵蓋 P4.5d）

版本日期：2026-08-03

## 1. Git 起始基線

- Branch：`codex/p4-5-sales-orders-ui`
- 起始 HEAD／`origin/codex/p4-5-sales-orders-ui`：`59007dbe719cfc281e5556c9090a3cddcc9960e0`
- `origin/main`：`0bab47236a048be6df42a2012866cddebff89a90`
- 相對遠端 feature branch：ahead 0／behind 0
- 起始 `git status --short`：僅一個未追蹤檔案 `docs/INVENTORY_PRODUCTION_BLUEPRINT.md`
- 起始 tracked／staged diff：皆為空

## 2. Blueprint 保護

全程僅以 `git status --short` 確認 `docs/INVENTORY_PRODUCTION_BLUEPRINT.md` 仍為 untracked；未開啟、搜尋、讀取、修改、移動或 stage。

## 3. Architecture Decision：Option B（拆分 presentation components）

依使用者本次授權，採用 Preflight 提出的 Option B：

- [sales-order-editor.tsx](web/src/app/(authenticated)/sales-orders/sales-order-editor.tsx) 收斂為**只負責 editable DRAFT form**——移除原本內嵌的訂單摘要 `<dl>`、confirm/revision/void 按鈕列、raw JSON snapshot `<details>`；`draftPayload()`／`performSaveRequest()`／`saveInFlightRef`／combobox／line 邏輯（P4.5b 契約）逐字保留，新增 `canManage`（預設 `true`，不影響既有呼叫端行為）。
- 新增 [sales-order-detail-view.tsx](web/src/app/(authenticated)/sales-orders/sales-order-detail-view.tsx)：非編輯／正式 read-only detail presentation，使用 `DescriptionList`＋`StatusBadge`＋read-only `Table`。
- 新增 [sales-order-status-actions.tsx](web/src/app/(authenticated)/sales-orders/sales-order-status-actions.tsx)：集中 confirm／revision／void，使用 `ConfirmDialog`＋獨立的 `performStatusActionRequest()`（**不與** `sales-order-editor.tsx` 的 `performSaveRequest()` 共用，避免重演 P4.5b correction 的耦合問題）。`canStartSalesOrderRevision`／`canVoidSalesOrder` 的**正式實作**遷移至此檔；`sales-order-editor.tsx` 僅保留 `export { ... } from "./sales-order-status-actions"` 轉出，維持 `web/tests/unit/sales-orders.test.ts`（未修改檔案）既有 import path 不受影響。
- [delivery-note-order-actions.tsx](web/src/app/(authenticated)/sales-orders/delivery-note-order-actions.tsx)：presentation 遷移為 `Card`／`Section`／`Button`／`LinkButton`／`ConfirmDialog`／`Field`／`Textarea`／`Alert`；`deliveryNoteOrderAction()`、`busy` ref、`pending`、`createDeliveryNote`／`rebuildDeliveryNote`、payload、`router.push`／`router.refresh()` 全部逐字保留。

## 4. Files／Routes

| 檔案 | 動作 |
| --- | --- |
| [sales-orders/[id]/page.tsx](web/src/app/(authenticated)/sales-orders/[id]/page.tsx) | 修改：外層改用 `PageHeader`＋`pageStyles.pageStack`；新增 `canManageSalesOrders` 計算與 Editor/DetailView 切換邏輯；新增 `itemSnapshot` 至 `initial.lines` 供 DetailView 顯示品項名稱 |
| [sales-order-editor.tsx](web/src/app/(authenticated)/sales-orders/sales-order-editor.tsx) | 修改：移除狀態動作/摘要/raw snapshot；新增 `canManage` prop |
| [sales-order-detail-view.tsx](web/src/app/(authenticated)/sales-orders/sales-order-detail-view.tsx) | 新增 |
| [sales-order-status-actions.tsx](web/src/app/(authenticated)/sales-orders/sales-order-status-actions.tsx) | 新增 |
| [delivery-note-order-actions.tsx](web/src/app/(authenticated)/sales-orders/delivery-note-order-actions.tsx) | 修改：presentation 遷移，邏輯逐字保留 |
| [p4-5c-sales-order-detail-actions-ui.test.tsx](web/tests/unit/p4-5c-sales-order-detail-actions-ui.test.tsx) | 新增：39 tests |
| [p4-5b-sales-order-draft-editor-ui.test.tsx](web/tests/unit/p4-5b-sales-order-draft-editor-ui.test.tsx) | 修改：移除已搬遷/已改變前提的斷言，新增 `canManage` 測試 |
| [delivery-notes-ui-contract.test.ts](web/tests/unit/delivery-notes-ui-contract.test.ts) | 修改：移除對 `delivery-note-order-actions.tsx` 的 source-string 斷言（改由新 DOM 測試涵蓋）；`delivery-notes/[id]/delivery-note-actions.tsx`（不在範圍）之斷言逐字保留 |
| [P4_5B_SALES_ORDER_DRAFT_EDITOR_UI_VALIDATION.md](docs/P4_5B_SALES_ORDER_DRAFT_EDITOR_UI_VALIDATION.md) | 修改：僅移除重複的 `## 1. Git 起始基線` 標題 |
| [P4_5C_SALES_ORDER_DETAIL_ACTIONS_UI_VALIDATION.md](docs/P4_5C_SALES_ORDER_DETAIL_ACTIONS_UI_VALIDATION.md) | 本文件，新增 |

未修改：API routes、service、validation schema、RBAC 定義、state machine、Prisma schema、migration、`delivery-notes/client.ts`、`delivery-notes/[id]/*`（含 print/void/ADMIN void）、package/lockfile。

## 5. Server Page Contract

`getPageRequestContext()`→`requirePermission(context,"sales_orders.read")`→`companyId`→`getSalesOrder`／`customerCompany.findMany`／`itemCompany.findMany`／`listDeliveryNotes`（`Promise.all`，與修改前完全相同的查詢與參數）→ DTO mapping（僅新增 `itemSnapshot` 逐行欄位，其餘欄位不變）→ catch-all `redirect("/sales-orders")`（不變）。呈現層改用 `PageHeader`＋`pageStyles.pageStack`，移除 route-local `<main>`／重複 `<h1>`／raw 連結。

## 6. Permission Presentation

新增（僅呈現用，**非安全邊界**）：

```ts
canManageSalesOrders: hasPermission(context.roleCodes, "sales_orders.manage"),
```

傳給 `SalesOrderEditor`（`canManage`）與 `SalesOrderStatusActions`（`canManage`）。呈現規則：`showEditor = initial.status === "DRAFT" && canManageSalesOrders`；否則一律顯示 `SalesOrderDetailView`（唯讀）。`SalesOrderStatusActions` 在 `!canManage` 時整個回傳 `null`（不顯示任何 confirm/revision/void 按鈕）。Server 端權限檢查（`assertSalesOrderPermission(...,"sales_orders.manage")`）完全未變，仍是最終防線；presentation 層的隱藏僅為使用者體驗改善，不取代 server 檢查。現況 `ADMIN`／`ORDER_ENTRY` 皆同時具備 read+manage，此 gap 目前不可由現有角色觀察，但已為未來可能的唯讀角色預留正確行為。

## 7. Status Matrix（唯讀展示與既有 domain 一致）

| Status | Editor | DetailView | Confirm | Revision | Void | DN create/rebuild | DN 連結 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DRAFT（canManage） | ✅ | — | ✅ | ❌ | ✅ | ❌（非 CONFIRMED） | 若有既有 DN 仍顯示 |
| CONFIRMED | — | ✅ | ❌ | ✅ | ✅ | 視現行 DN 版次 | ✅ |
| DELIVERY_CREATED | — | ✅ | ❌ | ✅ | ✅ | ❌（版次已符） | ✅ |
| SHIPPED | — | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| COMPLETED | — | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| VOIDED | — | ✅ | ❌ | ❌ | ❌ | ❌ | 顯示歷史（含級聯作廢的 DN） |

上表由真實瀏覽器對 4 種實際資料狀態（DRAFT／CONFIRMED／DELIVERY_CREATED＋ACTIVE DN／VOIDED＋級聯作廢 DN）逐一驗證（見第 15 節），非僅推論。

## 8. Read-only Detail（SalesOrderDetailView）

顯示：訂單號、`StatusBadge`（中文＋tone）、修訂版次、訂單日期、客戶／送貨地點／地址／聯絡人（取自既有 `snapshots`）、明細（品項名稱取自 `line.itemSnapshot`、數量、未稅成交單價、人工價格理由）、未稅小計／運費／合計。全部資料取自既有 DTO（`initial` 現有欄位 + 新增的逐行 `itemSnapshot` 投影，本身已是 `SalesOrder.lines[].itemSnapshot` 既有 DB 欄位，只是先前未被投影到 `initial.lines`），未新增 DTO 不存在的資料，未修改 API。

## 9. Raw Snapshot Removal

`sales-order-editor.tsx` 不再渲染 `<details><pre>{JSON.stringify(initial.snapshots)}</pre></details>`；`initial.snapshots` DTO 欄位本身未刪除／未變更形狀，僅未再整包傳給任何呈現用途（`SalesOrderDetailView` 只讀取 `snapshots.customer`／`delivery`／`contact` 的特定欄位，不輸出完整 JSON）。未修改 DB snapshot 儲存、audit 或 domain。

同步更新測試（`p4-5b-...test.tsx`）：「does not render the raw JSON snapshot block」驗證 `快照與來源資訊（唯讀）` 標題與任何 `"customer":` JSON 字樣皆不存在；`p4-5c-...test.tsx`「never renders the raw JSON snapshot」對 `SalesOrderDetailView` 做相同驗證。

## 10. Status Mapping

復用 P4.5a 既有 `SALES_ORDER_STATUS_LABELS`／`salesOrderStatusTone`（[sales-order-list-view.tsx](web/src/app/(authenticated)/sales-orders/sales-order-list-view.tsx)），未重新建立另一套對照。`SalesOrderDetailView` 對全部 6 個 status（DRAFT／CONFIRMED／DELIVERY_CREATED／SHIPPED／COMPLETED／VOIDED）皆以中文＋`StatusBadge` 呈現，DOM 測試逐一驗證，且斷言英文 enum 字串不會直接顯示。

## 11. Confirm／Revision／Void（SalesOrderStatusActions）

**Request contract（不變）**：`POST /api/sales-orders/{id}/confirm|revision|void`，`idempotency-key` header，void body `{reason}`（trim 後）、confirm/revision body `{}`；成功後 `router.refresh()`；非 2xx 優先顯示 `error.message`；理由驗證（trim 非空）在送出前於 client 端擋下，不呼叫 API。

**Dialog（新增，皆為 `ConfirmDialog`，繼承其 focus trap／Escape／focus return／body scroll lock）**：

- Confirm：文案說明「確認後無法直接編輯，如需修改須開始修訂」。
- Revision：文案說明「狀態改回草稿、版次遞增、若來源為 DELIVERY_CREATED 則 server 依既有規則驗證銷貨單」（措辭對應 `validateDeliveryNoteForRevisionStart` 既有行為，未虛構新規則）。
- Void：`ConfirmDialog destructive`＋`Field`＋`Textarea`；空白/純空白理由被 client 擋下並顯示「作廢理由必填」，**不呼叫 API、不呼叫 `window.prompt`**（`window.prompt` 已完全移除）；文案明確告知「作廢後無法復原」與「若訂單目前有有效銷貨單，系統將依既有規則一併作廢」（對應既有 `voidDeliveryNoteForOrderVoid` 級聯行為，已於真實 DB 驗證，見第 15 節）。

## 12. Status Action Robustness（本次明確授權新增）

`performStatusActionRequest()`（獨立於 `performSaveRequest()`）：fetch 拋出／JSON parse 失敗 → 通用訊息，不再是 unhandled rejection；非 2xx → server message 優先。`actionInFlightRef`（同步 ref）在 `submit()` 最前檢查並於 `finally` 恢復，與 `pending` state（驅動 `Button pending`／`aria-busy`）分離；DOM 測試以「送出後手動清除 disabled 屬性再次點擊」證明同步鎖獨立於 DOM disabled 語意。未改 server idempotency 實作，每次有效提交仍產生新 key。

## 13. Delivery Note Create／Rebuild（presentation-only migration）

`deliveryNoteOrderAction()`、`busy` ref、`createDeliveryNote`／`rebuildDeliveryNote`（`@/lib/delivery-notes/client`，未修改）、`{expectedRevisionNo}` / `{expectedRevisionNo, reason}` payload、`router.push('/delivery-notes/${id}')`＋`router.refresh()` 全部逐字保留。Create 使用 `ConfirmDialog`（不要求理由）；Rebuild 使用 `ConfirmDialog`＋`Textarea`（「重建原因」，client 端非空驗證，錯誤顯示「重建理由必填」）；文案說明「舊銷貨單將依既有 atomic rebuild 流程作廢，系統會建立一張 replacement 銷貨單；不支援分批出貨」。**未新增** Delivery Note void、ADMIN void、print mutation、新 API 或新 domain 能力——這些確認完全不出現在本元件（DOM 測試明確斷言 `作廢`／`列印`／`補印` 相關按鈕不存在）。

## 14. Domain／API Protection

未修改：`/api/sales-orders/[id]/{confirm,revision,void}`、`/api/sales-orders/[id]/delivery-note{,/rebuild}`、`state-machine.ts`、`rbac.ts`、`@/lib/delivery-notes/client.ts`、`@/lib/delivery-notes/service.ts`、`/delivery-notes/[id]/*`、Prisma schema、migrations。真實 DB 驗證（第 15 節）觀察到既有 domain 規則原樣運作：確認時若查無正式價格則要求成交價＋人工價格理由（`ORDER_CONFIRMATION_PREREQUISITE_MISSING`）、確認時若無有效運費規則則拒絕、作廢訂單會級聯作廢現行銷貨單——皆為既有行為，本次未觸碰。

## 15. Responsive／Browser Evidence

**部分驗證，部分因環境限制無法完成——誠實回報，未虛構（與 P4.5b 相同的已知限制）。**

已完成且可重現：

- 全新 disposable Postgres（見第 16 節）、12 個 migration、`bootstrap-admin`／`bootstrap-company-settings`（`INDUSTRIAL`／`BIOTECH`）、真實登入。
- 以已登入 session 透過既有、未修改的 API（`/api/customers`、`/api/customers/{id}/locations`、`/api/items`、`/api/admin/freight-rules`、`/api/sales-orders`、`/api/sales-orders/{id}/confirm`、`/api/sales-orders/{id}/delivery-note`、`/api/sales-orders/{id}/void`）建立 1 客戶、1 送貨地點、1 品項、1 運費規則，並建立 **4 筆真實資料狀態的訂單**：
  - DRAFT（草稿）
  - CONFIRMED（已確認）
  - DELIVERY_CREATED（已建立銷貨單，含 1 張 ACTIVE Delivery Note）
  - VOIDED（作廢，其 Delivery Note 因級聯規則同時被作廢，於歷史清單顯示「已作廢」）
- 以硬導航（`location.href`）分別開啟上述 4 筆訂單的 `/sales-orders/{id}`，以 `document.body.innerText` 取得真實渲染結果，逐一確認：
  - `PageHeader` 單一標題「銷售訂單明細」＋「返回清單」連結。
  - `SalesOrderStatusActions` 依狀態正確顯示/隱藏 confirm／revision／void（見第 7 節表格，逐項核對成功）。
  - `DeliveryNoteOrderActions` 正確顯示「建立銷貨單」（CONFIRMED 且無現行 DN）、正確顯示「查看目前銷貨單」＋歷史（DELIVERY_CREATED）、正確在版次已符時不顯示 create/rebuild、正確在 VOIDED 訂單顯示已作廢的歷史 DN。
  - `SalesOrderDetailView` 正確顯示中文狀態（已確認／已建立銷貨單／作廢）、客戶/送貨地點/地址/聯絡人、明細品項名稱（`ITEM-X－P45C測試品項X`）、數量/單價/理由、未稅小計/運費/合計，**皆為 server 真實計算與 snapshot 結果**（非假資料）。
  - DRAFT 訂單頁仍正確顯示可編輯 `SalesOrderEditor`，客戶/地點正確預選。
  - **完全未出現** raw JSON snapshot 於任何一頁。
- 於同一 session 以 `document.documentElement.scrollWidth` 與逐元素 `scrollWidth` 掃描，量測（非目視）確認 **360×800** 與 **1280×900** 皆無整頁橫向 overflow、無單一元素超出 viewport 寬度（DRAFT 可編輯頁與 CONFIRMED 唯讀頁皆已測試）。
- 全程檢查瀏覽器 console：僅有既有、與本次改動無關的 `pg` client 併發查詢 deprecation warning（伺服器端轉發，非 P4.5c 新增；`Promise.all` 資料查詢結構本身未被本次修改）；**無 React/hydration warning、無其他 console error**。

**無法安全／可靠完成，明確列為延遲項目（與 P4.5b 相同的環境限制）**：

- 本 session 的瀏覽器工具互動能力持續受限：`document.hasFocus()` 恆為 `false`，`screenshot`/`computer` 點擊先前已確認會回報「Browser pane is not displayed」；P4.5b 已診斷為 CDP 注入執行環境與頁面 React 執行環境不同源（DOM 節點缺少 `__reactProps`/`__reactFiber`）。
- 因此**無法**在本次環境中以真實點擊/鍵盤操作示範 dialog 開合、Tab 循環、Escape 關閉、`ConfirmDialog` 內按鈕互動，也**無法**取得正式螢幕截圖。
- 這些純互動層面的行為已改由 jsdom + Testing Library 的 39 項新測試（含以 `HTMLDialogElement.prototype.showModal` polyfill 驅動的真實 `<dialog>` 渲染、Escape keydown、Cancel 點擊、pending/disabled/aria-busy、單一動態防重入）涵蓋，並非略過不測，僅是無法在「這一個真實瀏覽器 session」中重複示範。
- 完整互動式截圖驗證延後至 P4.5d closure 或改在具備真實瀏覽器互動能力的環境補做。

## 16. Disposable DB Evidence

- 容器：`erp-p4-5c-browser`（獨立於 `erp-postgres`／`erp-p1-test-postgres`／已刪除的 `erp-p4-5b-browser`）
- Port：`55434`（未與 `5432`／`55432` 衝突）
- Database：`erp_p4_5c_browser_20260803_01`
- User／Password：`p4_5c_browser` / `p4_5c_browser_only`（僅供本次一次性使用）
- 建立前已確認：`docker ps -a` 無同名容器。
- Migration：`prisma migrate deploy` 套用全部 12 個既有 migration。
- Bootstrap：`bootstrap-admin.ts`／`bootstrap-company-settings.ts`（皆含 `BOOTSTRAP_DATABASE_NAME` 名稱比對 guard），使用既有 fixture 慣例 `INDUSTRIAL`／`BIOTECH`。
- Fixture：全部透過既有、未修改的正式 API 端點建立（非手刻 SQL），過程中真實觀察到既有 domain 驗證生效（人工價格理由必填、運費規則必填）。
- 驗證後清理：`docker rm -f erp-p4-5c-browser`；停止本次專用 dev server（port 3200）；未刪除 `erp-postgres` 或 `erp-p1-test-postgres`。
- 未修改正式 `.env`；全程以命令列環境變數覆寫 `DATABASE_URL`。

## 17. Targeted Automated Tests

新增 `web/tests/unit/p4-5c-sales-order-detail-actions-ui.test.tsx`（**39 tests**，皆通過），涵蓋：`SalesOrderStatusActions` 6 狀態可見性矩陣＋`canManage=false`隱藏；confirm 的 dialog開合/Escape/exact endpoint-body-idempotency/pending-disabled-aria-busy/HTTP失敗/fetch reject/JSON parse失敗/重試/同步防重入；revision 的可見性/文案/endpoint/錯誤復原重試；void 的必填理由驗證（空白與純空白）/`window.prompt`不再被呼叫/trimmed payload/destructive呈現/cancel不送出；`SalesOrderDetailView` 6 狀態中文對照/完整欄位渲染/raw snapshot不存在/可及表格結構；page composition（唯一h1/單一main，DRAFT editor 與非DRAFT detail view兩分支）；`DeliveryNoteOrderActions` create/rebuild/null矩陣/canManage隱藏/current連結/歷史/create對話框無理由欄位/rebuild理由驗證/exact adapter呼叫與expectedRevisionNo/同步防重入/pending-disabled-aria-busy/成功導頁/typed錯誤訊息/無void-print-ADMIN控制項。

更新 `web/tests/unit/p4-5b-sales-order-draft-editor-ui.test.tsx`：移除 6 項前提已改變的斷言（訂單號/狀態文字曾在 editor 內顯示、confirm/void 曾在 editor 內渲染且不含 pending、raw snapshot 曾存在、status action 錯誤處理曾與 save 隔離的 4 項細節斷言——這些行為現在屬於 `SalesOrderStatusActions`，且該元件的 robustness 已依本次授權改變），新增 3 項確認「這些內容已不在 editor」＋ 1 項 `canManage` gating 測試；**32 tests，皆通過，無回歸**。

更新 `web/tests/unit/delivery-notes-ui-contract.test.ts`：移除對 `delivery-note-order-actions.tsx` 的 4 項 source-string 斷言（改由新 P4.5c DOM 測試以 rendered behavior 涵蓋）；`delivery-notes/[id]/delivery-note-actions.tsx`（不在 P4.5c 範圍）之全部斷言逐字保留；**5 tests，皆通過**。

## 18. Full Quality Gates

在 `web/` 目錄執行：

| Gate | 結果 |
| --- | --- |
| `npm run lint` | PASS（含全部新/修改檔案，無新增 warning） |
| `npm run typecheck` | PASS |
| `npm run test` | PASS；**44 files／421 tests**（P4.5b correction 基線 43 files／384 tests；新增 `p4-5c` 檔案 +1 files／+39 tests；`p4-5b` 測試淨減 3（35→32）；`delivery-notes-ui-contract` 測試淨增 1（4→5，拆分既有斷言、未新增涵蓋範圍）；合計 +39-3+1=+37 ⇒ 421，無 skip） |
| `npm run build` | PASS；37 pages generated，與既有基線一致 |
| `git diff --check` | PASS |
| `git diff --cached --check` | PASS |

Build 保留既有 Delivery Note font／renderer NFT tracing warning，未變化，非本次變更產生。

## 19. Files Changed（Scope Proof）

- `web/src/app/(authenticated)/sales-orders/[id]/page.tsx`（修改）
- `web/src/app/(authenticated)/sales-orders/sales-order-editor.tsx`（修改）
- `web/src/app/(authenticated)/sales-orders/sales-order-detail-view.tsx`（新增）
- `web/src/app/(authenticated)/sales-orders/sales-order-status-actions.tsx`（新增）
- `web/src/app/(authenticated)/sales-orders/delivery-note-order-actions.tsx`（修改）
- `web/tests/unit/p4-5c-sales-order-detail-actions-ui.test.tsx`（新增）
- `web/tests/unit/p4-5b-sales-order-draft-editor-ui.test.tsx`（修改）
- `web/tests/unit/delivery-notes-ui-contract.test.ts`（修改）
- `docs/P4_5B_SALES_ORDER_DRAFT_EDITOR_UI_VALIDATION.md`（修改，僅移除重複標題）
- `docs/P4_5C_SALES_ORDER_DETAIL_ACTIONS_UI_VALIDATION.md`（本文件，新增）

未包含：Blueprint、schema、migration、API route、DTO、RBAC、state machine、`delivery-notes/client.ts`、`delivery-notes/[id]/*`、`item-combobox.tsx`、`sales-orders-ui.module.css`、package.json/lockfile，或任何 P4.5d／P4.6／P5 範圍檔案。

## 20. Deferred Items

- P4.5d：Closure（跨切片 regression、schema diff、正式 desktop／360px browser screenshot／互動示範矩陣）。
- 正式互動式瀏覽器截圖與點擊示範（見第 15 節）：待具備真實瀏覽器互動能力的環境補做。
- `delivery-notes/[id]` 自身路由（print/void/ADMIN void）的 UI 遷移：不在 P4.5c 範圍，未開始。

## 21. P4.5c Closure Decision

**P4.5c IMPLEMENTED AND LOCALLY VALIDATED**（僅明細／狀態動作／銷貨單動作切片；不代表 P4.5 全部完成、不代表 `delivery-notes/[id]` UI 完成、不代表 P4.5d 已完成；正式互動式瀏覽器截圖驗證因環境限制延遲，已誠實記錄於第 15 節，並以 4 種真實資料狀態的完整頁面載入與量測結果作為實質替代證據）。
