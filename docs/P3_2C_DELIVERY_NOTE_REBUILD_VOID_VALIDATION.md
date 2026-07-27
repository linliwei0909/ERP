# P3.2c 銷貨單修訂重建與 ADMIN 直接作廢驗證

文件日期：2026-07-27

文件狀態：P3.2c 工程驗證完成；P3.2d API／UI 尚未開始

操作者：Codex

## 1. 起始狀態

- Branch 為 `main`，起始正式 commit 為 `00b7368 feat(delivery-notes): implement P3.2b core service`，起始時與 `origin/main` 同步。
- 正式 migration chain 為 0001～`0010_p3_delivery_notes`；本機 `erp` 起始 migration status up to date、schema diff=0。
- 起始 live／ready／worker health 均為 HTTP 200。
- 起始工作樹只有未追蹤的 `docs/INVENTORY_PRODUCTION_BLUEPRINT.md`；該 P4 規劃文件未修改、未 stage、未 commit。
- 本輪未修改 Prisma schema、0001～0010 migration，也未建立 0011。

## 2. 實作範圍

P3.2c 完成下列 transaction service 與既有 order workflow 整合：

- `rebuildDeliveryNoteForOrder`
- `adminVoidDeliveryNote`
- `DELIVERY_CREATED -> DRAFT` revision start 且保留舊 `ACTIVE` 銷貨單
- DRAFT 重新確認後的 `CONFIRMED` order／上一版 `ACTIVE` delivery note controlled state
- `ORDER_REVISION_REBUILD` replacement chain
- `ADMIN_DIRECT` 例外作廢
- Typed errors、RBAC、company scope、row lock、audit、idempotency 與 atomic rollback
- `getDeliveryNote` 的 replaced／replacement note 及 void actor 最小查詢擴充

本輪沒有建立 delivery-note API、UI、PDF、列印、實際送貨日、紙本回收確認、應收、庫存、生產或其他後續功能。

## 3. Revision start 與重新確認

Order 為 `DELIVERY_CREATED` 時，revision start 依固定順序 lock order，再驗證目前唯一非 `VOIDED` 銷貨單為 `ACTIVE` 且 revision 相符。成功後：

- order revision 加一並回到 `DRAFT`
- 清除 `confirmed_at`／`confirmed_by`
- 舊銷貨單保持 `ACTIVE`
- 舊 snapshot、lines、status、void 欄位與 replacement reference 均不變
- 只寫 order revision audit，不取新號、不建立新銷貨單

重新確認後允許 order=`CONFIRMED`、order revision 較新、舊 `ACTIVE` 銷貨單仍代表前一 revision。此時普通 `createDeliveryNoteFromOrder` 回傳 `DELIVERY_NOTE_REBUILD_REQUIRED`，只能明確執行 rebuild。

## 4. Rebuild transaction 與 lock order

固定順序：

1. Claim／驗證 `delivery_note.rebuild` idempotency。
2. Lock sales order。
3. Server-side 查詢並 lock 目前唯一非 `VOIDED` delivery note。
4. 驗證 order、old note、revision、snapshot、line 與 replacement prerequisite。
5. 解析 Asia/Taipei business date 與有效公司單據代碼。
6. Lock／更新 `DELIVERY_NOTE` document sequence。
7. 因 0010 partial unique 限制，同一 transaction 先將舊單改為 `VOIDED/ORDER_REVISION_REBUILD`。
8. 建立新 `ACTIVE` header 及依 line number 逐筆建立 lines；新單以 `replaced_delivery_note_id` 指向舊單。
9. Order `CONFIRMED -> DELIVERY_CREATED`。
10. 寫入 `delivery_note.rebuilt` 與 `sales_order.delivery_rebuilt` audit。
11. 完成 idempotency 並 commit。

任一步驟失敗時，舊單恢復 `ACTIVE`、void 欄位仍為 null、order 保持 `CONFIRMED`、新 header／lines／replacement 不存在、sequence 不提交、成功 audit 不存在，idempotency 依既有 lifecycle 記為 `FAILED`。

## 5. Replacement chain 與查詢

- Chain 只向前延伸，例如 DN1 VOIDED <- DN2 VOIDED <- DN3 ACTIVE。
- 舊單必須是目前唯一非 `VOIDED` 銷貨單、同公司、同 order、revision 較舊且尚未被其他單取代。
- Client 不可指定 old note、new number、date、status 或 replacement target。
- `getDeliveryNote` 回傳 `replacedDeliveryNote`、`replacementDeliveryNote`、`voidSource`、`voidReason`、`voidedAt`、`voidedBy` 與 `salesOrderRevisionNo`。
- `getCurrentDeliveryNoteForOrder` 在 rebuild 後回傳新單；ADMIN direct void 後回傳 null。

## 6. Rebuild idempotency 與 audit

Operation 為 `delivery_note.rebuild`。Canonical payload 包含 company、order、expected revision、server-known old note reference、actor 與 reason，不包含新號、日期或建立時間。

