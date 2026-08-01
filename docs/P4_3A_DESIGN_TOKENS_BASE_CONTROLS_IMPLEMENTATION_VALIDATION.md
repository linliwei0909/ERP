# P4.3a Design Tokens 與基礎控制項實作驗證

文件狀態：Completed
適用 Git 基線：`caf5208d7a130c83d858659fbd460707f9d17fd4`
驗證日期：2026-08-01
正式規格：`docs/P4_3_DESIGN_SYSTEM_SPEC.md` V1.2

## 1. 結論

P4.3a 已完成並通過指定品質 gate。實作只包含 semantic tokens、Button、LinkButton、IconButton、Input、Textarea、Select、Checkbox、最小 repository-native SVG icons、必要 rendering／DOM interaction／accessibility tests，以及隔離視覺 fixture。未開始 P4.3b～P4.3e、代表頁整合、P4.4 或 P5。

## 2. Git 與受保護 Blueprint 基線

- Branch：`main`。
- HEAD／`origin/main`：`caf5208d7a130c83d858659fbd460707f9d17fd4`。
- ahead／behind：`0 / 0`。
- 開始實作前 staged diff 為空；tracked diff 只有前次已核准的四份治理文件，untracked 只有正式 P4.3 SPEC 與受保護 Blueprint。
- `docs/INVENTORY_PRODUCTION_BLUEPRINT.md`：20,880 bytes；LastWriteTime `2026-07-27 11:03:17`；SHA-256 `930121B91B470DFF25596AE50309060155CF7C0F4B78251184EB13B493AF95B7`。
- 全程未開啟、搜尋、讀取、引用或修改受保護 Blueprint 內容。

## 3. 實作前現況

- 既有 `globals.css` 有 App Shell tokens，但 body 使用 Arial，focus baseline 未涵蓋 input／textarea。
- 業務頁仍大量使用 page-local Tailwind control classes；本切片不遷移這些頁面。
- 正式共用 UI primitive 目錄原先不存在；App Shell 元件維持於既有目錄且未重做。
- Vitest 全域環境為 Node，既有依賴不足以驗證真實 DOM click／keyboard／ARIA 狀態。
- 重複樣式盤點包含 139 個 `rounded-lg border px-3 py-2` 片段、56 個 `mt-1 w-full rounded-lg border px-3 py-2` 精確片段，以及 60 個 native button。此數量只作遷移風險依據，本切片沒有全面替換。

## 4. Styling architecture

- Semantic tokens、system font、focus-visible baseline 留在 `web/src/app/globals.css`。
- `--shell-*` 保留並映射至新的 semantic tokens，P4.2 Shell 尺寸、z-index 與結構未改寫。
- P4.3a primitives 共用 `web/src/components/ui/ui.module.css`，沒有建立第三套 theme 或 runtime styling system。
- `web/src/lib/ui/class-names.ts` 只提供最小 class composition，不引入 class helper dependency。
- 所有 P4.3a primitive 都沒有 `"use client"`，可由 Server Component 使用；需要事件 handler 的使用端仍依 React 邊界自行成為 Client Component。

## 5. Semantic tokens

- 核心色彩：page background `#f8fafc`、primary `#0f766e`、text `#0f172a`、danger `#b91c1c`，另含 surface、border、secondary text、success、warning、info、focus 與 overlay semantic roles。
- Typography：系統 UI stack 為 `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft JhengHei", sans-serif`；單號、日期、金額可使用 `ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`。
- Radius：control 4px、card 3px、dialog 4px。
- Motion：120ms／180ms、ease-out，並在 `prefers-reduced-motion: reduce` 移除非必要 transition。
- Focus：link、button、input、textarea、select、checkbox、radio 與可用 tabindex control 使用一致 3px teal outline／2px offset。

## 6. Component contract

- `Button`：`primary | secondary | ghost | destructive`；`small | medium` 對應 34px／38px；原生 button attributes；預設 `type="button"`；pending 設定 disabled 與 `aria-busy`、阻止重複 click、保留寬度並顯示 pending label。
- `LinkButton`：以 Next `Link` 輸出 anchor，重用 button 視覺 contract；公開型別不提供 disabled 或 `aria-disabled`，未以 Button 包住 Link。
- `IconButton`：強制 `accessibleName`，輸出 44×44px 最低 hit area，icon 標記為 decorative；支援 button 原生 attributes 與 pending。
- `Input`／`Textarea`／`Select`：保留原生元素與 attributes；支援 required、disabled、readOnly（適用元素）、ARIA 及 invalid；invalid 同時使用紅色 border 與 inset indicator，不只靠背景色。
- `Checkbox`：保留原生 checkbox；支援 checked、disabled、required、invalid、`aria-describedby` 與其他 attributes；可組合可見 label 或要求 `aria-label`；desktop row 最低 40px，窄螢幕最低 44px。

