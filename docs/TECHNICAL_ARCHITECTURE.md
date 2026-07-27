# Ragic 本地端系統技術架構

文件狀態：P1、P2、P3.1 已完成；P3.2a schema、P3.2b 核心 service 與 P3.2c rebuild／ADMIN direct void 已完成，P3.2d API／UI 尚未開始
同步基線：`DECISIONS.md` V0.10
版本日期：2026-07-27

## 1. 規格依據與範圍

本架構依下列優先順序設計：

1. `DECISIONS.md` V0.10。
2. `business-rules.md`。
3. `DATABASE_DESIGN.md`。
4. `TECHNICAL_ARCHITECTURE.md`。
5. `IMPLEMENTATION_PLAN.md`。
6. 原始 Ragic Word／Excel 規格。
7. `OPEN_QUESTIONS.md`。
8. 其他舊文件。

第一階段固定為 Ragic 本地端重建，不採 ERP MVP 的庫存、批號、分批出貨、出庫依賴或正式會計過帳。`OPEN_QUESTIONS.md` 保留 OQ-005、OQ-044、OQ-045 與可延後的 OQ-051；OQ-046～OQ-050 已由 DEC-057 決議。第一階段以「銷貨單已回收」的人工確認作為建立應收條件，不實作正式電子簽收。

## 2. 第一階段模組

| 模組 | 功能範圍 |
| --- | --- |
| Identity & Access | 帳密登入、兩種主要角色、公司授權、Session 管理 |
| Organization | 公司、公司切帳日與生效版本 |
| Master Data | 客戶、聯絡人、送貨地點、共用品項、分類、價格表、廠商及公司交易關係 |
| Sales | 訂單、追加訂單、唯一有效銷貨單、列印、實際出貨日、作廢歷程 |
| Receivables | 應收、應收明細、正式統一發票資料、應收調整 |
| Cash & Advances | 收款、分配、預收、預收再分配、退款與反向紀錄 |
| Checks | 應收／應付票據、分配、狀態歷程、退票與換票 |
| Monthly Closing | 月結投影、向後重算、不可變列印／寄送版本 |
| Payables | 人工應付、付款與付款分配 |
| Miscellaneous Expenses | 最小支出欄位及 nullable 擴充欄位 |
| Migration & Audit | 混合移轉、legacy mapping、核對、稽核與封存 |

明確排除：採購、進貨、驗收、庫存、批號、入出庫、調撥、庫存成本、固定資產、正式會計過帳及人資薪資。

## 3. 建議架構

採用「模組化單體」的內網 Web 系統。第一階段由同一程式庫部署 Web 與 Worker，使用單一 PostgreSQL 保證跨單據一致性；不拆微服務、不引入外部 message broker。

```mermaid
flowchart TB
  UI["Next.js Web UI\n清單／完整明細／列印"]
  HTTP["Server Actions / Route Handlers\nSession、RBAC、公司授權、輸入驗證"]
  APP["Application Use Cases\nTransaction、冪等、狀態轉換"]
  DOMAIN["Domain Modules\nSales／AR／Cash／Checks／Monthly／AP"]
  DB[("PostgreSQL\nUUID、FK、限制、投影、Audit")]
  WORKER["Background Worker\n月結重算、移轉、票據到期"]
  NAS["NAS / File Storage\n附件與封存檔"]

  UI --> HTTP --> APP --> DOMAIN --> DB
  APP --> NAS
  WORKER --> APP
  WORKER --> DB
```

## 4. 技術組合

