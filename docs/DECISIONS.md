# Ragic 本地端系統正式決議

文件性質：本專案最高優先級的業務決議紀錄  
版本：V0.15
最後更新：2026-07-31

## 1. 使用原則

- 本文件中的內容均視為需求方已確認的正式決議。
- 若本文件與其他需求、設計、原型、ERP MVP、舊版文件或草稿衝突，以本文件為準。
- 已列於本文件的事項，不得重新列入 `OPEN_QUESTIONS.md`。
- 新決議應先更新本文件，再同步更新功能規格、資料庫設計、流程文件與程式碼。
- 未經需求方確認，不得自行變更本文件中的業務規則。
- 若本文件未涵蓋某項需求，才可列入 `OPEN_QUESTIONS.md`。
- 第一階段不應因其他 ERP 文件而自動加入庫存、批號、分批出貨或正式會計過帳。

---

## DEC-001 第一階段範圍

第一階段納入：

- 使用者與角色權限
- 客戶主檔
- 客戶聯絡人
- 客戶送貨地點
- 產品主檔
- 產品類別
- 價格表
- 產品價格版本
- 銷售訂單
- 銷貨單
- 應收主資料
- 正式統一發票資料
- 收款管理
- 收款分配
- 客戶預收款
- 票據管理
- 票據分配
- 月結對帳單
- 應收帳款彙總
- 應付發票
- 付款管理
- 付款分配
- 什項支出
- 稽核紀錄
- 未結案件與主檔移轉

第一階段不納入：

- 請購
- 採購
- 進貨
- 驗收
- 庫存
- 批號管理
- 入庫
- 出庫
- 調撥
- 庫存成本
- 固定資產
- 正式會計過帳
- 傳票核准與反過帳
- 人資
- 薪資
- 請假
- 加班

---

## DEC-002 分階段移轉原則

- 最終原則上所有 Ragic 表單都要移轉至本地端系統。
- 採分階段方式進行。
- 第一階段只重建目前實際使用的表單與流程。
- 第一階段完成後，再依優先順序評估其他未使用或第二階段模組。

---

## DEC-003 資料移轉範圍

第一階段只移轉：

- 未建立銷貨單的訂單
- 已建立銷貨單但尚未建立應收的銷貨單
- 尚未完全收清的應收資料
- 尚未兌現的票據
- 尚有餘額的月結資料
- 尚未付款的應付資料
- 經整理後的主檔資料

完整歷史資料不全部匯入新系統，原歷史資料可保留於 Ragic 或另行封存查詢。

---

## DEC-004 主檔清理責任

- 由管理員負責判斷及執行主檔清理。
- 清理範圍包括：
  - 重複客戶
  - 停用客戶
  - 重複產品
  - 過期價格
- 系統應保留主檔合併、停用或改指紀錄。
- 建議保留原始 Ragic Record ID 與新系統 ID 對照。

---

## DEC-005 使用者角色

第一階段只有兩種主要角色：

### 訂單輸入人員

可執行：

- 查詢客戶
- 查詢送貨地點
- 查詢產品與價格
- 新增、修改、作廢訂單
- 建立追加訂單
- 建立銷貨單
- 修改及作廢尚未建立應收的銷貨單
- 設定或修改實際出貨日
- 列印訂單與銷貨單
- 查詢訂單與銷貨單歷程

不得執行：

- 查看應收資料
- 建立應收
- 拋轉應收
- 查看收款
- 查看票據
- 查看月結
- 修改任何財務資料

### 管理員

- 擁有第一階段全部功能權限。
- 負責應收、收款、票據、月結、應付、資料移轉及主檔清理。

---

## DEC-006 交易資料快照

- 所有交易單據都要保存建立當時的客戶、送貨地址、付款條件、產品、價格及其他交易資訊快照。
- 主檔異動不得自動改寫既有歷史交易。
- 如未來提供更新歷史資料功能，必須由管理員明確操作，不得預設同步更新。

---

## DEC-007 客戶與送貨地點

- 一個客戶可維護多個送貨地點。
- 每個送貨地點可有不同收貨人、電話及地址。
- 訂單必須選擇客戶及送貨地點。
- 運費計算以「客戶＋送貨地點」為主要判斷依據。

---

## DEC-008 運費規則

每一個送貨地點，在同一有效期間內只能設定一種運費方式：

- 不收運費
- 按數量收費
- 按地點固定金額

運費規則至少需包含：

- 客戶
- 送貨地點
- 運費計算方式
- 單位運費
- 固定運費
- 生效日
- 失效日
- 是否啟用

建立訂單時：

1. 選擇客戶。
2. 選擇送貨地點。
3. 系統取得該地點有效運費規則。
4. 自動計算運費。
5. 訂單確認後保留運費快照。

---

## DEC-009 價格取得與有效期間

- 系統依訂單日期取得當時有效的產品價格。
- 同一產品、同一價格表的有效期間不得重疊。
- 客戶價格表指派使用半開有效期間 `[valid_from, valid_to)`；同一客戶、同一公司在任一時間點最多只能有一筆有效指派，期間不得重疊。
- 訂單選擇產品後仍允許人工修改成交單價。
- 系統應保留標準價格與成交價格。

---

## DEC-010 價格凍結

- 未確認訂單可更新為最新有效價格。
- 已確認訂單保留原價。
- 已確認訂單不得因價格主檔異動而自動重算。
- 有有效標準價格但人工修改成交單價時，修改理由必填，並保留操作者、時間及異動紀錄。
- 查無有效價格而輸入成交單價時，系統必須將該筆明細標示為人工價格，並保留操作者、時間及異動紀錄。
- 正式價格表只能由管理員新增或更新。
- 第一階段不要求主管核准人工改價。

---

## DEC-011 訂單狀態

銷售訂單狀態：

1. 草稿
2. 已確認
3. 已建立銷貨單
4. 已出貨
5. 已完成
6. 作廢

狀態定義：

- `草稿`：尚未確認。
- `已確認`：訂單內容已確認。
- `已建立銷貨單`：已存在有效銷貨單。
- `已出貨`：已填入實際出貨日。
- `已完成`：已建立應收資料。
- `作廢`：訂單已正式作廢。

---

## DEC-012 訂單修改規則

- 訂單已確認但尚未出貨前，所有欄位都可修改。
- 若已建立銷貨單，修改訂單時：
  1. 作廢舊銷貨單。
  2. 保留舊銷貨單歷史。
  3. 重新建立完整的新銷貨單。
- 不採分批出貨。
- 已建立應收後，不得修改或作廢訂單。

---

## DEC-013 追加訂單

原訂單已出貨後，如需追加：

- 不修改原訂單。
- 不修改原銷貨單。
- 另建一張新的追加訂單。
- 追加訂單需關聯原訂單。
- 由追加訂單建立新的銷貨單。

追加訂單建議保留：

- 原訂單編號
- 追加類型
- 追加原因
- 建立人
- 建立時間

---

## DEC-014 銷貨單建立來源

- 銷貨單只能由銷售訂單建立。
- 不允許不經訂單而人工新增銷貨單。
- 一張訂單同一時間最多只能有一張有效銷貨單。
- 舊銷貨單如因訂單修改而作廢，仍保留歷史。

---

## DEC-015 銷貨單狀態

銷貨單狀態：

1. 有效
2. 已出貨
3. 已建立應收
4. 作廢

- 填入實際出貨日後，狀態改為 `已出貨`。
- 建立應收後，狀態改為 `已建立應收`。
- 建立應收後禁止修改或直接作廢。

---

## DEC-016 銷貨單修改與作廢

- 尚未建立應收前，銷貨單可修改。
- 一般使用者不提供獨立直接作廢按鈕。
- 因訂單作廢或訂單重建造成的銷貨單作廢，由訂單流程自動連動。
- 管理員保留例外作廢功能。
- 管理員作廢時必須記錄：
  - 作廢原因
  - 作廢時間
  - 作廢人
  - 來源操作
- 已建立應收、收款、票據或月結資料時，不得直接作廢銷貨單。

---

## DEC-017 實際出貨日

