# P2.6 主檔整合、匯入框架與 P2 結案驗證

執行日期：2026-07-25
正式規格基線：`DECISIONS.md` V0.8
範圍：P2 主檔整合驗收、小量匯入框架、P2 工程結案
明確未執行：P3、交易資料表、Ragic 正式全量移轉

## 1. 結論

P2.1～P2.6 工程範圍已完成。公司切帳日、客戶／公司關係／聯絡人／送貨地點、品項／公司關係、價格表／價格版本／客戶指派及運費規則可在相同 actor、session、company scope、RBAC、audit、idempotency 與 correlation ID 脈絡下運作。

`0008_p2_master_import_foundation` 已在兩個全新 disposable database 由空白依序套用 0001～0008，並套用至本機 `erp` 開發資料庫。Prisma migration status 為 up to date，schema diff 為 `No difference detected.`。

P2.6 不代表 Ragic 正式資料移轉完成。正式 importer 只完成四類；其餘六類只有 CSV 契約。

## 2. Migration 與 schema

新增 migration：

- `0008_p2_master_import_foundation`

新增 application tables：

- `migration_batches`
- `legacy_id_map`
- `migration_issues`
- `migration_reconciliations`

新增 enum：

- `migration_batch_status`
- `migration_issue_severity`
- `migration_resolution_status`
- `migration_reconciliation_status`

主要限制：

- 批次唯一鍵：`(company_id, source_system, entity_type, source_file_hash, dry_run)`。
- Legacy mapping 唯一鍵：`(source_system, entity_type, legacy_id)`。
- Reconciliation 唯一鍵：`(migration_batch_id, entity_type)`。
- 所有數量非負，且 `imported + skipped + failed <= total/source`。
- `MATCHED` reconciliation 的三類結果合計必須等於來源筆數。
- 批次狀態與 `completed_at` 必須一致。
- Issue 的 resolution status、resolver 及 resolved time 必須一致。
- 所有 FK 使用 RESTRICT／NO ACTION，不使用 cascade delete。

0001～0007 未修改。Migration 只新增 enum、table、constraint 與 index，未改動既有主檔資料。Forward-fix 原則為另建後續 migration；不得回頭修改 0008。若在尚未承載正式匯入資料的環境需要回退，由已驗證備份重建；不得在正式環境直接手動 drop migration objects。

開發 DB 驗證：

- public 共 27 張表，包含 `_prisma_migrations` 及 26 張 application tables。
- `_prisma_migrations` 成功且未 rolled back：8 筆。
- 四張新匯入管理表在驗證完成時均為 0 筆。
- 不存在訂單、銷貨單、應收、庫存、倉庫、批號、採購、生產或會計表。

## 3. CSV template 與契約

`docs/import-templates/` 提供：

1. `customers.csv`
2. `customer_companies.csv`
3. `customer_contacts.csv`
4. `delivery_locations.csv`
5. `items.csv`
6. `item_companies.csv`
7. `price_lists.csv`
8. `item_prices.csv`
9. `customer_price_list_assignments.csv`
10. `freight_rules.csv`

欄位、必填性、型別、格式、normalization、允許值、legacy ID、關聯 legacy ID、匯入順序及錯誤範例記錄於 `MASTER_IMPORT_CSV_SPEC.md`。

正式 importer 已完成：

- `customers`
- `customer_companies`
- `items`
- `item_companies`

僅完成 template／validation contract，尚未開放正式 execute：

- `customer_contacts`
- `delivery_locations`
- `price_lists`
- `item_prices`
- `customer_price_list_assignments`
- `freight_rules`

這六類允許 dry-run 契約檢查，但正式 execute 會明確回傳 importer 尚未實作，不會偽裝成功。

## 4. Dry-run、validation 與資料安全

匯入流程：

1. 驗證 ADMIN 與 company scope。
2. 驗證 content length、檔案大小、`.csv`、MIME、UTF-8、檔名及 CSV 結構。
3. 解析為 typed staging object。
4. 執行 normalization、row validation、檔內 duplicate、DB duplicate 與 legacy FK mapping。
5. Dry-run 只寫 batch、已遮罩 issue、reconciliation 及 audit，不寫正式主檔。
6. Execute 透過既有正式 master service 寫入。
7. 每列正式主檔／公司關係、audit、idempotency 完成及 legacy mapping 位於同一 transaction。
8. 完成 batch summary 與 reconciliation。

安全控制：

- 預設上限 1 MiB，可由 `IMPORT_MAX_FILE_BYTES` 調整，schema 上限 10 MiB。
- 最多 10,000 筆。
- 不執行巨集、公式或檔案內容。
- `=`, `+`, `-`, `@` 開頭的顯示值先 neutralize。
- 稅籍、境外識別、電話、行動電話、email、地址與收件人欄位在 issue 中遮罩。
- 原始 CSV 不永久保存，production log 不記錄完整資料列。
- Client 傳入的 company ID 必須同時通過 server-side scope，不作為信任來源。

## 5. Legacy ID mapping 與重送

- Legacy ID 不作為正式 UUID。
- 正式主檔表未新增 `ragic_id`、`legacy_id` 等來源專屬欄位。
- Mapping 由 `source_system + entity_type + legacy_id` 唯一識別。
- 子實體匯入前必須找到父實體 mapping。
- 相同公司、來源、entity、檔案 SHA-256 與 dry-run 模式會回放既有 terminal batch。
- 每列另使用由 batch、entity 與 legacy ID 衍生的 service idempotency key。
- Mapping 寫入失敗時，正式主檔、公司關係與 audit 一併 rollback。