## 7. SVG icon contract

- 新增 Menu、Close、Search、ChevronLeft、ChevronRight 五個 repository-native React SVG icons。
- 預設 18×18px、`currentColor`、`aria-hidden="true"`、`focusable="false"`。
- 未使用 emoji、Unicode icon 或大型 icon package。

## 8. Dependency 決策

為驗證 pending 防重複、native click 與可存取名稱，devDependencies 新增：

- `@testing-library/dom` `^10.4.1`
- `@testing-library/react` `^16.3.2`
- `jsdom` `^26.1.0`

Vitest 全域仍為 Node，只有 `ui-primitives.test.tsx` 使用 per-file jsdom directive；沒有改成全專案 DOM 環境。jsdom 固定在 26.x，以維持較寬的 Node 相容範圍。`npm install` 的 audit 摘要顯示既有依賴樹共有 17 項 vulnerabilities（4 moderate、13 high）；本切片未執行可能改變既有 dependency graph 的 `npm audit fix`，此項留作既有 production release gate 處理。

## 9. 自動化測試

- P4.3a targeted：2 files／23 tests 全部通過。
- Token tests：精確色彩、font stack、無 remote font、focus coverage、radius、motion、hit area、reduced motion、server-safe source contract。
- Primitive tests：四種 Button variants、兩種 sizes、原生 attributes、disabled／pending 防重複；Link semantics；IconButton accessible name／SVG contract；原生 Input／Textarea／Select／Checkbox states、ARIA 與 click。
- 完整 unit regression：27 files／232 tests 全部通過，其中一般 unit 26 files／220 tests，print suite 1 file／12 tests。
- 沒有刪除 assertion、更新 snapshot 或降低既有驗證強度來掩蓋 regression。

## 10. 品質 gate

- `npm run lint`：通過。
- `npm run typecheck`：通過。
- `npm run test`：通過，27 files／232 tests。
- `npm run build`：通過，37 個 static pages 產生完成。
- Build 保留一則既有 delivery-note font output-file tracing 警告；與 P4.3a 無關，沒有造成 build failure。
- P4.3 是 presentation-only，依正式 SPEC 不要求 DB tests；本次未連線、建立、遷移或修改任何資料庫。

## 11. 手動視覺與 accessibility 驗證

以 `web/tests/fixtures/p4-3a-showcase/` 的隔離 Vite fixture 驗證，該 fixture 不是 Next production route，也不整合任何代表業務頁。

- Desktop：V4 teal／slate、淺灰藍背景、白色 surface、小圓角、低陰影／無陰影與克制型 ERP 比例正確；四種 Button、兩種尺寸、disabled、pending、LinkButton、IconButton 與原生表單狀態可辨識。
- 360px：viewport `360×800`；document `scrollWidth` 與 `clientWidth` 同為 345px，無 viewport 水平溢位；表單轉為單欄。
- Computed styles：page background `rgb(248, 250, 252)`、primary `rgb(15, 118, 110)`、danger invalid border `rgb(185, 28, 28)`、control radius 4px。
- 尺寸：small Button 34px、medium Button 38px、IconButton 44×44px。
- Keyboard focus：主要按鈕取得可見 solid teal outline 與 2px offset。
- Font：computed family 為核准 system UI stack；resource entries 沒有 remote font request。
- Reduced motion：靜態 contract test 已確認正式 CSS 存在 `prefers-reduced-motion: reduce` 規則；當前瀏覽器偏好為一般 motion，未宣稱執行 OS-level reduced-motion 人工模擬。

## 12. Scope 與架構不變證據

- 未修改 `web/src/components/app-shell/`、任何 production route 或業務頁。
- 未建立 Field、Alert、Table、Pagination、StatusBadge、Dialog、ConfirmDialog、Toast 或其他 P4.3b～P4.3e 元件。
- 未修改 Prisma schema、migration、RBAC、session、authorization、API response、state machine、transaction、audit、idempotency、formal print 或 P5 domain。
- 未使用 Google Fonts、remote font、icon package、form state library 或 runtime UI dependency。
- Production build route manifest 不含 showcase route。

## 13. 驗收對照

`P4_3_DESIGN_SYSTEM_SPEC.md` §15.1 的 15 項 P4.3a acceptance criteria 均已滿足：tokens、font、focus、Button／LinkButton／IconButton、native controls、SVG、tests、validation、品質 gate 與範圍邊界皆有上述證據。P4.3a 到此停止；下一切片 P4.3b 必須另案授權。
