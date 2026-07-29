# P4 ERP UI／UX 與操作流程重整藍圖

文件狀態：P4.1 正式規劃基線
決策依據：DEC-060
Git 基線：`ffffc8ce82e497a0b3fd58461c6ae66919271014`
版本：V1.0
版本日期：2026-07-29

## 1. 文件目的

本文件定義 P4 跨模組 UI／UX、資訊架構、共用元件、操作流程、錯誤恢復、權限提示與驗收標準。P4.1 只建立設計與工程藍圖，不實作 App Shell、頁面、API、schema 或 P5。

## 2. 背景

P1～P3.3 已完成技術基礎、Authentication、RBAC、company scope、公司設定、客戶與品項主檔、價格與運費、銷售訂單、銷貨單、正式列印、補印、PDF 下載、audit、idempotency、concurrency 與 lock order。

現有前端可驗證功能，但主要仍是逐切片建立的工程介面。問題跨越資訊架構、導覽、頁面模式、單據明細、狀態動作、關聯導覽、錯誤處理、權限提示與用語，不能以個別換色或局部 CSS 修補完成。

## 3. P3.3 正式基線

- 正式 Git 基線為 `ffffc8ce82e497a0b3fd58461c6ae66919271014`。
- P3.3 首次正式列印、補印與 PDF 下載已完成。
- 既有 Delivery Note frozen snapshot、immutable PDF、formal-print、reprint、idempotency、audit、transaction 與 lock-order 契約均為 P4 保留邊界。
- P4 不回改 P1～P3 的正式結案內容。

## 4. UI／UX 獨立成 P4 的原因

現行介面沒有固定 App Shell，首頁同時承擔導覽、公司切換與管理入口；同類頁面各自實作標題、篩選、清單、錯誤與操作區。使用者需依賴「返回首頁」、開發階段文字及技術代碼理解系統。若先擴充後續模組，這些模式會被複製並放大，因此應先以 P4 建立跨模組契約。

## 5. P5 順延決策

依 DEC-060：

- P4 為 ERP UI／UX 與操作流程重整。
- 原庫存／生產藍圖歸屬 P5「Inventory and Production」。
- P4 完成前不得開始 P5。
- P5 是後續擴充，不推翻第一階段排除庫存、批號與出庫依賴的既有決議。
- 原正式 roadmap 的應收至切換階段順延為 P6～P10。

## 6. 現況系統盤點

### 6.1 Route

現有正式頁面包括：

- `/login`、`/access-denied`、`/`
- `/customers`、`/customers/[id]`
- `/items`、`/items/[id]`
- `/pricing/lookup`、`/freight/quote`
- `/sales-orders`、`/sales-orders/new`、`/sales-orders/[id]`
- `/delivery-notes`、`/delivery-notes/[id]`
- `/admin/users`
- `/admin/company-settings`
- `/admin/customers`、`/admin/customers/[id]`
- `/admin/items`、`/admin/items/[id]`
- `/admin/pricing`、`/admin/pricing/[id]`
- `/admin/freight-rules`、`/admin/freight-rules/[id]`
- `/admin/master-import`、`/admin/master-import/[id]`

### 6.2 Layout 與導覽

- Root layout 只輸出 `children`，沒有固定側邊欄、頂部工具列、麵包屑或全域狀態區。
- 首頁是中央卡片，使用多種顏色按鈕作為功能入口。
- 公司切換只在首頁，其他頁面有些又提供獨立 company query selector，模式不一致。
- 多數頁面以「返回首頁」或「返回清單」作主要導覽。
- 頁首可見 `P1`、`P2.2`、`P3.1` 等開發階段文字。
- 登出只在首頁。

### 6.3 Page patterns

- 查詢頁同時存在正式 `<table>`、grid row 與大型卡片列三種模式。
- 管理清單常把建立表單與清單堆在同一長頁。
- 銷售訂單清單沒有表頭與完整分頁導覽，每列高度大且欄位辨識度低。
- 銷貨單清單已有表頭、Badge、篩選與分頁，是目前較接近正式標準的頁面，但仍缺 App Shell、排序與一致的共用元件。
- 明細頁已有資訊卡、關聯連結與單據表格，但頁首、動作與狀態顯示未共用。
- 銷售訂單編輯器以無表頭 grid 表達明細，欄位意義主要依 placeholder；正式金額摘要只在既有單據顯示。

### 6.4 Shared components

