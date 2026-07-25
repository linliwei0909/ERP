# P2.3 品項主檔驗證紀錄

執行日期：2026-07-25（Asia/Taipei）  
同步基線：`DECISIONS.md` V0.6／DEC-053  
結論：P2.3 已完成；未開始 P2.4

## 1. 實作範圍

- 新增跨公司共用 `items`。
- 新增控制公司可見、可用與可銷售範圍的 `item_companies`。
- 完成 ADMIN 維護及 ORDER_ENTRY 公司可銷售品項唯讀查詢。
- 完成搜尋、分頁、`ACTIVE`／`INACTIVE` 與 `PRODUCT`／`RAW_MATERIAL` 篩選。
- 未新增 `item_categories`、包裝換算、價格、運費、訂單或任何交易資料表。
- 未新增庫存、倉庫、批號、採購、入出庫、生產或會計流程。
- 一般 UI 與 API 未提供 hard delete。

## 2. Schema 與 0005 migration

正式 migration：`0005_p2_item_master`

新增資料庫物件：

- enum：`item_type`（`PRODUCT`, `RAW_MATERIAL`）。
- application tables：`items`, `item_companies`。
- 所有主鍵由 PostgreSQL `gen_random_uuid()` 產生。
- 所有時間欄位使用 `timestamptz(3)`。
- 所有新 FK 使用 `ON DELETE RESTRICT ON UPDATE RESTRICT`。
- 0001、0002、0003、0004 migration 未修改。

主要 constraints：

- `items_normalized_code_key`：normalized 品項代碼全系統唯一。
- `items_barcode_present_key`：條碼非 null 時全系統唯一，null 可多筆。
- `item_companies_item_company_key`：同品項與公司只能一筆。
- `item_companies_company_code_key`：normalized 公司品項代碼在公司內唯一。
- `items_required_text_not_blank_check`：code、normalized code、name、base unit 不可空白。
- `items_barcode_not_blank_check`：條碼必須為 null 或非空白。
- `item_companies_code_not_blank_check`：公司品項代碼及 normalized 值不可空白。
- item type 由 PostgreSQL enum 限制正式值域。
- 四個品項用途旗標及公司銷售旗標均為 NOT NULL。

## 3. Normalization 與用途旗標

- 品項代碼及公司品項代碼使用 NFKC、trim、uppercase normalization。
- 原始 trim 後代碼與 normalized code 分欄保存，以 normalized 欄位建立唯一限制。
- 條碼只依正式決議執行 trim normalization；空白轉為 null。
- `description`, `specification`, `barcode` 可為 null。
- `code`, `name`, `base_unit`, `company_item_code` 必填。
- `purchase_enabled`, `inventory_enabled`, `production_enabled` 僅保存為能力旗標；P2.3 UI 不呈現相關流程，也未建立其依賴資料表。

## 4. 可用與可銷售條件

可用品項查詢要求：

- `items.status = ACTIVE`
- `item_companies.status = ACTIVE`

可銷售品項查詢另要求：

- `items.sales_enabled = true`
- `item_companies.sales_enabled = true`

`ORDER_ENTRY` 即使嘗試要求其他查詢模式，後端仍強制使用可銷售條件。沒有目標公司的品項關係、任一層停用或任一層禁止銷售時，不得供該公司使用。

## 5. Service、API 與 UI

Service：

- `createItem`
- `updateItem`
- `assignItemCompany`
- `listItems`
- `listAvailableItems`
- `listSaleableItems`
- `getItem`

API：

- `GET/POST /api/items`
- `GET/PATCH /api/items/{id}`
- `POST /api/items/{id}/companies`

所有寫入要求 same-origin 與 `Idempotency-Key`，使用一致錯誤格式；correlation ID 由 server-side request context 傳入 audit。沒有 DELETE route。

UI：

