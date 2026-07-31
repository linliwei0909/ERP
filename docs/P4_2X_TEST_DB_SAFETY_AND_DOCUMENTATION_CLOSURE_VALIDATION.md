# P4.2.x Test DB Safety 與文件同步 Closure 驗證

文件狀態：實作與正式驗證完成，待獨立 Git 收尾
日期：2026-07-31

## 1. Git 基線

- Branch：`main`
- 起始 HEAD／`origin/main`：`29e68fff4cbd005443c0d228563a81e36ecf403d`
- Ahead／behind：`0 / 0`
- 起始 staged／tracked diff：無
- 唯一 untracked：受保護 `docs/INVENTORY_PRODUCTION_BLUEPRINT.md`
- Blueprint：20,880 bytes；SHA-256 `930121B91B470DFF25596AE50309060155CF7C0F4B78251184EB13B493AF95B7`；修改時間 2026-07-27 11:03:17

## 2. Claude DB test 偏差事件摘要

指令指定的 `P4_2_全系統架構審查報告.md` 在 repository 根目錄不存在，因此沒有引用或採納該檔案中的未核准建議。本輪依 Closure 指令提供的事件描述、repository 實際測試流程及 Docker metadata 重新驗證。

既有 `test:db` 直接執行 `vitest run tests/db --maxWorkers=1`。15 個 DB test files 原本各自以 `P1_TEST_DATABASE_URL` 是否存在決定執行或 `describe.skip`；沒有集中驗證 URL target，也沒有 suite-level cleanliness preflight。當它指向曾執行測試的共用 DB，殘留資料可能到 suite 中途才造成 unique constraint 衝突。

## 3. 舊測試容器

- Container：`erp-p1-test-postgres`
- Image：`postgres:17-alpine`
- 狀態：running／healthy
- Host mapping：`localhost:55432` → container `5432`
- Compose project／service：`web`／`p1-test-postgres`
- 預設 database／role：`erp_p1_test_a`／`p1_test`
- Volume：anonymous local volume `a0f01953d1ef88e43a4fe68f89f62115d552035de69e6ad01775e51bf40327b0`
- Docker metadata 顯示該 volume 只由此容器掛載；一般開發 DB 使用不同 named volume。
- 該容器與一般開發 PostgreSQL、worker 共用 `web_default` network；worker 實際指向 `postgres:5432/erp`，不是此 test DB。

未停止或移除容器及 volume。雖可確認 Compose test 身分與 volume 未被其他 container 掛載，仍無法只靠 Docker metadata 排除外部 host process 依賴；未達指令要求的全部安全移除條件。

## 4. Test DB guard 設計

- `web/vitest.config.mts` 只在 Vitest 命令列目標包含 `tests/db` 時掛接一次性的 global setup，不影響 production runtime 或 unit-only run。
- Pure helper 分開處理 URL 靜態契約及 runtime cleanliness，方便無 DB 的單元測試。
- 必須同時提供 `P1_TEST_DATABASE_URL` 與 `DATABASE_URL`，且解析後指向相同 host、port、database 與 role；兩者可且在正式流程中刻意使用完全相同 URL。
- 合法 target 必須為 local host、isolated port `55432`、dedicated role `p1_test`、`public` schema，以及具 `erp_` 前綴、`test`／`closeout` 標記、八碼日期與唯一 suffix 的 disposable database name。
- Preflight 只顯示 host、port、database、role；錯誤會遮蔽完整 connection string 與 password。
- 連線後重新核對 `current_database()`／`current_user`，再檢查 `_prisma_migrations` 以外的 public tables 均無資料。
- Guard 不執行 reset、drop、truncate、delete 或任何自動 cleanup。

## 5. 新增或修改檔案

Test DB guard：

- `web/vitest.config.mts`
- `web/tests/db-test-global-setup.ts`
- `web/tests/helpers/test-database-safety.ts`
- `web/README.md`

Tests：

- `web/tests/unit/test-database-safety.test.ts`
- `web/tests/unit/app-shell.test.tsx`

Accessibility：

- `web/src/app/(authenticated)/error.tsx`
- `web/src/app/(authenticated)/not-found.tsx`

Governance 與 follow-up：

- `docs/DECISIONS.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/TECHNICAL_ARCHITECTURE.md`
- `docs/business-rules.md`
- `docs/DATABASE_DESIGN.md`
- `docs/OPEN_QUESTIONS.md`
- 本文件

