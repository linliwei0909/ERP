# P2.2 客戶主檔驗證紀錄

執行日期：2026-07-25（Asia/Taipei）  
同步基線：`DECISIONS.md` V0.5／DEC-052  
結論：P2.2 已完成；未開始 P2.3

## 1. 實作範圍

- 新增跨公司共用 `customers`。
- 新增控制公司可見與可用範圍的 `customer_companies`。
- 新增共用客戶的 `customer_contacts` 與 `delivery_locations`。
- 完成 ADMIN 維護、ORDER_ENTRY scoped read、搜尋、分頁、`ACTIVE`／`INACTIVE` 篩選。
- 未新增品項、價格表、運費、訂單、庫存、採購、批號或會計資料表。
- 一般 UI 與 API 未提供 hard delete。

## 2. Schema 與 0004 migration

正式 migration：`0004_p2_customer_master`

新增資料庫物件：

- enum：`customer_type`（`DOMESTIC`, `FOREIGN`）。
- application tables：`customers`, `customer_companies`, `customer_contacts`, `delivery_locations`。
- 所有主鍵由 PostgreSQL `gen_random_uuid()` 產生。
- 所有時間欄位使用 `timestamptz(3)`。
- 所有新 FK 使用 `ON DELETE RESTRICT ON UPDATE RESTRICT`。
- 0001、0002、0003 migration 未修改。

Custom PostgreSQL constraints：

- `customers_normalized_tax_id_active_value_key`：`normalized_tax_id` 有值時全系統唯一。
- `customers_country_foreign_identifier_key`：境外國別與識別碼組合唯一。
- `customers_identity_by_type_check`：境內／境外識別欄位互斥及必填。
- `customer_companies_customer_company_key`：同客戶與公司只能一筆。
- `customer_companies_company_code_key`：normalized 客戶代碼在公司內唯一。
- `customer_contacts_method_required_check`：phone、mobile、email 至少一項非空。
- `customer_contacts_one_active_primary_key`：同客戶最多一位有效主要聯絡人。
- `delivery_locations_customer_code_key`：地點代碼在客戶內唯一。
- `delivery_locations_id_customer_key`：保留後續 composite FK 的 supporting unique。
- `delivery_locations_one_active_default_key`：同客戶最多一個有效預設地點。
- 名稱、代碼及地址必填文字另有 non-blank CHECK。

## 3. Service、transaction 與資料正規化

- 客戶建立、更新、停用、公司授權、聯絡人與送貨地點維護均由可重用 service 執行。
- 公司客戶代碼使用 NFKC、trim、uppercase 正規化；送貨地點代碼依已確認規格只做 trim，不自行加入大小寫等未決正規化規則。
- 境內統編另外移除空白及連字號後保存 `normalized_tax_id`。
- 境外國別保存大寫兩碼；境外識別碼以 NFKC、trim、uppercase 正規化。
- 設定新主要聯絡人或新預設地點時，在同一 transaction 取消原有旗標，並為被取消及新值各寫 audit。
- 客戶及有效 `customer_companies` 關係均為可用查詢與子資料維護的必要條件。
- 寫入與 audit、idempotency completion 位於同一 transaction；失敗時不留下部分資料或 audit。

## 4. 權限與公司隔離

- 後端新增 `customers.read` 與 `customers.manage` permission。
- `ADMIN` 具有讀寫權；`ORDER_ENTRY` 只有讀取權。
- 每個 request 使用 server-side session context 的 actor、角色、已授權公司與所選公司；client 提供的 `companyId` 必須重新通過 scope 驗證。
- `ORDER_ENTRY` 只能取得目前公司存在 `ACTIVE customer_companies` 關係的 `ACTIVE` 客戶、有效聯絡人與有效送貨地點。
- ADMIN 只能維護自己具有 scope 的公司關係。
- 無 scope、偽造 companyId 或未授權客戶皆回傳一致授權／找不到錯誤，不直接信任 client。

## 5. API 與 UI

API：

- `GET/POST /api/customers`
- `GET/PATCH /api/customers/{id}`
- `POST /api/customers/{id}/companies`
- `POST /api/customers/{id}/contacts`
- `PATCH /api/customers/{id}/contacts/{contactId}`
- `POST /api/customers/{id}/locations`
- `PATCH /api/customers/{id}/locations/{locationId}`

