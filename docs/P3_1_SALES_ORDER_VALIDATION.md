# P3.1 銷售訂單驗證紀錄

執行日期：2026-07-27
正式規格基線：`DECISIONS.md` V0.9、DEC-056
範圍：銷售訂單、訂單明細、訂單關聯、價格與運費快照、確認／修訂／作廢流程
狀態：**P3.1 工程驗收完成**；Fresh migration、完整 DB tests、erp gate、兩次 bootstrap、完整 smoke 與最終 gate 全部通過

## 1. 當前結論

P3.1 的 Prisma schema、`0009_p3_sales_orders` migration、公司列印設定 registry、銷售訂單 service、API、UI、unit tests 及 DB/workflow tests 已建立。不依賴資料庫的 Prisma validate/generate、lint、typecheck、unit tests 與 production build 已通過。

2026-07-27 的工程驗收已取得獨立 PostgreSQL 容器核准。測試容器及兩個全新 DB 建立成功，但第一個 migration 指令使用 Windows `cmd.exe` 設定 `DATABASE_URL` 時，Prisma 實際仍讀取 `.env` 的 `localhost:5432/erp`。命令輸出在套用完成後才顯示實際 datasource，因此 `0009_p3_sales_orders` 在 fresh DB 驗證前意外先套用至 `erp`。

依 fail-fast 規則，發現目標不符後立即停止。未執行第二個 migration、DB tests、bootstrap、smoke test、回退、`migrate resolve` 或手工修改 `_prisma_migrations`。兩個 fresh DB 保持空白；`erp` 的三張新表均為 0 筆。

同日取得續驗核准後，改用 PowerShell 目前程序的 `$env:DATABASE_URL`，遮罩輸出正確顯示 `localhost:55432/erp_p3_1_fresh_a_20260727`。Preflight 為了在同一程序擷取並檢查 Prisma status，設定了 `$ErrorActionPreference = 'Stop'` 且將 native command 的 stderr 重新導向；Windows PowerShell 把 Prisma 正常寫至 stderr 的 config 載入訊息轉為 `NativeCommandError`，因此在 datasource guard 與 migration deploy 前中止。

中止後只重新執行唯讀 `prisma migrate status`，確認 Prisma datasource 確實是 `erp_p3_1_fresh_a_20260727`／`localhost:55432`，且 0001～0009 全部仍未套用。依 fail-fast 規則沒有修正後重試 mutation，也沒有進入 Fresh B。此續驗未對任何 database 產生 mutation。

再次取得空白 Fresh DB status exit code 1 例外核准後，改用同一 PowerShell 程序直接顯示 Prisma status，以 `$LASTEXITCODE` 判斷 native command 結果，並在 `Read-Host` 暫停點人工核對 datasource 與 pending-only 輸出。Fresh A 與 Fresh B 均先確認 public table 數為 0，再各自由 migration chain 依序套用 0001～0009；兩次 deploy 及 deploy 後 status exit code 均為 0。

兩個 fresh DB 的 migration history 都是 9 筆成功、0 unresolved、0 rolled-back；enum、CHECK、composite FK、unique/index、月份 sequence scope、snapshot、RESTRICT/NO ACTION 與禁止資料表 catalog 檢查通過，schema diff 均為 `No difference detected`。

DB/workflow tests 指向 `localhost:55432/erp_p3_1_fresh_a_20260727`。11 個 test files 中 10 個通過；95 tests 中 94 個通過。唯一失敗是 `tests/db/baseline.test.ts` 的 expected array 未依 SQL `ORDER BY object_name` 排列：實際 `company_settings_document_company_code_check` 正確排在 `document_sequences_*` 前，但 expected array 將它放在後方。所需 constraint 本身存在，並非 migration 或 catalog 缺失。依 fail-fast 規則未修改測試後重跑，也未進入 `erp` bootstrap 或 smoke test。

取得限定核准後，只調整 `tests/db/baseline.test.ts` expected array 順序，未修改 SQL、assertion、schema、migration、service、API 或 UI。完整 DB tests 仍使用同一 Fresh A；baseline 排序案例已通過，但先前測試資料依法保留，第二次完整測試在 `document_company_code` 全域 expression unique index 發生衝突：

