# P4.4 Masters／Admin UI Master Plan

文件狀態：Approved Execution Plan / Ready for Orchestration
版本：V1.0
版本日期：2026-08-01
規格依據：`DECISIONS.md` DEC-060、DEC-061；`P4_UI_UX_BLUEPRINT.md`；`P4_3_DESIGN_SYSTEM_SPEC.md`；`P4_3E_DESIGN_SYSTEM_CLOSURE_VALIDATION.md`

## 1. 目標與固定邊界

P4.4 將 P4.3 Design System 全面套用到既有 Masters／Admin routes，只處理 presentation、page contract、accessibility、responsive 與共用元件採用。

不得改變 route、URL contract、query parameter、form field name、payload、DTO、API、validation schema、permission、authorization、session、business rule、state machine、transaction、audit、idempotency、database schema 或 migration。不得開始 P4.5、P4.6 或 P5。

現有後端仍使用 `ADMIN`、`ORDER_ENTRY`、既有 permissions 與 company scope。DEC-061 的 `SYSTEM_ADMIN`／`COMPANY_ADMIN` 是未來 UI／資訊架構 contract，不是已實作 role code；P4.4 不新增、映射或模擬該後端能力。

## 2. 切片

- P4.4a Customers：查詢、明細、管理新增／編輯、聯絡人、送貨地點、公司關係及啟用／停用 presentation。
- P4.4b Items：查詢、明細、管理新增／編輯、公司關係及啟用／停用 presentation。Repository 目前沒有獨立 categories、UOM 或 UOM conversion routes，不建立不存在的 domain。
- P4.4c Pricing：正式價格查詢、價格表清單／建立／編輯、item price versions、customer price-list assignments、effective date 與 validity presentation。
- P4.4d Company Settings／Users／Admin：公司設定、使用者／角色／授權／company scopes／sessions，以及既有 freight rules 與 master import 管理頁。Repository 目前沒有獨立 roles、audit logs、background jobs、system health 或 `/admin` index page，不建立新 route。
- P4.4e Closure：跨切片 static contract、browser、accessibility、quality gates、scope proof 與 closure 文件；不再加入新功能。

## 3. Static Route Inventory

所有頁面均位於 `web/src/app/(authenticated)`；「S+C」表示 Server page 組合既有 Client mutation component。

