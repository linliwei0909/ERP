# P4.4b Items UI Validation

日期：2026-08-02
分支：`feat/p4-4-masters-admin-ui`
範圍：`/items`、`/items/[id]`、`/admin/items`、`/admin/items/[id]`

## 1. Scope 與行為契約

本切片只遷移 Items presentation、page contract、ARIA、responsive 與既有 P4.3 共用元件採用。沒有修改 Prisma schema、migration、service、API route、DTO、validation schema、permission、session、authorization、item normalization 或 domain rule，也沒有建立 repository 不存在的 category、UOM 或 UOM conversion routes。

保持的契約：

- `/items` 仍使用 `companyId`、`search`、`itemType`、`page`，page size 仍為 20，並呼叫 `listSaleableItems`。
- 唯讀明細 href 仍為 `/items/{id}?companyId={companyId}`；錯誤 redirect 仍為 `/items`。
- `/admin/items` 仍執行 `requireAdminWithAudit`，使用相同 filters、`listItems` 與 pagination query。
- create 仍為 `POST /api/items`，保留 idempotency key、既有 field names、payload shape，以及 `purchaseEnabled`、`inventoryEnabled`、`productionEnabled` 固定為 `false`。
- item edit 仍為 `PATCH /api/items/{id}`，保留既有 item flags、status 與 selected `companyId`。
- company relation 仍為 `POST /api/items/{id}/companies`，保留 `companyItemCode`、`salesEnabled`、`status` payload。
- create／edit 成功後仍使用原有 location assign／reload；錯誤訊息仍取自既有 API error envelope。

## 2. Presentation migration

- 四個 route 移除 page-local outer container 與 nested `<main>`，由 App Shell 保持唯一 `#main-content`。
- `/items` 採用 `PageHeader`、`Card`、`Field`、`Input`、`Select`、`Table`、`StatusBadge`、`EmptyState` 與 `Pagination`。
- `/items` 區分未設定額外 filter 的 no-data 與 search／item type filter 的 no-results；沒有改變 query 或 service result。
- `/items/[id]` 採用 `PageHeader`、`StatusBadge`、`DescriptionList`、`Card` 與 `LinkButton`。
- `/admin/items` 保留已採用的 P4.3 controls，只修正 container contract。
- `/admin/items/[id]` 採用 `PageHeader`、`Alert`、`Card`、`Section`、`Field`、`Input`、`Textarea`、`Select`、`Checkbox`、`FormActions`、`Button` 與 `StatusBadge`。
- required controls 透過 `Field` 連結 label、`required` 與 `aria-required`；pending buttons 由共用 `Button` 提供 disabled 與 `aria-busy`。

## 3. Company context

local `companyId` selectors 全數保留，因為它們同時控制 query、detail href、pagination 與 mutation target。沒有修改 Shell active company、session company switching、permission、redirect 或 API target。

Browser smoke 使用兩家隔離測試公司驗證：Shell active company 維持 P44A；在 `/items` local selector 選 P44B 後，URL 與 local selector 指向 P44B，但 Shell 仍指向 P44A，且呈現 P44B 的 no-data。這證明本切片沒有把 local query selection 誤接成新的 Shell company switching 行為。

## 4. Automated tests

Targeted：

```text
npx vitest run tests/unit/items.test.ts tests/unit/page-contract-integration.test.tsx tests/unit/p4-4b-items-ui.test.tsx tests/unit/p4-4b-items-ui-dom.test.tsx
4 files passed / 18 tests passed
```

涵蓋 normal data、no-data、filtered no-results、pagination filters、detail href、field names、required invalid、pending disabled／`aria-busy`、API error alert、endpoint、method、payload、item flags、company relation、authorization 與 server/client boundary。

完整 gates：

```text
npm run lint       PASS
npm run typecheck  PASS
npm test           PASS: 35 files / 306 tests + 1 print file / 12 tests
npm run build      PASS: 37 / 37 routes
```

Build 只有既有 Delivery Note font NFT trace warning；import trace 位於 `src/lib/delivery-notes/**`，不屬於 P4.4b Items diff。

## 5. Browser／responsive／accessibility

最終程式碼使用全新 `erp_p4_4b_browser_test_20260802_codex02`，確認 dedicated role `p1_test`、localhost:55432、runtime identity 與 12/12 fresh migrations 後，啟動 production build。驗證完成後已停止 server 並永久刪除該 disposable database。先前同樣隔離的 `codex01` smoke database 也已在驗證後刪除。

1280 × 900 與 360 × 800 均驗證四個 routes：

| Route | h1 | `#main-content` | nested main | viewport overflow | unlabeled controls |
| --- | ---: | ---: | ---: | --- | ---: |
| `/items` | 1 | 1 | 0 | 否 | 0 |
| `/items/[id]` | 1 | 1 | 0 | 否 | 0 |
| `/admin/items` | 1 | 1 | 0 | 否 | 0 |
| `/admin/items/[id]` | 1 | 1 | 0 | 否 | 0 |

- `/items` desktop table 為 951/951；最終 360px smoke 為 327/551，overflow 被限制在 table container，沒有推寬 viewport。
- create normal flow 成功前往 `/admin/items/{id}?companyId=...`；query list 與 detail 顯示相同 item code、company item code、type 與 base unit。
- 空白 submit 保持原 route，四個 required inputs 的 native validity 均為 false，且 `aria-required=true`。
- native invalid focus 落在 `companyItemCode`，focus outline 為 teal solid 2.67px、offset 2px。
- 重複 create 顯示 danger alert「品項建立失敗」與既有 API 錯誤訊息。
- Browser 合成 `Tab` 已送出，但 in-app automation 焦點仍停在原 control；因此不把該合成事件列為實體鍵盤 Tab 成功證據。Field DOM order、native focus、focus-visible 樣式與 unit DOM interactions 均已驗證，實體鍵盤巡覽仍保留為人工 smoke 建議。

## 6. Scope proof

本切片 diff 限於：

- 四個 Items page routes；
- Items list server-safe view 與 presentation-only CSS module；
- 既有 create／manager client 的 shared-control presentation；
- P4.3 page contract integration expectation；
- P4.4b unit／DOM tests；
- 本 validation 文件。

沒有跨 Customers、Pricing、Company Settings、Users、Freight、Master Import 或其他 P4.4 slice 的產品程式修改。受保護 Blueprint 未開啟、搜尋、讀取、引用、修改、移動、刪除、stage 或 commit。
