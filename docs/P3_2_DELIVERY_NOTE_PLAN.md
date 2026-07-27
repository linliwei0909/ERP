# P3.2 銷貨單規格盤點與實作規劃

文件狀態：P3.2a schema／migration fresh DB 驗證完成；P3.2b service 以後尚未核准
規劃日期：2026-07-27
規格基線：`DECISIONS.md` V0.10／DEC-057
適用範圍：P3.2 銷貨單與銷貨單明細
明確排除：列印／PDF、實際出貨日正式流程、紙本回收確認、應收、庫存與 P3.3／P3.4

> OQ-046～OQ-050 已由 DEC-057 正式決議。P3.2a 已完成 Prisma schema、0010 與 DB contract 驗證；service、API、UI、列印、PDF、出貨、回收確認與應收仍未開始。

## 1. 現況盤點

### 1.1 Git、migration 與現有資料模型

- 規劃開始時位於 `main`，工作樹乾淨，`main` 與 `origin/main` 同步。
- 最近兩筆正式功能 commit 為 P2.6 `692a177` 與 P3.1 `c0c9478`。
- 正式 migration chain 為 `0001`～`0009_p3_sales_orders`。
- P3.2a 完成後 Prisma schema 有 `sales_orders`、`sales_order_lines`、`sales_order_relations`、`delivery_notes`、`delivery_note_lines`；仍無應收、列印、PDF、庫存表。
- `SalesOrderStatus` 已預留 `DELIVERY_CREATED`、`SHIPPED`、`COMPLETED`；P3.1 目前只實作 `DRAFT`、`CONFIRMED`、`VOIDED` 的流程。
- `sales_order_relations` 已有 `ADDITION` 類型、禁止 self-reference 的 CHECK、唯一關聯與 RESTRICT FK，但沒有 root order、公司 composite FK 或完整循環防護。
- `document_sequences` 已支援 `(company_id, fiscal_year, fiscal_month, document_type)` 原子流水。

### 1.2 P3.1 可重用能力

- 後端 `RequestContext`、session、RBAC、company scope 與一致授權錯誤。
- `executeIdempotent` 的相同 key／相同 payload replay、不同 payload conflict、PROCESSING／COMPLETED／FAILED lifecycle。
- append-only `audit_logs` 與 caller transaction 內的 `writeAudit`。
- PostgreSQL row lock、原子 `INSERT ... ON CONFLICT ... RETURNING` 單號流水。
- typed order snapshots、decimal-safe 數量與金額規則。
- 訂單建立、編輯、確認、正式修訂、作廢、查詢、分頁及一致 API error。
- P1 的 health、migration-health、correlation ID、logging 與 DB integration test 基礎。

### 1.3 已閱讀來源

- 根目錄 `AGENTS.md`。
- `DECISIONS.md`、`business-rules.md`、`DATABASE_DESIGN.md`、`TECHNICAL_ARCHITECTURE.md`、`IMPLEMENTATION_PLAN.md`、`OPEN_QUESTIONS.md`。
- P1、P2 全部 validation 文件、`P3_1_SALES_ORDER_VALIDATION.md` 與主檔匯入規格。
- 原始 Ragic Word／Excel 規格中的銷售訂單、銷貨單、關聯、欄位及狀態資料。
- 現有 sales-order Prisma schema、migration、service、API、UI、unit／DB tests，以及 auth、RBAC、company scope、audit、idempotency、background jobs、health 與 sequence 實作。

Repository 沒有獨立命名的 P3.0 規劃文件；P3.0 結論目前分散在正式設計文件與 P3.1 validation 中。

## 2. 已確認業務規則

1. 銷貨單只能由銷售訂單建立，不允許獨立人工新增。
2. 訂單必須先確認，才能由使用者在訂單明細明確建立銷貨單；訂單確認本身不自動建立。
3. 第一階段不分批出貨，不允許部分數量出貨。
4. 同一 `sales_order_id` 同時最多一張狀態非 `VOIDED` 的銷貨單；歷史作廢單永久保留。
5. 已確認、尚未出貨的訂單可修訂；若已有銷貨單，舊單須作廢並依最新確認內容完整重建。
6. 已出貨後不得修改原訂單或原銷貨單；須另建追加訂單、關聯原訂單，再由追加訂單建立新銷貨單。
7. 一般使用者沒有獨立直接作廢按鈕；訂單作廢或重建可由訂單 workflow 連動作廢。
8. ADMIN 可例外直接作廢，但理由、時間、操作者與來源操作必須保存，且有應收或後續財務資料時禁止。
9. 銷貨單沿用已確認訂單的主檔、價格、運費及金額快照；不得在建立銷貨單時重新查價、重算運費或刷新主檔。
10. 建立銷貨單後訂單進入 `DELIVERY_CREATED`。
11. `SHIPPED` 由未來填入實際出貨日觸發；`RECEIVABLE_CREATED` 由未來建立應收觸發。
12. 「銷貨單已回收」是獨立人工確認欄位／事件，不是銷貨單 status；第一階段不實作正式電子簽收。
13. 銷貨單及交易歷程不得 hard delete，不使用 cascade delete。
14. 所有跨單據操作、sequence、audit 與狀態更新必須位於同一 database transaction。

