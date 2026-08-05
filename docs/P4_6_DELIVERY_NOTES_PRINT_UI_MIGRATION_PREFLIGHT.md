# P4.6 銷貨單與列印 UI 重整 Preflight

文件狀態：Ready for Implementation Authorization（P4.6a 已依修正後編號授權並實作，詳見第 6 節說明）

版本：V1.1

版本日期：2026-08-05

## 1. 目的與停止點

本文件完成 P4.6 銷貨單與列印 UI 重整的唯讀前置盤點與基線驗證。P4.6 實作尚未開始；本次不建立 feature branch、不修改 production code、測試、API、schema、migration、RBAC、session、authorization、business rule、transaction、audit、idempotency 或受保護 Blueprint。

正式實作前仍須取得明確授權，從最新 `origin/main` 建立 `codex/` feature branch，重新通過 Git／Blueprint gate，且不得直接在 `main` 實作。

## 2. Git 與 Blueprint 基線

- Branch：`main`
- HEAD／`origin/main`：`5a89cda15393b738d0d71097a150338e2e3de115`（PR #2 merge commit，"Merge pull request #2 from linliwei0909/codex/p4-5-sales-orders-ui"）
- ahead／behind（`origin/main...HEAD`）：`0 / 0`
- staged：空
- `git status --short` 目前顯示兩個 untracked 項目：核准的受保護 `docs/INVENTORY_PRODUCTION_BLUEPRINT.md`，以及本階段新建立、待使用者核准後才會 stage 的 `docs/P4_6_DELIVERY_NOTES_PRINT_UI_MIGRATION_PREFLIGHT.md`（本文件）。
- 受保護 Blueprint 本階段只透過 `git status --short` 確認其路徑仍為 untracked；全程未開啟、搜尋、讀取、修改、stage、commit，未檢查 metadata，未計算或驗證 hash。
- 本階段全程執行的 lint／typecheck／unit／build 讀取或產生的 artefact（`.next`、`tsconfig.typecheck.tsbuildinfo` 等）均為既有 gitignore 範圍內的 build 產物，未造成工作樹追蹤差異；重複執行 `git status --short` 確認除上述兩個 untracked 項目外無其他 diff。

## 3. 正式規格結論

依 `DECISIONS.md`（DEC-057、DEC-058、DEC-059）、`business-rules.md`（第 6、7 節）、`DATABASE_DESIGN.md`、`TECHNICAL_ARCHITECTURE.md`、`IMPLEMENTATION_PLAN.md` 與 `P4_UI_UX_BLUEPRINT.md` 第 37～38 節的優先序檢查，P4.6 範圍固定為「銷貨單與列印」：清單、明細、建立／重建入口、正式列印、下載、補印、例外作廢、列印資訊、錯誤恢復與權限差異；不包含 P5 庫存／生產／應收整合。

固定邊界如下：

- 保留 `/delivery-notes`、`/delivery-notes/[id]` 兩個 route，以及銷售訂單明細頁既有的建立／重建入口（`DeliveryNoteOrderActions`，位於 `/sales-orders/[id]`）。
- 保留 `GET /api/delivery-notes`、`GET /api/delivery-notes/{id}`、`POST /api/delivery-notes/{id}/void`、`POST /api/delivery-notes/{id}/formal-print`、`POST /api/delivery-notes/{id}/reprint`、`GET /api/delivery-notes/{id}/pdf`，以及既有 `POST /api/sales-orders/{id}/delivery-note`、`POST /api/sales-orders/{id}/delivery-note/rebuild`。
- 保留目前公司由 authenticated session 決定、`delivery_notes.read`／`delivery_notes.manage`／`delivery_notes.admin_void` 現行 permission、server authorization 與 company scope（`ADMIN` 具三項；`ORDER_ENTRY` 只有 read／manage，無 admin_void）。
- 保留 `ACTIVE`、`SHIPPED`、`RECEIVABLE_CREATED`、`VOIDED` 狀態語意；UI 不創造 transition 或 capability。`canFormalPrint`／`canReprint`／`canDownload` 三項 print capability 完全由既有 `deliveryNotePrintAction`（`delivery-note-actions.tsx`）server-derived 規則決定，UI 只呈現不重算。
- 保留首次正式列印即出貨、不可變 DB PDF（`bytea`）、預覽與下載無副作用、重印 append-only、`VOIDED` 仍可查閱既有正式 PDF、ADMIN 直接作廢需理由必填等既有 transaction、audit、idempotency 契約。
- 保留清單目前 `deliveryNoteNumber`、`customerKeyword`、`status`、`deliveryNoteDateFrom`、`deliveryNoteDateTo`、`page` 查詢欄位與固定 `pageSize=20`；不新增可變排序或欄位。
- 不加入備註、預計送貨日、客戶採購單號、外部參考號、PDF 預覽、分批出貨、電子簽收或 P5 功能（依 DEC-058／OQ-051，第一版明確排除）。

