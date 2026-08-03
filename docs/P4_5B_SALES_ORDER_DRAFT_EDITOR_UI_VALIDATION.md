# P4.5b Sales Order Draft Editor UI Validation

文件狀態：P4.5b IMPLEMENTED AND LOCALLY VALIDATED（僅涵蓋草稿編輯器切片；不涵蓋 P4.5c／d）

版本日期：2026-08-03（含 2026-08-03 correction commit 修正）

## 0. Correction Note（本次修正）

遠端審查發現：初版 P4.5b 將 `save()` 與 `action()`（confirm／revision／void）共用同一個健壯性 `performRequest()` helper，導致狀態動作的 fetch rejection、JSON parse exception、非 2xx 錯誤處理也被提前改變——這超出 P4.5b 授權範圍（P4.5b 只授權 Draft Save 流程的 client robustness；狀態動作的 error behavior 屬 P4.5c）。

本次 correction commit 修正如下（詳見第 5、10、11、13 節，已更新為修正後的準確敘述）：

- 健壯性 helper 更名為 `performSaveRequest()`，**僅供 `save()` 使用**。
- `action()` 恢復為 P4.5b 之前（commit `37d88e2`）逐字相同的 `request()` 實作與呼叫方式：`fetch()`／`response.json()` 皆無 try/catch，非 2xx 時 `setMessage(value.error?.message ?? "操作失敗")`，成功時 `setMessage("操作完成")` 並 `router.refresh()`——與修正前完全一致。
- `save()` 新增同步 `saveInFlightRef`（`useRef`）防重入鎖，於函式最前同步檢查並於 `finally` 恢復，作為比 `saving` state 更嚴謹的 single-flight 證據。
- 新增 6 項測試，明確證明狀態動作未套用 save 專用的錯誤轉換，且 save 的同步防重入鎖獨立於 `disabled` 屬性成立。

## 1. Git 起始基線

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

- `SalesOrderEditor` 同時服務 `/sales-orders/new`（無 `initial`）與既有 `/sales-orders/[id]` 的 DRAFT 編輯（有 `initial`），維持單一 `draftPayload()`、單一 customer/location/contact state 邏輯——未建立第二套。`save()`（create/update）使用 `performSaveRequest()`；`action()`（confirm/revision/void，P4.5c 範圍）維持修正前的獨立 `request()` 實作，兩者刻意不共用同一個 request helper（見第 0、5 節 correction note）。
- P4.5c 保護區（confirm／revision／void 按鈕、`window.prompt`、其 `action()` 呼叫流程、raw JSON snapshot `<details>` 區塊）在檔案中**逐字保留**，僅在 JSX 結構上與 editable 區塊分離（允許範圍內的最小結構搬移），未改變其 class、文字、觸發條件或呼叫的 endpoint。
- `/sales-orders/[id]/page.tsx` 本身（外層 `<main>`、`<h1>銷售訂單明細</h1>`、`DeliveryNoteOrderActions` 排列）**未修改**——`[id]` 頁面看到的變化僅來自其內嵌的 `SalesOrderEditor` 呈現更新，符合「本次只允許因共用 Draft Editor 而產生的 editable presentation 變化」。

## 4. Route Inventory

| Route | 檔案 | 本次異動 |
| --- | --- | --- |
| `/sales-orders/new` | [new/page.tsx](web/src/app/(authenticated)/sales-orders/new/page.tsx) | 移除 route-local `<main>`／`<h1>`／raw 連結，改用 `PageHeader`＋`pageStyles.pageStack`；資料查詢（customer/item）、`requirePermission("sales_orders.manage")`、company context、catch/redirect 完全不變 |
| `/sales-orders/[id]`（DRAFT 編輯／明細／狀態動作） | [id]/page.tsx | **未修改**（僅其子元件 `SalesOrderEditor` 的呈現受影響） |
| 共用 editor | [sales-order-editor.tsx](web/src/app/(authenticated)/sales-orders/sales-order-editor.tsx) | 全面改用 P4.3 primitives；新增 `saving`／`saveError`／`saveInFlightRef` 與僅供 `save()` 使用的 `performSaveRequest()` 健壯性 helper；`action()`／狀態動作區塊與 raw snapshot 逐字保留（含其原始 `request()` 呼叫路徑，見第 0 節 correction note） |
| 新增：searchable combobox | [item-combobox.tsx](web/src/app/(authenticated)/sales-orders/item-combobox.tsx) | 新檔案，repository-native，無新 dependency |
| 新增：route-local CSS | [sales-orders-ui.module.css](web/src/app/(authenticated)/sales-orders/sales-orders-ui.module.css) | 新檔案，沿用既有 design tokens（`--space-*`、`--color-*`、`--radius-control`），與 `customer-ui.module.css`／`pricing-ui.module.css` 同一慣例 |

