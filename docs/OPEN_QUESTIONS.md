# Ragic 本地端系統待確認事項

文件狀態：未決事項清單  
版本：V0.17
版本日期：2026-08-01

## 1. 使用方式

- 本文件只保留尚未決定、暫緩或仍需討論的問題。
- 已確認事項記錄於 `DECISIONS.md`，不得再列為 Open Question。
- 若本文件與 `DECISIONS.md` 衝突，以 `DECISIONS.md` 為準。
- 未取得決議前，不得建立依賴該事項的不可逆 migration。
- 資料 mapping、匯入程式與核對報表屬於已定移轉策略下的執行工作，不再視為業務未決事項。

## 2. 尚未決議事項

P3.1 的公司法定資訊、單據公司縮寫、訂單號、未稅金額、人工價格理由、修訂、聯絡人、付款條件及作廢規則已由 DEC-056 決議，不再列為 Open Question。

| ID | 等級 | 狀態 | 問題 | 第一階段正式決議 | 後續需要決定 |
| --- | --- | --- | --- | --- | --- |
| OQ-005 | 中 | 第二階段暫緩 | 是否實作正式電子簽收，以及如何操作？ | 依 DEC-019，以「銷貨單已回收」的人工確認作為建立應收條件；第一階段不實作正式電子簽收。 | 第二階段再決定是否實作，以及簽收狀態、簽收日期、簽收人、附件、撤銷及例外更正流程。 |
| OQ-044 | 中 | P10 前確認 | 上線後允許回退至 Ragic 的窗口為多久，何時結束？ | 不影響 P1；切換前不得刪除 Ragic 來源或建立依賴未決窗口的不可逆操作。 | P10 確認窗口長度、啟動條件、結束條件、回退決策人及窗口內資料處理方式。 |
| OQ-045 | 中 | P10 前確認 | 哪些附件需要移轉至新系統？ | 不影響 P1；附件 metadata 與連結模型照正式設計建置，實際移轉範圍延後確認。 | P10 確認表單、日期、狀態、檔案類型、大小、失敗處理及核對範圍。 |
| OQ-053 | 中 | 部分未決；P4.4 前確認 | 一般業務頁與跨公司管理的 company context 如何遷移？ | 依 DEC-061，一般業務頁只使用 active company；`SYSTEM_ADMIN` 跨公司治理必須使用獨立且明確標示的「管理公司」scope。P4.3d 證實 Customers／Admin Items 仍有 local `companyId` selector，已原樣保留，未修改 route、session 或 authorization。 | 確認 canonical redirect、safe filter preservation、URL `companyId` 例外及各 route 於 P4.4～P4.6 的遷移細節。 |
| OQ-054 | 中 | 部分未決；P4.4 前確認 | `PageHeader`／`PageContainer` 的完整 route 遷移如何執行？ | P4.3d 已實作 `standard`／`wide`／`full`、legacy `default`／`narrow` mapping、App Shell 單一 container 與四組代表頁；已遷移頁不使用 page-local outer max-width。 | 確認 P4.4～P4.6 完整 route 順序、legacy layout 例外及過渡相容移除時機。 |

## 3. 不阻塞第一階段的控制方式

- 建立應收前，管理員必須人工確認「銷貨單已回收」。
- 第一階段在銷貨單保留 `returned_confirmed`、`returned_confirmed_at`、`returned_confirmed_by` 等欄位，或以等效欄位記錄人工確認。
- 上述控制是 DEC-019 的第一階段正式條件，不是暫行未決規則，也不等同正式電子簽收。
- 後續導入正式簽收功能時，不得覆蓋既有人工確認歷程。
- OQ-044 與 OQ-045 僅為 P10 切換執行條件，不阻塞 P1 的架構、資料模型與開發基線。
- OQ-046～OQ-050 已由 DEC-057 決議，不再是 Open Question。

## 4. 已移至 DECISIONS.md

