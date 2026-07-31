# Ragic 本地端系統共通業務規則

文件狀態：第一階段正式規則彙整  
同步基線：`DECISIONS.md` V0.15
最後更新：2026-07-31

## 1. 規格效力

- 本文件依 `DECISIONS.md` V0.14 同步整理；內容衝突時一律以 `DECISIONS.md` 為準。
- 已由 `DECISIONS.md` 決議的事項不得重新列為待確認。
- 第一階段不得自行加入庫存、批號、分批出貨、出庫依賴或正式會計過帳。
- `OPEN_QUESTIONS.md` 保留 OQ-005、OQ-044 與 OQ-045；三者均不阻塞 P1。
- P2.5 僅實作送貨地點運費規則與唯讀試算；不得提前實作訂單、運費快照、匯入或其他模組。
- 依 DEC-060，P4 是跨模組 UI／UX 與操作流程重整，P5 是後續 Inventory and Production；P4 完成前不得開始 P5。
- P5 階段歸屬不會推翻本文件的第一階段庫存排除，也不會使 P5 草案中的倉庫、批號、負庫存、成本或生產規則自動生效。
- P4.2 已於 2026-07-31 完成（closure commit `29e68fff4cbd005443c0d228563a81e36ecf403d`），範圍為 authenticated App Shell、navigation、company switcher、user menu、breadcrumb、responsive shell 與 accessibility baseline；下一正式階段為 P4.3，P5 尚未開始。此 UI 工作未變更 Prisma schema、migration、RBAC mapping、session model、transaction、audit、idempotency、formal print 或既有業務規則。

## 2. 第一階段範圍

### 正式納入

- 使用者、角色與公司可見範圍。
- 客戶、聯絡人、送貨地點、產品／品項、產品類別、價格表與價格版本。
- 銷售訂單、追加訂單、銷貨單、應收、正式統一發票資料與應收調整。
- 收款、收款分配、客戶預收、退款、票據與票據分配。
- 月結對帳單與應收帳款彙總。
- 人工應付發票、付款、付款分配與什項支出。
- 稽核紀錄、未結案件與整理後主檔移轉。

### 正式排除

- 請購、採購、進貨、驗收、庫存、批號、入庫、出庫、調撥與庫存成本。
- 固定資產、正式會計過帳、傳票核准與反過帳。
- 人資、薪資、請假與加班。

## 3. 使用者、權限與公司別

### 正式規則

- 第一階段主要角色為「訂單輸入人員」與「管理員」。
- 訂單輸入人員可查詢客戶、送貨地點、產品與價格，並可維護訂單、追加訂單、尚未建立應收的銷貨單、實際出貨日及列印資料。
- 訂單輸入人員不得查看或修改應收、收款、票據、月結及其他財務資料；權限必須由後端驗證，不得只隱藏前端按鈕。
- 管理員具有第一階段全部功能，並負責財務資料、移轉及主檔清理。
- 使用者以帳號密碼登入，密碼只保存強雜湊。Session 採 server-side revocable session，token 只保存 hash，閒置 8 小時到期；帳號停用時撤銷該帳號全部 Session。
- 使用者可被授權一或多家公司，登入後選擇預設公司並可切換。
- 第一階段至少包含實業與生技；所有交易單據都必須保存 `company_id`。
- 客戶、產品／品項及廠商可跨公司共用主檔，另以公司交易關係表限制可見與可用範圍。
- 所有清單、選單、查詢、命令、匯出與報表均須在伺服器端驗證公司範圍。

## 4. 主檔與歷史快照

### 正式規則