- `sales-order-workflow.test.ts` 重新建立測試公司設定 `TA` 時，與前次保留的 `TA` 衝突，suite 的 7 個案例未執行。
- `company-settings-workflow.test.ts` 以新 effective date 重跑正式 bootstrap 時，與前次保留的 `IN`／`BI` 衝突。
- 結果為 11 files：9 passed、2 failed；95 tests：87 passed、1 failed、7 skipped。

此次失敗不是 baseline 排序、migration history 或缺少 constraint；是 DB tests 目前不是針對保留測試資料可重跑。現行核准只允許修改 baseline expected array，且禁止刪除既有資料，因此依 fail-fast 再次中止，未修改其他測試或 bootstrap service。

取得建立新 disposable DB 的核准後，建立 `erp_p3_1_test_run_20260727_01`。建立前確認名稱不存在，建立後 public table 數為 0；沒有複製或清理 Fresh A／B。Pre-deploy status datasource 正確且 exit code 1 僅因 0001～0009 pending，依核准例外繼續。Deploy exit code 0、post-status 0、9 筆 migration 全部成功、0 unresolved、0 rolled-back，schema diff 為零。

完整 DB/workflow suite 只在此新 disposable DB 執行一次，結果為 11 files、95 tests 全部通過，exit code 0。現行 DB tests 仍要求每次 run 使用全新 disposable DB；同一 DB 保留先前測試資料後直接重跑會因固定 `TA`、`IN`、`BI` 碰撞失敗，未將同一 DB 可重跑標示為通過。

DB tests 通過後，`erp` 唯讀 gate 確認 datasource 為 `localhost:5432/erp`、migration status up to date、schema diff 為零、0009 finished 且未 rolled back、0 unresolved。0001～0009 本機 migration SQL SHA-256 全部與 `erp` 已套用 checksum 一致；三張 P3.1 table 存在且 bootstrap 前均為 0 筆。

公司設定 bootstrap 使用既有 `admin`、兩家公司 scope、`erp` database name guard 與 2026-07-25 effective date。第一次略過既有兩筆切帳日，新增兩家公司各五筆法定設定及 10 筆 audit；第二次 12 項全部略過，設定總數維持 12，`bootstrap.company_setting.created` audit 總數維持 12，沒有重複版本或 audit。

P3.1 smoke test 另建立使用正式 authentication 與 master／sales-order services 的專用腳本，預定保留 `P31-SMOKE-*` 測試資料並撤銷專用 session；舊 ERP 的庫存 smoke script 未使用。首次執行時，`tsx` 以 CommonJS output 轉譯，腳本結尾的三處 top-level await 不受支援，transform 階段即以 exit code 1 中止。任何 smoke application code 均未執行，因此沒有建立 session、主檔、訂單或 audit。依 fail-fast 未修正後重試。

取得最後一段核准後，只將 smoke script 的 top-level `try/finally` 包入 `run(): Promise<void>`，並以 `run().catch(...)` 保留非零 exit code；沒有變更任何業務 assertion、正式 service、schema、migration、bootstrap 或 DB tests。Lint 與 typecheck 均通過。執行前 datasource guard 再次確認 `localhost:5432/erp`、migration up to date、schema diff 為零。

Smoke script 成功轉譯、以正式 authentication 建立 session，並在 finally 透過正式 logout 流程撤銷 session。執行至運費缺失案例時中止：腳本預期 `createSalesOrderDraft` 在缺少有效運費規則時拒絕，但正式 service 允許建立 DRAFT，運費缺失應在確認時拒絕。Smoke assertion 因「預期拒絕但操作成功：找不到運費規則」回傳 exit code 1。依 fail-fast 未修改 assertion 後重跑。

此次 smoke run 已建立並保留 marker `P31-SMOKE-20260726232332` 的測試資料：

