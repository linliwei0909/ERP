# P4.6c — 列印、下載、補印與例外作廢操作重整：唯讀前置盤點

## 1. 文件狀態與 Git 基線

- **本文件性質**：純唯讀前置盤點（preflight）。本次會話僅執行唯讀 git 指令（`status`／`diff --check`／`rev-parse`／`rev-list`）、唯讀讀取程式碼與文件、唯讀執行 `lint`／`typecheck`／`test`／`build`，並新增本文件一份。**未修改任何既有 UI、API、service、schema、測試或既有文件；未 stage、未 commit、未 push；未建立 branch 或 PR；未開始任何 P4.6c／P4.6d／P4.7／P5 實作。**
- **修正紀錄（同日，第二次唯讀修正）**：原始版本對 admin void idempotency key 問題同時使用「無阻斷」與「列為 blocker／另案授權事項」兩種矛盾用語，且最終判定未區分子切片。本次修正**僅**調整第 18、19、22、23 節之分類與措辭，統一為單一結論；**未變更任何盤點事實、程式碼結論或已記錄的落差內容**，亦未重新讀取或變更受保護 Blueprint 檔案。
- **P4.6a（銷貨單明細頁基礎 UI 遷移）**：已完成並合併（MERGED AND CLOSED，PR #3，`1b1b134` → `c6d26f2`）。
- **P4.6b（銷貨單清單與查詢 UI 整理／`loading.tsx` 遷移）**：已完成並合併（MERGED AND CLOSED，PR #4，`99c6f91` → `c082aee`）。
- **P4.6c（本文件範圍：列印／下載／補印／例外作廢操作重整）**：尚未實作。本文件僅盤點現況與提出切片建議，不構成實作核准。
- **P4.6d（Closure）**：尚未開始。
- **基線 commit**：`main` @ `c082aeea844086d432d7d9cbd96a6c1994ba2d2e`，與 `origin/main` 一致，`git rev-list --left-right --count HEAD...origin/main` = `0  0`。
- **staged**：空。`git diff --check`：無輸出（乾淨）。
- **`git status --short`（本次開始前）**：僅一個 untracked 項目 `docs/INVENTORY_PRODUCTION_BLUEPRINT.md`。
- **受保護檔案 `docs/INVENTORY_PRODUCTION_BLUEPRINT.md`**：本次全程只透過 `git status --short` 確認其路徑仍為 untracked；全程未開啟、未搜尋、未讀取、未修改、未 stage、未 commit，未檢查其 metadata（大小／mtime），未計算或驗證任何 hash。本文件因此排除該檔案於盤點範圍之外。

## 2. P4.6a／P4.6b 完成狀態

| 切片 | 狀態 | 涵蓋範圍 | 對 P4.6c 的意涵 |
| --- | --- | --- | --- |
| P4.6a | 已合併 | `/delivery-notes/[id]/page.tsx`、`DeliveryNoteDetailView` 遷移至 `PageHeader`／page contract、`Section`／`Card`／`Table*`／`StatusBadge`／`DescriptionList`；新增共用 `deliveryNoteStatusTone()`；移除本地重複 `StatusBadge` 與過時「P3.2」標籤 | 明細頁 presentation 已與設計系統一致；P4.6c 不應重新觸碰 `DeliveryNoteDetailView` 本體或共用 helper 簽章 |
| P4.6b | 已合併 | `/delivery-notes/loading.tsx` 遷移至 `LoadingState`／`Skeleton`；同步更新 `delivery-notes-ui.test.tsx` 對應斷言 | 清單頁與其 loading 骨架已與設計系統一致；與 P4.6c（明細頁操作）無檔案交集 |
| P4.6c | 尚未開始 | 本文件範圍：`DeliveryNotePrintActions`、`DeliveryNoteVoidAction`（`[id]/delivery-note-actions.tsx`） | 本文件盤點對象 |
| P4.6d | 尚未開始 | 跨切片 closure：完整 regression、production build、disposable DB workflow、browser matrix、accessibility、cross-flow validation | 需等待 P4.6c 完成並個別審查通過 |

## 3. P4.6c 範圍與排除範圍

### 範圍內（可能修改，唯讀盤點已列出目標）

- `web/src/app/(authenticated)/delivery-notes/[id]/delivery-note-actions.tsx`（`DeliveryNotePrintActions`、`DeliveryNoteVoidAction`、`deliveryNotePrintActions()`）— presentation 遷移目標。
- 直接鎖定此檔案內容的 source-string 測試（`tests/unit/delivery-notes-ui-contract.test.ts` 第 45～77 行、`tests/unit/delivery-notes-ui.test.tsx` 第 254～313 行）— 若 presentation 改變則對應斷言必須同步更新，但業務語意斷言（capability 矩陣、busy guard、409 refresh）不得放寬。
- 可能新增的 render／DOM 契約測試（focus trap、Escape、duplicate-submit、a11y）。

### 排除範圍（唯讀列出，本次與未來 P4.6c 實作皆不得修改）

- schema／migration（`prisma/schema.prisma`、`prisma/migrations/*`）。
- 正式列印 transaction service 內部邏輯：`web/src/lib/delivery-notes/formal-print.ts`（`formalPrintDeliveryNote`、`reprintDeliveryNote`、`acquireDeliveryNotePrintLocks`）。
- Lock order（`DELIVERY_NOTE_PRINT_LOCK_ORDER` 常數與其執行順序）。
- API response 形狀（`DeliveryNotePrintResponseDto`、`DeliveryNoteMutationResponseDto`、`deliveryNotePdfResponse` 標頭）。
- RBAC permission model（`web/src/lib/auth/rbac.ts`）。
- `package.json`／lockfile。
- P4.6a 已完成的明細頁 presentation（`DeliveryNoteDetailView`、`[id]/page.tsx` 除掛載點外的內容）。
- P4.6b 已完成的清單載入 UI（`page.tsx` 清單分支、`loading.tsx`）。
- `docs/INVENTORY_PRODUCTION_BLUEPRINT.md`。
- 任何 P4.7／P5 功能（庫存、生產、應收整合、PDF 預覽、分批出貨、電子簽收等）。

## 4. Action component inventory

檔案：`web/src/app/(authenticated)/delivery-notes/[id]/delivery-note-actions.tsx`（1 個檔案，共 302 行，3 個 export：`deliveryNotePrintActions`、`DeliveryNotePrintActions`、`DeliveryNoteVoidAction`）。整檔頂端 `"use client"`，無 server component 混入。

### 4.1 `deliveryNotePrintActions(input)`（第 15～32 行）

- **純函式**，非元件；接收 `{ status, hasFormalPdf, canManage, canRead }`，回傳 `DeliveryNotePrintCapabilities = { canFormalPrint, canReprint, canDownload }`。
- `canFormalPrint = status === "ACTIVE" && !hasFormalPdf && canManage`
- `canReprint = status === "SHIPPED" && hasFormalPdf && canManage`
- `canDownload = hasFormalPdf && canRead`
- 由 `[id]/page.tsx` 呼叫 `getDeliveryNote` service 後，經 `mapDeliveryNoteDetail` 產生的 `note.printCapabilities` 傳入子元件（見第 5 節；注意此函式在目前 `page.tsx` 中並未被直接呼叫 — capability 實際上由 service 層 `serializeDetail` 產生後放入 `DeliveryNoteDetail.printCapabilities`，`deliveryNotePrintActions()` 為對應規則的 client-side 純函式版本，供測試與未來 client 端重算參考；本次盤點未發現 `page.tsx` 或 `DeliveryNotePrintActions` 元件實際呼叫此函式 — 這是一個需要澄清的落差，見第 9、22 節）。

### 4.2 `DeliveryNotePrintActions({ deliveryNoteId, capabilities })`（第 34～199 行）

- Client component。State：`dialog: "formal-print" | "reprint" | null`、`mutationPending: boolean`、`downloadPending: boolean`、`message: string`；Ref：`busy = useRef(false)`（duplicate-submit guard）、`session = useRef<ReturnType<typeof createPrintMutationSession> | null>(null)`（保存單次操作的 idempotency operation key）。
- 無 `useTransition`；使用 `async function` + 手動 `useState` pending 旗標。無 `<form>` submit；全部是 `onClick` 直接呼叫 `async` 函式並在函式內 `fetch`（經由 `@/lib/delivery-notes/client` 封裝）。
- **`openDialog(operation)`**：設 `message=""`、`setDialog(operation)`；若 `session.current` 為空才建立新的 `createPrintMutationSession(operation, deliveryNoteId)`（產生一次性 idempotency key，供該次對話框流程重試複用）。
- **`download()`**：`downloadPending` 為 guard（非 `busy.current`，是獨立 state）；呼叫 `downloadDeliveryNotePdf`；成功顯示「正式 PDF 已開始下載」，失敗顯示 `DeliveryNoteClientError.message` 或通用文字。
- **`submitPrint()`**：`busy.current || !dialog || !session.current` 時直接 return（duplicate-submit guard，同步 ref，非 state，可防止同一 event loop tick 內的重複點擊）；成功後 `session.current = null`、`setDialog(null)`、`router.refresh()`，再嘗試 `downloadDeliveryNotePdf`（若下載失敗只顯示提示，不影響列印已完成的事實，不重試列印本身）；失敗且為 409 時額外呼叫 `router.refresh()`（stale-capability 恢復），訊息一律顯示「請使用相同操作重試」。
- **Cancel**：`onClick={() => setDialog(null)}`，僅在 `!mutationPending` 時可用（按鈕 `disabled={mutationPending}`），但取消時 `session.current` **不會清空**——下一次 `openDialog` 若 `session.current` 已存在（同一 operation 尚未成功）會重用同一個 operationKey；只有成功後才明確設為 `null`。若使用者取消後改選另一種操作（例如從「正式列印」對話框取消後點「補印」），因為 `session.current` 已存在且非空，`openDialog("reprint")` 的 `if (!session.current)` 判斷為 false，**不會**建立新 session，會沿用舊的 formal-print 之 `execute`／key——但 UI 上 `dialog` state 已切換為 `"reprint"`，`submitPrint()` 呼叫的其實仍是舊 session 綁定的 `formal-print` 執行邏輯。這是本次盤點發現的一個潛在狀態不一致風險，列入第 22 節 open question（因程式碼可直接驗證此邏輯路徑，非推測）。
- **Retry**：同一顆「確認」按鈕即為 retry 入口；沒有獨立「重試」按鈕或第二個 dialog。
- **原生瀏覽器 API**：無直接呼叫；下載動作委派給 `@/lib/delivery-notes/client` 的 `downloadDeliveryNotePdf`（內部使用 `URL.createObjectURL`／`<a>.click()`）。
- **確認 UI**：手刻 `<div role="dialog" aria-modal="true" aria-label=...>`，非 `web/src/components/ui/dialog.tsx` 的 `Dialog`／`ConfirmDialog`。無 `createPortal`、無 focus trap、無 Escape 處理、無 body scroll lock、無 focus-return（詳見第 10 節）。
- **錯誤顯示**：單一 `<span role="status">{message}</span>`，同一個 `message` state 同時承載成功與失敗訊息（tone 無區分，非 `Alert`）。

