# P3.2d1 Delivery-note API 工程驗證

執行日期：2026-07-27
狀態：P3.2d1 API 工程驗證完成；P3.2d2 UI 尚未開始

## 1. 起始狀態與範圍

- 正式 migration chain 為 0001～0010，本輪未修改 Prisma schema 或任何 migration，也未建立 0011。
- 本機 `erp` 只做 migration、schema diff 與 health 唯讀檢查，沒有執行 API／DB tests 或 mutation。
- `docs/INVENTORY_PRODUCTION_BLUEPRINT.md` 是既有、未追蹤且獨立於 P3.2d1 的 P4 規劃文件；本輪未修改。
- 本輪沒有建立 Delivery-note UI、PDF、列印、實際送貨日、回收確認、`SHIPPED`／`RECEIVABLE_CREATED` workflow、應收、庫存或生產功能。

## 2. API routes

- `POST /api/sales-orders/{id}/delivery-note`
- `GET /api/sales-orders/{id}/delivery-note`
- `POST /api/sales-orders/{id}/delivery-note/rebuild`
- `GET /api/delivery-notes`
- `GET /api/delivery-notes/{id}`
- `POST /api/delivery-notes/{id}/void`

Route 只負責 request boundary：session/context、strict validation、idempotency header、correlation ID、正式 service dispatch、typed error mapping 與 serialization。Route 不重複 business rule、不接受 client snapshot／amount／number／date，也不直接執行 Prisma mutation。

## 3. DTO 與 strict validation

- Create body：`expectedRevisionNo`。
- Rebuild body：`expectedRevisionNo`、trim 後非空的 `reason`。
- ADMIN void body：trim 後非空的 `reason`。
- 未宣告欄位一律拒絕；company、actor、status、number、date、snapshot、amount 注入會回 validation error。
- List 支援正式 status、order、number、date、customer keyword 與有上限的 page／pageSize。
- Current query 在沒有非作廢銷貨單時回傳 HTTP 200 與 `deliveryNote: null`。

## 4. Authentication、RBAC 與 company scope

- 每個 route 由 server-side session 建立 actor、session、selected company、roles 與 authorized-company context。
- `delivery_notes.read`：ADMIN、ORDER_ENTRY，限授權公司。
- `delivery_notes.manage`：ADMIN、ORDER_ENTRY，限授權公司。
- `delivery_notes.admin_void`：只限 ADMIN，且仍須具 selected-company scope。
- Client 傳入的 companyId 不作為授權來源；跨公司 order／delivery note 不可讀取或操作。

## 5. Idempotency、correlation ID 與錯誤

- 所有 POST 要求非空且長度受限的 `Idempotency-Key`。
- Create、rebuild、ADMIN void 的相同 canonical payload replay 回原 result；不同 payload 由既有 service 回 conflict。
- Response body 與 `x-request-id` 都回傳 correlation ID。
- Authentication、authorization、not found、validation、conflict、invariant 與 internal error 使用一致 envelope。
- Internal error 不回傳 SQL、Prisma error、stack trace、密碼或 session token。

## 6. Serialization

- Decimal 不轉為 JavaScript `Number`，使用固定精度十進位字串。
- `quantity` 為四位小數字串，`unitPrice` 為五位小數字串，整數金額為十進位字串。
- PostgreSQL `date` 使用 `YYYY-MM-DD`；timestamp 使用 ISO-8601 UTC。
- Detail 保留 header／line snapshots、replacement references 與作廢資訊；list 提供穩定 summary DTO。

## 7. Unit 與 API workflow

- Unit：18 files／109 tests，全數通過。
- 真實 PostgreSQL Delivery-note workflow：1 file／19 tests，全數通過。
- 覆蓋 create、replay、current／detail／list、authentication、strict body rejection、company isolation、concurrent create、rebuild／replay、ADMIN void／replay、ORDER_ENTRY void rejection、audit、idempotency 與 rollback。

第一次獨立 API workflow 使用 `erp_p3_2d1_test_run_20260727_01`，由空資料庫套用 0001～0010，migration up to date、schema diff 0，19 tests 全數通過。

## 8. 正式 DB runner 問題與修正

初始正式 `npm run test:db` 在乾淨 `_02`、`_03`、`_04` DB 分別於 pricing／freight fixtures 發生 `ADMIN`／`ORDER_ENTRY` 的 `roles(code)` unique conflict。Delivery-note API、service、migration 與 constraint assertion 沒有失敗。

根因是多個 DB test files 共用同一 disposable DB，Vitest 又平行執行 files；各 fixture 同時初始化固定共享角色，Prisma upsert 可能在不同 client 間產生 SELECT／INSERT 競態。`roles(code)` unique constraint 正確，沒有放寬；fixture business logic、production role bootstrap、Prisma schema 與 migration 均未修改。

正式 `test:db` 改為：

```text
vitest run tests/db --maxWorkers=1
```

此設定只影響 DB suite。Unit suite 維持原平行策略。序列化不是 production 限制；未來若每個 test file 使用獨立 DB／schema，可重新評估 file parallelism。

## 9. Fresh DB 與完整 Gate

- `_05`：起始不存在且 public schema 空白；0001～0010 deploy 成功、status up to date、schema diff 0。第一次正式序列 `test:db`：13 files／124 tests，全部通過，0 skipped，29.32 秒。
- `_06`：起始不存在且 public schema 空白；0001～0010 deploy 成功、status up to date、schema diff 0。最終品質 Gate 第二次正式 `test:db`：13 files／124 tests，全部通過，0 skipped，24.78 秒。
- Lint：通過。
- Typecheck：通過。
- Production build：通過。
- Prisma validate：通過。
- Prisma generate：通過，Prisma Client 7.8.0。
- `git diff --check`：通過。

測試過程出現 `pg` 對「client 正執行 query 時再次呼叫 query」的 deprecation warning；本輪沒有測試失敗，亦沒有以 retry 或忽略 unique violation 規避。此 warning 應在未來升級至 pg 9 前另案盤點。

## 10. 本機 erp 唯讀 Gate

- Datasource：`localhost:5432/erp?schema=public`。
- Migration：0001～0010 up to date。
- Prisma schema diff：`No difference detected`。
- `/api/health/live`：HTTP 200。
- `/api/health/ready`：HTTP 200。
- `/api/health/worker`：HTTP 200，worker heartbeat ready。
- 未向本機 `erp` 寫入測試資料。

## 11. 結論

P3.2d1 Delivery-note API 已完成工程驗證，具備提交條件。P3.2 整體尚未完成，因 P3.2d2 UI 與後續整合驗收仍未執行。下一步若取得獨立授權，可規劃 P3.2d2 UI；不得由本文件視為已授權開始。
