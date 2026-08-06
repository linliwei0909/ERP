# P4.6b — 銷貨單清單與查詢 UI 整理：唯讀前置盤點

## 1. 文件狀態與基線

- **本文件性質**：唯讀前置盤點（preflight）。本次會話僅執行 `git status`／`git diff --check` 等唯讀 git 指令、唯讀讀取程式碼、唯讀執行 lint／typecheck／test／build，並新增本文件。**未修改任何既有程式碼或測試，未 stage、未 commit、未 push、未建立 branch 或 PR。**
- **P4.6a**：已完成並合併（MERGED AND CLOSED）。
- **P4.6b**：尚未實作。本文件僅盤點現況與建議範圍，不構成實作核准。
- **P4.6c**：尚未開始。
- **P4.6d**：尚未開始。
- **基線 commit**：`main` @ `c6d26f28e6fb9b3c643805de443b1f5c7276b3a9`，與 `origin/main` 一致，ahead/behind `0/0`。
- **本文件不得聲稱任何清單頁 UI 已於本次修改** — 以下第 2～6 節描述的皆為既有程式碼現況。

## 2. 現有 route／query 流程

檔案：[web/src/app/(authenticated)/delivery-notes/page.tsx](web/src/app/(authenticated)/delivery-notes/page.tsx)

- **Auth／redirect**：先呼叫 `getPageRequestContext()` 與 `requirePermission(context, "delivery_notes.read")`；`SessionAuthenticationError` → redirect `/login`，`AuthorizationError` → redirect `/access-denied`，其他例外亦 fallback redirect `/login`。
- **Search params 讀取**：`searchParams: Promise<{ status?, deliveryNoteNumber?, customerKeyword?, deliveryNoteDateFrom?, deliveryNoteDateTo?, page? }>`，`await searchParams` 後組成物件傳入 `deliveryNoteListQuerySchema.safeParse`。
- **預設值**：`status` 預設 `"ALL"`；`deliveryNoteNumber`／`customerKeyword`／`deliveryNoteDateFrom`／`deliveryNoteDateTo` 空字串轉 `undefined`；`page` 預設 `"1"`；`pageSize` 固定寫死 `"20"`（前端無法調整）。
- **Schema**（[web/src/lib/delivery-notes/validation.ts:14](web/src/lib/delivery-notes/validation.ts)，`deliveryNoteListFiltersSchema`，經 `api.ts` 重新匯出為 `deliveryNoteListQuerySchema`）：
  - `status`: enum `["ACTIVE","SHIPPED","RECEIVABLE_CREATED","VOIDED","ALL"]`，預設 `"ALL"`
  - `deliveryNoteNumber`: string，trim，max 32，optional
  - `deliveryNoteDateFrom`／`deliveryNoteDateTo`: `dateOnlySchema`，optional；`.refine()` 確保起日 ≤ 迄日，否則錯誤掛在 `deliveryNoteDateTo`
  - `customerKeyword`: string，trim，max 100，optional
  - `page`: coerce number，int，min 1，預設 1
  - `pageSize`: coerce number，int，min 1，max 100，預設 20
  - `.strict()` — 任何多餘欄位會使整體 parse 失敗
- **Invalid query 處理**：`safeParse` 失敗時，直接 return 一個含 `PageHeader` ＋ `Alert(tone="danger", title="篩選條件不正確")` 的畫面，不呼叫 service，不 redirect。訊息固定為「請確認日期範圍、狀態及頁碼後重新查詢。」不會逐欄列出是哪個欄位不合法。
- **查詢傳入 service**：`listDeliveryNotes(prisma, { context, companyId: context.selectedCompany.id, filters: parsed.data })`（[web/src/lib/delivery-notes/service.ts](web/src/lib/delivery-notes/service.ts)）。
- **建立者資料補查**：service 回傳的 `result.deliveryNotes` 不含 `createdBy`，page.tsx 另外用 `prisma.deliveryNote.findMany({ where: { companyId, id: { in: ids } }, select: { id, createdBy: { id, username } } })` 補查，再以 `Map` 合併進 `DeliveryNoteListItemView`。若某筆缺少 `createdBy` 會 `throw new Error("銷貨單建立者資料不完整")`，被外層 `catch` 吞掉並導向載入失敗畫面。
- **Service 例外處理**：整段 `listDeliveryNotes` + 建立者補查包在 `try/catch`；任何例外都設 `viewData = undefined`，接著 render `Alert(tone="danger", title="銷貨單清單載入失敗")`，不區分錯誤種類（400/403/404/500 皆同一畫面）。
- **回傳資料傳給 `DeliveryNoteListView`**：`company`、`items`（`DeliveryNoteSummaryDto & { createdBy }`）、展開 `viewData.pagination`（`page`/`pageSize`/`total`/`totalPages`）、`query`（僅回填 5 個篩選欄位，不含 `page`／`pageSize`）。
- **Pagination metadata 產生**：完全由 `listDeliveryNotes` service 回傳（尚未讀取此段 service 內部實作，僅知回傳形狀為 `{ page, pageSize, total, totalPages }`）。清單頁未自行計算分頁。
- **無 `notFound()` 呼叫**（與 `[id]/page.tsx` 不同，因清單頁沒有「單筆不存在」的概念）。

