# P4.3b Form 與 Feedback 實作驗證

文件狀態：Completed
適用 Git 基線：`caf5208d7a130c83d858659fbd460707f9d17fd4`
驗證日期：2026-08-01
正式規格：`docs/P4_3_DESIGN_SYSTEM_SPEC.md` V1.3

## 1. 結論

P4.3b 已完成並通過指定品質 gate。實作只包含 Field、FieldError、ErrorSummary、FormActions、Alert、EmptyState、LoadingState、Skeleton、四個 repository-native feedback SVG icons、SSR／DOM／CSS tests，以及既有隔離 fixture 的擴充。未開始 P4.3c～P4.3e、代表頁整合、P4.4 或 P5。

## 2. Git 起始狀態與 P4.3a inventory

- Branch：`main`。
- HEAD／`origin/main`：`caf5208d7a130c83d858659fbd460707f9d17fd4`。
- ahead／behind：`0 / 0`；staged diff 為空；`git diff --check` 與 `git diff --cached --check` 均通過。
- P4.3 SPEC／治理差異：`docs/DECISIONS.md`、`docs/OPEN_QUESTIONS.md`、`docs/IMPLEMENTATION_PLAN.md`、`docs/TECHNICAL_ARCHITECTURE.md`、`docs/P4_3_DESIGN_SYSTEM_SPEC.md`。前兩者是前次已核准差異，本輪未修改。
- P4.3a 程式差異：`web/package.json`、`web/package-lock.json`、`web/src/app/globals.css`、`web/src/components/ui/`、`web/src/lib/ui/`、兩個 P4.3a unit test files 與 `web/tests/fixtures/p4-3a-showcase/`。
- P4.3a validation：`docs/P4_3A_DESIGN_TOKENS_BASE_CONTROLS_IMPLEMENTATION_VALIDATION.md`。
- 上述差異均能歸屬於已核准 P4.3 治理、P4.3a 或受保護 Blueprint，沒有額外未核准差異；本輪未清理、還原或覆蓋 P4.3a 成果。

## 3. 受保護 Blueprint

- `docs/INVENTORY_PRODUCTION_BLUEPRINT.md`：20,880 bytes。
- LastWriteTime：`2026-07-27 11:03:17`。
- SHA-256：`930121B91B470DFF25596AE50309060155CF7C0F4B78251184EB13B493AF95B7`。
- 全程只檢查 Git status、size、modified time 與 hash；未開啟、搜尋、讀取、引用、修改、移動、刪除、stage 或 commit 內容。

## 4. Repository 現況審查

抽樣範圍包含 admin、customers、items、sales-orders、delivery-notes 與 login routes，但只做唯讀 pattern 盤點：

- 73 個 label pattern；抽樣未發現既有 `aria-describedby` 或 `aria-invalid`。
- 8 個 `role="alert"`、3 個 `role="status"`、9 個空狀態文案、2 個 loading pattern，以及 52 個 pending／disabled pattern。
- 常見作法是 label 包覆 control、page-local red alert、純文字「查無資料」及各 client component 自行管理 pending。
- Server pages 與既有 client mutation components 並存；P4.3b primitives 不應迫使前者 client 化。
- 本輪沒有把抽樣頁面換成新元件，也沒有修改正式 route。

## 5. Field API

- `Field` 接受 label、單一 control child、可選 description／error／required／className。
- control 已有 `id` 時原樣保留；缺少時使用 React `useId` 產生 stable ID。
- description 使用 `{controlId}-description`，error 使用 `{controlId}-error`；與 control 既有 `aria-describedby` 合併並去重。
- error 存在時設定 `aria-invalid="true"`；required 同步至原生 `required`、`aria-required`、可見 `*` 與 screen-reader-only「必填」。
- 使用 `cloneElement` 只組合 accessibility props，不讀寫 value，不管理 form state、validation schema、mutation、server action 或 business rule。
- Input、Textarea、Select composition 均由 DOM tests 驗證。

## 6. FieldError 與 ErrorSummary