- 「首次正式列印」是第一階段的出貨動作；預覽或查閱既有正式 PDF 都不是出貨動作。
- 只有 `ACTIVE` 銷貨單及其 `DELIVERY_CREATED` 來源訂單可執行首次正式列印。
- 首次正式列印時，如 `actual_delivery_date` 尚未設定，系統以公司時區下的當地日期自動帶入。第一階段公司時區固定為 `Asia/Taipei`；未來若建立正式公司時區設定，再另案決定轉換方式。
- 首次正式列印必須在同一個資料庫 transaction 內建立不可變正式 PDF、寫入首次列印時間與操作者、設定 `actual_delivery_date`、將銷貨單與訂單改為 `SHIPPED`、建立列印事件、寫 audit 並完成 idempotency。任一步驟失敗全部 rollback。
- 實際出貨日一旦由首次正式列印建立，後續重印、查閱或下載不得覆蓋。
- 使用者可在建立應收前依 P3.4 的受控流程更正已存在的實際出貨日；第一階段不要求更正理由，但仍須保留前後值、操作者、時間及 audit。P3.4 不提供未經首次正式列印而直接建立實際出貨日的流程。
- P3.3 負責首次建立實際出貨日與 `SHIPPED` 狀態；P3.4 負責人工回收確認、回收後鎖定、回收確認撤銷／更正及已存在實際出貨日的受控更正。

---

## DEC-018 帳單月份

- 帳單月份依實際出貨日判斷。
- 實業初始切帳日為每月 25 日。
- 生技初始切帳日為每月 20 日。
- 切帳日必須做成公司參數，可設定生效日。
- 特定情況允許管理員人工調整帳單月份。
- 建立應收前允許調整。
- 建立應收後不得直接修改；如需更正，應透過應收調整流程處理。
- 帳單月份異動需保留前後值與操作紀錄。

---

## DEC-019 建立應收條件

管理員可由銷貨單建立應收，前提為：

- 銷貨單已出貨。
- 管理員已人工確認「銷貨單已回收」。
- 銷貨單尚未建立其他應收。
- 銷貨單未作廢。

第一階段以「銷貨單已回收」的人工確認作為建立應收條件，不實作正式電子簽收，也不要求庫存出庫完成。

人工確認至少保留：

- `returned_confirmed`
- `returned_confirmed_at`
- `returned_confirmed_by`

未來若實作電子簽收，必須另行定義流程，且不得覆蓋第一階段的人工確認歷程。

---

## DEC-020 銷貨單與應收關係

- 一張銷貨單只建立一筆應收主資料。
- 一筆應收主資料可對應多張正式統一發票。
- 建立應收後，來源訂單與銷貨單鎖定。

---

## DEC-021 內部應收單號與正式發票號碼

- 內部應收單號與正式統一發票號碼必須分開。
- 一筆應收即使不開正式統一發票，仍需有內部應收單號。
- 正式統一發票可分次開立。

---

## DEC-022 正式統一發票

第一階段支援：

- 全額開票
- 部分開票
- 不開票
- 一筆應收對應多張正式統一發票
- 含稅價
- 稅外加
- 應稅 5%
- 零稅率
- 免稅
- 混合稅別

第一階段只管理正式發票資料，不強制串接電子發票平台。

---

## DEC-023 應收修改與調整

- 應收尚未關聯任何正式發票、收款分配、票據分配或月結來源時，管理員可以直接更正應收資料。
- 直接更正必須保存修改原因、修改前後內容、操作者與時間，並寫入 audit log；不得只覆蓋原始金額而無紀錄。
- 應收一旦已有正式發票、收款分配、票據分配或月結來源中的任一項，不得直接修改金額，必須建立正式應收調整。
- 正式調整不得覆蓋原始應收金額，應以獨立調整紀錄影響餘額及月結。

調整類型至少包括：

- 對帳更正
- 折讓
- 退貨
- 尾差
- 呆帳
- 其他調整

每筆調整應記錄：

- 調整類型
- 調整金額
- 調整原因
- 調整日期
- 操作人
- 調整前後金額
- 關聯應收
- 必要附件

第一階段退貨調整只影響應收及月結，不處理庫存回沖。

---

## DEC-024 收款模型

- 收款必須獨立建檔。
- 收款不得直接只記錄在應收表頭。
- 一筆收款可分配至多張應收。
- 一張應收可接受多筆收款。
- 可支援分次收款。
- 可支援現金與票據共同沖抵同一筆應收。
- 每一筆收款與應收的關聯都要記錄實際分配金額。

---

## DEC-025 收款分配規則

- 收款分配由使用者指定。
- 可依月份選取應收。
- 系統可提供自動沖抵建議，但不得取代使用者確認。
- 分配總額不得超過收款總額。
- 應收已分配金額不得超過可沖抵餘額。
- 尚未分配的收款金額可轉預收。

---

## DEC-026 溢收、預收與退款

- 溢收先轉為客戶預收款。
- 預收款可於後續分配至其他應收。
- 特殊情況可辦理退款。
- 退款需保留原因、日期、金額及操作人。
- 不得直接刪除溢收或預收紀錄。

---

## DEC-027 短收

短收可依實際原因處理為：

- 保留未收餘額
- 折讓
- 退貨
- 尾差
- 其他調整

不得在沒有原因與紀錄的情況下直接視為結清。

---

## DEC-028 票據收票抵扣

- 收到應收票據時即抵扣應收。
- 不必等實際兌現後才抵扣。
- 有效抵扣狀態包括：
  - 未兌現
  - 託收中
  - 待確認兌現
  - 已兌現
- 退票或作廢後，原抵扣必須撤銷並恢復應收。

---

## DEC-029 票據狀態與日期

票據狀態：

1. 未兌現
2. 託收中
3. 待確認兌現
4. 已兌現
5. 退票
6. 作廢
7. 換票

票據日期至少包括：

- 收票日
- 託收日
- 到期日
- 實際兌現日
- 退票日

到期後：

- 系統只能轉為 `待確認兌現`。
- 管理員確認銀行入帳後，才轉為 `已兌現`。

---

## DEC-030 票據分配

- 一張票據可分配多張應收。
- 一張應收可由多張票據及收款共同抵扣。
- 每一筆票據與應收的關聯都要記錄分配金額。
- 票據分配總額不得超過票據金額。
- 應收沖抵總額不得超過其可沖抵餘額。
- 超額部分應轉預收，不得直接多沖應收。

---

## DEC-031 退票

退票時系統必須：

1. 撤銷原票據分配。
2. 恢復各張應收的未收餘額。
3. 重算月結。
4. 重算後續月份期初。
5. 保留原票據資料。
6. 記錄退票日期。
7. 記錄退票原因。
8. 記錄處理人。
9. 如換票，建立新舊票據關聯。

---

## DEC-032 月結歸屬

- 銷貨與應收依實際出貨日及帳單月份歸入月結。
- 月結資料需可追溯至原始月份及原始應收。

---

## DEC-033 月結計算方式

月結畫面採即時計算。

資料來源異動時，包括：

- 應收
- 收款
- 票據
- 應收調整
- 退票

系統應立即或透過可追蹤工作重新計算月結。

月結基本公式：

```text
期末未收
＝期初未收
＋本期應收
－本期現金收款分配
－本期有效票據分配
＋本期應收調整
```

調整符號：

- 增加應收為正
- 減少應收為負

---

## DEC-034 本期結清與累計結清

系統同時顯示：

- 本期結清
- 累計結清

本期結清：

```text
本期應收
－分配至本期的收款
－分配至本期的有效票據
＋分配至本期的調整
≤ 0
```

累計結清：

```text
所有尚未沖銷應收餘額合計 ≤ 0
```

前期未收會影響累計結清。

---

## DEC-035 月份結轉與重算

- 次月期初等於本月期末。
- 重跑結轉時採覆蓋重算，不得再次累加。
- 前月資料異動後，從該月份起重算後續月份。
- 退票、應收調整及收款重分配都可能觸發後續月份重算。
- 月結來源需可追溯至原始應收與原始月份。

---

## DEC-036 月結列印版本

- 系統畫面維持即時計算。
- 對外列印或寄送時，建議建立不可變更的版本快照。
- 後續資料重算不得覆蓋舊列印版本。
- 再次列印或重新寄送時，產生新版本號。

---

## DEC-037 應付發票

- 第一階段應付發票以人工建立為主。
- 不依採購、進貨或驗收單產生。
- 一筆付款通常支付一張應付，但也可能支付多張。
- 系統需支援付款單及付款分配明細。

---

## DEC-038 應付帳單月份

- 第一階段應付帳單月份依應付日期及該公司的有效切帳日計算。
- 切帳日做成具有生效日的公司參數。
- 第一階段不進行應付與收入的逐筆配對。
- 管理員可於尚未付款前調整帳單月份，並保留理由與 audit log。

---

## DEC-039 什項支出

第一階段畫面至少包含：

- 支出日期
- 支出金額
- 說明
- 帳單月份

資料庫可預留 nullable 欄位：

- 支出分類
- 支出對象
- 付款方式
- 付款帳戶
- 附件
- 公司別

第一階段不要求建立完整支出分類主檔。

---

## DEC-040 稽核紀錄

第一階段必須保留：

