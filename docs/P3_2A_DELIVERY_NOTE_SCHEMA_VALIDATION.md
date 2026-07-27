# P3.2a 銷貨單 Schema 與 Migration 驗證

執行日期：2026-07-27
規格基線：`DECISIONS.md` V0.10／DEC-057
工程範圍：Prisma schema、`0010_p3_delivery_notes`、custom SQL、migration-health、unit／DB catalog／fresh DB 驗證
明確排除：delivery-note service、API、UI、列印、PDF、出貨、紙本回收確認、應收、庫存與 P3.3／P3.4

## 1. 起始 Git 與 DB 狀態

- Branch 為 `main`，與 `origin/main` 差異為 0／0。
- 起始工作樹只有 7 份已核准 P3.2 規格文件差異，以及 `docs/INVENTORY_PRODUCTION_BLUEPRINT.md`。
- `docs/INVENTORY_PRODUCTION_BLUEPRINT.md` 是既有、未追蹤、獨立於 P3.2a 的 P4 規劃文件；本輪未讀取內容、未修改、未移動、未重新命名，也未納入 P3.2a 範圍。
- 正式 migration chain 起始為 0001～0009；既有 migration Git diff 為空，SHA-256 未因本輪變動。
- 本機 `erp` 起始 datasource 為 `localhost:5432/erp`，migration up to date、schema diff=0、unresolved failed migration=0，且沒有 `delivery_notes`／`delivery_note_lines`。

## 2. Prisma Schema

新增：

- `DeliveryNoteStatus`：`ACTIVE`, `SHIPPED`, `RECEIVABLE_CREATED`, `VOIDED`。
- `DeliveryNoteVoidSource`：`ADMIN_DIRECT`, `ORDER_REVISION_REBUILD`, `ORDER_VOID`。
- `DeliveryNote`。
- `DeliveryNoteLine`。

`DeliveryNote.status` 沒有 DB／Prisma default，未來 service 必須明確寫入 `ACTIVE`，避免 raw insert 默認進入未經 command 驗證的狀態。

`DeliveryNoteLine` 不保存 `updated_at`／`updated_by`。P3.2 不提供一般明細修改；重建會建立全新 header 與 lines。明細也不增加冗餘 `sales_order_id`，改用 `(delivery_note_id, company_id)`、`(sales_order_line_id, company_id)` 兩組 composite FK 保證公司一致，來源 order 一致性留給未來 service transaction 驗證。

所有 UUID 使用 PostgreSQL `gen_random_uuid()`；時間使用 `timestamptz(3)`，單據日期使用 PostgreSQL `date`，金額與數量精度依 DEC-057。

## 3. Migration 0010

正式目錄：

`web/prisma/migrations/0010_p3_delivery_notes/migration.sql`

Prisma `migrate dev --create-only` 兩次均因 Codex 執行環境被 CLI 判定為 non-interactive 而拒絕，未產生 migration、未修改 DB。隨後在已套用 0001～0009 的 disposable generation DB 使用官方 `prisma migrate diff --from-config-datasource --to-schema ... --script` 產生等價 SQL 草稿，再以 `apply_patch` 建立精確命名目錄並人工補入 custom SQL。

0010 包含：

- 兩個 enum 與兩張資料表。
- `sales_order_lines(id, company_id)` supporting unique。
- 全域唯一 `delivery_note_number`。
- 同一 order 的 `status <> 'VOIDED'` partial unique。
- company、order、line、item/company、actor 及 replacement 的 RESTRICT composite FK。
- 日期年月、單號格式、revision、snapshot、金額、void lifecycle、replacement self-reference、line number／數量／單價／金額 CHECK。
- Replacement chain constraint trigger／function。
- `sales_order_relations.ADDITION` graph constraint trigger／function。

0001～0009 沒有修改。

## 4. Partial Unique

正式 index：

```sql
CREATE UNIQUE INDEX "delivery_notes_one_non_voided_per_order_key"
ON "delivery_notes" ("sales_order_id")
WHERE "status" <> 'VOIDED';
```

DB tests 已驗證：

- `ACTIVE` 後不可新增 `SHIPPED`。
- `SHIPPED` 後不可新增 `ACTIVE`。
- `RECEIVABLE_CREATED` 後不可新增 `ACTIVE`。
- 同一 order 可保留多張 `VOIDED` 歷史。
- 只有 `VOIDED` 歷史時可新增新的 `ACTIVE`。

## 5. Composite FK

- `delivery_notes(company_id) -> companies(id)`。
- `delivery_notes(sales_order_id, company_id) -> sales_orders(id, company_id)`。
- `delivery_notes(replaced_delivery_note_id, sales_order_id, company_id) -> delivery_notes(id, sales_order_id, company_id)`。
- `delivery_note_lines(delivery_note_id, company_id) -> delivery_notes(id, company_id)`。
- `delivery_note_lines(sales_order_line_id, company_id) -> sales_order_lines(id, company_id)`。
- `delivery_note_lines(item_id, company_id) -> item_companies(item_id, company_id)`。
- actor 與 item direct FK 均為 RESTRICT。

Composite FK 已包含單欄來源存在性的保證，因此沒有再建立語意重複、可能使 Prisma schema diff 產生 drift 的同表單欄 FK。Catalog tests 確認所有 P3.2a FK delete action 只有 `RESTRICT`／`NO ACTION`，沒有 cascade。

## 6. Replacement Constraints

DB contract 包含：

- self-reference CHECK。
- composite self-FK 保證同公司、同 sales order。
- nullable composite unique 保證一張舊單最多被一張新單直接取代。
- recursive constraint trigger 防止間接 cycle。
- 以 sales order 為 key 的 transaction advisory lock，序列化同 order replacement graph mutation。