- 產品與原物料共用跨公司 `items` 主檔，正式 `item_type` 只有 `PRODUCT` 與 `RAW_MATERIAL`。
- `item_companies` 控制品項可由哪些公司查詢及使用；沒有有效關係時該公司不得查詢或使用。
- P2.3 不建立 `item_categories`、包裝換算或庫存單位換算，`items` 不保存 `category_id`。
- `items.code`、`name`、`base_unit` 必填。code 採 NFKC、trim、uppercase normalization，normalized 值全系統唯一。
- `items.barcode` 選填，採 trim normalization；有值時全系統唯一，空值允許多筆。
- `items` 保存 `sales_enabled`, `purchase_enabled`, `inventory_enabled`, `production_enabled` 能力旗標；第一階段實際使用以銷售旗標為主，其餘旗標不得引入相關流程。
- `item_companies.company_item_code` 必填，採 NFKC、trim、uppercase normalization；同公司內唯一、不同公司可重複。同一品項可授權多家公司，同一品項與公司只能一筆關係。
- 公司可銷售品項必須同時滿足品項有效、品項允許銷售、公司關係有效、公司關係允許銷售。
- `ADMIN` 可在其公司 scope 內建立、修改、停用、重新啟用品項及維護公司關係；`ORDER_ENTRY` 只能查詢目前公司已授權且可銷售的品項。
- 一般 UI 與 API 不提供品項 hard delete；重要異動、停用、重新啟用及公司關係異動均須與 audit log 位於同一 transaction。
- `customers` 為跨公司共用主檔；只有存在 `ACTIVE customer_companies` 關係的公司可以查詢或使用該客戶。
- 客戶類型分為 `DOMESTIC` 與 `FOREIGN`。境內客戶可不填統編，統編有值時以 normalized 值做全系統唯一限制，且不得填境外識別碼；境外客戶必填兩碼國別與境外識別碼，兩者組合全系統唯一，且不使用台灣統編。
- `customer_companies.customer_code` 必填並以 normalized code 比對，同公司內唯一、不同公司可重複；同一客戶可授權多家公司，但同一客戶與公司只能有一筆關係。
- 一個客戶可有多個聯絡人及送貨地點；聯絡人姓名必填，電話、手機或電子郵件至少一項必填。
- 同一客戶最多一位 `ACTIVE` 主要聯絡人；切換主要聯絡人時，在同一 transaction 取消原主要聯絡人。
- 送貨地點屬於共用客戶而非公司；地點代碼在同一客戶內唯一，同一客戶最多一個 `ACTIVE` 預設地點，切換時在同一 transaction 取消原預設地點。
- 客戶、客戶公司關係、聯絡人與送貨地點皆使用 `ACTIVE`／`INACTIVE`。一般 UI 與 API 不提供 hard delete；停用及重要異動須與 audit log 位於同一 transaction。
- `ADMIN` 可在其公司 scope 內維護客戶資料與公司授權；`ORDER_ENTRY` 只能查詢目前公司已有有效授權的有效客戶、聯絡人及送貨地點。
- 訂單必須選擇客戶與送貨地點；此交易規則不在 P2.2 實作。
- 廠商主檔跨公司共用，使用 `vendor_companies` 記錄交易公司、付款條件與公司別代碼；廠商統一編號全系統唯一。
- 所有交易單據保存建立當時的客戶、地址、付款條件、產品、價格、稅務與其他交易快照。
- 主檔修改不得自動改寫既有交易；未來若提供歷史更新，必須由管理員明確操作。
- 主檔清理由管理員執行；合併時以統編為第一比對鍵，名稱、電話及地址為輔。交易改指保留主檔後，舊主檔停用並保存 legacy mapping 與稽核紀錄。
- `company_settings` 保留泛用 key/value 設計，但每個 `setting_key` 都必須有應用層 schema validation；未登錄的 key 不得寫入。
- 正式公司切帳設定鍵為 `billing_cutoff_day`，設定值必須是 1 至 31 的整數；`INDUSTRIAL` 初始值為 25，`BIOTECH` 初始值為 20。
- 當 `billing_cutoff_day` 超過指定月份最後一天時，該月實際切帳日採當月最後一天。
- 公司設定以 `effective_from` 版本化。同公司、同設定鍵、同生效日不可重複；找不到有效版本時回報設定缺失，不得套用隱含預設值。
- 已生效公司設定不可直接修改、取消或刪除；變更時新增未來版本。尚未生效版本可修改或取消，但異動必須與 audit log 位於同一 transaction。
- 公司參數只允許具有目標公司 scope 的管理員維護；所有寫入使用 idempotency，後端重新驗證 client 傳入的公司識別。

## 5. 運費與價格

### 正式規則

