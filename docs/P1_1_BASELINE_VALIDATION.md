# P1.1 正式 UUID Baseline 驗證紀錄

## 1. 安全範圍

- 現有開發資料庫僅執行 catalog、筆數、migration status 與 schema diff 等唯讀查詢。
- 正式 baseline 只套用至獨立 `erp-p1-test-postgres` container 內的空白測試資料庫。
- 未執行 drop database、drop schema、`prisma migrate reset`、資料刪除、Docker volume 清除或現有資料庫重建。

## 2. 現有開發資料庫盤點

- Container：`erp-postgres`，執行中且 healthy。
- Database：`erp`。
- Schema：`public`。
- PostgreSQL：17.10 Alpine。
- Extension：只有 `plpgsql`。
- 資料表：40 張舊 ERP application tables，加 `_prisma_migrations`。
- Sequence：41 個。
- Index：155 個。
- Prisma：active 舊鏈共 17 個 migration；資料庫 migration 紀錄 19 筆，其中 `20260713020000_add_sku_generation` 有兩筆 rolled back 紀錄，第三次成功。
- 執行封存前，`prisma migrate status` 回報 up to date，`prisma migrate diff` 回報資料庫與舊 `schema.prisma` 無差異。

現有資料包含兩家公司、分類與包裝 seed，以及一條涵蓋採購、入庫、庫存、銷售、應收與收付款的單筆交易鏈。其分布符合 smoke data 特徵，但資料列沒有明確測試標記，因此無法只從資料庫證實用途；本次未修改。

可重跑的唯讀盤點：

```powershell
Get-Content .\scripts\db-inventory-readonly.sql |
  docker compose exec -T postgres psql -X -U erp -d erp

npx prisma migrate status
npx prisma migrate diff `
  --from-config-datasource `
  --to-schema .\prisma\schema.prisma `
  --exit-code
```

注意：後兩個 Prisma 命令在 P1.1 封存後會以正式新 chain／schema 為比較目標；若要重現封存前結果，必須使用 `legacy/erp-mvp/prisma/`，不得把舊 migration 移回正式 active path。

## 3. 正式 Baseline

正式表：

- `companies`
- `company_settings`
- `users`
- `roles`
- `user_roles`
- `user_company_scopes`
- `user_sessions`
- `document_sequences`
- `idempotency_keys`
- `background_jobs`
- `audit_logs`

附件表未納入 P1.1；目前技術基線不需要附件功能，避免提前建立 generic entity reference。

## 4. Custom SQL

`0001_p1_foundation_baseline` 包含：

- `pgcrypto` extension。
- 所有 PK 與 FK 使用 PostgreSQL UUID。
- Session 閒置區間與撤銷原因 CHECK。
- 單號年度與目前序號 CHECK。
- Idempotency 到期時間 CHECK。
- Background job attempt count CHECK。
- 有效 session partial index。
- Active job deduplication partial unique index。
- 阻擋 `audit_logs` UPDATE、DELETE 與 TRUNCATE 的 append-only triggers。

## 5. Disposable Database 驗證

同一獨立 PostgreSQL container 建立兩個空白 database：

- `erp_p1_test_a`
- `erp_p1_test_b`

兩者均只從正式 `prisma/migrations/` 執行一筆 `0001_p1_foundation_baseline`。舊 migration 未執行，且未建立客戶、品項、庫存、倉庫、批號、採購、銷售、AR/AP 或會計資料表。

兩個 database 均通過 9 項 DB integration tests，涵蓋正式 migration 名稱、允許表清單、`pgcrypto`、DB-generated UUID、FK、unique、CHECK、partial index、idempotency、背景工作 deduplication 與 audit append-only。驗證後只停止測試 container，未移除 container 或清除任何 volume。
