# Project Instructions

## Language

- 程式碼、資料表及 API 名稱使用英文。
- 使用者介面、錯誤訊息及文件使用繁體中文。

## Specification Priority

本專案文件內容發生衝突時，必須依照以下優先順序判斷：

1. `docs/DECISIONS.md`
2. `docs/business-rules.md`
3. `docs/DATABASE_DESIGN.md`
4. `docs/TECHNICAL_ARCHITECTURE.md`
5. `docs/IMPLEMENTATION_PLAN.md`
6. 原始 Word／Excel 規格文件
7. `docs/OPEN_QUESTIONS.md`
8. 其他 ERP MVP、原型、草稿或舊版文件

規則：

- 高優先級文件已明確決議的事項，不得因低優先級文件內容不同而重新列為待確認。
- `OPEN_QUESTIONS.md` 只記錄真正尚未決議的問題，不是正式規格來源。
- 若發現文件衝突，先查閱 `docs/DECISIONS.md`。
- 若 `docs/DECISIONS.md` 沒有答案，才可寫入 `docs/OPEN_QUESTIONS.md`。
- 不得自行採用其他 ERP MVP 的庫存、批號、分批出貨或會計規則。
- 未經使用者確認，不得建立基於未決事項的不可逆 migration。
- 新決議應先更新 `docs/DECISIONS.md`，再同步更新其他設計文件與程式碼。

## Business Rules

- 不得自行修改已確認的業務規則。
- 不得以刪除交易資料代替作廢或沖銷。
- 所有跨單據操作必須使用資料庫 transaction。
- 所有重要狀態異動必須保留 audit log。

## Development Rules

- 每次只實作指定模組。
- 修改資料庫結構時必須建立 migration。
- 所有核心規則必須有測試。
- 完成任務前必須執行 lint、type check、unit test 與 build。

## Protected Blueprint

- `docs/INVENTORY_PRODUCTION_BLUEPRINT.md` 是受保護的未追蹤 Blueprint；只允許檢查 Git status、檔案大小、modified time 與 SHA-256。
- 核准 metadata：20,880 bytes；modified time `2026-07-27 11:03:17`；SHA-256 `930121B91B470DFF25596AE50309060155CF7C0F4B78251184EB13B493AF95B7`。
- 禁止開啟、搜尋、讀取、引用、修改、移動、刪除、stage 或 commit 該檔案；metadata 或 hash 不符時立即停止。

## Database Safety

- 禁止對 production database 執行測試，亦禁止在 development database 執行 destructive testing。
- DB tests 必須使用新建、名稱符合 repository safety guard 的 disposable database；執行前明確驗證 `DATABASE_URL`、host、port、role、database name 與 runtime identity。
- safety guard、fresh migration 或 schema diff 失敗時立即停止；不得自動清空、重用來源不明或已有資料的 database。
- 不得在輸出、文件或 commit 中暴露 database password。

## Git Safety

- 禁止 `git add .`、`git add -A`、`git add docs` 與 `git add web`；只使用經審查的 explicit paths。
- commit 前必須檢查 `git diff --cached --check`、cached diff 與 staged file list。
- 不直接 merge、不 force push；feature work 不直接在 `main` 執行。

## Dependency Safety

- 禁止擅自執行 `npm audit fix` 或 `npm audit fix --force`。
- 新 dependency 必須是完成核准範圍所需的最小選擇，並記錄理由與風險。
- presentation work 不得引入大型 UI framework。

## Scope Safety

- 未經明確核准，不得修改 schema、migration、RBAC、session、authorization、API、transaction、audit、idempotency、formal print、P4.5、P4.6 或 P5。
- P4.4 只處理 Masters／Admin 的 presentation、page contract、accessibility、responsive 與既有共用元件採用，不得改 route、URL/query/form/payload/DTO contract、validation schema、permission、business rule 或 state machine。

## Quality Gates

- 每個核准切片必須依序完成 scope review、lint、typecheck、full unit regression、production build、desktop／360px、keyboard／focus、validation 與 precise staged diff review。
- 任一 gate 失敗不得進入下一切片或建立該切片 commit。

## Fail-fast Conditions

遇到下列情況必須停止並請使用者裁決：需要新增或修改 schema／migration；需要修改 RBAC、session、authorization、API payload、DTO、business rule、Customer／Item／Pricing domain logic、pricing 有效期間／排他邏輯或 company switching；需要實作 `SYSTEM_ADMIN`／`COMPANY_ADMIN` 後端角色；進入 Sales Orders、Delivery Notes detail／print／void、P5；fresh migration 失敗；測試只能使用不安全 database；正式規格互相矛盾；必須引入大型 framework 或有重大安全風險的新 dependency；受保護 Blueprint metadata/hash 不符；Git 出現未知差異。

P4.4 範圍內的小型 UI、ARIA、responsive、既有共用元件最小 bug、測試補強、文件同步及不改 behavior 的 presentation refactor 可在對應切片自行處理。