| 層次 | 建議 | 說明 |
| --- | --- | --- |
| Web | Next.js + TypeScript | 前後端同一程式庫，適合本機與內網部署 |
| UI | Server-rendered list/detail forms | 緊湊清單、完整新增頁、唯讀明細與明確狀態動作 |
| Validation | 共用 schema validation | 前端提示，後端完整重驗 |
| ORM | Prisma | 型別、一般 CRUD 與 migration 管理；P1.2 以獨立測試資料庫驗證 0001、0002 |
| Database | PostgreSQL | UUID、ACID、partial index、exclusion constraint、JSONB |
| Authentication | Server-side revocable session | token 只存 hash、閒置 8 小時到期、帳號停用時撤銷全部 Session |
| Background Jobs | PostgreSQL-backed queue | 月結、移轉與票據工作可追蹤及重跑 |
| Attachments | NAS／受控檔案儲存 | DB 只存 metadata；20 MB；授權下載；不得實體刪除 |
| Tests | Unit + DB integration + workflow + migration reconciliation | 核心規則、transaction、公司隔離與移轉核對 |

## 5. 模組邊界

| 模組 | 主要責任 | 禁止事項 |
| --- | --- | --- |
| Identity & Access | 使用者、角色、Session、公司可見範圍 | 不直接改業務狀態 |
| Organization | 公司與有效日起算的參數 | 不保存交易內容 |
| Master Data | 共用客戶、品項、廠商、價格與公司關係 | 不更新帳款餘額 |
| Sales | 訂單、追加、銷貨、列印、回收確認 | 不建立庫存或出庫異動 |
| Receivables | 應收、發票資料、調整與同步餘額 | 不修改來源交易快照 |
| Cash & Checks | 收付款工具、預收、退款、票據與分配 | 不刪除分配；以反向紀錄撤銷 |
| Monthly Closing | 可重建月結與不可變對外版本 | 不覆寫原始交易或舊列印版本 |
| Payables | 人工應付、付款及分配 | 不假造採購、進貨或驗收來源 |
| Migration | 匯入、人工整理、mapping、核對與 cut-off | 未核對資料不得轉正式 |
| Audit | 操作者、前後值、狀態與來源 | 不作為登入紀錄替代品 |

模組只能透過 application use case 執行跨表動作；頁面不得自行組合跨模組更新。

## 6. Transaction、冪等與稽核

以下動作必須在單一資料庫 transaction 完成：

- 使用者由 `CONFIRMED` order 明確建立銷貨單；sequence、header、lines、order `DELIVERY_CREATED`、audit 與 idempotency completion 同一 transaction。
- Revision start 不作廢舊 `ACTIVE` 銷貨單；新 revision 重新確認後，單一 rebuild transaction 鎖定 order 與目前非 `VOIDED` 銷貨單、取新號、建立 replacement、作廢舊單、更新 order 並寫 audit。任一步驟失敗時舊單仍 `ACTIVE`、order 仍 `CONFIRMED`。
- `DRAFT`、`CONFIRMED`、`DELIVERY_CREATED` order 作廢時，在同一 transaction 以 `ORDER_VOID` 自動作廢目前非 `VOIDED` 銷貨單。
- ADMIN 直接作廢 `ACTIVE` 銷貨單時，在同一 transaction 以 `ADMIN_DIRECT` 作廢並將 order `DELIVERY_CREATED -> CONFIRMED`；不自動重建。
- 由已出貨且已人工確認「銷貨單已回收」的銷貨單建立唯一應收並鎖定來源；第一階段不實作正式電子簽收。
- 應收在沒有發票、收款、票據及月結來源時可直接更正並寫 audit；存在任一後續資料時改以正式調整、核准及同步更新應收餘額。
- 收款、預收、退款、付款及票據分配；撤銷時建立反向紀錄。
- 收款、付款與什項支出尚無分配或後續來源時可修改或作廢；已有分配時禁止直接修改主要資料，已月結後僅管理員可透過反向紀錄更正。理由、前後值及完整歷程寫入 audit log。
- 退票、換票、恢復應收及建立月結重算工作。
- 月結列印／寄送版本建立與來源快照。
- 匯入單一聚合、建立 legacy mapping 與核對結果。

所有可重試命令使用 idempotency key 或等價唯一限制。重要狀態、前後值、下游建立／撤銷、分配、重算及移轉均寫入 audit log；交易失敗時不得留下部分結果。

## 7. 公司別與共用主檔

