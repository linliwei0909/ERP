# P4.5d — Sales Orders UI Migration Closure Validation

## 1. 文件狀態

本文件為 P4.5（Sales Orders UI Migration）之最終收尾驗證紀錄，涵蓋 P4.5a（清單）、P4.5b（草稿編輯器）、P4.5b correction（儲存錯誤處理隔離）、P4.5c（明細／狀態操作／銷貨單操作）四個已提交子階段的整體收尾。本文件僅作唯讀彙整與新增驗證證據，不重新開放已核准子階段的實作範圍，不包含 P4.6／P4.7／P5 之任何工作。

## 2. Git 基線

- 分支：`codex/p4-5-sales-orders-ui`
- HEAD：`5365539` "feat(ui): migrate sales order detail and actions"，與 `origin/codex/p4-5-sales-orders-ui` 一致（`git rev-list --left-right --count` = `0  0`，本文件提交前）
- `git status --short`：僅 `docs/INVENTORY_PRODUCTION_BLUEPRINT.md`（untracked，本階段全程未讀取／未修改，僅以 `git status --short` 觀察其存在）
- `git diff --check` / 分支 diff 均無空白字元問題

## 3. Blueprint 保護

`docs/INVENTORY_PRODUCTION_BLUEPRINT.md` 全程僅透過 `git status --short` 確認其為 untracked 檔案，從未被開啟、讀取、搜尋或修改。

## 4. Commit chain

```
5365539 (HEAD -> codex/p4-5-sales-orders-ui, origin/codex/p4-5-sales-orders-ui) feat(ui): migrate sales order detail and actions
59007db fix(ui): isolate sales order save error handling
1c0af49 feat(ui): migrate sales order draft editor
37d88e2 feat(ui): migrate sales order list
89b2475 docs(ui): define P4.5 sales orders migration
0bab472 (origin/main, main) Merge pull request #1 from linliwei0909/feat/p4-4-masters-admin-ui
827b049 fix(ui): recover failed P4.4 admin actions
```

分支基於 `origin/main` 乾淨分叉（fork point `0bab472`），5 個 P4.5 相關 commit 依序疊加，無 merge conflict 標記，無 fixup/squash 待處理。

## 5. Complete branch diff（`origin/main...HEAD`）

18 files changed, 3728 insertions(+), 534 deletions(-)：

- 新增文件：`item-combobox.tsx`、`sales-order-detail-view.tsx`、`sales-order-list-view.tsx`、`sales-order-status-actions.tsx`、`sales-orders-ui.module.css`，4 份驗證文件（P4_5_PREFLIGHT / P4_5A / P4_5B / P4_5C），3 份新測試檔（p4-5a/b/c UI tests）
- 修改文件：`[id]/page.tsx`、`delivery-note-order-actions.tsx`、`new/page.tsx`、`page.tsx`（list）、`sales-order-editor.tsx`（大幅重構為薄殼）、`delivery-notes-ui-contract.test.ts`
- 無任何 production 依賴、`package.json`、schema、migration 檔案異動

## 6. Route 收尾矩陣（6 routes/states × 2 viewports = 12 組合，全部完成）

| Route/State | 1280×900 | 360×800 |
|---|---|---|
| `/sales-orders`（清單） | ✅ | ✅ |
| `/sales-orders/new`（建立草稿） | ✅ | ✅ |
| `/sales-orders/[id]` DRAFT | ✅ | ✅ |
| `/sales-orders/[id]` CONFIRMED | ✅ | ✅ |
| `/sales-orders/[id]` DELIVERY_CREATED + 有效銷貨單 | ✅ | ✅ |
| `/sales-orders/[id]` VOIDED + 已作廢銷貨單 | ✅ | ✅ |

每組合驗證項目：HTTP 200、`document.title`/`<h1>` 存在、`<main>` 數量 = 1（無巢狀 main）、對應狀態文字與可見/隱藏操作正確、`document.documentElement.scrollWidth === clientWidth === window.innerWidth`（無整頁水平溢位）、console 無非預期錯誤（詳見第 13、19 節）。

