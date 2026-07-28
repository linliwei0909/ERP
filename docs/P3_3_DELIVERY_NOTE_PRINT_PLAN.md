# P3.3 銷貨單正式列印與出貨計畫

文件狀態：P3.3a 規格閉合、P3.3b storage、P3.3b2 version contract 與 P3.3c domain／transaction 已完成；P3.3d 以後尚未授權
同步基線：`DECISIONS.md` V0.12／DEC-058
版本日期：2026-07-28

## 1. 背景與目標

P3.2 已完成由已確認訂單建立唯一有效銷貨單、revision rebuild、replacement、ADMIN direct void、API、UI 與整合驗收。P3.3 接續處理正式銷貨單 PDF 與出貨狀態，但不重新設計或修改 P3.2 的快照、金額、取號、唯一有效限制或 replacement 規則。

P3.3 的業務目標：

1. 把首次「正式列印」定義為明確且原子的出貨動作。
2. 建立不可變、可重印且不受後續主檔、版型、renderer 或字型變動影響的正式 PDF。
3. 在同一 transaction 建立實際出貨日、PDF、列印歷程、audit，並同步更新訂單與銷貨單狀態。
4. 明確區分預覽、首次正式列印、重印與 read-only 下載，避免 GET route 產生隱藏副作用。
5. 固定 P3.3 與 P3.4 邊界，讓 P3.4 專注人工回收確認與後續應收銜接。

P3.3a 只完成規格、設計與候選契約；沒有建立 schema、migration、dependency、renderer、API、UI 或測試。

## 2. P3.2 基準

P3.3 必須沿用下列已結案基準：

- `sales_orders` 狀態 enum 已有 `DELIVERY_CREATED`、`SHIPPED`。
- `delivery_notes` 狀態 enum 已有 `ACTIVE`、`SHIPPED`、`RECEIVABLE_CREATED`、`VOIDED`。
- `delivery_notes` 保存公司、客戶、客戶公司、nullable 聯絡人、送貨地點、運費、付款條件快照及凍結金額。
- 現行 frozen snapshot contract 為 `delivery-note-snapshot-v1`，由 `delivery_notes.snapshot_version` 獨立保存；既有 JSON 不因補版本而改寫。
- `delivery_note_lines` 保存品項、價格快照、數量、單價及明細金額。
- 銷貨單只由訂單建立；同一訂單最多一張 `status <> 'VOIDED'` 銷貨單。
- replacement 以新單的 `replaced_delivery_note_id` 指向同公司、同訂單舊單。
- 已完成 session context、後端 RBAC、selected-company scope、audit、idempotency、correlation ID、strict DTO、typed error 與 client duplicate-submit control。
- P3.2 不包含 `actual_delivery_date`、首次列印摘要、列印版本、事件、PDF metadata 或 PDF bytes。

P3.3 不得：

- 重新讀取目前 customer、item、price、freight master 形成正式 PDF。
- 修改銷貨單 frozen snapshots 或凍結金額。
- 改變 P3.2 create／rebuild／void transaction。
- 合併 replacement PDF 或沿用舊單列印資料。

## 3. 業務名詞定義

### 3.1 預覽

無副作用的暫時畫面或 PDF：

- 不設定 `actual_delivery_date`。
- 不更新訂單或銷貨單狀態。
- 不建立正式版本。
- 不建立正式列印／重印事件。
- 不增加重印計數。
- 不可對外宣稱為正式銷貨單版本。

第一版不提供預覽。

### 3.2 首次正式列印

使用者明確執行的出貨 command：

- 輸入是指定 `ACTIVE` 銷貨單，不接受 client snapshot、日期、狀態、版型或金額。
- Server 以 `Asia/Taipei` 當地日期設定 `actual_delivery_date`。
- 建立該銷貨單唯一正式 PDF。
- 銷貨單 `ACTIVE -> SHIPPED`。
- 訂單 `DELIVERY_CREATED -> SHIPPED`。
- 建立首次正式列印摘要、event、audit 及 idempotency completion。

