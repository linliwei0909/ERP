# P4.3c Data Display 與 Overlay 實作驗證

文件狀態：Completed
適用 Git 基線：`caf5208d7a130c83d858659fbd460707f9d17fd4`
驗證日期：2026-08-01
正式規格：`docs/P4_3_DESIGN_SYSTEM_SPEC.md` V1.4

## 1. Git 起始狀態

- Branch：`main`。
- HEAD／`origin/main`：`caf5208d7a130c83d858659fbd460707f9d17fd4`。
- ahead／behind：`0 / 0`；staged diff 為空；`git diff --check` 與 `git diff --cached --check` 均通過。
- 起始差異只包含已核准 P4.3 SPEC／治理文件、P4.3a、P4.3b、兩份既有 validation 與受保護 Blueprint；未發現其他無法歸屬差異。
- 本輪未清理、還原、覆蓋、stage、commit 或 push 既有成果。

## 2. P4.3a／P4.3b 基礎

- 沿用 V4 semantic tokens、system UI／mono font、typography、radius、motion、focus-visible 與單一 CSS Module convention。
- 沿用 Button／LinkButton／IconButton、Input／Textarea／Select／Checkbox、Field／FieldError／ErrorSummary／FormActions、Alert／EmptyState／LoadingState／Skeleton 及 repository-native SVG icons。
- 沿用 Vitest、per-file jsdom 與 React Testing Library；沒有建立競爭元件或第二套 styling／test contract。

## 3. 受保護 Blueprint metadata 與未讀取確認

- `docs/INVENTORY_PRODUCTION_BLUEPRINT.md`：20,880 bytes。
- LastWriteTime：`2026-07-27 11:03:17`。
- SHA-256：`930121B91B470DFF25596AE50309060155CF7C0F4B78251184EB13B493AF95B7`。
- 全程只檢查 Git status、size、modified time 與 hash；未開啟、搜尋、讀取、引用、修改、移動、刪除、stage 或 commit 內容。

## 4. Repository 現況盤點

抽樣 admin、customers、items、sales-orders、delivery-notes 與共用 UI，只做唯讀 pattern 盤點：

- 五個 production files 各自組合原生 table tags；table overflow pattern 分散於四個 files，沒有共用 table primitive。
- 五個 files 各自呈現上一頁／下一頁；query 與 disabled 邏輯屬 page-local。
- 只找到一個 page-local badge pattern；三個 files 使用 `<dl>`，語意與 layout 尚未共用。
- 三個 files 使用 `window.confirm`／`window.prompt`；Delivery Note 有一個局部 `role="dialog"`，App Shell Drawer 另有 modal 與 body scroll lock。
- list／detail 多為 Server Component；overlay 與 mutation 才需要 client boundary。
- 本輪未遷移或修改任何抽樣 production page，也未取代既有 confirm／prompt。

## 5. Card／Section

- Card 只有 `default`／`subtle` variants 與 `small`／`medium` padding；沿用 surface、border、radius，一般 Card 不使用明顯陰影。
- Section 支援 title、optional description／actions／divider／children，並可選 `h2`／`h3`／`h4`；不硬編碼整站 heading level、不建立 `<main>`，也不管理 PageHeader。
- 兩者傳遞合理原生 attributes、維持 server-safe，沒有任意 tone、shadow 或 layout engine。

## 6. Table primitives

- 建立 TableContainer、Table、TableCaption、TableHeader、TableBody、TableRow、TableHead、TableCell、TableEmptyRow。
- 全部保留 `<table>`／`<caption>`／`<thead>`／`<tbody>`／`<tr>`／`<th>`／`<td>`；TableHead 預設 `scope="col"` 並允許 `scope="row"`。
- Head／Cell 支援 left／center／right、numeric／monospace；沒有強制第一欄 mono。
- TableEmptyRow 只輸出正確 tr／td 並接受明確 colSpan；不判斷資料長度、不把 server error 當 empty。
- TableContainer 使用 `overflow-x: auto`、`min-width: 0` 與 `contain: inline-size`；620px table 內容在 360px 保持容器內捲動，不撐大 viewport，也不預設建立 tabindex。
- 未建立 columns config、cell renderer schema、DataTable、sorting、filtering、selection、virtual scrolling或 query adapter。

## 7. Pagination

- API 只接受 currentPage、totalPages、caller-provided previousHref／nextHref 與 accessible label。
- 輸出 `<nav aria-label="分頁">`、上一頁／第 X / Y 頁／下一頁；可用頁面沿用 LinkButton。
- 第一頁上一頁及末頁下一頁輸出 `aria-disabled` 非互動 span，不輸出可點擊 anchor。
- 元件不複製未知 query、不假設 route schema、不管理 router、資料查詢或 route change focus；安全 URL 與 query preservation 由使用端負責。

## 8. StatusBadge