`OPEN_QUESTIONS.md` 沒有阻塞 P4.6 的 Delivery Note／正式列印業務未決事項。OQ-053／OQ-054 的 company context 與 page contract 遷移仍是部分未決；銷貨單清單與明細頁現況與 Sales Orders 相同，皆使用 `context.selectedCompany`、無 local `companyId` selector，因此應維持 active company，不新增 URL company target，不觸發 OQ-053 的例外情形。OQ-054 的 P4.4～P4.6 全面遷移邊界對 P4.6 的意涵是：清單頁與明細頁都必須採用正式 `PageHeader`／page contract，不得保留 legacy outer container。

## 4. Route Inventory 與現況落差

| Route／元件 | 現行能力 | 主要 presentation 落差 | P4.6 採用方向 |
| --- | --- | --- | --- |
| `/delivery-notes` | 搜尋（單號、客戶關鍵字）、狀態篩選、日期區間、固定每頁 20 筆 | 成功路徑已使用 `PageHeader`、`Card`、`Field`／`Input`／`Select`、`Table*`、`Pagination`、`EmptyState`、`StatusBadge`；但 parse-failure 與 load-failure 分支各自手刻 `<main className={pageStyles.pageStack}>` 內嵌 `Alert`，未共用同一 error boundary helper；查詢表單為原生 `<form>` GET submit，未串接 P4.3 filter/query-preserving 慣例文件化契約 | 統一三種分支（normal／parse-error／load-error）之外層 shell 與錯誤呈現一致性；查詢表單、pagination、query-preserving href 語意不變；補齊 empty／filtered-empty 情境文字檢查 |
| `/delivery-notes/[id]` | 查單、正式列印、補印、下載 PDF、ADMIN 例外作廢、重建歷程連結 | 整頁使用 legacy `mx-auto min-h-screen max-w-7xl px-6 py-12` 外層與大量原生 Tailwind 標記；本地重複定義 `StatusBadge`（與 `delivery-note-view.tsx` 內清單用的 `SharedStatusBadge` 不一致）；銷貨明細使用原生 `<table>` 而非共用 `Table` 元件；「P3.2 銷貨單明細」字樣為過時階段標籤；load-failure 分支同樣使用 legacy container | 遷移至 `PageHeader`／page contract、`Section`／`Card`、共用 `Table*`、`SharedStatusBadge`、`DescriptionList`（如適用）；移除過時階段文字；統一 load-failure 與 not-found 呈現 |
| `delivery-note-view.tsx`（`DeliveryNoteListView`、`DeliveryNoteDetailView`） | 匯出清單與明細兩個 view；清單已用共用元件，明細仍為手刻 markup | 同一檔案內清單與明細元件遷移進度不一致；明細內 `StatusBadge` 本地函式與清單 `SharedStatusBadge` 重複但視覺規則不同（明細用 emerald／rose/slate class，清單用 `tone` prop） | 明細改用與清單一致的 `SharedStatusBadge`／`tone` 語意；移除本地重複 `StatusBadge`；統一 `formatAmount`／`formatTimestamp` 呈現規則不變 |
| `delivery-note-actions.tsx`（`DeliveryNotePrintActions`、`DeliveryNoteVoidAction`） | 依 `printCapabilities`（`canFormalPrint`／`canReprint`／`canDownload`）決定按鈕；正式列印／補印走 dialog 確認；ADMIN 作廢走原因表單；下載成功後串接列印 mutation | 原生 `role="dialog"` div 而非共用 `ConfirmDialog`（無 focus trap／restore／Escape 契約證據，与 P4.5 已建立的 `ConfirmDialog` 用法不一致）；原生 button/textarea 而非 `Button`／`Field`／`Textarea`；message 用單一 `role="status"` 字串而非 `Alert`／`ErrorSummary` | 改用共用 `ConfirmDialog`、`Button`、`Field`／`Textarea`、`Alert`；保留現有 busy guard（`useRef` busy flag）、409 refresh-on-conflict、下載與列印 mutation 分離的既有行為 |
| `loading.tsx` | 清單路由 skeleton | Legacy `mx-auto min-h-screen max-w-7xl animate-pulse` 外層，未使用 P4.3 `Skeleton`／`LoadingState` 共用元件 | 改用共用 loading primitive；不改變 route-level `loading.tsx` 觸發時機 |
| `sales-orders/delivery-note-order-actions.tsx`（建立／重建入口） | 已於 P4.5c 遷移完成：`Card`／`Section`／`ConfirmDialog`／`Field`／`Textarea`／`Alert`／`LinkButton` | 無 presentation 落差；P4.6 只需確認與新版 `/delivery-notes` 明細頁的連結目標（`/delivery-notes/{id}`）與呈現慣例一致，不需重構 | 唯讀驗證此檔案與 P4.6 明細頁的視覺／文字一致性；不修改此檔案本身 |