### 3.3 重印

具 `delivery_notes.manage` 權限的使用者明確執行：

- 回傳既有正式 PDF bytes。
- 不重新 render。
- 不建立新正式版本。
- 不修改實際出貨日、首次列印摘要、狀態或版型版本。
- 新增一筆 append-only `REPRINT` event。
- 原子增加 `reprint_count`。

### 3.4 查閱／下載正式 PDF

具 `delivery_notes.read` 權限的 read-only query：

- 只讀取既有正式 PDF。
- 不算重印。
- 不增加計數或 business audit。
- 仍受 session、selected company 與 company scope 控制。

### 3.5 重新產生正式版本

重新 render 並取代既有正式 PDF。第一階段禁止；不得提供 regenerate、replace 或 overwrite route。

## 4. 預覽／首次正式列印／重印區別

| 行為 | 第一版提供 | 改狀態 | 設定實際出貨日 | 建立正式版本 | 新增 event | 增加重印計數 |
| --- | --- | --- | --- | --- | --- | --- |
| 預覽 | 否 | 否 | 否 | 否 | 否 | 否 |
| 首次正式列印 | 是 | 是 | 是 | 是，唯一一次 | `FORMAL_PRINT` | 否 |
| 重印 | 是 | 否 | 否 | 否 | `REPRINT` | 是 |
| Read-only 下載 | 是 | 否 | 否 | 否 | 否 | 否 |
| 重新產生正式版本 | 否 | 不適用 | 不適用 | 禁止 | 否 | 否 |

不得以一般 GET PDF route 同時承擔預覽與首次正式列印。所有寫入都必須使用明確 POST command。

## 5. 狀態轉移

首次正式列印 transaction：

```text
sales_orders:   DELIVERY_CREATED -> SHIPPED
delivery_notes: ACTIVE           -> SHIPPED
```

同一 transaction 還必須完成：

1. 驗證 permission、company scope、idempotency。
2. Lock order。
3. Lock delivery note。
4. 驗證 order、delivery note、revision 與公司一致。
5. 以 `Asia/Taipei` 產生實際出貨日及 server timestamp。
6. 由 frozen snapshots 建立 print model。
7. 以固定 template version render PDF。
8. 計算 SHA-256、byte size、MIME type 與 filename。
9. 建立 immutable print version。
10. 更新 delivery note 首次列印摘要及狀態。
11. 更新 order 狀態。
12. 建立 `FORMAL_PRINT` event。
13. 寫 delivery note、order 與 print audit。
14. 完成 idempotency record。

任一步驟失敗全部 rollback。不得留下：

- `SHIPPED` 但沒有正式 PDF。
- 有正式 PDF但 order 或 delivery note 未出貨。
- 有首次列印時間但沒有 event。
- 重複正式版本或重複首次 event。

現有 application state machine 尚未實作 `DELIVERY_CREATED -> SHIPPED`；P3.3b／P3.3c 必須補上並測試，P3.3a 不修改程式。

## 6. P3.3／P3.4 責任切分

### P3.3

- 首次正式列印。
- 自動建立實際出貨日。
- 訂單與銷貨單轉為 `SHIPPED`。
- 唯一不可變正式 PDF。
- Read-only 正式 PDF 下載。
- 重印 event 與計數。
- 列印歷程。
- Template version 與 PDF metadata。
- 首次列印與重印的 audit、冪等、併發及 company isolation。

### P3.4

- 人工確認「銷貨單已回收」。
- `returned_confirmed`、確認時間及操作者。
- 回收確認撤銷／更正規則。
- 回收後來源鎖定。
- 已存在 `actual_delivery_date` 的受控更正；第一階段不要求理由，但保存前後值、操作者、時間及 audit。
- 與建立應收條件及後續流程的整合驗收。

P3.4 不得提供未經首次正式列印而直接建立實際出貨日或將單據轉為 `SHIPPED` 的替代入口。

## 7. 列印資格矩陣

