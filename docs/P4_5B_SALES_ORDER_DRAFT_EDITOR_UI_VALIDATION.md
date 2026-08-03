# P4.5b Sales Order Draft Editor UI Validation

文件狀態：P4.5b IMPLEMENTED AND LOCALLY VALIDATED（僅涵蓋草稿編輯器切片；不涵蓋 P4.5c／d）

版本日期：2026-08-03

## 1. Git 起始基線

- Branch：`codex/p4-5-sales-orders-ui`
- 起始 HEAD／`origin/codex/p4-5-sales-orders-ui`：`37d88e24475ab11c4b502e67fe3c75b13666c583`
- `origin/main`：`0bab47236a048be6df42a2012866cddebff89a90`
- 相對遠端 feature branch：ahead 0／behind 0
- 起始 `git status --short`：僅一個未追蹤檔案 `docs/INVENTORY_PRODUCTION_BLUEPRINT.md`
- 起始 tracked／staged diff：皆為空

## 2. Blueprint 保護

全程僅以 `git status --short` 確認 `docs/INVENTORY_PRODUCTION_BLUEPRINT.md` 仍為 untracked；未開啟、搜尋、讀取、修改、移動或 stage。

## 3. Architecture Decision：共用 Editor，不採 create-only duplicate

依使用者本次授權指示，放棄 Preflight 報告原提出的「Option 1：只建立 create-only 新元件」。改為直接遷移共用元件 [sales-order-editor.tsx](web/src/app/(authenticated)/sales-orders/sales-order-editor.tsx)：

- `SalesOrderEditor` 同時服務 `/sales-orders/new`（無 `initial`）與既有 `/sales-orders/[id]` 的 DRAFT 編輯（有 `initial`），維持單一 `draftPayload()`、單一 `save()`／`performRequest()` mutation 實作、單一 customer/location/contact state 邏輯——未建立第二套。
- P4.5c 保護區（confirm／revision／void 按鈕、`window.prompt`、其 `action()` 呼叫流程、raw JSON snapshot `<details>` 區塊）在檔案中**逐字保留**，僅在 JSX 結構上與 editable 區塊分離（允許範圍內的最小結構搬移），未改變其 class、文字、觸發條件或呼叫的 endpoint。
- `/sales-orders/[id]/page.tsx` 本身（外層 `<main>`、`<h1>銷售訂單明細</h1>`、`DeliveryNoteOrderActions` 排列）**未修改**——`[id]` 頁面看到的變化僅來自其內嵌的 `SalesOrderEditor` 呈現更新，符合「本次只允許因共用 Draft Editor 而產生的 editable presentation 變化」。

## 4. Route Inventory

| Route | 檔案 | 本次異動 |
| --- | --- | --- |
| `/sales-orders/new` | [new/page.tsx](web/src/app/(authenticated)/sales-orders/new/page.tsx) | 移除 route-local `<main>`／`<h1>`／raw 連結，改用 `PageHeader`＋`pageStyles.pageStack`；資料查詢（customer/item）、`requirePermission("sales_orders.manage")`、company context、catch/redirect 完全不變 |
| `/sales-orders/[id]`（DRAFT 編輯／明細／狀態動作） | [id]/page.tsx | **未修改**（僅其子元件 `SalesOrderEditor` 的呈現受影響） |
| 共用 editor | [sales-order-editor.tsx](web/src/app/(authenticated)/sales-orders/sales-order-editor.tsx) | 全面改用 P4.3 primitives；新增 `saving`／`saveError` state 與 `performRequest()` 健壯性 helper；狀態動作區塊與 raw snapshot 逐字保留 |
| 新增：searchable combobox | [item-combobox.tsx](web/src/app/(authenticated)/sales-orders/item-combobox.tsx) | 新檔案，repository-native，無新 dependency |
| 新增：route-local CSS | [sales-orders-ui.module.css](web/src/app/(authenticated)/sales-orders/sales-orders-ui.module.css) | 新檔案，沿用既有 design tokens（`--space-*`、`--color-*`、`--radius-control`），與 `customer-ui.module.css`／`pricing-ui.module.css` 同一慣例 |