## 3. UI 元件盤點（現況，未變更）

檔案：[web/src/app/(authenticated)/delivery-notes/delivery-note-view.tsx](web/src/app/(authenticated)/delivery-notes/delivery-note-view.tsx)（`DeliveryNoteListView` 部分，第 84–227 行）

**已採用設計系統元件**：`PageHeader`、`Card`、`Field`、`Input`、`Select`、`Button`、`LinkButton`、`TableContainer`／`Table`／`TableCaption`／`TableHeader`／`TableRow`／`TableHead`／`TableBody`／`TableCell`／`TableEmptyRow`、`StatusBadge`、`EmptyState`、`Pagination`。清單頁與 [web/src/app/(authenticated)/sales-orders/sales-order-list-view.tsx](web/src/app/(authenticated)/sales-orders/sales-order-list-view.tsx)（P4.5，已核准合併）的結構、`pageStyles.filterGrid`／`pageStyles.tableFooter`／`pageStyles.resultCount`／`pageStyles.tableLink` 用法幾乎一致——**清單頁本體已高度遷移，不是從零開始的整理**。

**尚未採用 / 缺口**：
- `loading.tsx`：完全未使用 `LoadingState`／`Skeleton`，是唯一明顯的 legacy 表面（見第 4 節）。
- 無 `Section` 使用（清單頁不需要小節分隔，`Card` 已足夠——非缺口，屬合理現況）。
- 無 raw `<input>`/`<select>`/`<button>`、無任意色碼、無 page-local 重複 primitive、無不一致間距／heading——均已對齊。
- `page.tsx` 的兩個錯誤畫面（invalid query／load failure）各自手刻 `<main><PageHeader/><Alert/></main>`，與 `[id]/page.tsx` 的 not-found 畫面模式一致，屬既有慣例而非缺口。

## 4. loading／error／empty state

