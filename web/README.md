# Ragic 本地端系統

目前進度為 P1.1「正式 UUID baseline 設計與非破壞性驗證」。正式應用只包含技術基線與健康檢查，尚未啟用任何業務模組。

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
```

正式環境不得使用 repository 中的開發帳密。

## Migration 安全邊界

- 正式 active migration chain：`prisma/migrations/`
- 舊 ERP migration 封存：`legacy/erp-mvp/prisma/migrations/`
- 舊 migration 只供追溯，不得修改，也不會由 Prisma 正式設定執行。
- `0001_p1_foundation_baseline` 只能先套用到全新空白資料庫。
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

## 開發

```powershell
npm install
npm run prisma:generate
npm run dev
```

健康檢查：

- `GET /api/health/live`：Web process 可回應。
- `GET /api/health/ready`：Web process 可連線 PostgreSQL。

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

## 舊 ERP 程式

P1.1 前的舊 ERP 程式完整保留於 `legacy/erp-mvp/src/`，但已移出 Next.js、TypeScript 與正式導覽入口。庫存、倉庫、批號、採購、stock movement、舊 delivery、舊 AR/AP 均不屬於正式第一階段基線。
