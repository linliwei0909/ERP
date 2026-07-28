# P3.3e 正式列印鎖定順序契約修正驗證

## 1. Scope

本切片只修正首次正式列印、補印及直接相關文件與測試的 row-lock 順序。未改變 API／UI、PDF renderer、idempotency、狀態機、schema、migration 或 P4 範圍。

## 2. Baseline commit

基線為 `59121b17e113bcbeae1ececbef0b6ebae75ef500`；開始時 `main`、`HEAD` 與 `origin/main` 相同，ahead／behind 為 `0 / 0`，唯一未追蹤檔案為排除範圍內的 `docs/INVENTORY_PRODUCTION_BLUEPRINT.md`。

## 3. 發現問題

P3.3c 的 `formalPrintDeliveryNote` 與 `reprintDeliveryNote` 實際先 `FOR UPDATE` Delivery Note，再由已鎖 row 解析並鎖 Sales Order。P3.3c validation 與 technical architecture 也記錄相同反向順序。

## 4. 正式規格優先級

依專案規格優先級，`docs/DECISIONS.md` 的 DEC-058 高於 P3.3 plan、validation、architecture 與 implementation plan。DEC-058 規定先 claim idempotency，再依 order、delivery note 順序取得 row lock；本次未修改 `DECISIONS.md`。

## 5. 原錯誤順序

`idempotency → Delivery Note → Sales Order`

## 6. 修正後順序

`idempotency → Sales Order → Delivery Note`

Print Version 由 `delivery_note_id` unique constraint 保護，首次 `FORMAL_PRINT` event 由 partial unique index 保護；目前未對不存在的 invariant row 新增無意義 row lock。

## 7. Relation identity 取得策略

idempotency claim 完成後，transaction 以 `delivery_notes.id + company_id` 的唯讀查詢取得 `sales_order_id`。此查詢只解析 identity，不作 row lock，也不提供後續業務判定。Schema 的 Delivery Note → Sales Order 關聯使用 `(sales_order_id, company_id)` 複合 FK，`onUpdate: Restrict`；application service 亦沒有修改既有 Delivery Note relation 的路徑。

## 8. 鎖後重新驗證

取得 Sales Order row lock、Delivery Note row lock 後，service 重新載入 Delivery Note、Sales Order、lines、Print Version 與 Print Event，並驗證：

- Delivery Note company 等於 request company。
- Delivery Note `salesOrderId` 等於鎖前解析 identity。
- included Sales Order identity 與 company 均相符。
- formal print 的 Delivery Note 與 Sales Order 狀態符合正式轉換。
- reprint 的兩張單據均為 `SHIPPED`。
- snapshot、Print Version、Print Event 與 PDF invariant 仍由鎖後資料判定。

## 9. Formal print 流程

RBAC／company scope → idempotency claim → relation identity 唯讀解析 → Sales Order `FOR UPDATE` → Delivery Note `FOR UPDATE` → 鎖後 relation／company／status／snapshot／version／event 驗證 → renderer → Print Version → `FORMAL_PRINT` event → Delivery Note 與 Sales Order 轉 `SHIPPED` → summary → audit → idempotency completion → commit。

成功結果、PDF bytes、event、狀態、audit、rollback 與 HTTP/API contract 均未改變。

## 10. Reprint 流程

補印使用同一 `idempotency → Sales Order → Delivery Note` 順序及鎖後驗證。它只重用既有 immutable PDF、新增 `REPRINT` event、增加 `reprintCount`、寫 audit 並完成 idempotency；不修改兩張單據狀態、不 render、不新增 Print Version、不修改首次列印摘要或實際出貨日。

## 11. 其他相關 transaction 審查