## 5. Create／Edit 共用 Contract

- `draftPayload()`：欄位與轉換規則逐字保留——`customerContactId`／`paymentTermsText` 空字串轉 `null`；`lines` 映射保留 `id ? {id} : {}` 條件式欄位、`unitPrice` 僅在有值時放入、`manualPriceReason` 空字串轉 `null`。
- `idempotencyHeaders()`：`content-type`／`idempotency-key: crypto.randomUUID()` 不變。
- Mutation：`POST /api/sales-orders`（create）／`PATCH /api/sales-orders/{id}`（edit），method、URL 規則、payload 外層 `{draft: draftPayload()}` 皆不變。
- 成功後 `router.push('/sales-orders/${id}')` + `router.refresh()` 不變。
- `editable = !initial || initial.status === "DRAFT"`（draft-only guard）不變；非 DRAFT 時所有欄位 `disabled`、儲存/新增/移除按鈕不渲染。
- 內部把單一 `request()` 拆成不觸發 React state 的 `performRequest()`，供 `save()`（新 `saving`／`saveError` state）與 `action()`（沿用原 `message` state／文字序列）分別使用——這是唯一的「結構」變動，屬於使用者本次明確授權的「client robustness」修正（見第 12 節），未新增第二套 mutation 流程。

## 6. Field／Payload Preservation

Header：`orderDate`、`customerId`、`deliveryLocationId`、`customerContactId`、`paymentTermsText`——欄位名稱、預設值、`disabled={!editable}` 規則不變。

明細（每列）：`itemId`、`quantity`、`unitPrice`（條件式）、`manualPriceReason`、可選 `id`——不變。

未新增：freight 欄位、備註欄位、預計送貨日、客戶採購單號、`required` 屬性、client-side pricing/freight/subtotal/total 計算、任何新 query 或新 API。

## 7. Customer／Location／Contact Behavior

`onChange`（客戶）副作用逐字保留：

```ts
setCustomerId(event.target.value);
setDeliveryLocationId(next?.locations[0]?.id ?? "");
setCustomerContactId("");
```

DOM 測試驗證：切換客戶後送貨地點重設為新客戶第一筆地點、聯絡人清空，不殘留前一客戶的值。

## 8. Searchable Item Combobox

[item-combobox.tsx](web/src/app/(authenticated)/sales-orders/item-combobox.tsx)：

- 無新 npm dependency、無新 API、無新 server lookup——直接使用既有 SSR 載入的 `items` prop。
- payload 僅送 `itemId`（`onChange(item.id)`）；使用者鍵入的文字只是本地顯示用 `draftQuery`，**从未**進入 `value`/payload，除非透過點擊或 Enter 明確選取既有選項。
- 鍵盤：`ArrowDown`／`ArrowUp` 移動 highlighted 選項、`Enter` 選取、`Escape` 關閉並還原顯示為目前選取值。
- Accessible name 透過 `aria-label`（如「品項」），並搭配 `role="combobox"`、`aria-expanded`、`aria-haspopup="listbox"`、`aria-controls`、`aria-activedescendant`、`role="listbox"`／`role="option"`。
- 未落回「超長原生 select 作為唯一正式方案」——select 已由 combobox 取代；若無符合項目顯示「查無符合的品項」而非空白。
- 切換品項**不會**清空既有 `unitPrice`（維持現況，未新增自動重新定價或提示，未串接 `preview-pricing`）——由 DOM 測試明確鎖定此行為。

## 9. Line Behavior