- 建立
- 修改
- 修改前後值
- 作廢
- 狀態變更
- 單價修改
- 建立或撤銷下游單據
- 收款分配
- 票據分配
- 月結
- 月結重算
- 主檔合併或停用
- 資料移轉對照

第一階段不要求登入紀錄。

---

## DEC-041 資料刪除原則

- 交易資料不得實體刪除。
- 作廢、撤銷、退票、退款、調整均應保留歷程。
- 不得以刪除資料取代正式作廢或沖銷。
- 跨單據操作應使用資料庫 transaction。

---

## DEC-042 會計介面

- 第一階段不做正式會計過帳。
- 第一階段不建立用途不明確的正式會計介面 migration。
- 只在設計文件保留未來會計科目、傳票狀態及過帳參照的擴充方向。
- 等會計介面契約明確後，再建立正式資料表與 migration。

---

## DEC-043 公司別

- 第一階段涉及至少實業與生技兩個公司別。
- 所有交易單據應保留 `company_id`。
- 至少下列表應有公司別：
  - 銷售訂單
  - 銷貨單
  - 應收
  - 正式統一發票
  - 收款
  - 票據
  - 月結
  - 應付
  - 付款
  - 什項支出
- 產品主檔可設計為跨公司共用。
- 客戶與廠商是否共用主檔，可由公司交易關係表處理。

---

## DEC-044 規格衝突處理

若其他文件主張下列內容，且與本文件衝突，第一階段不採用：

- 批號庫存
- 銷貨單必須先完成出庫
- 一張訂單可分批產生多張有效銷貨單
- ERP MVP 的庫存流程
- 自動加入正式會計過帳
- 與本文件不同的訂單或銷貨狀態
- 以低優先級文件重新推翻已確認決議

---

---

## 2. 2026-07-24 未決事項決議

下列事項依《Ragic 本地端系統－未決事項回答表》確認，並納入正式規格。

### OQ-008 第一階段各表的公司 FK 與跨公司驗證如何配置

- 決議狀態：採用建議
- 正式決議：交易單據全部帶 company_id；客戶、產品可共用主檔，再以公司交易關係限制可見與可用範圍。

### OQ-043 既有 ERP schema、migration 與資料如何處理

- 決議狀態：已修改確認
- 正式決議：現有的資料都是測試資料，不保留，有需要可以移除既有資料庫或schema

### OQ-009 公司切帳日參數變更如何生效

- 決議狀態：採用建議
- 正式決議：參數以生效日起只影響新交易；不回溯已建立應收資料。尚未建立應收的交易可由管理員選擇重算，並保留稽核。

### OQ-010 帳單月份人工修改在哪些狀態允許

- 決議狀態：採用建議
- 正式決議：僅管理員可在建立應收前修改；理由必填。已開票、已收款或已月結資料不得直接改，改動需重算月結。

### OQ-011 客戶統一編號的唯一範圍

- 決議狀態：採用建議
- 正式決議：統編採全系統唯一；空值允許多筆但需其他識別鍵。境外客戶使用國別＋境外識別碼；重複統編直接阻擋。

### OQ-015 價格與運費有效期間的邊界及回溯規則

- 決議狀態：採用建議
- 正式決議：採半開區間：生效日包含、失效日不包含；允許未來價格，回溯修改需管理員執行且不得影響已確認交易快照。

### OQ-016 廠商是跨公司主檔或每家公司分別建立

- 決議狀態：採用建議
- 正式決議：廠商主檔跨公司共用，另以 vendor_company 關係表記錄交易公司、付款條件與公司別代碼；統編全系統唯一。

### OQ-017 第一階段是否串接政府電子發票服務

- 決議狀態：採用建議
- 正式決議：第一階段只記錄發票資料，不串接政府電子發票；保留未來介面欄位。

### OQ-018 稅額與金額如何 rounding

- 決議狀態：已修改確認
- 正式決議：因為報價都是含稅價，未稅單價可以到小數點5位，金額計算到元

### OQ-019 應收調整是否需要主管核准及附件

- 決議狀態：採用建議
- 正式決議：對帳更正與尾差由管理員直接執行；折讓、退貨、呆帳需主管核准；退貨與呆帳附件必填，核准後才影響月結。

### OQ-020 預收再分配與退款的詳細流程

- 決議狀態：採用建議
- 正式決議：預收款由使用者指定分配，不強制先沖最舊；可跨月。退款限管理員，需原因與核准；撤銷採反向紀錄，不刪除。

### OQ-021 收款／付款分配如何撤銷或更正

- 決議狀態：採用建議
- 正式決議：未月結前可撤銷並建立反向分配紀錄；已月結後僅管理員可更正，必須重算受影響月份及後續月份。

### OQ-022 換票的完整流程

- 決議狀態：採用建議
- 正式決議：舊票標示換票並撤銷原分配；建立新票並連結舊票，再由管理員重新分配。差額轉預收或保留應收。

### OQ-024 單號與正式發票號的唯一範圍

- 決議狀態：採用建議
- 正式決議：所有內部單號採公司＋年度唯一，作廢不得重用；正式發票號採字軌＋號碼全系統唯一，空號另記錄。

### OQ-025 月結公式的邊界案例如何計算

- 決議狀態：已修改確認
- 正式決議：收款與票據按被分配到的應收發票日期歸屬，退票按跟票據被分配的應收發票恢復

### OQ-026 月結「立即重算」採同步或背景工作

- 決議狀態：採用建議
- 正式決議：交易先同步更新應收餘額；月結彙總採背景工作，畫面顯示處理中，月結重算目標 1 分鐘內完成，可由管理員重跑。此目標獨立於其他背景工作的 5 分鐘目標。

### OQ-027 是否需要月結對外列印版本快照

- 決議狀態：採用建議
- 正式決議：需要。每次列印或寄送建立不可變快照與版號；重算後保留舊版，再次寄送產生新版本。

### OQ-028 應付帳單月份如何配對收入月份

- 決議狀態：採用建議
- 正式決議：應付帳單月份預設依應付日期與公司切帳日計算；管理員可於未付款前調整，不做逐筆收入配對。

### OQ-029 舊應付已付款但缺少逐筆付款紀錄如何匯入

- 決議狀態：已修改確認
- 正式決議：舊資料可能只會匯入未結資料，已付款的不一定會匯入

### OQ-031 主鍵採 UUID 或 bigint

- 決議狀態：採用建議
- 正式決議：建議採 UUID，由資料庫產生；所有新表一致使用 UUID，Ragic Record ID 另存對照表。

### OQ-032 generic 附件、稽核、月結來源如何保證參照完整性

- 決議狀態：採用建議
- 正式決議：核心交易採專屬關聯表與真實 FK；audit log 可使用 entity_type＋entity_id，由應用層驗證。附件採 `attachment_links` 專屬連結表；其 generic entity reference 必須由應用層驗證目標類型、目標存在性及公司範圍，並以完整性整合測試覆蓋有效、無效、跨公司及目標不存在情境。

### OQ-033 附件儲存、大小、格式與保留

- 決議狀態：採用建議
- 正式決議：若部署於公司內部伺服器或 NAS，附件存 NAS/檔案儲存，資料庫只存 metadata；單檔 20MB，限制常見文件與圖片，保留隨單據，不允許實體刪除。

### OQ-034 帳號登入與公司可見範圍

- 決議狀態：採用建議
- 正式決議：帳密登入、密碼雜湊；Session 採 server-side revocable session，客戶端 token 在資料庫只保存 hash，閒置 8 小時到期，帳號停用時撤銷該帳號全部 Session。使用者可被授權一或多家公司，登入後選預設公司並可切換。

### OQ-035 會計介面預留要建立哪些 schema

- 決議狀態：採用建議
- 正式決議：第一階段只保留設計文件，不建立 accounting_refs migration。

### OQ-036 非功能目標如何量化

- 決議狀態：採用建議
- 正式決議：先以 10 名同時使用者、每年 10 萬筆交易、一般頁面 2 秒內、其他背景工作 5 分鐘內、每日備份、RPO 24 小時、RTO 8 小時、資料保留 7 年作基線；月結重算另依 OQ-026，以 1 分鐘內完成為目標。

### OQ-039 重複主檔如何合併

- 決議狀態：採用建議
- 正式決議：以統編為第一比對鍵、名稱電話地址為輔；管理員人工審核 winner，所有交易改指 winner，舊主檔停用並保留 legacy mapping。

### OQ-040 移轉 cut-off 與雙寫策略

- 決議狀態：採用建議
- 正式決議：上線前一天凍結 Ragic 寫入，做最終增量匯入與核對；新系統正式切換後 Ragic 改唯讀。失敗則回復 Ragic 寫入。