- 沒有正式共用 UI component 目錄或 design token contract。
- Button、Input、Select、Table、Badge、Dialog、Alert、Pagination 與頁首多由各頁直接以 Tailwind class 組合。
- Delivery Note 模組內有局部 `StatusBadge`、`SummaryField`、list/detail view 與 action component，但尚未提升為跨模組契約。
- Global CSS 只有 Tailwind import、背景／前景色與 Arial／Helvetica 字型。

### 6.5 Error、loading 與 empty

- 只有 `/delivery-notes/loading.tsx` 提供 route skeleton。
- 多數 server page 以 catch 後 redirect `/` 或 `/login`，可能把資料錯誤誤判成登入問題。
- Delivery Note API／資料失敗會整頁只顯示大型紅色錯誤卡，系統導覽消失，沒有 Retry、返回、錯誤類型或 correlation ID。
- Empty state 多為「查無資料」文字，缺少原因、清除篩選與適當下一步。
- 沒有共用 `error.tsx`、`not-found.tsx`、403 或 session expired presentation contract。

### 6.6 Permission UI

- Server 已有正式 permission gate；前端依角色或 permission 顯示部分導覽與按鈕。
- 實際 role code 只有 `ADMIN` 與 `ORDER_ENTRY`。
- `MANAGER`、read-only 或其他正式角色目前不存在，不得在 P4 文件中假設已存在。
- 多數無權限情境 redirect 首頁，只有 Delivery Note 明確導向 `/access-denied`。
- UI 隱藏按鈕不取代 server authorization。

## 7. 已確認問題分類

| 類別 | 現況 | P4 目標 |
| --- | --- | --- |
| 資訊架構 | 功能平鋪於首頁 | 依工作模組分組 |
| 導覽 | 返回首頁為主 | 固定側欄、工具列、麵包屑 |
| 一致性 | 各頁自行組 class | Design System 與 page contract |
| 資訊密度 | 卡片列、欄位辨識弱 | 高密度可掃描表格 |
| 表單 | placeholder 代替表頭 | 清楚 label、section、subtable |
| 狀態動作 | 位置與呈現不一致 | 集中 capability action area |
| 錯誤 | 整頁錯誤且不可恢復 | 保留 Shell、Retry、correlation ID |
| 權限 | redirect 與隱藏行為不一致 | 403、disabled reason、server gate |
| 用語 | enum、階段、代碼外露 | 繁體中文業務語彙 |
| 可及性 | 焦點、dialog、鍵盤未統一 | WCAG 基本要求與鍵盤路徑 |

## 8. Ragic 操作基準

P4 保留 Ragic 的作業效率，不逐像素複製：

1. 清單與明細切換直接。
2. 清單資訊密度高。
3. 單號與關聯資料可直接開啟。
4. 明細以完整單據方式呈現。
5. 表單使用清楚區塊。
6. 品項明細是核心子表。
7. 業務動作依狀態集中顯示。
8. 可快速返回原清單與保留查詢條件。
9. 訂單、銷貨單、客戶、品項可互相導覽。
10. 使用者不需理解 UUID、enum 或後端名詞。

不複製 Ragic 的舊式視覺、平台特有動作、過度擁擠欄位或不必要管理功能。

## 9. 使用者角色

### 9.1 `ADMIN`

正式能力依現有 RBAC：

- 可見公司設定、使用者、客戶、品項、價格、運費、匯入、訂單與銷貨單模組。
- 可查詢授權公司資料。
- 可新增／編輯／停用主檔及管理使用者。
- 可新增、編輯、確認、修訂與作廢銷售訂單。
- 可建立／重建銷貨單、首次正式列印、補印與下載。
- 具 `delivery_notes.admin_void` 時可依既有狀態規則例外作廢 `ACTIVE` 銷貨單。
- 所有能力仍受 selected company 與 server authorization 限制。

### 9.2 `ORDER_ENTRY`

- 可見客戶、品項、正式價格、運費、銷售訂單與銷貨單作業。
- 可查詢目前授權公司的可用主檔。
- 可新增、編輯、確認、修訂與作廢銷售訂單。
- 可建立／重建銷貨單、首次正式列印、補印與下載。
- 不可管理主檔、使用者、公司設定或主檔匯入。
- 不可執行 ADMIN direct void。

### 9.3 不存在的角色

