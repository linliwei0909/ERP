# P3.2d2 Delivery-note UI 驗證

執行日期：2026-07-27
基線：`3602072 fix(delivery-notes): expose creator in detail API`
狀態：工程實作與驗證完成，尚未 stage、commit 或 push

## 1. 範圍

- 新增銷貨單清單與明細頁。
- 在銷售訂單明細提供建立銷貨單及 revision 重建入口。
- ADMIN 可在有效銷貨單明細輸入必填原因並執行直接作廢。
- 依既有 `delivery_notes.read`、`delivery_notes.manage`、`delivery_notes.admin_void` 權限控制頁面、導覽與操作。
- 沿用 P3.2d1 API、service、strict DTO、idempotency 與 typed error contract。
- 未新增或修改 schema、migration、package dependency、lockfile、API route 或 production workflow。
- 未實作列印、PDF、實際送貨日、回收確認、應收、庫存、生產或 P4 blueprint。

## 2. UI 行為

- 清單支援現有 API 已核准的狀態、單號、客戶、日期與分頁條件，並提供 loading、empty、invalid-filter 與 load-error state。
- List API summary contract 維持不含 `createdBy`；清單頁在 server 以單一 company-scoped bulk query補齊目前頁面的建立者，不做 N+1，也不擴張 API contract。
- 明細顯示來源訂單／revision、客戶、送貨快照、品項快照、數量、單價、金額、建立者、建立時間、replacement history 與作廢資訊。
- 訂單為 `CONFIRMED` 且沒有有效銷貨單時顯示建立入口；revision 較新且仍有舊有效單時顯示重建入口與必填理由。
- Mutation 使用既有 API 與 `Idempotency-Key`，以 pending state 與同步 busy guard 防止重複提交；成功後導向明細並 refresh。
- ADMIN direct void 使用必填理由、確認區塊及 pending guard；403、404、409 與 validation message 保留後端語意。
- ORDER_ENTRY 不會看到 ADMIN direct void；無 read 權限者導向拒絕存取頁。

## 3. 測試

- 新增清單主要 rendering、empty state、明細 snapshot、作廢資訊與無權限操作隱藏測試。
- 新增訂單建立／重建 action eligibility 測試。
- 新增建立成功、建立 conflict、作廢成功、作廢理由 validation、403／404／409 error semantics、idempotency header 與 duplicate submission coalescing 測試。
- 更新 P3.2a 階段的「UI 必須不存在」舊邊界，改為驗證 P3.2d2 正式 UI 路徑存在；schema contract 與禁止替代 service path 的斷言維持。

## 4. 驗證結果

- Delivery-note UI／API targeted：2 files／35 tests，全部通過。
- 完整 unit：19 files／122 tests，全部通過。
- Lint：通過。
- Typecheck：通過。
- Production build：通過；`/delivery-notes` 與 `/delivery-notes/[id]` 均成功產生 dynamic route。
- `git diff --check`：通過。

本輪未執行 DB tests。原因是修改範圍只包含 server-rendered UI、client mutation adapter、既有 service 的唯讀呼叫與 unit tests；沒有修改 schema、migration、service、API route、RBAC 定義或 mutation workflow。P3.2d1／P3.2d1a 已在 disposable DB 完成 13 files／124 tests及 delivery-note workflow 1 file／19 tests驗證，本輪沒有新的資料庫 contract 需要重跑。

## 5. 結論

P3.2d2 Delivery-note UI 已具備獨立 Git 範圍審查與收尾條件。本輪仍未 stage、commit 或 push，`docs/INVENTORY_PRODUCTION_BLUEPRINT.md` 保持未追蹤且未修改。