- 運費以客戶與送貨地點取得有效規則。
- 運費規則與客戶價格表指派都必須透過客戶／公司 composite FK 保證公司歸屬一致。
- 同一送貨地點在同一有效期間只能有一種方式：不收運費、按數量收費或按地點固定金額。
- `freight_mode` 正式值域為 `NO_CHARGE`, `QUANTITY_BASED`, `FIXED_PER_LOCATION`；每個送貨地點使用自己的明確規則，不建立客戶層級 fallback。
- `NO_CHARGE` 不保存任何金額且試算為 0；`QUANTITY_BASED` 只保存每單位運費；`FIXED_PER_LOCATION` 只保存固定運費。
- 每單位與固定運費使用新臺幣元 `numeric(18,0)`，不得為負數且允許零。試算數量使用非負 `numeric(18,4)`；按數量計價使用 decimal-safe 計算並四捨五入至元，不得使用 JavaScript 浮點數直接相乘。
- 同一公司、客戶與送貨地點的所有保留規則不論狀態均不得有重疊期間；相鄰期間允許，open-ended 期間會阻擋後續重疊版本。
- 查詢必須傳入明確 `effectiveDate` 與 quantity，並驗證 company scope、有效客戶公司關係、有效且屬於該客戶的送貨地點與有效 ACTIVE 規則。找不到時回傳 `FREIGHT_RULE_NOT_FOUND`，不得自行免運、套用零或建立新規則。
- `price_lists` 屬於單一公司；code 採 NFKC、trim、uppercase normalization 並在公司內唯一。價格表不保存 `exclusive_customer_id`，也不建立未經決議的 `list_type`。
- `item_prices.unit_price` 為未稅單價，使用 `numeric(18,5)`，不得為負數且允許零價。
- 價格、客戶價格表指派與運費有效期間採半開區間：包含生效日、不包含失效日；`valid_to` 可為空，非空時必須晚於 `valid_from`。相鄰期間允許。
- 同一產品與價格表的所有保留價格期間不論狀態均不得重疊；同一客戶與公司的所有保留價格表指派期間不論狀態均不得重疊。
- 允許建立未來價格。管理員可以回溯修改，但不得改變已確認交易快照。
- P2.4 查價必須傳入明確 `effectiveDate`，並依序驗證公司 scope、有效客戶公司關係、有效且可銷售品項公司關係、有效價格表指派及有效品項價格。找不到時回傳 `PRICE_NOT_FOUND`，不得套用預設值或建立人工價。
- 系統依訂單日期取得有效產品價格，並保存標準價格、成交價格、價格來源、價格表及價格版本參照。
- 查無有效價格時，訂單輸入人員可以人工輸入本次成交價；必須標示人工價格並記錄操作者與時間。
- 查有有效標準價格但人工修改成交價時，修改理由必填，並記錄操作者、時間及前後值。
- 人工價格不得直接新增或覆寫正式價格表。正式價格表只能由管理員確認品項、價格表、單價及有效期間後新增或更新。
- `price_lists` 不直接關聯專屬客戶；所有客戶價格表關係統一由 `customer_price_list_assignments` 管理。
- 未確認訂單可更新最新價格；已確認訂單凍結原價，不因價格主檔變更而自動重算。
- 第一階段人工改價不需主管核准，但必須保留完整異動紀錄。

## 6. 銷售訂單、追加訂單與銷貨單

### 正式狀態

- 銷售訂單：草稿、已確認、已建立銷貨單、已出貨、已完成、作廢。
- 銷貨單：有效、已出貨、已建立應收、作廢。

### 正式規則

- `companies.code` 保持 `INDUSTRIAL`／`BIOTECH`；單據使用後端公司設定 `document_company_code`，分別為 `IN`／`BI`，不得由 client 輸入或由訂單服務硬編碼。
- 公司名稱、單據縮寫、統編、地址及電話使用具有生效日的 `company_settings` 正式版本；訂單確認時保存公司快照，後續公司設定異動不得改寫既有訂單。
- 訂單號格式為 `SO-{公司縮寫}-{YYYYMM}-{六碼流水}`，草稿建立成功時取號；公司、年月及單據類型各自獨立，作廢號碼不回收。
- P3.1 訂單狀態實際轉換只有草稿確認、草稿作廢、已確認正式修訂回草稿及已確認作廢；後續三個狀態僅保留 enum，不提供 API 或 UI 進入。
- 訂單初始 `revision_no = 1`。已確認訂單不得一般編輯，正式修訂會增加版次、清除確認資料並回到草稿；再次確認時才重新解析價格、運費及正式快照。
- 訂單作廢理由必填；作廢為終止狀態，不得恢復、修改、確認、修訂或 hard delete。
- 數量為 `numeric(18,4)` 且大於零；未稅成交單價為 `numeric(18,5)` 且不得為負。明細金額以 decimal-safe half-up 四捨五入至元，小計、未稅運費及未稅總額為 `numeric(18,0)`。
- P3.1 不計算稅額，畫面明確標示未稅。
- 價格來源為 `STANDARD`、`STANDARD_OVERRIDE`、`MANUAL`。標準價改價與查無標準價使用人工價時，人工價格理由均必填；正式價格依 `order_date` 取得，人工價格不得回寫價格表。
- 建立草稿時預設有效主要聯絡人，可改選同客戶其他有效聯絡人或留空；付款條件使用 nullable `payment_terms_text`，不建立付款條件主檔。
- 確認時由 server 建立客戶、客戶公司、聯絡人、送貨地點、品項、價格、運費與公司 typed snapshot；不得信任 client snapshot。
- `ADMIN` 與 `ORDER_ENTRY` 都可在授權公司內查詢及管理訂單；所有寫入與 audit、idempotency completion 位於安全 transaction 邊界。
- P3.1 不建立銷貨單、列印、PDF、實際送貨日、回收確認或任何應收、庫存及後續交易資料。

