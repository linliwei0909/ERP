# P4.3d Page Contract 與代表頁面整合驗證

文件狀態：Completed
適用 Git 基線：`caf5208d7a130c83d858659fbd460707f9d17fd4`
驗證日期：2026-08-01
正式規格：`docs/P4_3_DESIGN_SYSTEM_SPEC.md` V1.5

## 1. Git 起始狀態

- Branch：`main`。
- HEAD／`origin/main`：`caf5208d7a130c83d858659fbd460707f9d17fd4`。
- ahead／behind：`0 / 0`；staged diff 為空；`git diff --check` 與 `git diff --cached --check` 均通過。
- 起始差異只包含已核准 P4.3 SPEC／治理、P4.3a～P4.3c、三份既有 validation 與受保護 Blueprint；未發現其他無法歸屬差異。
- 本輪未還原、覆蓋、stage、commit 或 push 既有成果。

## 2. P4.3a～P4.3c 沿用

- 沿用 V4 semantic tokens、system UI／mono font、small radius、low shadow 與 focus／motion contract。
- 沿用 Button／LinkButton、Input／Textarea／Select／Checkbox、Field／ErrorSummary／FormActions、Alert／EmptyState、Card／Section、Table／Pagination／StatusBadge；未建立競爭 primitive。
- 沿用 server-safe composition；只有既有 ItemCreateClient mutation boundary維持 client component，沒有新增 page-level client wrapper。
- 沿用 Vitest、per-file jsdom 與 React Testing Library；未新增 dependency、framework、DataTable、Toast 或 navigation module。

## 3. 受保護 Blueprint metadata 與未讀取確認

- `docs/INVENTORY_PRODUCTION_BLUEPRINT.md`：20,880 bytes。
- LastWriteTime：`2026-07-27 11:03:17`。
- SHA-256：`930121B91B470DFF25596AE50309060155CF7C0F4B78251184EB13B493AF95B7`。
- 全程只檢查 Git status、size、modified time 與 hash；未開啟、搜尋、讀取、引用、修改、移動、刪除、stage 或 commit 內容。

## 4. PageContainer 現況與 compatibility strategy

- P4.2 App Shell 原本持有唯一 PageContainer，API 為 default／wide／narrow；多數 production page又有 page-local max-width／padding frame。
- 正式 variants 為 standard（960px）、wide（1280px）、full（無 max-width）。legacy default映射至 wide，narrow映射至 standard；App Shell 明確使用 legacy default，既有未遷移頁不改寬度。
- 代表頁不再建立第二個 PageContainer或 outer max-width／padding。PageHeader以 data contract宣告 variant，App Shell使用 CSS `:has()` 同步唯一 container與 Breadcrumb max-width。
- 保留 `id="main-content"`、skip link、route announcer與每 route 自有的一個 `<main>`；沒有 nested main、client pathname registry或 App Shell全面重寫。

## 5. PageHeader 現況與正式 API

- API 支援 title、description、optional context／eyebrow、actions、optional metadata、containerVariant及原生 header attributes。
- PageHeader輸出唯一 h1，不輸出 main；actions保留 Button／LinkButton原生語意。
- P4.2 status／primaryAction／secondaryActions／overflowActions保留相容期；新整合優先使用 actions。
- 沿用 P4.2 Breadcrumb；Home、Customers、Admin Items移除重複返回首頁 action。Delivery Notes保留既有返回首頁／前往銷售訂單 href，避免在 P4.3d 改變既有流程 action。

## 6. 代表頁選擇與排除理由

本輪依最多四組限制實作：

1. Home：最低 domain風險，驗證 standard PageHeader、Alert與Section。
2. Customers list：驗證 wide、filters、native table semantics、StatusBadge、EmptyState與Pagination。
3. Admin Item create/list：驗證 standard、Field／controls／FormActions／pending及公司 selector相容。
4. Delivery Notes list：驗證 wide、filters、status mapping、native table與既有 href；page load error也改用 PageHeader／Alert。