| 銷貨單狀態 | 首次正式列印 | 重印 command | Read-only 下載既有 PDF | 新正式版本 |
| --- | --- | --- | --- | --- |
| `ACTIVE` | 可，且 order 必須為 `DELIVERY_CREATED`、尚無正式版本 | 不可 | 不可 | 只可建立第一次 |
| `SHIPPED` | 不可；併發收斂只回傳既有結果 | 可 | 可 | 不可 |
| `RECEIVABLE_CREATED` | 不可 | 可 | 可 | 不可 |
| `VOIDED` | 不可 | 不可 | 歷史已有 PDF 時可，須顯示作廢提示 | 不可 |

若 `SHIPPED`／`RECEIVABLE_CREATED` 沒有完整正式版本或首次列印摘要，視為 invariant violation，不得自動補建。

## 8. 權限矩陣

| 操作 | `delivery_notes.read` | `delivery_notes.manage` | `delivery_notes.admin_void` |
| --- | --- | --- | --- |
| 查看列印摘要／歷程 | 是 | 隨角色既有 read 權限 | 無額外作用 |
| Read-only 下載既有正式 PDF | 是 | 隨角色既有 read 權限 | 無額外作用 |
| 首次正式列印 | 否 | 是 | 無額外作用 |
| 重印 | 否 | 是 | 無額外作用 |
| 作廢 `ACTIVE` | 否 | 否 | 沿用 P3.2 ADMIN direct void |

決議：

- 不新增 `delivery_notes.print`。
- ADMIN 與 ORDER_ENTRY 沿用既有 read/manage 矩陣。
- 所有角色仍必須通過 selected company 及 company scope。
- ADMIN 不因角色名稱繞過公司隔離。

## 9. 不可變正式 PDF 保存策略

### 9.1 方案比較

| 方案 | 原子性 | 不可變性 | 重印一致性 | 營運複雜度 | 裁定 |
| --- | --- | --- | --- | --- | --- |
| DB 保存 PDF binary | 可與狀態、event、audit 同一 transaction | 強 | 直接回傳相同 bytes | DB 容量增加，但備份一致 | 第一版採用 |
| Filesystem／object storage，DB 保存 immutable reference | 跨資源 transaction 需 staging／publish／reconciliation | 可達成 | 直接讀相同 object | 孤兒檔、備份還原、權限與發布流程較複雜 | 未採；未來另案 |
| 只保存 print snapshot 並重新 render | DB metadata 原子 | Snapshot 可不變，但輸出受 renderer／字型影響 | 無法充分保證 byte-for-byte 一致 | 需封存完整 renderer 環境 | 禁止單獨採用 |

### 9.2 第一版裁定

- 正式 PDF bytes 保存於 PostgreSQL `bytea`。
- 每張銷貨單最多一個正式版本。
- 第一版 `document_version` 固定為 `1`，並以 `(delivery_note_id, document_version)` 唯一；不存在第二個正式版本號。
- Metadata 至少保存：
  - `document_version`
  - `renderer_version`
  - `template_version`
  - `font_version`
  - `snapshot_version`
  - `generated_at`
  - `generated_by`
  - SHA-256 `content_hash`
  - `mime_type`
  - `byte_size`
  - `filename`
  - `pdf_bytes`
- Print version 不得 update 或 delete。
- 單一正式 PDF 上限 20 MiB；超過時首次正式列印完整 rollback，不截斷 PDF。
- 重印及 read-only 下載直接回傳保存的 bytes。
- 後續主檔、公司設定、程式版型、renderer、dependency 或字型變動不得影響舊單。
- 四種版本語意保持獨立：renderer 是輸出 implementation contract、template 是版型、font 是固定字型資產 identity、snapshot 是實際輸入 frozen contract。首次建立 print version 時，`snapshot_version` 複製來源 Delivery Note 的值。

## 10. 版型版本策略

