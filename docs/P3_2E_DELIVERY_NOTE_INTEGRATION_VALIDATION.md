# P3.2e 銷貨單整合驗收與 P3.2 結案

驗收日期：2026-07-28
Git 基準：`ac929cb82a286c738ff54959e3648d5ca6822850`
基準 subject：`feat(delivery-notes): implement P3.2d2 UI`

## 1. 結論

P3.2e 正式整合驗收通過，P3.2 銷貨單主流程可正式結案。

本次驗收涵蓋：

- `CONFIRMED` 訂單明確建立銷貨單。
- `DELIVERY_CREATED` 訂單開始 revision、編輯、重新確認及原子 rebuild。
- 同一訂單同時最多一張非 `VOIDED` 銷貨單。
- ADMIN direct void、order 回 `CONFIRMED`、重新建立新單。
- ORDER_ENTRY read／manage 與 ADMIN-only direct void 邊界。
- list、detail、current、order 在 rebuild／void 後的一致性。
- typed snapshot、idempotency、audit、company scope、併發及 rollback。
- server-rendered UI、client mutation adapter、loading／empty／error contract 與 production build smoke。

本次沒有修改 schema、migration、package、lockfile 或 API contract。

## 2. Git 與檔案邊界

起始檢查：

- Branch：`main`
- HEAD：`ac929cb82a286c738ff54959e3648d5ca6822850`
- `origin/main`：`ac929cb82a286c738ff54959e3648d5ca6822850`
- ahead／behind：`0/0`
- index：空
- 唯一未追蹤檔：`docs/INVENTORY_PRODUCTION_BLUEPRINT.md`

`docs/INVENTORY_PRODUCTION_BLUEPRINT.md` 屬 P4；本次未讀取其內容、未修改、未 stage、未 commit、未 push。

## 3. Disposable database

資料庫名稱：

- Initial migration／DB gate 與 production browser smoke：`erp_p3_2e_test_run_20260728_01`
- 修改後最終 clean DB gate：`erp_p3_2e_test_run_20260728_02`

遮蔽密碼後的最終 datasource：

`postgresql://p1_test:***@localhost:55432/erp_p3_2e_test_run_20260728_02?schema=public`

安全檢查：

1. `_01` 與 `_02` 建立前都查詢測試 PostgreSQL instance，結果為 `0`，確認名稱不存在。
2. 只使用 `erp-p1-test-postgres`，host port 為 `55432`。
3. 兩個 DB 建立後都查詢 public schema 的 table／view／sequence 類物件數，結果為 `0`。
4. migration、Prisma 與 DB tests 的 process 同時設定：
   - `DATABASE_URL` 指向本次 DB。
   - `P1_TEST_DATABASE_URL` 指向同一本次 DB。
5. 未對 `localhost:5432/erp` 執行 migration、測試或 smoke mutation。

## 4. Migration 與 Prisma

執行命令：

