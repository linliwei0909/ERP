# P3.3b2 Formal Print Version Contract Validation

日期：2026-07-28
範圍：P3.3b 的正式版本契約補強；不包含 P3.3c renderer／service 或 P3.3d API／UI／下載。

## 1. Scope 與 exclusions

本次完成：

- `DeliveryNote.snapshotVersion` required scalar。
- `DeliveryNotePrintVersion.rendererVersion`、`fontVersion`、`snapshotVersion` required scalars。
- `0012_p3_delivery_note_print_version_contract` migration。
- `delivery-note-snapshot-v1` 單一 domain constant 與 create／rebuild persistence。
- Schema/catalog、migration behavior、service regression 與 DB integration tests。
- DEC-059、business rules、database design、implementation plan 與 P3.3 print plan 同步。

本次明確未建立 PDF library、renderer、font binary／resolver／embedding、print-model validator、formal-print／reprint service、PDF storage transaction、狀態轉換、audit／idempotency／locking、API、UI 或下載端點。

`docs/INVENTORY_PRODUCTION_BLUEPRINT.md` 是任務開始前已存在的 untracked file；本次未讀寫其內容。

## 2. Approved decisions

- 現行 P3.2 frozen snapshot contract 為 `delivery-note-snapshot-v1`。
- 版本 discriminator 保存於 `delivery_notes.snapshot_version`，不寫入或包裝既有 JSON。
- Print Version 分開保存 renderer、template、font、snapshot、document version。
- P3.3c 正式中文字型為 Noto Sans CJK TC Regular。
- 字型必須取自官方 Noto Fonts／Noto CJK、固定 release 或 commit、保存原始檔名、SHA-256、SIL OFL 與 manifest，server-only 載入並嵌入；缺檔、checksum 不符或 glyph 不足均 fail fast。
- 禁止 runtime download、CDN 與 system font fallback。

正式決策記錄為 `DEC-059`，是 `DECISIONS.md` 下一個可用編號。

## 3. Schema changes

| Model | Prisma field | Database column | Type | Nullability | Default |
| --- | --- | --- | --- | --- | --- |
| `DeliveryNote` | `snapshotVersion` | `snapshot_version` | `varchar(100)` | `NOT NULL` | 無 |
| `DeliveryNotePrintVersion` | `rendererVersion` | `renderer_version` | `varchar(100)` | `NOT NULL` | 無 |
| `DeliveryNotePrintVersion` | `fontVersion` | `font_version` | `varchar(100)` | `NOT NULL` | 無 |
| `DeliveryNotePrintVersion` | `snapshotVersion` | `snapshot_version` | `varchar(100)` | `NOT NULL` | 無 |

未新增 index、FK、`formalPrintVersionId` 或循環 relation。既有 `documentVersion`、`templateVersion`、PDF metadata／bytes、唯一正式 PDF、company-scoped relations 與 append-only triggers 保持不變。

## 4. Migration strategy 與 existing data

Migration：`0012_p3_delivery_note_print_version_contract`

1. 新增 nullable `delivery_notes.snapshot_version`。
2. 將既有 Delivery Notes 明確辨識為 `delivery-note-snapshot-v1`。
3. 驗證沒有 null／blank。
4. 設為 `NOT NULL` 並建立 non-blank CHECK。
5. 不建立任何 database default。
6. 查詢 `delivery_note_print_versions` 實際 row count；非零即以 `P0001` 回報筆數並中止。
7. 表為空時新增三個 `varchar(100) NOT NULL` 版本欄位與 non-blank CHECK。

回填 SQL 不查詢主檔、不修改 company/customer/customer-company/contact/delivery/freight/item/price JSON，也不刪除 print row。0011 的 `ENABLE ALWAYS` UPDATE／DELETE／TRUNCATE triggers 對新增欄位自動生效，因此 0012 不重建 trigger。

任務開始時本機 `erp` database 尚無 `delivery_note_print_versions` relation，表示尚未部署 0011，沒有 production-like print records 可回填。Repository 只有 constraint test fixture 建立 print row，已更新成新契約格式。

## 5. Snapshot application flow

- Domain constant：`DELIVERY_NOTE_SNAPSHOT_VERSION = "delivery-note-snapshot-v1"`。
- Snapshot builder 回傳 `snapshotVersion` 與既有 header／lines；JSON clone 與欄位內容不變。
- Create 與 rebuild／replacement 明確寫入 builder 提供的版本。
- Void／order void 只更新狀態與 void metadata，不更新 snapshot version。
- Create／rebuild request 使用 strict schema，client 注入 `snapshotVersion` 會在 route 前被拒絕。
- List／detail／mutation API DTO 未增加此欄位。