**現況更新（V1.1）**：上表第 2、3 列（`/delivery-notes/[id]` 與 `delivery-note-view.tsx` 中的 `DeliveryNoteDetailView`）所述落差為 V1.0 撰寫當時的 pre-P4.6a 基線；P4.6a 已依第 6 節範圍遷移完成（尚未 stage／commit）。表中 `SharedStatusBadge` 現對應共用 `StatusBadge` 元件，本地重複定義已移除，並新增 `deliveryNoteStatusTone()` 統一衍生 tone。第 1、4、5、6 列（`/delivery-notes` 清單、`delivery-note-actions.tsx`、`loading.tsx`、`sales-orders/delivery-note-order-actions.tsx`）所述落差仍為現況，尚未變動。

## 5. API／Presentation 邊界判定

清單 query 目前支援 `status`、`deliveryNoteNumber`、`customerKeyword`、`deliveryNoteDateFrom`、`deliveryNoteDateTo`、`page`，固定 `pageSize=20`；`deliveryNoteListQuerySchema` 直接等於 `deliveryNoteListFiltersSchema`，無伺服器端可變排序欄位。P4.6 可顯示既有排序與篩選語意，但不得在純 UI 切片新增可變 `sort`、新篩選欄位（如來源訂單建立者、正式列印時間區間）或任意欄位查詢；若產品要求，須另立 API presentation contract 任務。

正式列印／補印／下載三個 capability（`canFormalPrint`、`canReprint`、`canDownload`）已由 `deliveryNotePrintAction`（現名 `deliveryNotePrintActions`，`delivery-note-actions.tsx:15-32`）依 `status`、`hasFormalPdf`、`canManage`、`canRead` 純函式衍生，且與 `DECISIONS.md` DEC-058 的狀態矩陣（`ACTIVE` 可首次列印；`SHIPPED`／`RECEIVABLE_CREATED` 可補印及下載；`VOIDED` 只能查閱既有 PDF）一致。P4.6 只能重新呈現既有 capability 布林值，不得改變其衍生規則、新增第四種 capability，或在 client 端重新計算 server 未提供的狀態轉換。

`POST /api/delivery-notes/{id}/formal-print` 與 `/reprint` 皆要求 `Idempotency-Key`；現有 client（`createPrintMutationSession`）已封裝 idempotency key 產生與重試語意。P4.6 UI 遷移不得改變 key 產生時機、payload 或 API method／path，僅能調整觸發元件與 dialog 呈現。