- 銷貨單只能由銷售訂單建立，不允許獨立人工新增。
- 初次銷貨單不在訂單確認時自動建立。使用者須在 `CONFIRMED` 訂單明細明確執行「建立銷貨單」；成功後新單為 `ACTIVE`、order 改為 `DELIVERY_CREATED`，失敗時 order 維持 `CONFIRMED` 且不得留下半成品或重複取號。
- 一張訂單同一時間最多一張 `status <> 'VOIDED'` 的銷貨單；`SHIPPED` 與 `RECEIVABLE_CREATED` 仍占用唯一有效名額。第一階段不分批出貨。
- `DELIVERY_CREATED` 訂單開始 revision 時，order 版次加一並回 `DRAFT`，但舊 `ACTIVE` 銷貨單保持不變，繼續代表上一個已確認 revision；編輯期間不得建立第二張非作廢銷貨單。
- 新 revision 重新確認後 order 為 `CONFIRMED`，使用者須明確執行單一 server-side rebuild。Rebuild 在同一 transaction 建立新單、以 `ORDER_REVISION_REBUILD` 作廢舊單、建立 replacement reference、更新 order、寫 audit 並完成 idempotency；失敗時舊單維持 `ACTIVE`、order 維持 `CONFIRMED`。
- 原訂單已出貨後需要追加時，不修改原訂單或原銷貨單；另建有獨立單號、revision、snapshot 與金額的追加訂單。所有追加訂單以 `ADDITION` 直接指向最初原始訂單，各自建立只包含自身內容的銷貨單，不形成 chain、不聚合原單、不跨訂單合併出貨。
- 一般使用者不提供獨立作廢按鈕；`DRAFT`、`CONFIRMED`、`DELIVERY_CREATED` 訂單作廢時，由同一 transaction 以 `ORDER_VOID` 連動作廢目前非作廢銷貨單。
- ADMIN 具 `delivery_notes.admin_void` 及公司 scope 時，可例外直接將 `ACTIVE` 銷貨單作廢；理由 trim 後必填，`void_source = ADMIN_DIRECT`，並在同一 transaction 將 order `DELIVERY_CREATED -> CONFIRMED`。作廢後不自動重建，使用者可再明確建立新單。ORDER_ENTRY 不得直接作廢。
- `SHIPPED`、`RECEIVABLE_CREATED`、`VOIDED` 不得由 P3.2 ADMIN 直接作廢，也不得進入 P3.2 revision／rebuild。
- 尚未建立應收前可修改銷貨單的 DEC-016 原則維持；P3.2 的訂單／價格／運費快照不得直接 PATCH，只能透過 order revision 與原子 rebuild 形成 replacement。P3.3 首次正式列印自動建立實際出貨日；P3.4 才提供已存在實際出貨日的受控更正及回收確認後鎖定。
- 銷貨單號為 `DN-{document_company_code}-{YYYYMM}-{六碼流水}`，document type 為 `DELIVERY_NOTE`。`YYYYMM` 與公司縮寫版本依 server 產生的 `Asia/Taipei` `delivery_note_date` 判斷，不得使用 `order_date`、`actual_delivery_date` 或 client 日期。重建使用重建當日並取得新號；作廢號碼不回收。
- 銷貨單複製已確認 order 的 typed 快照與凍結金額，不重新讀取目前主檔、查價或重算運費。
- 現行銷貨單凍結快照契約為 `delivery-note-snapshot-v1`；每張銷貨單必須保存由 server contract 層決定的 snapshot version。既有 frozen JSON 不因補版本而重寫，作廢不得改版，replacement 依新單實際 contract 另存版本。
- P3.2b 建立服務已依上述規則實作：鎖定 order 與目前非作廢銷貨單，在單一 transaction 內完成月流水取號、header、lines、order `DELIVERY_CREATED`、audit 與 idempotency completion；任一明細失敗全部 rollback。
- P3.2c 已實作 revision start 保留舊 `ACTIVE` 單、re-confirm controlled state、`ORDER_REVISION_REBUILD` 原子重建與 `ADMIN_DIRECT` 例外作廢。重建固定使用新號並向前延伸 replacement chain；所有 order／note／sequence／lines／audit／idempotency 異動位於同一 transaction，失敗不得留下中間狀態。
- P3.2d1 API 已實作 create／rebuild／ADMIN void 與 list／detail／current；所有寫入沿用正式 transaction service，必須通過 session、後端 RBAC、selected-company scope、strict body、`Idempotency-Key` 與 correlation ID，不接受 client 指定 company、actor、狀態、單號、日期、快照或金額。
- 銷貨單狀態為 `ACTIVE`、`SHIPPED`、`RECEIVABLE_CREATED`、`VOIDED`。P3.2 只實作建立為 `ACTIVE` 及三種 `ACTIVE -> VOIDED`；實際出貨與應收狀態由後續階段處理，紙本回收確認不是 status。
- 第一版不提供預覽。首次「正式列印」是明確的出貨 command；只有 `ACTIVE` 銷貨單及 `DELIVERY_CREATED` 訂單可執行。
- 首次正式列印時，如實際出貨日尚未填寫，以 `Asia/Taipei` 當地日期帶入；同一 transaction 建立唯一不可變正式 PDF、首次列印摘要與事件，並將訂單及銷貨單更新為 `SHIPPED`。任何一步失敗全部 rollback。
- `SHIPPED` 或 `RECEIVABLE_CREATED` 只能重印或下載既有正式 PDF，不得再次產生正式版本。重印不得覆蓋實際出貨日、首次列印時間、正式 PDF 或版型版本。
- 使用者明確執行重印才新增 append-only 重印事件及計數；一般查閱／下載既有正式 PDF 及內部 hash 驗證不算重印。
- 正式 PDF 保存於 PostgreSQL immutable binary version，並獨立保存 renderer、template、font、snapshot 與 document version，以及產生時間／人、SHA-256、MIME type、byte size 與 filename；不得把多種版本塞入 template version。後續主檔、公司設定、版型、renderer 或字型變更不得使舊單重印內容漂移。
- P3.3c 正式中文字型固定為 Noto Sans CJK TC Regular，須固定官方來源、上游版本與 checksum，以受控 server-side asset 嵌入。缺檔、checksum 不符或 glyph 不足必須 fail fast；禁止 runtime download、CDN 或 system font fallback。
- `VOIDED` 不得建立正式版本或執行重印；若歷史資料已有正式 PDF，仍保留供具 `delivery_notes.read` 及公司 scope 者查閱。不得覆寫原 PDF 或動態加作廢浮水印。
- Replacement 銷貨單各自建立自己的正式 PDF、首次列印摘要、事件與重印計數，不得沿用舊單資料。
- `delivery_notes.read` 可查看列印資訊及下載既有正式 PDF；`delivery_notes.manage` 可首次正式列印及重印。ADMIN 仍須通過 selected company 與 company scope，不新增 `delivery_notes.print`。
- 首次正式列印及重印都使用 idempotency key。不同 key 併發首次正式列印只允許一個 request 建立正式版本及轉換狀態；其餘 request 收斂回傳同一既有版本，不新增事件或重複轉換。
- P3.3d HTTP／UI 已落實首次正式列印、補印與純下載分離；純下載可重試且沒有 event、counter、audit 或狀態副作用。明細只讀正式 PDF metadata，只有授權下載端點讀取 binary。
- P3.3 第一版不納入備註、預計送貨日、客戶採購單號或外部參考號，不建立 placeholder。現有快照沒有獨立稅額，版型顯示「稅額：未分列」，不得反推或臆造數值。
- 第一階段不檢查庫存、不分配批號、不建立出庫或庫存異動，也不因庫存不足阻擋銷貨或應收。
- 建立應收後，來源訂單與銷貨單鎖定，不得修改或直接作廢。