### OQ-041 歷史資料保留範圍

- 決議狀態：採用建議
- 正式決議：新系統只移未結案件與整理後主檔；完整歷史保留於唯讀 Ragic 或另存封存，至少保存 7 年。

---


### OQ-042 產品與原物料主檔模型

- 決議狀態：採用建議
- 正式決議：
  - 產品與原物料共用同一個品項主檔 `items`。
  - 以 `item_type` 區分成品、原物料、包材、服務及其他品項。
  - 以 `sales_enabled`、`purchase_enabled`、`inventory_enabled`、`production_enabled` 等功能欄位控制品項用途。
  - 第一階段只啟用銷售所需功能，不啟用庫存、批號、採購及生產流程。
  - 不另建一套重複的產品主檔；如既有 ERP `items` 與銷售需求耦合過深，應建立相容層或銷售視圖，不複製主檔資料。

### OQ-012 價格表缺少有效品項價格

- 決議狀態：採用建議
- 正式決議：
  - 系統查無有效價格時，允許訂單輸入人員人工輸入本次成交單價。
  - 該價格必須標示為人工價格，並保留操作者、時間及異動紀錄。
  - 系統查有有效標準價格但人工修改成交單價時，修改理由必填。
  - 訂單不得直接自動新增或覆寫正式價格表。
  - 正式價格表只能由管理員新增或更新；管理員須確認品項、價格表、單價、生效日、失效日及期間不重疊。
  - 訂單明細需保留標準價格、成交價格、價格來源、價格表及價格版本參照。

### OQ-023 應收票據與應付票據資料模型

- 決議狀態：採用建議
- 正式決議：
  - 應收票據與應付票據共用同一張票據主表。
  - 以 `direction` 或同等欄位區分 `receivable` 與 `payable`。
  - 應收票據必須關聯客戶；應付票據必須關聯廠商，不得同時關聯兩者。
  - 應收分配與應付分配使用不同關聯表：
    - `check_receivable_allocations`
    - `check_payable_allocations`
  - 共用票據基本欄位與狀態歷程；應付票據特有的交付日、付款認列等欄位可使用 nullable 欄位或應付票據延伸表承載。
  - 核心分配關係必須使用實際外鍵，不得只以 generic reference 代替。

### OQ-037 主檔與交易資料移轉方式

- 決議狀態：已修改確認
- 正式決議：
  - 新系統資料採「部分匯入、部分人工整理」的混合方式。
  - 可可靠對應、資料品質足夠且有移轉價值的主檔與未結交易，優先透過程式匯入。
  - 重複、缺漏、編碼需重整或無法可靠對應的資料，由管理員人工整理、合併或重新輸入。
  - 正式移轉前仍須完成必要的 Ragic 欄位 mapping、轉換規則、核對報表及 legacy ID 對照。
  - 欄位 mapping 屬於移轉執行工作，不再視為尚待業務決議的 Open Question。

### OQ-038 未結帳款移轉方式

- 決議狀態：已修改確認
- 正式決議：
  - 未結應收、未結應付、未兌現票據及相關期初餘額採混合方式移轉。
  - 可由 Ragic 欄位及關聯可靠判斷的未結資料，以匯入方式處理。
  - 無法可靠判斷、資料不完整或屬特殊例外者，由管理員人工輸入或修正。
  - 匯入與人工輸入資料都必須保留來源類型、原始 Ragic Record ID（如有）、建立人及核對狀態。
  - 上線前須以應收、應付、票據及月結餘額進行總額與逐筆核對。
  - 未結判斷條件的欄位盤點與 mapping 屬於移轉執行工作，不再視為尚待業務決議的 Open Question。

---

## DEC-045 PostgreSQL 限制與 Prisma migration

- Prisma schema 管理一般資料表、欄位、普通 FK 與索引。
- PostgreSQL exclusion constraint、partial unique index、composite FK 與 Prisma 無法完整表達的複雜 CHECK，使用可審查的 custom SQL migration。
- 流程為：先由 Prisma 產生未套用的 migration 草稿，再補入冪等且明確命名的 SQL，審查 SQL 與回復／forward-fix 方案後，才可在測試環境執行。
- migration 必須有資料庫整合測試，驗證正向、衝突、跨公司與升級情境。
- 本次只記錄流程，不建立或執行 migration。

## DEC-046 公司關係、價格表與品項限制

- `freight_rules` 與 `customer_price_list_assignments` 必須以 composite FK 保證客戶與公司關係存在且一致。
- `price_lists` 不保存 `exclusive_customer_id`；客戶與價格表的關係統一由 `customer_price_list_assignments` 管理。
- `items.barcode` 有值時全系統唯一；空值允許多筆。
- 所有交易數量欄位採 `numeric(18,4)`。
- `company_settings` 保留泛用 key/value 設計，但每個 `setting_key` 必須有應用層 schema validation，未登錄的 key 不得寫入。

## DEC-047 銷貨單唯一有效資料

- 同一 `sales_order_id` 在 `delivery_notes.status` 非作廢狀態下只能存在一筆。
- 作廢資料保留歷程，不占用上述唯一有效限制。

## DEC-048 應收調整核准欄位與生效條件

- `receivable_adjustments` 必須保存 `approval_status`、`approved_by`、`approved_at`。
- 折讓、退貨與呆帳只有在核准後才生效並影響應收餘額與月結。
- 退貨與呆帳在核准前必須已存在必要附件；缺少附件不得核准。
- 核准、駁回與生效歷程必須寫入 audit log。

## DEC-049 收款、付款與什項支出修改及作廢

- 收款、付款與什項支出尚無分配或後續資料時，可修改或作廢。
- 收款或付款已有分配時，不得直接修改金額、公司、交易對象、日期等主要資料。
- 已月結後只能由管理員透過反向紀錄更正，不得覆蓋或刪除原資料。
- 作廢與更正理由必填；修改前後值、操作者、時間、反向來源及所有狀態歷程均寫入 audit log。

## DEC-050 P8 切換前待確認事項

- 上線後回退窗口與附件移轉範圍列入 P8 切換前確認。
- 兩項均不阻塞 P1，也不得在未確認前形成不可逆 migration 或刪除來源資料。

## DEC-051 公司切帳日參數與版本規則

- 第一個正式公司設定鍵為 `billing_cutoff_day`，設定值必須是 1 至 31 的整數。
- 初始值為：`INDUSTRIAL` 25 日、`BIOTECH` 20 日。
- 當設定值超過指定月份的最後一天時，該月實際切帳日採當月最後一天。
- 公司設定以 `effective_from` 版本化；同公司、同設定鍵、同生效日不得重複。
- 已生效版本不得直接修改、取消或刪除；調整已生效設定必須新增未來版本。
- 尚未生效的未來版本可以修改或取消；修改及取消都必須保存 audit log。
- 找不到指定日期的有效設定時必須回報設定缺失，不得自行套用預設值。
- `billing_cutoff_day` 必須經應用層 Zod schema 驗證；未登錄的設定鍵不得寫入或直接進入業務邏輯。
- 公司參數管理只允許具有公司權限的 `ADMIN` 操作；後端不得信任 client 傳入的 `company_id`。
- 公司參數寫入使用 transaction，並使設定異動、audit log 與 idempotency 完成狀態位於同一 transaction。

## DEC-052 跨公司客戶主檔、聯絡人與送貨地點

- `customers` 是跨公司共用主檔；`customer_companies` 控制客戶可由哪些公司查詢及使用。客戶沒有有效公司關係時，不得供該公司查詢或使用。
- 客戶類型為 `DOMESTIC` 或 `FOREIGN`。
- 境內客戶可以不填 `tax_id`；有值時使用 normalized 值做全系統唯一限制，且不使用 `foreign_identifier`。
- 境外客戶必須填寫 `country_code` 與 `foreign_identifier`，兩者組合全系統唯一，原則上不使用台灣 `tax_id`。
- `customer_companies.customer_code` 必填，以 normalized code 比對；同公司內唯一，不同公司可重複。
- 同一客戶可以授權多家公司；同一客戶與公司只能存在一筆關係。
- 客戶聯絡人保存姓名、部門、職稱、電話、手機、電子郵件、備註、主要聯絡人旗標及狀態。姓名必填，電話、手機及電子郵件至少一項必填。
- 同一客戶最多一位 `ACTIVE` 主要聯絡人；設定新主要聯絡人時，必須在同一 transaction 取消原主要聯絡人。
- 送貨地點保存代碼、名稱、收件人、電話、郵遞區號、城市、行政區、地址、完整地址、備註、預設旗標及狀態。
- 送貨地點代碼在同一客戶內唯一；同一客戶最多一個 `ACTIVE` 預設送貨地點。設定新預設地點時，必須在同一 transaction 取消原預設地點。
- 送貨地點屬於共用客戶，不直接關聯公司。
- 客戶、公司關係、聯絡人及送貨地點使用 `ACTIVE`／`INACTIVE`；一般 UI 與 API 不提供 hard delete。
- `ADMIN` 可以在其公司 scope 內建立、修改、停用及維護公司授權；`ORDER_ENTRY` 只能查詢目前公司已授權的客戶資料。
- 所有寫入重新驗證後端 RBAC 與 company scope，使用 idempotency 與 transaction，並使主要異動及 audit log 位於同一 transaction。