目前沒有 `MANAGER`、read-only 或其他正式 role code。P4 不創造新角色；若需要新增，必須另立 RBAC decision 與後端任務。

## 10. 角色權限與畫面差異

| 能力 | ADMIN | ORDER_ENTRY | 無權限 UI |
| --- | --- | --- | --- |
| 主檔查詢 | 是 | 是 | 導覽不顯示；直達顯示 403 |
| 主檔管理 | 是 | 否 | 不顯示新增／編輯；直達顯示 403 |
| 使用者管理 | 是 | 否 | 導覽不顯示；直達顯示 403 |
| 訂單管理 | 是 | 是 | 不顯示模組；直達顯示 403 |
| 建立／重建銷貨單 | 是 | 是 | 動作不顯示或 disabled 並說明 |
| 正式列印／補印 | 是 | 是 | 動作不顯示或 disabled 並說明 |
| 銷貨單例外作廢 | 是，依 capability | 否 | 不顯示；server 仍拒絕 |

頁面不得以 UI 狀態推導正式權限，也不得因為按鈕不可見而省略 API authorization。

## 11. 使用者主要工作流程

### Flow 1：登入與選擇公司

1. 使用者以未預填的帳號與密碼登入。
2. 系統顯示 loading 並防止重複送出。
3. 登入成功後載入預設公司；沒有可用公司時顯示專用狀態。
4. 使用者從頂部工具列切換公司。
5. 切換成功後清除前公司 cache、selection 與敏感頁面資料，重新載入 permission／capability。
6. 可安全保留目前模組；若該 route 在新公司不可用，導向安全首頁並說明。
7. Session expired 時保留安全 return path，重新登入後只返回仍有權限的 route。

### Flow 2：建立銷售訂單

1. 從訂單清單選擇「新增訂單」。
2. 依名稱搜尋客戶，代碼為次要資訊。
3. 依客戶選擇送貨地點與聯絡人。
4. 以有表頭子表搜尋並加入品項。
5. 顯示查價結果；人工價格或標準價覆寫時顯示理由欄與規則。
6. 即時呈現數量、單價、明細金額、小計、運費與未稅總額。
7. 儲存草稿時防重複送出；欄位錯誤定位至欄位與明細列。
8. 成功後返回草稿明細，並提供返回保留篩選條件的清單入口。

### Flow 3：確認訂單

1. 查看草稿與 validation summary。
2. 需要時編輯並儲存。
3. 執行「確認訂單」。
4. Confirmation 說明價格、運費與快照將依既有契約凍結。
5. 成功後狀態與 capability 同時刷新，不保留已失效的編輯控制。

### Flow 4：建立或重建銷貨單

1. 從訂單明細執行。
2. UI 依狀態與 permission 顯示建立或重建 capability。
3. 執行時由 server 完成正式檢查與 transaction。
4. 成功後顯示新銷貨單連結並可直接開啟。
5. 重建時清楚顯示舊單已作廢及 replacement 關聯。
6. 失敗時保留頁面與導覽，提供安全重試；不得由 client 分拆作廢與建立。

### Flow 5：正式列印與補印

1. `ACTIVE` 銷貨單顯示「正式列印並出貨」。
2. Confirmation 說明不可變 PDF、實際出貨日與兩張單據狀態變更。
3. Pending 期間鎖定重複操作，沿用既有 idempotency retry。
4. 成功後刷新為 `SHIPPED`，顯示列印摘要並下載 PDF。
5. PDF 下載失敗只重試 read-only 下載，不重做 mutation。
6. 補印使用獨立 confirmation，成功後更新補印次數並下載同一 PDF。

### Flow 6：主檔管理

1. 從模組清單搜尋、篩選並開啟明細。
2. ADMIN 可新增或編輯。
3. 停用使用明確 confirmation，不使用刪除語彙。
4. ORDER_ENTRY 只看到查詢與明細，不看到管理入口。
5. 返回清單時保留頁碼、篩選與排序。

## 12. 資訊架構

建議一級導覽：

- 首頁／工作台
- 銷售
  - 銷售訂單
  - 銷貨單
- 主檔查詢
  - 客戶
  - 品項
  - 正式價格
  - 運費試算
- 系統管理（ADMIN）
  - 公司設定
  - 客戶主檔
  - 品項主檔
  - 價格管理
  - 運費規則
  - 主檔匯入
  - 使用者與授權

P4 不在導覽中顯示尚未實作的 P5～P10 模組。

