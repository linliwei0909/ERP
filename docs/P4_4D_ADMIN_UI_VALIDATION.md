# P4.4d Admin UI Validation

日期：2026-08-02
分支：`feat/p4-4-masters-admin-ui`
範圍：Company Settings、Users、Freight Rules、Master Import 共六個既有 routes

## 1. Scope 與 contract

本切片只處理 presentation、page contract、ARIA、responsive、existing shared controls 與 `ConfirmDialog`。沒有新增 route、role、permission、schema、migration、API、DTO、validation、session/authorization behavior、company switching、freight domain 或 importer capability。

保持的高風險契約：

- Company Settings 保留 setting keys、tomorrow minimum、value parsing、POST/PATCH/cancel endpoints、effective-dated restrictions 與 company target。
- Users 保留所有 native POST forms、actions、field names、role codes、company IDs、default company、status/reason 與 session revoke；ConfirmDialog 只在原 form submit 前確認。
- Freight 保留 customer/location lookup、mode、conditional amount、`validFrom`、half-open `validTo`、status、POST/PATCH payload 與 domain validation。
- Master Import 保留 multipart `FormData`、`sourceSystem`、`entityType`、file、`companyId`、`dryRun`、idempotency key、implemented importer allowlist 與 batch detail reads；ConfirmDialog 只取代 `window.confirm`。

local company selectors 全數保留，沒有修改 Shell active company、redirect、permission 或 mutation target。

## 2. Presentation

- 六個 routes 均移除 page-local container 與 nested `<main>`。
- 採用 `PageHeader`、`Card`、`Section`、`Field`、`Input`、`Select`、`Checkbox`、`Button`、`FormActions`、`Alert`、`StatusBadge`、`EmptyState`、`Table`、`Pagination`、`DescriptionList` 與 `ConfirmDialog`。
- Users role/company fieldsets 與 native form boundaries保持；status/session actions 使用 client button 開啟 dialog，confirm 後對原 form 執行 `requestSubmit()`。
- Company future-version cancel 與 Import formal execution 使用 shared focus-managed dialog；pending 時不可 dismiss。
- Freight list加入只使用既有 query 的 Pagination；Master Import tables在窄螢幕由 table container 管理。

## 3. Automated evidence

```text
npx vitest run company-settings, access-control, session, freight, master-import, p4-4d static/DOM
7 files / 38 tests PASS

npm run lint       PASS
npm run typecheck  PASS
npm test           PASS: 39 files / 318 tests + 1 print file / 12 tests
npm run build      PASS: 37 / 37 routes
```

Tests鎖定 Company endpoints/ConfirmDialog、Users native actions/fields/confirm-before-submit、Freight endpoints/payload/half-open dates、Import multipart body keys/endpoint/ConfirmDialog、authorization 與 unique page contract。Build仍只有既有 Delivery Note font NFT warning。

## 4. Browser evidence

使用 fresh `erp_p4_4d_browser_test_20260802_codex01`，確認 localhost:55432、dedicated `p1_test`、runtime identity 與 12/12 migrations。驗證後已停止 server 並永久刪除 database與所有 fixtures。

以下 routes 在 1280 × 900 與 360 × 800 均為單一 h1、單一 `#main-content`、0 nested main、0 unlabeled controls、無 viewport overflow：

- `/admin/company-settings`
- `/admin/users`
- `/admin/freight-rules`
- `/admin/freight-rules/[id]`
- `/admin/master-import`
- `/admin/master-import/[id]`

其他證據：

- 360px Master Import list table為311/311；Import detail兩個 empty tables亦未推寬 viewport。
- 透過既有 Customer UI建立 disposable customer/location，再以 Freight UI建立 `NO_CHARGE` rule；list與detail href、日期、status一致。
- Users「撤銷全部 Session」dialog與 Import「正式匯入」dialog均能開啟、具唯一 dialog、confirm/cancel controls，取消未觸發 mutation。
- local Import selector切到P44B時，URL/local selector為P44B，Shell仍保持P44A。
- in-app browser不提供 file input `setInputFiles`；臨時 CSV fixture立即移除，Import detail改以直接插入 disposable DB 的最小 `PENDING`/0-count batch fixture只驗證rendering，未執行或繞過 importer。第一次不符合 completion check 的 `VALIDATED` fixture insert由DB拒絕且transaction未寫入；之後使用符合constraint的PENDING fixture。
- 實體鍵盤 Tab仍為人工 smoke建議；Dialog focus trap/restore與Escape行為由既有 `ui-dialog` tests及P4.4d DOM tests覆蓋。

## 5. Scope proof

產品 diff只位於六個既有 Admin routes/clients及Users presentation CSS/client button；另含P4.4d tests與本文件。沒有跨入Pricing或其他slice domain，也沒有實作DEC-061未來角色。受保護Blueprint未開啟、搜尋、讀取、引用、修改、移動、刪除、stage或commit。