## DEC-053 跨公司品項主檔與公司關係

- `items` 是跨公司共用主檔；`item_companies` 控制品項可由哪些公司查詢及使用。品項沒有有效公司關係時，不得供該公司查詢或使用。
- P2.3 不建立 `item_categories`、包裝換算表或庫存單位換算；`items` 不保存 `category_id`。
- `items` 至少保存 `code`, `name`, `description`, `specification`, `base_unit`, `barcode`, `item_type`, `sales_enabled`, `purchase_enabled`, `inventory_enabled`, `production_enabled`, `status` 及建立／更新 actor 與時間。
- `item_type` 的正式值域為 `PRODUCT` 與 `RAW_MATERIAL`。
- DEC-053 是 P2.3 及第一階段實作的較新明確決議；OQ-042 原列的包材、服務及其他類型保留為歷史紀錄，但不屬於本階段正式 `item_type` 值域。
- `items.code`、`name` 與 `base_unit` 必填。品項代碼採 NFKC、trim、uppercase normalization，normalized 值全系統唯一。
- `items.barcode` 選填；有值時採 trim normalization 並全系統唯一，空值允許多筆。
- `purchase_enabled`, `inventory_enabled`, `production_enabled` 僅為能力旗標，不得因此引入採購、庫存、批號、生產或會計流程；第一階段實際使用以 `sales_enabled` 為主。
- `item_companies` 至少保存 `item_id`, `company_id`, `company_item_code`, `sales_enabled`, `status` 及建立／更新 actor 與時間。
- `company_item_code` 必填，採 NFKC、trim、uppercase normalization；同公司內唯一，不同公司可重複。同一品項可以授權多家公司，但同一品項與公司只能存在一筆關係。
- 品項在公司可供銷售必須同時滿足：`items.status = ACTIVE`、`items.sales_enabled = true`、`item_companies.status = ACTIVE`、`item_companies.sales_enabled = true`。
- `ADMIN` 可以在其公司 scope 內建立、修改、停用、重新啟用品項及維護公司關係；`ORDER_ENTRY` 只能查詢目前公司已授權且可銷售的品項。
- 一般 UI 與 API 不提供 hard delete。重要異動、停用、重新啟用及公司關係異動必須與 audit log 位於同一 transaction，並使用後端 RBAC、company scope、idempotency 及 correlation ID。

## DEC-054 正式價格版本與客戶價格表指派

- 正式價格明細資料表名稱為 `item_prices`。P2.4 只建立 `price_lists`、`item_prices`、`customer_price_list_assignments`。
- `price_lists` 屬於單一公司，不保存 `exclusive_customer_id`，也不建立尚無正式需求的 `list_type`。code 採 NFKC、trim、uppercase normalization 並在公司內唯一；name 必填，status 使用 `ACTIVE`／`INACTIVE`。
- `item_prices.unit_price` 表示未稅單價，使用 `numeric(18,5)`，不得為負數且允許零價。
- 價格及客戶指派期間均採半開區間 `[valid_from, valid_to)`；`valid_to` 可為 null，否則必須晚於 `valid_from`。相鄰期間允許。
- 同一 `price_list_id`, `item_id` 的所有保留價格期間不論 status 均不得重疊；同一 `customer_id`, `company_id` 的所有保留指派期間不論 status 均不得重疊。
- 客戶價格表關係只由 `customer_price_list_assignments` 管理，不建立第二套專屬客戶價格關聯。
- 客戶指派使用 composite FK 保證客戶具有該公司的 `customer_companies` 關係，且 price list 屬於相同公司；應用層另要求客戶公司關係為 `ACTIVE`。
- 只有 `ADMIN` 可以維護價格表、價格版本與客戶指派；`ORDER_ENTRY` 只能查詢目前授權公司、可銷售品項及明確 effective date 的有效正式價格。
- 正式查價必須接受明確 `effectiveDate`，未來交易以其 `order_date` 傳入；P2.4 不得固定使用系統今日。
- 查價依序驗證 company scope、有效客戶公司關係、有效且可銷售品項公司關係、指定日期有效客戶價格表指派，以及指定日期有效品項價格。
- 找不到有效價格時回傳一致的 `PRICE_NOT_FOUND`，不得套用零、建立正式價格、建立人工交易價或寫入交易快照。
- 已生效價格不得直接覆寫而失去歷程；價格變更以新的期間版本表示，既有版本僅調整期間或狀態並保留 audit。
- 一般 UI 與 API 不提供 hard delete。正式價格、期間及客戶指派的重要異動必須與 audit log 位於同一 transaction，並使用後端 RBAC、company scope、idempotency 及 correlation ID。

## DEC-055 送貨地點運費規則與試算

- P2.5 只建立 `freight_rules` 與正式 `freight_mode` enum，不建立訂單、銷貨單、運費快照、客戶層級 fallback、區域／重量／距離計價或承運商管理。
- 運費規則以 `company_id`, `customer_id`, `delivery_location_id` 與有效期間管理。客戶必須具有該公司的有效 `customer_companies` 關係，送貨地點必須屬於該客戶；每個送貨地點使用自己的明確規則。
- `freight_mode` 正式值域為 `NO_CHARGE`, `QUANTITY_BASED`, `FIXED_PER_LOCATION`。
- `NO_CHARGE` 的 `unit_freight` 與 `fixed_freight` 均為 null，試算結果為 0；`QUANTITY_BASED` 只保存 `unit_freight`；`FIXED_PER_LOCATION` 只保存 `fixed_freight`。
- `unit_freight` 與 `fixed_freight` 使用新臺幣元 `numeric(18,0)`，不得為負數且允許零。試算 quantity 使用 `numeric(18,4)` 且不得為負數。
- `QUANTITY_BASED` 使用 decimal-safe 計算 `quantity × unit_freight`，依正式金額規則四捨五入至元；不得直接使用 JavaScript 浮點數計算。
- 有效期間採半開區間 `[valid_from, valid_to)`；`valid_to` 可為 null，否則必須晚於 `valid_from`。相鄰期間允許，open-ended 期間阻擋後續重疊。
- 同一公司、客戶與送貨地點的所有保留運費規則不論 status 均不得有重疊期間。
- 只有 `ADMIN` 可以建立、調整、啟用或停用運費規則；`ORDER_ENTRY` 只能依目前授權公司、客戶、送貨地點、明確 effective date 與 quantity 唯讀試算。
- 查詢依序驗證 permission、company scope、有效客戶、有效客戶公司關係、有效且屬於該客戶的送貨地點，以及指定日期有效且為 ACTIVE 的規則。
- 找不到有效規則時回傳一致的 `FREIGHT_RULE_NOT_FOUND`；不得自行視為免運、套用 0 或建立新規則。
- 一般 UI 與 API 不提供 hard delete。模式、金額、期間與狀態的重要異動必須與 audit log 位於同一 transaction，並使用後端 RBAC、company scope、idempotency 及 correlation ID。


## DEC-056 銷售訂單、公司單據縮寫與確認快照