## 13. App Shell

Authenticated route 共用：

- 固定左側模組導覽。
- 上方工具列：目前公司、公司切換、使用者選單、登出。
- Main content：麵包屑、頁面標題、描述、狀態與主動作。
- 全域 toast／announcement region。
- 保留 Shell 的 loading、empty、error、403、404 與 session expired 狀態。
- Desktop-first；窄 viewport 時側欄可收合，不遮蔽主動作。

登入頁與需要重新驗證的 session expired 頁不使用完整 authenticated navigation。

## 14. 導覽設計

- 導覽依 permission 產生，但 server 仍驗證每個 route。
- 目前 route 使用清楚 active state。
- 麵包屑顯示模組、清單、單據或主檔名稱。
- 返回清單保留 query string；不以瀏覽器 history 作唯一機制。
- 單號、客戶、品項與 replacement 使用標準連結樣式。
- 公司切換後不得顯示或返回前公司資料。
- 不在正式 UI 顯示 P1、P2、P3、P4 等階段字樣。

## 15. Design principles

1. 人類可讀名稱優先，代碼為次要資訊。
2. 同類頁面使用相同操作位置。
3. 清單頁以快速判斷及查找為主。
4. 明細頁以完整單據及關聯流程為主。
5. 主要動作只能有一個明確 primary action。
6. 危險及不可逆動作使用 confirmation。
7. 狀態、權限及業務能力必須清楚。
8. 不向使用者顯示開發階段。
9. 不暴露 enum、UUID、DB、Prisma 或技術錯誤。
10. 不以顏色作為唯一狀態提示。
11. 桌面操作優先，但合理 viewport 不水平破版。
12. 欄位錯誤靠近欄位。
13. 頁面錯誤可恢復。
14. 切換公司後不殘留前公司資料。
15. 所有 UI 權限仍由 server 驗證。
16. 不因 UI 重整隱性改變 domain 規則。
17. 測試資料長代碼不主導正式顯示。
18. 關聯單據可直接導航。
19. 鍵盤及焦點狀態可辨識。
20. Loading 時防重複操作。

## 16. Design System scope

P4.3 定義並驗證：

- Button、Icon button
- Input、Select、Searchable combobox
- Date input、Textarea
- Checkbox、Radio
- Badge
- Data table、Pagination
- Tabs
- Card、Section header
- Dialog、Confirmation
- Toast、Inline alert
- Inline validation、Error summary
- Form layout
- Skeleton
- Empty state、Error state
- Breadcrumb、Page header
- Description list、Document summary

共用元件需有 variant、size、disabled、pending、focus、error 與 accessibility contract；不得只把任意 Tailwind 字串包一層。

## 17. 清單頁標準

- Page header：標題、說明、目前公司、唯一 primary action。
- Filter bar：搜尋、狀態、日期與必要欄位；支援清除篩選。
- 高密度 table：清楚欄名、適當對齊、row hover、可點單號。
- Status Badge 同時有文字、形狀／圖示與色彩。
- 排序只使用 API 已支援或另立明確 query 子任務的欄位。
- 分頁顯示總筆數、目前頁、總頁數、上一頁／下一頁與必要 page size。
- Loading 使用表格 skeleton；empty 分成無資料與篩選無結果；error 保留 Shell。
- Responsive 時優先保留單號、名稱、狀態與主動作；次要欄位可收合，不任意截掉關鍵資訊。

### 17.1 銷售訂單候選欄位

- 訂單號
- 訂單日期
- 客戶
- 送貨地點
- 狀態
- 未稅總額
- 關聯銷貨單號
- 建立人
- 更新時間

實際欄位必須依既有 API／schema 驗證；不得為了 UI 文件自行新增 domain 欄位。

## 18. 明細頁標準

- 頁首顯示單號／名稱、狀態、主要日期與集中動作。
- 摘要區呈現公司、客戶、建立者、金額、版次等關鍵資訊。
- 以 section 分隔送貨、聯絡、付款、列印與作廢資訊。
- 關聯單據是可辨識連結。
- 狀態歷程與作廢原因使用專用區塊。
- 唯讀明細不直接顯示 raw JSON；技術快照只可在明確授權的診斷介面呈現。
- 返回清單保留原 query context。

## 19. 編輯表單標準

