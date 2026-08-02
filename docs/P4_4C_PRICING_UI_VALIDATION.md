# P4.4c Pricing UI Validation

日期：2026-08-02
分支：`feat/p4-4-masters-admin-ui`
範圍：`/pricing/lookup`、`/admin/pricing`、`/admin/pricing/[id]`

## 1. Scope 與 contract

本切片只遷移 Pricing presentation、page contract、ARIA、responsive 與既有 P4.3 共用元件。沒有修改 schema、migration、service、API、DTO、validation、RBAC、session、authorization、effective-price lookup、half-open validity、GiST exclusion、overlap rule 或 pricing domain logic。

保持的契約：

- 正式查價仍使用 `companyId`、`customerId`、`itemId`、`effectiveDate`，呼叫 `getEffectivePrice`，並只將 `PriceNotFoundError` 顯示為 `PRICE_NOT_FOUND`。
- admin list 仍執行 `requireAdminWithAudit`、`listPriceLists`，保留 `companyId`、`search`、`status`、`page`；新增的 Pagination 只組合既有 query。
- create 仍為 `POST /api/admin/price-lists`；detail edit 仍為 `PATCH /api/admin/price-lists/{id}`。
- item price create／adjust 仍為 `POST /api/admin/price-lists/{id}/prices` 與 `PATCH /api/admin/item-prices/{id}`。
- customer assignment create／adjust 仍為 `POST /api/admin/customer-price-list-assignments` 與 `PATCH /api/admin/customer-price-list-assignments/{id}`。
- `itemId`、`unitPrice`、`customerId`、`priceListId`、`validFrom`、`validTo`、`status`、company target 與 idempotency key 全數保持。

## 2. Presentation 與 accessibility

- 三個 routes 移除 page-local outer container 與 nested `<main>`，改由 App Shell 提供唯一 container。
- 採用 `PageHeader`、`Card`、`Section`、`Field`、`Input`、`Select`、`Button`、`FormActions`、`Alert`、`StatusBadge`、`EmptyState`、`Pagination` 與 `DescriptionList`。
- 價格表、價格版本與客戶指派表單都有可見 label；required／`aria-required`、pending disabled／`aria-busy` 與 API danger alert 由共用元件提供。
- 版本與指派使用 responsive grid；360px 改為單欄，不改有效期間資料或提交順序。

## 3. Company context

local `companyId` selector 保留，因為它控制 lookup/list、detail href、pagination 與 mutation target。Browser smoke 證明 Shell active company 保持 P44A；admin local selector 查詢 P44B 時，URL/local selector 指向 P44B，Shell 仍為 P44A。沒有新增 company switching 行為。

## 4. Automated evidence

```text
npx vitest run tests/unit/pricing.test.ts tests/unit/p4-4c-pricing-ui.test.tsx tests/unit/p4-4c-pricing-ui-dom.test.tsx
3 files / 13 tests PASS

npm run lint       PASS
npm run typecheck  PASS
npm test           PASS: 37 files / 312 tests + 1 print file / 12 tests
npm run build      PASS: 37 / 37 routes
```

Targeted tests鎖定 lookup、not-found、authorization、所有 endpoints/methods/payloads、validity fields、required、pending、error、empty states 與 server/client boundary。Build 只有既有 Delivery Note font NFT trace warning，不屬於 Pricing diff。

## 5. Browser evidence

使用 fresh `erp_p4_4c_browser_test_20260802_codex01`，確認 localhost:55432、dedicated `p1_test`、runtime identity 與 12/12 migrations；驗證後已停止 production server並永久刪除 database。

三個 routes 在 1280 × 900 與 360 × 800 均為：1 個 h1、1 個 `#main-content`、0 nested main、0 unlabeled controls、無 viewport overflow。另驗證：

- 空白價格表 create 的兩個 required inputs 均 `valid=false`、`aria-required=true`。
- native invalid focus 落在 `code`，outline 為 teal solid 2.67px、offset 2px。
- create normal flow 前往 `/admin/pricing/{id}?companyId=...`。
- duplicate create 顯示 danger alert 與既有 conflict error。
- detail 的無版本／無指派 empty states、date fields 與 status controls 在 desktop／360 均可用。
- in-app browser 合成 Tab 的限制已在 P4.4b 記錄；本切片以 DOM order、native invalid focus、focus-visible 與 unit interactions 作自動化證據，實體鍵盤 Tab 仍列人工 smoke 建議。

## 6. Scope proof

產品程式 diff 只位於上述三個 Pricing routes/clients 與 pricing-only CSS module；另含 Pricing tests 與本文件。沒有修改 Customers、Items、Company Settings、Users、Freight、Master Import 或其他 slice。受保護 Blueprint 未開啟、搜尋、讀取、引用、修改、移動、刪除、stage 或 commit。