## 7. 帳單月份、應收與正式統一發票

### 正式規則

- 帳單月份依實際出貨日與公司切帳日計算；實業初始切帳日為 25 日，生技為 20 日。
- 切帳日參數具有生效日，只影響新交易，不回溯已建立應收。尚未建立應收的交易可由管理員選擇重算並保留稽核。
- 僅管理員可在建立應收前人工調整帳單月份，理由必填。建立應收後不得直接修改；更正須經應收調整並重算月結。
- 建立應收前，管理員必須確認銷貨單已出貨、未作廢、尚無應收，且已人工確認「銷貨單已回收」；此確認即為第一階段的正式建立應收條件，不代表電子簽收。
- OQ-005 的正式電子簽收流程暫緩至第二階段，不阻塞第一階段。
- 一張銷貨單只建立一筆有效應收主資料；一筆應收可對應多張正式統一發票。
- 內部應收單號與正式發票號分開。內部單號採公司加年度唯一，作廢不得重用。
- 正式發票以字軌加號碼全系統唯一；空號另行記錄。
- 第一階段支援全額、部分及不開票，並支援含稅、稅外加、應稅 5%、零稅率、免稅與混合稅別。
- 第一階段只記錄正式發票資料，不串接政府電子發票平台；只保留未來介面方向。
- 報價為含稅價；未稅單價可保存至小數點 5 位，交易金額計算至元。
- 所有交易數量保存為 `numeric(18,4)`。