- 依單頭、客戶／送貨、付款條件、明細、金額摘要分區。
- Label 永遠可見，不以 placeholder 取代。
- 必填、選填、格式與 helper text 有一致呈現。
- 名稱優先，代碼以次要文字顯示。
- Primary action 固定於一致位置；長表單可使用 sticky action bar。
- 取消、儲存草稿、確認等動作層級一致。
- Submit 時保留使用者輸入；錯誤 summary 可跳至第一個錯誤欄位。

## 20. 單據明細子表標準

- 有固定欄名：項次、品項、規格、單位、數量、單價、金額、人工價格理由、列動作。
- 品項使用 searchable combobox，不以超長原生 select 作唯一方式。
- 數量、單價、金額右對齊並使用一致格式。
- 人工價格理由只在既有規則要求時出現，且就近驗證。
- 新增／移除列可鍵盤操作；移除須清楚但不誤作交易 hard delete。
- 小計、運費、未稅總額在子表下方固定摘要。

## 21. 狀態及業務動作標準

- Server 回傳或既有 domain service 決定 capability；UI 不自行創造狀態轉換。
- 頁首動作區最多一個 primary action；次要、危險動作分級。
- Disabled 動作如有必要保留，必須說明原因；否則隱藏。
- 確認、修訂、建立／重建銷貨單、正式列印、補印與作廢沿用既有 transaction／idempotency。
- 狀態使用繁體中文，不直接顯示 `DELIVERY_CREATED`、`SHIPPED` 等 enum。

## 22. 關聯資料導覽

- 訂單明細直接連到目前及歷史銷貨單。
- 銷貨單直接連到來源訂單及 replacement 前後單。
- 客戶與品項名稱在適當情境可連到明細。
- 關聯連結必須保持 company scope，不攜帶可繞過 session selected company 的信任資訊。
- 目標不存在或跨公司時使用安全 not found，不洩漏資料存在性。

## 23. Search／filter／sort／pagination

- Query state 以 URL 表達，允許重新整理、分享及返回。
- 公司由 session selected company 決定；P4 應逐步移除各頁可任意傳入的可信 `companyId` presentation。
- 搜尋輸入需有 label、clear 與 submit 行為。
- 日期範圍需顯示起訖語意與錯誤。
- Sort 使用明確白名單，不接受任意欄名。
- Filter、sort、pagination 變更後重設或校正 page。
- 清單 API 缺少必要參數時，另立 API presentation 子任務，不混入 domain change。

## 24. Loading

- Route transition 保留 App Shell。
- 清單使用與實際欄位一致的 skeleton rows。
- 表單 submit 使用 pending、busy guard 與 `aria-busy`。
- Loading 不移動 primary action 位置。
- 寫入結果未知時不得誤報失敗或自行產生新 idempotency key 重做。

## 25. Empty state

- 「尚無資料」：說明此公司尚未建立資料，依權限提供 primary action。
- 「篩選無結果」：顯示目前條件並提供清除篩選。
- 「無可用關聯資料」：例如客戶無送貨地點，提供具體解決方向。
- Empty state 不顯示技術代碼。

## 26. 共用 Error state

- 保留 App Shell、頁面標題與目前公司。
- 顯示可理解標題、簡短原因、Retry、返回安全頁。
- 顯示 correlation ID 供支援追蹤，不顯示 stack、SQL、Prisma 或檔案路徑。
- 依類型區分 validation、authentication、authorization、not found、conflict、invariant 與 server error。
- Retry 只重做安全 query；mutation retry 必須沿用既有 idempotency session。

## 27. 權限不足

- 已登入但缺 permission 顯示 403 專用狀態，不 redirect 首頁造成混淆。
- 說明「沒有執行此操作的權限」，可返回模組安全頁。
- 不列出使用者不該知道的角色、其他公司或資料內容。
- 導覽依 permission 隱藏不可用模組，但直達 route 仍由 server 拒絕。

## 28. Session expired

- 與一般 500、403 分開。
- 顯示「登入已逾時」，提供重新登入。
- 不顯示前公司敏感資料。
- Return path 必須是站內相對路徑並在重新登入後重新驗證 permission／company scope。
- 未送出的敏感表單不保證跨 session 保存；P4.2／P4.3 應明確定義。

## 29. API 錯誤

- Client 使用集中 error adapter 將安全 error code 對應繁體中文。
- 已有 server message 仍需防止技術資訊外露。
- Field errors 對應欄位；row errors 對應明細列；page errors 使用共用 Error state。
- 409 狀態衝突先 refresh capability，再提示下一步。
- 下載失敗與正式列印／補印 mutation 結果分開處理。