### 4.3 `DeliveryNoteVoidAction({ deliveryNoteId })`（第 201～301 行）

- Client component。State：`open: boolean`、`reason: string`、`pending: boolean`、`message: string`；Ref：`busy = useRef(false)`。
- **Client-side 驗證**：`if (!reason.trim()) { setMessage("作廢理由必填"); return; }`——僅在 submit 時檢查，非即時 `onChange` 驗證，也非使用共用 `Field`／`FieldError`。
- **`submit()`**：`busy.current` guard；呼叫 `voidDeliveryNote(deliveryNoteId, reason)`；成功後 `setMessage("銷貨單已作廢")`、`setOpen(false)`、`router.refresh()`；失敗顯示 client error message 或通用文字；**無 409 特殊處理**（不像 `submitPrint()` 會在 409 時額外 `router.refresh()`）。
- **展開/收合模式**：未開啟時渲染一顆按鈕「管理員作廢」；開啟後渲染整塊表單，**沒有 dialog 語意**——外層 `<div>` 完全沒有 `role="dialog"`、`aria-modal`、`aria-label` 任何屬性，是本檔案內比 `DeliveryNotePrintActions` 更弱的 dialog 語意（見第 10 節）。
- **表單元素**：原生 `<textarea>`（`maxLength={1000}`），非共用 `Textarea`／`Field`；原生 `<button>`，非共用 `Button`；`role="alert"` 用於錯誤訊息 `<p>`（唯一使用了語意化 role 的地方）。
- **Cancel**：`onClick={() => { setOpen(false); setMessage(""); }}`，會清空 `reason`？**不會**——`reason` state 未在取消時重置；下次開啟表單會保留上次輸入的文字（唯讀盤點確認：`openDialog`-等價的開啟按鈕 `onClick={() => setOpen(true)}` 也未重置 `reason`）。這是既有行為，非本次發現的 bug，僅記錄現況。
- **鍵盤／焦點**：完全依賴瀏覽器預設 tab 順序，無 focus trap、無 Escape 快捷鍵、無 focus-return-to-trigger。
- **Mobile**：無任何 mobile 專屬樣式；`max-w-md` 為固定寬度容器，未見響應式 breakpoint 調整。

## 5. Formal print 流程

1. **觸發**：`DeliveryNotePrintActions` 內「正式列印」按鈕（`capabilities.canFormalPrint` 為真才渲染），`onClick={() => openDialog("formal-print")}`。
2. **Capability 判斷**：`capabilities.canFormalPrint` 由 `[id]/page.tsx` 從 `note.printCapabilities`（`DeliveryNoteDetailDto.printCapabilities`）取得；此值在 server render 時由 `getDeliveryNote` service 一次計算並序列化進 DTO，`page.tsx` 本身未重算，`DeliveryNotePrintActions` 元件也未重算——**純顯示既有布林值**（本次盤點未在 `service.ts` 中逐行核對 `serializeDetail` 的 capability 衍生公式與 `deliveryNotePrintActions()` 純函式規則是否逐條一致；規則描述（`status === "ACTIVE" && !hasFormalPdf && canManage`）與 `formal-print.ts` service 內 `if (note.status !== "ACTIVE") ...` 及 `if (note.printVersions.length > 0) throw DeliveryNoteFormalPrintExistsError` 的實際闗卡條件一致）。
3. **參數**：`POST /api/delivery-notes/{id}/formal-print`，body 固定 `"{}"`（`deliveryNotePrintRequestSchema = z.object({}).strict()`，不接受任何欄位），headers 帶 `idempotency-key`（`session.operationKey`，於 `openDialog` 時以 `crypto.randomUUID()` 產生一次，同一 dialog 生命週期內固定）。
4. **API route**（`web/src/app/api/delivery-notes/[id]/formal-print/route.ts`）：`assertSameOrigin(request)` → `getApiRequestContext(request)`（認證，失敗會在 `mapDeliveryNoteApiError` 中對應 401）→ `parseDeliveryNotePrintRequest`（body 必須是空物件或無 body）→ `deliveryNoteIdSchema.parse` → `requireDeliveryNoteIdempotencyKey`（header 缺失或超過 255 字元 → 400）→ `formalPrintDeliveryNote(prisma, {...})`。
5. **Service**（`formal-print.ts:347`）：`assertAccess` 要求 `hasCompanyAccess` 且 `hasPermission(roleCodes, "delivery_notes.manage")`（無權限 → `DeliveryNoteAccessDeniedError` → 403）。透過 `executeIdempotent`（`operation = "delivery_note.formal_print"`，24 小時 TTL，payload 為 `{companyId, deliveryNoteId, actorUserId}` 的 hash）包裹 transaction：
   - **Lock order**（`DELIVERY_NOTE_PRINT_LOCK_ORDER`）：`idempotency`（`executeIdempotent` 內部先行）→ `sales_order`（`SELECT ... FOR UPDATE` on `sales_orders`）→ `delivery_note`（`SELECT ... FOR UPDATE` on `delivery_notes`）→ `formal_print_version_invariant`（檢查 `note.printVersions.length > 0`）→ `formal_print_event_invariant`（檢查既有 `FORMAL_PRINT` event）→ `audit`（`writeAudit`）。
   - 業務檢查：`note.status !== "ACTIVE"` → 若已有 print version 拋 `DeliveryNoteFormalPrintExistsError`（409），否則 `DeliveryNotePrintStateError`（409）；`assertSalesOrderShippedTransition(salesOrder.status)` 失敗 → `DeliveryNoteSalesOrderStateError`（409）。
   - 快照解析：`parseDeliveryNoteSnapshot(note, { actualDeliveryDate: taipeiBusinessDate(now), formalPrintedAt: now })`（見 `print-model.ts`，任何欄位不合法 → `DeliveryNoteSnapshotValidationError`，422）。
   - PDF 產生：`renderer.render(model)`（預設 `DeterministicDeliveryNotePdfRenderer`），失敗轉譯為 `DeliveryNotePdfRenderError`（500 或 422，視 code）；`validateRenderedPdf` 二次驗證 mimeType／byteSize／sha256／snapshotVersion 一致性，不一致視為 `DELIVERY_NOTE_PRINT_STORAGE_INVALID`（500）。
   - 寫入：建立 `deliveryNotePrintVersion`（含不可變 `pdfBytes: bytea`）→ 建立 `deliveryNotePrintEvent`（`eventType: "FORMAL_PRINT"`）→ 更新 `deliveryNote`（`status: "SHIPPED"`、`actualDeliveryDate`、`firstPrintedAt`、`firstPrintedById`、`reprintCount: 0`）→ 更新 `salesOrder`（`status: "SHIPPED"`）→ `writeAudit`（含 `idempotencyKeyHash`、`correlationId`）。
   - Idempotency replay：若同 key 且同 payload 已執行過，`executeIdempotent` 回傳 `replayed: true`，service 改走 `loadPersistedResult` 重新查詢既有 version／event 組成相同回應（不重新渲染 PDF、不重複寫入）。
   - Infrastructure error 映射：`IdempotencyConflictError`（同 key 不同 payload）→ `DeliveryNoteIdempotencyConflictError`（409）；`IdempotencyInProgressError`（同 key 併發中）→ `DeliveryNotePrintConcurrencyError`（409，訊息「相同正式列印操作仍在處理中」）；Prisma `P2034`／`P2002` → `DeliveryNotePrintConcurrencyError`（409）。
6. **回應**（`print-api.ts`，`deliveryNotePrintResponse`）：`DeliveryNotePrintResponseDto`，含 `deliveryNote`（`status: "SHIPPED"`、`firstPrintedAt`、`firstPrintedBy`、`reprintCount`）、`salesOrder`、`printVersion`（含 `documentVersion`／`rendererVersion`／`templateVersion`／`fontVersion`／`snapshotVersion`／`sha256`）、`printEvent`（`type: "FORMAL_PRINT"`）、`downloadUrl`、`replayed`、`correlationId`。
7. **前端成功後行為**：`session.current = null` → `setDialog(null)` → `router.refresh()`（重新拉取 server component，取得最新 `printCapabilities`／`status`）→ 立即呼叫 `downloadDeliveryNotePdf`（**自動觸發下載，非使用者第二次點擊**）；下載失敗只顯示提示訊息，不視為列印失敗，也不會重試列印本身。
8. **Retry-ability**：非 409／非 `DeliveryNoteClientError` 的失敗（例如 network error）→ `session.current` **保留不變**（僅在成功時清空），使用者可再次點擊「確認」，`submitPrint()` 會用同一個 `session.current.execute()`，即同一個 idempotency key 重新送出——這是正確的 retry-safe 設計（見第 9 節與 `delivery-note-print-api.test.ts`「reuses one operation key for retry」）。
9. **Non-retryable errors**：`DeliveryNoteFormalPrintExistsError`（已有正式版本）、`DeliveryNotePrintStateError`（狀態不符）、`DeliveryNoteSalesOrderStateError`（訂單狀態不符）、`DeliveryNoteSnapshotValidationError`／`DeliveryNoteFontError`（422，資料契約問題，重試無效）——但 UI **未區分**這些與可重試的網路錯誤，一律顯示相同「請使用相同操作重試」文案，可能誤導使用者對不可重試錯誤持續重試（見第 13、22 節）。
10. **Stale-capability 風險**：若多分頁／多裝置同時開啟同一張銷貨單明細頁，分頁 A 完成正式列印後，分頁 B 仍持有舊的 `capabilities.canFormalPrint = true`（server-rendered at page load，未訂閱任何 revalidation），使用者在分頁 B 點擊「正式列印」會送出請求並收到 409（`DeliveryNoteFormalPrintExistsError`），前端會顯示錯誤訊息但**不會自動 `router.refresh()`**（只有 `error.status === 409` 才 refresh；此處確實是 409，故會 refresh）——因此 409 情境本身有自我修復（refresh 後按鈕會消失）。
11. **Multi-tab／雙重送出風險**：同一分頁內 `busy.current` 可防止同步重複點擊；跨分頁沒有任何鎖定機制（伺服器端 lock 才是最終防線：`FOR UPDATE` 序列化兩個分頁的請求，第二個請求在 lock 釋放後重新讀到 `status !== "ACTIVE"`，回 409）。

## 6. Reprint 流程