- 1 客戶、2 個 customer-company 關係、1 聯絡人、2 送貨地點。
- 2 品項、3 個 item-company 關係。
- 2 價格表、2 價格版本、2 客戶價格表指派、2 運費規則。
- 6 張訂單：BIOTECH 1 張 DRAFT；INDUSTRIAL 3 張 CONFIRMED、2 張 DRAFT（含 2026-08 新月份及缺運費規則草稿）。
- Audit 已包含登入／撤銷 session、主檔建立、6 次訂單建立、3 次確認、STANDARD_OVERRIDE 與 MANUAL。
- Idempotency 已驗證建立與確認的 replay 不重複產生 audit；修訂與作廢尚未執行。
- 禁止資料表查詢仍為 0。

後續 smoke 續驗均保留既有測試資料，沒有刪除舊 Marker、訂單、audit、idempotency 或重設 `document_sequences`：

- `P31-SMOKE-20260726233351`：缺運費 assertion 已改為建立 DRAFT 後於 confirm 驗證拒絕，但次月單號仍硬編碼為 `000001`；實際 `SO-IN-202608-000002` 是依既有保留資料取得的正確下一號，因此依 fail-fast 中止。
- Sequence assertion 隨後改為建單前依 company、year、month、`SALES_ORDER` scope 唯讀取得 `last_value`，預期下一號為 N+1；每次建單後同時驗證目標 scope 只增加 1，另外兩個 scope 不變，不使用 `MAX(order_number)` 或 client-side 取號。
- `P31-SMOKE-20260726234304`：公司／月份 sequence、`STANDARD`、`STANDARD_OVERRIDE`、`MANUAL` 均通過。缺運費訂單成功建立 DRAFT，confirm 回傳正式 `SalesOrderPrerequisiteError`、code `ORDER_CONFIRMATION_PREREQUISITE_MISSING`，訂單維持 DRAFT、confirm idempotency 為 `FAILED` 且無 `sales_order.confirmed` audit；唯一失敗是 smoke 預期訊息「缺少有效運費規則」，但正式 service 精確訊息為「找不到訂單日期有效的運費規則」。
- 最後只將 smoke 的精確訊息 assertion 同步為正式 service 訊息，保留 error class、code、DRAFT、confirmed actor、訂單／明細／snapshot、audit、idempotency 與禁止資料表的嚴格檢查，沒有修改 production service。

最終完整 smoke 使用 Marker `P31-SMOKE-20260726234731`，exit code 0：

- INDUSTRIAL 2026/07 建立 `SO-IN-202607-000010`、BIOTECH 2026/07 建立 `SO-BI-202607-000004`、INDUSTRIAL 2026/08 建立 `SO-IN-202608-000004`；三個 scope 都依建立前 `last_value + 1`，公司與月份互不影響。
- `STANDARD`、`STANDARD_OVERRIDE`、`MANUAL`、人工理由負面案例、正式價格不回寫及價格 idempotency 通過。
- 缺運費訂單 DRAFT 建立成功；confirm 以正式 class、code 與精確訊息拒絕，transaction rollback 後狀態、confirmed actor、訂單／明細／snapshot 不變，無 confirmed audit，idempotency 為 `FAILED`。
- Company、customer、customer-company、contact、delivery、item、price、freight 與公司法定資訊 snapshot 驗證通過。
- 正式修訂後 `revision_no` 由 1 增為 2、狀態回 DRAFT、confirmed actor 清除、snapshot 不自動刷新；replay 不重複修訂或 audit。
- 作廢理由負面案例、作廢欄位、終止狀態、audit 與 replay 通過；最終標準訂單為 `VOIDED`、`revision_no = 2`。
- 由正式 authentication 取得的 request context 以單一公司授權情境操作另一家公司時，後端回傳 `CompanyAccessError`。
- 本輪 40 筆 audit、30 筆 idempotency、6 張訂單及 6 筆明細均保留；session 透過正式撤銷流程關閉。
- `delivery_notes`、`delivery_note_lines`、`receivables`、`inventory`、`warehouses`、`lots`、`procurement`、`accounting_postings` 均不存在。

