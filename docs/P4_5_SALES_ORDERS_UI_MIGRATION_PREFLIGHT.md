# P4.5 Sales Orders UI Migration Preflight

文件狀態：Ready for Implementation Authorization

版本：V1.0

版本日期：2026-08-02

## 1. 目的與停止點

本文件完成 P4.5 銷售訂單 UI 重整的唯讀前置盤點與基線驗證。P4.5 實作尚未開始；本次不建立 feature branch、不修改 production code、測試、API、schema、migration、RBAC、session、authorization、business rule、transaction、audit、idempotency 或受保護 Blueprint。

正式實作前仍須取得明確授權，從最新 `origin/main` 建立 `codex/` feature branch，重新通過 Git／Blueprint gate，且不得直接在 `main` 實作。

## 2. Git 與 Blueprint 基線

- Branch：`main`
- HEAD／`origin/main`：`0bab47236a048be6df42a2012866cddebff89a90`
- ahead／behind：`0 / 0`
- staged：空
- 工作樹差異只有核准的未追蹤 `docs/INVENTORY_PRODUCTION_BLUEPRINT.md`。
- 受保護 Blueprint 只檢查 metadata 與 hash；20,880 bytes、modified time `2026-07-27 11:03:17`、SHA-256 `930121B91B470DFF25596AE50309060155CF7C0F4B78251184EB13B493AF95B7` 均相符。未開啟、搜尋、讀取、引用或修改內容。

## 3. 正式規格結論

依 `DECISIONS.md`、`business-rules.md`、`DATABASE_DESIGN.md`、`TECHNICAL_ARCHITECTURE.md`、`IMPLEMENTATION_PLAN.md` 與 P4 UI／UX Blueprint 的優先序檢查，P4.5 可在現有 Sales Order domain 與 API 契約上執行 presentation migration。

固定邊界如下：

- 保留 `/sales-orders`、`/sales-orders/new`、`/sales-orders/[id]` 三個 route。
- 保留 `GET/POST /api/sales-orders`、`GET/PATCH /api/sales-orders/{id}`、confirm、revision、void、preview-pricing、preview-freight，以及既有 Delivery Note create／rebuild endpoints。
- 保留目前公司由 authenticated session 決定、`ADMIN`／`ORDER_ENTRY` 現行 permission、server authorization 與 company scope。
- 保留 `DRAFT`、`CONFIRMED`、`DELIVERY_CREATED`、`SHIPPED`、`COMPLETED`、`VOIDED` 狀態與既有 state machine；UI 不創造 transition 或 capability。
- 保留草稿、確認、修訂、作廢、建立／重建銷貨單的 transaction、audit、idempotency、lock order 與 snapshot 契約。
- 保留數量、價格、half-up 金額、人工價格理由、運費、未稅標示及 confirmation snapshot 規則。
- 不加入追加訂單、分批出貨、備註、預計送貨日、客戶採購單號、外部參考號、稅額、正式列印或 P5 功能。

`OPEN_QUESTIONS.md` 沒有阻塞 P4.5 的 Sales Order 業務未決事項。OQ-053／OQ-054 的 company context 與 page contract 遷移仍須逐 route 保守驗證；Sales Orders 現況沒有 local `companyId` selector，因此應維持 active company，不新增 URL company target。

## 4. Route Inventory 與現況落差

| Route／元件 | 現行能力 | 主要 presentation 落差 | P4.5 採用方向 |
| --- | --- | --- | --- |
| `/sales-orders` | 搜尋、狀態篩選、固定每頁 20 筆 | P3.1 階段文字、page-local `main`、無表頭 row grid、沒有分頁控制、raw controls、empty state 不分情境、錯誤一律 redirect login | `PageHeader`、`Field`、`Input`、`Select`、`Button`、`Table`、`StatusBadge`、`Pagination`、`EmptyState`；保留 query names 與固定排序 |
| `/sales-orders/new` | 載入有效客戶、聯絡人、送貨地點與可銷售品項，建立草稿 | page-local layout；長 native select；無 section/page contract；提交錯誤無欄位定位 | `PageHeader`、`Section`、form feedback primitives、responsive line table、pending/busy contract |
| `/sales-orders/[id]` | 查單、編輯草稿、確認、修訂、作廢、建立／重建銷貨單、歷史銷貨單連結 | raw enum、raw JSON snapshot、動作分散、catch 後 redirect list、沒有正式 confirmation、缺 capability reason 與安全錯誤恢復 | 中文狀態、summary/sections、集中 actions、關聯連結、`ConfirmDialog`、`Alert`／`ErrorSummary`；不顯示 raw JSON |
| `sales-order-editor.tsx` | create/update/confirm/revision/void client workflow | 無表頭明細 grid、placeholder 承擔欄名、無即時計價／運費呈現、無 field/row error mapping、`window.prompt` 作廢、無 busy guard | 有表頭明細子表、永遠可見 label、金額摘要、可及的新增／移除列、正式 dialog、保留輸入與錯誤焦點 |
| `delivery-note-order-actions.tsx` | 依 order status/revision/current note 決定 create/rebuild | raw styling、重建原因只有單一訊息、成功後立即 push、permission/capability 說明有限 | 共用 section/form/dialog/feedback；保留單一 server-side create/rebuild command 與既有 client adapter |

## 5. API／Presentation 邊界判定