- 所有交易表頭保存 `company_id`。
- 客戶、`items` 與廠商是跨公司共用主檔，分別使用公司關係表控制可用範圍。
- `items` 以 `item_type` 與功能旗標控制用途；`barcode` 非空時全系統唯一；第一階段只啟用銷售，不啟用庫存、批號、採購或生產。
- 使用者透過 `user_company_scopes` 取得一或多家公司權限；切換公司不改變交易既有公司歸屬。
- 公司、客戶、品項、廠商及所有來源／目標關聯均在後端交叉驗證。
- `freight_rules` 與 `customer_price_list_assignments` 使用 composite FK 保證客戶／公司一致；`price_lists` 不保存 `exclusive_customer_id`。
- `company_settings` 保留泛用 key/value 儲存，但每個 `setting_key` 都必須通過應用層 schema registry 驗證。

## 8. 銷售與應收控制

- 同一訂單同時最多一張 `status <> 'VOIDED'` 銷貨單；partial unique 不得只限制 `ACTIVE`，作廢歷史保留。
- 首次列印且實際出貨日為空時才自動帶入日期；重印不得覆蓋。
- 第一階段以 `returned_confirmed` 或等效欄位記錄銷貨單已回收，作為建立應收的人工作業證據。
- 第一階段不實作正式電子簽收。OQ-005 只保留第二階段的電子簽收設計，不影響第一階段開發；未來簽收功能不得覆蓋人工確認歷程。
- 建立應收後鎖定訂單與銷貨單；一張銷貨單最多一筆有效應收，一筆應收可有多張正式發票。
- 未稅單價可至小數點 5 位，交易金額至元；第一階段不串接政府電子發票。
- 所有交易數量使用 `numeric(18,4)`。
- 客戶價格表指派與品項價格都使用半開有效期間；同客戶、同公司的指派期間不得重疊。
- 查無有效價格時將交易明細標示為人工價格；有標準價而改價時理由必填。正式價格表只允許管理員新增或更新。
- 同一 `sales_order_id` 只允許一張狀態非 `VOIDED` 的 `delivery_notes`；作廢歷史保留。
- 應收調整保存 `approval_status`、`approved_by`、`approved_at`；折讓、退貨與呆帳核准後才生效，退貨與呆帳缺少附件時不得核准。
- 第一階段應付帳單月份依應付日期與公司有效切帳日計算，不進行逐筆收入配對。

## 9. 月結與背景工作

1. 應收、調整、收款分配、票據分配或退票先在交易中同步更新應收餘額。
2. 同一交易建立具有 dedupe key 的月結重算工作。
3. Worker 依公司、客戶及最早受影響月份取得鎖，由該月向後覆蓋重算。
4. 畫面顯示「處理中」；月結重算目標 1 分鐘內完成，管理員可重跑。
5. 收款與票據依被分配應收日期歸屬；退票依原應收恢復。
6. 每次列印或寄送建立不可變版本與來源快照；重算不得覆蓋舊版。

月結重算的 1 分鐘目標與其他背景工作分開衡量；移轉、票據到期等其他背景工作目標為 5 分鐘內完成。

## 10. 附件與檔案

- 附件放在公司內部伺服器、NAS 或受控檔案儲存，資料庫只存 metadata 與連結。
- 單檔上限 20 MB，只允許常見文件與圖片；上傳時驗證 MIME、大小及雜湊。
- 下載必須經授權端點；不得公開檔案路徑。
- 附件隨交易保存至少 7 年且不得實體刪除。
- 核心交易使用專屬 FK；audit 可用 generic entity reference，附件使用 `attachment_links`。
- `attachment_links` 的 generic entity reference 由應用層驗證允許類型、目標存在性及公司範圍；完整性整合測試覆蓋有效、無效、跨公司及目標不存在情境。

## 11. 移轉與切換架構

