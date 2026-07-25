# P1.3 Audit、Idempotency、Background Jobs、Logging 與營運基礎驗證

## 執行資訊

- 執行日期：2026-07-25（Asia/Taipei）
- 操作者：Codex
- 範圍：P1.3 共用營運基礎
- 正式開發資料庫：`erp`
- 最終全新驗證資料庫：`erp_p1_3_final`
- 舊資料升級驗證資料庫：`erp_p1_3_upgrade`
- 未執行：P2 業務功能、database reset、drop database、drop schema、Docker volume 清除

## 結案狀態摘要

- P1 工程範圍：已完成。
- Hosted CI：待本次提交及 push 後驗證，不屬於未完成的 P1 功能。
- Backup／restore 實機演練：production release gate。
- Npm vulnerabilities 的升級處理或書面風險接受：production release gate。
- P2：未開始，仍須另行授權。

## 實作範圍

本次完成：

- 統一 audit service、payload sanitization 與資料庫 append-only 保護。
- Bootstrap、登入安全事件、使用者狀態、角色、公司 scope 與 Session 撤銷改用統一 audit service。
- 可重用 idempotency service，支援 replay、payload conflict、processing conflict、失敗重試與到期重啟。
- PostgreSQL job queue，支援 enqueue、deduplication、`FOR UPDATE SKIP LOCKED` claim、retry、exponential backoff、dead-letter 與 stale lock recovery。
- 獨立 worker process、job lock heartbeat、worker heartbeat 與 graceful shutdown。
- Request correlation ID、結構化 logging、集中式 redaction 與 production error 邊界。
- Web DB／migration readiness 與 worker readiness。
- 開發環境 fingerprint、backup 與 restore verification scripts。
- Docker Compose worker、worker image 與 CI schema diff。

未建立任何客戶、品項、價格、訂單、銷貨、AR／AP、收付款、庫存、採購、批號、倉庫或會計資料表與功能。

## 新增與修改檔案

主要新增檔案：

- `web/prisma/migrations/0003_p1_operational_foundation/migration.sql`
- `web/src/lib/audit.ts`
- `web/src/lib/sensitive-data.ts`
- `web/src/lib/correlation.ts`
- `web/src/lib/idempotency.ts`
- `web/src/lib/background-jobs.ts`
- `web/src/lib/job-handlers.ts`
- `web/src/lib/migration-health.ts`
- `web/src/worker.ts`
- `web/src/app/api/health/worker/route.ts`
- `web/scripts/db-fingerprint.ps1`
- `web/scripts/backup-development-db.ps1`
- `web/scripts/restore-verify-development-db.ps1`
- `web/Dockerfile`
- `web/.dockerignore`
- `web/tests/unit/operational-foundation.test.ts`
- `web/tests/db/operational-foundation.test.ts`

主要修改範圍：

- Prisma schema、既有 P1.2 authentication／session／admin audit 呼叫。
- API request context、authorization security events、health readiness 與 middleware correlation ID。
- `compose.yaml`、`.env.example`、`package.json`、CI workflow 與 README。
- P1.1／P1.2 既有 DB、security、environment 與 smoke tests。

## 0003 migration 摘要

`0003_p1_operational_foundation`：

- 保留資料地將 `audit_logs.action`、`before_value`、`after_value` 改名為 `operation`、`before_json`、`after_json`。
- 新增 `audit_logs.session_id`、必要 request ID、FK 與查詢索引。
- P1.2 舊 audit 的 request ID 使用 `migration-<audit UUID>` 回填；回填期間只暫停 update/delete trigger，完成後立即恢復。
- 將 `idempotency_keys.response_body` 改名為安全 metadata，新增 result reference 與 lifecycle timestamps。
- 為 idempotency lifecycle 加入複雜 CHECK。
- 為 background job 新增最大嘗試次數、correlation、完成／失敗／dead-letter timestamps、lock 索引與 CHECK。
- active deduplication partial unique index涵蓋等待重試的 `FAILED`。
- 新增 `worker_heartbeats` 及 status CHECK。
- migration 包在 PostgreSQL transaction，並對先前失敗嘗試可能留下的欄位改名使用相容檢查。