- 只有 neutral／info／success／warning／danger 五個 semantic tones，presentation 固定 subtle，不自行新增 outline。
- 每個 badge 同時保留可見短文字、dot shape cue 與色彩；不可點擊、沒有 button／link semantics。
- API 不接受 SalesOrderStatus、DeliveryNoteStatus 或其他 domain enum；domain mapping 留在模組端。

## 9. DescriptionList

- 建立 DescriptionList、DescriptionItem、DescriptionTerm、DescriptionDetails，保留 `<dl>`／`<dt>`／`<dd>`。
- columns 只有 1／2／3／4；760px 收斂為最多雙欄，560px／360px 回到單欄。
- term 使用 secondary text，details 使用正常內容字級；不內建 domain 欄位或強制 numeric／mono。

## 10. Dialog 技術策略

- production 採原生 `<dialog>`、`showModal()`／`close()` 與 React portal 到 `document.body`，沒有引入 headless UI dependency。
- jsdom 26 具備 HTMLDialogElement／open／cancel 基礎，但缺少 showModal／close；tests 僅在測試檔加入最小 prototype mock，production 不含 polyfill。
- SSR mount 判斷使用 `useSyncExternalStore` client/server snapshot，不在 server render 存取 document，也不需要全域 provider。
- in-app browser 顯示原生 cancel 未必由自動 Escape 輸入觸發，因此實作同時處理 keydown Escape 與 native cancel；兩者都進入同一 controlled close path。

## 11. Dialog API

- Controlled API：open、onOpenChange、title、optional description、children、optional actions。
- 支援 initialFocusRef、closeLabel、dismissible、pending、className；title／description 以 React `useId` 建立 `aria-labelledby`／`aria-describedby`。
- 原生 dialog 設定 `aria-modal="true"`，close IconButton 具有必要 accessible name；不重複加入衝突的 role。
- 一般 Dialog 預設 close button、Escape、native cancel 與 backdrop click可關閉；`dismissible={false}` 或 pending 阻擋 dismiss。

## 12. Focus management

- 開啟時優先 explicit initialFocusRef，其次 autofocus target、原生目前焦點、第一個可互動元素，最後 dialog container。
- focusable 計算排除 disabled、hidden、`aria-hidden` 與負 tabindex；Tab／Shift+Tab 在第一與最後控制項真正循環。
- 關閉時回到開啟前的 active trigger；trigger 已移除時以 `isConnected` 安全忽略。
- DOM tests 與真實瀏覽器均驗證正向／反向循環、Escape、cancel、close、backdrop與 focus return，不以 source-string assertion 取代互動測試。

## 13. ConfirmDialog

- ConfirmDialog 完全組合 Dialog，沒有第二套 modal 行為或 global manager。
- 支援 title、description、cancelLabel、confirmLabel、destructive、pending、onCancel、onConfirm、optional children 與 initialFocusRef。
- DOM 順序固定取消在左、確認在右；未指定 initialFocusRef 時透過 Button ref 預設聚焦取消。
- destructive 確認沿用 P4.3a destructive Button，不內建 domain 文案或 mutation。
- pending 時 close／cancel／confirm 全部 disabled，Dialog 與 confirm button 設定 `aria-busy`，Escape／cancel／backdrop及重複 onConfirm 均被阻擋。
- 未建立 PromptDialog；理由欄位可由 children 組合 Field／Input／Textarea。

## 14. Server／Client boundary

- Card、Section、全部 Table primitives、Pagination、StatusBadge、DescriptionList 均無 `"use client"`，可直接在 Server Component／SSR render。
- 只有 Dialog／ConfirmDialog 使用 client boundary；server children 仍可由上層 composition 傳入，不迫使整個 page client 化。
- Button 新增標準 `forwardRef<HTMLButtonElement>` 以支援 ConfirmDialog 安全初始焦點，既有 API／semantics 不變。

## 15. Body scroll／portal

- 新增 `acquireBodyScrollLock()`：第一個 owner 保存原始 overflow，reference count 歸零才恢復；release idempotent，SSR no-op。
- Dialog 開啟時 acquire，close／unmount cleanup 時 release；多 Dialog owner 不會提早恢復 scroll。
- MobileNavDrawer 最小改為使用相同 helper，移除直接 overflow save／restore；Drawer 其餘 P4.2 shell、focus、route close 與 navigation 行為未重寫。
- tests 驗證兩個 owner、重複 release、unmount cleanup 與原始 overflow 恢復。

## 16. SVG icons

- Dialog close 直接沿用 P4.3a 已存在的 CloseIcon 與 IconButton contract。
- 未新增 icon、icon package、emoji 或 Unicode modal icon。

## 17. Dependency 結果

- P4.3c 未修改 `web/package.json` 或 `web/package-lock.json`，未新增 runtime／test dependency。
- 未導入 headless UI、dialog polyfill、DataTable、Storybook、Playwright、Cypress 或其他 framework。
- 既有 audit observation 維持 17 vulnerabilities（4 moderate、13 high）；本輪未執行 `npm audit fix`／`--force`，dependency graph 未因 P4.3c 改變。

## 18. Tests

