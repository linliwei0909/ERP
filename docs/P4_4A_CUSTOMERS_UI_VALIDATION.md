# P4.4a Customers UI 驗證

文件狀態：Implemented and Validated
驗證日期：2026-08-02
切片：P4.4a Customers

## A. Git 基線

- Branch：`feat/p4-4-masters-admin-ui`
- 起始 HEAD：`77431ab7e22d0dbeae33f75f1415b098e81124eb`
- `origin/main`：`77431ab7e22d0dbeae33f75f1415b098e81124eb`
- ahead／behind：`0 / 0`
- 起始 staged diff：空
- 起始工作樹只包含使用者正式核准認領的 9 個 Customers 差異與受保護 Blueprint。
- `git diff --check`、`git diff --cached --check`：通過。

## B. Blueprint 保護

`docs/INVENTORY_PRODUCTION_BLUEPRINT.md` 只檢查 metadata，未開啟、搜尋、讀取、引用或修改內容：

- Size：20,880 bytes
- Modified：`2026-07-27 11:03:17`
- SHA-256：`930121B91B470DFF25596AE50309060155CF7C0F4B78251184EB13B493AF95B7`
- 未 stage、未 commit。

## C. Route inventory

| Route | Boundary | P4.4a 結果 |
| --- | --- | --- |
| `/customers` | Server page + server-safe `CustomersListView` | PageHeader、Field、Table、StatusBadge、Pagination、EmptyState；保留 query selector |
| `/customers/[id]` | Server page | PageHeader、DescriptionList、Card、Section、StatusBadge、EmptyState |
| `/admin/customers` | Server page + `CustomerCreateClient` | PageHeader、Field、Table、Pagination、StatusBadge、Alert、FormActions |
| `/admin/customers/[id]` | Server page + `CustomerManagerClient` | PageHeader、Field、Card、Section、StatusBadge、Alert、FormActions、responsive forms |

四條 route 均未新增、刪除或改名；URL contract 維持不變。

## D. Existing work attribution

前次唯讀歸屬審查確認原始差異來自 Codex session：

```text
019fbe18-8d11-7263-bbbb-a5e326fe801d
```

該 session 的結構化 `patch_apply_end` 紀錄與檔案 creation／modified time 完整對應下列 9 檔：

```text
web/src/app/(authenticated)/admin/customers/[id]/customer-manager-client.tsx
web/src/app/(authenticated)/admin/customers/[id]/page.tsx
web/src/app/(authenticated)/admin/customers/customer-create-client.tsx
web/src/app/(authenticated)/admin/customers/page.tsx
web/src/app/(authenticated)/customers/[id]/page.tsx
web/src/app/(authenticated)/customers/customer-list-view.tsx
web/src/app/(authenticated)/customers/customer-ui.module.css
web/tests/unit/page-contract-integration.test.tsx
web/tests/unit/p4-4a-customers-ui.test.tsx
```

唯讀歸屬審查裁決為 `SAFE TO ADOPT AS P4.4a`；使用者後續正式核准認領全部 9 檔，禁止 reset、stash、刪除或重做整批 migration。本次在該成果上只補足 filtered no-results presentation、DOM interaction tests 與 validation。

## E. Implementation

### `/customers`

- 移除 route-local nested `<main>`，由既有 App Shell 持有唯一 `#main-content` target。
- 保留 PageHeader、shared filters、Table、StatusBadge 與 Pagination。
- 正常資料保留 detail href 與 `companyId` query。
- 空資料分為：
  - 無搜尋字詞：`no-data`／「尚無可使用客戶」。
  - 有搜尋字詞但無結果：`no-results`／「查無符合條件的客戶」。
- table overflow 只限 `TableContainer` 資料區。

### `/customers/[id]`

- raw header、status、detail cards 改用 PageHeader、StatusBadge、DescriptionList、Card 與 Section。
- contacts／delivery locations 的空狀態改用 EmptyState。
- ADMIN 管理入口與返回清單 href 保持。