- `FieldError` 輸出單一 paragraph，使用 semantic danger token；預設不使用 `role="alert"`，由 control 的 `aria-describedby` 關聯。
- `ErrorSummary` 支援 title、一般 message、可選 errors；只有具有 fieldId 的項目輸出 `#fieldId` anchor，其餘維持一般 list item。
- ErrorSummary 固定 `role="alert"` 與 `tabIndex=-1`，可由提交流程 programmatically focus。
- 為維持 server-safe，P4.3b 不提供自動 focus client wrapper；提交後 focus 時機及觸發責任由使用端或 P4.3d representative integration 負責。
- API 只接受安全 presentation message，沒有 raw exception、stack trace 或 internal error detail 欄位。

## 7. FormActions

- 明確 slots：destructive、secondary、primary；secondary DOM order 位於 primary 前，destructive 位於分離區域。
- 預設 desktop 靠右水平排列；`align="start"` 可調整一般 action 群組。
- 560px 以下 destructive／secondary／primary 轉為垂直排列且每個 action 滿寬。
- 不管理 submit、pending 或 mutation；fixture 與 tests 使用 P4.3a Button／LinkButton，沒有另建按鈕樣式。

## 8. Alert tone 與 ARIA matrix

| Tone | 預設 role | 預設 live 特性 | Semantic tokens |
| --- | --- | --- | --- |
| info | 無 | 非中斷式 | info／info-subtle |
| success | `status` | polite status semantics | success／success-subtle |
| warning | 無 | 預設非中斷式，可由使用端指定 | warning／warning-subtle |
| danger | `alert` | blocking error semantics | danger／danger-subtle |

- 使用端可覆寫 role、`aria-live`、accessible label 與 className。
- 支援 title、body、optional actions 與 icon override；不含 dismiss、Toast 或全域訊息管理。
- 預設 icon decorative 且訊息保留文字，不只使用顏色或 icon。

## 9. EmptyState

- `no-data`：尚未建立資料。
- `no-results`：有資料但目前條件查無結果。
- `permission-limited`：依目前 permission／company scope 只能看到部分或沒有資料。
- 支援 title、description、optional icon、primary action 與 secondary action；action 沿用 Button／LinkButton。
- 不輸出 error role，不承擔 server error、大型 onboarding 或業務文案。

## 10. LoadingState 與 Skeleton

- LoadingState 固定 `role="status"`、預設 `aria-live="polite"`，並以可見 label 提供可理解 loading announcement；可組合 Skeleton。
- Skeleton 只有 text、block、circle；text lines runtime 限制 1～5，避免任意 design engine。
- Skeleton 使用 surface-muted／border tokens、`aria-hidden="true"`，不建立自己的 live region。
- 新增 `--duration-slow: 1440ms`，loading dot 與 skeleton 只做低干擾 opacity pulse；`prefers-reduced-motion: reduce` 時兩者 `animation: none`。

## 11. Server／Client boundary

- 八個 P4.3b components 都沒有 `"use client"`，可在同步 Server Component／SSR 中 render。
- Field 的 `useId` 與 `cloneElement` 不建立 state 或 browser-only side effect；Next typecheck／build 與 SSR tests 已通過。
- ErrorSummary 只建立 focus target，不執行 focus；沒有為此加入 client wrapper。
- 未修改任何既有 client component 或 Server Component route。

## 12. SVG icons

- 新增 Info、Check、Warning、Error 四個 repository-native React SVG icons。
- 沿用 P4.3a 18×18px、`currentColor`、`aria-hidden="true"`、`focusable="false"` contract。
- 未加入 icon package、emoji 或 Unicode icon。

## 13. Dependency 與 audit observation

- P4.3b 沒有修改 `web/package.json` 或 `web/package-lock.json`，沿用 P4.3a 的 Vitest、per-file jsdom 與 React Testing Library。
- 未新增 form library、toast library、UI framework、Storybook、Playwright 或 Cypress。
- 既有 audit observation 維持 17 vulnerabilities（4 moderate、13 high）；本輪未執行 `npm audit fix`／`--force`，也沒有因 P4.3b 改變 dependency graph。

## 14. Tests

- 新增 `web/tests/unit/ui-form-feedback.test.tsx`：jsdom DOM／ARIA／composition tests。
- 新增 `web/tests/unit/ui-form-feedback-ssr.test.tsx`：Node SSR、server-safe source 與 CSS contract tests。
- P4.3b 新增 28 tests；P4.3a＋P4.3b targeted 共 4 files／51 tests，全部通過。
- 完整 regression：一般 unit 28 files／248 tests；formal-print 1 file／12 tests；總計 29 files／260 tests，全部通過。
- DOM coverage：generated／explicit ID、description＋error、required、invalid、Textarea／Select、FieldError、ErrorSummary links/focus target、FormActions order、Alert matrix/override/icons、EmptyState variants/actions、Loading/Skeleton semantics。
- SSR coverage：完整 Field ARIA markup、八個 presentation primitives、無 `"use client"` 與 responsive／motion CSS contract。