- **與正式列印的差異**：只允許 `status === "SHIPPED"` 且已有正式版本（`hasFormalPdf`）；**不重新產生 PDF**——直接讀取既有 `printVersions[0]`，只驗證其 `byteSize`／`sha256` 與 metadata 一致（`DELIVERY_NOTE_PRINT_STORAGE_INVALID` 若不一致），然後建立新的 `deliveryNotePrintEvent`（`eventType: "REPRINT"`）並 `reprintCount: { increment: 1 }`。**不要求填寫理由**（不像 `DeliveryNoteVoidAction`／`rebuildDeliveryNote` 需要 reason）。
- **確認 UI 內容**：「此操作會新增一筆補印紀錄並增加補印次數，正式 PDF 內容不會重新產生。」（與正式列印共用同一個手刻 `role="dialog"` 元件、同一個 `submitPrint()` 函式，只是 `dialog === "reprint"` 分支切換文案與呼叫 `reprintDeliveryNote`）。
- **API route**：`POST /api/delivery-notes/{id}/reprint`，與 formal-print 同構（同一組 `deliveryNoteApiError`／`parseDeliveryNotePrintRequest`／`requireDeliveryNoteIdempotencyKey`），差異只在呼叫 `reprintDeliveryNote` service 與 `deliveryNotePrintResponse(result, context, "REPRINT")`。
- **Idempotency**：獨立 operation 名稱 `"delivery_note.reprint"`，與 formal-print 的 `"delivery_note.formal_print"` 完全隔離（不會互相衝突或誤判重放）。
- **Retry**：同正式列印，`createPrintMutationSession("reprint", ...)` 產生的 key 在同一 dialog 生命週期內固定，失敗重試沿用同一 key（`delivery-note-print-api.test.ts` 已驗證「reuses one operation key for retry」）。
- **Race／stale-state 風險**：與正式列印相同的多分頁風險；額外風險是 `reprintCount` 為 `increment: 1`，若同一 idempotency key 被 replay，`executeIdempotent` 確保不會重複 increment（replay 直接讀既有結果，不重跑 transaction body）。

## 7. PDF download 流程

- **按鈕可見條件**：`capabilities.canDownload`（`hasFormalPdf && canRead`）。
- **API route**：`GET /api/delivery-notes/{id}/pdf`（`export const dynamic = "force-dynamic"`，`runtime = "nodejs"`）。無 `assertSameOrigin`（GET 且僅回應唯讀資料，不需要 same-origin 寫入保護；本次盤點確認此為既有設計，非缺口）。
- **Response content-type**：`application/pdf`；**content-disposition**：`attachment; filename="<ascii fallback>"; filename*=UTF-8''<percent-encoded original>`（`deliveryNotePdfContentDisposition`，RFC 5987 雙重編碼，處理中文檔名）；額外標頭 `cache-control: private, no-store`、`x-content-type-options: nosniff`、`x-request-id`。
- **Authorization**：`assertDownloadAccess`（`getDeliveryNotePdfDownload` 內）要求 `hasCompanyAccess` 且 `hasPermission(roleCodes, "delivery_notes.read")`（比 formal-print／reprint 的 `delivery_notes.manage` 寬鬆——**下載只需 read 權限**，這是刻意的權限分層，非缺口）。
- **無正式列印版本時**：`note.printVersions[0]` 不存在 → `DeliveryNoteFormalPrintMissingError`（404）。
- **VOIDED 銷貨單可否下載**：`getDeliveryNotePdfDownload` 的查詢條件僅 `{ id, companyId }`，**未過濾 `status`**——已作廢但曾正式列印過的銷貨單，其 `printVersions` 仍存在，故**可以下載**（與 `P4_6_DELIVERY_NOTES_PRINT_UI_MIGRATION_PREFLIGHT.md` 第 3 節「`VOIDED` 仍可查閱既有正式 PDF」的規格一致）。但實務上 `canFormalPrint`／`canReprint`／`canDownload` capability 計算依賴 `status`／`hasFormalPdf`；`adminVoidDeliveryNote` 只允許對 `ACTIVE` 狀態的單子作廢（`SHIPPED`／`RECEIVABLE_CREATED` 會被 `DeliveryNoteDownstreamLockedError` 擋下），代表**一旦正式列印過（狀態變成 `SHIPPED`），該單就不可能再被管理員直接作廢** — 所以「VOIDED 且有正式 PDF」這個組合在目前業務流程下不會發生（`VOIDED` 只可能來自 `ACTIVE` 狀態被作廢，此時尚無正式 PDF）。`getDeliveryNotePdfDownload` 不過濾狀態的設計是為了未來 replacement／rebuild 情境下仍能追溯歷史 PDF，而非目前就有作廢後仍可下載的實際案例。
- **下載是否重新產生 PDF**：不會，純讀取 `printVersions[0].pdfBytes`（`take: 1`，未指定排序，依賴資料庫預設順序——目前每張銷貨單最多一筆 print version，故無排序歧義風險）。
- **下載是否建立 audit／event**：**不會**——`getDeliveryNotePdfDownload` 只有 `SELECT`，無 `writeAudit`、無 print event 寫入。下載次數與時間目前無任何稽核紀錄。
- **完整性驗證**：下載前重新計算 `sha256(bytes)` 並比對 `contentHash`，同時驗證 `mimeType === "application/pdf"`、`byteSize` 一致、`%PDF-` magic bytes——任何不一致視為 `DELIVERY_NOTE_PRINT_STORAGE_INVALID`（500）。
- **前端行為**（`client.ts:downloadDeliveryNotePdf`）：`fetch` → 檢查 `response.ok` 與 `content-type` → 解析 `content-disposition` 取得檔名（`filenameFromContentDisposition`，拒絕含 `\r`／`\n` 的值以防 header injection，只接受 `filename*=UTF-8''...` 或 `filename="..."` 兩種格式）→ `response.blob()` → `URL.createObjectURL(blob)` → 建立暫時 `<a>` 並 `click()` → `finally` 區塊確保 `anchor.remove()` 與 `URL.revokeObjectURL()` 一定執行（即使下載觸發失敗也不洩漏 object URL）。**非 `window.location` 導頁方式**，是 blob + `<a>.click()` 模式。
- **SSR／無 DOM 環境防護**：`browserDownloadEnvironment()` 在 `document`／`URL.createObjectURL` 不存在時拋 `DeliveryNoteClientError("目前環境無法下載 PDF", 0, "DOWNLOAD_UNAVAILABLE")`，避免在伺服器端誤呼叫。
- **重複下載／記憶體清理**：每次呼叫都各自建立與釋放 object URL，無跨呼叫共享或快取；`downloadPending` state 防止同一元件內連續點擊觸發多個並行下載請求（但無 debounce，若 `downloadPending` 尚未經 React state 更新完成而快速二次點擊，理論上短時間窗口仍可能觸發兩次 fetch——這是 state-based guard 的典型限制，與 `busy.current`（同步 ref）guard 的即時性不同）。
- **Loading／failure UI**：按鈕文字在 `downloadPending` 時變為「下載中…」，失敗顯示 `DeliveryNoteClientError.message` 或「正式 PDF 下載失敗，請稍後再試」於同一個 `message` 共用區塊。

## 8. Exception void 流程

- **可見條件**：`[id]/page.tsx` 的 `canVoid = note.status === "ACTIVE" && hasPermission(context.roleCodes, "delivery_notes.admin_void")`——**在 server component 算好後才決定是否掛載 `DeliveryNoteVoidAction`**（未掛載則前端完全沒有該元件，非 hidden 而是 unmounted）。
- **RBAC**：`delivery_notes.admin_void` 權限目前**只有 `ADMIN` 角色**擁有（`rbac.ts` 第 24～45 行），`ORDER_ENTRY` 角色沒有此權限（第 46～56 行）。
- **canVoid 計算**：純粹 `status === "ACTIVE"` 布林檢查 + RBAC，**與 server 端 `adminVoidDeliveryNote` service 內的實際闗卡條件一致但非同一段程式碼**——service 額外檢查「目前銷貨單是否為訂單上最新有效單」（`current.id !== input.deliveryNoteId` → `DeliveryNoteAdminVoidNotAllowedError`）與「`SHIPPED`／`RECEIVABLE_CREATED` → `DeliveryNoteDownstreamLockedError`」，這兩項 `page.tsx` 的 `canVoid` 判斷式**沒有覆蓋**（`page.tsx` 只查 `status === "ACTIVE"` 就顯示按鈕；若該銷貨單已被 replacement 取代且新單也是 `ACTIVE`——理論上同一訂單不會同時有兩張 `ACTIVE` 銷貨單，依 DEC-057 的「非 VOIDED 唯一限制」——故此落差目前無法在既有業務規則下實際觸發，但仍是 UI capability 與 service 驗證邊界不完全對齊的既有現況，記錄於第 22 節）。
- **理由必填**：Client 端 `if (!reason.trim())` 阻擋送出；Server 端 `adminVoidDeliveryNoteRequestSchema`（`z.object({ reason: z.string().trim().min(1).max(1000) }).strict()`）與 service 內 `normalizeDeliveryNoteVoidReason`（同樣 `trim`、`min 1`、`max 1000`）為權威驗證層，client 驗證只是提示。
- **Dialog 型式**：**完全非 dialog**——沒有 `role="dialog"`、沒有 `aria-modal`，只是條件渲染的內嵌 `<div>` 區塊（比 `DeliveryNotePrintActions` 的手刻 `role="dialog"` 更弱）。
- **API route**：`POST /api/delivery-notes/{id}/void`，`assertSameOrigin` → `getApiRequestContext` → `adminVoidDeliveryNoteRequestSchema.parse` → `adminVoidDeliveryNote(prisma, {...})`。
- **驗證**：schema 層 `.strict()` 拒絕多餘欄位；service 層 `assertAccess`（`delivery_notes.admin_void`）→ `normalizeDeliveryNoteVoidReason`（雙重驗證，理論上 schema 已檔過，這裡是防禦性重複）。
- **Service transaction**：`executeIdempotent`（`operation: "delivery_note.admin_void"`，payload 含 `voidReason`）包裹：`lockSalesOrder` → `lockCurrentDeliveryNote`（依 `salesOrderId` 查目前有效單並 lock）→ 驗證 `current.id === input.deliveryNoteId`（否則 `DeliveryNoteAdminVoidNotAllowedError`）→ 驗證狀態非 `SHIPPED`／`RECEIVABLE_CREATED`（`DeliveryNoteDownstreamLockedError`）、必須是 `ACTIVE`（否則 `DeliveryNoteAdminVoidNotAllowedError`）→ `assertAdminVoidOrderTransition(order.status)` → 更新 `deliveryNote`（`status: "VOIDED"`、`voidSource: "ADMIN_DIRECT"`、`voidReason`、`voidedAt`、`voidedById`）→ 更新 `salesOrder`（`status: "CONFIRMED"`）→ `writeAudit`（`operation: "delivery_note.voided"`，含 `reason`、before/after JSON）。
- **Locking**：先鎖 `sales_order`，再鎖「目前有效銷貨單」（依訂單反查，非直接鎖傳入的 `deliveryNoteId`——這保證即使傳入的 id 是舊單，也會先定位到目前真正有效的單再驗證一致性）。
- **Replacement 關係**：作廢後訂單狀態回到 `CONFIRMED`，允許重新走建立／重建流程；`writeAudit` metadata 記錄 `orderPreviousStatus`／`orderNewStatus`，但本次盤點在讀取範圍內未見對 `replacedDeliveryNoteId`／`replacementDeliveryNoteId` 的直接寫入（那是 rebuild 流程的關聯欄位，admin_void 是終結性作廢，非 replacement 建立）。
- **是否可能在正式列印後作廢**：**不可能**——`SHIPPED`／`RECEIVABLE_CREATED` 會被 `DeliveryNoteDownstreamLockedError` 擋下，而正式列印必然先把狀態從 `ACTIVE` 轉為 `SHIPPED`，故「已正式列印」與「可 admin_void」互斥。
- **Post-success 頁面更新**：`setOpen(false)` + `router.refresh()`——重新整頁抓取 server data，`canVoid` 會因 `status` 變為 `"VOIDED"` 而重新算出 `false`，按鈕與表單自然消失。
- **失敗恢復**：顯示 `DeliveryNoteClientError.message` 或通用文字於同一表單內 `role="alert"` 區塊；**表單不會關閉**（`setOpen(false)` 只在 `try` 成功分支呼叫），使用者可修改理由後再次點擊「確認作廢」。
- **Duplicate-submit guard**：`busy.current`（同步 ref，函式進入即檢查並設定），與 formal-print／reprint 同一模式。
- **Retry**：同一顆「確認作廢」按鈕；但**每次呼叫 `voidDeliveryNote` 都會產生一個全新的 idempotency key**（`client.ts` 的 `deliveryNoteMutation` 內部呼叫 `createDeliveryNoteIdempotencyKey()`，非像 `createPrintMutationSession` 那樣把 key 保存在外部 ref 供重試複用）——這與正式列印／補印的 retry-safe 設計**不一致**：若第一次呼叫因網路逾時導致 client 判定失敗但 server 端其實已成功寫入（`status` 已變為 `VOIDED`），使用者按「確認作廢」重試時會帶新 key 重新執行 transaction body，此時 `current.status !== "ACTIVE"` 會被判定為 `DeliveryNoteAdminVoidNotAllowedError`（409），而非透過 idempotency 機制得到原始成功結果的 replay。這是本次盤點發現的一個**具體、可由程式碼證實的 retry 語意落差**，列為第 22 節 open question／潜在需求（不在本次修復，僅記錄）。
- **鍵盤／焦點**：無 focus trap、無 Escape、無 focus-return（因為根本不是 dialog）。
- **Mobile**：無專屬處理。