## 30. Confirmation

- 使用可聚焦、可關閉、具標題與描述的正式 dialog，不使用 `window.prompt` 或 `window.confirm`。
- 明確說明影響對象、不可逆性與是否保留歷程。
- 危險按鈕使用業務動詞，例如「確認作廢」，不只寫「確認」。
- 打開時 focus 進入 dialog；關閉後回到觸發按鈕；Escape 行為依風險定義。
- Pending 時不得重複提交或關閉成不明狀態。

## 31. Toast 及 inline validation

- Toast 用於非阻塞成功或跨頁完成訊息；重要錯誤不得只靠短暫 toast。
- `role=status` 用於成功／進度，`role=alert` 用於需立即注意的錯誤。
- Field error 與 input 以 `aria-describedby` 關聯。
- Error summary 列出可跳轉欄位；提交後 focus 移至 summary 或第一錯誤。
- 成功後不清除使用者仍需核對的上下文。

## 32. Responsive 策略

- 正式桌面基準建議 1280px；最小支援 viewport 於 P4.2 實測後固定，初始候選為 1024px。
- 1024px 以上保持側欄與核心資料表可操作。
- 768～1023px 側欄可收合，清單保留核心欄位並允許受控水平捲動。
- 小於 768px 支援登入、查詢、明細與緊急核對；複雜單據編輯可提示使用桌面，但不得破版或使資料不可讀。
- 不以無限縮小字體解決資訊密度。

## 33. Accessibility 基本要求

- Semantic landmark、heading 次序與 table header 正確。
- 所有操作可使用鍵盤完成。
- Focus indicator 清楚且不被 sticky 元件遮蔽。
- 文字與控制項符合 WCAG AA 對比候選標準。
- 狀態不只依顏色。
- Dialog 有 accessible name、focus trap 與 focus return。
- 表單有 label、錯誤關聯與必要說明。
- Dynamic loading、結果與錯誤使用適當 live region。
- Icon-only button 必須有 accessible name。

## 34. 技術邊界

P4 可在獨立切片中調整：

- layout、route presentation、navigation
- shared components、CSS、design tokens
- client interaction
- DTO presentation fields
- list query parameters、pagination、sorting、filtering
- 使用者用語、accessibility、error boundary

P4 不得隱性修改：

- schema、migration
- state machine
- idempotency、audit、transaction、locking
- formal-print、reprint、immutable snapshot
- price resolution、freight resolution
- company scope、RBAC

## 35. 後端契約保留原則

- 既有 service 是正式業務能力來源；頁面不直接組合跨表 mutation。
- 既有 API／DTO 如足以支援設計，P4 只改 presentation。
- 清單所需建立者、更新時間或關聯單號若既有 contract 不提供，先盤點資料來源、效能與安全，再建立明確 API presentation 子任務。
- 不因視覺需要重新計算凍結金額、快照或狀態。
- Client 不得信任自身 permission 或 company selection。

## 36. Domain change 升級規則

1. 記錄 UX 需求與現有契約缺口。
2. 判斷是 presentation、query contract 或真正 domain change。
3. 若涉及正式規則，先查 DECISIONS。
4. DECISIONS 無答案時才新增 Open Question。
5. 取得決議後，建立獨立 domain／API 任務、migration 計畫與測試。
6. 不把 domain change 混入純 UI commit。

## 37. P4 子階段

### P4.1 現況盤點與 UX 藍圖

- 完成本文件、DEC-060、roadmap 重編、P5 handoff 與 validation。
- 不實作 UI。

### P4.2 App Shell 與導覽

- 固定側欄、頂部工具列、公司切換、使用者選單、登出。
- 麵包屑、頁面標題、permission navigation、responsive shell。
- 共用 loading／empty／error、404／403／session expired。

### P4.3 Design System 與共用元件

- 建立本文件第 16 節元件及 design token contract。
- 與 P4.2 規格分開；是否合併工程切片需依風險另案決定。

### P4.4 主檔 UI 重整

- 公司設定、客戶、聯絡人、送貨地點、品項、價格表、使用者、角色與權限。
- 品項分類與單位只處理實際已存在的功能；不得因頁面清單自行創造未實作 domain。

### P4.5 銷售訂單 UI 重整