0001 與 0002 未修改。0003 不包含 P2 業務表。

### 升級事件與 recovery

第一次對 `erp` 執行 0003 時，既有 append-only trigger 正確拒絕 8 筆舊 audit 的 UPDATE 回填。失敗後唯讀檢查確認資料未遺失，但 PostgreSQL 已保留 migration 前段的相容欄位變更。

修正後另外建立含 P1.2 舊 audit 的 `erp_p1_3_upgrade`：

- 0003 套用成功。
- 舊 operation 與 audit 資料完整保留。
- request ID 全部回填。
- update/delete 與 truncate triggers 均為 enabled。
- Prisma diff 為零。

其後將 `erp` 的第一次失敗記錄以 `prisma migrate resolve --rolled-back` 正式標記，再執行修正版 0003。`_prisma_migrations` 因而保留一筆 rolled-back 0003 與一筆成功 0003，屬預期且可追溯的 migration history。

## Audit 設計

- `writeAudit` 只接受 caller transaction client，讓主要異動與 audit 同一 transaction。
- Context 包含 actor、session、company 與 request ID；entity、operation、before、after、reason 與 occurred time由正式欄位保存。
- `systemAuditContext` 只用於沒有 browser request 的 bootstrap／system operation，仍產生 request ID。
- 集中式 sanitizer 遞迴遮罩 password、password hash、secret、token、token hash、cookie、authorization、credential 與 session token 類欄位。
- DB trigger 禁止 application update、delete、truncate。
- 已知使用者的登入失敗、鎖定、停用登入、登入成功、Session 撤銷、公司拒絕與角色拒絕均可稽核；未知 username 不建立偽造 entity audit，只留下不洩漏帳號存在性的安全 log。

## Idempotency 設計

- 唯一範圍：`company_id + operation + idempotency_key`。
- Request body 只計算 canonical SHA-256，不保存完整 request body。
- 相同 payload 完成後 replay 安全 metadata／result reference。
- 不同 payload 回傳固定 conflict；處理中回傳固定 in-progress。
- Handler 的業務資料提交與 `COMPLETED` 更新在同一 transaction。
- Handler 失敗時業務 transaction rollback，再將 key 標記 `FAILED`，相同 payload 可重新 claim。
- 到期 key 的正式規則為：相同 payload 可重新啟動；不同 payload仍拒絕，避免同一 key 語意漂移。

## Background job 與 worker

- Claim SQL 使用 `FOR UPDATE SKIP LOCKED`，狀態切換與 attempt increment 為單一 SQL。
- 每次 claim 產生新的 correlation ID。
- Retry 採有上限的 exponential backoff；到達 `max_attempts` 進入 `DEAD_LETTER`。
- `FAILED` 保留 active deduplication，避免等待重試期間重複 enqueue。
- stale `PROCESSING` lock 可由其他 worker重新 claim。
- Job lock heartbeat 避免長工作被過早回收。
- SIGINT／SIGTERM 只設定 stopping；目前已 claim 的 handler完成 complete／fail 後才結束 loop，最後寫入 `STOPPED` heartbeat。
- 正式 handler registry 本階段只有無業務副作用的 `test.echo`。
- Worker 啟動不執行 migration。

實際 smoke：

- `web-worker` image 建置成功。
- `test.echo` job 被 claim 一次，`attempt_count = 1`，最後為 `COMPLETED`。
- SIGTERM 後 logs 依序出現 `worker.stopping`、`worker.stopped`，heartbeat 為 `STOPPED`。
- 重新啟動後 worker 維持 running。

## Logging、redaction 與 correlation

- JSON log 固定包含 timestamp、level、message 與 event；各呼叫可加入 request、actor、company、route／operation、job 與 correlation context。
- Middleware 接受格式安全的 `x-request-id`，否則產生 UUID，並傳入 request 與 response。
- Request ID 可傳至 Session context、audit；job claim 另建立 execution correlation ID。
- Logger 與 audit 共用 centralized sanitizer。
- Production logger 不輸出 Error stack；HTTP error payload 不接受 stack 欄位。
- Password、cookie、authorization、session token 與 token hash 測試均不會出現在 log／audit／job payload 或 last error。