- 第一版候選識別碼：`delivery-note-v1`。
- Version 必須是不可變、可精確比對的字串；不得使用 `current`、`latest` 或資料庫外的模糊標籤。
- 建立正式版本時把 template version 寫入 print version。
- 版型更新使用新識別碼，只影響之後首次正式列印的銷貨單。
- 舊單永遠下載保存的 PDF，不重新載入舊 template render。
- 版型更新不修改交易資料，不要求交易 migration。
- 正式中文字型固定為 **Noto Sans CJK TC Regular**，來源限官方 Noto Fonts／Noto CJK 發布。
- P3.3c 必須固定明確 release 或 commit，保存 upstream version、原始檔名、SHA-256、SIL Open Font License 與 font manifest，以受控 server-only asset 載入並嵌入 PDF。
- 缺檔、checksum 不符或 glyph 不足時 fail fast；禁止 runtime download、CDN、system font fallback 或靜默替代。
  - 嵌入 PDF，避免 client 缺字。
  - 通過繁體中文、數字、標點與長字串視覺測試。
- P3.3a 不選定或安裝字型、PDF dependency 或 renderer。

## 11. Audit、冪等與併發

### 11.1 Audit

正式 operations：

- `delivery_note.formal_printed`
- `delivery_note.shipped`
- `sales_order.shipped`
- `delivery_note.reprinted`

首次正式列印 audit 至少保存：

- delivery note／order before、after 狀態。
- `actual_delivery_date`。
- print version id。
- template version。
- content hash、byte size、filename。
- actor、session、company、correlation ID。

重印 audit 至少保存：

- print version id。
- 重印前後計數。
- actor、session、company、correlation ID。

Read-only 下載不建立 business audit 或重印事件；HTTP access log 可另行記錄，但不得改變交易資料。

### 11.2 Idempotency

- 首次正式列印 operation：`delivery_note.formal_print`。
- 重印 operation：`delivery_note.reprint`。
- 兩者都要求有效 `Idempotency-Key`。
- 相同 key、相同 payload replay 原結果。
- 相同 key、不同 payload 回 `IDEMPOTENCY_CONFLICT`。

### 11.3 併發

- Lock 順序固定為 idempotency claim → order → delivery note。
- 不同 key 同時首次列印：
  - 第一個 lock winner 建立版本及轉換狀態。
  - 後續 request 取得 lock 後，如發現同一銷貨單已有完整正式版本及一致 `SHIPPED` 狀態，回傳既有版本。
  - 後續 request 不新增首次 event、不增加重印計數、不再次 audit 狀態轉換。
- 若資料只完成一部分，回 typed invariant error，不嘗試修補。
- 不得重複取正式版本號、重複首次列印時間或重複狀態轉換。

## 12. 公司隔離

- Client 不得提供可信 `companyId`。
- API 只使用 session selected company。
- Service 驗證 request context、delivery note、sales order、print version 與 event 的 company 一致。
- DB 使用 composite FK 或等效 constraint 保證 delivery note、version、event 同公司。
- PDF filename、metadata 或 bytes 不得透過可猜測 storage path 繞過 API；第一版 bytes 位於 DB。
- 跨公司 ID 一律回公司隔離後的 not found 或既有安全 error，不洩漏資料是否存在。

## 13. 作廢與 replacement 規則

### 作廢

- `VOIDED` 不得首次正式列印或重印。
- 若移轉資料或未來受控流程使 `VOIDED` 有正式 PDF，版本與 events 永久保留。
- `delivery_notes.read` 可 read-only 下載既有 PDF，UI 及 response metadata 顯示「已作廢」。
- 不修改原 PDF、不動態加浮水印。
- 第一版不產生作廢 audit copy。
- 現有 P3.2 規則禁止直接作廢 `SHIPPED`，P3.3 不改變此規則。

### Replacement

- 新舊銷貨單是兩個獨立正式文件。
- Replacement 不得沿用舊單：
  - print version
  - `actual_delivery_date`
  - `first_printed_at/by`
  - `reprint_count`
  - print events
- 舊單已有 PDF 時仍保留供 audit 查閱。
- 新單必須由自身 `ACTIVE` 狀態執行首次正式列印。