各狀態實測要點：
- DRAFT（orderA）：顯示可編輯 `SalesOrderEditor`，操作列「確認訂單／作廢訂單」
- CONFIRMED（orderB）：顯示唯讀 `SalesOrderDetailView`，操作列「開始修訂／作廢訂單／建立銷貨單」，訂單號 `SO-IN-202607-000002`，合計 NT$250 正確
- DELIVERY_CREATED（orderC）：顯示唯讀明細，銷貨單區塊列出 `DN-IN-202608-000001－有效`，操作列「開始修訂／作廢訂單」
- VOIDED（orderD）：訂單狀態操作列已隱藏（無可用操作，符合終態預期），銷貨單顯示 `DN-IN-202608-000002－已作廢`（確認作廢訂單會級聯作廢其現行銷貨單）

清單頁查詢/篩選/分頁 contract 另以直接 URL query 驗證：`?search=000002&status=CONFIRMED&page=1` 正確篩出唯一 1 筆結果。

## 7. Landmark 正式決策

沿用 P4.5c 已二次確認之既定慣例：`AppShell` 僅提供 `<div id="main-content">`，不提供 `<main>`；每個 route 自行提供恰好一個 `<main className={pageStyles.pageStack}>` 作為唯一 landmark。本階段對所有 6 個 route/state 組合、2 種 viewport 實測 `document.querySelectorAll('main').length === 1`，全數通過，無巢狀或缺失 main。P4.5c 提出的「移除 route-local `<main>`」修正提案，其前提（App Shell 提供 `<main>`）已於前次會話證實為錯誤前提，使用者已明確選擇不執行該修正，本次不重啟此議題。

## 8. Contract preservation

- 訂單確認前置檢查（`ORDER_CONFIRMATION_PREREQUISITE_MISSING`：需正式價格比對，或人工單價＋人工價格理由二者皆填）、運費規則比對（找不到訂單日期有效的運費規則則拒絕確認）、作廢訂單級聯作廢現行銷貨單——三項既有業務規則在 fixture 建置過程中透過真實 API 呼叫逐一觸發並驗證行為不變。
- 清單查詢/篩選/分頁 query string contract 不變（見第 6 節）。
- 草稿編輯器可編輯/唯讀切換依 `status === "DRAFT" && canManageSalesOrders` 判斷，行為與 P4.5c 提交時一致。

## 9. Permission matrix

沿用 P4.5c 既定矩陣：`sales_orders.read` 為明細頁最低需求，`sales_orders.manage` 控制編輯器顯示與狀態操作可用性，`delivery_notes.manage` 控制銷貨單建立操作可用性。本階段以 ORDER_ENTRY 角色 fixture 使用者實測，未發現權限矩陣退化。

## 10. Accessibility matrix

各 route/state 之 `<h1>` 唯一性（count = 1）、skip-link 目標 `#main-content` 由 `AppShell` 提供、`<main>` 唯一性，均於第 6 節逐一實測確認。未執行 axe-core 等自動化 a11y 掃描（非本階段既定範圍）。

## 11. Responsive matrix

全部 12 組合於 1280×900 與 360×800 兩種 viewport 下，`document.documentElement.scrollWidth === document.documentElement.clientWidth === window.innerWidth`，即無整頁水平溢位。未逐一測量表格內部局部橫向捲動或操作列換行像素細節（受第 13 節工具限制，以 DOM 寬度量測與文字內容驗證取代像素截圖）。

## 12. Browser evidence level

本階段達成的證據等級為 **Level 1／Level 2 混合**：
- **Level 1（真實互動）**：登入為真實 click/type 互動並成功（session 建立、後續頁面均為已認證狀態）。
- **Level 2（真實頁面載入 + DOM/viewport 量測 + console/network 證據）**：全部 12 個 route/state × viewport 組合皆以此等級完成 —— 真實 HTTP 導覽、`get_page_text` 內容驗證、`javascript_tool` DOM/viewport 量測、`read_console_messages`／`read_network_requests` 證據。
- 清單頁的 ref-based click（`read_page` → `computer left_click`）多次嘗試均因該頁面之串流 RSC 內容導致 ref 解析為 `(0,0)`（詳見第 13 節），未能取得真實點擊互動證據；改以直接 URL query 導覽驗證查詢/篩選 contract，此為使用者於前置指示中已明確授權之 Level 2 替代方案。

## 13. Browser 工具限制