## 備份、還原與 fingerprint

- `db-fingerprint.ps1` 使用 read-only transaction，列出 database、schema、版本、tables、sequences、migrations 與各表筆數。
- `backup-development-db.ps1` 只接受明確的 `erp`，產生 custom、schema-only、data-only、fingerprint 與 SHA-256 JSON manifest，並執行 `pg_restore --list`。
- `restore-verify-development-db.ps1` 拒絕 `erp`，只允許 `erp_restore_verify_` 前綴的獨立暫存 database，還原後執行 fingerprint，預設清除暫存 database。
- 備份目錄與副檔名已由 `.gitignore` 排除。
- 三支 script 已通過 PowerShell 7 parser；未知 database 防呆會在連線前拒絕。
- 本機未安裝 PostgreSQL client tools，因此本次沒有實際執行 dump／restore；執行環境需提供 PostgreSQL 17 的 `psql`、`pg_dump`、`pg_restore`、`createdb`、`dropdb`。

## CI 驗證

CI 使用 PostgreSQL 17 service，依序涵蓋：

- `npm ci`
- Prisma validate／generate
- 從空 DB migrate deploy 0001、0002、0003
- lint、typecheck、unit tests、DB integration tests
- `prisma migrate diff --exit-code`
- production build

本機 Compose config 驗證與 worker image build 均成功。GitHub-hosted CI 尚待實際 push 後執行。

## 測試與品質結果

- `npm run prisma:validate`：通過。
- `npm run prisma:generate`：通過。
- `npm run lint`：通過。
- `npm run typecheck`：通過。
- `npm run test`：9 files、23 tests 全部通過。
- `npm run test:db`：3 files、27 tests 全部通過。
- `npm run build`：通過；Next.js 16.2.11 production build完成。
- 全新 `erp_p1_3_final`：0001→0002→0003 成功，schema diff 為零。
- 含舊 audit 的 `erp_p1_3_upgrade`：0003 成功，資料保留、trigger enabled、schema diff 為零。
- `erp`：migration status up to date，schema diff 為零。
- Health smoke：`/api/health/live`、`/api/health/ready`、`/api/health/worker` 均正常。

## npm vulnerability 狀態

未執行 `npm audit fix` 或 `--force`，也未在 P1.3 變更套件版本。

- `npm audit`：17（13 high、4 moderate）。
- `npm audit --omit=dev`：8（4 high、4 moderate）。
- Runtime 主要風險鏈：Next.js → PostCSS／sharp；audit 目前未提供可信的同 major修正，而是建議不合理的 Next.js 9.3.3 major downgrade。
- Prisma／`@prisma/dev`／Hono／Valibot 與 `fast-uri` 亦被列出；需另開相依安全更新工作確認 Prisma 相容版本與 lockfile影響。
- ESLint／minimatch／brace-expansion 等其餘高風險主要位於開發工具鏈；audit 建議 ESLint 10 major，不在本次授權範圍。

上述漏洞在正式 production release 前應完成升級或書面風險接受；本次不自行進行 major upgrade。

## 開發資料庫狀態

- `erp` migration status：up to date。
- Prisma schema diff：`No difference detected`。
- 8 筆既有 audit 全數保留，`request_id` 與 `operation` 均無 null。
- append-only triggers 均 enabled。
- 新增 `worker_heartbeats`；application tables 共 12 張。
- 未出現任何 legacy ERP 或 P2 業務表。
- PostgreSQL named volume 未刪除，database／schema 未重建。

## 未完成與後續

- P1 工程範圍已完成；以下項目不屬於未完成的 P1 功能。
- Hosted CI 待提交及 push 後取得實際驗證結果。
- Backup／restore 實機演練是 production release gate，需在安裝 PostgreSQL 17 client tools 後執行。
- Npm vulnerabilities 的升級處理或書面風險接受是 production release gate。
- P2 尚未開始。

## P1 結論

P1.1、P1.2、P1.3 的技術基線與必要測試均已完成，P1 工程範圍正式完成。Hosted CI 待 push 後驗證；相依漏洞處理／風險接受及備份還原實機演練明確列為 production release gates。上述項目不會改變 P1 schema，也不代表已開始 P2。