## 3. 文件衝突與決議結果

| 項目 | 內容 | 判定 |
| --- | --- | --- |
| 追加訂單 | 原規劃文字可能被解讀為 root aggregate 完整重建。 | DEC-057 維持 DEC-013：追加單全部直接指向 root original order、各自建立只含自身內容的銷貨單，不聚合、不形成 chain。 |
| 唯一有效單 | 原示例為 `WHERE status = 'ACTIVE'`。 | DEC-047／DEC-057 統一為 `WHERE status <> 'VOIDED'`，使 `SHIPPED`、`RECEIVABLE_CREATED` 仍占用唯一名額。 |
| 修訂時點 | 原規劃同時出現 start revision 即作廢與失敗時保留舊單。 | DEC-057 裁定 start revision 不作廢；新 revision 確認後，由單一 rebuild transaction 原子置換。 |
| 銷貨單日期與號碼 | 舊草案使用 `delivery_no`、年度 scope，取號日期未定。 | DEC-057 裁定 `delivery_note_number`、`delivery_note_date`、`DELIVERY_NOTE` 與 `DN-{code}-{YYYYMM}-{sequence6}` 月 scope。 |
| ADMIN 直接作廢 | 來源 order 後續狀態未定。 | DEC-057 裁定只可作廢 `ACTIVE`，並在同一 transaction 將 order `DELIVERY_CREATED -> CONFIRMED`，不自動重建。 |

## 4. DeliveryNote 狀態模型

### 4.1 Enum

```text
ACTIVE
SHIPPED
RECEIVABLE_CREATED
VOIDED
```

P3.2 只允許實際進入 `ACTIVE` 與 `VOIDED`。`SHIPPED`、`RECEIVABLE_CREATED` 先保留 enum，分別由 P3.4 實際出貨日與後續應收模組進入。

### 4.2 狀態矩陣

| From | To | P3.2 觸發 | 權限 | 理由 | Transaction／audit |
| --- | --- | --- | --- | --- | --- |
| 不存在 | `ACTIVE` | 由已確認訂單建立 | `delivery_notes.manage` | 不需 | sequence、header、lines、order→`DELIVERY_CREATED`、audit、idempotency 同一 transaction |
| `ACTIVE` | `VOIDED` | 訂單修訂重建 | 外層 `sales_orders.manage`；內部連動不需 admin void | `ORDER_REVISION_REBUILD`＋來源 order revision | 與新 `ACTIVE` 單、order 狀態及 audit 同一 transaction |
| `ACTIVE` | `VOIDED` | 訂單作廢 | 外層 `sales_orders.manage` | 沿用訂單作廢理由＋系統來源 | 與 order→`VOIDED`、audit 同一 transaction |
| `ACTIVE` | `VOIDED` | ADMIN 例外直接作廢 | `delivery_notes.admin_void` | 必填；`ADMIN_DIRECT` | 與 order→`CONFIRMED`、audit、idempotency 同一 transaction |
| `ACTIVE` | `SHIPPED` | 填入實際出貨日 | 後續決議 | 後續決議 | P3.4 |
| `SHIPPED` | `RECEIVABLE_CREATED` | 建立應收 | ADMIN／後續權限 | 不需 | P4 |

`VOIDED` 與 `RECEIVABLE_CREATED` 均為不可由 P3.2 回復的終止狀態。非法轉換統一回傳 `DELIVERY_NOTE_STATUS_TRANSITION_INVALID`。`ACTIVE` 是目前有效銷貨單的起始狀態，但 DB 的「有效」定義必須涵蓋所有 `status <> 'VOIDED'`。

### 4.3 作廢來源

建議新增 `DeliveryNoteVoidSource`：

```text
ORDER_REVISION_REBUILD
ORDER_VOID
ADMIN_DIRECT
```

`void_source`、`void_reason`、`voided_at`、`voided_by` 在 `VOIDED` 時全部必填，其他狀態全部為 `NULL`。這能直接區分自動與 ADMIN 作廢，不必只依 audit 文字推測。

## 5. Order／DeliveryNote 狀態連動

