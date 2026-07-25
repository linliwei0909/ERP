# P2.5 運費規則驗證紀錄

執行日期：2026-07-25  
規格基線：`DECISIONS.md` V0.8、DEC-055  
執行範圍：送貨地點運費規則、有效規則查詢與唯讀試算

## 1. 結論

P2.5 已完成並通過 unit、DB/workflow、migration、Prisma schema、lint、typecheck 與 production build 驗證。`0007_p2_freight_rules` 已先在全新 disposable database 由 0001 起完整驗證，再套用至本機 `erp` 開發資料庫。

本次未建立任何訂單、銷貨單、運費快照、客戶層級 fallback、路線、承運商、區域／重量／距離計價、匯入、庫存、倉庫、批號、採購、生產或會計功能；未修改 0001～0006 migration。

## 2. 正式資料模型

### `freight_mode`

- `NO_CHARGE`
- `QUANTITY_BASED`
- `FIXED_PER_LOCATION`

### `freight_rules`

- PostgreSQL DB-generated UUID。
- 維度為 `company_id`, `customer_id`, `delivery_location_id` 與有效期間。
- `unit_freight`, `fixed_freight` 使用 `numeric(18,0)` 新臺幣元，非負且允許零。
- `NO_CHARGE`：兩金額皆為 null。
- `QUANTITY_BASED`：只有 `unit_freight` 有值。
- `FIXED_PER_LOCATION`：只有 `fixed_freight` 有值。
- 有效期間為 `[valid_from, valid_to)`；`valid_to` 可為 null。
- status 為 `ACTIVE`／`INACTIVE`。
- 建立／更新 actor 與 `timestamptz(3)` 時間。

資料庫限制：

- `freight_rules_amount_nonnegative_check`
- `freight_rules_mode_amount_check`
- `freight_rules_valid_period_check`
- `freight_rules_period_exclusion`
- `(customer_id, company_id)` composite FK 至 `customer_companies`。
- `(delivery_location_id, customer_id)` composite FK 至 `delivery_locations`。
- actor FK 至 `users`。
- 所有 FK 使用 `ON DELETE RESTRICT ON UPDATE RESTRICT`。

GiST exclusion 以 company、customer、delivery location 及 `daterange(..., '[)')` 禁止所有保留紀錄期間重疊。INACTIVE 紀錄仍參與排除；相鄰期間允許，open-ended 期間阻擋後續重疊。

## 3. Migration

正式 migration：`0007_p2_freight_rules`

SQL 包含：

- `CREATE EXTENSION IF NOT EXISTS btree_gist`。
- `freight_mode` enum。
- `freight_rules`、UUID default、`numeric(18,0)` 與 `timestamptz(3)`。
- 模式／金額互斥、非負金額及有效期間 CHECK。
- 全歷程 GiST exclusion constraint。
- 兩組 composite FK、actor FK 及歷程／查詢索引。

全新 disposable database `erp_p2_5_final` 驗證：

- 0001～0007 依序套用成功。
- `prisma migrate status`：up to date。
- `prisma migrate diff`：`No difference detected.`。
- DB/workflow tests：8 files、81 tests 全部通過。
- PostgreSQL catalog 已確認 enum、CHECK、exclusion、composite FK 與 index。
- 未建立任何禁止的交易或舊 ERP 資料表。

本機 `erp` 開發資料庫：

- 0007 套用成功且 `finished_at` 有值、`rolled_back_at` 為空。
- migration status up to date。
- schema diff 為零。
- `freight_rules` 套用後筆數為 0，未變更既有主檔資料。
- P1 已知的失敗 0003 維持 rolled back，另有成功 0003；不存在 unresolved failed migration。

0007 為 additive migration。若未使用前需要撤回，必須先確認表內仍無資料並走受控資料庫程序；一旦已有正式資料，不回改 0007，改以新的 forward-fix migration 修正。

## 4. Validation 與 decimal-safe 試算

Validation 支援：

- 正式 freight mode。
- 最多 18 位且非負的整數運費，並正規化前置零。
- 非負 `numeric(18,4)` quantity。
- 真實 `YYYY-MM-DD` 日期。
- 半開期間與模式／金額互斥。
- 明確 `effectiveDate` 與 quantity 查詢輸入。