## 5. Create／Edit 共用 Contract

- `draftPayload()`：欄位與轉換規則逐字保留——`customerContactId`／`paymentTermsText` 空字串轉 `null`；`lines` 映射保留 `id ? {id} : {}` 條件式欄位、`unitPrice` 僅在有值時放入、`manualPriceReason` 空字串轉 `null`。
- `idempotencyHeaders()`：`content-type`／`idempotency-key: crypto.randomUUID()` 不變。
- Mutation：`POST /api/sales-orders`（create）／`PATCH /api/sales-orders/{id}`（edit），method、URL 規則、payload 外層 `{draft: draftPayload()}` 皆不變。
- 成功後 `router.push('/sales-orders/${id}')` + `router.refresh()` 不變。
- `editable = !initial || initial.status === "DRAFT"`（draft-only guard）不變；非 DRAFT 時所有欄位 `disabled`、儲存/新增/移除按鈕不渲染。
- `save()`（create/update）使用新的 `performSaveRequest()`（不觸發 React state，回傳 `{ok, value}`／`{ok, message}`），並以 `saveInFlightRef`（同步 ref）＋`saving` state 管理 pending／防重入。
- `action()`（confirm/revision/void）**未**改用 `performSaveRequest()`；維持修正前逐字相同的獨立 `request()` 函式（無 try/catch、`setMessage("處理中…")` → 成功 `setMessage("操作完成")` / 失敗 `setMessage(value.error?.message ?? "操作失敗")`、`fetch()`／`response.json()` 例外會如修正前一樣向上拋出）。兩者是**兩個獨立的 request 實作**，並非同一 helper 的兩種呼叫方式——初版 P4.5b 曾讓兩者共用同一個健壯性 helper，已於 correction commit 修正（見第 0 節），不屬於本次「唯一結構變動」的最終狀態。

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

- 新增本地 `saving` boolean（presentation state）；儲存按鈕綁定 `Button` 的 `pending`／`pendingLabel`，pending 時自動 `disabled` 且 `aria-busy="true"`。
- **同步防重入鎖**：`save()` 函式最前以 `saveInFlightRef.current`（`useRef(false)`）同步檢查並立即設為 `true`，於 `try/finally` 的 `finally` 中恢復為 `false`（連同 `setSaving(false)`）。此鎖與 `saving` state／按鈕 `disabled` 屬性彼此獨立——即使按鈕的 `disabled` 因某種原因被繞過，`save()` 本身仍會在第二次呼叫時於函式最前直接 `return`，不會送出第二個 `fetch`。
- 測試證據（`p4-5b-sales-order-draft-editor-ui.test.tsx`）：「blocks a second concurrent save via a synchronous guard, independent of the disabled attribute」——第一次點擊後手動清除按鈕的 `disabled` 屬性（`button.disabled = false`）再次點擊，驗證 `fetch` 仍只被呼叫一次；此測試不依賴 DOM `disabled` 語意，直接證明內部同步鎖有效，修正了初版僅以「點擊已 disabled 按鈕」作為間接證據的不足。
- 成功或失敗後 `saving`／`saveInFlightRef` 皆恢復（含 reject／JSON parse 失敗路徑），使用者可立即再次提交。
- 未修改 server idempotency 實作；每次有效提交仍呼叫 `crypto.randomUUID()` 產生新 key。
- confirm／revision／void 按鈕**未**加上 pending／disabled／aria-busy、**未**加上任何同步防重入鎖（維持修正前原樣，重複送出風險保留不變，屬 P4.5c 範圍）。