## 6. Tests 與 disposable databases

正式主要 disposable DB：

- 名稱：`p3_3b2_019fa709_full`
- 目標：`postgresql://p1_test:***@localhost:55432/p3_3b2_019fa709_full?schema=public`
- Migration 數量：12
- DB test：14 files，139 passed，0 failed，0 skipped，27.91s
- Schema diff：`No difference detected.`

Upgrade DB：

- 名稱：`p3_3b2_019fa709_upgrade`
- 先部署 0001～0011，再放回正式 0012 執行 forward deploy。
- 0012 成功，upgrade 後 schema diff 為零。

Migration behavior test 另在同一 disposable PostgreSQL server 建立隨機隔離 schema，驗證：

- 既有 Delivery Note 回填。
- migration 前後六個 header frozen JSON value 完全一致。
- 四個新增欄位均 `NOT NULL` 且無 default。
- 預先存在一筆 Print Version 時回報實際筆數並 fail fast。
- 失敗後既有 row 保留，三個欄位沒有半套建立。

## 7. Commands and results

| Command | Scope | Result |
| --- | --- | --- |
| `npx.cmd prisma format` | Prisma format | passed，119ms |
| `git diff --check` | whitespace／patch format | passed |
| `npm.cmd run lint` | ESLint | passed |
| `npm.cmd run typecheck` | Next route types + TypeScript | passed；route types generated |
| `npm.cmd run prisma:validate` | Prisma schema | passed |
| `npm.cmd run prisma:generate` | Prisma Client 7.8.0 | passed，約 1.01s |
| `npm.cmd test` | 全部 unit tests | 20 files，137 passed，0 failed，0 skipped，2.51s |
| `npx.cmd vitest run tests/db/delivery-note-contract-migration.test.ts tests/db/delivery-note-schema.test.ts tests/db/delivery-note-workflow.test.ts --maxWorkers=1` | P3.3b2／Delivery Note DB regression | 3 files，44 passed，0 failed，0 skipped，9.92s |
| `npm.cmd run test:db` | 全部 DB integration tests | 14 files，139 passed，0 failed，0 skipped，27.91s |
| `npm.cmd run build` | Next.js production build | passed；compile 7.0s、TypeScript 17.4s、37 static pages |
| `npx.cmd prisma migrate deploy` | Fresh 0001～0012 | passed，12 migrations |
| `npx.cmd prisma migrate deploy` | Existing 0011 → 0012 | passed |
| `npx.cmd prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` | Fresh 與 upgrade schema diff | passed，兩者均無差異 |

首輪 DB command 曾把 `prisma generate` 與 tests 並行，tests 載入舊 generated client；修正為 generate 完成後依序重跑即通過。首輪 schema diff 亦曾與 fresh migration 並行而讀到空 DB，改為 migration 完成後重跑即為零。首輪 build 遇到暫時 `.next/package.json` lock，單獨重跑通過。上述首輪工具排序／鎖定錯誤不列為正式驗收結果。

Repository 沒有 package `format` script 或 Prettier dependency；正式 format gate 使用 Prisma format 與 `git diff --check`。

## 8. Known limitations

- Repository 現況沒有獨立 P3.3a／P3.3b validation 文件；審查依目前 `DECISIONS.md`、`business-rules.md`、`DATABASE_DESIGN.md`、`IMPLEMENTATION_PLAN.md`、P3.3 plan、0011 SQL 與現有 tests 完成。
- 本次未把 migration 部署到本機 `erp`，只使用新建 disposable PostgreSQL databases。
- 沒有 renderer／font asset，因此 `rendererVersion` 與正式 `fontVersion` 的 production constants 留給 P3.3c。

## 9. P3.3c handoff contract

P3.3c 可依賴：

- required `DeliveryNote.snapshotVersion`。
- required Print Version renderer、template、font、snapshot、document version。
- `delivery-note-snapshot-v1` frozen snapshot identity。
- immutable PDF storage、唯一正式版本與 append-only DB protections。
- Noto Sans CJK TC Regular 正式字型決策。

P3.3c 仍須完成：

- Frozen snapshot validator 與 print model。
- Renderer version constant 與 deterministic renderer。
- 官方 font asset、manifest、SIL OFL、pinning、checksum、server-only load、embedding 與 glyph verification。
- Formal-print／reprint transactions、PDF bytes persistence、`ACTIVE -> SHIPPED` 與 Sales Order synchronization。
- Audit、idempotency、locking、concurrency、rollback、hash 與 service/DB tests。

P3.3d 才處理 API、UI 與下載端點。