排除 Sales Order editor、Delivery Note detail／formal print／void、Customers create／detail及其他 admin頁。這些區域包含 pricing／freight、revision state、transaction、confirmation、正式列印或較大 route migration風險，分別保留給 P4.4～P4.6。

## 7. 每頁修改前後 behavior 對照

- Home：本地 PageHeader保留 title／description；notice改為 danger Alert，home card改為Section。沒有新增 dashboard、query、API或 feature。
- Customers：`getPageRequestContext`、redirect、`listCustomers` input、companyId／search／status／page query、20筆 pageSize與 detail href原樣保留；只替換 header、filter controls、table、empty與pagination presentation。
- Admin Items：`requireAdminWithAudit`、`listItems` filters、pageHref、ItemCreateClient submit、`/api/items`、idempotency key、payload、field names、success redirect與 error message流程原樣保留；只替換 layout與共用 controls。
- Delivery Notes：authentication／permission、query schema、`listDeliveryNotes`、creator mapping、pageHref、detail／sales-order href均未改；list／empty／error presentation改用共用元件。detail、actions、print與void檔案未改。

## 8. Company context

- Home與Delivery Notes一般業務行為仍使用 Shell active company；未新增 page-local company switch入口。
- Customers與Admin Items既有 URL `companyId` selector因移除需要 route／session資料流程決策，本輪原樣保留，Field label只描述「公司」，不宣稱現有後端已有未來 `SYSTEM_ADMIN`「管理公司」scope。
- OQ-053更新為已有代表頁證據但仍未關閉；canonical redirect、safe query preservation與全面 selector遷移仍屬 P4.4～P4.6。

## 9. Server／Client boundary

- PageContainer、PageHeader、Page Contract CSS與所有新 page composition均無 `"use client"`。
- App Shell不依 pathname或 client registry決定寬度；CSS由 server-rendered PageHeader attribute協調 ancestor layout。
- ItemCreateClient維持原本 client boundary，未把 Admin Items page、Customers、Home或Delivery Notes page client化。

## 10. 新增與修改 tests

- 修改 `web/tests/unit/app-shell.test.tsx`：新增 formal／legacy PageContainer及PageHeader SSR contract test。
- 新增 `web/tests/unit/page-contract-integration.test.tsx`：5 tests，涵蓋 Home、CustomersListView、ItemCreateClient實際 SSR、query／authorization／payload boundary及無重複 outer frame。
- 既有 `web/tests/unit/delivery-notes-ui.test.tsx`繼續實際 SSR render DeliveryNoteListView的有資料與 empty state，涵蓋 status文字、filter、detail href及 table內容。
- P4.3d共新增 1 test file／6 tests；targeted regression為 3 files／45 tests，全部通過。

## 11. Lint

- `npm run lint`：通過。
- 未加入 lint disable或修 unrelated lint。

## 12. Typecheck

- `npm run typecheck`：通過；Next route type generation及 TypeScript均成功。
- formal／legacy variant、PageHeader ReactNode、native controls與代表頁 props皆通過正式設定。

## 13. Full unit regression

- `npm run test`：通過。
- 一般 unit 31 files／290 tests；formal-print 1 file／12 tests；總計 32 files／302 tests。
- 正式 test command未執行 DB suite；P4.3d沒有 DB test需求。

## 14. Production build

- `npm run build`：通過；Next.js 16.2.11／Turbopack完成 compile、TypeScript、page data及37個 static generation units。
- 瀏覽器驗證用 dev process為本輪建立且已在 build前停止，未占用 `.next`；不需暫改 next.config或 distDir，沒有隔離 build殘留。
- build仍只有一個既有 delivery-note font／NFT tracing warning，import trace由 next.config、font、renderer、formal-print至 reprint route；內容與數量未因 P4.3d改變。

