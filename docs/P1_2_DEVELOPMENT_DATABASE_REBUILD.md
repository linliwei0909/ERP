# P1.2 本機開發資料庫正式 Baseline 重建紀錄

執行日期時間：2026-07-25 09:34:20–09:54:56（Asia/Taipei）  
操作者：Codex（依 repository 使用者明確核准執行）  
目標：本機 PostgreSQL database `erp`

## 1. 執行範圍與安全條件

- 只重建 `erp-postgres` container 內名稱精確為 `erp` 的 database。
- 不使用 `prisma migrate reset`，不刪除 Docker named volume，不停止或刪除 PostgreSQL cluster。
- 不修改 `0001_p1_foundation_baseline`、`0002_p1_authentication_and_access` 或 legacy migration。
- P1 DB integration tests 只使用 `erp-p1-test-postgres` 的獨立測試 database。
- 使用者已於 2026-07-25 明確確認舊 ERP 資料全部為可拋棄的開發／測試資料。

## 2. Git 與執行前狀態

- 執行前 working tree：clean。
- 執行前 commit：`e97bf1b chore(security): update Next.js dependencies`。
- 0001 Git object：`a84e1051dccd592e226e44b01b9900bd67c448a2`。
- 0002 Git object：`e22d3ee8741239f72eb134b935a1355202ab7f15`。
- Container：`erp-postgres`，healthy，PostgreSQL 17.10。
- Database／schema：`erp`／`public`。
- 舊資料庫有 40 張 application tables、41 個 sequences、155 個 indexes及 19 筆 `_prisma_migrations`。

## 3. 重建前 Fingerprint

| 項目 | 值 |
| --- | --- |
| Columns | `075aca42fa5c189bfd4e0ef3495b7980` |
| Constraints | `3fae7fb84885f36fc5e62b19b01aa891` |
| Indexes | `6cb016da0f786a81db2807065e983077` |
| Prisma migrations | `d22a753517533175fec6fbc411f913de` |
| Migration rows | 19 |

精確資料表筆數保存於備份目錄的 inventory 與 fingerprint report。

## 4. 備份

備份目錄：

`web/backups/erp_20260725_093420_pre-p1-rebuild/`

| 檔案 | SHA-256 |
| --- | --- |
| `erp_20260725_093420_pre-p1-rebuild.dump` | `e1ace2dfe60dc3e0a983c4329d79418f2cc3538a81f2179b2b313e019aac1ab9` |
| `erp_20260725_093420_pre-p1-rebuild_schema.sql` | `7c6da8da58242b49a65b4999d07da8b7ed7a9d6fe82f8a185638094ea3c1784f` |
| `erp_20260725_093420_pre-p1-rebuild_data.sql` | `55478c87f44645501385a592e5d79c1ed25f20a8ae36cb4fe9e0442a521470c4` |
| `erp_20260725_093420_pre-p1-rebuild_fingerprint.txt` | `bdc40876a4d605eb719864df3bef11f51edbe535f643d5de9be763e0916df025` |
| `erp_20260725_093420_pre-p1-rebuild_inventory.txt` | `8b8d0dcf9696ce163010a8334024f60658a92d0037706e99d5a4c5c2b7c8b21d` |

`pg_restore --list` 成功讀取 497 個 TOC entries。Custom dump 已還原至獨立 database `erp_pre_p1_restore_20260725_093420`；還原後所有 fingerprints、19 筆 migration 及精確資料表筆數與來源完全相同。

## 5. 實際執行命令

祕密值未記錄於本文件。主要命令：

```powershell
docker exec erp-postgres pg_dump -U erp -d erp -Fc -f <custom-dump>
docker exec erp-postgres pg_dump -U erp -d erp --schema-only -f <schema-dump>
docker exec erp-postgres pg_dump -U erp -d erp --data-only --column-inserts -f <data-dump>
docker exec erp-postgres pg_restore --list <custom-dump>
docker exec erp-postgres createdb -U erp -T template0 erp_pre_p1_restore_20260725_093420
docker exec erp-postgres pg_restore --exit-on-error --no-owner --no-privileges -U erp -d erp_pre_p1_restore_20260725_093420 <custom-dump>
```

重建與 migration：

```powershell
docker exec erp-postgres psql -X -U erp -d erp --tuples-only --no-align --command=<current_database check>
docker exec erp-postgres dropdb -U erp --force erp
docker exec erp-postgres createdb -U erp -T template0 erp
npm run db:deploy
npm run db:status
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Bootstrap 使用 `node --env-file=.env` 載入未回顯的管理員帳密，並以 process environment 提供 database 名稱與下列非敏感公司資料：

- `INDUSTRIAL`／實業
- `BIOTECH`／生技

Bootstrap 連續執行兩次；第二次沒有重複建立管理員、公司或 scope。

驗證：

```powershell
npm run prisma:validate
npm run prisma:generate
npm run lint
npm run typecheck
npm run test
npm run test:db
npm run build
npm run db:status
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

## 6. 重建前回復 Runbook

若新 baseline 建立失敗：

1. 停止 Web／worker 對 `erp` 的寫入。
2. 從 `postgres` database 終止 `datname = 'erp'` 的其他連線。
3. 確認目標名稱精確為 `erp`。
4. 刪除失敗的新 `erp`，以 `template0` 建立空白 `erp`。
5. 從已驗證的 custom-format dump 還原。
6. 重跑 fingerprint、精確資料表筆數及 19 筆 migration 核對。