- **`loading.tsx`**（[web/src/app/(authenticated)/delivery-notes/loading.tsx](web/src/app/(authenticated)/delivery-notes/loading.tsx)）：純 raw Tailwind，`animate-pulse` + `bg-slate-200` 色塊，搭配 `<p className="sr-only">正在載入銷貨單</p>`。**未使用** `LoadingState` 或 `Skeleton` 元件。`sales-orders` 目錄**完全沒有** `loading.tsx`（無對照基準）。
- **既有測試鎖定此實作**：[web/tests/unit/delivery-notes-ui.test.tsx:241-245](web/tests/unit/delivery-notes-ui.test.tsx) 的 `"renders an accessible loading state"` 明確斷言 `html.toContain("animate-pulse")` 與 `"正在載入銷貨單"`。**若 P4.6b 將 `loading.tsx` 遷移為 `LoadingState`／`Skeleton`，此測試的斷言內容必須同步更新**（`animate-pulse` 字串不會再存在），這是屬於本切片範圍內、與程式改動直接綁定的必要測試更新，不同於「不得修改既有測試」所指的無關測試。
- **Parse error（invalid query）**：`page.tsx` 明確處理，回傳 `Alert(tone="danger", title="篩選條件不正確")`，不呼叫 service。
- **Authentication error**：`getPageRequestContext()` 拋出 `SessionAuthenticationError` → redirect `/login`。
- **Authorization error**：`requirePermission` 拋出 `AuthorizationError` → redirect `/access-denied`。
- **Service error**：`listDeliveryNotes` 或建立者補查拋出任何例外 → 統一 `Alert(tone="danger", title="銷貨單清單載入失敗")`，無錯誤分類、無 retry 連結（僅文字建議重新整理）。
- **Zero result（空清單）**：`items.length === 0` 時，`TableEmptyRow` 內顯示 `EmptyState(variant="no-results", title="查無銷貨單", ...)`。**注意**：不論是否有套用篩選條件都固定用 `"no-results"` 這個 variant／文案；`sales-order-list-view.tsx` 則有 `isFiltered` 判斷，未篩選時顯示 `variant="no-data"`／「尚無銷售訂單」。此為兩頁面現有的不一致點。
- **Invalid page（分頁超界）**：`page` 由 zod coerce 為 number（min 1），若查詢字串超出總頁數，目前無程式碼片段顯示會 clamp 或報錯——`page.tsx` 直接把 `parsed.data.page` 交給 service，行為取決於尚未讀取的 service 內部邏輯；`DeliveryNoteListView` 收到的 `page`/`totalPages` 直接用於 `Pagination`（其元件本身有 `Math.min(Math.max(1, currentPage), safeTotalPages)` 的自我保護）。
- **Invalid status**：因 schema 為 `enum` 且非法值會直接讓整個 `safeParse` 失敗，觸發上述「篩選條件不正確」畫面，而非忽略或 fallback 成 `ALL`。

## 5. Pagination

- **共用元件**：已有 [web/src/components/ui/pagination.tsx](web/src/components/ui/pagination.tsx) `Pagination`，清單頁與 sales-orders 清單頁共用同一元件，無需新建。
- **URL 參數保留**：`DeliveryNoteListView` 內 `pageHref(target)` 用 `URLSearchParams({ ...query, page: String(target) })` 組出下一頁／上一頁連結，並移除空值與 `status === "ALL"`；**但 `query` 物件不含 `pageSize`**（`page.tsx` 傳入的 `query` prop 只有 5 個篩選欄位），故換頁連結不會帶 `pageSize`（目前 UI 亦無 pageSize 調整入口，屬一致行為，非 bug）。
- **邊界**：`hasPrevious`/`hasNext` 由 `Pagination` 元件內部依 `currentPage`/`totalPages` 及是否有對應 href 計算；`DeliveryNoteListView` 只在 `page > 1` 才給 `previousHref`、`page < totalPages` 才給 `nextHref`，首末頁行為與 sales-orders 一致。
- **空結果時是否顯示**：`total=0` 時 `totalPages` 由 service 決定（未讀取其內部實作，但依 `Pagination` 的 `Math.max(1, totalPages)` 防呆推斷至少顯示「第 1 / 1 頁」，上一頁／下一頁皆為 disabled span）。
- **pageSize 是否可調**：否，UI 完全未提供，`page.tsx` 寫死 `"20"`。
- **Accessibility label**：`Pagination` 元件已內建 `aria-label`（`DeliveryNoteListView` 呼叫時傳入 `label="銷貨單清單分頁"`），disabled 狀態用 `aria-disabled="true"` 的 `<span>`。
- **Mobile 行為**：未見清單頁自訂 mobile CSS；`page-contract.module.css` 有 `.tableFooter` 在 `max-width: 40rem` 時改為 `flex-direction: column`，屬全站共用規則，非清單頁專屬。

## 6. 查詢與篩選 UI 現況分類