| Order status | Delivery note | P3.2 可執行操作 | 結果 |
| --- | --- | --- | --- |
| `DRAFT` | 無 | 編輯、確認、作廢 | 不可建立銷貨單 |
| `CONFIRMED` | 無 | 建立銷貨單、開始修訂、作廢 | 建立成功後 order→`DELIVERY_CREATED` |
| `DELIVERY_CREATED` | 一張非作廢單 | 查看、開始修訂、作廢；ADMIN 可例外作廢 | 修訂／作廢須連動處理銷貨單 |
| `DRAFT` revision | 上一版 `ACTIVE` 單暫留 | 編輯、重新確認 | 不得修改舊 snapshot、不得建立第二張非作廢單 |
| `CONFIRMED` revision | 上一版 `ACTIVE` 單暫留 | 明確執行 rebuild | 一般 create 禁止；成功後新 `ACTIVE`、舊 `VOIDED`、order=`DELIVERY_CREATED` |
| `DELIVERY_CREATED` | 新 `ACTIVE`＋舊 `VOIDED` 歷史 | 查看、再修訂 | 每次重建新號碼、舊號不回收 |
| `SHIPPED` | `SHIPPED` | P3.2 不提供修訂或一般作廢 | 已出貨追加依 `DEC-013` 建新訂單 |
| `COMPLETED` | `RECEIVABLE_CREATED` | 鎖定 | P3.2 不實作 |
| `VOIDED` | 無或全為 `VOIDED` | 唯讀 | 不可恢復 |

建議把 P3.1 state machine 擴充為單一正式 order transition module，不在 route 或 UI 分散判斷。P3.2 至少需新增：

- `CONFIRMED -> DELIVERY_CREATED`
- `DELIVERY_CREATED -> DRAFT`（start revision，舊單維持 `ACTIVE`）
- `DELIVERY_CREATED -> VOIDED`
- `DRAFT -> DELIVERY_CREATED` 不允許；重新確認與重建須經正式 command。

## 6. 建議資料模型

### 6.1 `delivery_notes`

| 欄位 | 型別／限制 | 說明 |
| --- | --- | --- |
| `id` | UUID PK、DB-generated | 正式主鍵 |
| `company_id` | UUID NOT NULL | 公司隔離；不得信任 client |
| `fiscal_year` | integer NOT NULL | 取號年月 |
| `fiscal_month` | integer NOT NULL | 取號年月 |
| `delivery_note_number` | varchar(32) NOT NULL | `DN-{code}-{YYYYMM}-{sequence6}` |
| `delivery_note_date` | date NOT NULL | Server 以 `Asia/Taipei` business date 產生；取號及公司縮寫有效日期 |
| `sales_order_id` | UUID NOT NULL | 直接來源訂單 |
| `sales_order_revision_no` | integer NOT NULL | 建立時來源 revision |
| `status` | `DeliveryNoteStatus` NOT NULL | 建立為 `ACTIVE` |
| `company_snapshot` | JSONB NOT NULL | 直接複製已確認 order snapshot |
| `customer_snapshot` | JSONB NOT NULL | 同上 |
| `customer_company_snapshot` | JSONB NOT NULL | 同上 |
| `contact_snapshot` | JSONB nullable | 同上 |
| `delivery_snapshot` | JSONB NOT NULL | 同上 |
| `freight_snapshot` | JSONB NOT NULL | 運費模式、規則來源與凍結資料 |
| `payment_terms_text` | text nullable | 複製訂單值 |
| `subtotal` | numeric(18,0) NOT NULL | 複製訂單 |
| `freight_amount` | numeric(18,0) NOT NULL | 複製訂單 |
| `total_amount` | numeric(18,0) NOT NULL | 複製訂單 |
| `replaced_delivery_note_id` | UUID nullable | 新單指向被取代舊單；單向 self-reference |
| `void_source` | enum nullable | 作廢時必填 |
| `void_reason` | text nullable | 作廢時必填 |
| `voided_at` | timestamptz(3) nullable | 作廢時必填 |
| `voided_by` | UUID nullable | 作廢 actor |
| `created_at`／`updated_at` | timestamptz(3) | 系統時間 |
| `created_by`／`updated_by` | UUID NOT NULL | actor |

不建議在 `sales_orders` 保存 `current_delivery_note_id`：它會與 partial unique 查詢形成雙重真相及 circular FK。正式來源應是 `delivery_notes` 中該 order 唯一的 `status <> 'VOIDED'` row。

不建議建立 `active` flag、`root_order_id`、`source_order_ids` JSON、`superseded_by_delivery_note_id`、`rebuild_generation`、獨立 `delivery_note_relations` 或 correlation metadata 欄位：

- `status` 已表達 active／voided。
- 追加關係應由 `sales_order_relations` 表達，不複製成 JSON。
- `replaced_delivery_note_id` 加索引即可形成歷史鏈；雙向 FK 會增加同步風險。
- generation 可由 replacement chain／audit 推導。
- correlation ID 已保存於 audit，不需污染交易表。

`notes`、預計送貨日、客戶採購單號或外部參考號維持 OQ-051，延後至 P3.3／P3.4；不納入 P3.2 schema。

### 6.2 `delivery_note_lines`