| Transaction／service | 鎖定資料 | 實際順序 | 是否修改 | 與列印併發 |
| --- | --- | --- | --- | --- |
| Delivery Note create | Sales Order、current Delivery Note | idempotency → Sales Order → Delivery Note | 否 | 可能 |
| Delivery Note rebuild／replacement | Sales Order、current Delivery Note | idempotency → Sales Order → Delivery Note | 否 | 可能 |
| Delivery Note ADMIN void | Sales Order、current Delivery Note | idempotency → Sales Order → Delivery Note | 否 | 可能 |
| Sales Order void | Sales Order、current Delivery Note | idempotency → Sales Order → Delivery Note | 否 | 可能 |
| Sales Order update／revision | Sales Order；需要檢查 Delivery Note 時由既有 helper 查詢 | 無反向雙 row lock | 否 | 可能 |
| Receivable transition | 尚未實作 | 無 | 否 | 否 |
| Formal print | Sales Order、Delivery Note | 原為反向；改為正式順序 | 是 | 是 |
| Reprint | Sales Order、Delivery Note | 原為反向；改為正式順序 | 是 | 是 |

全 repository 的 `FOR UPDATE` 與 raw lock helper 審查未發現其他 Delivery Note → Sales Order 反向 row-lock 路徑。

## 12. Raw SQL parameterization

Sales Order 與 Delivery Note lock 均沿用 Prisma tagged `$queryRaw`，UUID 與 company identity 以 interpolation parameter 傳入，沒有字串串接、`$queryRawUnsafe` 或 route-controlled table／column 名稱。

## 13. Deadlock 矩陣

| Scenario | Requests | 預期收斂 |
| --- | --- | --- |
| A | formal print + formal print，同一 Delivery Note、不同 key | 一個正式結果、另一個 typed conflict、唯一 version/event、無 `40P01` |
| B | reprint + reprint，同一 Delivery Note、不同 key | event 與 counter 增量一致、PDF 不變、無 `40P01` |
| C | formal print + ADMIN void，同一 Sales Order／Delivery Note | 同一 lock order；一方成功、另一方 typed state conflict；無半完成資料與 `40P01` |
| D | reprint + ADMIN void | `SHIPPED` 本來禁止 ADMIN void，使用已正式列印 fixture 作最接近合法衝突；reprint 成功、void typed downstream conflict、無 `40P01` |

測試以真實 transaction row lock 與明確 lock observer 驗證順序；observer 僅為 optional dependency，未提供時不執行任何 production 行為。

## 14. Tests

正式驗證結果：

| Command | Files | Passed | Failed | Skipped | Duration |
| --- | ---: | ---: | ---: | ---: | ---: |
| `vitest run tests/unit/delivery-note-print-lock-order.test.ts` | 1 | 3 | 0 | 0 | 1.44s |
| `npm test`（一般 unit） | 22 | 169 | 0 | 0 | 3.00s |
| `npm test`（renderer single worker） | 1 | 12 | 0 | 0 | 1.89s |
| `vitest run tests/db/delivery-note-formal-print.test.ts --maxWorkers=1` | 1 | 10 | 0 | 0 | 3.95s |
| `npm run test:db`（最終 fresh DB） | 15 | 149 | 0 | 0 | 28.97s |

完整 unit suite 共 23 files／181 tests，涵蓋 formal print、reprint、Delivery Note、Sales Order、API／UI contract 與 deterministic renderer。完整 DB suite 涵蓋 P3.3c、P3.3d、Delivery Note、Sales Order、migration／catalog 與全部既有 integration regression。P3.3 相關測試為 0 skipped。

Scenario A：不同 key 首次正式列印只有一個成功與唯一 Print Version／`FORMAL_PRINT`；另一個 typed conflict，`40P01 = 0`。

Scenario B：不同 key 補印的成功數、`REPRINT` event 與 `reprintCount` 增量一致，PDF version／bytes 不變，`40P01 = 0`。

Scenario C：formal print 與 ADMIN void 採相同 Sales Order → Delivery Note 順序；一方成功、另一方 typed state conflict，最終只可能完整 `SHIPPED` 或完整 `VOIDED`／`CONFIRMED`，`40P01 = 0`。

Scenario D：已出貨 fixture 中 reprint 成功、ADMIN void 回 typed downstream-locked conflict；PDF 與兩張單據狀態不變，`40P01 = 0`。

## 15. Disposable DB