## 9. Capability 契約

| Capability | TS 型別 | 計算位置 | 計算依據 | 是否隨 API response 傳遞 | Staleness 風險 | UI 是否重算 | Disabled vs Hidden |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `canFormalPrint` | `boolean`（`DeliveryNotePrintCapabilities`） | Server（`getDeliveryNote` service，經 `mapDeliveryNoteDetail` 序列化） | `status === "ACTIVE" && !hasFormalPdf && canManage` | 是，`note.printCapabilities.canFormalPrint` 隨 detail response | 是——server render 時的一次性快照，`router.refresh()` 前不會更新 | 否 | Hidden（`capabilities.canFormalPrint ? <button> : null`） |
| `canReprint` | `boolean` | 同上 | `status === "SHIPPED" && hasFormalPdf && canManage` | 是 | 同上 | 否 | Hidden |
| `canDownload` | `boolean` | 同上 | `hasFormalPdf && canRead` | 是 | 同上 | Hidden |
| `canVoid`（非 `DeliveryNotePrintCapabilities` 成員，獨立變數） | `boolean`（`[id]/page.tsx` local const） | Server，`page.tsx` 內直接計算，非由 service DTO 提供 | `note.status === "ACTIVE" && hasPermission(context.roleCodes, "delivery_notes.admin_void")` | 否——不是 DTO 欄位，是 page.tsx 渲染時的 local 變數，只影響是否掛載 `DeliveryNoteVoidAction` | 同上（server render 時快照） | 否 | **Unmounted**（非 hidden／disabled——`canVoid` 為 false 時整個 `DeliveryNoteVoidAction` 元件完全不渲染） |

- **UI 是否重新計算 capability**：**否**。`deliveryNotePrintActions()` 純函式存在於程式碼中且邏輯與 server 端一致，但本次盤點確認 `DeliveryNotePrintActions` 元件與 `[id]/page.tsx` 都**沒有呼叫**這個函式——它目前唯一的用途似乎是作為單元測試對象（`delivery-notes-ui.test.tsx` 第 254～313 行「P3.3d print action capabilities」）與/或供未來 client 端重算使用；實際渲染路徑上，capability 完全來自 server 傳入的 `capabilities` prop，UI 純顯示不重算。
- **Server authorization 是否被 UI-only capability 檢查取代**：**明確沒有**。三個 print API route 與 void API route 各自在 service 層重新執行 `hasCompanyAccess`／`hasPermission` 檢查（`assertAccess`），與 UI 是否顯示按鈕完全無關；即使繞過前端直接呼叫 API，權限與狀態闗卡仍會在 server 端被獨立檢查與強制。這是本次盤點的明確結論：**server authorization 未被 UI capability 取代，是獨立、權威的第二層防線**。
- **與 RBAC 的關係**：`canManage` 對應 `delivery_notes.manage`；`canRead` 對應 `delivery_notes.read`；`canVoid` 對應 `delivery_notes.admin_void`——三者皆是既有 `Permission` 型別的字面值，非本次新增。
- **與文件狀態的關係**：`hasFormalPdf` 等同於 `formalPdf !== null`（`DeliveryNoteFormalPdfSummary | null`），由 `printVersions[0]` 是否存在衍生。
- **與 print version／event 的關係**：`canReprint`／`canDownload` 隱含依賴至少一筆 `deliveryNotePrintVersion` 存在；`canFormalPrint` 隱含依賴零筆。

## 10. Native dialog／共用 Dialog 差距

現有共用 `Dialog`（`web/src/components/ui/dialog.tsx`）以原生 `<dialog>` 元素 + `createPortal` 實作，具備：`showModal()`、focus trap（Tab／Shift+Tab 循環於 `getFocusableElements`）、Escape（`onCancel` 事件 → `requestClose`）、focus-return-to-trigger（`returnFocusRef` 記錄開啟前 `document.activeElement`，關閉時 `queueMicrotask` 還原焦點）、body scroll lock（`acquireBodyScrollLock`）、`aria-modal="true"`、`aria-labelledby`／`aria-describedby`。`ConfirmDialog` 在此基礎上加上標準化 `confirmLabel`／`cancelLabel`／`destructive` 樣式與 `pending` 狀態下鎖定 dismiss。P4.5c（`delivery-note-order-actions.tsx`）已示範此模式的完整用法。

本檔案（`delivery-note-actions.tsx`）內的三處 dialog 語意現況：

| 位置 | 目的 | Blocking？ | Async-pending 支援？ | 錯誤恢復支援？ | Focus trap？ | Escape？ | Focus-return？ | Mobile？ | 可否換成 `Dialog`？ | 可否換成 `ConfirmDialog`？ | 需要新表單型 dialog？ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `DeliveryNotePrintActions` 手刻 `<div role="dialog" aria-modal="true" aria-label>` | 確認正式列印／補印 | 視覺上是（覆蓋於 flex 容器內，非 modal 遮罩，未阻擋底層互動——**沒有 backdrop，底層按鈕與內容仍可被 tab 到或點擊**，這是與真正 modal 的關鍵差異） | 是（`mutationPending` 控制按鈕 disabled 與文字） | 部分（顯示錯誤訊息於 dialog 外的共用 `message` 區塊，dialog 本身不消失，可重試） | 無 | 無（純 DOM，無 `onKeyDown` 監聽） | 無 | 未測試響應式行為，`max-w-lg` 固定寬度 | 可——內容單純（標題＋說明＋取消／確認），符合 `ConfirmDialog` 標準用法（比照 `delivery-note-order-actions.tsx` 的 `ConfirmDialog` 用法） | 可——確認文案為靜態說明，非表單，`ConfirmDialog` 的 `children` slot 已足夠 | 不需要 |
| `DeliveryNoteVoidAction` 展開表單（無任何 `role` 屬性） | 輸入作廢理由並確認 | 否（無 modal 語意，是頁面內展開區塊；同上，無 backdrop） | 是（`pending`） | 是（`role="alert"` 錯誤訊息，表單保留供修改重試） | 無 | 無 | 無 | 未測試 | 可——但因含 `<textarea>` 輸入，需要「表單型」dialog 而非純確認型 | 可（`ConfirmDialog` 支援 `children` 放入表單欄位，如 `delivery-note-order-actions.tsx` 的 `rebuild` 分支已示範 `Field`＋`Textarea` 放入 `ConfirmDialog` children） | 不需要——`ConfirmDialog` 現有 `children` slot 已可承載理由輸入欄位，`delivery-note-order-actions.tsx` 已是現成範本 |
| （無第三個原生 `window.confirm`／`alert`／`prompt`） | — | — | — | — | — | — | — | — | — | — | — |

**結論**：本檔案內沒有使用 `window.confirm`／`window.prompt`／`alert`／原生 `<dialog>`；兩處都是「手刻 role 屬性或完全無 role 的 div」，且都可以直接替換為既有 `ConfirmDialog`（不需要新建表單型 dialog 元件），比照 `delivery-note-order-actions.tsx`（P4.5c 已驗證的 rebuild reason 輸入模式）即可覆蓋兩種需求。

## 11. Duplicate-submit guard

| 操作 | Guard 層 | 機制 | Client busy-state 是否足夠 | Idempotency key | Operation key 語意 | 同瀏覽器雙擊 | Reload 後重送 | 多分頁同時送出 | 網路逾時後重試 | 既有測試 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Formal print | Client `busy.current`（同步 ref）＋ Server `executeIdempotent` | Client 阻擋同步重複點擊；Server 用 idempotency key + payload hash 防止重複執行 transaction body | 否，client guard 只防 UI 層重複點擊；真正防線在 server idempotency | 每次 dialog 開啟產生一個 key，同 dialog 生命週期內固定，成功後才清空 | Key 由 `createPrintMutationSession` 保存在 `session.current`，重試沿用同一 key | 被 `busy.current` 擋下 | Reload 後 `session.current` 遺失（元件重新 mount），下次點擊會產生**新 key**——若前次請求其實已成功，新 key 走 server 端會發現 `status !== "ACTIVE"` 而回 409（可重試安全，因為新 key 送出的請求會被業務闗卡擋下而非誤重複執行），前端 409 會觸發 `router.refresh()` 恢復一致畫面 | 兩分頁各自的 `busy.current`／`session.current` 互不影響；最終序列化在 server `FOR UPDATE` lock，先到者成功，後到者依當時狀態回 409 或（若同 key）idempotent replay（不同分頁不會用同一 key，故是前者） | 若逾時前 server 已成功，重試用同 key → idempotency 記錄命中 → replay 回傳原結果（**retry-safe**） | `delivery-note-print-api.test.ts`「reuses one operation key for retry and creates a new key for a new operation」直接驗證此語意 |
| Reprint | 同上 | 同上 | 同上 | 同上 | 同上 | 同上 | 同上 | 同上 | 同上（retry-safe） | 同上 |
| PDF download | Client `downloadPending`（React state，非同步 ref） | 純 client 端節流，無 server 端冪等機制（下載是 idempotent 的 `GET`，本質上不需要） | 是——因為下載無副作用，重複下載沒有資料一致性風險，只有效能／UX 考量 | 無（`GET` 不需要） | 無 | `downloadPending` 為 state，理論上有極短暫的非同步更新窗口可能被連續觸發（見第 7 節） | 無影響（每次都是全新 fetch） | 無風險（唯讀操作） | 使用者可直接再點一次 | 無專屬測試，但 `delivery-notes-ui.test.tsx` 有下載行為測試（見第 16 節） |
| Admin void | Client `busy.current`＋ Server `executeIdempotent` | 同 formal-print 機制，但 **key 產生方式不同** | 否 | **每次 `submit()` 呼叫都產生全新 key**（`deliveryNoteMutation` 內部 `createDeliveryNoteIdempotencyKey()`），沒有跨呼叫保存的 operation session | 無 operation key 保存概念——這是與 print 操作的關鍵差異 | 被 `busy.current` 擋下 | Reload 後下次送出必為新 key（與 print 操作在此點行為相同，但 print 操作在**未 reload、單純按鈕重試**時會刻意複用 key，void 操作則**連按鈕重試也不會複用 key**） | 同上，序列化在 server lock；因為每次都是新 key，若前次已成功，重試會被業務狀態闗卡（`status !== "ACTIVE"`）擋下回 409，而非 idempotent replay | **非 retry-safe**：逾時後重試無法透過 idempotency 機制取得原結果，只能得到「目前狀態不可執行」的 409（見第 8、13 節） | 無專屬測試驗證此 retry key 語意（`delivery-notes-ui.test.tsx` 第 459～514 行只驗證「voids successfully」與「validates void reason」，未驗證重試時的 key 語意） |