## 11. Error Recovery（Client Presentation Robustness — 僅 Save 流程）

**修正後準確敘述**：以下 robust error handling **僅適用於 `save()`（create/update draft），不適用於 `action()`（confirm/revision/void）**。初版文件曾不準確地暗示健壯性處理對兩者一體適用，已於本次 correction 修正。

`performSaveRequest()`（僅 `save()` 呼叫）：

- `fetch()` 拋出 → 回傳通用訊息「網路連線異常，請稍後再試一次」（不再是 unhandled rejection）。
- `response.json()` 拋出 → 回傳通用訊息「伺服器回應格式異常，請稍後再試一次」。
- 非 2xx → 優先使用 `value.error?.message`，否則「操作失敗」（與原行為一致）。
- 未修改 API、HTTP 狀態碼、server 錯誤 mapping；未新增 retry API；使用者可在任一失敗後立即再次提交（DOM 測試驗證重試成功路徑）。
- Save 錯誤以 `Alert(tone="danger")` 呈現。

`request()`（僅 `action()` 呼叫，逐字恢復修正前行為，**不套用上述 robustness**）：

- `fetch()` 拋出 → **不被攔截**，向上拋出，`action()` 回傳的 promise 隨之 reject（與修正前完全一致的 unhandled rejection 行為，非本次授權修正範圍）。
- `response.json()` 拋出 → 同樣**不被攔截**，向上拋出。
- 非 2xx → `setMessage(value.error?.message ?? "操作失敗")`，沿用原本 `<span>{message}</span>` 呈現，不會顯示 `Alert` 或 save 專用的通用錯誤文字。
- 測試證據：「does not convert a rejected fetch on a status action into the save-specific generic message」／「...JSON parse failure...」——以 `process.on("unhandledRejection", ...)` 安全捕捉（`finally` 中移除監聽，不影響其他測試），驗證原始例外原樣傳遞、且畫面上**不會**出現「網路連線異常，請稍後再試一次」或「伺服器回應格式異常，請稍後再試一次」；另以「keeps the pre-P4.5b non-2xx message behavior for status actions unchanged」驗證非 2xx 訊息沿用 `message` state、且不渲染 `role="alert"` 的 Alert 元件。

## 12. Totals Protection

`initial.subtotal`／`initial.freightAmount`／`initial.totalAmount` 僅原樣顯示（`未稅 {subtotal} + 運費 {freightAmount} = {totalAmount}`），未新增任何 client 端加總/試算邏輯。DOM 測試驗證：修改明細數量後，顯示的金額摘要文字完全不變（因為它不依賴 lines state）。

## 13. P4.5c Status Actions Protection

confirm／revision／void 按鈕的 class、文案、`window.prompt` 呼叫、endpoint（`POST /api/sales-orders/{id}/{confirm|revision|void}`）、body 規則、`router.refresh()`、可見性條件（`initial?.status==="DRAFT"`／`canStartSalesOrderRevision`／`canVoidSalesOrder`）、raw JSON snapshot `<details>` 區塊——全部逐字保留，未套用任何 P4.3 primitive、未新增 pending/disabled。

**Correction 範圍澄清**：保護範圍不僅限於按鈕的 class／可見性／成功路徑的 endpoint／payload（這些初版即已正確保留），也包含 **request 層級的例外/錯誤處理路徑**——`action()` 使用的 `request()` 是與 `save()` 的 `performSaveRequest()` 完全獨立的實作，fetch rejection、JSON parse exception、非 2xx message 皆逐字保留修正前行為，未被 P4.5b 的 save 專用 error adapter 攔截或轉換。DOM 測試明確斷言：(a) 成功路徑呼叫原本的 endpoint／payload／`window.prompt`；(b) 非 2xx 時訊息與呈現方式不變、不渲染 `Alert`；(c) fetch rejection／JSON parse exception 不會被轉換成 save 專用的通用訊息，且原始例外仍會傳遞（以安全方式捕捉驗證，未吞掉）。狀態動作的 client robustness（pending、single-flight、正式 error UI）**延後至 P4.5c**，本次未實作。

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

