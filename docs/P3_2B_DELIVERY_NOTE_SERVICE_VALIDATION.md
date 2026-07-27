# P3.2b 銷貨單核心 Service 驗證

執行日期：2026-07-27
規格基線：`DECISIONS.md` V0.10／DEC-057
工程範圍：銷貨單建立、查詢、訂單作廢內部連動、RBAC、transaction、row lock、idempotency、audit 與測試
明確排除：API、UI、revision rebuild、ADMIN direct void、出貨、應收、列印、PDF、庫存、生產與 P3.2c 以後功能

## 1. 起始狀態

- Branch 為 `main`，起始時與 `origin/main` 同步。
- 起始工作樹只有既有、未追蹤的 `docs/INVENTORY_PRODUCTION_BLUEPRINT.md`。
- 本機 `erp` migration chain 為 0001～0010、status up to date、schema diff=0。
- Live、ready、worker health 均為 HTTP 200。
- P3.2a 的 Prisma schema、0010 與 catalog contract 已完成；尚無 delivery-note service、API 或 UI。
- 本輪未修改 Prisma schema、0010 或任何既有 migration，也未建立 0011。

## 2. 實作範圍

新增 `web/src/lib/delivery-notes/`：

- `types.ts`：建立結果、明細、清單、目前有效單與 snapshot types。
- `errors.ts`：not found、access denied、prerequisite、already exists、revision mismatch、idempotency conflict、invariant typed errors。
- `validation.ts`：清單 filter、Asia/Taipei business date 與單號格式。
- `snapshots.ts`：只從已確認訂單快照複製 header／lines，並驗證 Decimal 金額。
- `service.ts`：建立、單筆、清單、目前有效單及訂單作廢內部 helper。

本輪沒有建立 route、page、browser action 或 delivery-note UI。

## 3. RBAC 與公司範圍

新增 `delivery_notes.read`、`delivery_notes.manage`、`delivery_notes.admin_void`。`ADMIN` 具有三項權限；`ORDER_ENTRY` 具有 read／manage，但沒有 admin_void。P3.2b 只使用 read／manage，沒有實作 ADMIN direct void。

所有公開 service 先驗證 permission 與 `authorizedCompanies`；ADMIN 也不能略過 company scope。未授權查詢不先洩漏資料是否存在。

## 4. 建立流程與 transaction

`createDeliveryNoteFromOrder` 維持單一 application transaction：

1. 依既有 protocol claim idempotency。
2. `SELECT ... FOR UPDATE` 鎖定 sales order。
3. Server-side 查詢並鎖定目前 `status <> 'VOIDED'` 的銷貨單。
4. 驗證 company、order=`CONFIRMED`、expected revision、確認 actor／時間、快照及至少一筆有效明細。
5. 以 server `Asia/Taipei` business date 產生 `delivery_note_date`。
6. 依該日期解析 `document_company_code`。
7. 在 transaction 中配置 `DELIVERY_NOTE` 月流水號。
8. 建立 `ACTIVE` header。
9. 依 `line_number` 穩定順序逐筆建立 lines。
10. 更新 order 為 `DELIVERY_CREATED`，revision 不變。
11. 寫入 `delivery_note.created` 與 `sales_order.delivery_created`。
12. 在相同 transaction 完成 idempotency。

相同 key＋相同 payload replay 原單，不重取號、不重寫 audit；相同 key＋不同 payload conflict。不同 key 並行建立同一 order 時，row lock 加 partial unique 使最多一筆成功。

## 5. Header／lines production bug 與修正

`erp_p3_2b_test_run_20260727_02` 的單獨 suite 證實 Prisma checked nested input `DeliveryNoteLineCreateWithoutDeliveryNoteInput` 不接受直接提供 `companyId`，原 nested create 回傳：

```text
Unknown argument `companyId`
```

修正方式：

- 先以 `tx.deliveryNote.create` 建立 header。
- 再於同一 transaction 依 line number 逐筆呼叫 `tx.deliveryNoteLine.create`。
- 每筆明確保存 `deliveryNoteId`、`companyId`、來源 order line、item、兩個 snapshot、quantity、unit price、amount 與 created actor。
- 不使用 nested transaction、`Promise.all`、`skipDuplicates` 或 transaction 外寫入。

