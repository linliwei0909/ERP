# P3.2d1a Delivery-note 建立者 API Contract 驗證

執行日期：2026-07-27
狀態：P3.2d1 API contract 最小補件完成；P3.2d2 UI 尚未開始

## 1. 範圍

- 只補齊 Delivery-note detail、current 與 mutation response 的正式建立者資訊。
- 沿用既有 `delivery_notes.created_by` 必填 FK 與 `DeliveryNoteActorSummary`。
- 未修改 Prisma schema、0001～0010 migration、資料庫 transaction、狀態機、RBAC、audit、idempotency、sequence 或 mutation workflow。
- 未建立 UI、client hook、PDF、列印、應收、庫存、生產或 P3.2d2 功能。
- `docs/INVENTORY_PRODUCTION_BLUEPRINT.md` 維持既有未追蹤 P4 規劃文件，本輪未修改。

## 2. 正式 API contract

完整銷貨單回應新增：

- `createdById: string`：不可為空，直接對應既有 `created_by`。
- `createdBy: { id: string; username: string }`：不可為空的最小 actor summary。

適用於：

- `GET /api/delivery-notes/{id}`
- `GET /api/sales-orders/{id}/delivery-note`
- Create、rebuild 與 ADMIN direct void mutation response

List response 維持既有 summary DTO，不新增 `createdById` 或 `createdBy`。

## 3. 查詢與序列化

- `loadDeliveryNote` 與 current-note detail query 在原查詢內 select `createdBy.id`、`createdBy.username`，沒有 N+1 查詢。
- DTO mapper 明確複製最小建立者摘要。
- List mapper 使用固定欄位白名單，避免 detail-only 欄位意外外洩至 list。
- 回應不包含 password hash、session、token、角色或公司 scope。
- `createdAt` 契約與既有 replacement／void actor 資訊保持不變。

## 4. Lifecycle

- 初次建立：`createdById` 與 `createdBy.id` 為建立銷貨單的 actor。
- Idempotency replay：建立者資訊與原結果一致。
- Rebuild：新 replacement 的建立者為執行 rebuild 的 actor；被作廢舊單的原建立者保持不變。
- ADMIN direct void：只更新 `voidedBy` 等作廢欄位，不覆寫原 `createdBy`。

## 5. 驗證結果

- Targeted typecheck：通過。
- Delivery-note API／service unit tests：2 files／33 tests，全部通過。
- 最終 fresh disposable DB：`erp_p3_2d1a_creator_contract_20260727_02`。
- Fresh migration：0001～0010 全部成功，migration status up to date，schema diff 為零。
- 完整 DB／workflow suite：13 files／124 tests，全部通過，0 skipped；建立者 lifecycle 專項為 1 file／19 tests，全部通過。
- Lint：通過。
- Typecheck：通過。
- 完整 unit suite：18 files／109 tests，全部通過。
- Production build：通過。
- Prisma validate／generate：通過。
- 本機 `erp` 唯讀 gate：0001～0010 up to date、schema diff 為零。
- `/api/health/live`、`/api/health/ready`、`/api/health/worker`：HTTP 200，web ready 且 worker heartbeat ready。

測試資料只寫入獨立 `localhost:55432` disposable DB。本機 `localhost:5432/erp` 未套用 migration、未執行 DB tests，也未進行資料 mutation。

### 5.1 `DATABASE_URL` 誤指本機唯讀事件

- 驗證期間曾有一次命令的 `DATABASE_URL` 引號未生效，實際 datasource 指向本機 `localhost:5432/erp`。
- 該次只執行 migration status 與 schema diff；結果為 0001～0010 up to date、schema diff 為零。
- 該次未執行 migration、DB test、測試資料寫入或任何 mutation，不得描述為已對本機 `erp` 執行測試。
- 後續所有 mutation 測試均使用獨立 `localhost:55432` disposable DB。

### 5.2 Git 收尾 DB test 環境與最終結果

- 第一次 Git 收尾執行 `test:db` 時未設定 `DATABASE_URL`，suite 在載入第一個 DB test file 前失敗，沒有執行測試或 DB mutation。
- 第二次已設定 `DATABASE_URL`，但未設定 DB test activation guard 使用的 `P1_TEST_DATABASE_URL`；正式 script exit code 雖為零，13 files／124 tests 實際全部 skipped，因此未視為驗收通過。
- 最終沿用尚無非 migration 測試資料的 disposable DB `erp_p3_2d1a_test_run_20260727_02`，在同一 PowerShell session 將 `DATABASE_URL` 與 `P1_TEST_DATABASE_URL` 設為完全相同的 `localhost:55432` datasource。
- 該 DB 的 0001～0010 migration status up to date、schema diff 為零；正式單 worker `test:db` 實際執行 13 files／124 tests，全部通過，0 failed、0 skipped。
- Delivery-note workflow 專項實際執行 1 file／19 tests，全部通過，0 skipped。
- 收尾後本機 `localhost:5432/erp` 仍只執行 migration status、schema diff 與 health checks；0001～0010 up to date、schema diff 為零，live／ready／worker 均為 HTTP 200，未執行測試或 mutation。

## 6. 結論

P3.2d1a 建立者 API contract 補件已具備工程驗收條件。這項補件只解除 P3.2d2 顯示建立人資訊的 API 阻塞，不代表已開始或完成 P3.2d2。