- 採混合移轉：可可靠對應的主檔與未結交易由匯入程式處理，例外由管理員整理或輸入。
- P2.6 以 `migration_batches`、`legacy_id_map`、`migration_issues`、`migration_reconciliations` 建立可重跑的匯入控制面；正式 UUID 與 legacy ID 分離。
- CSV 依「上傳安全檢查 → typed staging object → normalization → row／跨列／DB validation → legacy FK mapping → dry-run 或正式 service → audit／mapping → reconciliation」處理。
- 正式 execute 只呼叫既有主檔 service；每列的正式主檔、公司關係、audit、idempotency 完成及 legacy mapping 在同一 transaction，失敗不得留下不完整關係。
- 批次以公司、來源系統、實體、檔案 SHA-256 與 dry-run 模式識別；相同內容可安全重送。原始檔預設不落地，檔名、MIME、大小、UTF-8、CSV 結構及 formula injection 均先驗證。
- issue 只保存遮罩後資料；production log 不記錄 CSV 原文或完整資料列。
- P2.6 已實作客戶、客戶公司關係、品項、品項公司關係 importer；聯絡人、送貨地點、價格表、價格明細、客戶價格表指派及運費規則目前只有 CSV 契約。
- 核對至少包含筆數、公司、客戶／廠商、月份、應收、應付、票據與月結餘額。
- 上線前一天凍結 Ragic 寫入，執行增量匯入與最終核對；切換後 Ragic 唯讀，失敗時恢復 Ragic 寫入。
- 新系統只移未結案件與整理後主檔；完整歷史保留於唯讀 Ragic 或封存至少 7 年。
- 上線後回退窗口（OQ-044）與附件移轉範圍（OQ-045）在 P8 切換前確認，不阻塞 P1。
- 現有資料用途無法只由資料庫完全確認；重建資料庫或 schema 必須另案授權。P1.2 未修改現有 `erp` 資料庫。

## 12. Prisma 與 PostgreSQL migration 策略

1. 先由 Prisma 產生 `create-only` migration 草稿，不直接套用。
2. 一般資料表、欄位及普通索引維持於 Prisma schema。
3. exclusion constraint、partial unique index、composite FK 與複雜 CHECK 以明確命名的 custom SQL 加入同一 migration。
4. 審查資料前置條件、鎖定影響、執行順序及 rollback／forward-fix 後，才可在測試環境執行。
5. 在乾淨資料庫及前一版本升級路徑執行 DB integration test，驗證 constraint 存在性及正反案例。

P1.2 依上述流程建立 `0002_p1_authentication_and_access`，並只在獨立 P1 測試資料庫由空白依序套用 0001、0002；已定稿的 0001 未修改。

P2.6 依相同流程建立 `0008_p2_master_import_foundation`；0001～0007 未修改，並於乾淨 disposable database 由零套用 0001～0008、驗證 catalog 及 schema diff。

P3.1 使用 `0009_p3_sales_orders` 擴充既有 `document_sequences` 的月份 scope，並新增銷售訂單三表。Migration 以 custom SQL 實作價格欄位組合、狀態 actor、快照、軟移除及 composite FK；不建立第二套 sequence 或任何銷貨單資料表。

## 13. 部署與營運

部署單元：

- `web`：Next.js Web application。
- `worker`：同程式庫的背景工作程序。
- `db`：PostgreSQL 獨立資料卷。
- `files`：NAS／受控附件目錄。
- `backup`：每日備份，與正式資料卷分離。

開放內網多人使用時需使用 TLS、固定主機名、登入防暴力嘗試、可撤銷 Session、公司權限及附件下載稽核。`user_sessions` 只保存 token hash，依最後活動時間執行 8 小時閒置到期；停用帳號時在伺服器端撤銷全部有效 Session。

## 14. 非功能與驗收基線