## 6. API 與 UI

ADMIN：

- `/admin/master-import`
- `/admin/master-import/[id]`
- `GET/POST /api/admin/master-import/batches`
- `GET /api/admin/master-import/batches/[id]`

功能包括公司選擇、entity 選擇、CSV 上傳、dry-run、正式匯入確認、批次清單、summary、issue、legacy mapping 及 reconciliation。

ORDER_ENTRY 沒有 `master_import.read` 或 `master_import.manage` permission，無法使用頁面或 API。所有回應沿用一致錯誤格式；成功回應帶 `x-request-id`。

## 7. P2 主檔整合驗收

整合測試已驗證：

- 建立公司切帳日，31 日在 2030 年 2 月解析為 2 月 28 日。
- 建立客戶並授權公司、建立送貨地點。
- 建立品項並授權公司。
- 建立價格表、半開期間價格及客戶價格表指派。
- 建立送貨地點運費規則。
- ORDER_ENTRY 在授權公司可查客戶、可銷售品項、有效價格與運費。
- 價格及運費在 `valid_to` 當日失效。
- 切換至未授權公司被拒絕。
- 停用 `item_companies` 後查價失敗。
- 停用送貨地點後運費查詢失敗。
- 停用 `customer_companies` 後查價及運費查詢失敗。
- 相同 idempotency key 不重複建立。
- 整合寫入均產生 audit。

既有 P1 operational tests 持續驗證 background job、heartbeat、audit append-only、idempotency 與 correlation；本次獨立 Web smoke 驗證 `/api/health/live`、`/api/health/ready`、`/api/health/worker` 均為 HTTP 200。

## 8. 匯入測試

Unit tests 涵蓋：

- CSV 引號、逗號、BOM、header、欄位數、未關閉引號及 NUL。
- 客戶／品項 typed contract 與正式值域。
- 檔名消毒、MIME、副檔名、UTF-8、大小限制。
- Formula injection neutralization 與敏感欄位遮罩。

DB／workflow tests 涵蓋：

- 合法 dry-run 不改正式主檔。
- 不合法欄位產生明確 issue。
- 同檔 legacy ID／business key 重複。
- DB 已存在正式鍵。
- 父層 mapping 缺失。
- 正式客戶與品項匯入。
- Legacy mapping 唯一及相同檔案安全重送。
- Mapping 失敗時正式主檔、公司關係與 audit 完整 rollback。
- Reconciliation 數量一致。
- ORDER_ENTRY 與無 scope 公司被拒絕。

## 9. 驗證命令與結果

| 驗證 | 結果 |
| --- | --- |
| `npm run prisma:validate` | 通過 |
| `npm run prisma:generate` | 通過 |
| `npm run lint` | 通過，0 error／0 warning |
| `npm run typecheck` | 通過 |
| `npm run test` | 14 files、67 tests 通過 |
| `npm run test:db` | 10 files、88 tests 通過 |
| `npm run build` | 通過 |
| `erp_p2_6_final` migrate deploy | 0001～0008 通過 |
| `erp_p2_6_repeat` migrate deploy | 0001～0008 重複由空 DB 建立通過 |
| disposable DB migrate status | up to date |
| disposable DB schema diff | `No difference detected.` |
| `erp` migrate deploy | 0008 通過 |
| `erp` migrate status | up to date |
| `erp` schema diff | `No difference detected.` |
| live／ready／worker health | HTTP 200／200／200 |

## 10. 文件同步與決議版本

本次沒有新增業務決議，因此 `DECISIONS.md` 維持 V0.8 且未新增 DEC。`business-rules.md`、`DATABASE_DESIGN.md`、`TECHNICAL_ARCHITECTURE.md` 與 `IMPLEMENTATION_PLAN.md` 只同步 P2.6 工程落地與完成邊界，不改寫既有正式規則。

## 11. 尚未完成

- 六類 contract-only importer。
- 完整 Ragic 欄位 mapping、正式檔案清理及全量／增量移轉。
- P8 的正式 reconciliation 報表、cut-off、附件範圍及切換演練。
- 主檔合併。
- 所有 P3 交易、snapshot、列印與 PDF 功能。

## 12. P3 開始前資料清單

開始 P3 前須取得並確認：

- 現行銷售訂單樣本。
- 現行銷貨單樣本。
- 銷貨單列印版型。
- 公司 Logo。
- 公司列印資訊。
- 銷貨單是否顯示單價、金額及運費。
- 簽收欄位。
- 紙張尺寸。
- 分頁與重複表頭。
- 訂單與銷貨單編號格式。
- 備註及條款。
- 作廢浮水印要求。

在上述資料完成盤點及下一步明確授權前，不建立 `sales_orders`、`sales_order_lines`、`delivery_notes`、`delivery_note_lines`、snapshot、列印或 PDF 功能。

## 13. P2 結案判定

P2 可正式工程結案。Schema、migration、主檔服務、公司隔離、RBAC、audit、idempotency、health、完整主檔鏈及小量匯入框架均已驗證；P3 尚未開始。