## 14. 第一版版型欄位

第一版只可使用目前 frozen snapshots、typed 金額及首次正式列印 transaction 產生的欄位。

### 公司

- 公司名稱。
- 公司統編。
- 公司地址。
- 公司電話。
- 單據公司碼。

### 文件

- 銷貨單號。
- 銷貨單日期。
- 銷售訂單號。
- 訂單 revision。
- 實際出貨日。
- 正式列印時間。
- 文件版本。
- Template version。

### 客戶與送貨

- 客戶名稱。
- 客戶統編，如 frozen snapshot 有值。
- 送貨地點名稱。
- 收件人。
- 送貨電話。
- 完整送貨地址。
- 聯絡人名稱及 frozen snapshot 中可靠存在的聯絡方式；contact nullable 時顯示 `—`。

### 明細與金額

- 項次。
- 品項代碼。
- 公司品號。
- 品項名稱。
- 規格。
- 單位。
- 數量。
- 單價。
- 明細金額。
- 小計。
- 運費。
- 稅額：固定文字「未分列」，不顯示或保存臆造數值。
- 總額。
- 付款條件。

### OQ-051 裁定排除

- 備註。
- 預計送貨日。
- 客戶採購單號。
- 外部參考號。

不得建立 placeholder schema。未來如需加入，另立決議及 migration。

## 15. 錯誤分類

候選 typed errors：

| Code | HTTP | 條件 |
| --- | --- | --- |
| `DELIVERY_NOTE_NOT_FOUND` | 404 | 公司 scope 內查無銷貨單 |
| `DELIVERY_NOTE_PRINT_FORBIDDEN` | 403 | 缺少 read/manage 權限 |
| `FORMAL_PRINT_NOT_ALLOWED` | 409 | 狀態不是 `ACTIVE` 或 order 不是 `DELIVERY_CREATED` |
| `FORMAL_PRINT_ALREADY_EXISTS` | 409 或收斂成功 | 非併發 command 嘗試再次首次列印；API 最終契約需固定回應 envelope |
| `FORMAL_PRINT_INVARIANT_VIOLATION` | 422 | 狀態、摘要、version 或 order 不一致 |
| `FORMAL_PRINT_RENDER_FAILED` | 422／500 | Renderer 無法產生有效 PDF；不得留下 mutation |
| `FORMAL_PRINT_STORAGE_FAILED` | 500 | PDF metadata／bytes 寫入失敗並 rollback |
| `FORMAL_PDF_NOT_FOUND` | 404／409 | 尚無正式版本 |
| `REPRINT_NOT_ALLOWED` | 409 | `ACTIVE`／`VOIDED` 或版本不存在 |
| `PRINT_CONTENT_HASH_MISMATCH` | 500 | 讀取 bytes 與保存 hash 不一致 |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | 寫入 command 缺 key |
| `IDEMPOTENCY_CONFLICT` | 409 | 同 key 不同 payload |
| `IDEMPOTENCY_IN_PROGRESS` | 409 | 同 key 仍在處理 |

不得在錯誤中暴露 SQL、Prisma、stack、filesystem path、PDF bytes 或其他公司資料。

## 16. 預計 schema 模型

本節只比較及推薦，不產出 Prisma schema、migration 或 SQL。

### 方案 A：`delivery_notes` 摘要欄位加 print events

內容：

- `delivery_notes` 保存實際出貨日、首次列印、正式 PDF metadata／bytes 或 reference、計數。
- Event table 保存列印歷程。

優點：

- 查詢直接。
- 單表 CHECK 較簡單。

缺點：

- 大型 PDF binary 與交易 header 混合。
- 正式版本 metadata 與 mutable 狀態耦合。
- 未來多文件類型或保存策略擴充較差。

不推薦。

### 方案 B：正式 print versions 為主

內容：

- `delivery_note_print_versions` 保存所有正式資料。
- `delivery_note_print_events` 保存事件。
- Delivery note 幾乎不保存摘要。

