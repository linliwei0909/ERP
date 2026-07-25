# P2.4 價格主檔驗證紀錄

執行日期：2026-07-25  
規格基線：`DECISIONS.md` V0.7、DEC-054  
執行範圍：價格表、價格明細、客戶價格表指派及有效價格查詢

## 1. 結論

P2.4 已完成並通過 unit、DB/workflow、migration、Prisma schema、lint、typecheck 與 production build 驗證。`0006_p2_pricing_master` 已先在全新 disposable database 由 0001 起完整驗證，再套用至本機 `erp` 開發資料庫。

本次未建立運費、訂單、人工交易價格、價格快照、匯入、庫存、倉庫、批號、採購、生產或會計功能；未修改 0001～0005 migration。

## 2. 正式資料模型

### `price_lists`

- PostgreSQL DB-generated UUID。
- 單一 `company_id`；code 經 NFKC、trim、uppercase 後保存 `normalized_code`。
- `(company_id, normalized_code)` unique。
- `(id, company_id)` supporting unique，供客戶指派 composite FK 使用。
- name 必填；status 為 `ACTIVE`／`INACTIVE`。
- 建立／更新 actor 與 `timestamptz(3)` 時間。
- 不包含 `exclusive_customer_id` 或 `list_type`。

### `item_prices`

- `price_list_id`、`item_id`、`unit_price numeric(18,5)`、`valid_from`、nullable `valid_to`、status 及 actor／時間。
- `unit_price >= 0`，允許零價。
- 有效期間採 `[valid_from, valid_to)`；`valid_to` 非空時必須晚於 `valid_from`。
- `item_prices_period_exclusion` 以 GiST 禁止同價格表、同品項的所有保留期間重疊，不因 status 放寬。

### `customer_price_list_assignments`

- `customer_id`、`company_id`、`price_list_id`、有效期間、status 及 actor／時間。
- `(customer_id, company_id)` composite FK 指向 `customer_companies`。
- `(price_list_id, company_id)` composite FK 指向 `price_lists`。
- `price_assignments_period_exclusion` 以 GiST 禁止同客戶、同公司的所有保留期間重疊，不因 status 放寬。

三張表的 FK 均為 `ON DELETE RESTRICT ON UPDATE RESTRICT`；一般 API/UI 不提供 hard delete。

## 3. Migration

正式 migration：`0006_p2_pricing_master`

SQL 包含：

- `btree_gist` extension。
- 三張正式價格主檔及 PostgreSQL UUID default。
- required text、非負單價與有效期間 CHECK。
- 價格表公司內 normalized code unique、supporting unique 及查詢索引。
- 兩個全歷程 GiST exclusion constraint。
- 客戶公司及價格表公司的 composite FK。
- actor、公司、客戶、品項與價格表的 RESTRICT FK。

全新 disposable database `erp_p2_4_final` 驗證結果：

- 0001～0006 依序套用成功。
- `prisma migrate status`：up to date。
- `prisma migrate diff`：`No difference detected.`。
- DB/workflow tests：7 files、71 tests 全部通過。
- PostgreSQL catalog 已確認 CHECK、exclusion、composite FK、unique 及 lookup index。
- 未建立運費、訂單、庫存、倉庫、批號、採購或會計資料表。

本機 `erp` 開發資料庫結果：

- 0006 套用成功且 `finished_at` 有值、`rolled_back_at` 為空。
- migration status up to date。
- schema diff 為零。
- 目前 public schema 共 22 張表：21 張 application tables 加 `_prisma_migrations`。
- 新增三表套用後筆數均為 0，未變更既有主檔資料。
- migration history 中 P1 已知的失敗 0003 已標記 rolled back，另有成功 0003；不存在 unresolved failed migration。

0006 為 additive migration。若尚未使用前需要撤回，必須先確認三表仍無資料並走受控資料庫操作；一旦已有正式資料，不回改 0006，改以新的 forward-fix migration 修正。

## 4. Registry、Service 與查價

Validation 支援：

- 價格表 code normalization。
- 最多五位小數且非負的未稅單價。
- 真實 `YYYY-MM-DD` 日期解析。
- 半開期間與合法日期順序。
- 明確 `effectiveDate` 查價輸入。