| 欄位 | 型別／限制 | 說明 |
| --- | --- | --- |
| `id` | UUID PK、DB-generated | 主鍵 |
| `delivery_note_id` | UUID NOT NULL | 銷貨單 |
| `company_id` | UUID NOT NULL | composite FK 保證公司一致 |
| `line_number` | integer NOT NULL、> 0 | 原訂單明細順序 |
| `sales_order_line_id` | UUID NOT NULL | P3.2 只能由有效 order line 複製，因此不應 nullable |
| `item_id` | UUID NOT NULL | 追溯來源；列印／金額不得即時讀主檔 |
| `item_snapshot` | JSONB NOT NULL、非空 | 複製 order line |
| `price_snapshot` | JSONB NOT NULL、非空 | 含標準／人工來源 |
| `quantity` | numeric(18,4) NOT NULL、> 0 | 複製 order line |
| `unit_price` | numeric(18,5) NOT NULL、>= 0 | 複製 order line |
| `line_amount` | numeric(18,0) NOT NULL、>= 0 | 複製 order line |
| `created_at` | timestamptz(3) | 建立時間 |
| `created_by` | UUID NOT NULL | actor |

銷貨單明細在 P3.2 不提供獨立修改或刪除。重建時建立全新 header 與全新 lines。

### 6.3 快照原則

- 銷貨單只能複製該 revision 已確認的 order typed snapshots、active lines 與凍結金額。
- 不重新查詢目前 customer、item、price list、freight rule 或 company setting。
- 不重新執行 line amount、subtotal、freight 或 total 的商業計算；service 只做來源完整性與總額一致性檢查。
- JSON 使用現有 typed snapshot builders 的固定 key 結構；寫入前經 schema parse，避免自由 JSON。
- Decimal 寫入對應 numeric 欄位，不序列化成 JS `number`；JSON 中如需金額，使用固定 decimal 字串。
- 日期使用 `YYYY-MM-DD`，timestamp 使用 UTC ISO-8601；所有 JSON key 排序／型別由既有 serializer contract test 固定。
- 不建議另存一份重複的完整 `order_snapshot` JSON：header／line typed snapshot 與 `sales_order_revision_no` 已能完整重建銷貨單內容。若 P3.3 版型需要額外欄位，應先列出欄位再增加，不保存不受 schema 管理的任意 order blob。
- `freight_snapshot` 應獨立保留，因後續列印及應收需要說明運費模式與來源，只有 `freight_amount` 不足以追溯。

## 7. Database constraints

### 7.1 Prisma 可表達

- UUID PK、timestamptz(3)、decimal precision。
- 一般 unique：`(company_id, fiscal_year, fiscal_month, delivery_note_number)`、`(delivery_note_id, line_number)`。
- supporting unique：`(id, company_id)`、`(id, sales_order_id, company_id)`、`(id, company_id)` on lines。
- 單欄及一般 composite index。
- RESTRICT／NO ACTION FK 與 self-reference FK。

### 7.2 必須 custom SQL

- partial unique：

  ```sql
  UNIQUE (sales_order_id) WHERE status <> 'VOIDED'
  ```

- composite FK：
  - `(sales_order_id, company_id) -> sales_orders(id, company_id)`
  - `(delivery_note_id, company_id) -> delivery_notes(id, company_id)`
  - `(sales_order_line_id, company_id) -> sales_order_lines(id, company_id)`，0010 增加 supporting unique
  - `(item_id, company_id) -> item_companies(item_id, company_id)`
  - `replaced_delivery_note_id` 應搭配 company／sales order 一致性；建議 composite self-FK
- 複雜 CHECK：
  - fiscal year／month 與正式取號基準日期一致。
  - number regex。
  - revision、line number、quantity 與金額值域。
  - snapshot JSON 為 object 且非空。
  - `subtotal + freight_amount = total_amount`。
  - `VOIDED` actor／time／reason／source 完整；非 `VOIDED` 全為 NULL。
  - replacement 欄位成組出現、不可 self-reference。
  - `delivery_note_date` 與 `fiscal_year`／`fiscal_month` 一致。

### 7.3 Application transaction／integration test 保證

- 只從 `CONFIRMED` order 建立。
- 所有 delivery lines 與來源 order revision 完全一致。
- 來源 order 不存在 inactive line 漏入或重複 line。
- 重建前後 lock 順序、狀態轉換與 audit。
- addition relation 無循環；一般 CHECK 只能防 self-loop。
- 非 partial shipment。
- 不信任 client 的 company、snapshot、number、amount 或 current delivery note。

建議查詢索引：

- `(company_id, status, created_at DESC)`
- `(company_id, delivery_note_number)`
- `(sales_order_id, status)`
- `(company_id, customer identifier from typed column if later required)`；P3.2 不為 JSON 模糊搜尋提前建立 expression index。
- lines：`(delivery_note_id, line_number)`、`(sales_order_line_id)`、`(company_id, item_id, delivery_note_id)`。

## 8. 銷貨單編號規劃

正式格式：

```text
DN-{document_company_code}-{YYYYMM}-{sequence6}
```