### `/admin/customers`

- raw filters、list、status 與 pagination 改用 P4.3 primitives。
- create form 改用 Field、Input、Select、Alert、FormActions 與 pending Button。
- 保留 `requireAdminWithAudit`、local company selector、service query、create payload 與 redirect。

### `/admin/customers/[id]`

- PageHeader、StatusBadge、Card、Section、Field、Checkbox、Alert 與 FormActions 全面採用。
- customer、company relation、contact、shipping location 四組既有 mutation 邊界保持。
- pending action 使用 disabled 與 `aria-busy`；失敗恢復 action 並顯示 danger Alert。

## F. Behavior preservation

| Contract | 證據與結果 |
| --- | --- |
| Routes | 四條 filesystem routes 未改 |
| Query | `companyId`、`search`、`status`、`page` 保持 |
| Pagination | enabled href 保留全部 filters；boundary 使用 shared disabled presentation |
| Detail href | `/customers/{id}?companyId=...` 與 admin detail href 保持 |
| Fields | create／customer／relation／contact／location field names 與 HEAD 機械比對一致 |
| Endpoints | `/api/customers`、customer、companies、contacts、locations endpoints 保持 |
| Methods | create／relation 使用 POST；customer edit 使用 PATCH；contact/location create／edit 使用 POST／PATCH |
| Payloads | DOM tests逐一解析 request body，company、customer、relation、contact、location shape 保持 |
| Permissions | `requireAdminWithAudit` 與 `hasRole(..., "ADMIN")` 保持 |
| Mutations | idempotency key、成功 redirect／reload、失敗訊息取得保持 |
| Contacts | field set、primary flag、status、endpoint 與 method selection 保持 |
| Shipping addresses | structured fields、default flag、status、endpoint 與 method selection保持 |
| Company relations | company selector、customer code、status、POST payload保持 |

未修改 Customer service、API implementation、validation schema、transaction、audit 或 domain rule。

## G. Company context

正式裁決與實作結果：

- `/customers` local `companyId` selector 保留。
- `/admin/customers` local `companyId` selector 保留。
- Admin detail company relation selector 保留。
- `query.companyId ?? context.selectedCompany.id` fallback 保持。
- query、pagination、detail href、redirect 與 mutation target 保持。
- Browser 以 Shell active company `P44A` 搭配 route local selector `P44B` 驗證：清單、create redirect、admin detail、public detail 均指向 `P44B`，沒有改變 Shell active company。
- 未修改 session、authorization 或 company switching。
- OQ-053 不因 P4.4a 關閉；其餘 routes 仍須逐切片處理。

## H. Accessibility

- PageHeader 每頁輸出唯一 page `h1`。
- 四條 route page 均不再加入 nested `<main>`；App Shell 的 `DIV#main-content` target 唯一存在。這是 P4.3 固定 contract，不在 P4.4a 改寫 Shell element。
- Field 自動連接 label、required indicator、description 與 `aria-describedby`。
- native `required`、email type、min／max length 保持；DOM test確認空 required control `checkValidity() === false`。
- pending Button 為 disabled 且 `aria-busy="true"`。
- API error 使用 danger Alert／`role="alert"`。
- Table 保留 caption；mobile overflow只發生於 TableContainer。
- Browser 四條 route 掃描的 unlabeled input／select／textarea 均為 0。

## I. Responsive

Browser viewport實測：

| Route | 1280px | 360px |
| --- | --- | --- |
| `/customers` | document 1280／viewport 1280；table 951／951 | document 360／viewport 360；table 327／414局部捲動 |
| `/customers/[id]` | document 1280／viewport 1280 | document 345／viewport 360；cards單欄 |
| `/admin/customers` | document 1265／viewport 1280；table 935／935 | document 345／viewport 360；table 311／449局部捲動 |
| `/admin/customers/[id]` | document 1265／viewport 1280 | document 345／viewport 360；forms單欄 |