Service 支援：

- 價格表清單、明細、建立、修改、停用與重新啟用。
- 新增不可覆寫單價歷程的品項價格版本。
- 只調整既有價格版本的期間或狀態。
- 新增及調整客戶價格表指派期間。
- 依 company、customer、item、effective date 查詢有效正式價格。

查價依序驗證：

1. 後端 permission 與 company scope。
2. 有效客戶及有效 `customer_companies` 關係。
3. 有效且可銷售的 `items` 與 `item_companies` 關係。
4. 指定日期有效且價格表為 ACTIVE 的客戶指派。
5. 指定日期有效且為 ACTIVE 的品項價格。

任一必要價格條件不成立時回傳一致的 `PRICE_NOT_FOUND`。P2.4 不套用零價預設、不建立人工交易價，也不寫入交易快照。

## 5. API、UI、權限與稽核

ADMIN API：

- `GET/POST /api/admin/price-lists`
- `GET/PATCH /api/admin/price-lists/{id}`
- `POST /api/admin/price-lists/{id}/prices`
- `PATCH /api/admin/item-prices/{id}`
- `POST /api/admin/customer-price-list-assignments`
- `PATCH /api/admin/customer-price-list-assignments/{id}`

唯讀查價 API：

- `GET /api/pricing/lookup`

UI：

- `/admin/pricing`：ADMIN 價格表清單與新增。
- `/admin/pricing/{id}`：ADMIN 價格表、價格版本與客戶指派管理。
- `/pricing/lookup`：ADMIN／ORDER_ENTRY 依目前授權公司及明確日期唯讀查價。

所有寫入均由後端驗證 ADMIN 及 company scope，並使用 transaction、audit、idempotency、correlation ID 與一致錯誤格式。ORDER_ENTRY 沒有寫入權限；client 傳入的 company ID 必須通過 server-side scope 驗證。重要建立、修改、啟用／停用及期間調整與 audit log 位於同一 transaction。

## 6. 測試結果

| 檢查 | 結果 |
| --- | --- |
| `npm run prisma:validate` | 通過 |
| `npm run prisma:generate` | 通過 |
| `npm run lint` | 通過 |
| `npm run typecheck` | 通過 |
| `npm run test` | 12 files、55 tests 通過 |
| `npm run test:db` | 7 files、71 tests 通過 |
| `npm run build` | 通過 |
| 全新 DB migrate deploy | 0001～0006 通過 |
| 全新 DB migrate status | up to date |
| 全新 DB schema diff | No difference detected |
| `erp` migrate deploy | 0006 成功 |
| `erp` migrate status | up to date |
| `erp` schema diff | No difference detected |

測試涵蓋：

- 公司內 normalized code 唯一及跨公司可重複。
- 五位小數、零價與負價拒絕。
- 非法、相鄰、重疊及 open-ended 半開期間；INACTIVE 紀錄仍參與重疊排除。
- 客戶公司與價格表公司的 composite FK，以及同客戶跨公司指派。
- ADMIN／ORDER_ENTRY、company scope 與偽造 company ID。
- 有效日期版本邊界、inactive assignment／price list／price、不可銷售品項與 `PRICE_NOT_FOUND`。
- idempotency replay、audit 同交易及 audit 失敗完整 rollback。
- catalog constraint、完整 migration chain 與禁止資料表。

build 重跑時，OneDrive 曾將 `.next` 的既有 generated build directory 標示為唯讀而出現 `EPERM`。只移除經完整路徑核對的 `.next` generated directory 後重跑，production build 通過；未刪除或修改原始碼、migration 或資料庫資料。

## 7. 未完成與禁止範圍

- 沒有新增會阻塞 P2.4 的 Open Question。
- P2.4 不處理訂單缺價時的人工成交價、改價理由或交易快照；這些仍屬交易模組。
- P2.4 不處理運費規則、Ragic 匯入或主檔合併。
- P2.4 完成後停止；未經授權不得開始 P2.5 或其他模組。

## 8. 完成判定

P2.4 已完成，具備提交及進入 P2.5 規劃／實作審查的技術條件；是否開始 P2.5 仍須使用者另行核准。