| Slice | Route | Purpose | Server／Client | Company context | Existing UI debt | Tests | Risk | Planned action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P4.4a | `/customers` | 客戶查詢、篩選、分頁 | Server + server-safe view | URL `companyId` fallback active company；local selector | 已是代表頁；仍有 nested `main` 與平行 selector | `customers.test.ts`、DB customer workflow、page contract integration | 中 | 保留 query/href；移除 nested main；selector 依 §5 證明後處理 |
| P4.4a | `/customers/[id]` | 客戶唯讀明細、contacts、shipping addresses、管理入口 | Server | URL `companyId` fallback active company | raw header/cards/status、page-local outer container、缺一致 empty state | customer unit/DB workflow | 中 | 套用 PageHeader、DescriptionList、Section、StatusBadge、EmptyState |
| P4.4a | `/admin/customers` | 客戶清單、create、filters、pagination | S+C (`CustomerCreateClient`) | URL `companyId` fallback active company；local selector；payload target | raw controls/list/status/pagination、outer container | customer unit/DB workflow、access control | 高 | 共用 form/data primitives；保持 create payload、query、permission |
| P4.4a | `/admin/customers/[id]` | edit、contacts、shipping addresses、company relations、status | S+C (`CustomerManagerClient`) | URL `companyId` fallback active company；client mutation target | 大量 raw controls、placeholder-only labels、raw feedback、outer container | customer unit/DB workflow、access control | 高 | Field/FormActions/Alert/Section/StatusBadge；mutation 原封不動 |
| P4.4b | `/items` | 可銷售品項查詢、篩選、分頁 | Server | URL `companyId` fallback active company；local selector | raw table/status/pagination、outer container、360px overflow | `items.test.ts`、DB item workflow | 中 | Table/Pagination/StatusBadge/EmptyState/PageHeader；保留 query |
| P4.4b | `/items/[id]` | 品項唯讀明細、公司品項代碼 | Server | URL `companyId` fallback active company | raw header/detail/status、outer container | item unit/DB workflow | 中 | PageHeader/DescriptionList/StatusBadge/Section |
| P4.4b | `/admin/items` | 品項清單、create、filters、pagination | S+C (`ItemCreateClient`) | URL `companyId` fallback active company；local selector；payload target | 已是代表頁；仍有 nested `main` 與 selector | item unit/DB workflow、page contract integration | 中 | 保留已採用 primitives；修正 container；selector 依 §5 |
| P4.4b | `/admin/items/[id]` | edit、company relations、enable/disable flags | S+C (`ItemManagerClient`) | URL `companyId` fallback active company；client mutation target | raw controls/feedback、outer container、dense 360px layout | item unit/DB workflow、access control | 高 | 共用 form/feedback/status；保留 normalization、UOM與relation rules |
| P4.4c | `/pricing/lookup` | customer/item/effective-date 正式查價 | Server | active company only；無 local company selector | raw controls/result/error、outer container | `pricing.test.ts`、DB pricing workflow | 高 | Field/Alert/EmptyState/PageHeader；保持 effective date 與 service |
| P4.4c | `/admin/pricing` | price-list filters、create、list | S+C (`PriceListCreateClient`) | URL `companyId` fallback active company；local selector；payload target | raw controls/list/status/pagination、outer container | pricing unit/DB workflow、access control | 高 | 共用元件；保持 code normalization、query、payload |
| P4.4c | `/admin/pricing/[id]` | price list edit、item prices、customer assignments、validity periods | S+C (`PricingManagerClient`) | URL `companyId` fallback active company；client mutation target | dense raw forms、raw status/error、360px風險、outer container | pricing unit/DB workflow、access control | 最高 | 分節採用 Field/FormActions/StatusBadge/Alert；不得觸碰 half-open/GiST/overlap/service |
| P4.4d | `/admin/company-settings` | effective-dated company setting history、create/edit/cancel | S+C (`CompanySettingsClient`) | URL `companyId` fallback active company；管理 selector；payload target | raw controls/history、`window.confirm`、outer container | `company-settings.test.ts`、DB workflow | 高 | ConfirmDialog 與共用 form/data primitives；保留 mutation |
| P4.4d | `/admin/users` | users、roles、user-role assignments、company scopes、default company、status、session revoke | Server + native form POST | 全授權 companies；現有 ADMIN management scope | 大型單頁、raw controls/status/actions、outer container、360px風險 | session/access-control/auth DB tests | 最高 | 共用 sections/forms/dialog presentation；不得改 RBAC/session/API |
| P4.4d | `/admin/freight-rules` | freight rule list/create/filter | S+C (`FreightRuleCreateClient`) | URL `companyId` fallback active company；local selector | raw controls/table/status/pagination、outer container | `freight.test.ts`、DB freight workflow | 高 | 共用元件與 responsive；保留 freight domain |
| P4.4d | `/admin/freight-rules/[id]` | freight rule edit/status/validity | S+C (`FreightRuleEditor`) | URL `companyId` fallback active company；client mutation target | raw form/feedback、outer container | freight unit/DB workflow | 高 | Field/FormActions/Alert/StatusBadge；不得改有效期間規則 |
| P4.4d | `/admin/master-import` | import upload/execute、batch list | S+C (`MasterImportClient`) | URL `companyId` fallback active company；payload target | raw controls/table/status、`window.confirm`、outer container | `master-import.test.ts`、DB workflow | 高 | ConfirmDialog/Table/StatusBadge/feedback；不改 importer contract |
| P4.4d | `/admin/master-import/[id]` | batch summary、row errors、results | Server | URL `companyId` fallback active company | raw tables/status、outer container、360px overflow | master-import unit/DB workflow | 中 | PageHeader/Table/StatusBadge/Alert/EmptyState |

對應服務／API 保持不變：Customers 使用 `@/lib/customers/service` 與 `/api/customers/**`；Items 使用 `@/lib/items/service` 與 `/api/items/**`；Pricing 使用 `@/lib/pricing/service`、`/api/pricing/lookup` 與 `/api/admin/{price-lists,item-prices,customer-price-list-assignments}/**`；Company Settings 使用 `@/lib/company-settings/service` 與 `/api/admin/company-settings/**`；Users 使用既有 Prisma reads 與 `/api/admin/users/**` native form handlers；Freight／Import 使用各自既有 service 與 `/api/admin/freight-rules/**`、`/api/admin/master-import/batches/**`。

## 4. Adoption Matrix