Targeted DB 使用 `postgresql://p1_test:***@localhost:55432/p3_3e_019fa810_full?schema=public`。為避免 targeted fixture 污染完整 suite，另以全新 DB 執行完整 suite；補強 Scenario A typed-error assertion 後的最終正式 DB 為 `postgresql://p1_test:***@localhost:55432/p3_3e_019fa810_full_03?schema=public`。

各 database 均由空白套用 0001–0012 共 12 migrations；最終正式完整 DB suite 為 15 files／149 passed／0 failed／0 skipped，核准情境 `40P01 = 0`。

## 16. Schema diff

本切片未修改 Prisma schema、未新增 migration，0011／0012 均未修改。Fresh 0001–0012 deploy 均成功；最終正式 DB 的 `prisma migrate status` 為 up to date，`prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` 為 `No difference detected.`。

## 17. Build

`git diff --check`、Prisma format／validate／generate、ESLint、Next type generation、TypeScript typecheck 與 Next.js 16.2.11 production build 全部通過。Build 有一項既有 Turbopack NFT 動態檔案追蹤 warning，import trace 指向 server-side font loader；沒有 build failure、client 檔案修改或 route contract 變更。

Deterministic renderer tests 12／12 通過；renderer、font binary、manifest、checksum 與 expected hash 均未修改，正式 PDF deterministic hash 契約不因 lock-order 修正改變。

## 18. Known limitations

- Print Version／Print Event 不存在可預先鎖定的 row；併發 invariant 由兩層 row lock 加 unique constraint 保護。
- Scenario D 的 ADMIN void 與 reprint 在正式 state machine 中不可同時合法成功；測試驗證最接近的已出貨衝突與 typed failure。
- P3.3e 不新增自動 retry；既有 typed concurrency mapping 與 caller 使用相同 idempotency key retry 的契約不變。

## 19. P3.3 結案重審 handoff

P3.3c 原文件的 lock-order 描述已由 P3.3e 修正；P3.3c 其他驗證結果維持。P3.3e Git 收尾與推送後，必須另開完整 P3.3 結案審查並重新執行，不得沿用先前 fail-fast 審查作為通過。

## 20. P4 狀態

P4 未開始；本切片未開啟、修改或使用 P4 blueprint。

## 21. Existing working tree recovery（2026-07-28）

### 21.1 Recovery 起點與中斷點

本次從既有 working tree 復原，不重新實作 P3.3e。開始時：

- branch 為 `main`。
- `HEAD` 與 `origin/main` 均為 `59121b17e113bcbeae1ececbef0b6ebae75ef500`，ahead／behind 為 `0 / 0`。
- 無 staged 內容、無 P3.3e commit、無 push。
- P3.3e 正好有 8 個檔案：6 個 tracked modified、2 個 untracked added。
- 另有既存且排除範圍內的未追蹤 `docs/INVENTORY_PRODUCTION_BLUEPRINT.md`；本次未修改、stage、commit 或刪除。

中斷點判定為核心實作、測試與原驗證文件已完成，但尚未修正所有正式文件的目前狀態，也尚未進行 Git 收尾。未發現 production code placeholder、TODO 或部分改寫；本次未修改 production code、schema、migration、API、UI、renderer、font 或既有 PDF 契約。

### 21.2 文件一致性恢復

本次只修正正式文件的目前狀態：

- `docs/IMPLEMENTATION_PLAN.md` 頁首：由「P3.3e 與後續階段未開始」修正為 P3.3e 已完成實作與驗證、尚待獨立 Git 收尾，P3.3 尚未重新完成結案審查，P4 未開始。
- `docs/P3_3_DELIVERY_NOTE_PRINT_PLAN.md` 頁首與 P3.3d 後現況段落：由 P3.3e 未開始修正為 P3.3e 已完成實作與驗證、尚待獨立 Git 收尾；P3.4、P4 未開始。
- `docs/TECHNICAL_ARCHITECTURE.md` 頁首：同樣修正目前狀態。

歷史版本紀錄維持當時事實，`docs/DECISIONS.md` 未修改。正式 lock order 仍為 `idempotency → Sales Order → Delivery Note`。