## 6. 新增測試

Test DB safety unit tests涵蓋：

- 合法 disposable target。
- `P1_TEST_DATABASE_URL` 缺失時 fail，不得 skip。
- 開發／正式 target 拒絕。
- protocol、host、role、port、database naming 或 schema 不符合契約時拒絕。
- `DATABASE_URL` 與 `P1_TEST_DATABASE_URL` 分流時拒絕。
- 兩者指向同一全新 disposable DB 時通過。
- URL 與 password redaction。
- empty migrated DB 通過 runtime cleanliness。
- populated table fail，且不產生破壞性 SQL。

App Shell test新增 error／not-found route 各恰好一個 `<main>` 的 source contract，並保留 error digest、retry 與 not-found return 行為。

## 7. Disposable DB 與 migrations

- Database：`erp_p4_2x_closeout_20260731_1608`
- 建立前確認：不存在
- Host／port：`localhost`／`55432`
- Role：`p1_test`
- `DATABASE_URL`／`P1_TEST_DATABASE_URL`：同一 PowerShell process 內指向同一 target
- Migrations：12 found，`0001`～`0012` 全部成功套用
- 沒有修改、新增或 reset migration；沒有重用或清除既有 DB。

## 8. 正式驗證結果

- `npm run lint`：passed。
- `npm run typecheck`：passed；Next route type generation passed，TypeScript passed。
- `npm run prisma:validate`：passed。
- `npm run test`：25 files、209 tests passed、0 failed、0 skipped。
- `npm run db:deploy`：12 migrations successfully applied。
- `npm run test:db`：guard target／cleanliness passed；15 files、149 tests passed、0 failed、0 skipped。
- `npm run build`：passed；37 static pages generated，route manifest完整。
- Build仍有既有 delivery-note font NFT tracing warning，import trace指向 `src/lib/delivery-notes/font.ts`／renderer／formal-print；非本次差異，未處理。
- DB suite仍輸出既有 `pg` concurrent query deprecation warning；suite結果通過，未藉本輪擴大修改。
- `git diff --check`／`git diff --cached --check`：passed。

## 9. 五份治理文件同步

- `DECISIONS.md`：記錄 P4.2 完成日期、closure commit、完成範圍、P4.3 next與P5未開始；既有正式決議不變。
- `IMPLEMENTATION_PLAN.md`：P4.2標示完成，下一正式階段為P4.3，更新本輪限制。
- `TECHNICAL_ARCHITECTURE.md`：記錄已落地 App Shell presentation architecture與未變更的 backend／database boundaries。
- `business-rules.md`：只同步階段狀態，明確確認既有業務、transaction、audit、idempotency與formal-print規則不變。
- `DATABASE_DESIGN.md`：只同步階段狀態，明確確認 P4.2 schema／migration 為 0 變更。

## 10. 禁止範圍驗證

以下均為 0 diff：

- Prisma schema／migration
- package／lockfile
- RBAC／role／permission
- session model／cookie contract
- API response contract
- state machine
- transaction／locking
- audit／idempotency
- formal print／immutable snapshot
- P5文件與實作
- 受保護 Blueprint

沒有開始 P4.3、P4.4 或 P5，也沒有重構 App Shell、navigation registry 或既有業務頁面。

## 11. 尚未決策事項

- `ADMIN` 是全系統管理員或仍受 authorized company scope 限制，以及 `admin/users/*` 的跨公司管理邊界。
- 新 UI 是否一律以 session active company 為 company context、URL `companyId` 的例外，以及既有頁面 selector 於 P4.4 的移除 convention。
- P4.3 應先固定 `PageHeader`／`PageContainer` contract；P4.4 前需建立既有頁面遷移 convention。

上述項目以 OQ-052～OQ-054 中立記錄，未修改 RBAC、session、company switch API 或業務頁面。

## 12. Git 最終狀態

- Staged diff：無。
- Tracked diff：限本文件所列核准 Closure 範圍。
- Untracked：本輪新增 guard／tests／validation 文件，以及原受保護 Blueprint。
- 未 stage、未 commit、未 push。
- Blueprint metadata與SHA-256在最終驗證再次確認。

## 13. 判定

`P4.2.x Test DB Safety 與文件同步 Closure 實作完成，保持未 stage、未 commit、未 push，可進行獨立 Git 收尾。`
