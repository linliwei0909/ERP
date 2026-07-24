# Ragic 本地端系統

目前進度為 P1.2「帳號、Session、RBAC 與公司權限基礎」。正式應用包含登入、公司切換及最小使用者管理；尚未啟用任何 P2 以後的業務模組。

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
```

正式環境不得使用 repository 中的開發帳密。

## Migration 安全邊界

- 正式 active migration chain：`prisma/migrations/`
- 舊 ERP migration 封存：`legacy/erp-mvp/prisma/migrations/`
- 舊 migration 只供追溯，不得修改，也不會由 Prisma 正式設定執行。
- 正式 migration chain 依序為 `0001_p1_foundation_baseline`、`0002_p1_authentication_and_access`。
- 兩筆 migration 目前只能套用到全新或獨立 P1 測試資料庫。
- 未經另行核准，不得對現有 `erp` database 執行正式 baseline。
- 禁止自行執行 `prisma migrate reset`、drop database、drop schema 或清除 Docker volume。

## 獨立 P1 測試資料庫

啟動不同 container 與 port 的測試 PostgreSQL：

```powershell
docker compose -f compose.p1-test.yaml up -d
```

在 PowerShell 設定測試連線後套用正式 migration：

```powershell
$env:DATABASE_URL = "postgresql://p1_test:p1_test_only@localhost:55432/erp_p1_test_a"
npm run db:deploy
```

此連線不得改成目前開發資料庫，除非已取得明確的資料庫重建核准。

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
- `GET /api/health/ready`：Web process 可連線 PostgreSQL。

登入後由後端驗證 Session、帳號狀態、角色及公司範圍。Browser cookie 為 HttpOnly、SameSite=Lax，正式環境另啟用 Secure；資料庫只保存 Session token 的 SHA-256 hash。Session 閒置 8 小時到期，活動時間依設定節流更新。

## 驗證命令

```powershell
npm run prisma:validate
npm run prisma:generate
npm run lint
npm run typecheck
npm run test
$env:P1_TEST_DATABASE_URL = "postgresql://p1_test:p1_test_only@localhost:55432/erp_p1_test_a"
npm run test:db
npm run build
```

Schema 與測試資料庫一致性：

```powershell
$env:DATABASE_URL = "postgresql://p1_test:p1_test_only@localhost:55432/erp_p1_test_a"
npx prisma migrate diff `
  --from-config-datasource `
  --to-schema .\prisma\schema.prisma `
  --exit-code
```

## 舊 ERP 程式

P1.1 前的舊 ERP 程式完整保留於 `legacy/erp-mvp/src/`，但已移出 Next.js、TypeScript 與正式導覽入口。庫存、倉庫、批號、採購、stock movement、舊 delivery、舊 AR/AP 均不屬於正式第一階段基線。