- `/items`、`/items/{id}`：目前公司可銷售品項查詢與唯讀明細。
- `/admin/items`：ADMIN 搜尋、分頁、狀態／類型篩選與新增。
- `/admin/items/{id}`：品項修改、停用／重新啟用、公司關係及公司銷售旗標管理。
- UI 不顯示庫存數量、倉庫、批號、採購、入出庫或生產流程。

## 6. 權限、公司隔離、audit 與 idempotency

- 新增 `items.read`, `items.manage` permission。
- `ADMIN` 具有讀寫權；`ORDER_ENTRY` 只有讀取權。
- Client 提供的 `companyId` 必須重新通過 server-side company scope 驗證。
- ADMIN 只能維護自己具有 scope 的公司關係。
- 無 scope、偽造 companyId、無公司關係或不可銷售品項均被後端拒絕。

主要 audit operations：

- `item.created`, `item.updated`, `item.activated`, `item.deactivated`
- `item_company.created`, `item_company.updated`
- `item_company.activated`, `item_company.deactivated`

資料異動、audit 與 idempotency completion 位於同一 transaction。相同 payload 重送回放原結果；audit 寫入失敗時不留下 item、item_company、audit 或完成狀態。

## 7. 全新資料庫與 catalog 驗證

使用獨立 disposable database `erp_p2_3_fresh`：

1. 從空資料庫依序套用 0001～0005。
2. 五筆 migration 均為 finished，migration status 為 up to date。
3. Prisma schema diff 為 `No difference detected`。
4. Catalog 確認 item enum 只有 `PRODUCT`, `RAW_MATERIAL`。
5. 四個用途旗標均為 NOT NULL。
6. 全部新 FK 的 delete／update action 均為 `r`（RESTRICT）。
7. normalized code unique、barcode partial unique 與兩項 composite unique 均存在。
8. 不存在 `item_categories`, inventory, warehouses, lots, procurement 或 stock movements。

## 8. 測試與品質結果

| 檢查 | 結果 |
| --- | --- |
| `npm run prisma:validate` | 通過 |
| `npm run prisma:generate` | 通過，Prisma Client 7.8.0 |
| `npm run lint` | 通過 |
| `npm run typecheck` | 通過 |
| `npm run test` | 11 files／48 tests 通過 |
| `npm run test:db` | `erp_p2_3_fresh`，6 files／61 tests 通過 |
| `npm run build` | Next.js 16.2.11 production build 通過 |
| fresh DB `prisma migrate status` | 5 migrations，up to date |
| fresh DB `prisma migrate diff --exit-code` | `No difference detected` |

測試涵蓋 normalized code、條碼 unique／null、公司別代碼、跨公司關係、重複關係、必填 CHECK、item type、ADMIN／ORDER_ENTRY、偽造公司、四項可銷售條件、停用／重新啟用、audit、rollback、idempotency、無 DELETE route、全新 migration chain、catalog 及禁止資料表。

## 9. `erp` 開發資料庫結果

- 執行前 datasource 明確顯示 PostgreSQL database `erp`、schema `public`、`localhost:5432`，僅缺少 0005。
- 以 `prisma migrate deploy` 成功套用 `0005_p2_item_master`。
- 套用後 migration status 為 up to date，schema diff 為 `No difference detected`。
- `_prisma_migrations` 中成功的 0005 為 finished；P1 已知 rolled-back 0003 與後續成功 0003 均保留，沒有 unresolved failed migration。
- `items` 與 `item_companies` 目前皆為 0 筆；未建立或匯入任何品項資料。
- 開發資料庫不存在禁止範圍資料表。
- 未執行 reset、drop、資料刪除或 Docker volume 清除。

## 10. P2.3 完成判定

P2.3 的正式決議、schema、0005、Service、API、UI、RBAC、公司隔離、audit、idempotency、unit tests、DB workflow tests、全新資料庫驗證、開發資料庫 deploy、production build 與文件同步均已完成。

Hosted CI 仍需在提交及 push 後驗證；這不影響本機 P2.3 完成判定。未取得下一步授權前不得開始 P2.4、價格、運費、分類、匯入或任何交易模組。