Document type 為 `DELIVERY_NOTE`。`delivery_note_date` 由 server 以 `Asia/Taipei` business date 產生並保存為 PostgreSQL `date`；初次建立使用建立當日，重建使用重建當日。`YYYYMM` 與 `document_company_code` 有效版本均依此日期，不得使用 `order_date`、`actual_delivery_date`、client today 或 UTC 日期切割。使用既有 `document_sequences`，以公司、日期年月、document type 分流，採與訂單相同的 atomic upsert，不使用 `MAX + 1`。

取號必須在建立／重建 transaction 內、通過所有前置驗證與 row lock 後才執行。transaction rollback 時 sequence row 的增量一併 rollback；成功作廢後號碼永久不回收。Idempotency claim 必須先於 handler，replay 直接回傳原 delivery note id，不再進入取號。新舊號碼由 `replaced_delivery_note_id` 與 audit metadata 互相追蹤。

P3.2 不開放一般使用者修改 `delivery_note_date`；未來補登或改單據日期須另建 ADMIN 受控流程。

## 9. 建立、作廢與重建 transaction

### 9.1 初次建立

1. 驗證 session、permission、company scope、idempotency key。
2. `SELECT ... FOR UPDATE` lock order。
3. 驗證 order=`CONFIRMED`、confirmed snapshots 完整、至少一筆 active line、無非 `VOIDED` delivery note。
4. 以 server 解析正式公司單據縮寫及取號日期。
5. 原子取號。
6. 複製 header／line snapshots 與金額。
7. 建立 delivery note／lines。
8. order→`DELIVERY_CREATED`。
9. 寫 delivery note 及 order audit。
10. 完成 idempotency record；任何錯誤全部 rollback。

### 9.2 重建

`作廢舊單＋建立新單` 必須是單一 server command 與單一 transaction，client 不可拆成兩個 API：

1. lock order。
2. 查詢並 lock server 判定的唯一非 `VOIDED` delivery note。
3. 驗證最新 order revision 已確認、舊單尚未出貨／無後續資料、revision 比舊單新。
4. 原子取新號。
5. 建立新 header／lines，`replaced_delivery_note_id=old.id`。
6. old→`VOIDED`，寫 `ORDER_REVISION_REBUILD` 來源、理由與 actor。
7. order→`DELIVERY_CREATED`。
8. 寫 audit 與完成 idempotency。

若任一步驟失敗，整筆 transaction rollback，舊單保持原 `ACTIVE`，新號及新單都不存在。

### 9.3 訂單作廢

lock order 與目前非 `VOIDED` delivery note；驗證尚未出貨及無下游資料；同一 transaction 將 delivery note 自動作廢、order 作廢並寫兩者 audit。內部 auto-void 不需要 `delivery_notes.admin_void`，但外層使用者必須具 `sales_orders.manage`。

### 9.4 ADMIN 直接作廢

驗證 `delivery_notes.admin_void` 與 company scope，lock `ACTIVE` delivery note 及 `DELIVERY_CREATED` order；理由 trim 後必填。同一 transaction 以 `ADMIN_DIRECT` 作廢銷貨單並將 order→`CONFIRMED`，寫 audit 及完成 idempotency。作廢後不自動重建；使用者可再次明確執行建立並取得新號。`SHIPPED`、`RECEIVABLE_CREATED`、`VOIDED` 一律拒絕。

### 9.5 Lock 順序

所有 workflow 固定：

```text
idempotency claim → sales_order FOR UPDATE
→ active delivery_note FOR UPDATE
→ document_sequence upsert
→ delivery_note/lines → sales_order → audit/idempotency completion
```

固定順序可降低 deadlock；DB partial unique 是最後一道競爭保護。

## 10. 追加訂單流程

依 `DEC-013`，已出貨後追加的正式基線是：

1. 原訂單與原銷貨單保持不變。
2. 建立一張有獨立 order number 的新追加訂單。
3. `sales_order_relations(source_order_id=root original order, related_order_id=追加訂單, relation_type=ADDITION)`。
4. 追加訂單依自身內容確認。
5. 由追加訂單建立自己的新銷貨單；不把原訂單數量再次複製。

這個模型天然避免原數量重複計入，也符合「一 order 一張有效 delivery note」。不應把銷貨單綁 root order，也不應用 `source_order_ids` JSON 彙整。

所有追加單直接指向 root original order，不允許 Original→Addition 1→Addition 2 chain。Service 建立時解析並固定 root，DB／service 阻擋 self、duplicate、cycle 與 addition-as-source；P3.2 不新增 `root_order_id`。追加訂單作廢只處理自己的有效銷貨單，原始訂單作廢不連動全部追加單。

## 11. 權限

建議三個獨立 permission：

| Permission | ADMIN | ORDER_ENTRY | 說明 |
| --- | --- | --- | --- |
| `delivery_notes.read` | 是 | 是 | 僅限授權公司 |
| `delivery_notes.manage` | 是 | 是 | 由 order 建立／重建；不可獨立編輯 snapshot |
| `delivery_notes.admin_void` | 是 | 否 | 例外直接作廢 |