所有寫入要求 same-origin 與 `Idempotency-Key`，錯誤使用既有一致格式，correlation ID 由 request context 傳入 audit。沒有 DELETE route。

UI：

- `/customers` 與 `/customers/{id}`：公司範圍查詢、搜尋、分頁與唯讀明細。
- `/admin/customers`：ADMIN 客戶清單與新增。
- `/admin/customers/{id}`：客戶修改／停用、公司授權、聯絡人與送貨地點管理。
- 管理頁不提供 hard delete；`ORDER_ENTRY` 無法進入管理功能。

## 6. Audit 與 idempotency

重要操作保存完整 before／after snapshot，包含：

- `customer.created`, `customer.updated`, `customer.activated`, `customer.deactivated`
- `customer_company.created`, `customer_company.updated`
- `customer_contact.created`, `customer_contact.updated`, `customer_contact.primary_unset`
- `delivery_location.created`, `delivery_location.updated`, `delivery_location.default_unset`

相同 company、operation、idempotency key 及相同 payload 的重送回放原結果；不同 payload 使用相同 key 時拒絕。測試已證明重送不重複建立客戶，且 audit 失敗會使資料及 idempotency transaction 一併 rollback。

## 7. 全新資料庫與 catalog 驗證

使用獨立 disposable database `erp_p2_2_fresh`：

1. 從空資料庫依序套用 0001、0002、0003、0004。
2. 四筆 migration 均為 finished，migration status 為 up to date。
3. Prisma schema diff 為 `No difference detected`。
4. PostgreSQL catalog 已確認 identity／contact CHECK、partial unique、supporting unique、查詢 index 與全部新 FK。
5. FK catalog 的 delete／update action 均為 `r`（RESTRICT）。
6. 正式 schema 只比 P1 增加四張 P2.2 客戶資料表，未建立禁止範圍資料表。

## 8. 測試與品質結果

| 檢查 | 結果 |
| --- | --- |
| `npm run prisma:validate` | 通過 |
| `npm run prisma:generate` | 通過，Prisma Client 7.8.0 |
| `npm run lint` | 通過 |
| `npm run typecheck` | 通過 |
| `npm run test` | 10 files／42 tests 通過 |
| `npm run test:db` | `erp_p2_2_fresh`，5 files／50 tests 通過 |
| `npm run build` | Next.js 16.2.11 production build 通過 |
| fresh DB `prisma migrate status` | 4 migrations，up to date |
| fresh DB `prisma migrate diff --exit-code` | `No difference detected` |

測試涵蓋境內統編唯一、境外識別唯一、境內外 CHECK、公司別客戶代碼、跨公司授權、ORDER_ENTRY 隔離、偽造公司、聯絡方式、主要／預設切換、資料庫 partial unique、停用、audit、rollback、idempotency、全新 migration chain 及 catalog。

## 9. `erp` 開發資料庫結果

- 執行前 datasource 明確顯示 PostgreSQL database `erp`、schema `public`、`localhost:5432`，僅缺少 0004。
- 以 `prisma migrate deploy` 成功套用 `0004_p2_customer_master`。
- 套用後 migration status 為 up to date，schema diff 為 `No difference detected`。
- `_prisma_migrations` 中成功的 0004 為 finished；P1 已知的一筆 rolled-back 0003 與後續成功 0003 均保留，沒有 unresolved failed migration。
- 新增四張資料表目前筆數皆為 0；未建立或匯入任何客戶資料。
- 開發資料庫未執行 reset、drop、資料刪除或 Docker volume 清除。

## 10. P2.2 完成判定

P2.2 的正式決議、schema、0004、Service、API、UI、RBAC、公司隔離、audit、idempotency、unit tests、DB workflow tests、全新資料庫驗證、開發資料庫 deploy、production build 與文件同步均已完成。

Hosted CI 仍需在提交及 push 後驗證；這不影響本機 P2.2 完成判定。未取得下一步授權前不得開始 P2.3、品項、價格、運費、Ragic 匯入或任何交易模組。