- `companies.code` 維持既有系統代碼 `INDUSTRIAL` 與 `BIOTECH`，不得因單據編號縮短或改寫。
- 單據編號另使用版本化公司設定 `document_company_code`，固定為兩碼大寫英文字母且全系統唯一；`INDUSTRIAL = IN`、`BIOTECH = BI`。訂單服務只能由後端有效公司設定取得，不信任 client 輸入。
- 公司法定資訊使用既有 `company_settings` 有效版本機制保存。正式設定鍵包含 `company_name`、`document_company_code`、`company_tax_id`、`company_address`、`company_phone`；所有鍵均須經 registry 驗證，並在訂單確認時保存於 `company_snapshot`。
- 奇麗實業有限公司對應 `INDUSTRIAL`，統編 `60603347`，地址「新北市中和區國光街109巷22弄13號」，電話 `02-29571175`。
- 奇麗生技有限公司對應 `BIOTECH`，統編 `60377546`，地址「新北市中和區國光街109巷22弄13號」，電話 `02-26805751`。
- 銷售訂單號格式為 `SO-{document_company_code}-{YYYYMM}-{六碼流水號}`。草稿建立成功時取號；每公司、每月及 `SALES_ORDER` document type 獨立流水，自 `000001` 起，作廢號碼不得回收。
- 訂單數量使用 `numeric(18,4)` 且必須大於零；未稅交易單價使用 `numeric(18,5)` 且不得為負數。明細金額為數量乘交易單價，以 decimal-safe half-up 四捨五入至新臺幣元；小計、未稅運費及未稅總額使用 `numeric(18,0)`。
- P3.1 不計算正式稅額；畫面清楚標示小計、運費與總額均為未稅。
- `PriceSource` 正式值為 `STANDARD`、`STANDARD_OVERRIDE`、`MANUAL`。標準價改價及查無標準價而使用人工價時，人工價格理由均必填，並保存操作者、時間、前後值及 audit；人工價格不得回寫正式價格表。
- 訂單初始 `revision_no = 1`。草稿一般編輯不增加版次；已確認訂單只能透過正式修訂回到草稿，版次加一並清除確認人與確認時間。修訂開始時不自動查價、重算運費或刷新快照，再次確認時才重新解析並凍結新快照。P3.1 不建立完整不可變訂單版本表，歷程由版次及 audit before／after image 保存。
- 建立草稿時預設同客戶有效主要聯絡人，使用者可改選同客戶其他有效聯絡人或不選；確認時保存聯絡人快照。
- P3.1 使用 nullable `payment_terms_text`，確認時保存文字快照；不建立付款條件主檔、enum 或工作流程。
- 草稿及已確認訂單均可作廢，作廢理由一律必填。作廢後不得恢復、修改、確認、修訂或 hard delete，單號不回收。
- 訂單確認時由 server 依正式來源建立客戶、客戶公司關係、聯絡人、送貨地點、品項、價格、運費及公司法定資訊的 typed snapshot。不得信任 client snapshot，且確認後不得因主檔修改而自動重建。
- P3.1 實作 `DRAFT -> CONFIRMED`、`DRAFT -> VOIDED`、`CONFIRMED -> DRAFT`（正式修訂）及 `CONFIRMED -> VOIDED`。`DELIVERY_CREATED`、`SHIPPED`、`COMPLETED` 只保留 enum，不提供進入流程。
- `ADMIN` 與 `ORDER_ENTRY` 都具有 `sales_orders.read` 及 `sales_orders.manage`，但只能操作目前授權公司。所有寫入使用後端 RBAC、company scope、transaction、audit、idempotency 及 correlation ID。
- P3.1 只建立 `sales_orders`、`sales_order_lines`、`sales_order_relations`；不得建立銷貨單、列印、PDF、實際送貨日、回收確認、應收、庫存或其他後續模組。

## DEC-057 銷貨單建立、修訂重建、追加、例外作廢與取號

- 銷貨單初次建立採使用者明確執行，不在訂單確認時自動建立。只有 `CONFIRMED` 訂單可由訂單明細執行建立；成功後新銷貨單為 `ACTIVE`、訂單改為 `DELIVERY_CREATED`，失敗時訂單維持 `CONFIRMED`，不得留下半成品或重複取號。
- 不提供獨立新增空白銷貨單。相同 idempotency key 與相同 payload 必須 replay 原結果，不得重複建立或取號；相同 key、不同 payload 必須 conflict。
- `DELIVERY_CREATED` 訂單開始 revision 時，訂單版次加一、回到 `DRAFT` 並清除確認人／時間；目前有效銷貨單不立即作廢，仍以 `ACTIVE` 代表上一個已確認 revision，且不得更新其 snapshot。Revision 編輯期間不得建立第二張非 `VOIDED` 銷貨單。
- 新 revision 重新確認後 order 為 `CONFIRMED`，舊 `ACTIVE` 銷貨單暫時代表上一版。使用者必須明確執行單一 server-side rebuild command；client 不得分別呼叫作廢與建立。
- Rebuild 必須在同一 transaction 鎖定 order 與 server 查得的目前非 `VOIDED` 銷貨單，驗證新舊 revision，取得新號、建立新銷貨單與明細、複製新 revision 確認快照、以 `ORDER_REVISION_REBUILD` 作廢舊單、建立 replacement reference、將 order 改為 `DELIVERY_CREATED`、寫 audit 並完成 idempotency。任一步驟失敗全部 rollback，舊單維持 `ACTIVE`、order 維持 `CONFIRMED`、新單不存在。
- `DRAFT`、`CONFIRMED`、`DELIVERY_CREATED` 訂單作廢時，如有非 `VOIDED` 銷貨單，必須在同一 transaction 以 `ORDER_VOID` 自動作廢。訂單與銷貨單任一步驟失敗全部 rollback。
- 維持 DEC-013。追加必須建立獨立 sales order，擁有自己的單號、revision、狀態、snapshot 與金額；所有追加訂單以 `sales_order_relations` 的 `ADDITION` 直接指向最初原始訂單，不形成 addition chain。每張追加訂單建立自己的銷貨單，且只包含該追加訂單內容；不聚合原單、不重複原單數量、不重建原單銷貨單，也不跨訂單合併出貨。
- P3.2 不建立 `root_order_id`。Service 必須解析 root original order；DB／service 必須阻擋 self relation、duplicate relation、cycle 及 addition 作為另一 addition 的 source。追加訂單作廢只處理自己的有效銷貨單；原始訂單作廢不自動作廢所有追加訂單。
- `ADMIN` 具 `delivery_notes.admin_void` 且有該公司 scope 時，可例外直接作廢 `ACTIVE` 銷貨單。`void_reason` trim 後必填，必須使用正式 server service，不提供直接 status PATCH 或 DELETE。作廢與 order `DELIVERY_CREATED -> CONFIRMED` 必須同一 transaction，`void_source = ADMIN_DIRECT`；作廢後不自動重建，使用者可再明確建立新銷貨單並取得新號。`ORDER_ENTRY` 不得直接作廢；內部 order workflow 自動作廢不需 `admin_void`。
- `ADMIN` 不得直接作廢 `SHIPPED`、`RECEIVABLE_CREATED` 或 `VOIDED` 銷貨單。P3.2 亦不允許上述狀態進入 revision、rebuild 或直接作廢流程。
- `DeliveryNoteStatus` 正式值為 `ACTIVE`、`SHIPPED`、`RECEIVABLE_CREATED`、`VOIDED`。P3.2 只實作不存在→`ACTIVE`，以及 revision rebuild、order void、admin direct void 的 `ACTIVE -> VOIDED`；`VOIDED` 為終止狀態。`SHIPPED` 由 P3.3 首次正式列印流程觸發，`RECEIVABLE_CREATED` 由應收模組觸發；紙本回收確認不是 status。
- 同一 `sales_order_id` 最多只能有一張 `status <> 'VOIDED'` 的銷貨單。未來 partial unique index 必須使用等價條件，不得只限制 `ACTIVE`。
- 銷貨單號格式為 `DN-{document_company_code}-{YYYYMM}-{六碼流水號}`，document type 為 `DELIVERY_NOTE`。`delivery_note_date` 是獨立 PostgreSQL `date` 單據日期，不是 `actual_delivery_date`、首次列印或紙本回收日期。
- 初次建立及重建的 `delivery_note_date` 均由 server 以 `Asia/Taipei` business date 產生；重建使用重建當日，不沿用舊日期。`YYYYMM` 與 `document_company_code` 有效版本均依 `delivery_note_date` 解析，不得使用 `order_date`、`actual_delivery_date`、client 日期或 UTC 日期切割。
- Sequence 以 `company_id`、`DELIVERY_NOTE`、`delivery_note_date` 年月獨立，自 `000001` 起固定六碼。取號、銷貨單、明細、order 狀態、audit 與 idempotency completion 同一 transaction；作廢號碼不回收，重建取得新號，replay 不取得第二個號。P3.2 不開放一般使用者修改 `delivery_note_date`。
- P3.2 銷貨單複製已確認 order 的 typed company、customer、customer-company、contact、delivery、item、price、freight、payment terms 與金額快照，不重新讀取目前主檔、查價或重算運費。不保存任意完整 `order_snapshot` JSON，不在 order 保存 `current_delivery_note_id`，不建立 active boolean、root/source IDs JSON、delivery-note relations table 或 cascade delete。
- Replacement 使用新銷貨單的 `replaced_delivery_note_id` 單向指向同公司、同 sales order 的舊單；不得 self-reference，舊單不另存 `superseded_by`。
- 正式 audit operations 為 `delivery_note.created`、`delivery_note.voided`、`delivery_note.rebuilt`、`sales_order.delivery_created`、`sales_order.delivery_rebuilt`；`delivery_note.voided` 以 `ADMIN_DIRECT`、`ORDER_REVISION_REBUILD`、`ORDER_VOID` 區分來源。正式 idempotency operations 為 `delivery_note.create`、`delivery_note.rebuild`、`delivery_note.admin_void`、`sales_order.void_with_delivery_note`。P3.2 保持同步 transaction，不使用 background job。
- P3.2 規格及工程已正式結案；`0010_p3_delivery_notes`、service、API、UI 與整合驗收均已完成。P3.3 不得回改 P3.2 的快照、replacement、唯一有效銷貨單或作廢規則。