- 清單、搜尋、篩選、排序、分頁、新增、編輯、明細、金額摘要、狀態動作、關聯銷貨單、confirmation 與權限差異。

### P4.6 銷貨單與列印 UI 重整

- 清單、明細、建立／重建入口、正式列印、下載、補印、例外作廢、列印資訊、錯誤恢復與權限差異。

### P4.7 完整 UX 驗證與結案

- 依主要流程、角色、公司切換、錯誤、鍵盤與 viewport 完成驗收。

## 38. 各子階段驗收條件

| 子階段 | 驗收條件 |
| --- | --- |
| P4.1 | 正式 decision、藍圖、roadmap、P5 handoff、一致性搜尋與純文件驗證完成 |
| P4.2 | Authenticated routes 共用 Shell；公司切換無資料殘留；403／404／session expired／error 可恢復 |
| P4.3 | 共用元件具 interaction、a11y、visual states 與測試；頁面不再複製核心 class contract |
| P4.4 | ADMIN／ORDER_ENTRY 主檔流程、空狀態、停用與返回清單一致 |
| P4.5 | 訂單從清單至確認／修訂／建立銷貨單完整；長資料與欄位錯誤可操作 |
| P4.6 | 銷貨單建立／重建、正式列印、下載、補印與作廢依 capability 正確且錯誤可恢復 |
| P4.7 | 角色、公司、session、API failure、keyboard、desktop 與 minimum viewport 全部通過 |

## 39. 測試策略

- Component／unit：元件 variants、keyboard、focus、validation、capability presentation。
- Route／integration：登入、公司切換、permission、query state、loading／empty／error。
- API contract：只針對 P4 明確新增的 presentation contract，驗證安全序列化與 company scope。
- Workflow：建立客戶、建立品項、設定價格、訂單草稿、確認、銷貨單、正式列印、下載、補印、作廢。
- Accessibility：自動檢查加人工鍵盤／焦點／screen reader spot check。
- Visual：支援 viewport、長名稱、長代碼、空資料、多頁明細與錯誤狀態。
- Regression：既有 domain、transaction、idempotency、concurrency、正式列印與 PDF hash 測試維持通過。

P4.1 是純文件階段，不執行 unit、DB 或 build；實作切片仍依 AGENTS.md 完成 lint、typecheck、unit、必要 DB test 與 build。

## 40. 禁止事項

P4.1 不得：

- 修改 production code、tests、schema、migration、package 或 lockfile。
- 實作 App Shell、共用元件、mock 頁面或 design library。
- 修改 API、DTO、RBAC、state machine、正式列印或 P5 規則。
- stage、commit 或 push。

整個 P4 不得以 UI commit 隱性改變正式 domain。

## 41. Known limitations

- 現有正式角色只有 `ADMIN`、`ORDER_ENTRY`；沒有 Manager 或 read-only。
- 現有部分清單 API 尚未提供排序或候選欄位，需在各切片先確認。
- 現有頁面把部分 query 的 `companyId` 放在 URL，P4.2 必須在不改 company scope 語意下統一。
- 現有銷售訂單 raw snapshot details 不適合作為正式使用者介面。
- 最小 viewport、正式品牌名稱與是否保存未送出草稿需在 P4.2／P4.3 規格審查固定；這些不阻塞 P4.1。
- P4 不處理尚未實作的應收、庫存、生產或後續模組頁面。

## 42. P5 handoff

- P5 文件為 `docs/P5_INVENTORY_PRODUCTION_BLUEPRINT.md`。
- P5 在 P4 完成前不得實作。
- P5 開始前重新審查 DECISIONS、business rules、當時 schema、P4 結案與所有未決庫存／生產事項。
- P5 不得直接採用草案中的倉庫、批號、負庫存、成本、分次領料或銷售出庫規則。
- P4 只提供可供未來模組使用的 App Shell、Design System 與 page contract，不為 P5 預先建立 domain UI。

## 43. P4.1 完成條件

- DEC-060 已記錄 P4／P5 與後續 roadmap 重編。
- 現況 route、layout、navigation、page pattern、shared component、error、loading、empty 與 permission UI 已盤點。
- 角色、六個主要流程、資訊架構、設計原則與共用契約已定義。
- P4.2～P4.7 範圍及驗收條件已定義。
- Inventory blueprint 已安全歸屬 P5，未重寫業務內容。
- 只有核准文件差異，未開始 P4.2 或 P5。