優點：

- 正式文件邊界清楚。
- 不可變性佳。

缺點：

- 清單與狀態資格需頻繁 join。
- `SHIPPED` 與首次列印完整性 constraint 較難。
- 實際出貨日是交易核心欄位，不宜只藏在 print version。

不推薦單獨採用。

### 方案 C：混合模式

內容：

- `delivery_notes` 保存：
  - `actual_delivery_date`
  - `first_printed_at`
  - `first_printed_by`
  - `formal_print_version_id`
  - `reprint_count`
- `delivery_note_print_versions` 保存唯一 immutable PDF、template/document version 及 metadata。
- `delivery_note_print_events` 保存 append-only `FORMAL_PRINT`／`REPRINT`。

優點：

- 清單與資格查詢便利。
- Transaction header 能用 CHECK 驗證狀態摘要。
- Print version 維持不可變且不污染交易快照。
- Event 提供完整 audit trail。
- 重印直接讀 bytes，效能穩定。
- 未來可在不改交易語意下擴充 storage backend 或 audit copy。

缺點：

- 摘要、version、event 三處需嚴格 transaction 與 composite FK。
- `reprint_count` 是 event projection，必須測試一致性。

推薦方案 C。

P3.3b 必須評估：

- `formal_print_version_id` 與 version 的同 delivery note／company composite FK。
- 每張 delivery note 一筆 version 的 unique。
- `ACTIVE` 與 `SHIPPED`／`RECEIVABLE_CREATED` 的欄位完整性 CHECK。
- Event append-only 保護。
- `reprint_count` 與 event 數量 reconciliation 測試。
- PDF byte size 必須符合已決 20 MiB 上限，並以 DB constraint 驗證 metadata 與 bytes 一致。

## 17. API 候選契約

候選 routes：

### 首次正式列印

```text
POST /api/delivery-notes/{id}/formal-print
Idempotency-Key: required
Body: {}
```

不得接受：

- `companyId`
- `actualDeliveryDate`
- `templateVersion`
- `status`
- snapshot
- amount
- actor

候選成功結果：

```json
{
  "printVersion": {
    "id": "uuid",
    "deliveryNoteId": "uuid",
    "templateVersion": "delivery-note-v1",
    "generatedAt": "ISO-8601",
    "contentHash": "sha256-hex",
    "mimeType": "application/pdf",
    "byteSize": 12345,
    "filename": "DN-XX-YYYYMM-000001.pdf"
  },
  "deliveryNoteStatus": "SHIPPED",
  "salesOrderStatus": "SHIPPED",
  "actualDeliveryDate": "YYYY-MM-DD",
  "replayed": false,
  "converged": false,
  "correlationId": "..."
}
```

PDF bytes 可由後續 read-only route 下載，避免 mutation response 與大型 binary envelope 混合。若 P3.3d 選擇直接回 binary，仍須以 headers 回傳 version、hash、replay 與 correlation metadata。

### Read-only 下載

```text
GET /api/delivery-notes/{id}/formal-pdf
```

- 需要 `delivery_notes.read`。
- 無副作用。
- `Content-Type: application/pdf`。
- `Content-Disposition` 使用保存 filename。
- 回傳 ETag 或等效 hash header。
- 回應 metadata 明示 delivery note status；`VOIDED` 必須明確提示。

### 重印

```text
POST /api/delivery-notes/{id}/reprint
Idempotency-Key: required
Body: {}
```

- 需要 `delivery_notes.manage`。
- 建立 event、增加計數、寫 audit。
- 回傳既有 version metadata及取得 PDF 的明確方式。

第一版不建立：

- `/preview`
- `/regenerate`
- `/replace-pdf`
- `/templates/current`

## 18. UI 候選流程

### `ACTIVE`

- 顯示「首次正式列印並出貨」按鈕。
- 顯示不可逆提示：將設定實際出貨日、訂單與銷貨單改為已出貨並建立不可變正式 PDF。
- 使用 pending state 及同步 busy guard。
- 成功後 refresh，顯示 `SHIPPED`、實際出貨日、首次列印人／時間及正式 PDF。