| 項目 | 現況分類 |
|---|---|
| 關鍵字搜尋（客戶名稱 `customerKeyword`） | 已存在且可保留 |
| 銷貨單號搜尋（`deliveryNoteNumber`） | 已存在且可保留 |
| 狀態篩選（`status`） | 已存在且可保留 |
| 日期篩選（`deliveryNoteDateFrom`/`deliveryNoteDateTo`） | 已存在且可保留 |
| page size 調整 | 不存在，明確不應在 P4.6b 新增（會擴張業務功能且需改動 schema／service 契約） |
| reset filter 按鈕 | 不存在；「已存在但需 UI 整理」不適用——目前完全沒有 reset 入口，屬「不存在但可能屬 P4.6b」（單純 UI 層級的清空連結，不涉及業務邏輯） |
| submit filter（查詢按鈕） | 已存在且可保留（`<Button type="submit">查詢</Button>`） |
| URL query synchronization | 已存在且可保留（form 為 native GET，送出後瀏覽器以 querystring 導向同路由） |
| server navigation（換頁／篩選皆為整頁請求） | 已存在且可保留，與 sales-orders 一致 |
| invalid query recovery（僅顯示錯誤，無法一鍵清空條件重試） | 已存在但可能需 UI 整理（可考慮在錯誤畫面加上「返回清單」或「清空條件」連結，需與使用者/負責人確認是否屬本切片） |
| empty result handling | 已存在但需 UI 整理（見第 4 節「未篩選 vs 已篩選」文案不一致問題，可比照 sales-orders 的 `isFiltered` 模式對齊） |

不得擴張業務功能：以上僅為現況盤點與 UI 整理候選，非新功能提案。

## 7. P4.6a 共用內容確認

- `deliveryNoteStatusTone()`（[delivery-note-view.tsx:47-51](web/src/app/(authenticated)/delivery-notes/delivery-note-view.tsx)）：清單頁與明細頁共用，P4.6b 可直接沿用，無需重建。
- `StatusBadge` 共用元件：清單頁已使用（第 192-196 行），無需異動。
- `delivery-note-view.tsx` 結構：`DeliveryNoteListView` 與 `DeliveryNoteDetailView` 同檔案共存，`STATUS_LABELS`、`formatAmount`、`formatTimestamp`、`objectValue` 為模組層級共用 helper，清單頁與明細頁都依賴同一份。**若 P4.6b 需要調整清單頁的 helper（例如 `formatTimestamp`），會直接影響明細頁（P4.6a 已完成範圍）**——這正是文件第 8 節要求特別確認的「不得重新修改 P4.6a 已完成明細頁」風險點；建議切片時避免碰觸這些共用 helper 的簽章，若真的無法避免，需另行提出並取得授權，而非隨附在本切片內。
- 明細頁本身（`DeliveryNoteDetailView`、`[id]/page.tsx`、`[id]/delivery-note-actions.tsx`）：P4.6b 不應修改。

## 8. P4.6c 排除範圍確認

清單頁（`page.tsx`／`delivery-note-view.tsx` 的 `DeliveryNoteListView` 部分）**不含**任何列印或作廢 action——這些全部位於 `[id]/delivery-note-actions.tsx`（`DeliveryNotePrintActions`、`DeliveryNoteVoidAction`）與 `[id]/page.tsx`，僅在明細頁掛載。已確認以下項目與清單頁無關、完全保留給 P4.6c：

- formal print／reprint／PDF download（`DeliveryNotePrintActions`，內含 raw `<button>`／native `role="dialog"` 手刻對話框，尚未遷移到 `Dialog`/`Button` 元件）
- exception void（`DeliveryNoteVoidAction`，raw `<textarea>`／`<button>`，同樣未遷移）
- `delivery-note-actions.tsx` 整體重構
- native dialog 替換（目前用 `role="dialog"` 手刻，非 `web/src/components/ui/dialog.tsx` 的 `Dialog` 元件）
- capability-driven action recovery（`deliveryNotePrintActions()` 權限判斷邏輯）
- duplicate-submit guard（`busy.current` ref 模式）
- retry boundary（409 conflict 時的 `router.refresh()` 邏輯）

清單頁純粹是查詢／表格呈現，無任何 mutation 或 action 按鈕，符合 P4.6b／P4.6c 邊界定義。

## 9. 測試盤點