| Route | PageHeader | PageContainer | Field | Table | StatusBadge | Pagination | Dialog | Alert／Empty／Loading |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/customers` | Already representative | Planned P4.4a | Already representative | Already representative | Already representative | Already representative | Not applicable | Already representative |
| `/customers/[id]` | Planned P4.4a | Planned P4.4a | Not applicable | Not applicable | Planned P4.4a | Not applicable | Not applicable | Planned P4.4a |
| `/admin/customers` | Planned P4.4a | Planned P4.4a | Planned P4.4a | Planned P4.4a | Planned P4.4a | Planned P4.4a | Not applicable | Planned P4.4a |
| `/admin/customers/[id]` | Planned P4.4a | Planned P4.4a | Planned P4.4a | Not applicable | Planned P4.4a | Not applicable | Deferred | Planned P4.4a |
| `/items` | Planned P4.4b | Planned P4.4b | Planned P4.4b | Planned P4.4b | Planned P4.4b | Planned P4.4b | Not applicable | Planned P4.4b |
| `/items/[id]` | Planned P4.4b | Planned P4.4b | Not applicable | Not applicable | Planned P4.4b | Not applicable | Not applicable | Planned P4.4b |
| `/admin/items` | Already representative | Planned P4.4b | Already representative | Already representative | Already representative | Already representative | Not applicable | Already representative |
| `/admin/items/[id]` | Planned P4.4b | Planned P4.4b | Planned P4.4b | Not applicable | Planned P4.4b | Not applicable | Deferred | Planned P4.4b |
| `/pricing/lookup` | Planned P4.4c | Planned P4.4c | Planned P4.4c | Not applicable | Not applicable | Not applicable | Not applicable | Planned P4.4c |
| `/admin/pricing` | Planned P4.4c | Planned P4.4c | Planned P4.4c | Planned P4.4c | Planned P4.4c | Planned P4.4c | Not applicable | Planned P4.4c |
| `/admin/pricing/[id]` | Planned P4.4c | Planned P4.4c | Planned P4.4c | Planned P4.4c | Planned P4.4c | Not applicable | Deferred | Planned P4.4c |
| `/admin/company-settings` | Planned P4.4d | Planned P4.4d | Planned P4.4d | Planned P4.4d | Planned P4.4d | Not applicable | Planned P4.4d | Planned P4.4d |
| `/admin/users` | Planned P4.4d | Planned P4.4d | Planned P4.4d | Not applicable | Planned P4.4d | Not applicable | Planned P4.4d | Planned P4.4d |
| `/admin/freight-rules` | Planned P4.4d | Planned P4.4d | Planned P4.4d | Planned P4.4d | Planned P4.4d | Planned P4.4d | Not applicable | Planned P4.4d |
| `/admin/freight-rules/[id]` | Planned P4.4d | Planned P4.4d | Planned P4.4d | Not applicable | Planned P4.4d | Not applicable | Deferred | Planned P4.4d |
| `/admin/master-import` | Planned P4.4d | Planned P4.4d | Planned P4.4d | Planned P4.4d | Planned P4.4d | Not applicable | Planned P4.4d | Planned P4.4d |
| `/admin/master-import/[id]` | Planned P4.4d | Planned P4.4d | Not applicable | Planned P4.4d | Planned P4.4d | Not applicable | Not applicable | Planned P4.4d |

`PageContainer` 欄代表移除 page-local outer container 並由 App Shell 保持唯一 container；不得加入 nested `<main>`、duplicate `<h1>` 或新的 route registry。

## 5. Company Context 裁量

一般 Masters 頁原則上只使用 Shell active company，不新增第二套公司切換入口。移除 local `companyId` selector 前，該 route 必須以 source、tests 與 desktop／360px smoke 證明 route、query、filter、pagination、redirect、permission 與 API target 全部不變。

無法安全證明時保留 selector，完成其他 presentation migration，並在對應 validation 與 OQ-053 記錄；不得為視覺一致性修改 session、authorization 或 company switching。管理公司只保留 DEC-061 的未來資訊架構說明，不實作跨公司後端 scope。active company 與 management scope 發生衝突時停止。

## 6. 每切片固定流程與驗證

每個切片依序完成：Git baseline/scope、Blueprint metadata、route inventory、現況與 business boundary、實作、切片 tests、lint、typecheck、full unit regression、production build、desktop、360px、keyboard/focus、validation、precise stage review、獨立 commit。任一步失敗不進下一切片。

Validation 文件固定為：

- `docs/P4_4A_CUSTOMERS_UI_VALIDATION.md`
- `docs/P4_4B_ITEMS_UI_VALIDATION.md`
- `docs/P4_4C_PRICING_UI_VALIDATION.md`
- `docs/P4_4D_ADMIN_UI_VALIDATION.md`
- `docs/P4_4E_MASTERS_ADMIN_UI_CLOSURE_VALIDATION.md`

UI-only 切片原則上不需要 DB 修改。需要 route smoke 時只使用全新 disposable DB；禁止 development/production/來源不明 DB，禁止暴露密碼，migration 失敗立即停止，且不得新增 migration。驗證完成後依正式政策清理或保留；Codex cloud 是否可使用 Docker/PostgreSQL 尚未由本機 preflight 證實，cloud run 必須重新 preflight。

## 7. Git、Commit 與 Draft PR

Preflight 在 `main` 完成文件準備；P4.4 執行前 fetch 最新 `origin/main`，確認 clean/equal 後建立 `feat/p4-4-masters-admin-ui`。不得在 `main` 實作。固定 commits：

1. `feat(ui): migrate customer master pages`
2. `feat(ui): migrate item master pages`
3. `feat(ui): migrate pricing master pages`
4. `feat(ui): migrate admin management pages`
5. `docs(ui): validate and close P4.4`

每個 commit 只含該切片、validation 與必要文件同步；使用 explicit paths stage，禁止 broad add。全部成功才 push feature branch 並建立不 merge 的 Draft PR，title `P4.4 Masters and Admin UI migration`，base 必須明確指定 `main`（GitHub repository default branch 目前回報為 `master`）。Description 包含 slice commits、quality gates、route inventory、company context、remaining OQ-053/054 與 exclusions。

本機 `origin` 提供 HTTPS fetch/push，GitHub CLI 已登入且 repository permission 為 ADMIN；GitHub connector存在 Draft PR create capability，CLI 可讀 Actions。若執行時 connector/CLI 或 push 權限不可用，完成 branch/commits 後停止，由使用者手動建立 Draft PR。

## 8. CI 與 Disposable DB Preflight

`.github/workflows/ci.yml` workflow 名稱 `CI`，trigger 為所有 pull request 及 push to `main`。單一 `verify` job 使用 Ubuntu、Node 22、`npm ci`、npm cache（`web/package-lock.json`），PostgreSQL 17 service，依序執行 Prisma validate/generate/deploy、lint、typecheck、unit tests、DB tests、schema diff、build；沒有額外 secrets、artifact upload 或 branch-protection required-check 關聯。

2026-08-01 的 `main@45af2d4` CI 證據：install、Prisma deploy、lint、typecheck、unit tests成功；`test:db` 因 workflow port 5432 與 repository DB safety guard 固定 port 55432 不一致而失敗，schema diff/build因此 skipped。後續核准的CI alignment已在worktree將host mapping與兩個DB URL改為55432，並將database改為符合guard命名contract的`erp_p4_4_ci_test_20260801_01`；guard未修改。

月份相依測試已用Vitest只固定`Date`至Asia/Taipei `2026-07-15`，並由`afterEach`恢復real timers；production business date、sequence與service均未修改。Targeted全新`erp_p4_4_preflight_test_20260801_05`完成12/12 migrations與19/19 tests；完整全新`erp_p4_4_preflight_closeout_20260801_01`完成12/12 migrations、lint、typecheck、32 files／302 unit tests、15 files／149 DB tests、schema diff無差異及37頁production build。兩個database與tmpfs containers均已清理，guard未弱化。

本機 Docker Desktop/Engine 可用（PostgreSQL 17 image）；`compose.p1-test.yaml` 定義 dedicated role、host port 55432 與隔離 test container。preflight 時該 container 已停止且 55432 未監聽，未建立測試 database。Safety guard要求 local host、55432、dedicated role、符合日期/unique suffix的 disposable database、`DATABASE_URL` 與 `P1_TEST_DATABASE_URL`同 target、runtime identity一致及資料庫乾淨；不符合即 fail closed且不自動清除。

GitHub `main` 與 repository default `master` 均回報未啟用 branch protection，因此目前無 required checks；ADMIN permission與HTTPS push URL表示可直接 push feature branch，但不以測試 push驗證。

## 9. Fail-fast

必須停止：新增/修改 schema或migration；修改RBAC/session/authorization；實作新後端管理角色；改API payload/DTO/business rule；改Customer/Item/Pricing domain；改pricing有效期間/GiST exclusion/overlap/FK/lookup/validity；改company switching；進入Sales Orders或Delivery Notes detail/print/void；處理P5；fresh migration失敗；只能使用不安全DB；正式規格矛盾；必須引入大型framework；dependency有重大安全風險；Blueprint metadata/hash不符；Git有未知差異。

可在切片自行處理：P4.4小型UI、ARIA、responsive、共用元件最小bug、必要tests、文件同步與不改behavior的presentation refactor。

## 10. Preflight Stop Point

本文件核准P4.4 orchestration plan並完成preflight gates，不代表P4.4a已開始。正式執行仍須依§7從最新`origin/main`建立feature branch，重新通過Git／Blueprint gate，且不得直接在`main`開始UI實作。