- `OQ-052`：依 DEC-061，未來採 `SYSTEM_ADMIN`／`COMPANY_ADMIN` 雙層治理；前者負責平台及跨公司治理，後者只管理授權公司，公司級操作同時通過 permission 與 company scope。現有後端仍使用 `ADMIN`／`ORDER_ENTRY`，實際 role mapping、migration 與 authorization implementation 另案處理。
- `OQ-042`：產品與原物料共用單一品項主檔，以品項類型及功能欄位區分。
- `OQ-012`：缺價時可人工輸入成交價；正式價格表只能經管理員確認後新增或更新。
- `OQ-023`：應收與應付票據共用票據主表，分配關聯表分開。
- `OQ-037`：主檔與交易資料採部分匯入、部分人工整理。
- `OQ-038`：未結帳款採匯入與人工輸入並行的混合方式。
- `OQ-046`：依 DEC-057，初次銷貨單由使用者在 `CONFIRMED` 訂單上明確建立；成功後 order→`DELIVERY_CREATED`，失敗時維持 `CONFIRMED`。
- `OQ-047`：依 DEC-057，revision start 不作廢舊 `ACTIVE` 單；新 revision 重新確認後，以單一 rebuild transaction 原子置換，失敗時舊單仍 `ACTIVE`。
- `OQ-048`：依 DEC-057，維持 DEC-013；每張追加訂單直接關聯 root original order、各自建立只含自身內容的銷貨單，不形成 chain 或 aggregate。
- `OQ-049`：依 DEC-057，ADMIN 只能直接作廢 `ACTIVE` 單，理由必填；同一 transaction 將 order `DELIVERY_CREATED -> CONFIRMED`，不自動重建。
- `OQ-050`：依 DEC-057，銷貨單號為 `DN-{document_company_code}-{YYYYMM}-{sequence6}`、document type=`DELIVERY_NOTE`；年月與公司縮寫版本依 server `Asia/Taipei` `delivery_note_date`。
- `OQ-051`：依 DEC-058，P3.3 第一版不納入備註、預計送貨日、客戶採購單號或外部參考號，不建立 placeholder schema；未來如需加入，另立決議及 migration。

## 5. 變更紀錄

- V0.17（2026-08-01，P4.4 preflight）：Master Plan已固定route順序、adoption matrix與保守company-context裁量；OQ-053／054仍維持部分未決，逐route只有在證明query/filter/pagination/redirect/permission/API target不變時才移除local selector，否則保留並記錄validation，不修改session或authorization。
- V0.16（2026-08-01）：P4.3e closure確認OQ-053的local company selector與OQ-054的其餘route／legacy layout工作仍須於P4.4前決定；兩題維持部分未決，未因Design System完成而關閉或擴張治理決策。
- V0.15（2026-08-01）：依 P4.3d 實作證據更新 OQ-053／054；確認 local company selector仍需 P4.4 route遷移，並記錄 formal page contract與四組代表頁已落地，兩題均未關閉或擴張治理決策。
- V0.14（2026-08-01）：依 DEC-061 關閉 OQ-052；OQ-053 固定 active company／「管理公司」雙 context 邊界並只保留 route 細節；OQ-054 固定 P4.3d 代表頁及 P4.4～P4.6 全面遷移邊界並只保留順序與例外。
- V0.13（2026-07-31）：中立新增 OQ-052～OQ-054，分別記錄 ADMIN 管理邊界、頁面 company context 與 PageHeader／PageContainer 遷移 convention；未預設答案或修改既有 RBAC、session、API 與頁面。
- V0.12（2026-07-29）：依 DEC-060 將 OQ-044、OQ-045 的切換確認階段由 P8 同步調整為 P10；未新增或重開任何業務未決事項。
- V0.11（2026-07-28）：OQ-051 依 DEC-058 完成 P3.3 第一版裁定並移至正式決議；目前只保留 OQ-005、OQ-044、OQ-045。
- V0.10（2026-07-27）：OQ-046～OQ-050 依 DEC-057 關閉並保留 resolution history；OQ-051 延後至 P3.3／P3.4。