- 新增 `web/tests/unit/ui-data-display.test.tsx`：21 個 Node SSR／semantic markup／CSS／server-safe tests。
- 新增 `web/tests/unit/ui-dialog.test.tsx`：15 個 jsdom DOM／portal／focus／keyboard／pending／scroll-lock tests。
- P4.3c 共新增 2 files／36 tests；另最小更新既有 App Shell source-contract test以驗證共享 acquire／release helper。
- 完整 regression：一般 unit 30 files／284 tests；formal-print 1 file／12 tests；總計 31 files／296 tests，全部通過。

## 19. Lint

- `npm run lint`：通過。
- React 19 refs 規則以 Button `forwardRef`、ConfirmDialog explicit ref 與 Dialog `useSyncExternalStore` SSR snapshot正確滿足，未使用 lint disable。

## 20. Typecheck

- `npm run typecheck`：通過；Next route types 與 TypeScript 均成功。
- Server-safe primitives、native attributes、RefObject 與 React portal types均通過正式設定。

## 21. Full unit regression

- `npm run test`：通過，31 files／296 tests。
- 包含 P4.2 Drawer source contract、P4.3a primitives、P4.3b form／feedback、P4.3c SSR／DOM／keyboard及12個 formal-print tests。
- 正式 test command 未執行 DB suite；本切片未連線任何資料庫。

## 22. Production build

- `npm run build`：通過，Next.js 16.2.11／Turbopack完成 compile、TypeScript、page data 與 37 個 static generation units。
- 使用者既有 `next dev` 正占用預設 `.next`；未獲准停止後，build 僅暫時將 `distDir` 設為 repository-local `.next-p4-3c`。build 後 `next.config.ts`、`tsconfig.json` 與輸出目錄全部回復／移除，final diff 為零。
- 仍只有一個既有 delivery-note font／NFT tracing warning，import trace經 font、renderer、formal-print 到 reprint route；內容與數量未因 P4.3c 改變。本輪未修改 formal print 或 font renderer。

## 23. 360px／keyboard／reduced-motion 人工驗證

使用擴充後的 `web/tests/fixtures/p4-3a-showcase/` 隔離 Vite fixture；不是 production route，也未加入 App Shell navigation。

- Desktop 1280×720：body clientWidth／scrollWidth 都是 1265px；Card、Section、兩張 Table、五 tone badges、DescriptionList、Pagination 與 overlay均呈現 V4 teal／slate、小圓角、克制陰影。
- 360×800：body clientWidth／scrollWidth 都是 345px，無 viewport overflow；TableContainer clientWidth 286px、scrollWidth 620px、`overflow-x:auto`，只有資料區可水平捲動。
- 360px DescriptionList 與 Card grid 都回到單欄；Dialog 寬 322px，保持 viewport 邊距。
- Dialog：body overflow鎖定；close 的 Shift+Tab 到最後「儲存」，最後 action 的 Tab 回 close；Escape 與 backdrop 關閉後 active element回到「開啟 Dialog」。
- ConfirmDialog：預設 active element為「取消」；取消後焦點回「開啟確認」。破壞性 pending 的 close／cancel／confirm皆 disabled、`aria-busy=true`，Escape 與 backdrop 後 dialog仍開啟且 scroll lock保持。
- stylesheet包含 `prefers-reduced-motion: reduce`；目前 OS preference為 normal motion，自動 CSS contract驗證 reduced mode下 dialog／backdrop animation為 none。
- console 無 application warning／error；人工驗證結束後 viewport已 reset、browser tab已清理、Vite port 4174 已釋放。

## 24. Scope 證明

- 未修改任何 admin、customers、items、sales-orders、delivery-notes、login production page或 route。
- 未取代正式頁面 `window.confirm`／`window.prompt`，未建立 DataTable、generic sorting／filtering／selection、virtual scrolling、Toast、Tabs、DropdownMenu、Drawer、PageHeader／PageContainer migration或代表頁整合。
- 除為共享 scroll lock 最小修改 MobileNavDrawer 外，未重寫 P4.2 App Shell、company switching、navigation或 role UI。
- 未修改 schema、migration、RBAC、session、authorization、API、state machine、transaction、audit、idempotency、formal print或 P5。
- `docs/DECISIONS.md`、`docs/OPEN_QUESTIONS.md`、package manifests與 Prisma files均未因 P4.3c 修改。

## 25. Final Git contract

- 最終 Branch `main`；HEAD／`origin/main` 均為 `caf5208d7a130c83d858659fbd460707f9d17fd4`，ahead／behind `0 / 0`。
- 最終 staged diff 為空；`git diff --check` 與 `git diff --cached --check` exit code均為 0。
- 最終差異已逐檔盤點，只分為：既有 P4.3 SPEC／治理、已核准 P4.3a、已核准 P4.3b、本 P4.3c與受保護 Blueprint；沒有 build config、隔離 `.next-p4-3c`、fixture server或其他暫時產物。
- P4.3c 完成後停止，不 stage、commit 或 push；P4.3d 必須另案授權。