**必須在任何未來 UI 遷移中保持不變的 guard**：`busy.current` 同步 ref 模式（防止同一 tick 內重複觸發）、server 端三個 mutation 的 `executeIdempotent` 包裹與 lock order、`requireDeliveryNoteIdempotencyKey` 的 header 驗證、print 操作的 operation-key-per-dialog-session 語意。

## 12. Retry boundary

- **Formal print／Reprint**：可重試錯誤＝任何非 409 的 `DeliveryNoteClientError`（含 network error、fetch 拋出的 `TypeError`）；同一顆「確認」按鈕即為重試入口，重試沿用 `session.current` 的同一 operation key，故不會因重試而產生第二筆 print version／event（`executeIdempotent` 的 payload hash 命中同一記錄，直接 replay）。取消（`onClick={() => setDialog(null)}`）不會清空 `session.current`，故取消後同 operation 再開啟會沿用同一 key——但如第 4.2 節所述，若使用者取消後切換到**另一種**操作（formal-print → reprint），會錯誤沿用舊 session 的 `execute` 綁定，這是一個需要在未來實作中修正或至少明確測試覆蓋的行為（本次僅記錄，不修復）。若 server 端實際已成功但 client timeout，重試（同 key）會透過 idempotency 機制拿到原始成功結果，不會產生重複 print version。頁面重新整理（refresh）後 `session.current` 遺失，下次操作視為全新 key，若前次已成功會被業務闗卡擋下並回 409（見第 11 節）。錯誤訊息固定為「列印操作未確認完成；請使用相同操作重試」，**未區分**可重試與不可重試錯誤（例如 `DeliveryNoteSnapshotValidationError` 422 也顯示相同文案，但重試永遠會再次失敗，因為快照資料本身無效——需要 code fix 而非重試）。Capability 若在 retry 過程中變化（例如另一分頁已完成列印），下一次重試會收到 409 並觸發 `router.refresh()`。
- **Admin void**：如第 8、11 節所述，**每次重試都是全新 idempotency key**，故無法透過 idempotency 機制安全 replay；若 server 端實際已成功但 client 判定逾時失敗，使用者重試會遇到 409（`DeliveryNoteAdminVoidNotAllowedError`，因為狀態已是 `VOIDED`），錯誤訊息會是該 error 的訊息（「目前狀態不可由管理員直接作廢銷貨單」）而非「操作已完成」的提示——**訊息與實際情況不符，可能誤導使用者以為操作失敗，但實際上第一次已成功**。`router.refresh()` 只在 `try` 成功分支呼叫，此 409 情境不會自動 refresh 頁面來讓使用者發現狀態已改變（除非使用者手動重新整理）。這是本次盤點發現的具體、可驗證的使用者體驗落差，列入第 22 節。
- **PDF download**：無 mutation，不涉及重複資料風險；使用者可任意重試，每次都是全新 `GET`。

## 13. Error handling

| 錯誤情境 | 產生層 | HTTP 狀態 | Response 形狀 | UI 顯示 | 可重試？ | 需要 refresh？ | Dialog 是否保留？ | 現況是否只是通用錯誤？ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 認證失敗（`SessionAuthenticationError`） | API route（`getApiRequestContext`） | 401 | `{error:{code,message},correlationId}` | Client 顯示 `error.message`（`DeliveryNoteClientError`）；detail page 本身若 SSR 階段認證失敗會 redirect `/login`，但 API mutation 層級失敗不會自動 redirect，只顯示訊息 | 否（需重新登入） | 是（需重新載入以觸發登入流程） | 保留 | 是，顯示 server message，非分類處理 |
| 授權失敗（`DeliveryNoteAccessDeniedError`／`AuthorizationError`／`CompanyAccessError`） | Service（`assertAccess`） | 403 | 同上 | 同上 | 否 | 否（按鈕理論上不該出現，因為 capability 由同一權限決定；此為防禦性錯誤） | 保留 | 是 |
| Zod 驗證錯誤 | API route schema parse | 400 | `{error:{code:"VALIDATION_ERROR",message,details:issues}}` | 只顯示 `message`，不顯示 `details` 逐欄錯誤 | 視情況（若是使用者輸入問題可修正重試） | 否 | 保留 | 是 |
| `DeliveryNoteVoidReasonRequiredError` | Service | 400 | 同上 | Client 端已提前擋下（trim 檢查），理論上不會打到 server；若繞過前端直接呼叫 API 才會觸發 | 是（補填理由後重試） | 否 | N/A（client 端不會顯示這個特定 server 錯誤，因為前端已擋） | 是 |
| Capability 衝突／狀態不符（`DeliveryNoteFormalPrintExistsError`／`DeliveryNotePrintStateError`／`DeliveryNoteSalesOrderStateError`／`DeliveryNoteAdminVoidNotAllowedError`／`DeliveryNoteDownstreamLockedError`） | Service | 409 | 同上 | 否（狀態已變，重試只會再次失敗，除非狀態被其他方式改回） | 是（print 操作的 409 會自動 refresh；void 操作的 409 **不會**自動 refresh） | 保留（print）／保留（void） | 是，皆顯示 server message，UI 不做分類 |
| Idempotency key 衝突（`DeliveryNoteIdempotencyConflictError`） | Service／infra 映射 | 409 | 同上 | 理論上不會發生（key 由前端自動產生且不重複使用於不同 payload），除非有 bug | 否 | 視情況 | 保留 | 是 |
| 併發衝突（`DeliveryNotePrintConcurrencyError`／`IdempotencyInProgressError`） | Service／infra 映射 | 409 | 同上 | 是（稍後重試） | 是 | 保留 | 是，訊息「相同正式列印操作仍在處理中」 |
| 已列印/已作廢（同上 409 分類的子情境） | Service | 409 | 同上 | 否 | 是（print） | 保留 | 是 |
| 缺少正式列印版本（`DeliveryNoteFormalPrintMissingError`） | Service（reprint／download） | 404 | 同上 | 是，顯示訊息「銷貨單尚無正式列印版本」 | 否（除非先執行正式列印） | 否 | 保留 | 是 |
| PDF 產生錯誤（`DeliveryNotePdfRenderError`／`DeliveryNoteFontError`） | Service | 500（render failed）／422（其他） | 同上 | 是，通用訊息「正式 PDF 無法產生」或「正式 PDF 輸入或字型契約不符合要求」 | 視錯誤種類（渲染失敗可能重試有效；字型/快照契約問題重試無效） | 否 | 保留 | 是，**未區分**可重試與不可重試 |
| 儲存完整性錯誤（`DELIVERY_NOTE_PRINT_STORAGE_INVALID`） | Service | 500 | 同上 | 否（資料層問題，需人工介入） | 否 | 保留 | 是，通用「正式 PDF 儲存完整性驗證失敗」 |
| DB transaction／lock 衝突（Prisma `P2034`／`P2002`） | Infra 映射 | 409 | 同上 | 是 | 是 | 保留 | 是，映射為 `DeliveryNotePrintConcurrencyError` |
| 網路錯誤／逾時（`TypeError`／fetch 拋出） | Client（`fetch` 本身） | 無 HTTP 狀態（`DeliveryNoteClientError` 未被拋出，是原生 `TypeError` 直接被 `catch` 分支捕捉） | 無 | `error instanceof DeliveryNoteClientError` 為否，顯示通用訊息（「列印操作未確認完成；請使用相同操作重試」或「銷貨單作廢失敗，請稍後再試」） | 是 | 否 | 保留 | 是，完全通用，無法區分是真失敗還是逾時但已成功 |
| 回應非 JSON／畢形（`response.json().catch(() => ({}))`） | Client | 視 `response.status` | `{}`（fallback） | `error.error?.code ?? "UNKNOWN_ERROR"`／`error.error?.message ?? 通用文字` | 視狀態碼 | 視狀態碼 | 保留 | 是 |
| 未知錯誤 | 任意層 | 500（映射預設） | `{error:{code:"INTERNAL_ERROR",message:"處理銷貨單時發生錯誤"}}` | 通用訊息 | 不確定 | 否 | 保留 | 是 |

**整體結論**：後端錯誤分類細緻（15+ 種明確的 error class 各自映射到適當 HTTP 狀態），但**前端一律扁平化為單一字串訊息**，沒有依錯誤類型調整重試建議、按鈕狀態或視覺 tone（`role="status"` 用於成功與失敗共用，只有 void 的失敗訊息用 `role="alert"`）。這是 P4.6c 的核心 UI/UX 落差之一。

## 14. UI／UX 差距（對照 P4.3 Design System）