## DEC-058 銷貨單正式列印、PDF 保存、版型與重印

### 名詞與狀態

- 第一版不提供 PDF 預覽。預覽若未來實作，必須是無副作用功能：不設定實際出貨日、不轉換狀態、不建立正式版本、不增加重印次數，也不得與正式列印共用含糊的 route 語意。
- 首次正式列印是具業務副作用的明確 command。只有 `ACTIVE` 銷貨單及 `DELIVERY_CREATED` 訂單可建立正式版本；成功後兩者同時改為 `SHIPPED`。
- 重印是使用者具 `delivery_notes.manage` 權限時明確執行的 command，只回傳既有正式 PDF，新增 append-only 重印事件並增加重印計數，不重新 render、不建立新正式版本、不修改實際出貨日或狀態。
- 查閱／下載既有正式 PDF 是 `delivery_notes.read` 的 read-only 操作，不是重印事件，不增加重印計數；內部 hash 驗證亦不計入重印。
- 第一階段不允許重新產生、取代或覆寫正式 PDF。正式版本一旦建立即不可變。

### 不可變正式 PDF

- 採混合資料模型：`delivery_notes` 保存查詢及 constraint 所需摘要；`delivery_note_print_versions` 保存每張銷貨單唯一正式 PDF 的不可變 metadata 與 PDF bytes；`delivery_note_print_events` 保存首次正式列印與重印事件。
- 第一階段正式 PDF binary 使用 PostgreSQL `bytea` 保存，不採 filesystem／object storage reference。原因是首次正式列印必須與實際出貨日、兩張單據狀態、首次列印摘要、event、audit 及 idempotency completion 位於同一資料庫 transaction，DB binary 能提供明確的原子 rollback 邊界。
- 不採「只保存結構化 print snapshot 並於重印時重新 render」；renderer、中文字型、依賴與版型更新都可能使舊單內容漂移。
- filesystem／object storage 加 immutable reference 可在未來檔案量或 DB 容量證明需要時另案評估；未完成 staging、原子發布、孤兒檔清理、備份還原與 hash reconciliation 設計前不得替換本決議。
- 每張銷貨單最多一個正式 PDF，`document_version` 第一版固定為 `1`，並以 `(delivery_note_id, document_version)` 唯一。正式版本至少保存 `document_version`、`template_version`、`generated_at`、`generated_by`、SHA-256 `content_hash`、`mime_type = application/pdf`、`byte_size`、`filename` 及 PDF bytes；不得 update 或 delete。
- 第一版單一正式 PDF 上限為 20 MiB（20 × 1024 × 1024 bytes）；renderer 結果超過上限時整個首次正式列印 transaction 失敗並 rollback，不得截斷或降低內容完整性後默默保存。
- `delivery_notes` 保存 `actual_delivery_date`、`first_printed_at`、`first_printed_by` 與 `reprint_count`，不保存 `formal_print_version_id`，也不建立 delivery note 指回 print version 的循環 FK。每張銷貨單唯一正式 PDF 由 `delivery_note_print_versions.delivery_note_id` 的 unique constraint 保證及查詢；此設計不降低正式 PDF 唯一性，並避免 Prisma relation、migration 次序與首次列印 insert transaction 的不必要循環依賴。

### 權限、公司隔離與列印資格

- 不新增 `delivery_notes.print`。現有 `delivery_notes.read` 可查看列印資訊及下載已存在正式 PDF；`delivery_notes.manage` 可執行首次正式列印與重印。ADMIN 不因角色名稱繞過 selected company 或 company scope。
- `ACTIVE`：可首次正式列印；尚無正式版本時不可重印或下載。
- `SHIPPED`：不可再次建立正式版本；可重印及下載既有正式 PDF。
- `RECEIVABLE_CREATED`：不可首次正式列印；可重印及下載既有正式 PDF。
- `VOIDED`：不得建立正式版本或執行重印 command；若歷史資料已有正式 PDF，具 `delivery_notes.read` 及公司 scope 者仍可查閱／下載，UI 與 response metadata 必須明確提示已作廢。
- 目前正式流程禁止 `SHIPPED` 銷貨單直接作廢，因此一般新資料不會出現「先列印後作廢」。若移轉資料或未來受控流程出現此狀態，既有正式 PDF 與歷程仍須保留。

### 作廢、replacement 與版型

- 作廢後不得動態修改原 PDF 或加浮水印。第一階段不產生作廢 audit copy；由 UI 與下載回應資訊標示作廢狀態。
- replacement 銷貨單不得沿用原銷貨單的 PDF、首次列印時間、事件或重印計數；每張 replacement 依自身 `ACTIVE` 狀態建立自己的唯一正式版本。
- `template_version` 是不可變且可精確比對的識別碼，例如 `delivery-note-v1`；不得保存「目前版型」等模糊值。版型更新使用新識別碼，只影響更新後首次正式列印的銷貨單。
- 舊銷貨單重印永遠回傳保存的既有 PDF，不重新套用新版型。版型版本變更不修改交易資料，也不要求交易資料 migration。
- 中文字型必須可合法部署並能穩定嵌入 PDF；P3.3a 只制定要求，不安裝字型、套件或 renderer。

### Audit、冪等與併發

- 首次正式列印必須要求 idempotency key，正式 operation 為 `delivery_note.formal_print`。相同 key、相同 payload replay 同一正式 PDF；相同 key、不同 payload conflict。
- 首次正式列印固定先 claim idempotency，再依 order → delivery note 順序取得 row lock。不同 key 併發時只允許第一個 request 建立正式版本及轉換狀態；後取得 lock 的 request 若發現同一銷貨單已有完整正式版本，應收斂回傳該既有版本，不新增事件、不增加計數、不再次轉換狀態。
- 若發現 `SHIPPED` 但正式版本、首次列印摘要或來源訂單狀態不完整，必須回傳 typed invariant error，不得補半套資料或重新 render。
- 重印使用獨立 operation `delivery_note.reprint` 及 idempotency key；相同 key replay 不得重複新增 event 或計數。不同 key 代表不同使用者主動重印事件。
- 正式 audit operations 至少為 `delivery_note.formal_printed`、`delivery_note.shipped`、`sales_order.shipped`、`delivery_note.reprinted`。首次正式列印 event、狀態、PDF、audit 與 idempotency completion 同一 transaction；重印 event、計數、audit 與 idempotency completion 同一 transaction。

### 第一版版型與 OQ-051

- OQ-051 在 P3.3 第一版正式裁定排除備註、預計送貨日、客戶採購單號及外部參考號；不建立 placeholder schema 或預留 nullable 欄位。未來如需加入，必須另立決議及 migration。
- 第一版只使用銷貨單 frozen snapshots、既有 typed 金額及首次正式列印 transaction 產生的欄位：公司名稱、統編、地址、電話及單據公司碼；銷貨單號與銷售訂單號；客戶名稱與統編；送貨地點、收件人、電話及地址；nullable 聯絡人；品項代碼、公司品號、名稱、規格、單位；數量、單價、明細金額、小計、運費、總額；付款條件；實際出貨日；正式列印時間；文件版本及版型版本。
- 現有 P3.2 銷貨單沒有獨立 `tax_amount`，且 `total_amount = subtotal + freight_amount`；P3.3 不得由總額反推或臆造稅額。第一版金額區固定顯示「稅額：未分列」，不保存數值、不建立 placeholder。若未來需列印數值稅額，必須先完成交易稅額來源、計算、凍結與 migration 的獨立決議。

## DEC-059 銷貨單凍結快照與正式 PDF 版本契約