修正沒有變更 row lock、idempotency fingerprint、sequence、snapshot、audit event 或 order transition。

## 6. Snapshot、Decimal 與 atomic rollback

銷貨單只複製已確認 order header／line typed snapshots、payment terms、freight snapshot 與凍結金額，不重新讀 customer／item master 作為交易值、不重新查價、不重算運費。測試在建立前修改 customer、item 及 freight rule，銷貨單仍保存 order 確認值。

金額使用 Prisma Decimal 比對，不轉 JavaScript float；line amount 合計必須等於 subtotal，subtotal＋freight amount 必須等於 total amount。

DB workflow test 以 test-only PostgreSQL trigger 注入 line insert failure，並在 `finally` 移除 trigger／function，驗證：

- Header／lines 不存在。
- Order 仍為 `CONFIRMED`。
- 兩種 audit 均未增加。
- Idempotency 依既有 lifecycle 為 `FAILED`，不是 `COMPLETED`。
- `document_sequences.last_value` 回到交易前值。
- 沒有非 `VOIDED` 銷貨單。

## 7. Order void 與查詢

`voidDeliveryNoteForOrderVoid` 只供 sales-order void transaction 內部使用：只允許 `ACTIVE`，以 `ORDER_VOID` 作廢；`SHIPPED`／`RECEIVABLE_CREATED` 拒絕。本輪未建立公開 delivery-note void service，未實作 `ADMIN_DIRECT`。

查詢 service：

- `getDeliveryNote`：公司 scoped header、lines、order number 與 replacement reference。
- `listDeliveryNotes`：status、order、number、日期、customer snapshot keyword、分頁及 deterministic sorting。
- `getCurrentDeliveryNoteForOrder`：server 查詢 `status <> 'VOIDED'`，不使用 order current pointer；沒有資料回傳 null。

## 8. Fixture 失敗與修正

第一次 `_01` 完整 DB suite 發現：

- DOMESTIC customer 缺少相符的 `tax_id`。
- 測試使用正式 `IN`／`BI`，與 company-settings bootstrap 的全系統唯一單據公司碼衝突。

Fixture 改為相同隨機 suffix 的 `tax_id`／`normalized_tax_id`，並從 DB 現有 setting 中選取兩個未使用、排除 `IN`／`BI`／`TA` 的兩碼大寫測試 code。測試不清除、truncate 或修改其他 suite 資料，可在同一 DB 再次執行。

## 9. Disposable DB 與測試

正式驗證 DB：`erp_p3_2b_test_run_20260727_03`

- 建立前不存在，public schema 為空。
- 0001～0010 deploy 成功。
- Migration status up to date；schema diff：`No difference detected`。
- Migration history：10 success、0 pending／unresolved、0 rolled-back。
- Delivery-note 單獨 suite：1 file／9 tests 全部通過，無 skipped。
- 完整 DB suite：13 files／114 tests 全部通過，無 skipped。

新增的第 114 項為 line failure atomic rollback。並行建立測試時 `pg` 顯示 client concurrent-query 的未來棄用警告，但 exit code 為 0、沒有 retry，且並行唯一性 assertion 通過。

## 10. 品質 Gate 與本機 erp

- Lint、typecheck：通過。
- Unit：17 files／84 tests 通過。
- DB：13 files／114 tests 通過。
- Production build：通過。
- Prisma validate／generate：通過。
- `git diff --check`：通過。
- Build 路由沒有 delivery-note API 或 UI。

本輪沒有在本機 `erp` 建立、修改或刪除測試交易。唯讀確認 datasource `localhost:5432/erp?schema=public`、0001～0010 up to date、schema diff=0，且 live／ready／worker 均 HTTP 200。

## 11. 未實作範圍與結論

未實作 revision replacement／rebuild、ADMIN direct void、delivery-note API／UI、`SHIPPED`／`RECEIVABLE_CREATED` transition、PDF、列印、actual delivery date、紙本回收確認、應收、庫存或生產。

P3.2b 核心 service 已完成工程驗證，具備人工審查與 Git 收尾條件。P3.2 整體尚未完成；P3.2c 必須另案核准，本輪未開始。