| 面向 | 基線 |
| --- | --- |
| 使用量 | 10 名同時使用者；每年 100,000 筆交易 |
| 回應時間 | 一般頁面 2 秒內 |
| 背景工作 | 月結目標 1 分鐘；其他工作 5 分鐘內 |
| 備份恢復 | 每日備份；RPO 24 小時；RTO 8 小時 |
| 保存 | 正式交易、稽核、附件與封存資料至少 7 年 |
| 一致性 | 跨表失敗無部分資料；冪等重試不重複結果 |
| 安全 | 訂單輸入人員透過 UI、網址及 API 均不能讀取財務資料 |
| 公司隔離 | 查詢、命令、匯出與背景工作均驗證公司範圍 |
| 可追溯 | 交易可追至來源、快照、操作者、狀態、作廢／反向紀錄及 Ragic ID |

## 15. P1.2 實作邊界

P1.2 只實作帳號、密碼、Session、`ADMIN`／`ORDER_ENTRY` 後端 RBAC、公司 scope、登入／登出／公司切換、最小使用者管理與初始管理員 bootstrap。未實作客戶、品項、價格、訂單、銷貨、帳款、票據、月結、採購、庫存、批號、倉庫或 Ragic 移轉；未重建或修改現有 `erp` 資料庫。

## 16. P2 工程結案邊界

P2.1～P2.6 已完成公司參數、客戶、品項、價格、運費的主檔功能與整合驗收，以及小量主檔匯入框架。P2 未建立訂單、銷貨單、快照、列印、應收、庫存、採購、生產或會計資料表；完整 Ragic 正式移轉仍屬 P8。

## 17. P3.1 銷售訂單架構

- 訂單命令集中於 server-side service 與 state machine；一般 PATCH 只允許 `DRAFT`，確認、修訂及作廢使用獨立命令。
- API 只使用 session 中的目前公司，不接受 client 自行指定可信 `companyId`、訂單號、狀態、版次、合計、actor 或 snapshot。
- 草稿取號透過 `document_sequences` 的原子 `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING` 完成。取號、訂單、audit 與 idempotency completion 位於一致 transaction；失敗時流水增量一併 rollback。
- 金額以十進位字串及整數縮放計算，不使用 JavaScript `Number` 作核心乘法；明細 half-up 至元後再加總。
- 訂單確認會重新驗證客戶公司關係、地點、聯絡人、可銷售品項、訂單日期有效價格、人工價格理由、運費規則及公司法定設定，再建立 typed snapshot。
- typed JSON contract：Decimal 使用十進位字串、date 使用 `YYYY-MM-DD`、timestamp 使用 ISO-8601 UTC；必要快照由 DB 阻擋 null／空物件，再由 Zod／service 驗證完整內容。
- 明細移除採 `is_active=false` 並保存 `removed_at/by` 與 audit；不提供 DELETE route 或 hard-delete UI。
- `sales_orders.read` 與 `sales_orders.manage` 授予 `ADMIN`、`ORDER_ENTRY`，但每個 request 仍由後端驗證 session、selected company 與 company scope。
- P3.1 頁面及 API 不提供銷貨單、列印、PDF、出貨、回收確認、應收或庫存功能。

## 18. P3.2 銷貨單架構決議

P3.2a 已完成 Prisma schema、`0010_p3_delivery_notes`、custom SQL、fresh DB 驗證及本機 `erp` 受控部署。P3.2b 已完成建立／查詢 service；P3.2c 已完成 revision start/re-confirm controlled state、原子 rebuild、replacement chain、ADMIN direct void、typed errors、固定 row lock、audit、idempotency 與 rollback。API 與 UI 尚未建立。