- 現有 P3.2 銷貨單凍結快照契約正式命名為 `delivery-note-snapshot-v1`。它涵蓋 `delivery_notes` 與 `delivery_note_lines` 既有分散 typed JSON、付款條件及凍結金額結構；實際欄位仍以正式 schema 為準。
- `delivery_notes.snapshot_version` 必填且由 server snapshot contract 層明確寫入。既有銷貨單只回填 scalar discriminator；不得重建、包裝、補寫或變更既有 frozen JSON。作廢不得修改版本，replacement 必須依新單實際建立的 contract 寫入版本。
- `delivery_note_print_versions` 必須分別保存 `renderer_version`、`template_version`、`font_version` 與 `snapshot_version`；`document_version` 仍維持獨立語意。不得把 renderer、font、snapshot 或 document version 編碼或串接進 `template_version`。
- 首次建立正式 PDF 時，print version 的 `snapshot_version` 必須複製來源銷貨單的 `snapshot_version`，不得重新推測或寫死。已存在 print version 的各版本值均不可修改。
- P3.3c 正式中文字型採 **Noto Sans CJK TC Regular**，只能取自官方 Noto Fonts／Noto CJK 發布來源，固定明確 release 或 commit，保存原始檔名、上游版本、SHA-256、SIL Open Font License 與 font manifest，並以受控 server-only asset 載入及嵌入 PDF。
- 正式字型缺少、checksum 不符或 glyph 不足時必須 fail fast。禁止 runtime download、CDN、作業系統字型 fallback、靜默替代或只記錄模糊 family 名稱。

## DEC-060 P4 UI／UX 重整、P5 庫存／生產歸屬與後續階段重編

- P4 正式名稱為「ERP UI／UX 與操作流程重整」。P4 是跨模組的資訊架構、導覽、共用設計系統、頁面模式、錯誤恢復、權限提示與日常操作流程階段，不是單一視覺換色或個別頁面美化。
- P4 必須先完成現況盤點、正式藍圖、App Shell、Design System、主檔、銷售訂單、銷貨單與完整 UX 驗證；P4 完成前不得開始 P5 實作。
- 原規劃為 P4 的庫存、採購、生產、銷售出庫、盤點與成本藍圖正式順延並歸屬 P5「Inventory and Production」。`docs/P5_INVENTORY_PRODUCTION_BLUEPRINT.md` 是 P5 規劃草案；其尚未核准的庫存／生產規則不因重新命名或階段重編而自動成為正式業務決議。
- P5 至少涵蓋倉庫、庫存交易與過帳、原物料入庫、生產領料與退料、成品入庫、庫存調整、銷售出庫及生產流程。P5 開始前必須重新依本文件及當時正式 repository 狀態審查，不得直接建立 schema、migration、API 或 UI。
- DEC-001、DEC-044 及第一階段排除庫存、批號、出庫依賴的規則維持不變。P5 是後續擴充階段，不得回溯改變既有 P1～P3 單據、首次正式列印、實際出貨日、應收條件或 transaction 語意。
- 為避免階段編號碰撞，原正式 roadmap 的應收至切換工作依序順延：應收／正式統一發票／調整為 P6，收款／預收／票據為 P7，月結／快照為 P8，人工應付／付款／支出為 P9，Ragic 移轉／驗收／切換為 P10。這是 roadmap 編號調整，不改變既有業務規則。
- P4 原則上保留既有後端 domain、schema、state machine、RBAC、company scope、transaction、locking、audit、idempotency、正式列印、重印、不可變快照、價格與運費解析契約。
- UI 可依既有契約調整 layout、route presentation、navigation、shared components、CSS、client interaction、顯示用 DTO、清單 query、pagination、sorting、filtering、使用者用語、accessibility 與 error boundary；server authorization 仍是唯一正式授權邊界，UI 隱藏按鈕不得取代後端驗證。
- 若 UX 審查發現必須修改 schema、API domain contract、state machine、RBAC、transaction 或其他正式業務規則，必須建立獨立 domain／API 子任務，先新增明確 decision 並取得核准；不得混入純 UI commit 或以顯示需求隱性修改。
- P4 正式藍圖為 `docs/P4_UI_UX_BLUEPRINT.md`。P4.1 只產出盤點、設計契約、階段與驗收規劃；不開始 P4.2 App Shell、不實作 UI，也不開始 P5。
- P4.2 已於 2026-07-31 完成，closure commit 為 `29e68fff4cbd005443c0d228563a81e36ecf403d`；完成範圍為 authenticated App Shell、navigation、company switcher、user menu、breadcrumb、responsive shell 與 accessibility baseline。下一正式階段為 P4.3 Design System 與共用元件；P5 尚未開始。P4.2 未變更 Prisma schema、migration、RBAC mapping、session model、transaction、audit、idempotency、formal print 或任何 P5 契約。

## 3. 尚未定案且應保留於 OPEN_QUESTIONS.md 的事項

- `OQ-005`：第二階段是否實作正式電子簽收，以及簽收狀態、簽收人、附件、撤銷與例外更正流程如何設計。（不阻塞第一階段）
- `OQ-044`：上線後允許回退至 Ragic 的窗口長度與結束條件。（依 DEC-060 改為 P10 前確認，不阻塞 P1）
- `OQ-045`：附件移轉的表單、日期、狀態與檔案範圍。（依 DEC-060 改為 P10 前確認，不阻塞 P1）

第一階段已依 DEC-019 明確採「銷貨單已回收」的人工確認作為建立應收條件，不實作正式電子簽收。OQ-044 與 OQ-045 僅影響依 DEC-060 重編後的 P10 切換方案；其餘原 V0.2 未決事項 `OQ-042`、`OQ-012`、`OQ-023`、`OQ-037`、`OQ-038` 均已於 V0.3 定案。

## 4. 變更紀錄

- V0.15（2026-07-31，P4.2 完成同步）：記錄 P4.2 closure commit、App Shell 與導覽完成範圍、P4.3 為下一正式階段及 P5 尚未開始；既有 domain、資料庫、安全與列印契約不變。
- V0.14（2026-07-29）：新增 DEC-060，正式將跨模組 UI／UX 與操作流程重整定為 P4，將庫存／生產藍圖順延並歸屬 P5，原 P4～P8 第一階段後續 roadmap 順延為 P6～P10；保留既有後端契約與第一階段庫存排除，domain change 必須獨立核准。
- V0.13（2026-07-28）：新增 DEC-059，固定 `delivery-note-snapshot-v1`、Delivery Note scalar discriminator、正式 PDF 四種獨立版本語意，以及 Noto Sans CJK TC Regular 的來源固定、checksum、授權、server-side embedding 與 fail-fast 契約。
- V0.12（2026-07-28）：完成 P3.3b schema 契約裁定；`delivery_notes` 不新增 `formal_print_version_id` 或循環 FK，唯一正式 PDF 改由 print version 的 `delivery_note_id` unique constraint 保證。本決議只固定 schema 契約，不代表 renderer、首次正式列印／重印 service、API 或 UI 已完成。
- V0.11（2026-07-28）：修訂 DEC-017 並新增 DEC-058，正式化首次正式列印即出貨、P3.3／P3.4 責任切分、不可變 DB PDF、預覽／重印語意、版型版本、權限、作廢／replacement、audit、冪等、併發及 OQ-051 第一版排除；不代表 schema、migration、renderer、API 或 UI 已實作。
- V0.10（2026-07-27）：新增 DEC-057，裁定 P3.2 銷貨單手動建立、revision 保留舊單及原子重建、追加單直接關聯 root 且不聚合、ADMIN 直接作廢、非 `VOIDED` 唯一限制、`delivery_note_date` 與月流水取號、快照、replacement、audit 及 idempotency；P3.2 尚未開始實作。
- V0.9（2026-07-27）：新增 DEC-056，正式化兩家公司法定資訊與單據縮寫、月流水訂單號、未稅金額與 half-up、價格來源及人工理由、修訂版次、聯絡人與付款條件、作廢及確認快照規則，並限定 P3.1 不建立銷貨單。
- V0.8（2026-07-25）：新增 DEC-055，確認送貨地點運費模式、金額精度、decimal-safe 試算、半開期間、全歷程排除重疊、兩組 composite FK、明確日期查詢、FREIGHT_RULE_NOT_FOUND、權限及稽核規則。
- V0.7（2026-07-25）：新增 DEC-054，確認價格表、未稅價格精度、半開期間、全歷程排除重疊、客戶指派 composite FK、effectiveDate 查價、PRICE_NOT_FOUND、權限及稽核規則。
- V0.6（2026-07-25）：新增 DEC-053，確認跨公司品項、正式類型、代碼與條碼 normalization、用途旗標、公司別代碼、可銷售條件、權限、停用及稽核規則。
- V0.5（2026-07-25）：新增 DEC-052，確認跨公司客戶、公司關係、聯絡方式、主要聯絡人、送貨地點、預設地點、權限、停用與稽核規則。
- V0.4（2026-07-25）：新增 DEC-051，確認 `billing_cutoff_day`、短月份、有效版本、權限、audit、idempotency 與初始公司設定。