## 15. Desktop／360px 人工 browser 驗證

- 使用本機 Next dev、既有 bootstrap admin與 in-app browser；未提交任何 business form或執行 mutation。
- Desktop 1280×720：Home為 standard；Customers為 wide且 PageContainer／Breadcrumb均1280px；Admin Items為 standard且 settled max-width 960px；各頁只有一個 main／h1、無雙重 padding或整頁水平 overflow。
- Customers桌面 table四欄可讀，filters為公司／搜尋／查詢；360×800 filter回單欄，document無 overflow，TableContainer本身可水平捲動。
- Admin Items桌面 form雙欄且公司／類型／狀態可讀；360×800 filter與create form均回單欄、required label可辨識、document無 overflow。
- Home 360×800保留 mobile header／drawer trigger、Breadcrumb back link、單一 main／h1且無 overflow。
- Delivery Notes desktop／360均驗證 PageHeader、唯一 main／h1及 shared danger Alert。當前 development DB缺少既有 migration欄位 `delivery_notes.snapshot_version`，所以 production route在資料讀取時呈現既有「銷貨單清單載入失敗」；唯讀 Prisma診斷確認該公司0筆 note且缺欄位是環境 schema mismatch。本輪依禁止事項未執行 migration或修改 service；DeliveryNoteListView成功／empty表格狀態由既有實際 SSR rendering tests覆蓋。

## 16. Keyboard／focus

- 360px App Shell保留「開啟主要導覽」、目前公司與使用者選單的 accessible names；skip link及 Breadcrumb mobile back link仍存在。
- Admin Item create form的 companyItemCode control可聚焦；實機 computed focus outline為 solid、約2.67px，沿用 focus token。
- Field／control association、required accessible name、checkbox label、submit button、Pagination nav與Table caption均由 DOM snapshot及SSR tests確認。

## 17. Scope 證明

- 未修改 Customers／Items／Delivery Notes的 query service、validation schema、DTO、API route、authorization、session或company switching。
- 未修改 Prisma schema／migration、RBAC mapping、state machine、transaction、audit、idempotency、formal print／font renderer或 P5。
- 未修改 Delivery Note detail／actions／print／void、Sales Order editor或其 mutation。
- 未修改 package manifests或 dependency graph；既有 audit observation維持17 vulnerabilities（4 moderate、13 high），未執行 audit fix／force。
- `docs/DECISIONS.md`的既有差異不是本輪產生；P4.3d沒有新決策，因此本輪未修改該檔。

## 18. Remaining P4.4～P4.6 工作

- P4.4：Customers／Items及其他 master/admin routes全面套用 page contract；決定 local companyId selector、canonical redirect與legacy variant移除順序。
- P4.5：Sales Order list／editor／detail整合，包含 pricing／freight、revision、validation、confirmation與工作流程測試。
- P4.6：Delivery Note list成功資料環境、detail、formal print、reprint、void confirmation與狀態工作流整合；不得改變既有 transaction／formal-print contract。
- P4.7：完整 route視覺、WCAG、screen reader、keyboard、viewport及跨流程驗收。
- P4.3e：只做P4.3跨切片 closure；本輪未開始。

## 19. Final Git contract

- 最終必須維持 Branch `main`；HEAD／`origin/main`均為 `caf5208d7a130c83d858659fbd460707f9d17fd4`，ahead／behind `0 / 0`。
- 最終 staged diff必須為空；`git diff --check`與`git diff --cached --check`必須通過。
- P4.3d新增／修改範圍限於 PageContainer、PageHeader、AppShell variant宣告、page contract CSS、四組代表頁 presentation（含 server-safe CustomersListView）、兩個 test files、本 validation及 SPEC／plan／architecture／OQ治理同步。
- 不得留下 dev server、isolated build config/output或其他暫時產物；不 stage、commit或 push。P4.3d完成後停止，P4.3e須另案授權。