- `document.hasFocus()` 恆為 `false`，`screenshot`/`computer screenshot` 全程回報 "Browser pane is not displayed"，故本階段無像素截圖證據。
- `read_page filter=interactive` 對本應用之串流 RSC 頁面內容擷取不穩定，常僅回傳導覽外殼；`filter=all` + 較大 `max_chars` 可擷取完整內容，但其回傳的 `ref_N` 於後續 `computer left_click` 呼叫中曾解析為錯誤座標 `(0,0)`，導致清單頁篩選表單的真實點擊互動未能成功（已用直接 URL 導覽取代，見第 6、12 節）。
- 首次嘗試之 dev server worktree（深層 scratchpad 路徑）因 Windows MAX_PATH 限制與 Turbopack 產生的長 chunk 檔名衝突而失敗，已捨棄改用短路徑 `C:\p45dwt`；此問題與應用程式碼無關，純屬本次驗證環境的路徑長度限制。

## 14. Disposable database

- 目標：`erp_p4_5d_closeout_20260805_02`（symmetric，host=`localhost`，port=`55432`，role=`p1_test`，schema=`public`），`DATABASE_URL` 與 `P1_TEST_DATABASE_URL` 完全一致，通過 `validateTestDatabaseEnvironment()` 安全防護檢查。
- 建立前以連線嘗試確認資料庫不存在，`prisma migrate deploy` 全新套用（12/12 migrations），`test:db` 執行前後皆以 `assertDisposableDatabaseIsClean` 邏輯對應之空表檢查為前提。
- 因 `test:db` 149 筆測試會在資料庫留下資料，隨後為建立 P4.5d fixture 而 DROP/CREATE 重建資料庫、重新 `migrate deploy`、重新執行兩份 bootstrap script，過程全程於此一次性 disposable 目標內，未觸及任何其他資料庫。
- 收尾階段已透過 `docker rm -f erp-p4-5d-closeout-02` 完整移除該容器（見第 21 節）。

## 15. Migration 結果

`prisma migrate deploy`：12/12 migrations 成功套用，無失敗。`prisma migrate status`：無 drift，schema 與 migration 歷史一致。

## 16. Schema diff

`prisma validate`：通過。P4.5 分支對 `schema.prisma` 無任何異動（純 UI/presentation 層遷移），故無需額外 schema diff 比對。

## 17. Unit tests

`npm run test`：44 files / 421 tests 全數通過，與 P4.5c 提交時最後量測基準完全一致，無退化。

## 18. DB tests

`npm run test:db`：15 files / 149 tests 全數通過，執行前已於日誌中明確驗證連線目標為 `host=localhost port=55432 database=erp_p4_5d_closeout_20260805_02 role=p1_test`，證實實際連接至正確的 disposable 目標而非任何常駐資料庫。

## 19. lint / typecheck / build

- `npm run lint`：通過，無新增警告。
- `npm run typecheck`：通過。
- `npm run build`：37 pages 全數產生，僅既有的 NFT/font 預先存在警告（與 P4.5 分支無關，P4.5c 提交前即已存在），無新增警告或錯誤。

## 20. Warnings（本階段新觀察，非 P4.5 引入，非阻斷）

在 `/sales-orders/[id]` 路由（涵蓋 DRAFT／CONFIRMED／DELIVERY_CREATED／VOIDED 四種狀態，皆共用同一資料擷取程式碼路徑）觀察到可重現的 Node.js 伺服器端警告：

```
(node:29052) DeprecationWarning: Calling client.query() when the client is already
executing a query is deprecated and will be removed in pg@9.0. Use async/await or
an external async flow control mechanism instead.
```

**唯讀根因調查結果**：
- 觸發程式碼為 `[id]/page.tsx` 內既有的 4-way `Promise.all([getSalesOrder, customerCompany.findMany, itemCompany.findMany, listDeliveryNotes])`。逐行比對 `git show 5365539^:...page.tsx` 與 `git show 29e68ff:...page.tsx`（P4.5 分支所疊加之基礎 commit，早於 P4.5a/b/c 全部提交）確認此並行查詢模式在 P4.5 之前已存在，P4.5c 僅新增 DTO 投影欄位（`itemSnapshot`）與呈現層包裝，未變更此並行模式或 Prisma/pg client 生命週期。P4.5a、P4.5b 從未修改此檔案。
- 於 DRAFT（重複載入兩次）與 CONFIRMED 狀態實測可重現；VOIDED 狀態亦重現（同一程式碼路徑）。
- 伴隨此警告的每次請求，網路日誌均為 `200 OK`，`get_page_text` 內容皆正確無誤，未見任何資料錯誤、查詢未完成、hydration warning。此警告經 Next.js dev server 之 console log 轉發機制以 "Server" 標籤送達瀏覽器主控台，非瀏覽器端產物。
- 根因位置：`web/src/lib/prisma.ts` 以 `new PrismaPg({ connectionString })`（`@prisma/adapter-pg@^7.8.0`）建立 client，未顯式設定連線池大小；此為既有、跨儲存庫層級的設定，與 P4.5 分支 diff 無關。
- 判定：**pre-existing non-blocking server warning**，不宣稱已解決，建議另案處理（連線池設定調整或並行查詢改為序列化）。