## 8. 應收調整

### 正式規則

- 應收尚未關聯正式發票、收款分配、票據分配或月結來源時，管理員可直接更正；理由必填，並保存修改前後內容、操作者、時間及 audit log。
- 應收已有正式發票、收款分配、票據分配或月結來源中的任一項時，不得直接修改金額，必須建立正式調整。
- 正式調整不覆蓋原始應收金額；調整類型包括對帳更正、折讓、退貨、尾差、呆帳或其他調整。
- 對帳更正與尾差由管理員直接執行。
- 折讓、退貨與呆帳必須主管核准；`approval_status`、`approved_by`、`approved_at` 必須保存。三者核准後才生效並影響應收與月結。
- 退貨與呆帳在核准前必須已有必要附件，缺少附件不得核准。
- 調整保存類型、金額、原因、日期、操作人、前後金額、應收關聯及必要附件。
- 第一階段退貨調整只影響應收與月結，不處理庫存回沖。

## 9. 收款、預收、退款與分配

### 正式規則

- 收款獨立建檔；收款與應收為多對多，每筆 allocation 保存實際分配金額。
- 分配由使用者確認；系統可以提出建議，但不得代替使用者確認。
- 分配總額不得超過收款總額；應收沖抵不得超過可沖抵餘額。
- 溢收先轉客戶預收；預收由使用者指定後續分配，不強制先沖最舊，可跨月。
- 退款僅限管理員操作，必須有原因與核准，並保存日期、金額及操作者。
- 短收保留未收餘額，或依原因建立折讓、退貨、尾差或其他調整，不得無紀錄直接結清。
- 收款尚無分配或後續資料時可修改或作廢；已有分配時不得直接修改金額、公司、客戶、日期等主要資料。
- 未月結前，收款／付款分配可撤銷，但必須建立反向分配紀錄，不得刪除。
- 已月結後只有管理員可以更正，並重算受影響月份及後續月份。
- 收款作廢與更正理由必填，所有前後值、操作者、時間與反向來源寫入 audit log。

## 10. 票據

### 正式規則

- 應收與應付票據共用 `checks` 主表，以 `direction` 區分。應收票據只關聯客戶；應付票據只關聯廠商，不得同時關聯兩者。
- 應收與應付分配分別使用 `check_receivable_allocations` 與 `check_payable_allocations`，並使用真實外鍵。
- 票據狀態為未兌現、託收中、待確認兌現、已兌現、退票、作廢、換票。
- 收到應收票據即抵扣應收；未兌現、託收中、待確認兌現及已兌現均為有效抵扣狀態。
- 到期後只能先轉待確認兌現；管理員確認銀行入帳後才轉已兌現。
- 一張票據可分配多張應收；一張應收可由多張票據及收款共同抵扣。分配不得超過票據金額或應收可沖抵餘額，超額轉預收。
- 退票或作廢時撤銷原分配、恢復應收、重算月結及後續月份，並保存原票據、日期、原因與處理人。
- 換票時舊票標記換票並撤銷原分配；建立並關聯新票，再由管理員重新分配。差額轉預收或保留應收。

## 11. 月結

### 正式規則