試算不使用 JavaScript 浮點數直接相乘：

1. quantity 解析為 10,000 倍整數。
2. 與整數元 `unit_freight` 以 BigInt 相乘。
3. 依餘數執行 half-up 四捨五入至元。

結果：

- `NO_CHARGE`：0。
- `QUANTITY_BASED`：quantity × unit freight，四捨五入至元。
- `FIXED_PER_LOCATION`：固定運費。

## 5. Service、API 與 UI

Service：

- 建立運費規則。
- 修改未來規則的模式／金額／期間／狀態。
- 已生效規則只允許調整期間或狀態。
- 啟用／停用。
- 查詢規則歷程與明細。
- 依 company、customer、delivery location、effective date、quantity 查詢及試算。

查詢依序驗證：

1. permission 與 company scope。
2. customer 為 ACTIVE。
3. `customer_companies` 關係為 ACTIVE。
4. delivery location 為 ACTIVE 且屬於該 customer。
5. 規則於 effective date 為 ACTIVE 且期間有效。

任一必要規則不存在時回傳 `FREIGHT_RULE_NOT_FOUND`；不得自動免運、套用零或建立新規則。

API：

- `GET/POST /api/admin/freight-rules`
- `GET/PATCH /api/admin/freight-rules/{id}`
- `GET /api/freight/quote`

UI：

- `/admin/freight-rules`
- `/admin/freight-rules/{id}`
- `/freight/quote`

UI 依 mode 只顯示適用金額欄位，且不包含任何禁止模組或交易快照功能。一般 API/UI 不提供 DELETE。

## 6. 權限、Audit 與 Idempotency

- ADMIN 具有 `freight.read` 與 `freight.manage`。
- ORDER_ENTRY 只有 `freight.read`。
- ADMIN 歷程 API 與管理頁額外執行 ADMIN 驗證。
- 所有 company ID 均由後端重新驗證 scope。
- 所有寫入使用 transaction、audit、idempotency、correlation ID 與一致錯誤格式。
- 建立、模式、金額、期間、啟用／停用與重要修改均保存前後值。
- Audit 寫入失敗時主要資料完整 rollback。

## 7. 測試結果

| 檢查 | 結果 |
| --- | --- |
| `npm run prisma:validate` | 通過 |
| `npm run prisma:generate` | 通過 |
| `npm run lint` | 通過 |
| `npm run typecheck` | 通過 |
| `npm run test` | 13 files、61 tests 通過 |
| `npm run test:db` | 8 files、81 tests 通過 |
| `npm run build` | 通過 |
| 全新 DB migrate deploy | 0001～0007 通過 |
| 全新 DB migrate status | up to date |
| 全新 DB schema diff | No difference detected |
| `erp` migrate deploy | 0007 成功 |
| `erp` migrate status | up to date |
| `erp` schema diff | No difference detected |

測試涵蓋：

- 三種模式的金額互斥、零元與負值拒絕。
- 非法、相鄰、重疊與 open-ended 期間；INACTIVE 仍阻擋重疊。
- 客戶公司與送貨地點客戶 composite FK。
- 無有效 customer company 關係不得建立。
- 三種模式試算及 half-up 四捨五入。
- effective date 邊界與 `valid_to` 排除。
- 找不到規則不套用 fallback。
- 停用客戶、客戶公司關係、送貨地點或規則後不可查詢。
- ADMIN／ORDER_ENTRY、company scope 與偽造 company ID。
- idempotency replay、audit 同 transaction 及失敗 rollback。
- 無 DELETE、完整 migration chain、catalog 與禁止資料表。

## 8. 未完成與禁止範圍

- 沒有新增會阻塞 P2.5 的 Open Question。
- P2.5 不保存交易運費快照，也不處理後續交易狀態。
- P2.5 不提供 fallback、路線、承運商、區域、重量或距離計價。
- P2.5 不處理 Ragic 匯入或其他主檔整合驗收。
- 未經授權不得開始 P2.6 或其他模組。

## 9. 完成判定

P2.5 已完成，具備提交及進入 P2.6 規劃／實作審查的技術條件；是否開始 P2.6 仍須使用者另行核准。