不需要額外 `delivery_notes.rebuild`；重建屬 `manage` 且只能由 server order workflow 呼叫。自動作廢是 outer workflow 的內部步驟，不檢查 admin void。API 永遠後端 enforce，UI 再依 permission 隱藏／停用按鈕；不可只靠 UI。

## 12. Audit 與 idempotency

### 12.1 建議 audit events

保留清楚且不重複的事件：

- `delivery_note.created`
- `delivery_note.voided`：metadata 以 `voidSource` 區分 `ORDER_REVISION_REBUILD`、`ORDER_VOID`、`ADMIN_DIRECT`
- `delivery_note.rebuilt`：寫在新單，metadata 含 old/new id、number、order revision
- `sales_order.delivery_created`
- `sales_order.delivery_rebuilt`

不另外建立 `auto_voided_for_*`、`admin_voided` 多組 operation；來源已由 typed `void_source` 及 metadata 表達。Audit before／after 需避免保存 token、credential 或不必要的完整重複 blob。

Audit metadata 必須包含 order id／number、revision、old/new delivery note id／number、void source、actor、correlation ID，以及適用時的 reason。

### 12.2 Idempotency operations

- `delivery_note.create`
- `delivery_note.rebuild`
- `delivery_note.admin_void`
- `sales_order.void_with_delivery_note`

Revision start 沒有 delivery-note mutation，沿用既有 sales-order revision idempotency。

相同 company＋operation＋key 與相同 canonical payload replay 原 result reference；不同 payload 回 `IDEMPOTENCY_KEY_CONFLICT`。失敗 transaction rollback，既有基礎會把 claim 標為 `FAILED`；相同 key 可依正式 retry 規則重新 claim。P3.2 保持同步 transaction，不使用 background job。

## 13. Service plan

| Service | 前置條件／權限 | Transaction 與 lock | 成功 | 主要失敗 |
| --- | --- | --- | --- | --- |
| `createDeliveryNoteFromOrder` | order=`CONFIRMED`；`manage`＋scope | lock order；確認無非作廢單；sequence、create、order、audit、idempotency 同 tx | 新 `ACTIVE`、order=`DELIVERY_CREATED` | not found、status invalid、already exists、snapshot invalid |
| `rebuildDeliveryNoteForOrder` | 新 revision 已確認；舊單未出貨／無下游；`manage`＋scope | lock order＋active note；void old、create new、order、audit 同 tx | 新號新 `ACTIVE`，舊 `VOIDED` | revision mismatch、no active note、downstream locked、constraint conflict |
| `voidDeliveryNoteForOrderVoid`（內部） | 外層 `sales_orders.manage` | 接受 caller tx 與已鎖 order；以 `ORDER_VOID` 作廢 active note | note 與 order 原子 `VOIDED` | downstream locked |
| `adminVoidDeliveryNote` | `admin_void`＋scope＋理由 | lock `DELIVERY_CREATED` order＋`ACTIVE` note；void、order→`CONFIRMED`、audit、idempotency 同 tx | note `VOIDED`、order `CONFIRMED` | status invalid、scope denied |
| `getDeliveryNote` | `read`＋scope | 唯讀、company filter | header＋lines＋replacement history | not found／scope denied |
| `listDeliveryNotes` | `read`＋scope | 唯讀、分頁 | scoped list | scope denied |
| `getCurrentDeliveryNoteForOrder` | `read`＋scope | server 查 `status <> VOIDED` | 0 或 1 筆 | DB 異常多筆視為 integrity error |

其他內部 helper 為 `buildDeliveryNoteSnapshotsFromConfirmedOrder` 與 `allocateDeliveryNoteNumber`。Revision start 不作廢 delivery note，因此不保留 `autoVoidDeliveryNoteForOrderRevision`。`rebuildDeliveryNoteForOrder` 是唯一公開重建 command。

## 14. API plan

依現有 route 慣例建議：

- `POST /api/sales-orders/{id}/delivery-note`：初次建立。
- `POST /api/sales-orders/{id}/delivery-note/rebuild`：原子重建。
- `GET /api/delivery-notes`：公司 scoped 搜尋、分頁、status 篩選。
- `GET /api/delivery-notes/{id}`：明細及歷史。
- `POST /api/delivery-notes/{id}/void`：ADMIN 例外作廢。

所有 POST 必須有 `Idempotency-Key`、correlation ID、一致 error envelope。`companyId` 只能與 server selected company context 比對，不作為授權依據。不得提供 PATCH snapshot、DELETE、partial shipment、print 或 receivable route。

## 15. UI plan

- 訂單明細：
  - `CONFIRMED` 且無非作廢單時顯示「建立銷貨單」；建立一律由使用者明確觸發。
  - `DELIVERY_CREATED` 顯示目前有效單連結與歷史作廢單。
  - 開始修訂前清楚提示舊單處理方式。
  - Revision 重新確認後顯示「重建銷貨單」，由使用者明確觸發單一 rebuild command。