| 測試檔 | 涵蓋範圍 | 與 P4.6b 的關係 |
|---|---|---|
| [tests/unit/delivery-notes-ui.test.tsx](web/tests/unit/delivery-notes-ui.test.tsx)（713 行） | `DeliveryNoteListView` 欄位/篩選/連結渲染（131-159 行）、空清單狀態（161-188 行）、`DeliveryNoteDetailView` 渲染、`loading.tsx` 渲染（241-245 行）、P3.3d 列印能力、mutation client 等 | 清單渲染與 loading 測試在本切片範圍內；若動到 `loading.tsx` 需同步更新 241-245 行斷言；detail／mutation 相關測試不應修改 |
| [tests/unit/delivery-notes-ui-contract.test.ts](web/tests/unit/delivery-notes-ui-contract.test.ts)（78 行） | 首頁導覽權限閘門、清單/明細頁未授權 redirect、清單載入錯誤防護（"keeps explicit list load-error guards"）、P3.3d 確認/取消/重試邊界 | 「load-error guard」契約測試需維持通過；不應修改既有斷言，除非該防護的呈現方式改變（例如統一錯誤文案）才需同步調整 |
| [tests/unit/delivery-notes-api.test.ts](web/tests/unit/delivery-notes-api.test.ts)（617 行） | API 層（route handler）契約，非 UI | 不應修改 |
| [tests/unit/p4-6a-delivery-note-detail-ui.test.tsx](web/tests/unit/p4-6a-delivery-note-detail-ui.test.tsx)（255 行） | P4.6a 明細頁 UI 契約 | 不應修改（明細頁為 P4.6a 已完成並鎖定範圍） |
| [tests/unit/delivery-notes-service.test.ts](web/tests/unit/delivery-notes-service.test.ts) | service 層（含 `listDeliveryNotes` 分頁/篩選邏輯，未逐行盤點） | 不應修改，除非查詢契約本身改變（本切片定義為不改） |

**缺口／P4.6b 應補的 targeted tests（建議，待實作階段核准）**：
- 清單頁在「未篩選」與「已篩選但查無結果」兩種情境下的 `EmptyState` 文案差異（若第 6 節的空狀態整理列入本切片）。
- `loading.tsx` 遷移後，斷言改為檢查 `LoadingState`／`Skeleton` 的 `role="status"`／`aria-live` 屬性，取代目前的 `animate-pulse` 字串比對。
- Invalid query／invalid status／分頁超界等邊界情境目前主要由既有測試間接覆蓋，若 UI 呈現有調整（例如加上清空條件連結），需補對應渲染測試。

## 10. P4.6b 核准候選範圍（建議，非核准）

- 主要候選：`loading.tsx` 遷移至 `LoadingState`／`Skeleton`（目前唯一明確的 legacy 表面，且 sales-orders 無對照可比較一致性）。
- 次要候選（需與負責人確認是否納入）：
  - 空清單狀態依 `isFiltered` 區分文案，比照 `sales-order-list-view.tsx` 模式。
  - 篩選錯誤／載入失敗畫面補上「清空條件」或「返回清單」連結。
- 明確不建議在 P4.6b 新增：page size 調整、任何新篩選欄位、任何業務邏輯變更（schema／service 契約皆維持不動）。

## 11. P4.6c 排除範圍

見第 8 節。彙整：formal print、reprint、PDF download、exception void、`delivery-note-actions.tsx` 重構、native dialog 替換、capability-driven action recovery、duplicate-submit guard、retry boundary——全部保留給 P4.6c，本切片不得觸碰 `[id]/delivery-note-actions.tsx` 或 `[id]/page.tsx`。

## 12. 建議實作切片順序（僅供未來授權參考）

1. `loading.tsx` → `LoadingState`／`Skeleton`，同步更新 `delivery-notes-ui.test.tsx` 241-245 行斷言。
2. （如經確認納入）空清單狀態 `isFiltered` 文案對齊。
3. （如經確認納入）錯誤畫面補充復原連結。

每一步應各自可獨立驗證（lint/typecheck/test/build 全綠）後再進行下一步，避免一次性大改。

## 13. 風險與 fail-fast 條件

- **風險：共用 helper 誤觸明細頁**——`delivery-note-view.tsx` 為單一檔案，清單與明細共用 `STATUS_LABELS`／`formatTimestamp`／`formatAmount`／`deliveryNoteStatusTone`。任何簽章變更都需同時跑 `p4-6a-delivery-note-detail-ui.test.tsx` 確認未破壞明細頁。
- **風險：`loading.tsx` 測試斷言字串比對脆弱**——遷移後必須同步改測試，否則會誤判為迴歸。
- **風險：清單/明細共用 `pageStyles`（`page-contract.module.css`）為全站共用樣式**——不應在本切片修改此 CSS module，若真的需要新增 class，應以新增而非修改既有 class 的方式進行，避免影響 sales-orders 等其他已核准頁面。
- **Fail-fast 條件**：若在切片過程中發現需要修改 service 層查詢契約、schema、或 `[id]` 目錄下任何檔案，應立即停止並回報，不視為 P4.6b 範圍。