```powershell
docker exec erp-postgres psql -X -U erp -d postgres -c "<terminate only datname erp>"
docker exec erp-postgres dropdb -U erp --if-exists erp
docker exec erp-postgres createdb -U erp -T template0 erp
docker exec erp-postgres pg_restore --exit-on-error --no-owner --no-privileges -U erp -d erp /tmp/erp_20260725_093420_pre-p1-rebuild.dump
```

回復不使用 Docker volume rollback，且不得刪除 `web_erp_postgres_data`。

## 7. Migration 結果

- `dropdb --force` 的目標在執行前由 PostgreSQL 自身確認精確為 `erp`。
- 使用 `template0` 成功建立空白 `erp`。
- 依序套用 `0001_p1_foundation_baseline`、`0002_p1_authentication_and_access`。
- `_prisma_migrations` 只有上述 2 筆。
- `prisma migrate status`：Database schema is up to date。
- Prisma schema diff：No difference detected。
- 0001、0002 的 Git object hash 與執行前相同，migration SQL 未修改。

## 8. 重建後資料表與初始資料

正式 P1 tables：

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

另有 Prisma 管理表 `_prisma_migrations`。未建立 inventory、warehouse、lot／batch、procurement、stock movement、sales order、delivery、AR／AP 或 accounting tables。

Smoke test 完成後精確筆數：

| Table | Rows |
| --- | ---: |
| `companies` | 2 |
| `roles` | 2 |
| `users` | 2 |
| `user_roles` | 2 |
| `user_company_scopes` | 4 |
| `user_sessions` | 3，全部已撤銷 |
| `audit_logs` | 8 |
| `_prisma_migrations` | 2 |
| `company_settings` | 0 |
| `document_sequences` | 0 |
| `idempotency_keys` | 0 |
| `background_jobs` | 0 |

初始資料：

- 公司：`INDUSTRIAL`／實業、`BIOTECH`／生技，均為 ACTIVE。
- 角色：`ADMIN`、`ORDER_ENTRY`，均為 ACTIVE。
- 管理員：1 名，具有 ADMIN 及兩家公司 scope，`INDUSTRIAL` 為預設公司。
- Smoke test 帳號：1 名 ORDER_ENTRY，測試後已停用，既有 Session 已失效。
- 所有 P1 table 的 `id` 均以 PostgreSQL `gen_random_uuid()` 為 default；實際建立的公司 ID 符合 UUID 格式。

重建後 fingerprint：

| 項目 | 值 |
| --- | --- |
| Columns | `8df258ded82a3dc5c10f5475924e5163` |
| Constraints | `104fc74986c33415a72e1080f60f1e4a` |
| Indexes | `c81ea124f352cfa016c8addff5fe16cd` |
| Prisma migrations | `169c69c9803b425f6cef9b0589789b6f` |

## 9. Smoke Test 與品質檢查

正式開發環境 smoke：

- PostgreSQL container healthy。
- `/api/health/live`、`/api/health/ready` 通過。
- 管理員正確帳密登入成功；錯誤密碼被拒絕。
- Session cookie 為 HttpOnly、SameSite=Lax，token 未輸出。
- 登出後 Session 失效。
- `INDUSTRIAL`、`BIOTECH` 可切換；偽造 company ID 被拒絕。
- ADMIN 可進入使用者管理。
- ORDER_ENTRY 被管理員頁面拒絕。
- 停用 ORDER_ENTRY 後既有 Session 立即失效。
- Smoke 中產生的 Session 全部撤銷，未留下有效 Session。
- Audit 包含 `bootstrap.created`、`bootstrap.company_scope_added`、`auth.login.succeeded`、`user.created`、`user.disabled`、`user.sessions_revoked`。

品質檢查：

| Check | Result |
| --- | --- |
| Prisma validate | 通過 |
| Prisma generate | 通過 |
| ESLint | 通過 |
| Typecheck | 通過 |
| Unit tests | 18/18 通過 |
| DB／workflow tests | 21/21 通過；只使用獨立 P1 test database |
| Next.js 16.2.11 production build | 通過 |
| Migration status | Up to date |
| Prisma schema diff | No difference detected |

## 10. 未解決問題

- 備份還原驗證 database `erp_pre_p1_restore_20260725_093420` 依「不得對其他 database 執行破壞操作」限制保留，未刪除。
- Port 3000 已有同一 repository 的 Next dev server PID 42368。嘗試依 runbook 終止時被工具安全層拒絕強制終止；未繞過限制。Smoke 直接使用此同專案 server 並全部通過。
- 已停用的 ORDER_ENTRY smoke 帳號及其 audit／已撤銷 Session 保留，以符合禁止以刪除取代歷程的規則。
- 未開始 P1.3、P2 或任何業務模組。

## 11. Docker Volume 與 Legacy 證據

- `erp-postgres` 重建後仍為 healthy。
- Named volume `web_erp_postgres_data` 仍掛載於 `/var/lib/postgresql/data`，mode 為 read-write。
- `docker volume ls` 仍包含 `web_erp_postgres_data`；未執行 `docker compose down -v` 或 volume delete。
- `web/legacy/erp-mvp` Git tree 維持 `a8dd4a8ff6205fcafadf129219122f2259348a40`，與 HEAD 無差異。