- 銷貨單清單：目前公司、搜尋、分頁、`ACTIVE`／`VOIDED` 篩選。
- 銷貨單明細：唯讀快照、來源訂單／revision、金額、replacement history、audit 摘要。
- ADMIN 才顯示例外作廢與必填理由 modal。
- ORDER_ENTRY 看不到直接作廢操作。
- P3.2 不出現列印、PDF、實際送貨日、回收確認、應收、庫存、出貨數量或拆單 UI。

## 16. Migration 0010 plan

正式名稱：`0010_p3_delivery_notes`。P3.2a 已建立、完成 fresh DB 驗證並受控部署本機 `erp`。

預期內容：

1. 新增 `delivery_note_status` 與 `delivery_note_void_source` enum。
2. 新增 `delivery_notes`、`delivery_note_lines`。
3. Prisma 一般 relation、unique、index 與 RESTRICT FK。
4. Custom SQL partial unique、composite FK、supporting unique、複雜 CHECK。
5. Custom SQL constraint trigger／function 強制 `sales_order_relations.ADDITION` 同公司、source 為 root、不得 cycle 或 addition-as-source；保留既有 self CHECK 與 duplicate unique。
6. `delivery_note_date`／fiscal period、號碼 regex、void lifecycle、replacement、snapshot 與金額 CHECK。
7. Migration-health 精確 chain 已加入 `0010_p3_delivery_notes`；P3.2 權限程式未開始。
8. 不修改 `0001`～`0009`。

驗證流程：

1. `prisma migrate dev --create-only` 或既有等價 create-only。
2. 人工審查 SQL、constraint 名稱、RESTRICT FK 與禁止表。
3. 兩個 fresh disposable DB 依序套用 `0001`～`0010`。
4. catalog 驗證 enum、table、FK、CHECK、partial unique、index、precision。
5. `prisma validate`、generate、migrate status、schema diff=0。
6. 完整 unit／DB／workflow／build／ready／worker health。
7. 任一 gate 失敗即停止，不部署既有 `erp`；只使用新的 forward-fix migration，不回改已定稿 migration。

## 17. Test matrix

| # | 驗證 | 類型 |
| --- | --- | --- |
| 1 | `CONFIRMED` 可建立；`DRAFT`／`VOIDED` 不可建立 | unit＋DB workflow |
| 2 | 建立後 `ACTIVE` 且 order=`DELIVERY_CREATED` | DB workflow |
| 3 | 同一 order 並行建立仍最多一張非作廢單 | DB concurrency |
| 4 | 相同 idempotency replay 不重複取號；不同 payload conflict | DB workflow |
| 5 | `delivery_note_date` 使用 Asia/Taipei business date，禁止 UTC／client／order／actual-delivery date 取號 | unit＋DB |
| 6 | 公司、日期年月、`DELIVERY_NOTE` sequence 隔離 | DB＋smoke |
| 7 | 作廢號碼不回收；重建取得新日期／新號 | DB workflow |
| 8 | header／lines 完整複製已確認 order snapshot | DB workflow |
| 9 | 建單前後修改主檔、價格表、運費規則不改變銷貨單 | DB workflow |
| 10 | 銷貨單建立不重新查價、不重算運費 | unit＋DB |
| 11 | revision start 舊單保持 `ACTIVE`；編輯／re-confirm 期間不可建立第二張 | DB workflow |
| 12 | revision 重建：舊 `VOIDED`、新 `ACTIVE`、revision 與 replacement 正確 | DB workflow |
| 13 | 重建 rollback 後舊單仍 `ACTIVE`、order=`CONFIRMED`，無新單／新號／部分 audit | DB workflow |
| 14 | 訂單作廢原子連動 `ORDER_VOID` | DB workflow |
| 15 | ADMIN direct void 理由必填、order 回 `CONFIRMED`、不自動重建；ORDER_ENTRY 禁止 | unit＋API＋DB |
| 16 | 無 company scope／偽造 companyId 拒絕 | API＋DB security |
| 17 | 三種 void source 與 audit 可區分 | DB workflow |
| 18 | 不存在 hard delete route／UI 或 cascade FK | static＋catalog |
| 19 | 不可部分出貨、不可由 client 傳 lines／snapshot／日期建單 | validation＋API |
| 20 | addition 全部直連 root，不 self／duplicate／cycle／addition-as-source，且不重複原數量 | unit＋DB workflow |
| 21 | 只建立 P3.2 表，不建立 PDF／AR／inventory 物件 | catalog |
| 22 | `0001`～`0010` fresh deploy、status、catalog、diff=0 | fresh DB |
| 23 | migration-health／ready／worker 接受精確 0010 chain | unit＋health |
| 24 | lint、typecheck、完整 unit、DB suite、production build | quality gate |
| 25 | INDUSTRIAL／BIOTECH 建立、重建、隔離與編號 smoke | smoke |

不得以 skip、only、放寬 assertion 或預先建立固定測試資料規避失敗。DB suite 延續「每次使用全新 disposable DB」生命週期。

## 18. 決議與延後事項