Smoke 後最終 gate：

- `erp` migration status up to date，schema diff 為 `No difference detected`，0 unresolved failed migration。
- 0001～0009 本機 migration SQL SHA-256 全部與 `_prisma_migrations.checksum` 相符，均 finished 且未 rolled back；migration Git diff 為空。
- `sales_orders` 21 筆、`sales_order_lines` 21 筆、`sales_order_relations` 0 筆；增加內容均為保留的 P3.1 smoke application data。
- INDUSTRIAL／BIOTECH 共 12 筆正式公司設定值正確，`bootstrap.company_setting.created` audit 維持 12 筆。
- 最終 lint、typecheck、`git diff --check` 全部通過；`src` 與 migration chain 未出現 P3.2 或禁止模組檔案。

因此 P3.1 已完成工程驗收。P3.2 仍須另行授權，本次沒有開始銷貨單、列印、PDF、應收、庫存或其他後續模組。

## 2. 正式決議與公司設定

新增 DEC-056，正式基線為 V0.9。

公司設定 registry 新增：

- `company_name`
- `document_company_code`
- `company_tax_id`
- `company_address`
- `company_phone`

`document_company_code` 必須為兩碼大寫英文字母，並用於：

`SO-{document_company_code}-{YYYYMM}-{六碼流水號}`

正式初始值：

| 公司代碼 | 公司名稱 | 單據公司碼 | 統編 | 地址 | 電話 |
| --- | --- | --- | --- | --- | --- |
| INDUSTRIAL | 奇麗實業有限公司 | IN | 60603347 | 新北市中和區國光街109巷22弄13號 | 02-29571175 |
| BIOTECH | 奇麗生技有限公司 | BI | 60377546 | 新北市中和區國光街109巷22弄13號 | 02-26805751 |

Bootstrap 為可重跑、具 audit 的 application workflow；同一生效日已有相同值時略過，值不同時拒絕覆蓋。正式資料已寫入 `erp` 並通過兩次可重跑驗證及 smoke 後最終值核對。

## 3. Schema 與 migration 草稿

新增：

- `sales_orders`
- `sales_order_lines`
- `sales_order_relations`
- `sales_order_status`
- `price_source`
- `sales_order_relation_type`

調整：

- `document_sequences` 增加 `fiscal_month`。
- 流水唯一範圍改為公司、年度、月份與單據類型。

`sales_orders` 保存：

- 公司、客戶、客戶公司關係、聯絡人與送貨地點 FK。
- 訂單日期、單號、狀態與 `revision_no`。
- 客戶、客戶公司、聯絡人、送貨地點、公司法定資訊、運費及付款條件 typed JSON snapshot。
- 未稅小計、運費與總額。
- 確認、作廢及建立／更新 actor 與時間。

`sales_order_lines` 保存：

- 訂單、公司、品項、品項公司關係、正式價格表及價格版本 FK。
- 品項及價格 typed JSON snapshot。
- `numeric(18,4)` 數量、`numeric(18,5)` 單價、`numeric(18,0)` 明細金額。
- `STANDARD`、`STANDARD_OVERRIDE`、`MANUAL` 價格來源及人工理由。
- 軟移除狀態、actor 與時間，不使用 hard delete。

`sales_order_relations` 只建立 P3 所需的追加訂單關聯基礎；P3.1 不提供建立追加訂單的 API 或 UI。

`0009_p3_sales_orders` 為 additive migration，未修改 0001～0008。SQL 包含 enum、table、index、CHECK、composite FK、partial/expression unique index 及 RESTRICT FK。0009 已成功套用至 `erp`，Prisma status 為 up to date、schema diff 為 `No difference detected`。最終 smoke 後 `sales_orders` 21 筆、`sales_order_lines` 21 筆、`sales_order_relations` 0 筆，均為保留的 P3.1 驗收資料。後續不得回改 0009，修正一律採 forward-fix。

## 4. 訂單流程

P3.1 可執行狀態轉換：