四條 route 均無 viewport horizontal overflow；table寬度增加只存在於資料區局部scroll container。

## J. Tests

### Targeted

```text
tests/unit/customers.test.ts
tests/unit/page-contract-integration.test.tsx
tests/unit/p4-4a-customers-ui.test.tsx
tests/unit/p4-4a-customers-ui-dom.test.tsx
```

結果：4 files／20 tests通過。

覆蓋：正常清單、empty、filtered no-results、pagination enabled／disabled、detail href、create／manager fields、required／invalid、Error Alert、pending disabled／aria-busy、contacts、shipping locations、company relations、endpoints、POST／PATCH、payload、authorization、local selector、unique main target／h1、outer frame與Server／Client boundary。

### Full regression

正式 `npm run test` 分兩段：

- 非print：33 files／299 tests通過。
- Delivery Note print：1 file／12 tests通過。
- 合計：34 files／311 tests通過，高於指令基準32 files／302 tests。

## K. Quality gates

| Gate | 結果 |
| --- | --- |
| Targeted ESLint | Pass |
| Targeted unit／DOM | Pass；4 files／20 tests |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass；Next route types產生成功 |
| `npm run test` | Pass；34 files／311 tests |
| `npm run build` | Pass；37／37 static generation units |
| `git diff --check` | Pass |
| `git diff --cached --check` | Pass；stage前為空 |

Build只保留1項既有Delivery Note font／NFT dynamic filesystem tracing warning；內容與既有基線一致，沒有新增warning。

## L. Browser evidence

環境：

- fresh disposable DB：`erp_p4_4a_browser_test_20260802_codex01`
- host／port：`localhost:55432`
- role：`p1_test`
- runtime identity：database與role吻合；container port 5432映射host 55432。
- fresh migration：0001～0012，共12筆成功。
- browser驗證後停止暫時server並刪除database；已確認database不存在。

實測結果：

- 四條route於1280px／360px均為單一`#main-content` target、單一page `h1`及一個PageHeader。
- normal list、全空list與filtered no-results均實測。
- create成功後redirect至同一local `companyId`的admin detail。
- public detail顯示status、company customer code及contacts／locations EmptyState。
- duplicate create顯示「無法建立客戶」danger Alert及既有domain錯誤訊息。
- 所有route console：0 error、0 warning、0 React warning、0 hydration warning。
- focus-visible：搜尋欄outline為teal約2.67px、offset 2px。
- Browser合成Tab未可靠移動焦點，因此不宣稱完整人工Tab traversal；shared controls與overlay的keyboard行為由既有jsdom DOM tests覆蓋，完整人工keyboard walkthrough留待P4.7。
- Customers未新增Dialog；本切片沒有可驗證的Customers dialog／focus-return流程。

## M. Scope proof

- Prisma schema與migration差異：空。
- API implementation、DTO、payload contract差異：空。
- RBAC、session、authorization與company switching差異：空。
- Customer service／business rule／contacts／shipping address domain logic差異：空。
- Items、Pricing、其他Admin、Sales Orders、Delivery Note detail／print／void、P5差異：空。
- package／dependency差異：空。
- 沒有讀取、修改、stage或commit受保護Blueprint。

## N. Remaining work

- P4.4b：Items presentation migration。
- P4.4c：Pricing presentation migration。
- P4.4d：Company Settings／Users／Freight Rules／Master Import presentation migration。
- P4.4e：跨切片adoption matrix、static scan、disposable DB、browser與closure。
- P4.5／P4.6／P5仍明確排除。
- P4.7執行完整人工keyboard、screen reader、browser matrix與跨流程accessibility closure。

本文件只證明P4.4a既有Customers routes的presentation migration與行為保持，不宣稱整個ERP Customers domain重新設計或全ERP accessibility結案。