| 項目 | 現況分類 | 說明 |
| --- | --- | --- |
| Raw button | 未符合 | `DeliveryNotePrintActions`／`DeliveryNoteVoidAction` 全部使用原生 `<button>`＋手刻 Tailwind class（`rounded-lg bg-teal-700 px-4 py-2 text-white ...`），未用共用 `Button` |
| Raw form | 不適用 | 兩處都非 `<form>` submit，是 `onClick` 直接呼叫函式（與共用 `Button`／`onClick` 慣例本身相容，non-issue） |
| Raw textarea | 未符合 | `DeliveryNoteVoidAction` 使用原生 `<textarea>`，未用共用 `Textarea`／`Field` |
| Raw surface | 未符合 | 兩處對話框／表單皆為手刻 `<div className="rounded-xl border ... bg-white p-4 shadow-lg">`，未用 `Card`／`Dialog` |
| Raw dialog | 未符合 | 見第 10 節，兩處皆非共用 `Dialog`／`ConfirmDialog` |
| Hardcoded color | 未符合 | `teal-700`／`teal-800`／`slate-800`／`rose-700`／`rose-200` 等直接 Tailwind 色碼，未使用 `Button` 的 `variant` 語意色（`primary`／`secondary`／`destructive`） |
| Legacy Tailwind | 未符合 | 整檔仍是 P4.3 之前的手刻 utility class 風格，與已遷移的 `DeliveryNoteDetailView`（P4.6a）、`DeliveryNoteListView`／`loading.tsx`（P4.6b）、`DeliveryNoteOrderActions`（P4.5c）不一致 |
| 原生瀏覽器互動 | 已符合（無濫用） | 未使用 `window.confirm`／`alert`／`prompt`；下載使用受控的 blob＋`<a>.click()` 模式，屬合理必要用法 |
| Pending state | 部分符合 | 有 `mutationPending`／`downloadPending`／`pending` state 且會 disable 按鈕與變更文字（「下載中…」「處理中…」），語意正確，但呈現方式（純文字替換）不同於共用 `Button` 的 `pending`／`pendingLabel`（含 `aria-busy` 與內容淡出動畫） |
| Disabled state | 部分符合 | 有 `disabled` 屬性正確套用於忙碌期間，但未搭配 `aria-busy`（`Button` 元件會自動設定 `aria-busy={pending}`，手刻版本沒有） |
| Error alert | 未符合 | 單一 `<span role="status">`／`<p role="alert">` 字串，未用共用 `Alert`（無 icon、無 tone、無 title/body 結構） |
| Success feedback | 未符合 | 成功與失敗共用同一個 `message` 字串變數與同一個 `role="status"` 容器，未區分視覺 tone |
| Focus management | 未符合 | 無 focus trap、無 initial focus、無 focus-return（見第 10 節） |
| Escape | 未符合 | 完全無 `Escape` 鍵處理 |
| Keyboard nav | 部分符合 | 按鈕本身可用 Tab／Enter 操作（原生 `<button>` 語意正確），但缺乏 dialog 情境下的 Tab 循環與 Escape |
| Screen-reader label | 部分符合 | `DeliveryNotePrintActions` 的 dialog 有 `aria-label`；`DeliveryNoteVoidAction` 展開表單完全沒有任何 aria 屬性，`textarea` 用 `<label>` 包裹（可存取，唯一符合處） |
| Mobile layout | 未符合 | 無響應式考量，`max-w-lg`／`max-w-md` 固定寬度，未測試 360px 版面 |
| Destructive-action tone | 部分符合 | `DeliveryNoteVoidAction` 用 `rose-700`／`rose-200` 傳達危險語意（顏色正確），但未用 `Button` 的 `variant="destructive"` 或 `ConfirmDialog` 的 `destructive` prop 統一語意 |
| Confirm copy | 已符合 | 兩處確認文案內容清楚說明操作後果（不可逆、影響範圍），文字品質良好，只是呈現容器未遷移 |
| Reason input | 部分符合 | 有理由輸入與必填驗證，但未用 `Field`（無 `error` prop 整合、無 `required` 視覺提示、無 `FieldError` 元件） |
| Retry copy | 部分符合 | 有明確重試提示文字（「請使用相同操作重試」等），但如第 12～13 節所述，文案未區分可重試與不可重試錯誤 |

## 15. Client／server 邊界

- **Server 頁面（`[id]/page.tsx`）fetch 的資料**：`getDeliveryNote` service 回傳的完整 `DeliveryNoteDetail`（經 `mapDeliveryNoteDetail` 轉為 `DeliveryNoteDetailDto`），包含 `printCapabilities`（三個布林值）與 `status`。頁面另外自行計算 `canVoid`（非 service DTO 欄位）。
- **傳入 client 的 capability**：`note.printCapabilities`（`DeliveryNotePrintCapabilities`）作為 prop 傳給 `DeliveryNotePrintActions`；`canVoid` 決定是否掛載 `DeliveryNoteVoidAction`（該元件本身不接收 capability prop，只接收 `deliveryNoteId`）。
- **Client 端發起的 mutation**：正式列印、補印、下載、作廢，四者皆透過 `@/lib/delivery-notes/client` 的獨立函式各自 `fetch` 對應 API route，皆為 client-initiated HTTP mutation，非 Next.js server action。
- **是否可能改為 server action**：本次盤點未發現技術性阻礙（`formalPrintDeliveryNote`／`reprintDeliveryNote`／`adminVoidDeliveryNote` service 函式本身與 API route 是分離的，理論上可被 server action 直接呼叫），但這會是**契約層級的改動**（idempotency key 目前由 client 產生並放在 header，若改 server action 需要重新設計 key 傳遞方式；下載目前依賴標準 HTTP `GET` + `content-disposition`，server action 無法直接觸發瀏覽器下載，需搭配額外 client fetch）——**此類改動明確超出 P4.6c 的「presentation-only、不改 API/service 契約」邊界**，本文件不建議在 P4.6c 內處理，若要做也需另立契約變更任務並取得授權。
- **目前架構是否應維持**：建議維持既有 API-mutation 架構（client fetch → API route → service），P4.6c 只調整呈現層（元件、dialog、按鈕），不觸碰此邊界。
- **Hydration 需求**：`DeliveryNotePrintActions`／`DeliveryNoteVoidAction` 皆為 `"use client"`，capability／`deliveryNoteId` 作為 prop 從 server 傳入，屬標準 RSC boundary，無特殊 hydration 風險。
- **不必要的 client state／過度耦合**：`DeliveryNotePrintActions` 內 `dialog`、`mutationPending`、`downloadPending`、`message`、`busy`、`session` 六個 state/ref 全部用於同一元件的兩種操作（formal-print／reprint）共用一組 state，職責合理但耦合度偏高（例如第 4.2 節提到的「取消後切換操作類型會沿用舊 session」風險即源自此共用設計）；若遷移到 `ConfirmDialog`，建議評估是否拆分為兩個獨立元件實例或至少讓 `session` 的生命週期與 `dialog` 開關更緊密綁定，以避免該風險。此為 presentation 層級的內部重構空間，不涉及 API/service 契約，可在 P4.6c 範圍內處理。

## 16. Test inventory

| 檔案 | 涵蓋範圍 | 型態 | 現況缺口 | P4.6c 可否修改 |
| --- | --- | --- | --- | --- |
| `tests/unit/delivery-notes-ui-contract.test.ts`（78 行） | 首頁導覽權限閘門、清單/明細頁 redirect、清單 load-error guard、**`[id]/delivery-note-actions.tsx` 的 duplicate-submit guard 與 confirm/cancel/retry 邊界（source-string 斷言，第 45～77 行，明確標註「not in P4.5c scope」）** | Source-string assertion（非 render test） | 若 presentation 改變（例如 `role="dialog"` 換成 `Dialog` 元件、`busy.current` 模式調整措辭），這些斷言**必須同步更新**；但業務語意（busy guard 存在、confirm/cancel/retry 行為存在）**必須保留等價覆蓋**，不得單純刪除斷言 | **P4.6c 範圍內必須修改**（因為正是本切片遷移對象），但只能新增/調整對應本切片改動的斷言，不得放寬其驗證的業務保證 |
| `tests/unit/delivery-notes-ui.test.tsx`（719 行，「P3.3d print action capabilities」254～313 行、「P3.3d print mutation and download client」533～718 行） | Capability 矩陣渲染（`canFormalPrint`／`canDownload`／`canReprint` 依 status／manage/read 權限）、mutation client（`formalPrintDeliveryNote`／`reprintDeliveryNote`／`createPrintMutationSession` 重試 key 語意、`downloadDeliveryNotePdf` blob/anchor/revoke 行為、`voidDeliveryNote`／`createDeliveryNote`／`rebuildDeliveryNote`） | 混合：render test（capability 矩陣為純函式測試，非 DOM render；download/mutation 為純函式/mock fetch 測試） | 目前無 focus trap／Escape／a11y 相關斷言（因為現況本來就沒有這些行為）；無 dialog-切換風險（第 4.2/12 節提到的 session 沿用問題）的專屬測試 | 可新增 render／DOM 契約測試（focus trap、Escape、`aria-*`）；**不得修改**既有 capability 矩陣純函式測試與 mutation client 測試的業務斷言（除非對應的 client 函式簽章因本切片改動，但本文件建議不改變 `client.ts` 契約） |
| `tests/unit/p4-6a-delivery-note-detail-ui.test.tsx`（255 行） | P4.6a 明細頁 UI 契約（含「明細頁內不渲染 print/void action 控制」的斷言，第 160～167 行） | Render test | 無 | **P4.6c 不得修改**——明確鎖定「明細頁本身不含 action」的邊界，屬 P4.6a 已完成範圍 |
| `tests/unit/delivery-note-print.test.ts`（196 行） | 快照解析（`parseDeliveryNoteSnapshot`）、字型契約、renderer 單元測試 | 純函式單元測試 | 與 UI 無關 | **P4.6c 不得修改**（超出 presentation 範圍） |
| `tests/unit/delivery-note-print-api.test.ts`（478 行） | Formal-print／reprint route 邊界、認證/授權映射、下載 route（PDF 完整性、filename、權限）、集中錯誤映射、strict empty print DTO | API route 契約測試 | 與 UI 無關 | **P4.6c 不得修改** |
| `tests/unit/delivery-note-print-lock-order.test.ts`（98 行） | Lock order 契約（idempotency → sales_order → delivery_note）、relation identity 驗證 | Service 契約測試 | 與 UI 無關 | **P4.6c 不得修改** |
| `tests/unit/delivery-notes-api.test.ts`（617 行） | 清單／明細/void API route handler 契約 | API 契約測試 | 與 UI 無關 | **P4.6c 不得修改** |
| `tests/unit/delivery-notes-service.test.ts`（298 行） | Service 層（含 `adminVoidDeliveryNote`、`listDeliveryNotes` 等） | Service 單元測試 | 與 UI 無關 | **P4.6c 不得修改** |
| `tests/db/delivery-note-formal-print.test.ts`（762 行）、`tests/db/delivery-note-workflow.test.ts`（2077 行）、`tests/db/delivery-note-schema.test.ts`、`tests/db/delivery-note-contract-migration.test.ts` | DB 層 transaction／schema／workflow 整合測試（需 disposable DB，`test:db` script，本次未執行） | DB 整合測試 | 未執行（非本次 quality gate 範圍，見第 21 節） | **P4.6c 不得修改**——完全屬 service/schema 契約範圍 |

**P4.6c 應補的 targeted tests（建議，待實作階段核准）**：
- Dialog／表單的 focus trap、初始焦點、Escape 關閉、關閉後焦點回到觸發按鈕的 render 測試（比照 `ConfirmDialog`／`Dialog` 既有測試模式，若存在——本次盤點範圍未包含 `dialog.tsx`／`confirm-dialog.tsx` 自身的測試檔，僅讀取其原始碼；若無獨立測試檔，P4.6c 應在遷移後至少驗證 `delivery-note-actions.tsx` 使用 `ConfirmDialog` 後繼承其既有驗證過的 a11y 行為）。
- 「取消後切換操作類型」的 session 沿用行為（第 4.2、12 節發現的風險）——遷移後應有明確測試鎖定正確行為，避免此落差被無意間保留或惡化。
- Void 理由輸入改用 `Field`／`Textarea` 後的錯誤呈現（`FieldError` 是否正確關聯 `aria-describedby`）。
- 若因 dialog 元件替換而必須調整 `delivery-notes-ui-contract.test.ts` 的 source-string 斷言，應同步新增等價的 render-level 斷言以維持業務保證的測試覆蓋，不得淨減少覆蓋率。

## 17. 文件一致性