- 建立：無 → `DRAFT`
- 確認：`DRAFT` → `CONFIRMED`
- 正式修訂：`CONFIRMED` → `DRAFT`，`revision_no + 1`
- 作廢：`DRAFT` 或 `CONFIRMED` → `VOIDED`

`DELIVERY_CREATED`、`SHIPPED`、`COMPLETED` 只保留正式 enum，不在 P3.1 提供轉換功能。

規則：

- 建立草稿時立即配置單號；transaction rollback 時流水更新一併 rollback。
- 作廢單號不回收。
- 正式修訂保留同一訂單 ID 與單號。
- 已確認訂單不可直接 PATCH，必須先開始正式修訂。
- 作廢理由必填；`VOIDED` 為終止狀態。
- 明細移除採軟移除，保留 audit。
- 所有重要寫入使用 company scope、後端 RBAC、transaction、audit、idempotency 與 correlation ID。

## 5. 價格、運費與金額

- 正式價格依 `order_date` 查詢。
- 使用正式價：`STANDARD`。
- 有正式價但改價：`STANDARD_OVERRIDE`，理由必填。
- 查無正式價：`MANUAL`，人工價格及理由必填。
- 人工交易價不得回寫正式價格表。
- 運費依訂單日期、公司、客戶及送貨地點查詢正式規則。
- 找不到有效運費規則時拒絕確認，不自行套用零或免運。
- 金額採未稅。
- 每列 `quantity × unit_price` 使用 decimal-safe half-up 四捨五入至元。
- 訂單小計為明細元金額加總；總額為小計加運費。
- 確認時重新驗證主檔狀態、公司關係、正式價格、運費與公司設定，再凍結快照。

## 6. Service、API 與 UI

Service：

- 建立、更新及查詢草稿。
- 新增、更新、軟移除明細。
- 價格與運費預覽。
- 確認、正式修訂及作廢。
- 搜尋、分頁及狀態篩選。
- 並行安全月流水取號。

API：

- `GET/POST /api/sales-orders`
- `GET/PATCH /api/sales-orders/{id}`
- `POST /api/sales-orders/{id}/confirm`
- `POST /api/sales-orders/{id}/revision`
- `POST /api/sales-orders/{id}/void`
- `POST /api/sales-orders/preview-pricing`
- `POST /api/sales-orders/preview-freight`

不存在 DELETE route。所有 POST/PATCH 路由執行 same-origin 檢查；寫入要求 `Idempotency-Key`。

UI：

- `/sales-orders`
- `/sales-orders/new`
- `/sales-orders/{id}`

ADMIN 與 ORDER_ENTRY 均可管理目前授權公司的訂單。畫面不包含銷貨單、列印、PDF、實際送貨日、收貨確認、應收、庫存、倉庫、批號或採購功能。

## 7. 測試覆蓋

Unit tests 已涵蓋：

- 數量與單價 decimal normalization。
- 明細 half-up 至元與訂單加總。
- 價格來源與人工理由 validation。
- 訂單狀態合法／非法轉換。
- company scope 與 RBAC permission。
- 公司法定設定及兩碼單據公司碼 validation。

DB/workflow tests 已在全新 disposable DB 完整執行並通過：

- 草稿取號、snapshot、idempotency replay。
- 確認與主檔修改後快照不漂移。
- `STANDARD_OVERRIDE` 與理由。
- 查無正式價格時的 `MANUAL` 價格，且不回寫價格主檔。
- 修訂、作廢與明細軟移除。
- 五筆並行取號不重複。
- 偽造 company scope 被拒絕。
- PostgreSQL constraint catalog。
- 不存在銷貨單、應收、庫存、倉庫、批號、採購或會計表。

## 8. 已執行品質檢查