- 公開 command 為 `createDeliveryNoteFromOrder`、`rebuildDeliveryNoteForOrder`、`adminVoidDeliveryNote`；查詢為 `getDeliveryNote`、`listDeliveryNotes`、`getCurrentDeliveryNoteForOrder`。Order 作廢使用內部 `voidDeliveryNoteForOrderVoid` helper，revision start 不操作 delivery note。
- 初次建立由使用者明確觸發。Server 驗證 order=`CONFIRMED`、permission、company scope 及不存在非 `VOIDED` 銷貨單，才在 transaction 內配置 `DELIVERY_NOTE` 號碼並建立完整快照。
- Rebuild 是不可拆分的 server command。Lock 順序固定為 idempotency claim、order、目前非 `VOIDED` delivery note、document sequence；為符合 partial unique，同一 transaction 先將舊單改為 `VOIDED`，再建立新 `ACTIVE` header／lines、更新 order、寫 audit 並完成 idempotency。任一步失敗會完整 rollback。
- 銷貨單 header／lines 只複製新 revision 已確認的 typed snapshots 與凍結金額，不重新查詢 customer／item／price／freight master，也不接受 client snapshot、金額、單號、日期或 current delivery note。
- `delivery_note_date` 由 server 以 `Asia/Taipei` business date 產生並保存為 PostgreSQL `date`。號碼年月與 `document_company_code` 有效版本都依此日期；禁止用 UTC 日期切割、client today、`order_date` 或 `actual_delivery_date`。
- 每張追加訂單直接以 `ADDITION` 指向 root original order，並建立自己的銷貨單；不形成 chain、aggregate delivery note 或跨 order 合併。Service 解析 root 並防 self、duplicate、cycle 及 addition-as-source。
- 0010 已以 PostgreSQL custom constraint trigger／function、transaction advisory lock 與 recursive query 在 DB 層再次檢查 ADDITION 同公司、source 為 root、無 cycle 且 source 不是另一張 addition；未來 application transaction 仍須先行驗證並固定 lock order。
- 權限分為 `delivery_notes.read`、`delivery_notes.manage`、`delivery_notes.admin_void`。ADMIN 與 ORDER_ENTRY 可在授權公司 read／manage；只有 ADMIN 有 direct void。內部 order workflow 的自動作廢不要求 admin void。
- Audit 使用 `delivery_note.created`、`delivery_note.voided`、`delivery_note.rebuilt`、`sales_order.delivery_created`、`sales_order.delivery_rebuilt`，並以 `ADMIN_DIRECT`、`ORDER_REVISION_REBUILD`、`ORDER_VOID` 表達 void source。
- Idempotency operations 為 `delivery_note.create`、`delivery_note.rebuild`、`delivery_note.admin_void`、`sales_order.void_with_delivery_note`。P3.2 全部保持同步 transaction，不使用 background job。
- P3.2b 建立流程先在 transaction 內建立 header，再依 line number 逐筆建立含明確 `delivery_note_id`／`company_id` 的 lines；line failure 會 rollback header、sequence、order status、audit 與 idempotency completion。
- `0010_p3_delivery_notes` 已建立兩表及 enum，custom SQL 實作 `WHERE status <> 'VOIDED'` partial unique、composite FK、複雜 CHECK、replacement chain 與 ADDITION graph trigger；0001～0009 未修改。兩個 fresh DB 均由零套用 0001～0010 且 schema diff=0，本機 `erp` 亦已套用 0010，production live／ready／worker health 均通過。

## 19. 變更紀錄

- V0.10（2026-07-27，P3.2c 工程同步）：完成 revision start/re-confirm controlled state、原子 replacement rebuild、ADMIN direct void、固定 lock 順序、typed errors、audit、idempotency 與 rollback；API／UI 未開始。
- V0.10（2026-07-27，P3.2b 工程同步）：完成 delivery-note 核心建立／查詢 service、company scope／RBAC、order／current-note row lock、Asia/Taipei 月流水、confirmed snapshot copy、Decimal invariant、audit、idempotency 與 ORDER_VOID 整合；API／UI／rebuild／ADMIN direct void 未開始。
- V0.10（2026-07-27，P3.2a 工程同步）：完成 Prisma model、`0010_p3_delivery_notes`、partial unique、composite FK、replacement／ADDITION constraint trigger、兩個 fresh DB、本機部署及 health 驗證；service／API／UI 未開始。
- V0.10（2026-07-27）：同步 DEC-057，完成 P3.2 銷貨單手動建立、revision 原子重建、追加 root 關聯、ADMIN direct void、`delivery_note_date` 取號、snapshot、權限、transaction、audit、idempotency 與 0010 架構規劃；尚未開始實作。