目前清單 query 只支援 `search`、`status`、`page`、`pageSize`，server 固定以 `orderDate desc`、`orderNumber desc` 排序。P4.5 可顯示固定排序語意，但不得在純 UI 切片新增可變 `sort`、日期篩選、delivery note filter、created-by filter 或任意欄位查詢。若產品要求上述功能，必須另立 API presentation contract 任務並取得授權。

P4 Blueprint 要求品項使用 searchable combobox，但 P4.3 現有共用元件沒有 Combobox。正式實作可在不新增 dependency、不改 payload 的前提下，建立 repository-native、可鍵盤操作且具 ARIA contract 的最小共用 Combobox；若無法在既有 contract 內完成，必須停止並另案處理，不得退回超長 select 作為唯一正式方案。

現有 API 回傳 Zod issues，但 client 只顯示單一 message。P4.5 可以新增安全的 presentation error adapter，將既有 error details 對應至 field／line，不得改 API payload、validation schema、錯誤狀態碼或 server domain message contract。

## 6. 建議工程切片

### P4.5a：清單與查詢

- 遷移 `/sales-orders` 至 page contract 與共用 data-display primitives。
- 保留 `search`、`status`、`page` 與固定 page size；建立 query-preserving href 與正式 pagination。
- 中文狀態、未稅金額、normal／empty／filtered-empty／safe error、desktop／360px。
- 不新增 sort 或 filter API。

### P4.5b：草稿編輯器與新增流程

- 遷移 `/sales-orders/new` 與 `SalesOrderEditor` 的 editable presentation。
- 依單頭、客戶／送貨、付款、明細、金額摘要分區。
- 建立有表頭且 responsive 的明細子表、searchable item selection、pending/busy、field/row error 與 focus contract。
- 保留所有 route、method、payload、decimal 與 validation contract。

### P4.5c：明細、狀態動作與銷貨單關聯

- 遷移 `/sales-orders/[id]` 的 read-only summary、中文狀態、版次、金額與關聯銷貨單。
- 集中確認、修訂、作廢、建立／重建銷貨單 capability actions。
- 使用正式 confirmation dialog；作廢／重建理由就近驗證；移除 raw JSON presentation。
- 保留 create/rebuild 原子 command、idempotency 與 permission gate。

### P4.5d：Closure

- 跨切片 static contract、完整 unit regression、production build、fresh disposable DB workflow、schema diff、desktop／360px browser matrix、keyboard/focus、validation 與 precise staged diff review。
- 只做 closure tests、文件與必要的小型 presentation correction，不加入新功能。

每個產品切片使用獨立 commit；任一 gate 失敗不得進入下一切片。

## 7. 測試與品質 Gate

每切片依序執行：scope/Git/Blueprint、targeted unit/DOM tests、lint、typecheck、完整 unit regression、production build、desktop／360px、keyboard/focus、validation、precise staged diff review、獨立 commit。

建議新增或補強：

- 清單 query preservation、pagination、status label、empty/error 與 responsive DOM contract。
- editor create/update payload identity、line add/remove、customer-dependent location/contact、manual price reason、field/row errors、busy recovery。
- confirm/revision/void dialogs、focus trap/restore、Escape、duplicate-submit guard。
- delivery note create/rebuild capability matrix、reason validation、HTTP/JSON/fetch exception recovery。
- raw enum、P3 phase label、raw snapshot JSON、`window.prompt`／`window.confirm` 的 P4.5 static closure scan。
- 既有 Sales Order unit 與 disposable DB workflow regression；不得使用 development 或 production database。

## 8. 目前非 DB 品質基線

| Gate | 結果 |
| --- | --- |
| lint | PASS |
| typecheck | PASS；Next route types generated |
| unit | PASS；41 files／339 tests |
| production build | PASS；37 pages generated |

Build 保留既有 Delivery Note font／renderer NFT tracing warning；它不由 Sales Orders UI 產生，P4.5 不應順手修改。

本次沒有執行 DB tests、fresh migration、schema diff 或 browser workflow。這些屬正式 implementation slice／closure gate；開始前必須使用全新、guard-compliant disposable database，並重新驗證 host、port、role、database name、兩個 URL 與 runtime identity。

## 9. Fail-fast

遇到下列情況立即停止並請使用者裁決：

- 需要修改 schema、migration、RBAC、session、authorization、API payload、DTO、validation schema、business rule、state machine、Customer／Item／Pricing domain logic、company switching、transaction、audit 或 idempotency。
- 需要新增可變排序或目前 query schema 不支援的 filter。
- 需要建立追加訂單、分批出貨、Delivery Note detail／print／void、P5 或不存在的 domain 欄位。
- 需要大型 framework、重大風險 dependency，或 searchable combobox 無法在現有 presentation boundary 內完成。
- 正式規格互相矛盾、fresh migration/schema diff 失敗、只能使用不安全 database、Blueprint metadata/hash 不符或 Git 出現未知差異。

## 10. Preflight 結論

`READY FOR P4.5 IMPLEMENTATION AUTHORIZATION`

三個既有 Sales Orders routes、後端 contract、P4.2 App Shell 與 P4.3 Design System 均可作為遷移基線。開始條件是使用者明確授權 P4.5 實作、建立 feature branch、重新通過 Git／Blueprint gate，並接受「既有 query 固定排序；新 sort/filter 另案」的範圍邊界。