```text
npm.cmd run db:deploy
npm.cmd run prisma:validate
npm.cmd run prisma:generate
npm.cmd run db:status
.\node_modules\.bin\prisma.cmd migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

結果：

- `_01` 與 `_02` 都由空白 DB 成功部署 `0001_p1_foundation_baseline` 至 `0010_p3_delivery_notes` 共 10 migrations。
- Prisma validate：成功。
- Prisma generate：成功，Prisma Client 7.8.0。
- Migration status：`Database schema is up to date!`
- Prisma schema diff：`No difference detected.`
- 未新增或修改 migration。

## 5. Automated tests 與 quality gates

正式完整命令：

```text
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:db
npm.cmd run build
```

DB runner：

```text
vitest run tests/db --maxWorkers=1
```

驗收結果：

- Lint：成功。
- Typecheck：成功，Next route types 產生成功。
- Unit／UI tests：20 files、130 passed、0 failed、0 skipped。
- 最終 clean DB tests（`_02`）：13 files、124 passed、0 failed、0 skipped。
- Delivery-note targeted DB workflow：1 file、19 passed、0 failed、0 skipped。
- Production build：成功，`/delivery-notes`、`/delivery-notes/[id]` 與所有 delivery-note API routes 均列入 build route manifest。
- 沒有 test file 或 suite 全部 skipped。

唯一測試執行警告為 `pg` 對「client 已在執行 query 時再次呼叫 `client.query()`」的 pg 9 deprecation warning；不影響本次結果，亦沒有改變 production transaction 行為。

### 5.1 不可重用 DB 的診斷紀錄

第一次 `_01` 完整 DB suite 為 13 files／124 passed／0 skipped。完成 browser smoke 後，曾在同一 `_01` 重跑完整 suite；因 DB tests 與 smoke 會保留固定 fixture，結果為 3 files failed、10 passed，4 tests failed、113 passed、7 skipped：

- `sales-order-workflow` 的固定 company setting expression unique 碰撞，該 suite beforeAll 失敗而 7 tests skipped。
- `company-settings-workflow` 的「第一次 bootstrap 必須 created」因既有 fixture 而失敗。
- `delivery-note-schema` 的固定測試單號與先前 run 碰撞。

沒有把該次 skipped 視為通過，也沒有修改 fixture、刪除測試資料或弱化 assertion。依「每次完整 DB suite 使用全新 disposable DB」原則，建立從未存在且 public schema 空白的 `_02`，重新部署 0001～0010；最終正式 suite 為 13 files／124 passed／0 failed／0 skipped。

## 6. 測試補強

### 6.1 Client／UI

補足：

- Rebuild client adapter 成功回傳。
- Rebuild reason trim。
- Rebuild typed error、message 與 correlation ID。
- 空白 rebuild reason 在呼叫 API 前拒絕。
- 可存取的 loading 狀態。
- 首頁銷貨單入口受 `delivery_notes.read` 控制。
- list／detail 頁面 authentication 與 authorization redirect contract。
- list load-error contract。
- create／rebuild／void 元件的 busy guard、pending disabled 與 refresh contract。

### 6.2 Refresh 與 API 一致性

在真實 PostgreSQL route workflow 補強 rebuild／void 後的整合 assertion：

- Rebuild 後 current、detail、list 都指向新 `ACTIVE` replacement。
- 舊單在 list 為 `VOIDED`。
- Order 為 `DELIVERY_CREATED` 且 revision 正確。
- ADMIN void 後 current 為 null。
- Detail 與 list 都顯示新單為 `VOIDED/ADMIN_DIRECT`。
- Order 回 `CONFIRMED` 且 revision 不變。

## 7. 發現及修正的缺口

### `DELIVERY_CREATED` 訂單缺少 revision／void UI actions

缺口：

- `SalesOrderEditor` 只在 `CONFIRMED` 顯示「開始修訂」。
- 「作廢訂單」只在 `DRAFT`／`CONFIRMED` 顯示。
- 因此使用者無法從已建立銷貨單的訂單進入正式 revision rebuild，也無法由 UI 執行已由後端支援的 order void 連動流程。

根因：

- P3.1 UI eligibility 未隨 P3.2c 已完成的 state machine／service transition 同步擴充。
- 後端已允許 `DELIVERY_CREATED -> DRAFT`、`DELIVERY_CREATED -> VOIDED`，不是 API 或 transaction 缺口。

修改：

- 新增 `canStartSalesOrderRevision`，允許 `CONFIRMED`／`DELIVERY_CREATED`。
- 新增 `canVoidSalesOrder`，允許 `DRAFT`／`CONFIRMED`／`DELIVERY_CREATED`。
- `SHIPPED`、`RECEIVABLE_CREATED`、`VOIDED` 仍不顯示這些操作。
- 新增 unit regression test，並以 ADMIN／ORDER_ENTRY production browser smoke 實際走完 revision/rebuild。

影響：

- 屬 P3.2e 最小 UI 修正。
- 不變更 API contract、後端 RBAC、資料模型、schema、migration 或 transaction。

## 8. Production-build browser smoke

Application：

- `next build` 產物。
- `next start -p 3100`。
- Runtime datasource 只指向 `_01` disposable DB；最終 clean automated DB gate 使用 `_02`。

### 8.1 ADMIN

帳號：本次 disposable DB 專用 `p32e_admin`。
公司：`DNA-70e1a7dc`。

實際步驟與結果：

1. 登入首頁：顯示「銷貨單」入口及 ADMIN 管理入口。
2. 開啟清單與明細：成功，建立者、快照、金額與 status 可見。
3. `SO-AC-202607-000019` revision 1：
   - 從 `CONFIRMED` 建立 `DN-AC-202607-000030`。
   - 明細為 `ACTIVE`，建立者為 `p32e_admin`。
4. 回到 `DELIVERY_CREATED` order：
   - 修正後顯示「開始修訂」與「作廢訂單」。
   - 開始 revision 2、將 quantity 改為 2、儲存並重新確認。
5. Rebuild：
   - 建立 `DN-AC-202607-000031`。
   - 新單為 `ACTIVE`，revision 2，顯示前一張 `DN-AC-202607-000030`。
   - 重新整理 order 後只有 `DN-AC-202607-000031` 為有效；前兩張歷史單為已作廢。
6. ADMIN void：
   - 輸入 `P3.2e ADMIN 瀏覽器驗收作廢`。
   - Detail 顯示 `VOIDED`、原因、作廢者 `p32e_admin` 及時間。
   - 重新整理 order 後 status=`CONFIRMED`、沒有 current note、顯示可再次建立。
   - List 依單號查詢顯示同一張單為已作廢及相同原因。
7. Recreate：
   - 建立 `DN-AC-202607-000032`。
   - 新號不重用，狀態為 `ACTIVE`。

### 8.2 ORDER_ENTRY

帳號：本次 disposable DB 專用 `p32e_order_entry`。
角色：`ORDER_ENTRY`。
公司：`DNA-70e1a7dc`。

實際步驟與結果：

1. 首頁顯示銷售訂單與銷貨單入口，不顯示 ADMIN 管理入口。
2. 可開啟銷貨單清單及明細。
3. `DN-AC-202607-000032` 明細沒有「管理員作廢」。
4. `SO-AC-202607-000012`：
   - 建立 `DN-AC-202607-000033`，建立者為 `p32e_order_entry`。
   - 開始 revision 2、quantity 改為 3、儲存並重新確認。
   - Rebuild 建立 `DN-AC-202607-000034`，顯示前一張 `DN-AC-202607-000033`。
   - 新單建立者為 `p32e_order_entry`，仍沒有 ADMIN void 操作。
5. 以獨立正式 login session 直接 POST：
   - `POST /api/delivery-notes/06bda87a-1118-49e5-b535-ae7ae365fe71/void`
   - 實際 HTTP status：`403`
   - 沒有變更銷貨單狀態。

## 9. 追加訂單範圍

依 DEC-057 與 P3.2e 正式範圍判定：

- 追加訂單是獨立 sales order，各自建立自己的銷貨單。
- 追加訂單不屬於既有訂單 revision rebuild。
- DEC-057 已完成業務規格決策。
- `ADDITION` 訂單建立 capability 尚未實作，須由後續獨立任務取得授權。
- P3.2e 不新增或暗中實作追加訂單。
- 現有 create／revision rebuild／ADMIN void 主流程不依賴 `ADDITION` capability。
- 此延後項目不阻止本次 P3.2 銷貨單主流程結案。

## 10. 剩餘限制與排除

未納入：

- P3.3 列印、PDF、版型及重印控制。
- 實際出貨日、`SHIPPED` transition。
- 回收確認、`RECEIVABLE_CREATED`、應收。
- 庫存、倉庫、批號、採購、生產。
- 追加訂單建立 capability。
- P4 blueprint。

上述項目沒有被本次 application、schema 或 migration 暗中實作。

## 11. 結案判定

- P3.2e：完成。
- P3.2 create／revision rebuild／ADMIN void 主流程：可正式結案。
- 下一階段不得直接混入追加訂單、P3.3 或 P4；應依獨立授權決定下一個工作項目。