## 15. 品質 gate

- `npm run lint`：通過。
- `npm run typecheck`：通過，Next route types 與 TypeScript 均成功。
- `npm run test`：通過，29 files／260 tests。
- `npm run build`：通過，37 個 static pages 產生完成；fixture 未成為 production route。
- Build 仍只有既有 delivery-note font tracing warning，內容與數量未改變；本輪未修改 formal print 或 font renderer。
- 依正式 P4.3 SPEC，本切片不需 DB tests；`npm run test` 不執行 DB suite，本次未連線任何資料庫。

## 16. 人工視覺與 accessibility 驗證

使用擴充後的 `web/tests/fixtures/p4-3a-showcase/` 隔離 Vite fixture；它不是 production route，也未加入 App Shell navigation。

- Desktop：Field normal／description／required error／disabled／readOnly、ErrorSummary、FormActions、四種 Alert、三種 EmptyState、LoadingState 與三種 Skeleton 均符合 V4 teal／slate、小圓角、低陰影／無陰影方向。
- ARIA：label `for` 正確指向 control；invalid control 為 danger border 並具有 error described-by；ErrorSummary 為 `role="alert"`／`tabIndex=-1`；success 為 status、danger 為 alert、info／warning 預設無 live role。
- Programmatic focus target：以鍵盤式 focus 驗證 ErrorSummary 取得 global solid teal focus outline 與 2px offset。
- 360×800：document clientWidth／scrollWidth 均為 345px，無 viewport 水平溢位；FormActions 及其三個按鈕皆為約 287.3px 滿寬垂直排列；Alert／EmptyState grids 均為單欄。
- Loading／Skeleton：LoadingState 是唯一 status announcement；三個 Skeleton 均 `aria-hidden` 且沒有 role。
- Reduced motion：瀏覽器載入的正式 stylesheet media rule確認 loading indicator 與 Skeleton 在 `prefers-reduced-motion: reduce` 下為 `animation: none`；目前瀏覽器 OS preference 為一般 motion，normal-mode computed duration 為 1.44s。自動化 CSS contract test同步覆蓋此規則。
- Remote resources：無 remote font request；console 沒有 application error。

## 17. P4.3b 修改及新增檔案

- Shared P4.3 files：`web/src/app/globals.css`、`web/src/components/ui/ui.module.css`、`icons.tsx`、`index.ts`。
- New components：`field.tsx`、`field-error.tsx`、`error-summary.tsx`、`form-actions.tsx`、`alert.tsx`、`empty-state.tsx`、`loading-state.tsx`、`skeleton.tsx`。
- Tests：`ui-form-feedback.test.tsx`、`ui-form-feedback-ssr.test.tsx`。
- Fixture：`web/tests/fixtures/p4-3a-showcase/main.tsx`、`showcase.css`。
- Documents：本 validation、`docs/P4_3_DESIGN_SYSTEM_SPEC.md`、`docs/IMPLEMENTATION_PLAN.md`、`docs/TECHNICAL_ARCHITECTURE.md`。

## 18. 明確未修改範圍

- 未修改任何 admin、customers、items、sales-orders、delivery-notes 或 login production page。
- 未建立 Table、Pagination、StatusBadge、DescriptionList、Dialog、ConfirmDialog、Toast、Tabs、DropdownMenu、Drawer、DataTable、PageHeader／PageContainer migration。
- 未修改 App Shell、company switching、SYSTEM_ADMIN／COMPANY_ADMIN、RBAC、session、authorization、schema、migration、API、state machine、transaction、audit、idempotency、formal print 或 P5。
- 未新增 dependency、production route、資料庫連線或測試 framework。

## 19. Final Git contract

- 最終 staged diff 必須保持空，`git diff --check` 與 `git diff --cached --check` 必須通過。
- 最終差異只可分為：既有 P4.3 SPEC／治理、已核准 P4.3a、上述 P4.3b、受保護 Blueprint。
- P4.3b 完成後停止，不 stage、commit 或 push；P4.3c 必須另案授權。