`DeliveryNoteVoidAction` 目前的原因驗證（trim 後必填）為 client-side 提示；server 端 `adminVoidDeliveryNoteRequestSchema` 已有相同 `min(1).max(1000)` 限制作為權威驗證。P4.6 可將 client 驗證訊息改為使用共用 `Field`／`FieldError` 呈現，但不得放寬或收緊實際驗證邊界，也不得改變 `delivery_notes.admin_void` 權限檢查。

## 6. 建議工程切片

> 編號修正說明（V1.1）：本文件 V1.0 原將切片依「清單→明細→操作」排序為 P4.6a／P4.6b／P4.6c。使用者於後續 session 中已明確將明細頁遷移切片直接授權並實作為「P4.6a」，與 V1.0 原編號不符。V1.1 依實際已授權並實作的順序重新編號，只調整切片編號與對應內容歸屬，不改寫任何切片原本的範圍邊界、fail-fast 規則或驗收條件。P4.6a 為本次唯一已實作切片（尚未 stage／commit，待審查）；P4.6b、P4.6c 尚未開始，不得因本次編號調整而視為已完成或已授權。

### P4.6a：銷貨單明細頁基礎 UI 遷移（已實作，待審查）

- 遷移 `/delivery-notes/[id]` 與 `DeliveryNoteDetailView` 至 `PageHeader`／page contract、共用 `Section`／`Card`／`Table*`／`StatusBadge`。
- 新增共用 `deliveryNoteStatusTone()`，移除本地重複 `StatusBadge`、過時「P3.2 銷貨單明細」階段標籤、legacy `mx-auto max-w-7xl` 外層。
- 保留正式列印摘要（實際出貨日、首次列印時間／者、補印次數、PDF 檔名／大小／產生時間／者）與作廢資訊區塊的既有欄位與條件顯示邏輯；整理資訊層級並補齊 accessible table（caption、欄標題）呈現。
- 補充直接相關的 render／contract 測試。
- 現況：本切片已由使用者另案明確授權並實作，目前工作樹尚未 stage／commit，待審查通過後才可視為完成。

### P4.6b：銷貨單清單與查詢 UI 整理（尚未開始）

- 遷移 `/delivery-notes` 的 parse-error／load-error 分支外層與 `Alert` 呈現，使其與 normal 分支的 `PageHeader`／page contract 完全一致。
- 保留 `deliveryNoteNumber`、`customerKeyword`、`status`、日期區間與固定 `pageSize`；不新增可變欄位。
- 中文狀態、金額千分位、normal／empty／filtered-empty／safe error、desktop／360px；`loading.tsx` 骨架一致性視另案授權範圍決定。
- 現況：尚未開始，不得視為本次 P4.6a 實作範圍的一部分。

### P4.6c：列印、下載、補印與例外作廢操作重整（尚未開始）

- 遷移 `DeliveryNotePrintActions`、`DeliveryNoteVoidAction` 至共用 `ConfirmDialog`、`Button`、`Field`／`Textarea`、`Alert`，取代現行 native `role="dialog"`。
- 保留 busy guard、409 conflict 時 `router.refresh()`、下載與列印 mutation 分離、reprint／formal-print 各自的 idempotency session 行為與既有 capability 衍生規則，不重算或新增 capability。
- 補齊 focus trap／restore、Escape、duplicate-submit guard、action-state 與 retry 行為的鍵盤與 a11y 契約（比照 P4.5c 已驗證之 `ConfirmDialog` 用法）。
- 現況：尚未開始，不得視為本次 P4.6a 實作範圍的一部分。

### P4.6d：Closure（尚未開始）

- 跨切片 static contract、完整 unit regression、production build、fresh disposable DB workflow、schema diff、desktop／360px browser matrix、keyboard/focus、validation 與 precise staged diff review。
- 驗證 `/sales-orders/[id]` 既有建立／重建入口與 `/delivery-notes` 明細頁、清單頁之間的連結與呈現一致性，但不修改 `delivery-note-order-actions.tsx`。
- 只做 closure tests、文件與必要的小型 presentation correction，不加入新功能。
- 現況：尚未開始，需待 P4.6a、P4.6b、P4.6c 皆完成並個別通過審查後才可開始。