### 21.3 Recovery 專用 fresh DB

本次沒有重用第 15 節的舊 DB。兩個 database 建立前均確認不存在且 `public` schema 為空：

- targeted：`postgresql://p1_test:***@localhost:55432/p3_3e_recovery_target_019fa8c8?schema=public`
- full：`postgresql://p1_test:***@localhost:55432/p3_3e_recovery_019fa8c8?schema=public`

兩者都從零成功套用 0001–0012 共 12 migrations，`prisma migrate status` 為 up to date。最終 full DB 的 `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` 為 `No difference detected.`。

### 21.4 Recovery 重新驗證

| Command | Files | Passed | Failed | Skipped | Duration |
| --- | ---: | ---: | ---: | ---: | ---: |
| `vitest run tests/unit/delivery-note-print-lock-order.test.ts` | 1 | 3 | 0 | 0 | 2.99s（含 command startup） |
| `vitest run tests/db/delivery-note-formal-print.test.ts --maxWorkers=1` | 1 | 10 | 0 | 0 | 5.32s（含 command startup） |
| `npm test` 一般 unit | 22 | 169 | 0 | 0 | 2.40s |
| `npm test` renderer single worker | 1 | 12 | 0 | 0 | 1.67s |
| `npm run test:db`（獨立 final fresh DB） | 15 | 149 | 0 | 0 | 29.23s |

下列 gate 亦全部通過：

- `prisma format --check`
- `prisma validate`
- `prisma generate`
- ESLint
- Next route type generation 與 TypeScript typecheck
- Next.js 16.2.11 production build
- `git diff --check`

Build 仍只有既有的 Turbopack NFT 動態檔案追蹤 warning，import trace 為 `next.config.ts` → font loader → renderer → formal print → reprint route；沒有 failure 或本次新增 warning。

### 21.5 Recovery concurrency 與契約結果

- Scenario A：同一 Delivery Note 不同 key 的 concurrent formal print 收斂為一個成功、一個 typed print conflict，只有一個 Print Version 與一個 `FORMAL_PRINT`。
- Scenario B：concurrent reprint 共用 immutable Print Version／PDF，成功次數、`REPRINT` event 與 `reprintCount` 增量一致。
- Scenario C：formal print 與 ADMIN void 一方成功、另一方 typed state／downstream conflict；最終只可能完整 `SHIPPED`／`SHIPPED` 或完整 `VOIDED`／`CONFIRMED`。
- Scenario D：已出貨狀態下 reprint 成功，ADMIN void 為 typed downstream-locked conflict；狀態、PDF 與首次列印摘要不變。
- PostgreSQL `pg_stat_database.deadlocks`：targeted DB `0`、full DB `0`，因此 `40P01 = 0`。
- 本次核准情境沒有觀察到 P2002、P2034 或 generic DB error 外洩；既有 P2002／P2034 → `DeliveryNotePrintConcurrencyError` 與 HTTP 409 mapping 未修改。

Renderer `delivery-note-pdf-renderer-v1`、template `delivery-note-pdf-template-v1`、font `noto-sans-cjk-tc-regular-sans2.004-dce08bd4`、snapshot `delivery-note-snapshot-v1` 均未修改。Deterministic renderer 12／12 通過，兩次相同輸入的 PDF bytes 與 SHA-256 相同；既有 font SHA-256 `dce08bd4fd91aa8aa76ed8fea4b694c2dfb8550f67871e326843212ddbeb88b4` 未變。API、UI、state machine、audit metadata、FORMAL_PRINT 與 REPRINT 語意均由完整 unit／DB regression 通過。

### 21.6 Recovery Git handoff

驗證完成時仍在 `main`，`HEAD` 與 `origin/main` 仍為基線，ahead／behind 仍為 `0 / 0`；無 staged、commit 或 push。P3.3e 8 個檔案全部保留在 working tree，排除的 blueprint 仍為未追蹤且未修改。P3.3 尚未重新完成結案審查，P4 未開始。

判定：P3.3e working tree 恢復完成，可在另行取得明確授權後進行精確 Git 收尾。