- `docs/P4_6_DELIVERY_NOTES_PRINT_UI_MIGRATION_PREFLIGHT.md`（V1.1，2026-08-05）第 4 節表格已預先描述 P4.6c 範圍：「遷移至共用 `ConfirmDialog`、`Button`、`Field`／`Textarea`、`Alert`；保留現有 busy guard（`useRef` busy flag）、409 refresh-on-conflict、下載與列印 mutation 分離的既有行為」——與本次唯讀盤點的程式碼現況**完全一致**，無需修正。
- 第 6 節「P4.6c：列印、下載、補印與例外作廢操作重整（尚未開始）」的範圍描述（「遷移 `DeliveryNotePrintActions`、`DeliveryNoteVoidAction` 至共用 `ConfirmDialog`、`Button`、`Field`／`Textarea`、`Alert`，取代現行 native `role="dialog"`」）與本文件盤點結果一致；但該文件描述 `DeliveryNoteVoidAction` 為「native `role="dialog"`」——本次盤點發現 `DeliveryNoteVoidAction` 實際上**完全沒有** `role="dialog"` 屬性（比該文件描述的還更弱，見第 4.3、10 節），這是一個需要在正式切片文件中更新的**現況描述落差**（非阻塞，但應在 P4.6c 實作文件中修正措辭，避免低估其 a11y 缺口）。
- `docs/P4_6B_DELIVERY_NOTES_LIST_QUERY_UI_PREFLIGHT.md` 第 8、11 節已明確將「formal print／reprint／PDF download／exception void／`delivery-note-actions.tsx` 整體重構／native dialog 替換／capability-driven action recovery／duplicate-submit guard／retry boundary」全部劃給 P4.6c，且明確「不得觸碰 `[id]/delivery-note-actions.tsx` 或 `[id]/page.tsx`」於 P4.6b 範圍——本次確認 P4.6b 實際合併內容（`loading.tsx` 遷移）確實未觸碰這兩個檔案，**範圍邊界未被違反**。
- `docs/DECISIONS.md` DEC-058（銷貨單正式列印、PDF 保存、版型與重印）、DEC-059（凍結快照與正式 PDF 版本契約）所述業務規則（首次正式列印即出貨、不可變 DB PDF、預覽無副作用第一版排除、四種獨立版本語意）與本次讀取的 `formal-print.ts`／`print-model.ts` 程式碼**完全一致**，無過時或矛盾之處。
- `docs/OPEN_QUESTIONS.md` OQ-051（已關閉，併入 DEC-058）、OQ-053／OQ-054（部分未決，涉及 company context 與 PageHeader／PageContainer 全面遷移邊界）——OQ-054 的「P4.4～P4.6 全面遷移邊界」對 P4.6c 的意涵：明細頁（`[id]/page.tsx`）已在 P4.6a 使用正式 `PageHeader`／page contract，`delivery-note-actions.tsx` 內的兩個 action 元件是掛載於已遷移頁面內的**局部元件**，其自身的 dialog／button／textarea 遷移不涉及 `PageHeader`／`PageContainer` 層級決策，故 OQ-054 對 P4.6c 範圍**不構成阻塞**。
- **無新發現的階段編號矛盾**：P4.6a／b／c／d 編號在 `P4_6_...PREFLIGHT.md` V1.1 已修正並與實際合併歷史（PR #2→#3→#4，對應 P4.6a→P4.6b）一致，本文件延續此編號，不重新調整。
- **無 P4.6c 已描述但實際尚未實作的功能誤植**：兩份既有文件皆明確標註 P4.6c「尚未開始」，與 `git log`／程式碼現況一致。

## 18. 建議實作切片

評估使用者提出的四段式切片（P4.6c1～P4.6c4）：

- **P4.6c1（共用 Dialog／action-shell 遷移，不改後端契約）**：將 `DeliveryNotePrintActions` 的手刻 `role="dialog"` 換成 `ConfirmDialog`；`DeliveryNoteVoidAction` 的展開表單換成 `ConfirmDialog`（`children` 放入 `Field`＋`Textarea`，比照 `delivery-note-order-actions.tsx` 的 rebuild 分支）。按鈕全面換成共用 `Button`（含 `variant`／`pending`／`pendingLabel`）。訊息區塊換成共用 `Alert`。**不改變** `busy.current`、`session.current`、`downloadPending`、409-refresh、operation-key-per-session 等既有邏輯與行為契約，只換外殼。
- **P4.6c2（正式列印／補印／下載 UI，維持既有 API/service）**：在 c1 完成的殼上，針對正式列印／補印/下載的個別文案、focus 行為、a11y 細節做微調與補測試；處理第 4.2／12 節發現的「取消後切換操作類型沿用舊 session」風險（**建議修正方向**：取消時清空 `session.current`，或改為每個 dialog 各自持有獨立 session ref，避免跨操作沿用；此為 presentation/state 管理層修正，不涉及 API 契約，可在此切片內處理，但需先取得授權確認是否納入，因為這改變了現有行為，不是純外殼替換）。
- **P4.6c3（例外作廢 UI，維持既有 void service 契約）**：完成 `DeliveryNoteVoidAction` 的 `ConfirmDialog`／`Field`／`Textarea` 遷移與對應測試；**不修正**第 8/12 節發現的「void 每次重試產生新 idempotency key」問題（那是 client.ts 的既有契約行為，修正它會改變 `deliveryNoteMutation`／`voidDeliveryNote` 的既有簽章與語意，超出「不改後端契約」邊界，應獨立列為 open question／另案授權，見第 22 節）。
- **P4.6c4（整合／closure）**：跨 c1～c3 的 static contract 掃描（確認無殘留手刻 `role="dialog"`、無殘留 raw button/textarea）、完整 unit regression、browser smoke（desktop／360px、鍵盤/Escape/focus-return）、accessibility 驗證、cross-flow 驗證（正式列印→補印→下載→頁面重新整理→明細頁 P4.6a 呈現一致）、closure 文件。

**是否適合此四段切片**：**適合**，且與既有 `P4_6_...PREFLIGHT.md` 第 6 節的單一 P4.6c 範圍描述可自然對應（c1～c3 為該範圍的內部拆分，c4 對應既有 P4.6d 的部分工作可能重疊——需在正式授權時明確界定 c4 與既有 P4.6d 的邊界，避免重複或遺漏；**建議**：c4 只做「c1～c3 自身的收尾」，既有 P4.6d 仍保留給跨越 P4.6a／b／c 全部範圍的最終 closure，兩者不合併）。每個子切片應各自獨立 commit、各自通過 lint/typecheck/test/build，任一 gate 失敗不得進入下一子切片，比照 `P4_6_...PREFLIGHT.md` 第 6～7 節既有慣例。

### 18.1 切片 Readiness 矩陣（本次修正新增，消除與第 23 節矛盾）

| 切片 | Readiness | 理由 |
| --- | --- | --- |
| P4.6c1（共用 Dialog／action-shell 外殼遷移） | **READY** | 純換殼（`ConfirmDialog`／`Button`／`Field`／`Textarea`／`Alert`），不觸碰 `client.ts`、idempotency、retry 語意；與 admin void 的 key 重用落差完全無關 |
| P4.6c2（formal print／reprint／download UI） | **READY** | 不涉及 admin void；正式列印／補印本身已是 retry-safe（operation-key-per-session），本次盤點未發現任何阻斷其 UI 遷移的落差 |
| P4.6c3（exception void UI） | **READY WITH CONSTRAINTS** | UI 外殼遷移（`ConfirmDialog`／`Field`／`Textarea`）可直接進行，**不需要**先解決 admin void 的 idempotency key 重用問題；**限制**：遷移時必須逐位元保留 `client.ts` 現有 `voidDeliveryNote`／`deliveryNoteMutation` 呼叫方式與現有錯誤處理行為，不得在未另行授權前調整其 retry／idempotency 契約（見第 19、22 節） |
| P4.6c4（整合／closure） | **READY**（前提：c1～c3 個別完成並通過各自 gate） | 收尾工作不涉及 admin void 契約本身，僅驗證 UI 遷移結果與既有業務語意一致 |

**結論**：admin void 的 idempotency key 落差**不阻斷任何子切片**（包括 c3）——DB 層的 `lockCurrentDeliveryNote` 與 `status !== "ACTIVE"` 檢查（第 8 節）已獨立防止真正的重複作廢，此落差影響的是**逾時後重試的錯誤訊息語意**，不是資料一致性，因此屬非阻斷 deferred risk，而非任何切片的 blocker。

## 19. 預估修改檔案

**必須修改**：
- `web/src/app/(authenticated)/delivery-notes/[id]/delivery-note-actions.tsx` — 核心遷移目標（`DeliveryNotePrintActions`、`DeliveryNoteVoidAction`）。
- `web/tests/unit/delivery-notes-ui-contract.test.ts`（第 45～77 行）— source-string 斷言必須同步更新以反映新的 DOM 結構，同時保留其驗證的業務保證（busy guard、confirm/cancel/retry 存在）。

**可能修改（視切片範圍與授權觸發）**：
- `web/tests/unit/delivery-notes-ui.test.tsx`（第 254～313 行 capability 矩陣、第 533～718 行 mutation client）— 若遷移過程中新增 render-level 測試或需要調整既有斷言以配合 DOM 結構變化（不應改變其驗證的業務語意）。
- 新增測試檔（例如 `p4-6c-delivery-note-actions-ui.test.tsx`，比照 `p4-6a-delivery-note-detail-ui.test.tsx` 命名慣例）— 若決定新增獨立測試檔案而非擴充既有檔案。
- `web/src/app/(authenticated)/delivery-notes/[id]/delivery-note-actions.tsx` 內的 `session.current` 生命週期邏輯（第 18 節 c2 建議的修正）— **僅在明確取得授權後**才視為本切片範圍，否則維持現狀只換外殼。

**明確不得修改**：
- `web/prisma/schema.prisma`、`web/prisma/migrations/*`。
- `web/src/lib/delivery-notes/formal-print.ts`（transaction／lock order 內部邏輯）。
- `web/src/lib/delivery-notes/print-api.ts`、`web/src/lib/delivery-notes/print-download.ts`（API response 形狀）。
- `web/src/lib/auth/rbac.ts`（RBAC permission model）。
- `web/package.json`、`web/package-lock.json`（或對應 lockfile）。
- `web/src/app/(authenticated)/delivery-notes/[id]/page.tsx` 除掛載點外的內容、`web/src/app/(authenticated)/delivery-notes/delivery-note-view.tsx` 的 `DeliveryNoteDetailView`（P4.6a 已完成範圍）。
- `web/src/app/(authenticated)/delivery-notes/page.tsx`、`web/src/app/(authenticated)/delivery-notes/loading.tsx`（P4.6b 已完成範圍）。
- `web/tests/unit/p4-6a-delivery-note-detail-ui.test.tsx`、`web/tests/unit/delivery-note-print.test.ts`、`web/tests/unit/delivery-note-print-api.test.ts`、`web/tests/unit/delivery-note-print-lock-order.test.ts`、`web/tests/unit/delivery-notes-api.test.ts`、`web/tests/unit/delivery-notes-service.test.ts`、`web/tests/db/*`。
- `docs/INVENTORY_PRODUCTION_BLUEPRINT.md`。
- 任何 P4.7／P5 相關檔案（不存在於目前程式碼庫，不得新建）。