### `SHIPPED`／`RECEIVABLE_CREATED`

- 不顯示首次正式列印。
- Read 權限顯示「下載正式 PDF」。
- Manage 權限另顯示「重印」，明確說明會記錄重印事件。
- 顯示 template version、generated at/by、hash 短摘要及重印次數。

### `VOIDED`

- 不顯示首次正式列印或重印。
- 若已有歷史 PDF，顯示 read-only「查閱原正式 PDF」及醒目作廢提示。
- 不在瀏覽器動態覆蓋 PDF 或加浮水印。

第一版不提供預覽 UI。

## 19. 測試矩陣

### Unit

- `Asia/Taipei` 日期跨 UTC 日界。
- Frozen snapshot → print model mapping。
- Nullable contact。
- Decimal 字串、數量、單價及整數金額格式。
- 稅額固定顯示「未分列」且不推算。
- Template version 固定。
- Filename normalization。
- SHA-256、byte size、MIME metadata。
- 狀態資格與 typed errors。

### DB integration

- `ACTIVE`＋`DELIVERY_CREATED` 首次正式列印成功。
- PDF、version、event、摘要、兩張單據狀態、audit、idempotency 同時 commit。
- Renderer、version insert、delivery note update、order update、event、audit 任一注入失敗全部 rollback。
- 同 key replay。
- 同 key 不同 payload conflict。
- 不同 key 併發只建立一個 version／首次 event。
- 後續 request 收斂同一 version。
- 每張 delivery note unique version。
- Composite company FK。
- `SHIPPED` 完整性 constraints。
- Event append-only。
- 重印計數與 events 一致。
- `VOIDED` 禁止新增 version／reprint。
- Replacement 不沿用 version 或摘要。

### API/security

- 未登入 401。
- 缺 permission 403。
- 跨公司不可見。
- Strict empty DTO。
- Idempotency header。
- Correlation ID。
- Stable error envelope。
- PDF content headers、filename、ETag/hash。
- GET 無 mutation。

### PDF／視覺

- 合法可嵌入繁體中文字型。
- 公司資訊、客戶、地址、聯絡人。
- 長品名、長規格、長地址。
- 多明細跨頁及重複表頭。
- 數量、單價、金額對齊。
- 小計、運費、稅額未分列、總額。
- 實際出貨日、正式列印時間、文件及 template version。
- PDF bytes hash 在重印後完全相同。

### 完整 gate

- Fresh 0001～P3.3b migration。
- Schema diff 0。
- Catalog tests。
- Lint。
- Typecheck。
- Unit tests。
- DB tests single-worker。
- Production build。
- ADMIN／ORDER_ENTRY browser smoke。
- 公司切換、refresh consistency、duplicate-submit。

## 20. 明確排除

- 第一版預覽。
- 重新產生或覆寫正式 PDF。
- Filesystem／object storage。
- 作廢浮水印或 audit copy。
- Email／外部寄送。
- 正式電子簽收。
- 人工回收確認及撤銷／更正。
- 建立應收、正式發票或月結。
- 備註、預計送貨日、客戶採購單號、外部參考號。
- 數值稅額推算或 placeholder。
- 追加訂單建立 capability。
- 庫存、批號、出庫、庫存異動或分批出貨。
- P4 blueprint 的任何內容。

## 21. P3.3b～P3.3f 建議切片

### P3.3b Schema／migration

完成狀態（2026-07-28）：已完成 Prisma schema、`0011_p3_delivery_note_print_storage`、DB constraints、company-scope FK、append-only triggers、fresh／upgrade／preflight rollback、catalog／checksum／schema diff 與 regression 驗證。此完成狀態不代表 renderer、首次正式列印／重印 service、API 或 UI 可用。

- 混合模型 Prisma schema。
- Create-only migration。
- FK、CHECK、unique、append-only protection。
- Fresh DB、catalog、schema diff。
- 不安裝 renderer，不新增 API/UI。