## 14. 預估檔案清單

**必須修改**：
- [web/src/app/(authenticated)/delivery-notes/loading.tsx](web/src/app/(authenticated)/delivery-notes/loading.tsx) — 遷移至 `LoadingState`／`Skeleton`。
- [web/tests/unit/delivery-notes-ui.test.tsx](web/tests/unit/delivery-notes-ui.test.tsx) — 同步更新 loading 測試斷言（僅該 `it` 區塊）。

**可能修改（待範圍確認）**：
- [web/src/app/(authenticated)/delivery-notes/delivery-note-view.tsx](web/src/app/(authenticated)/delivery-notes/delivery-note-view.tsx) — 僅限 `DeliveryNoteListView` 函式內的空狀態文案／篩選錯誤復原連結，不得動到 `DeliveryNoteDetailView` 或模組層級 helper 簽章。
- [web/src/app/(authenticated)/delivery-notes/page.tsx](web/src/app/(authenticated)/delivery-notes/page.tsx) — 僅限錯誤畫面文案／連結微調，不得動查詢流程或 schema 呼叫。

**明確不得修改**：
- [web/src/app/(authenticated)/delivery-notes/[id]/page.tsx](web/src/app/(authenticated)/delivery-notes/[id]/page.tsx)、[web/src/app/(authenticated)/delivery-notes/[id]/delivery-note-actions.tsx](web/src/app/(authenticated)/delivery-notes/[id]/delivery-note-actions.tsx) — P4.6a 已完成、P4.6c 範圍。
- [web/src/lib/delivery-notes/validation.ts](web/src/lib/delivery-notes/validation.ts)、[web/src/lib/delivery-notes/api.ts](web/src/lib/delivery-notes/api.ts)、[web/src/lib/delivery-notes/service.ts](web/src/lib/delivery-notes/service.ts) — 查詢契約，非 UI 整理範圍。
- [web/tests/unit/p4-6a-delivery-note-detail-ui.test.tsx](web/tests/unit/p4-6a-delivery-note-detail-ui.test.tsx)、[web/tests/unit/delivery-notes-api.test.ts](web/tests/unit/delivery-notes-api.test.ts)、[web/tests/unit/delivery-notes-service.test.ts](web/tests/unit/delivery-notes-service.test.ts) — 非本切片範圍。
- `docs/INVENTORY_PRODUCTION_BLUEPRINT.md` — 受保護檔案，本次與未來切片皆不得碰觸（除非另有明確授權）。

## 15. 品質基線結果（本次唯讀執行）

- `npm run lint`：**通過**，無警告輸出。
- `npm run typecheck`（`next typegen && tsc --project tsconfig.typecheck.json`）：**通過**，無型別錯誤。
- 測試（`package.json` 的 `test` script，等同盤點要求的 `test:unit`；儲存庫內無獨立 `test:unit` script）：**全數通過**——主測試組 44 個檔案 421 筆測試，另外 `delivery-note-print.test.ts` 獨立跑（`--maxWorkers=1`）1 個檔案 12 筆測試，合計 45 檔／433 筆全綠。
- `npm run build`（`next build`，Turbopack）：**成功**，37/37 頁面產出。過程中出現 1 則既有 Turbopack 警告（`next.config.ts` → `src/lib/delivery-notes/font.ts` → `renderer.ts` → `formal-print.ts` → `api/delivery-notes/[id]/reprint/route.ts` 的 NFT tracing 提示），與清單頁查詢/UI 無關，屬既有環境訊息，非本次任何修改造成（本次未修改任何程式碼）。
- `git diff --check`：無輸出（乾淨，無空白字元問題）。
- `git status --short`：僅 `docs/INVENTORY_PRODUCTION_BLUEPRINT.md`（受保護、untracked）。

## 16. 最終 readiness 判定

`READY FOR P4.6b IMPLEMENTATION AUTHORIZATION`