- 月結依實際出貨日及帳單月份歸屬，並可追溯原始應收與月份。
- 期末未收＝期初未收＋本期應收－本期現金分配－本期有效票據分配＋本期應收調整；增加應收為正，減少應收為負。
- 收款與票據依被分配的應收日期歸屬；退票依原被分配應收恢復。
- 系統同時顯示本期結清與累計結清；前期未收會影響累計結清。
- 次月期初等於本月期末。重跑採覆蓋，不得累加；前月異動後由該月起重算後續月份。
- 交易先同步更新應收餘額；月結彙總使用可追蹤背景工作，畫面顯示處理中，目標 1 分鐘內完成，管理員可重跑。
- 每次對外列印或寄送建立不可變快照與版號；重算不得覆蓋舊版，再次寄送產生新版本。

## 12. 應付、付款與什項支出

### 正式規則

- 第一階段應付以人工建立或舊系統未結資料匯入為主，不依採購、進貨或驗收產生。
- 付款獨立建檔並使用付款分配；一筆付款可支付一張或多張應付。
- 應付帳單月份預設依應付日期與公司切帳日計算；管理員可在未付款前調整，不做逐筆收入配對。
- 什項支出第一階段至少包含支出日期、金額、說明與帳單月份。
- 資料庫可預留 nullable 的分類、對象、付款方式、付款帳戶、附件及公司別，但第一階段不建立完整支出分類主檔。
- 付款與什項支出尚無分配或後續資料時可修改或作廢；付款已有分配時不得直接修改金額、公司、廠商、日期等主要資料。
- 已月結後只能由管理員透過反向紀錄更正。作廢與更正理由必填，所有歷程寫入 audit log。

## 13. 稽核、交易與刪除

### 正式規則

- 所有跨單據操作必須在資料庫 transaction 中完成，失敗時全部回滾。
- 所有重要狀態異動必須保留 audit log，包括建立、修改前後值、作廢、狀態、單價、下游單據、分配、退款、退票、月結、重算、主檔合併及移轉對照。
- 第一階段不要求登入紀錄。
- 交易資料不得實體刪除；作廢、撤銷、反向分配、退款、退票與調整均須保留歷程。
- 附件保存在公司內部伺服器、NAS 或受控檔案儲存；資料庫只保存 metadata。單檔上限 20 MB，只允許常見文件與圖片，隨單據保留且不得實體刪除。
- `attachment_links` 的 generic entity reference 由應用層驗證目標類型、目標存在性及公司範圍，並以完整性整合測試覆蓋有效、無效、跨公司及目標不存在情境。

## 14. 資料移轉與切換

### 正式規則

- 第一階段只移轉未建立銷貨單的訂單、未建立應收的銷貨單、未收清應收、未兌現票據、有餘額月結、未付款應付及整理後主檔。
- 主檔與未結交易採部分程式匯入、部分管理員人工整理的混合方式。
- 匯入與人工資料都保存來源類型、Ragic Record ID（如有）、建立人及核對狀態。
- 欄位 mapping、轉換、核對報表及 legacy ID 對照是移轉執行工作，不是業務 Open Question。
- 上線前一天凍結 Ragic 寫入，完成增量匯入與核對；正式切換後 Ragic 改唯讀，失敗時恢復 Ragic 寫入。
- 新系統只移未結案件及整理後主檔；完整歷史保留於唯讀 Ragic 或封存至少 7 年。
- 上線後回退窗口與附件移轉範圍於 P10 切換前確認，不阻塞 P1；未確認前不得刪除來源資料或形成依賴未決事項的不可逆操作。
- 現有資料均為測試資料，不要求保留；是否移除既有資料庫或 schema 必須在另行授權的 migration／環境重建任務中處理，本輪不得執行。

### P2.6 工程落地

- P2.6 只完成主檔整合驗收及小量匯入框架，不代表已執行 Ragic 正式全量移轉。
- 匯入支援 dry-run、型別驗證、normalization、檔內與資料庫重複檢查、legacy FK mapping、issue report、冪等重送、批次摘要及 reconciliation。
- 正式寫入必須經既有主檔 service、ADMIN、company scope、transaction、audit、idempotency 與 correlation ID；不得停用正式 constraint 或將 legacy ID 當作正式 UUID。
- 原始 CSV 預設不永久保存，不記錄完整資料列；issue 僅保存已遮罩且已防 CSV formula injection 的欄位。
- P2.6 正式 importer 僅完成 `customers`、`customer_companies`、`items`、`item_companies`；其餘六類僅完成 CSV template、validation contract 與後續規劃，不得視為已可正式匯入。