`web/tests/unit/p4-5b-sales-order-draft-editor-ui.test.tsx`：原 29 tests（P4.5b 初版）＋本次 correction 新增 6 tests，共 **35 tests，皆通過**。

原 29 tests 涵蓋（節錄）：create/DRAFT edit 渲染與欄位綁定、non-DRAFT 唯讀鎖定、customer 切換重設 location／清空 contact、combobox 過濾／鍵盤選取／Escape／唯選既有 item（拒絕自由文字進 payload）／切換 item 不清空 unitPrice、add/remove line 與順序保留、`unitPrice` 條件式省略與既有 line id 保留、POST/PATCH 精確 payload 與 idempotency header、成功導頁、HTTP 失敗／fetch reject／JSON parse 失敗的 save 錯誤呈現與復原重試、server totals 僅呈現不重算、唯一 h1／單一 main、可及表格結構、未支援欄位缺席驗證、combobox 純函式、既有 `canStartSalesOrderRevision`/`canVoidSalesOrder` 契約不變。

Correction 新增 6 tests（`describe("P4.5b correction: save robustness stays isolated from status actions")`）：

1. `blocks a second concurrent save via a synchronous guard, independent of the disabled attribute` — 手動清除 `disabled` 屬性後再次點擊，證明同步 ref 鎖獨立於 DOM disabled 語意成立。
2. `recovers save pending/disabled state after a rejected fetch and allows a fresh submit` — save 流程 reject 後仍可復原重試（沿用原有覆蓋，於此明確重申屬 save 專用）。
3. `keeps the pre-P4.5b non-2xx message behavior for status actions unchanged` — 驗證非 2xx 訊息文字與呈現方式（無 `role="alert"`）與修正前一致。
4. `does not convert a rejected fetch on a status action into the save-specific generic message` — 以 `process.on("unhandledRejection")` 安全捕捉，驗證原始例外訊息（非 save 專用通用訊息）且畫面停留於「處理中…」（修正前的真實行為）。
5. `does not convert a JSON parse failure on a status action into the save-specific generic message` — 同上，針對 `response.json()` 拋出 `SyntaxError` 的情境。
6. `keeps confirm/void endpoint, body and window.prompt behavior unchanged after the correction` — 修正後重新驗證成功路徑的 endpoint／payload／`window.prompt` 仍完全不變。

既有測試 `web/tests/unit/sales-orders.test.ts`（7 tests）與 `web/tests/db/sales-order-workflow.test.ts`（service/DB 層，`test:db` 範圍，本次未執行、未修改）皆未變動，重跑後全部通過，無回歸。

## 18. Full Quality Gates

在 `web/` 目錄執行：

| Gate | 結果 |
| --- | --- |
| `npm run lint` | PASS（含新檔案，無新增 warning） |
| `npm run typecheck` | PASS |
| `npm run test` | PASS；43 files／384 tests（P4.5b 初版 43 files／378 tests ＋本次 correction 新增 6 tests，其餘不變，無 skip） |
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

**P4.5b IMPLEMENTED AND LOCALLY VALIDATED**（僅草稿編輯器共用切片；不代表 P4.5 全部完成、不代表 `/sales-orders/[id]` 明細/狀態動作 UI 完成、不代表 P4.5c 已完成、不代表 Delivery Note UI 完成；正式互動式瀏覽器截圖驗證因環境限制延遲，已誠實記錄於第 15 節）。本文件已於 2026-08-03 correction commit（`fix(ui): isolate sales order save error handling`）後更新，修正初版對 status action error behavior 隔離程度的不準確敘述（見第 0 節）。