| 驗證 | 結果 |
| --- | --- |
| `npm run prisma:validate` | 通過 |
| `npm run prisma:generate` | 通過 |
| `npm run lint` | 通過 |
| `npm run typecheck` | 通過 |
| `npm run test` | 15 files、73 tests 通過 |
| `npm run build` | 通過 |
| `npm run test:db` 第一次 | 11 files：10 passed、1 failed；95 tests：94 passed、1 failed（baseline expected ordering） |
| `npm run test:db` 排序修正後重跑 | 11 files：9 passed、2 failed；95 tests：87 passed、1 failed、7 skipped（保留測試資料的單據公司碼唯一衝突） |
| 新 disposable DB migration | 0001～0009 全部成功；status up to date；diff 0 |
| 新 disposable DB 完整 `test:db` | 11 files、95 tests 全部通過；exit code 0 |
| 全新 DB A 0001～0009 | 通過；pre-status 1（預期 pending）、deploy 0、post-status 0 |
| 全新 DB B 0001～0009 | 通過；pre-status 1（預期 pending）、deploy 0、post-status 0 |
| disposable DB migrate status | A／B 均 up to date；各 9 success、0 unresolved、0 rolled-back |
| disposable DB schema diff | A／B 均 `No difference detected` |
| PostgreSQL catalog | A／B enum、CHECK、composite FK、unique/index、sequence scope、RESTRICT 與禁止表通過 |
| `erp` migrate deploy | 0009 成功，但發生於 fresh DB gate 前 |
| `erp` migrate status/diff | up to date／`No difference detected` |
| 公司設定 bootstrap 第一次 | 成功；略過 2、新增 10、audit 新增 10 |
| 公司設定 bootstrap 第二次 | 成功；12 項全部略過，設定與 audit 筆數不變 |
| P3.1 smoke test 第一次 | CJS top-level await transform error；業務程式未執行、無資料 mutation |
| P3.1 smoke entrypoint | 只改 async entrypoint；lint、typecheck 通過 |
| P3.1 smoke test 第二次 | 成功轉譯與登入；缺運費規則 assertion 時點不符，exit 1；測試資料保留 |
| P3.1 smoke test 第三次 | 缺運費確認時點已正確；次月單號硬編碼 `000001`，實際正確下一號為 `000002`，依 fail-fast 中止 |
| P3.1 smoke test 第四次 | N+1 sequence、價格及缺運費正式行為通過；正式訊息精確值 assertion 不一致，依 fail-fast 中止 |
| P3.1 smoke test 最終 | Marker `P31-SMOKE-20260726234731`；完整流程通過，exit code 0 |
| Smoke 後最終 gate | status up to date、diff 0、禁止表 0、公司設定與 audit 正確、lint/typecheck/diff check/checksum 全部通過 |

## 9. Migration 與資料安全

- 未修改 0001～0008 migration。
- 未執行 `migrate reset`。
- 未 drop database 或 schema。
- 未刪除資料或 Docker volume。
- 未執行 `migrate resolve` 或手工修改 `_prisma_migrations`。
- 0001～0008 Git diff 為空。
- `erp` migration history 中 0009 已完成，沒有新增 failed migration。
- `erp` 原有 rolled-back 0003 與後續成功 0003 維持原狀；不存在 unresolved failed migration。
- 最終 smoke 後 `sales_orders`、`sales_order_lines` 各 21 筆，均為保留的 P3.1 smoke data；`sales_order_relations` 為 0 筆。

必須先完成兩個全新測試 DB、DB tests、catalog 與 schema diff 驗證；全部通過後，才可依核准範圍部署 `erp`。若 `0009` 在首次正式採用後發現缺口，使用新的 forward-fix migration，不回改已定稿 migration。

## 10. P3.1 完成判定

目前判定：**P3.1 工程驗收完成**。

Baseline ordering、兩個 fresh DB migration/catalog/diff、新 disposable DB 完整 95 項 DB tests、`erp` gate、兩次 bootstrap、完整 smoke 及 smoke 後最終 gate全部通過。測試資料庫標準生命週期仍為每次 run 建立新的 disposable DB；不宣稱保留資料的同一 DB 可直接重跑。所有 smoke 中止紀錄與 Marker 資料均保留，最終驗證沒有修改 production service、schema 或 0001～0009 migration。

P3.1 已具備工程結案條件；P3.2 仍為待授權範圍，未取得下一步核准前不得開始。