## 15. 非功能基線

- 同時使用者：10 人。
- 交易量：每年 100,000 筆。
- 一般頁面目標：2 秒內回應。
- 月結重算目標：1 分鐘內；其他背景工作基線：5 分鐘內。
- 每日備份；RPO 24 小時，RTO 8 小時。
- 正式交易、稽核、附件與封存資料至少保存 7 年。

## 16. 未決事項

- OQ-005 只處理第二階段是否實作正式電子簽收及其流程設計，不阻塞第一階段。
- 第一階段已正式決議以「銷貨單已回收」的人工確認作為建立應收條件，保存 `returned_confirmed`、`returned_confirmed_at`、`returned_confirmed_by` 或等效欄位。
- 第一階段不實作正式電子簽收；後續功能不得覆蓋既有人工確認歷程。
- OQ-044：上線後回退窗口，P10 前確認，不阻塞 P1。
- OQ-045：附件移轉範圍，P10 前確認，不阻塞 P1。

## 17. 變更紀錄

- V0.13（2026-07-31，P4.2 完成同步）：記錄 P4.2 完成範圍與 closure commit、P4.3 為下一正式階段及 P5 尚未開始；全部既有業務、transaction、audit、idempotency 與 formal-print 規則不變。
- V0.12（2026-07-29，P4.1 規劃同步）：同步 DEC-060 的 P4 UI／UX、P5 Inventory and Production 與 P4 先於 P5 原則；保留第一階段庫存排除及全部既有業務規則。
- V0.11（2026-07-28，P3.3a 規格閉合）：同步 DEC-058，正式化首次正式列印即出貨、DB immutable PDF、預覽／重印／下載語意、權限、版型、作廢／replacement、audit、冪等、併發、P3.3／P3.4 邊界及 OQ-051 第一版排除；尚未實作 schema 或功能。
- V0.10（2026-07-27，P3.2d1 工程同步）：完成 Delivery-note API security boundary、strict DTO、idempotency、correlation ID、error mapping 與 serialization；不包含 UI、出貨、列印、回收確認或應收。
- V0.10（2026-07-27，P3.2c 工程同步）：完成 revision rebuild、replacement chain、ADMIN direct void、typed errors、audit、idempotency 與 atomic rollback；不包含 API／UI、出貨、列印或應收。
- V0.10（2026-07-27，P3.2b 工程同步）：完成銷貨單初次建立、查詢、confirmed snapshot copy、月流水、RBAC／company scope、idempotency、audit、order 狀態與 ORDER_VOID 內部連動；不包含 API／UI／rebuild／ADMIN direct void。
- V0.10（2026-07-27）：同步 DEC-057，正式化銷貨單手動建立、revision 原子重建、追加訂單 root 關聯且不聚合、ADMIN 直接作廢、`delivery_note_date` 月流水、非作廢唯一、快照、audit 與 idempotency；P3.2 尚未開始實作。
- V0.9（2026-07-27）：同步 DEC-056，新增 P3.1 公司縮寫與法定資訊、月流水訂單號、未稅金額、價格來源、正式修訂、作廢、聯絡人、付款條件及 typed snapshot 規則。
- V0.8（2026-07-25，P2.6 同步）：不新增業務決議；記錄主檔匯入框架的安全、transaction、mapping、reconciliation 與已完成 importer 邊界。
- V0.8（2026-07-25）：同步 DEC-055，正式化送貨地點運費模式、金額精度、decimal-safe 試算、半開期間、全歷程排除重疊、composite FK、明確日期查詢、`FREIGHT_RULE_NOT_FOUND`、權限及 audit。
- V0.7（2026-07-25）：同步 DEC-054，正式化公司價格表、未稅單價精度、半開有效期間、全歷程排除重疊、客戶指派 composite FK、明確日期查價、`PRICE_NOT_FOUND`、權限及 audit。
- V0.6（2026-07-25）：同步 DEC-053，正式化跨公司品項、兩種品項類型、代碼與條碼 normalization、用途旗標、公司別代碼、可銷售條件、權限及 audit。
- V0.5（2026-07-25）：同步 DEC-052，加入跨公司客戶、境內外識別、公司別客戶代碼、聯絡方式、主要聯絡人、送貨地點、停用、權限及 audit 規則。
- V0.4（2026-07-25）：同步 DEC-051，新增 `billing_cutoff_day` 值域、短月份、有效版本、權限、audit 與 idempotency 規則。