**已知既有行為落差（Non-blocking deferred risk；不阻斷任何 P4.6c 子切片，含 c3）——現有行為必須逐位元保留，未經另行授權不得變更下列既有 retry／idempotency／capability-boundary 契約**：
- Admin void 的 client-side idempotency key 未跨重試複用（`client.ts` 的 `deliveryNoteMutation`／`voidDeliveryNote`），造成逾時後重試無法透過 idempotency 機制安全 replay，僅影響錯誤訊息語意，不影響資料一致性（DB 層 `status !== "ACTIVE"` 檢查已獨立防止重複作廢；見第 8、12、18.1、22 節）。
- `page.tsx` 的 `canVoid` 判斷式未完全覆蓋 service 層的「目前有效單」與「downstream locked」闗卡（見第 8 節；目前業務規則下無法實際觸發，風險等級低，但邊界不完全對齊）。

以上兩項於 P4.6c（含 c3）UI 遷移期間**維持現狀、不修復**；若未來需要調整，須另立契約變更任務並取得獨立授權，不得併入本次 presentation-only 範圍。

## 20. 風險與 fail-fast 條件

- **風險：session 沿用造成操作類型混淆**——第 4.2、12、18 節詳述的「取消後切換 formal-print/reprint 沿用舊 session」風險，屬既有程式碼行為，遷移時若不明確處理，可能被無意間保留甚至因外殼替換而更難察覺。
- **風險：void 重試的 idempotency key 語意**——第 8、12 節詳述，非本次修復範圍，但任何未來對 `client.ts` 的觸碰都必須意識到此既有落差，避免誤以為所有 mutation 都有相同的 retry-safe 保證。
- **風險：`delivery-notes-ui-contract.test.ts` 的 source-string 斷言脆弱性**——該測試檔明確以字串比對鎖定目前實作（`role="dialog"`、特定中文文案、特定程式碼片段），任何 presentation 改動幾乎必然需要同步修改此測試；必須確保修改後的斷言仍驗證相同的業務保證（busy guard、confirm/cancel/retry 存在），而非單純刪除以求測試通過。
- **風險：兩個 action 元件目前共用同一個 `message` state 語意（單一字串同時表達成功/失敗）**——遷移到 `Alert` 時需要決定 tone 判斷依據（目前程式碼沒有明確的 success/error boolean，只有字串內容），需要在遷移時新增明確的 tone state，屬 presentation 邏輯調整，不涉及契約，但需仔細設計避免遺漏某些訊息情境的 tone。
- **Fail-fast 條件**（比照既有 P4.6 系列文件慣例）：
  - 若發現需要修改 schema、migration、RBAC、session、authorization、API payload/response 形狀、service transaction 邏輯、lock order、idempotency 機制的既有語意（例如統一 void 與 print 的 key 複用策略）——必須立即停止並回報，取得使用者明確裁決，不得視為 P4.6c presentation 範圍。
  - 若既有 `ConfirmDialog`／`Field`／`Textarea`／`Alert`／`Button` 無法覆蓋兩個 action 元件的呈現需求（例如需要非標準的多步驟 wizard）——必須停止並回報，不得引入新的大型元件或框架。
  - 若受保護 Blueprint 路徑不再經 `git status --short` 顯示為 untracked，或 Git 出現未知差異——立即停止。
  - 若 `delivery-notes-ui-contract.test.ts`／`delivery-notes-ui.test.tsx` 的既有業務語意斷言（非純字串外殼）無法在遷移後找到等價替代——必須停止並回報，不得刪除覆蓋率了事。

## 21. 品質基線

本次於 `web/` 目錄執行下列既有 `package.json` scripts（皆為唯讀執行，未修改任何原始碼或設定）：

| Gate | 指令 | 結果 |
| --- | --- | --- |
| lint | `npm run lint`（`eslint`） | **PASS**，無警告輸出 |
| typecheck | `npm run typecheck`（`next typegen && tsc --project tsconfig.typecheck.json`） | **PASS**，路由型別產生成功，無型別錯誤 |
| unit test | `npm run test`（`vitest run tests/unit --exclude tests/unit/delivery-note-print.test.ts && vitest run tests/unit/delivery-note-print.test.ts --maxWorkers=1`） | **PASS**——主測試組 44 檔／421 測試全綠；`delivery-note-print.test.ts` 獨立跑（`--maxWorkers=1`）1 檔／12 測試全綠；合計 45 檔／433 測試，無失敗、無 skip |
| production build | `npm run build`（`next build`） | **PASS**——編譯成功，37/37 頁面產生，含 `/delivery-notes`、`/delivery-notes/[id]`、全部 `/api/delivery-notes/*` route；無 build error |
| `git diff --check` | — | 無輸出（乾淨，無空白字元問題） |
| `git status --short`（執行 gate 前後） | — | 皆僅顯示 `docs/INVENTORY_PRODUCTION_BLUEPRINT.md` 一項 untracked（本文件撰寫並儲存後會新增第二項，見第 23 節） |

本次**未執行** `test:db`（DB 整合測試，需 disposable database，非本次唯讀盤點範圍；若正式進入 P4.6c 實作，需依既有慣例使用全新、guard-compliant 的 disposable database 重新驗證）。未發現任何測試失敗、任何 quality gate 失敗、任何需要記錄的 readiness blocker 於本次執行範圍內。

## 22. Open questions

以下事項皆為本次程式碼閱讀直接發現、具體可驗證的落差，非推測；均建議在 P4.6c 正式授權前由負責人確認是否納入處理範圍，本文件不預設答案：

1. **Admin void 的 idempotency key 未跨重試複用**（第 8、12、18.1 節）：`voidDeliveryNote`／`deliveryNoteMutation`（`client.ts`）每次呼叫都產生全新 key，與 print/reprint 的 operation-key-per-session 模式不一致，導致「client 逾時但 server 已成功」情境下重試會得到誤導性的 409 而非 idempotent replay。**分類：Non-blocking deferred risk**——DB 層狀態檢查已獨立防止真正的重複作廢，此落差不阻斷 P4.6c1～c4 任一子切片（含 c3），P4.6c 期間須維持現有行為不變。是否納入另案（非 P4.6c）修正此 client 端契約，由負責人另行決定與授權。
2. **`page.tsx` 的 `canVoid` 與 service 層闗卡不完全對齊**（第 8 節）：`canVoid` 只檢查 `status === "ACTIVE"`，未檢查「是否為訂單目前有效單」與「downstream locked」——目前業務規則下無法實際觸發（因為非 VOIDED 唯一限制），但若未來規則變化，此落差可能變成真實 bug。是否需要在 P4.6c 補上等價檢查以防禦性對齊，或明確記錄為可接受的現況？
3. **取消後切換操作類型的 session 沿用風險**（第 4.2、12、18、20 節）：`openDialog()` 的 `if (!session.current)` 判斷會讓使用者從「正式列印」取消後開啟「補印」時沿用舊 session，實際執行的是舊操作的 API 呼叫。是否確認此為需要修正的 bug（建議修正方向：取消時清空 session，或依 operation 分別持有 session），或維持現狀（若使用者實務上不會這樣操作）？
4. **`DeliveryNoteVoidAction` 完全無 dialog／aria 語意**（第 4.3、10、17 節）：比 `P4_6_...PREFLIGHT.md` 原先描述的「native `role="dialog"`」更弱（完全沒有該屬性）。確認此現況描述，並確認 P4.6c 是否應以 `ConfirmDialog` 完整取代（本文件建議如此，但需明確授權）。
5. **P4.6c4（本文件建議切片）與既有 `P4_6_...PREFLIGHT.md` 定義的 P4.6d 的邊界**（第 18 節）：兩者的 closure 工作範圍需要明確界定，避免重複執行或遺漏跨切片驗證項目。
6. **前端錯誤訊息未區分可重試與不可重試錯誤**（第 5、12、13 節）：例如 422 快照契約錯誤與純網路逾時目前顯示相同的「請重試」文案。是否納入 P4.6c 的訊息文案調整範圍（純 presentation，不改變錯誤分類本身）？
7. **`deliveryNotePrintActions()` 純函式目前未被實際渲染路徑呼叫**（第 4.1、9 節）：只存在於程式碼與測試中，實際 capability 來自 server DTO。是否應在 P4.6c 移除此未使用函式的疑慮（若確認未使用），或說明其保留的預期用途（例如未來 client 端重算或作為 contract 文件化用途）？此問題屬程式碼組織澄清，不影響現有行為，可與負責人確認後決定是否列入範圍或維持現狀。

## 23. Readiness 判定

本次唯讀盤點涵蓋：Git／Blueprint 基線確認、P4.6a／P4.6b 完成狀態確認、`delivery-note-actions.tsx` 逐元件/逐函式盤點、正式列印/補印/下載/作廢四條流程端到端追蹤（含 API route、service、transaction、lock order、idempotency、錯誤映射）、capability 契約盤點（含 server-authorization 未被 UI 取代的明確確認）、native dialog／共用 Dialog 差距逐項對照、duplicate-submit guard／retry boundary／error handling 全面盤點、UI/UX 對照 P4.3 design system 逐項分類、client/server 邊界確認、測試檔案逐一盤點（含哪些必須修改、哪些明確不得修改）、既有文件交叉核對（含發現一處現況描述落差，已記錄於第 17、22 節）、四段切片提案評估、預估修改檔案清單、風險與 fail-fast 條件、品質基線（lint/typecheck/test/build 全數 PASS，無失敗、無 skip、無 blocker）。

本次盤點發現的落差（session 沿用風險、void 重試 key 語意、canVoid 邊界對齊、dialog 現況描述落差）皆為**具體、已記錄、非阻塞（Non-blocking deferred risk）**的 open question——不構成對 P4.6c1、P4.6c2、P4.6c4 的 blocker，對 P4.6c3 亦非 blocker，僅構成一項**執行限制（constraint）**：P4.6c3 遷移 `DeliveryNoteVoidAction` 外殼時，必須逐位元保留 `client.ts` 現有的 `voidDeliveryNote`／`deliveryNoteMutation` 呼叫方式與 idempotency key 產生邏輯不變，不得在本切片內調整 retry／idempotency 契約（見第 18.1、19、22 節）。現有 P4.3 design system（`Button`／`ConfirmDialog`／`Dialog`／`Field`／`Textarea`／`Alert`）已可完整覆蓋兩個 action 元件的呈現需求，`delivery-note-order-actions.tsx`（P4.5c）已提供可直接比照的遷移範本，既有 API／service／RBAC／idempotency 契約清晰且測試覆蓋良好。

本文件不使用「blocker」一詞描述上述落差；「blocker」僅保留給會阻止子切片開始或需要先行裁決才能開工的事項——本次盤點未發現任何此類事項。

**READY FOR P4.6c IMPLEMENTATION AUTHORIZATION**

（適用範圍：P4.6c1、P4.6c2、P4.6c3〔含第 18.1 節之執行限制〕、P4.6c4〔前提為 c1～c3 個別完成〕。無任何子切片為 BLOCKED。）
