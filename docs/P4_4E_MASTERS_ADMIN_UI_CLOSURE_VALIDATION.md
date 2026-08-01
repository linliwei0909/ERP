# P4.4e Masters／Admin UI Closure Validation

日期：2026-08-02
分支：`feat/p4-4-masters-admin-ui`
狀態：Implemented and Validated

## 1. Slice commits

| Slice | Commit | Scope |
| --- | --- | --- |
| P4.4a | `97f606a` | Customers |
| P4.4b | `59f71b1` | Items |
| P4.4c | `a73d7a7` | Pricing |
| P4.4d | `ee843fc` | Company Settings、Users、Freight Rules、Master Import |
| P4.4e | 本 closure commit | Cross-slice static scan、full gates、fresh DB、browser closure |

基線為 `77431ab7e22d0dbeae33f75f1415b098e81124eb`；各產品切片均使用獨立 commit，P4.4e 只新增 closure test 與本驗證文件。

## 2. Route inventory

P4.4 共遷移並驗證 17 個既有 routes，沒有新增、刪除、改名或改寫 route contract：

- Customers：`/customers`、`/customers/[id]`、`/admin/customers`、`/admin/customers/[id]`
- Items：`/items`、`/items/[id]`、`/admin/items`、`/admin/items/[id]`
- Pricing：`/pricing/lookup`、`/admin/pricing`、`/admin/pricing/[id]`
- Admin：`/admin/company-settings`、`/admin/users`、`/admin/freight-rules`、`/admin/freight-rules/[id]`、`/admin/master-import`、`/admin/master-import/[id]`

所有 route page 都由 App Shell 持有唯一 `#main-content`，沒有 page-local nested `<main>` 或 outer max-width/container；server page 保持 server-only，mutation client 明確保留 `"use client"` boundary。

## 3. Cross-slice static closure

新增 `web/tests/unit/p4-4e-masters-admin-closure.test.ts`，鎖定：

- 17 個 route page 不再建立 local outer layout 或 nested `<main>`。
- 17 個 server pages 沒有誤轉為 Client Components。
- 11 個 mutation clients 仍明確為 Client Components。
- Company Settings 與 Master Import 使用 shared `ConfirmDialog`，不再使用 `window.confirm`。
- P4.4a～P4.4d 每一切片均有 validation record。

Targeted closure 結果：1 file／4 tests PASS。

## 4. Behavior and company context

各切片 validation 已逐 route 鎖定 routes、query parameters、pagination、filters、detail href、form field names、API endpoints、methods、payloads、validation、permission checks、company context、create/edit、enable/disable、contacts、shipping addresses與error handling。

P4.4 沒有把 local selector 誤接為新的 company switching：

- 既有 local `companyId` selectors 全數保留。
- query、pagination、detail href、redirect、permission 與 API target 保持。
- Browser 使用 Shell active company P44A 與 local selector P44B 驗證；local query 可指向 P44B，Shell active company 仍維持 P44A。
- 沒有修改 session、authorization 或 company switching。

OQ-053／OQ-054 仍為部分未決：本次只完成已核准 routes 的保守 presentation migration，不宣稱關閉 canonical redirect、其餘 route 細節、legacy layout 例外或未來 management scope。

## 5. Full automated gates

| Gate | Result |
| --- | --- |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS：40 non-print files／322 tests，加 1 print file／12 tests；合計 41 files／334 tests |
| `npm run build` | PASS：37／37 static generation units |
| P4.4e targeted | PASS：1 file／4 tests |

Production build 只有一項既有 Delivery Note font／NFT dynamic filesystem tracing warning；import trace 位於 `src/lib/delivery-notes/**`，與 P4.4 diff 無關，沒有新增 warning。

## 6. Fresh database validation

使用 disposable database `erp_p4_4e_closeout_20260802_codex01`，先確認 localhost:55432、dedicated role `p1_test` 與 runtime identity，再執行：

- Prisma validate／generate：PASS。
- fresh migrations：0001～0012，共 12／12 PASS。
- DB test suite：15 files／149 tests PASS。
- schema diff：`No difference detected`。

該 closeout database 驗證後已永久刪除並確認不存在。沒有對 production 或來源不明 database 執行測試。

## 7. Browser closure

以 production build、fresh migrated browser database 與隔離 fixtures 驗證。跨切片 final matrix 共 20 項：10 個代表 routes × 1280 × 900 與 360 × 800，全部符合：

- 每頁 1 個 page `h1`。
- 每頁 1 個 `#main-content`。
- 0 nested `<main>`。
- 0 viewport horizontal overflow。
- 0 unlabeled input／select／textarea。

代表 routes：`/customers`、`/admin/customers`、`/items`、`/admin/items`、`/pricing/lookup`、`/admin/pricing`、`/admin/company-settings`、`/admin/users`、`/admin/freight-rules`、`/admin/master-import`。

P4.4a～P4.4d validation 另記錄全部 17 routes 的 desktop／360px、normal／empty／error、create/edit、pagination、local company context、native validation、focus-visible 與 ConfirmDialog interaction evidence。Browser 合成 `Tab` 無法可靠模擬實體鍵盤 traversal，因此不宣稱完整人工 Tab walkthrough；DOM order、native invalid focus、focus-visible、Dialog focus trap／restore／Escape 已由 browser 與 unit DOM tests覆蓋，實體鍵盤 smoke 仍建議於 P4.7 執行。

Final browser server 已停止。Browser disposable database `erp_p4_4e_browser_closeout_20260802_codex01` 的永久刪除因本機 destructive-action safety approval 未獲准而保留；其只含本次隔離 synthetic fixtures，沒有連接 production，後續應由使用者明確核准後刪除。

## 8. Scope proof and exclusions

P4.4 全部差異只包含 Masters／Admin presentation、page contract、ARIA、responsive、shared controls、tests 與 validation documents。明確排除且未修改：

- Prisma schema、migration、database contract。
- API implementation、endpoint、DTO、payload、validation schema。
- RBAC、role codes、permission、session、authorization、company switching。
- Customer、Item、Pricing、Freight、Import business/domain rules。
- transaction、audit、idempotency behavior。
- Sales Orders、Delivery Notes detail／print／void、formal print。
- P4.5、P4.6、P5。
- package dependencies 或大型 UI framework。

受保護 `docs/INVENTORY_PRODUCTION_BLUEPRINT.md` 全程只檢查 status、size、modified time 與 SHA-256；未開啟、搜尋、讀取、引用、修改、移動、刪除、stage 或 commit。

## 9. Closure decision

P4.4a～P4.4e 的核准範圍、行為保持、company context、automated gates、fresh migration/schema diff 與 desktop／360px browser evidence均完成。P4.4 Masters／Admin UI migration 可建立 Draft PR；不得 merge，且 OQ-053／OQ-054 與 P4.7 人工 accessibility smoke仍保持後續工作。