另觀察到一組瀏覽器主控台重複出現的 "500 Internal Server Error" + "Turbopack error" 訊息組合，但橫跨本次會話全部約 100+ 筆網路請求記錄，未發現任何實際 `500` HTTP 回應；且該訊息在多個路由（含未使用複雜並行查詢的 `/sales-orders/new`）皆出現，與 `/_next/webpack-hmr` WebSocket 連線持續失敗的時序相符。判定為本次沙盒瀏覽器環境之 dev-mode HMR 用戶端錯誤回報機制產物，非伺服器或頁面缺陷。

## 21. Files changed（收尾階段本身）

本階段（P4.5d）於實作邊界內僅新增本文件一份：`docs/P4_5D_SALES_ORDERS_UI_MIGRATION_CLOSURE_VALIDATION.md`。未修改任何 production code、test、`package.json`、`.env`、`tests/helpers/test-database-safety.ts`。

Disposable 資源清理紀錄：
- Worktree dev server（PID 29052，`C:\p45dwt\web`，port 3400）：以 `Stop-Process -Force` 停止，port 3400 確認已釋放。
- Git worktree `C:/p45dwt`：以 `git worktree remove --force` + 手動清除殘留 `.git/worktrees/p45dwt` 中繼目錄（Windows 檔案鎖定導致首次嘗試部分失敗，重試後成功）+ 移除殘留空目錄，`git worktree list` 確認僅剩原有兩個 worktree。
- Docker container `erp-p4-5d-closeout-02`：以 `docker rm -f` 移除，其餘既有容器（`web-worker-1`、`erp-p1-test-postgres`、`erp-postgres`）狀態未受影響。
- Port 3000 之既有 process（PID 22512）：全程未終止，收尾時再次確認其仍在執行、啟動時間未變（`2026/8/5 下午 04:40:40`）。
- `web/.env`：全程未修改，修改時間仍為會話開始前的 `2026-07-25 09:42:27`。

## 22. Deferred items

- `docs/IMPLEMENTATION_PLAN.md` 現存「下一階段 P4.4」狀態行為過時觀察，明確排除於 P4.5d 範圍外，本階段未修改該檔案。
- 第 20 節所述 pg client 並行查詢 DeprecationWarning，判定為 pre-existing、non-blocking，建議另案處理，本階段未修改。
- 未執行像素級截圖比對、自動化 a11y 掃描（axe-core 等）、表格內部局部橫向捲動的逐路由像素量測——受限於第 13 節所述瀏覽器工具能力邊界。

## 23. PR readiness

分支 `codex/p4-5-sales-orders-ui` 於本文件提交後將領先 `origin/codex/p4-5-sales-orders-ui` 恰好 1 個 commit（本收尾文件）。所有品質關卡（prisma validate/migrate/status、lint、typecheck、test、test:db、build）皆通過，分支 diff 乾淨（`git diff --check` 無問題）。本階段**不**推送、**不**建立 PR、**不**合併——依使用者指示，push／PR 授權為獨立於本次收尾之後續步驟。

## 24. Final closure decision

**P4.5 SALES ORDERS UI MIGRATION — CLOSURE VALIDATED LOCALLY.**

P4.5a／P4.5b／P4.5b correction／P4.5c 四個子階段之全部 commit 鏈完整、品質關卡全數通過、6 route/state × 2 viewport 收尾矩陣全數完成、landmark 慣例與既有業務 contract 皆確認不變。第 20 節記錄之 pg DeprecationWarning 經唯讀根因調查確認為 P4.5 之前即存在、P4.5 未變更其成因、頁面與資料皆正確，依約定規則歸類為 pre-existing non-blocking，不阻擋本次收尾，亦不宣稱已解決。本文件為本階段之唯一新增檔案，待使用者核准後以精確 `git add` 單檔提交，訊息為 `docs(ui): close P4.5 sales orders migration`；不涉及 push、PR、merge 或 P4.6/P4.7 之任何工作。