每個產品切片使用獨立 commit；任一 gate 失敗不得進入下一切片。

## 7. 測試與品質 Gate

每切片依序執行：scope/Git/Blueprint、targeted unit/DOM tests、lint、typecheck、完整 unit regression、production build、desktop／360px、keyboard/focus、validation、precise staged diff review、獨立 commit。

建議新增或補強：

- 清單 query preservation、pagination、status label、empty/error 與 responsive DOM contract（比照現有 `delivery-notes-ui-contract.test.ts`、`delivery-notes-ui.test.tsx` 擴充，不重寫既有通過的斷言）。
- 明細頁 print capability 矩陣（`ACTIVE`／`SHIPPED`／`RECEIVABLE_CREATED`／`VOIDED` × 有／無正式 PDF）呈現正確性。
- confirm/reprint/void dialogs 的 focus trap/restore、Escape、duplicate-submit guard。
- 下載與列印 mutation 分離、409 conflict recovery、HTTP/JSON/fetch exception recovery 的既有行為不退化。
- legacy 外層 class（`mx-auto min-h-screen max-w-7xl`）、本地重複 `StatusBadge`、過時階段標籤的 P4.6 static closure scan。
- 既有 Delivery Note unit 與 disposable DB workflow regression；不得使用 development 或 production database。

## 8. 目前非 DB 品質基線

| Gate | 結果 |
| --- | --- |
| lint | PASS |
| typecheck | PASS；Next route types generated |
| unit | PASS；44 files／421 tests（`test`：43 files／409 tests + `delivery-note-print.test.ts` 1 file／12 tests，`--maxWorkers=1`），與 P4.5d closure 基準一致，無退化 |
| production build | PASS；37 pages generated，含 `/delivery-notes`、`/delivery-notes/[id]`、`/api/delivery-notes*` 全部既有 route |

本次沒有執行 DB tests、fresh migration、schema diff 或 browser workflow。這些屬正式 implementation slice／closure gate；開始前必須使用全新、guard-compliant disposable database，並重新驗證 host、port、role、database name、兩個 URL 與 runtime identity。

## 9. Fail-fast

遇到下列情況立即停止並請使用者裁決：

- 需要修改 schema、migration、RBAC、session、authorization、API payload、DTO、validation schema、business rule、state machine、Sales Order／正式列印 domain logic、company switching、transaction、audit 或 idempotency。
- 需要新增可變排序或目前 query schema 不支援的篩選欄位。
- 需要 PDF 預覽、分批出貨、電子簽收、備註／預計送貨日／客戶採購單號／外部參考號、P5 或不存在的 domain 欄位。
- 需要大型 framework、重大風險 dependency，或既有 `ConfirmDialog`／`Table`／`Alert` 等 P4.3 共用元件無法覆蓋 P4.6 明細頁與操作的 presentation 需求。
- 正式規格互相矛盾、fresh migration/schema diff 失敗、只能使用不安全 database、受保護 Blueprint 路徑不再經 `git status --short` 顯示為 untracked，或 Git 出現未知差異。

## 10. Preflight 結論

`READY FOR P4.6 IMPLEMENTATION AUTHORIZATION`

兩個既有 Delivery Notes routes（清單已部分遷移、明細於本文件 V1.0 撰寫當時仍為 legacy markup）、既有正式列印／補印／下載／作廢 API contract、P4.2 App Shell、P4.3 Design System 與 P4.5 已建立的 `ConfirmDialog`／capability-driven action 慣例，均可作為遷移基線。開始條件是使用者明確授權 P4.6 實作、建立 feature branch、重新通過 Git／Blueprint gate，並接受「既有 query 固定排序；capability 布林值不重算；新 sort/filter/欄位另案」的範圍邊界。

**目前狀態（V1.1）**：依第 6 節修正後編號，P4.6a（明細頁基礎 UI 遷移）已實作，尚未 stage／commit，待審查通過。下一個可授權切片為 P4.6b（清單與查詢 UI 整理）；P4.6c（列印／下載／補印／例外作廢操作重整）與 P4.6d（Closure）均尚未開始，亦尚未取得實作授權。