### P3.3b2 Version contract supplement

- `DeliveryNote.snapshotVersion` required，現行唯一 domain constant 為 `delivery-note-snapshot-v1`。
- 0012 只回填 scalar discriminator，不重寫任何既有 frozen JSON，且最終無 database default。
- `DeliveryNotePrintVersion` 新增 required `rendererVersion`、`fontVersion`、`snapshotVersion`，與既有 template/document version 各自獨立。
- Migration 在新增 required print version 欄位前檢查既有 rows；非零即回報筆數並 fail fast，不猜測、不刪除。
- 0011 append-only triggers 自動保護新欄位；0012 不重建 trigger。
- 本切片只固定 Noto Sans CJK TC Regular 策略，不加入 font binary、PDF dependency、font resolver 或 renderer。

### P3.3c 正式列印 service／renderer

完成狀態（2026-07-28）：已完成嚴格 snapshot v1 validator、immutable print model、固定版本 deterministic `pdf-lib` renderer、官方 Noto Sans CJK TC Regular Sans2.004 資產／OFL／checksum／glyph fail-fast、正式列印與重印 transaction、row lock、既有 idempotency／audit、兩張單據 `SHIPPED` 同步、DB `bytea` 原子保存及 unit／DB integration 驗證。未建立 API、UI 或下載端點。

- 驗證 `delivery-note-snapshot-v1` 並建立 Print model。
- 固定 `delivery-note-pdf-renderer-v1` 等 domain renderer contract。
- 依 font manifest 載入、驗證並嵌入 Noto Sans CJK TC Regular。
- 從來源 Delivery Note 複製 `snapshotVersion` 至 immutable print version。
- DB binary。
- First formal print transaction。
- Reprint transaction。
- State machine、audit、idempotency、concurrency。
- Service／DB tests。

### P3.3d API／UI／下載

- Formal-print command。
- Read-only formal PDF download。
- Reprint command。
- Strict DTO、headers、typed errors、company scope。
- API contract tests。
- Detail actions、警告、列印摘要與歷程、busy guard 與 PDF 視覺 QA。

### P3.3e 整合驗收

- Fresh migration chain。
- 完整 unit／DB／API／UI tests。
- Lint、typecheck、build。
- ADMIN／ORDER_ENTRY production browser smoke。
- Concurrency、rollback、hash consistency、公司切換及 refresh。
- Validation 文件與 P3.3 工程結案。

## 22. P3.3c 完成與 P3.3d handoff

P3.3c 可依賴下列已完成條件：

- DEC-017 與 P3.3／P3.4 切分已一致。
- OQ-051 第一版已裁定排除。
- 預覽、首次正式列印、重印、read-only 下載及 regenerate 已明確定義。
- 狀態與權限矩陣已固定。
- DB immutable PDF 與混合資料模型已裁定。
- 作廢、replacement、版型、audit、冪等及併發已固定。
- 現有獨立稅額缺口已明確處理為「稅額：未分列」，不阻塞 P3.3b。
- `DeliveryNote.snapshotVersion` 與 `delivery-note-snapshot-v1` domain constant 已可持久化。
- Print Version 的 renderer、template、font、snapshot、document version 均有獨立欄位。
- 既有 snapshot JSON 未重寫；既有 print version row 由 fail-fast migration guard 保護。
- 正式字型已決為 Noto Sans CJK TC Regular。

P3.3c 已依使用者授權完成：

1. 建立 frozen snapshot validator、print model 與 deterministic renderer。
2. 固定 renderer version 與 font manifest identity。
3. 納入官方字型資產、SIL OFL、checksum、embedding 與 glyph fail-fast。
4. 完成 formal-print／reprint transaction、狀態、audit、idempotency、concurrency 與 DB tests。
5. 保持 API、UI、下載端點與 P4 blueprint 完全隔離。

P3.3c 完成不等於授權 P3.3d；API、HTTP DTO／mapping、UI、client adapter 與下載 capability 仍不存在。