保留：add line／remove line（依 index）、既有列的順序與 `id`、`quantity`/`unitPrice`/`manualPriceReason` 綁定、`unitPrice` 條件式省略。新增：語意化 `<Table>`（`TableCaption`、`scope="col"` 表頭），包在 `TableContainer` 中確保橫向捲動僅發生於局部容器；移除按鈕具備 `aria-label={"移除第 N 列"}`（可辨識，優於原本重複的「移除」文字）。

## 10. Pending／Single-Flight（僅 Save 流程；狀態動作不受影響）

- 新增本地 `saving` boolean；儲存按鈕綁定 `Button` 的 `pending`／`pendingLabel`，pending 時自動 `disabled` 且 `aria-busy="true"`。
- `save()` 開頭 `if (saving) return;` 防止重入；DOM 測試驗證快速兩次點擊只送出一次 `fetch`。
- 成功或失敗後 `saving` 皆恢復 `false`（含 reject／JSON parse 失敗路徑）。
- 未修改 server idempotency 實作；每次有效提交仍呼叫 `crypto.randomUUID()` 產生新 key。
- confirm／revision／void 按鈕**未**加上 pending／disabled／aria-busy（維持原樣，重複送出風險保留不變，屬 P4.5c 範圍）。

## 11. Error Recovery（Client Presentation Robustness）

`performRequest()`：

- `fetch()` 拋出 → 回傳通用訊息「網路連線異常，請稍後再試一次」（不再是 unhandled rejection）。
- `response.json()` 拋出 → 回傳通用訊息「伺服器回應格式異常，請稍後再試一次」。
- 非 2xx → 優先使用 `value.error?.message`，否則「操作失敗」（與原行為一致）。
- 未修改 API、HTTP 狀態碼、server 錯誤 mapping；未新增 retry API；使用者可在任一失敗後立即再次提交（DOM 測試驗證重試成功路徑）。
- Save 錯誤以 `Alert(tone="danger")` 呈現；狀態動作錯誤沿用原本 `<span>{message}</span>` 呈現，未改變其位置語意以外的行為。

## 12. Totals Protection

`initial.subtotal`／`initial.freightAmount`／`initial.totalAmount` 僅原樣顯示（`未稅 {subtotal} + 運費 {freightAmount} = {totalAmount}`），未新增任何 client 端加總/試算邏輯。DOM 測試驗證：修改明細數量後，顯示的金額摘要文字完全不變（因為它不依賴 lines state）。

## 13. P4.5c Status Actions Protection

confirm／revision／void 按鈕的 class、文案、`window.prompt` 呼叫、endpoint（`POST /api/sales-orders/{id}/{confirm|revision|void}`）、body 規則、`router.refresh()`、可見性條件（`initial?.status==="DRAFT"`／`canStartSalesOrderRevision`／`canVoidSalesOrder`）、raw JSON snapshot `<details>` 區塊——全部逐字保留，未套用任何 P4.3 primitive、未新增 pending/disabled。DOM 測試明確斷言其 `className` 字串與原始值相等，且點擊後仍呼叫原本的 endpoint／payload。

## 14. Accessibility

- 唯一 `<h1>`：`/sales-orders/new` 由 `PageHeader` 產生單一標題；`SalesOrderEditor` 本身不渲染任何 `<h1>`。
- App Shell `#main-content` 未修改。
- 明細表格具 `TableCaption`（「訂單明細」）與 `scope="col"` 表頭（`role=columnheader`），combobox 具完整 ARIA combobox contract。
- 未新增 pricing 試算控制項、freight／備註／預計送貨日／客戶採購單號等未授權欄位（DOM 測試以 `queryByLabelText`／`queryByText` 明確驗證缺席）。

## 15. Responsive／Browser Evidence

**部分驗證，部分因環境限制無法完成——誠實回報，未虛構。**

已完成且可重現：