DB tests 已覆蓋 self-reference、跨 order／公司、重複 replacement、合法歷史鏈及 cycle。

## 7. ADDITION Graph Trigger

0010 在既有 self CHECK、duplicate unique 之外增加 constraint trigger／function，檢查：

- source／related 同公司。
- related order 只能有一個 root source。
- 已是 addition 的 order 不得再作 source。
- 已是 source 的 order 不得再變成 addition leaf。
- 不得形成 cycle。

Graph mutation 使用 transaction-scoped advisory lock 序列化。這能在單一 PostgreSQL database 內避免並行 write-skew，但未來 service 仍須先鎖定來源 order、解析 root、固定 lock order，並把 relation、audit 與 idempotency 放在同一 transaction。

## 8. Fresh DB 驗證

測試容器：

- `erp-p1-test-postgres`
- PostgreSQL 17
- `localhost:55432`

Fresh A：`erp_p3_2a_fresh_a_20260727_01`

- 建立前不存在，public schema 空白。
- Deploy 前 status exit code 1，唯一原因為 0001～0010 pending。
- 0001～0010 deploy exit code 0。
- Deploy 後 status up to date。
- Schema diff：`No difference detected`。
- 第一次完整 DB suite 為 101／105 通過；4 個失敗均是舊 catalog test 尚把本輪正式新增表列為禁止表或 table name 排序未同步，沒有 migration、constraint 或新 P3.2a DB test 失敗。

Fresh B：`erp_p3_2a_fresh_b_20260727_01`

- 獨立建立，沒有 copy／restore Fresh A。
- 建立前不存在，public schema 空白。
- Deploy 前 status exit code 1，唯一原因為 0001～0010 pending。
- 0001～0010 deploy exit code 0。
- Deploy 後 status up to date。
- 修正 catalog expectations 後，完整 DB suite 12 files／105 tests 全部通過。
- 測試後再次確認 migration status up to date、schema diff `No difference detected`。

現行完整 DB suite 仍採「每次 test run 使用全新 disposable DB」的正式生命週期，不宣稱保留測試資料的同一 DB 可直接重跑。

## 9. Catalog 與禁止範圍

Catalog／DB tests 已確認：

- Enum 值與順序完整。
- 兩張正式資料表、CHECK、unique、partial unique、composite FK、trigger／function 皆存在。
- Partial predicate 精確為 `status <> 'VOIDED'`。
- Snapshot 必須為非空 JSON object。
- 日期、年月、單號、void lifecycle、header／line 金額及 replacement contract 生效。
- 不存在 `receivables`, `inventory`, `warehouses`, `lots`, `procurement`, `accounting_postings`。
- Build 路由沒有新增 delivery-note service、API 或 UI。

## 10. 品質檢查

- `npm.cmd run prisma:validate`：通過。
- `npm.cmd run prisma:generate`：通過。
- `npm.cmd run lint`：通過。
- `npm.cmd run typecheck`：通過。
- `npm.cmd run test`：16 files／76 tests 通過。
- `npm.cmd run test:db`：Fresh B 12 files／105 tests 通過。
- `npm.cmd run build`：通過。
- `git diff --check`：通過。

## 11. Migration-health 與本機 erp

Repository `EXPECTED_MIGRATIONS` 已精確更新為 0001～0010，最後一筆為 `0010_p3_delivery_notes`；unit test 仍驗證完整名稱、順序與數量。

P3.2a schema 驗證階段尚未 deploy 0010；Git 收尾階段取得明確授權後，已對精確 datasource `localhost:5432/erp?schema=public` 執行一次 `prisma migrate deploy`，且只套用 `0010_p3_delivery_notes`。

`erp._prisma_migrations` 保留一筆既有、已 resolved／rolled-back 的 `0003_p1_operational_foundation` 歷史紀錄；同名 0003 另有一筆成功完成紀錄。該歷史 row 不是目前 failed migration，本次沒有修改、刪除或重寫 migration history，也沒有執行 `migrate resolve`、reset 或 database rebuild。

本次正式 deployment Gate 為：

- 0001～0010 每個正式 migration 均至少有一筆成功 finished、未 rolled-back 的有效紀錄。
- unresolved failed migration = 0。
- 0010 本次新增一筆成功 finished 紀錄，checksum 與 migration file 相符。
- 本次沒有新增 failed 或 rolled-back migration。
- 既有 resolved／rolled-back 0003 歷史紀錄原樣保留；不要求歷史 rolled-back count 等於 0。

部署後確認：

- `prisma migrate status`：up to date。
- Prisma schema diff：`No difference detected`。
- `delivery_notes`、`delivery_note_lines`、enum、CHECK、FK、index 與 trigger 全部存在。
- Production health：live、ready、worker 均 HTTP 200；ready 接受 0001～0010，worker heartbeat 有效。
- 本輪沒有在 `erp` 寫入銷貨單測試交易資料。

## 12. 結論

P3.2a 的不可逆 DB contract 已完成兩個 fresh DB、catalog、schema diff、unit／DB／build 驗證，0010 亦已受控部署本機 `erp` 並通過 production health Gate，具備提出 P3.2b service 實作範圍的技術條件。

仍未完成且未授權：

- Delivery-note 建立／查詢 service。
- Rebuild／order void／ADMIN direct void service。
- API、UI、權限 wiring、audit 與 idempotency workflow。
- P3.3 列印／PDF。
- P3.4 實際出貨日、紙本回收確認與後續鎖定。

P3.2 整體尚未完成。