### 18.1 OQ-046～OQ-050 resolution

1. OQ-046：使用者在 `CONFIRMED` order 上明確建立，不隨確認自動建立。
2. OQ-047：Revision start 保留舊 `ACTIVE`；re-confirm 後由使用者明確執行原子 rebuild。
3. OQ-048：維持 DEC-013；所有追加單直連 root、各自出單、不 aggregate。
4. OQ-049：ADMIN direct void 只適用 `ACTIVE`，同一 transaction 將 order 回 `CONFIRMED`，不自動重建。
5. OQ-050：`DN-{code}-{YYYYMM}-{sequence6}`、`DELIVERY_NOTE`、年月及公司縮寫依 server `Asia/Taipei` `delivery_note_date`。

### 18.2 已納入 DEC-057 的資料模型原則

1. 不在 order 保存 `current_delivery_note_id`。
2. 使用 `replaced_delivery_note_id` 單向 self-reference，不建 relations table。
3. 不存重複完整 `order_snapshot`；保存 typed header／line snapshots、source order id／revision。
4. 獨立保存 `freight_snapshot`。
5. `sales_order_line_id` 在 P3.2 為 NOT NULL。
6. 不建 root／source IDs JSON、active flag、generation 或 correlation 欄位。

### 18.3 可延後至 P3.3／P3.4

- `actual_delivery_date`、`first_printed_at`、`print_count`、版型版本與 PDF metadata。
- `returned_confirmed_at`／`returned_confirmed_by` 與撤銷／更正流程。
- `SHIPPED`、`RECEIVABLE_CREATED` 的實際 transition service。
- 是否需要銷貨單備註、預計送貨日、客戶採購單號或外部參考號；若 P3.3 版面需要，須在該 slice 前確認。

## 19. 風險

- Re-confirmed order 與上一版 `ACTIVE` delivery note revision 不一致是正式受控暫時狀態；查詢與 UI 必須明確顯示，且只能用 rebuild 消除。
- 追加 service 若未先解析 root，可能誤形成 chain 或循環；必須在 transaction 內驗證。
- 只對 `ACTIVE` 建 partial unique 會在未來進入 `SHIPPED` 後允許第二張有效單。
- 雙向 current／replacement FK 會形成雙重真相與 migration 複雜度。
- 重新讀主檔或重算價格／運費會破壞已確認快照及歷史重印。
- 取號、作廢、新建、order 狀態與 audit 若跨 transaction，可能產生永久缺單或重複號碼。
- 預先加入 P3.3／P3.4 欄位時若同時加入過早 CHECK，可能在未決流程上形成不可逆限制。

## 20. 建議分段實作順序

P3.2 實作取得另案授權後，建議拆成：

1. **P3.2a Schema／migration**：enum、兩表、constraints、catalog tests、fresh DB。
2. **P3.2b 建立與查詢**：number、snapshot copy、create/get/list、order `DELIVERY_CREATED`。
3. **P3.2c 修訂／作廢／重建**：原子 workflow、replacement history、admin void。
4. **P3.2d API／UI**：order linkage、delivery list/detail、permission-gated actions。
5. **P3.2e 整合驗收**：concurrency、rollback、idempotency、company isolation、fresh chain、health、smoke、validation 文件。

## 21. P3.2b 工程狀態

**P3.2b 核心建立與查詢 service 已完成工程驗證。**

已完成 `createDeliveryNoteFromOrder`、`getDeliveryNote`、`listDeliveryNotes`、`getCurrentDeliveryNoteForOrder`、RBAC／company scope、row lock、Asia/Taipei 取號、confirmed snapshot copy、Decimal invariant、audit、idempotency、order `DELIVERY_CREATED` 與 order void 的 `ORDER_VOID` 內部 helper。`erp_p3_2b_test_run_20260727_03` 完成 0001～0010、diff 0、單獨 9 項及完整 114 項 DB tests；unit、lint、typecheck、build 與 health 均通過。

P3.2c 的 revision rebuild、replacement 與 ADMIN direct void，以及 P3.2d API／UI，仍須另案授權。

## 22. 變更紀錄

- V0.10（2026-07-27，P3.2b 工程同步）：完成初次建立與三個 query service、row lock、RBAC、月流水、snapshot、Decimal、audit、idempotency、ORDER_VOID 內部整合及 atomic rollback；API／UI／rebuild／ADMIN direct void 未開始。
- V0.10（2026-07-27，P3.2a 工程同步）：完成 Prisma schema、`0010_p3_delivery_notes`、partial unique、composite FK、CHECK、replacement／ADDITION trigger、兩個 fresh DB、本機部署、health 與測試驗證；service／API／UI 未開始。
- V0.10（2026-07-27）：同步 DEC-057 與 OQ-046～OQ-050 resolution，將 P3.2 狀態改為規格決議完成、實作未開始，並統一狀態、日期取號、revision rebuild、追加、ADMIN direct void、schema、service、audit、idempotency、migration 與 test plan。