- 成功以 Docker 啟動全新 disposable Postgres（見第 16 節），套用全部 12 個 migration，透過既有 `bootstrap-admin`／`bootstrap-company-settings` script 建立 `INDUSTRIAL`／`BIOTECH` 兩間公司與管理員帳號，並以真實 session 登入。
- 以已登入 session 呼叫既有 `/api/customers`、`/api/customers/{id}/locations`、`/api/items` 端點（非 mock）建立最小 smoke fixture（1 客戶、1 送貨地點、2 品項）；其中一次聯絡人建立因缺少電話/信箱被 server 正確拒絕（`400 VALIDATION_ERROR`），證明串接的是真實、未修改的驗證邏輯。
- 以完整頁面載入（`location.href` 硬導航）方式，成功取得 `/sales-orders/new` 的真實瀏覽器渲染結果（`document.body.innerText`）：確認 `PageHeader` 單一標題「建立銷售訂單草稿」、客戶下拉正確預選剛建立的「P45BTEST－P45B測試客戶」、送貨地點正確預選其第一筆地點「L1－台北倉」、訂單明細表頭（品項/數量/未稅成交單價/人工價格理由/操作）、item combobox（`role="combobox"`、`aria-haspopup="listbox"` 等屬性存在於真實 DOM）、「新增明細」「建立草稿」按鈕皆正確渲染。
- 兩次頁面載入皆檢查瀏覽器 console：**無 error、無 hydration warning**。

**無法安全／可靠完成，明確列為延遲項目**：

- 本次瀏覽器工具環境對本 session 的互動能力存在限制：`screenshot`／`computer` 點擊持續回報「Browser pane is not displayed」，且 `document.hasFocus()` 恆為 `false`；診斷發現以 JS 注入方式派送的合成事件（`focus`/`input`）未被頁面 React 執行環境接住（查詢到的 DOM 節點缺少 React 內部 `__reactProps`/`__reactFiber` key，判斷為 CDP 注入所在的 JS 執行環境與頁面實際 React 執行環境不同源）。
- 因此**無法**在本次環境中透過真實點擊/鍵盤操作在瀏覽器中示範 combobox 開合/過濾/選取，也**無法**取得 1280×900／360×800 的正式螢幕截圖或 360px 整頁 overflow 的目視驗證。
- 這些純互動與視覺層面的行為已改由 jsdom + Testing Library 的 29 項 DOM 測試涵蓋（見第 17 節），在真實瀏覽器事件模擬上的落差予以誠實揭露，不以推測結果替代。

## 16. Disposable DB Evidence

- 容器：`erp-p4-5b-browser`（獨立於既有 `erp-postgres`／`erp-p1-test-postgres`，未使用其資料或連線）
- Port：`55433`（既有正式 DB 為 `5432`，既有 P1 test DB 為 `55432`，皆未衝突／未使用）
- Database：`erp_p4_5b_browser_20260803_01`
- User／Password：`p4_5b_browser` / `p4_5b_browser_only`（僅供本次一次性使用）
- 建立前已確認：`docker ps -a` 顯示無同名容器；使用全新隨機 port。
- Migration：`prisma migrate deploy` 套用全部 12 個既有 migration，成功、無新增 migration。
- Bootstrap：`scripts/bootstrap-admin.ts`、`scripts/bootstrap-company-settings.ts`（皆含 `BOOTSTRAP_DATABASE_NAME` 名稱比對 guard），使用既有 fixture 慣例公司代碼 `INDUSTRIAL`／`BIOTECH`（與 `src/lib/company-settings/service.ts` 既有種子資料一致），未複製任何正式資料。
- 驗證後清理：`docker rm -f erp-p4-5b-browser`（容器與其匿名資料卷已一併移除）；未刪除 `erp-postgres` 或 `erp-p1-test-postgres`。
- 未修改正式 `.env`；本次所有連線皆以命令列環境變數覆寫 `DATABASE_URL`，正式 `.env` 內容全程未變。

## 17. Targeted Automated Tests

新增：`web/tests/unit/p4-5b-sales-order-draft-editor-ui.test.tsx`（29 tests，皆通過），涵蓋（節錄對應第十五節需求）：

