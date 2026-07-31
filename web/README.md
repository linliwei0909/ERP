# Ragic 本地端系統

P1～P3.3 已完成正式結案，Git 基線為 `ffffc8ce82e497a0b3fd58461c6ae66919271014`。目前進行 P4.1「ERP UI／UX 現況盤點與正式藍圖」；此階段只做文件規劃，尚未開始 P4.2 App Shell 或任何 UI 實作。

正式階段依 DEC-060 調整為：

- P4：ERP UI／UX 與操作流程重整。
- P5：Inventory and Production；P4 完成前不得開始。
- 原應收至切換 roadmap 順延為 P6～P10。

UI／UX 規劃以 `docs/P4_UI_UX_BLUEPRINT.md` 為準；庫存／生產草案歸屬 `docs/P5_INVENTORY_PRODUCTION_BLUEPRINT.md`。P5 歸屬不推翻第一階段排除庫存、批號與出庫依賴的正式規則。

## 技術需求

- Node.js 22
- npm
- Docker Desktop
- PostgreSQL 17

## 環境設定

複製 `.env.example` 為 `.env`，並依環境設定：

```dotenv
DATABASE_URL="postgresql://erp:erp_local_dev@localhost:5432/erp?schema=public"
LOG_LEVEL="info"
AUTH_MAX_FAILED_ATTEMPTS="5"
AUTH_LOCK_MINUTES="15"
SESSION_ACTIVITY_THROTTLE_MINUTES="5"
JOB_POLL_INTERVAL_MS="1000"
JOB_HEARTBEAT_SECONDS="15"
JOB_STALE_LOCK_SECONDS="60"
JOB_RETRY_BASE_SECONDS="5"
JOB_RETRY_MAX_SECONDS="300"
WORKER_READY_MAX_AGE_SECONDS="60"
```

正式環境不得使用 repository 中的開發帳密。

## Migration 安全邊界

- 正式 active migration chain：`prisma/migrations/`
- 舊 ERP migration 封存：`legacy/erp-mvp/prisma/migrations/`
- 舊 migration 只供追溯，不得修改，也不會由 Prisma 正式設定執行。
- 正式 migration chain 依序為 `0001_p1_foundation_baseline`、`0002_p1_authentication_and_access`、`0003_p1_operational_foundation`。
- `erp` 開發資料庫已受控套用至 0003；其他環境仍須先備份、審查並使用 `prisma migrate deploy`。
- 禁止自行執行 `prisma migrate reset`、drop database、drop schema 或清除 Docker volume。

## 獨立 disposable 測試資料庫

啟動不同 container 與 port 的測試 PostgreSQL：

```powershell
docker compose -f compose.p1-test.yaml up -d
```

每次完整 DB suite 都必須先建立一個全新的 database。名稱必須以 `erp_` 開頭、包含 `test` 或 `closeout`，並以八碼日期及唯一識別結尾，例如 `erp_p4_2x_closeout_20260731_01`。不得重用 `erp_p1_test_a` 或任何已有資料的 database。

在同一個 PowerShell process 將兩個連線變數指向該全新 database，再套用正式 migration：

```powershell
$env:DATABASE_URL = "postgresql://p1_test:<test-password>@localhost:55432/erp_p4_2x_closeout_20260731_01?schema=public"
$env:P1_TEST_DATABASE_URL = $env:DATABASE_URL
npm run db:deploy
npm run test:db
```

DB suite 啟動前會集中驗證 local host、isolated port、dedicated role、disposable database naming、兩個變數的實際目標一致性及 business tables 為空。驗證失敗會停止，不會 skip、reset、drop、truncate 或自動清除資料。

## 建立初始管理員

Bootstrap 指令必須明確指定目標 database 名稱，並從環境變數取得帳號、密碼與公司資料：

```powershell
$env:DATABASE_URL = "postgresql://p1_test:p1_test_only@localhost:55432/erp_p1_test_a"
$env:BOOTSTRAP_DATABASE_NAME = "erp_p1_test_a"
$env:BOOTSTRAP_ADMIN_USERNAME = "admin"
$env:BOOTSTRAP_ADMIN_PASSWORD = "<至少 12 字元的安全密碼>"
$env:BOOTSTRAP_COMPANY_CODE = "COMPANY_A"
$env:BOOTSTRAP_COMPANY_NAME = "測試公司"
npm run bootstrap:admin
```

指令可安全重跑：normalized username 已存在時不會重複建立。成功建立時會在同一 transaction 建立公司、`ADMIN`／`ORDER_ENTRY` 角色、管理員角色與公司範圍，並留下 audit log。密碼只保存 scrypt 雜湊，原文不會輸出或寫入 audit。

## 開發

```powershell
npm install
npm run prisma:generate
npm run dev
```

健康檢查：

- `GET /api/health/live`：Web process 可回應。
- `GET /api/health/ready`：Web process 可連線 PostgreSQL，且 migration chain 精確符合 0001～0003。
- `GET /api/health/worker`：最近有有效的 worker heartbeat。

Worker 是獨立 process，啟動時不會自動執行 migration：

```powershell
npm run worker
```

也可由 Compose 建置並啟動 PostgreSQL 與 worker：

```powershell
docker compose up -d --build
```

共用 audit service 由主要資料 transaction 呼叫；`audit_logs` 在資料庫層禁止 update、delete 與 truncate。Idempotency 以公司、operation、key 唯一，job queue 使用 `FOR UPDATE SKIP LOCKED`、退避重試、dead-letter 與 stale lock 回收。

## 開發資料庫備份與還原驗證

下列指令使用 PowerShell 7 (`pwsh`)，預設只接受明確的 `erp` 開發 database；密碼由 `PGPASSWORD` 或既有 PostgreSQL credential 設定提供，不得寫入參數或文件：

```powershell
npm run db:fingerprint
npm run db:backup
npm run db:restore-verify -- -BackupPath "<custom-format dump 路徑>"
```

備份會產生 custom、schema-only、data-only、fingerprint 與 SHA-256 manifest；還原驗證只允許 `erp_restore_verify_` 前綴的獨立暫存 database。本機需先安裝 PostgreSQL 17 client tools（`psql`、`pg_dump`、`pg_restore`、`createdb`、`dropdb`）。

登入後由後端驗證 Session、帳號狀態、角色及公司範圍。Browser cookie 為 HttpOnly、SameSite=Lax，正式環境另啟用 Secure；資料庫只保存 Session token 的 SHA-256 hash。Session 閒置 8 小時到期，活動時間依設定節流更新。

## 驗證命令

```powershell
npm run prisma:validate
npm run prisma:generate
npm run lint
npm run typecheck
npm run test
$env:DATABASE_URL = "postgresql://p1_test:<test-password>@localhost:55432/erp_p4_2x_closeout_20260731_01?schema=public"
$env:P1_TEST_DATABASE_URL = $env:DATABASE_URL
npm run test:db
npm run build
```

Schema 與測試資料庫一致性：

```powershell
$env:DATABASE_URL = "postgresql://p1_test:<test-password>@localhost:55432/erp_p4_2x_closeout_20260731_01?schema=public"
npx prisma migrate diff `
  --from-config-datasource `
  --to-schema .\prisma\schema.prisma `
  --exit-code
```

## 舊 ERP 程式

P1.1 前的舊 ERP 程式完整保留於 `legacy/erp-mvp/src/`，但已移出 Next.js、TypeScript 與正式導覽入口。庫存、倉庫、批號、採購、stock movement、舊 delivery、舊 AR/AP 均不屬於正式第一階段基線。