- TTL 內相同 key／payload replay 原 result reference，不再取號、作廢、建單或寫 audit。
- 相同 key／不同 payload 回 idempotency conflict。
- 成功 audit 包含公司、order、old/new revision、old/new note id／number、新日期、`ORDER_REVISION_REBUILD`、actor、correlation ID 與 reason。
- 不另寫語意重複的 `delivery_note.voided`。

## 7. ADMIN direct void

只有具 `delivery_notes.admin_void` 且具有 company scope 的 ADMIN 可執行。理由 trim 後必填，client 不可指定 void source、時間或 actor。

Transaction 固定先解析關聯，再依 order→current note 順序鎖定：

- Current note 必須為 `ACTIVE`，order 必須為 `DELIVERY_CREATED`。
- Note 改為 `VOIDED/ADMIN_DIRECT`，保存 reason、actor 與 transaction time。
- Order `DELIVERY_CREATED -> CONFIRMED`。
- 寫入一筆 `delivery_note.voided`，其 metadata 同時記錄 order 前後狀態。
- 完成 `delivery_note.admin_void` idempotency。
- 不自動建立新單；後續普通 create 使用新號，舊號不回收。

相同 key／payload replay 不重寫 audit；相同 key／不同理由衝突。ORDER_ENTRY、無 scope、空白理由、重複作廢、`SHIPPED` 與 `RECEIVABLE_CREATED` 均被拒絕。

## 8. Typed errors

本輪新增並驗證：

- `DeliveryNoteRebuildRequiredError`
- `DeliveryNoteRebuildNotAllowedError`
- `DeliveryNoteReplacementConflictError`
- `DeliveryNoteAdminVoidNotAllowedError`
- `DeliveryNoteVoidReasonRequiredError`
- `DeliveryNoteDownstreamLockedError`

既有 permission、revision mismatch、not found、invariant 與 idempotency conflict errors 維持獨立語意。

## 9. Atomic rollback 驗證

使用 test-only PostgreSQL function／trigger 注入失敗，並於每個案例後清除：

- Rebuild：新 header insert、line insert、order update、audit insert。
- ADMIN direct void：note update、order update、audit insert。

所有案例均驗證 transaction 後 note／order、void 欄位、replacement、sequence、audit 與 idempotency lifecycle 一致，沒有部分資料。

## 10. 第一次完整 DB suite 與 test-only 修正

第一次使用 `erp_p3_2c_test_run_20260727_01`：

- 0001～0010 deploy 成功、migration up to date、schema diff=0。
- 完整 DB suite 為 13 files／121 tests，其中 119 passed、2 failed。
- Replay 測試時間恰好落在 idempotency `expiresAt` 邊界，正式 TTL 規則因此重新執行 handler。
- DRAFT fixture 為 revision 1，卻以 expected revision 2 呼叫，正式 validation 先回 revision mismatch。
- 沒有 production bug 證據，依 fail-fast 停止。

續驗只修改 DB test：

- Replay 改為首次 rebuild 後 5 分鐘，明確位於 TTL 內；原 replay assertion 完整保留。
- DRAFT fixture 改為 revision 2，使案例只驗證 DRAFT status rejection；typed error assertion 完整保留。
- 未修改 production TTL、clock、validation 順序、state machine、schema 或 migration。

## 11. 新 disposable DB 與測試結果

新建 `erp_p3_2c_test_run_20260727_02`，建立前名稱不存在且 public schema 無 relation；沒有 copy／restore `_01`，也沒有使用本機 `erp` 作為測試庫。

| Gate | 結果 |
|---|---|
| 0001～0010 migrate deploy | 全部成功 |
| Migration status | up to date |
| Prisma schema diff | `No difference detected` |
| Delivery-note workflow suite | 1 file／16 tests 全部通過 |
| 完整 DB／workflow suite | 13 files／121 tests 全部通過 |
| Unit tests | 17 files／87 tests 全部通過 |
| Lint | 通過 |
| Typecheck | 通過 |
| Production build | 通過 |
| Prisma validate／generate | 通過 |
| `git diff --check` | 通過 |

測試沒有新增 skip、todo、only 或放寬 assertion。執行期間仍出現既有 `pg` concurrent-query deprecation warning，但沒有 test failure；後續若需消除，應另案處理，不在本輪擴大 production 修改。

## 12. 本機 erp 唯讀確認

- Datasource：`localhost:5432/erp?schema=public`
- Migration：0001～0010，status up to date
- Schema diff：`No difference detected`
- Live：HTTP 200，`status=ok`
- Ready：HTTP 200，`status=ready`
- Worker：HTTP 200，`status=ready`

本輪沒有向本機 `erp` 寫入 P3.2c 測試交易。

## 13. 結論

P3.2c 的核心 transaction service、state-machine integration、replacement chain、ADMIN direct void、typed errors、audit、idempotency 與 atomic rollback 已完成工程驗證。P3.2 整體尚未完成，因 P3.2d API／UI 與後續 P3.2e 整合驗收尚未開始。

具備提出 P3.2d 規劃／實作範圍的工程條件，但未取得下一步授權前不得開始。