create/DRAFT edit 渲染與欄位綁定、non-DRAFT 唯讀鎖定、customer 切換重設 location／清空 contact、combobox 過濾／鍵盤選取／Escape／唯選既有 item（拒絕自由文字進 payload）／切換 item 不清空 unitPrice、add/remove line 與順序保留、`unitPrice` 條件式省略與既有 line id 保留、POST/PATCH 精確 payload 與 idempotency header、pending/disabled/aria-busy 與重複送出防護、成功導頁、HTTP 失敗／fetch reject／JSON parse 失敗的錯誤呈現與復原重試、server totals 僅呈現不重算、status actions（confirm/void）原樣不變且未加 pending、唯一 h1／單一 main、可及表格結構、未支援欄位缺席驗證、combobox 純函式（`formatItemOptionLabel`／`filterItemOptions`）、既有 `canStartSalesOrderRevision`/`canVoidSalesOrder` 契約不變。

既有測試 `web/tests/unit/sales-orders.test.ts`（7 tests）與 `web/tests/db/sales-order-workflow.test.ts`（service/DB 層，`test:db` 範圍，本次未執行、未修改）皆未變動，重跑後全部通過，無回歸。

## 18. Full Quality Gates

在 `web/` 目錄執行：

| Gate | 結果 |
| --- | --- |
| `npm run lint` | PASS（含新檔案，無新增 warning） |
| `npm run typecheck` | PASS |
| `npm run test` | PASS；43 files／378 tests（較 P4.5a 基線新增 1 files／29 tests，其餘不變，無 skip） |
| `npm run build` | PASS；37 pages generated，與 P4.5a/Preflight 基線一致 |
| `git diff --check` | PASS |
| `git diff --cached --check` | PASS |

Build 保留既有 Delivery Note font／renderer NFT tracing warning，未變化，非本次變更產生。

## 19. Files Changed（Scope Proof）

- `web/src/app/(authenticated)/sales-orders/new/page.tsx`（修改）
- `web/src/app/(authenticated)/sales-orders/sales-order-editor.tsx`（修改）
- `web/src/app/(authenticated)/sales-orders/item-combobox.tsx`（新增）
- `web/src/app/(authenticated)/sales-orders/sales-orders-ui.module.css`（新增）
- `web/tests/unit/p4-5b-sales-order-draft-editor-ui.test.tsx`（新增）
- `docs/P4_5B_SALES_ORDER_DRAFT_EDITOR_UI_VALIDATION.md`（本文件，新增）

未包含：Blueprint、schema、migration、API route、DTO、RBAC、state machine、pricing/freight service、Delivery Note、`/sales-orders/[id]/page.tsx`、`delivery-note-order-actions.tsx`、package.json/lockfile，或任何 P4.5c／d／P4.6／P5 範圍檔案。

## 20. Deferred Items

- P4.5c：`/sales-orders/[id]` 的 read-only summary／狀態徽章、confirm/revision/void 正式 dialog、raw snapshot 移除、Delivery Note 關聯呈現。
- P4.5d：Closure（跨切片 regression、schema diff、正式 desktop／360px browser screenshot matrix）。
- 正式互動式瀏覽器截圖驗證（見第 15 節）：待此環境的瀏覽器工具互動能力問題解決，或改在具備真實瀏覽器截圖能力的環境重跑後補做。
- Item combobox 的 debounce／大量品項效能優化：目前為同步 client-side filter，品項數量極大時可能需要另案優化，非本次已知阻塞項。

## 21. P4.5b Closure Decision

**P4.5b IMPLEMENTED AND LOCALLY VALIDATED**（僅草稿編輯器共用切片；不代表 P4.5 全部完成、不代表 `/sales-orders/[id]` 明細/狀態動作 UI 完成、不代表 Delivery Note UI 完成；正式互動式瀏覽器截圖驗證因環境限制延遲，已誠實記錄於第 15 節）。
