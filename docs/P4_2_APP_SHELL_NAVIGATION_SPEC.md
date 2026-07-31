# P4.2 App Shell 與導覽規格

文件狀態：依 `91820000a8c3d7cd71eca2804d3729ae0b1cab7c` 完成 P4.2 實作與驗證，待 Git 收尾
決策依據：`DECISIONS.md` V0.14，尤其 DEC-060
適用 Git 基線：`91820000a8c3d7cd71eca2804d3729ae0b1cab7c`
版本：V1.2
版本日期：2026-07-31

## 1. Scope

本文件固定 P4.2 的 authenticated App Shell、導覽、公司區域、使用者選單、breadcrumb、page header、responsive shell、共用狀態及 server／client 邊界。

P4.2 後續實作可以：

- 建立不改變 URL 的 authenticated route group layout。
- 建立固定側欄、頂部工具列、main content、skip link 與 announcement region。
- 建立 server-authorization-aware navigation、active state、公司切換入口、使用者選單及登出入口。
- 建立集中 route metadata、breadcrumb mapping、page container 及 page header。
- 建立 Shell 層 loading、empty、error、403、404、無公司及 session expired presentation。
- 將現有頁面包入一致框架，移除與 Shell 重複或互相矛盾的返回首頁、公司選擇及開發階段文字。
- 保留現有業務頁內容、service、API、domain、transaction 及 server authorization。

P4.2 不重構客戶、品項、價格、運費、銷售訂單或銷貨單的完整內容模式。Button、Table、Dialog、Toast 等完整 Design System 屬於 P4.3；P4.2 只建立 Shell 必要的最小 presentation primitives。

## 2. Current-state inventory

本節及第 3、4 節已在 2026-07-31 重新由目前 HEAD 的 page、layout、API、session helper、service authorization 與 client component 驗證；不是沿用前次未追蹤草稿的未驗證結論。

### 2.1 Layout

- `web/src/app/layout.tsx` 是唯一 layout，只輸出 metadata、global CSS 與 `children`。
- 不存在 route group layout、authenticated layout、middleware、global `error.tsx` 或 `not-found.tsx`。
- `/login`、`/access-denied` 與所有 authenticated pages 目前共用同一個無狀態 root layout。
- 各 authenticated page 自行呼叫 `getPageRequestContext()`，自行處理 redirect，沒有單一 auth guard。

### 2.2 Navigation

- 首頁以卡片及多色連結平鋪所有功能。
- 沒有固定 sidebar、top navigation、breadcrumb、user menu 或全域登出入口。
- 多數清單頁提供「返回首頁」；明細、建立頁提供「返回清單」。
- 登出與 session company switch 只存在首頁。
- 正式畫面仍出現 `P1`、`P2.2`、`P2.3`、`P2.4`、`P2.5`、`P2.6`、`P3.1`、`P3.2` 等開發階段文字。

### 2.3 Company presentation

- 首頁以 session 的 `selectedCompany` 顯示目前公司；多家公司時 POST `/api/auth/company`，成功後固定 redirect `/`。
- 客戶、品項、價格、運費及多數管理頁另接受 `companyId` query，並以頁面內 select 切換查詢公司。
- 上述 query 仍由 service 驗證公司授權，不會繞過 server scope；但不會更新 session `selectedCompany`。
- 因此目前可能同時出現「session selected company」與「頁面 query company」兩個 presentation context。P4.2 必須消除這個顯示歧義。

### 2.4 Shared UI

- 不存在 `web/src/components` 或正式跨模組 UI component 目錄。
- Button、input、select、card、table、pagination、alert 與 page header 都由頁面直接組合 Tailwind class。
- `delivery-notes/delivery-note-view.tsx` 有模組內 `StatusBadge`、`SummaryField`、list/detail view。
- `delivery-notes/[id]/delivery-note-actions.tsx` 有局部 `role="dialog"`，但沒有完整 overlay、focus trap、Escape、outside click 或 focus return contract。
- 多個管理 client 仍使用 `window.confirm`，銷售訂單仍使用 `window.prompt`；這些屬 P4.3／後續模組重構，不在 P4.2 全面改寫。
- 只有 `delivery-notes/loading.tsx` 有 route loading skeleton。
- Global CSS 只有 Tailwind import、背景／前景色與 Arial／Helvetica。

### 2.5 Authentication and session

- Repository沒有middleware。每個protected page或API分別呼叫`getPageRequestContext()`／`getApiRequestContext()`；兩者都要求有效session及非null selected company。
- Cookie為`ragic_session`，HttpOnly、SameSite=Lax、path `/`、production Secure；server只以token hash查詢session。
- Session idle expiry為8小時。逾時、撤銷或inactive user會拋`SessionAuthenticationError`；逾時／inactive session會transactionally revoke並寫audit。
- 現有pages對auth error的redirect不一致，且多數broad catch混合authentication、authorization、not found與data failure。
- Login POST成功固定303 redirect `/`；沒有`returnTo`或deep-link return path。Logout POST撤銷session、寫audit、清cookie並303 redirect `/login`。
- Context只提供`userId`、`username`、role codes、authorized companies、selected company、session id及request id；沒有display name或email。
- `chooseSelectedCompany()`依有效current、default、第一家授權公司排序；沒有授權公司時為null，protected context因而拋`CompanyAccessError`。

## 3. Route inventory

表中「返回」只描述現況；所有 authenticated routes 現況均無 breadcrumb、固定導覽、全域 user menu，且除首頁外均無登出。

| URL | 現況標題 | 現況返回 | 現況公司呈現 | 正式 route gate | 現況 responsive 特徵 |
| --- | --- | --- | --- | --- | --- |
| `/login` | 登入 | 無 | 無 | Public | 單欄 `max-w-md` |
| `/access-denied` | 尚未取得公司權限 | 無；可登出 | 無 | 無 page guard | 單卡置中 |
| `/` | Ragic 本地端系統 | 不適用 | selected company；多公司可切換 | Authenticated + selected company | 單卡、按鈕換行 |
| `/customers` | 客戶查詢 | 返回首頁 | page-local company select | `customers.read`（service） | 四欄 filter 轉單欄；table 無受控橫向捲動 |
| `/customers/[id]` | 動態客戶名稱 | 返回清單 | query company 的客戶代碼 | `customers.read`（service） | 摘要三欄、卡片兩欄後堆疊 |
| `/items` | 可銷售品項查詢 | 返回首頁 | page-local company select | `items.read`（service） | filter 堆疊；table 無受控橫向捲動 |
| `/items/[id]` | 動態品項名稱 | 返回清單 | query company 的品項代碼 | `items.read`（service） | 摘要兩欄後堆疊 |
| `/pricing/lookup` | 正式價格查詢 | 返回首頁 | page-local company select | `customers.read` + `items.read` + `pricing.read`（三個 query service） | 四欄 filter 後堆疊 |
| `/freight/quote` | 運費試算 | 返回首頁 | page-local company select | `customers.read` + `freight.read`（service） | 兩欄 form 後堆疊 |
| `/sales-orders` | 銷售訂單 | 返回首頁 | selected company 文字 | `sales_orders.read`（service） | list row 由五欄轉堆疊；無完整分頁控制 |
| `/sales-orders/new` | 建立銷售訂單草稿 | 返回清單 | 未顯示 | `sales_orders.manage`（page） | editor grid 依既有 client class 重排 |
| `/sales-orders/[id]` | 銷售訂單明細 | 返回清單 | 未顯示 | `sales_orders.read`（page/service）+ `delivery_notes.read`（關聯單據 query）；動作另依 manage capability | editor 及 action 區局部換行 |
| `/delivery-notes` | 銷貨單清單 | 返回首頁；前往銷售訂單 | selected company 文字 | `delivery_notes.read`（page） | 表頭只在 `lg` 顯示，row 於窄寬堆疊 |
| `/delivery-notes/[id]` | 動態銷貨單號 | 返回清單 | 凍結公司名稱 | `delivery_notes.read`（page）；列印依 manage；作廢依 admin_void | 摘要與 action 換行；明細 table 受控橫向捲動 |
| `/admin/users` | 使用者管理 | 返回首頁 | 可管理所有 active company scopes | 現有 `ADMIN` page/API gate；`admin.users.*` constants 未作為 route gate | form grid 堆疊；使用者卡片換行 |
| `/admin/company-settings` | 公司參數管理 | 返回首頁 | page-local company select | 現有 `ADMIN` service gate；沒有專用 permission | client form 依 grid 堆疊 |
| `/admin/customers` | 客戶主檔管理 | 返回首頁 | page-local company select | `ADMIN` page gate；write service 亦為 `ADMIN`，不是 `customers.manage` gate | filter 堆疊；create form 與卡片清單 |
| `/admin/customers/[id]` | 動態客戶名稱 | 返回清單 | query company | `ADMIN` page gate；write service 亦為 `ADMIN` | manager sections 依 client grid 堆疊 |
| `/admin/items` | 品項主檔管理 | 返回首頁 | page-local company select | `ADMIN` page gate；write service 亦為 `ADMIN`，不是 `items.manage` gate | filter 堆疊；create form 與卡片清單 |
| `/admin/items/[id]` | 動態品項名稱 | 返回清單 | query company | `ADMIN` page gate；write service 亦為 `ADMIN` | manager sections 依 client grid 堆疊 |
| `/admin/pricing` | 正式價格管理 | 返回首頁 | page-local company select | `ADMIN` page/service gate；不是 `pricing.manage` gate | filter 堆疊；卡片列 |
| `/admin/pricing/[id]` | 動態價格表名稱 | 返回清單 | query company | `ADMIN` page/service gate | manager form 依 client grid 堆疊 |
| `/admin/freight-rules` | 運費規則管理 | 返回首頁 | page-local company select | `ADMIN` page/service gate；不是 `freight.manage` gate | filter 堆疊；卡片列 |
| `/admin/freight-rules/[id]` | 動態客戶／地點 | 返回清單 | query company | `ADMIN` page/service gate | 單欄 editor；header 未統一換行 |
| `/admin/master-import` | 主檔匯入管理 | 返回首頁 | page-local company select | `ADMIN` page/service gate；`master_import.*` constants 未作為 service gate | table 有受控橫向捲動 |
| `/admin/master-import/[id]` | 動態 entity type | 返回匯入管理 | query company | page 透過 `getMigrationBatch()` 執行 `ADMIN` service gate | 摘要 grid；tables 有受控橫向捲動 |

現有 repository 沒有公司設定以外的其他管理 page，也沒有 P5 庫存、生產、採購 route。P4.2 navigation 不得建立未存在的 route。

### 3.1 Current loading, empty and error evidence

| Route family | Loading | Empty | Error／redirect |
| --- | --- | --- | --- |
| `/`、`/login`、`/access-denied` | 無專用loading | 無 | Home broad catch依company error到`/access-denied`，其他到`/login`；login只有泛化error |
| Customers／items list | 無route loading | page-local「查無」文字 | broad catch redirect `/` |
| Customers／items detail | 無route loading | contacts／locations有局部empty | broad catch redirect各自list |
| Pricing／freight | 無route loading | 無統一empty | pricing有`PRICE_NOT_FOUND` inline；freight顯示raw error code；其他錯誤可能redirect或落入framework error |
| Sales orders | 無route loading | list有「查無訂單」 | list／new多redirect`/login`；detail broad catch redirect list |
| Delivery notes | 唯一`delivery-notes/loading.tsx` skeleton | list有module-local empty | auth／permission分流部分存在；filter及query failure使用整頁紅色card；detail not found呼叫framework`notFound()`但無自訂file |
| ADMIN lists／details | 無route loading | 多數list有page-local「查無資料」 | 多為broad catch redirect `/`或module list |
| Master import detail | 無route loading | issue／mapping局部empty | broad catch redirect `/` |

Repository沒有global或route-level `error.tsx`、自訂`not-found.tsx`、toast、通用empty/error component或統一correlation ID presentation。

## 4. Permission matrix

### 4.1 正式角色

正式 role code 只有：

- `ADMIN`
- `ORDER_ENTRY`

不得建立或在 UI 假設 `MANAGER`、read-only 或其他角色。

### 4.2 Navigation visibility

| Navigation item | Route | Group | Required authorization | Active rule | Icon required | ORDER_ENTRY | ADMIN |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 作業首頁 | `/` | 作業首頁 | authenticated + selected company | exact `/` | 否 | 顯示 | 顯示 |
| 銷售訂單 | `/sales-orders` | 銷售作業 | `sales_orders.read` | `/sales-orders` prefix | 否 | 顯示 | 顯示 |
| 銷貨單 | `/delivery-notes` | 銷售作業 | `delivery_notes.read` | `/delivery-notes` prefix | 否 | 顯示 | 顯示 |
| 客戶 | `/customers` | 主檔查詢 | `customers.read` | `/customers` prefix，排除 `/admin` | 否 | 顯示 | 顯示 |
| 品項 | `/items` | 主檔查詢 | `items.read` | `/items` prefix，排除 `/admin` | 否 | 顯示 | 顯示 |
| 正式價格 | `/pricing/lookup` | 主檔查詢 | all-of `customers.read`, `items.read`, `pricing.read` | `/pricing` prefix | 否 | 顯示 | 顯示 |
| 運費試算 | `/freight/quote` | 主檔查詢 | all-of `customers.read`, `freight.read` | `/freight` prefix | 否 | 顯示 | 顯示 |
| 公司設定 | `/admin/company-settings` | 系統管理 | 現有 server contract 為 `ADMIN` role | exact prefix | 否 | 隱藏 | 顯示 |
| 客戶主檔 | `/admin/customers` | 系統管理 | `ADMIN` role（page/write service gate） | prefix | 否 | 隱藏 | 顯示 |
| 品項主檔 | `/admin/items` | 系統管理 | `ADMIN` role（page/write service gate） | prefix | 否 | 隱藏 | 顯示 |
| 價格管理 | `/admin/pricing` | 系統管理 | `ADMIN` role（page/write service gate） | prefix | 否 | 隱藏 | 顯示 |
| 運費規則 | `/admin/freight-rules` | 系統管理 | `ADMIN` role（page/write service gate） | prefix | 否 | 隱藏 | 顯示 |
| 主檔匯入 | `/admin/master-import` | 系統管理 | `ADMIN` role（page/service gate） | prefix | 否 | 隱藏 | 顯示 |
| 使用者與授權 | `/admin/users` | 系統管理 | `ADMIN` role（page/API gate） | exact prefix | 否 | 隱藏 | 顯示 |

Icon 不是 P4.2 的必要依賴。若實作時加入 icon，icon 只作輔助、設 `aria-hidden`，文字 label 永遠存在。

### 4.3 Authorization rule

- Navigation model 必須以和實際 server gate 相同的 authorization predicate 過濾：query routes 使用 permission all-of，現有 `/admin/**` routes 使用明確 `admin-only`。不得把存在但未作為 server gate 的 `*.manage`、`admin.users.*` 或 `master_import.*` constants 寫成既成 route authorization。
- 公司設定目前沒有專用 permission，且 service 正式使用 ADMIN gate；P4.2 以明確 `adminOnly` authorization predicate 保留現況，不借用語意不相干的 permission。
- 是否新增 company settings permission 是 RBAC contract change，只能另立 decision／任務；不阻塞 P4.2 Shell 實作。
- 隱藏 navigation、button 或 management link不取代 page、service 及 API 的 server authorization。
- 直達無權限 route 必須呈現 403，不得用首頁 redirect 假裝成功。

### 4.4 Server authorization evidence

| Route family | Effective gate | Server location | Exception／note |
| --- | --- | --- | --- |
| `/customers/**` | `customers.read` + company access | `customers/service.ts` `requireCustomerAccess(..., "read")` | detail管理連結另以`ADMIN`顯示 |
| `/items/**` | `items.read` + company access | `items/service.ts` `requireItemAccess(..., "read")` | 無page-level permission call，service是正式邊界 |
| `/pricing/lookup` | `customers.read` + `items.read` + `pricing.read` | customer/item/pricing query services | page組合三個service |
| `/freight/quote` | `customers.read` + `freight.read` | customer/freight query services | page直接查詢location前先以customer service驗證 |
| `/sales-orders` | `sales_orders.read` + selected company | `sales-orders/service.ts` | page broad catch目前導向`/login` |
| `/sales-orders/new` | `sales_orders.manage` | page `requirePermission`；mutation service再次驗證 | 直接使用selected company |
| `/sales-orders/[id]` | `sales_orders.read` + `delivery_notes.read` | page + sales/delivery services | 關聯銷貨單query形成額外read依賴 |
| `/delivery-notes/**` | `delivery_notes.read` | page + `delivery-notes/service.ts` | print依`manage`，direct void依`admin_void` |
| `/admin/company-settings` | `ADMIN` + company access | `company-settings/service.ts` | page本身只取context，service執行正式gate |
| `/admin/customers/**` | `ADMIN` | page + customer write service | `customers.manage` constant不是目前write gate |
| `/admin/items/**` | `ADMIN` | page + item write service | `items.manage` constant不是目前write gate |
| `/admin/pricing/**` | `ADMIN` | page + pricing write service | `pricing.manage` constant不是目前write gate |
| `/admin/freight-rules/**` | `ADMIN` | page + freight write service | `freight.manage` constant不是目前write gate |
| `/admin/master-import/**` | `ADMIN` + company access | page或`master-import/service.ts` | `master_import.*` constants不是目前service gate |
| `/admin/users` | `ADMIN` | page及admin user API `requireAdminWithAudit` | `admin.users.*` constants不是目前route gate |

## 5. App Shell component hierarchy

後續實作採不改 URL 的 route groups。實際目錄搬移前須依 `web/AGENTS.md` 讀取 repository 內對應 Next.js 文件。

```text
RootLayout
├─ PublicRoutes
│  └─ LoginPage
├─ NoCompanyRoute
│  └─ NoCompanyState + LogoutAction
└─ AuthenticatedLayout [Server]
   ├─ loadShellContext [Server: session + selected company + roles]
   ├─ SkipLink
   └─ AppShell [Server presentation]
      ├─ DesktopSidebar
      │  ├─ ProductIdentity
      │  └─ PermissionNavigation
      ├─ ShellColumn
      │  ├─ TopHeader
      │  │  ├─ MobileNavigationTrigger
      │  │  ├─ CurrentCompany
      │  │  ├─ CompanySwitcher [Client interaction island]
      │  │  └─ UserMenu [Client interaction island]
      │  └─ MainContent#main-content
      │     ├─ RouteTransitionAnnouncement
      │     └─ PageContainer
      │        ├─ Breadcrumb
      │        ├─ PageHeader
      │        └─ RouteContent
      ├─ MobileNavigationDrawer [Client interaction island]
      └─ GlobalAnnouncementRegion
```

Root layout 不查詢 session。Authenticated layout 在 server 取得 context、執行 auth／selected-company guard、建立 authorization-filtered navigation，再把最小安全資料傳給 client interaction islands。

## 6. Desktop behavior

- Desktop breakpoint 固定為 `>= 1024px`。
- Sidebar 使用單一 Shell width token，實作預設 264 px；256～272 px 內的視覺微調不構成 domain 或 persistence contract。
- Sidebar 使用 `position: sticky; top: 0; height: 100dvh; overflow-y: auto`。
- Desktop sidebar 固定展開，不提供 collapse，也不保存狀態。
- Header 使用單一 Shell height token，實作預設 64 px，於 Shell 主欄頂端 sticky。
- Browser document 是唯一垂直 scroll owner；sidebar 只在自身內容超出時獨立捲動。
- Main content 不建立第二個全頁垂直 scroll container。
- Table 或 document subtable 的橫向捲動只發生在該資料區塊，不使整個 viewport 橫向捲動。
- Header、drawer、dialog 的 z-index 由單一 Shell token 層級管理；page content 不可任意蓋過 Shell。
- Desktop page padding：水平 32 px、垂直 24～32 px。

### 6.1 Content width

- Default page：`max-width: 1280px`，置中。
- Wide list／document：使用 main column 全寬，但仍保留 page padding。
- Form／閱讀型頁面：由 PageContainer 使用 `narrow` variant，候選 `max-width: 960px`。
- Login：不使用 authenticated container，維持獨立窄版。
- 內容寬度由 PageContainer variant 決定，不由每頁任意指定 `max-w-*`。

## 7. Narrow viewport behavior

- Narrow shell 固定為 `< 1024px`。
- Shell presentation 最小支援 360 CSS px；不得水平破版、遮住主要導覽或使登出不可用。
- Sidebar 從 layout 流中移除，由 header trigger 開啟 modal drawer。
- Drawer 寬度為 `min(320px, calc(100vw - 48px))`，左側滑入，背景有 overlay。
- Drawer 開啟時鎖定背景捲動、focus 進入 drawer、Tab 留在 drawer。
- Escape、overlay click、關閉按鈕及成功 navigation 都關閉 drawer；關閉後 focus 回 trigger。
- 768～1023 px 使用 24 px page padding；360～767 px 使用 16 px。
- Page header 的 title／description 先顯示，actions 換行至下一列並保持 primary action 可見。
- 小於 768 px 的複雜表格使用區塊內受控橫向捲動；不得縮小至不可讀字級。
- P4.2 只保證 Shell 與既有內容容器可達；複雜業務 editor 的完整 mobile 重構留在 P4.4～P4.6。

## 8. Navigation model

Navigation metadata 是單一 server-safe registry，不由各頁重複拼字串：

```ts
type NavigationDefinition = {
  id: string;
  label: string;
  href: string;
  group: "home" | "sales" | "master-data" | "system";
  order: number;
  authorization:
    | { kind: "authenticated" }
    | { kind: "permissions"; allOf: Permission[] }
    | { kind: "admin-only" };
  match: { kind: "exact" | "prefix"; value: string };
  icon?: NavigationIconKey;
  companySwitchTarget: "same-list" | "module-list" | "home";
};
```

- Group label 使用「作業首頁」、「銷售作業」、「主檔查詢」、「系統管理」。
- Group 沒有可見 item 時整組不渲染。
- Active item 使用 `aria-current="page"`，不能只靠顏色。
- Active match 只比對 pathname，不受 query filter 影響。
- Desktop group 固定展開，沒有 accordion persistence。
- Deep link 先經 server auth／company gate，再顯示 Shell 與 active navigation。
- 不在 navigation 放入 P5 庫存、生產、採購、倉庫、批號或其他未存在模組。
- 首頁從彩色 route launcher 改為 Shell 內的安全工作入口；完整 dashboard 不屬 P4.2。

## 9. Company context UI

### 9.1 Display

- Current company 位於 top header，desktop 與 narrow viewport 都可見。
- 呈現格式為「`code`－`name`」，名稱為主要資訊、code 為次要識別。
- 只有一家公司時顯示 static label，不呈現 dropdown affordance。
- 多家公司時顯示 menu trigger。現有 switch endpoint 只驗證 authenticated context 與 authorized-company membership，沒有執行 `company.switch` permission gate；P4.2 不得把該 constant 誤述為現行 server contract。

### 9.2 Switch behavior

- 唯一可信 context 仍是 server-side session `selectedCompany`。
- 現有 `/api/auth/company` 以 same-origin、protected request context及authorized-company membership保護；它沒有呼叫 `requirePermission("company.switch")`。若未來要新增permission gate，必須另立RBAC decision。
- Switch command 必須沿用既有 `switchSessionCompany` 的 company access、audit 及 session domain contract。
- 不接受 client 把任意 `companyId` 當作可信 scope。
- 切換期間 trigger disabled，header 與 page content 標示 busy；不得顯示新舊公司混合資料。
- 現有form成功後303 redirect `/`，會取得新server context並重建整頁；現行流程不需要以company id作React key。
- 若未來另案核准保留route的client-side switch presentation，可評估以新 `selectedCompany.id` remount公司敏感client subtree；這是防止stale state的implementation decision，不是現況事實或domain contract。
- 所有既有 page-local `companyId` selector 在 P4.2 Shell 整合時停止作為平行 context；URL 中舊 `companyId` 應被移除或 canonicalize 到 session selected company。

### 9.3 Redirect

- P4.2最低可行且與現有contract一致的行為：所有公司切換成功後固定導向 `/`；不得宣稱現有API保留目前route。
- 保留route是獨立presentation enhancement：list／lookup才可候選保留module及不含 `companyId` 的安全filter，並重設page為1。
- Dynamic detail、create、edit、未送出form即使未來支援route preservation，也必須導向該module list，不保留entity ID或敏感未送出資料。
- 若目標 module 對使用者不可見，導向 `/` 並提供非敏感說明。
- 不以 browser history 作唯一返回機制。
- 若需求方要求保留list route，需另立presentation action／redirect contract任務並重新驗證same-origin path、permission、company scope及filter allowlist；不得在P4.2假設既有API已支援。

### 9.4 No company and failure

- 已登入但 `authorizedCompanies` 為空：顯示專用「尚無可用公司」狀態，不渲染 business navigation 或前公司資料；提供登出及聯絡管理員說明。
- Selected company 已失效但仍有其他授權公司：依既有 `chooseSelectedCompany` 自動選 default 或第一家，Shell 只顯示最後有效結果。
- Context loading 不得沿用前公司 label；使用中性 skeleton。
- Context unexpected failure 顯示最小安全錯誤，不揭露公司清單、SQL 或 stack，提供重試、登出及 correlation ID。

## 10. User menu

- Trigger 顯示 username；現有 context 沒有 display name 或 email，不虛構資料。
- Menu metadata 顯示「帳號：username」；role 可用繁體中文 label 顯示，但不顯示 raw role code。現有context沒有display name或email。
- Menu 只提供：
  - 使用者與授權管理：依現有route gate僅 `ADMIN` 可見，連到 `/admin/users`；不得誤寫成目前只檢查 `admin.users.read`。
  - 登出：POST 現有 `/api/auth/logout`。
- 不新增個人設定、修改密碼、通知中心或其他不存在功能。
- Trigger 使用 button、`aria-haspopup="menu"`、`aria-expanded` 及明確 accessible name。
- Enter／Space／ArrowDown 開啟並 focus 第一項；ArrowUp／Down、Home／End 移動；Escape 關閉並回 trigger。
- Click outside 關閉；Tab 可離開並關閉，不建立不必要的永久 focus trap。
- Logout pending 時禁止重複提交；完成後由既有 route 撤銷 session、清 cookie、redirect `/login`。

## 11. Breadcrumb contract

Breadcrumb 由 route registry 與 page-provided dynamic label 組合，不允許各頁自行硬編完整 trail。

| Route family | Breadcrumb |
| --- | --- |
| `/` | 作業首頁 |
| `/customers` | 作業首頁 / 主檔查詢 / 客戶 |
| `/customers/[id]` | 作業首頁 / 主檔查詢 / 客戶 / `{customer.name}` |
| `/items` | 作業首頁 / 主檔查詢 / 品項 |
| `/items/[id]` | 作業首頁 / 主檔查詢 / 品項 / `{item.name}` |
| `/pricing/lookup` | 作業首頁 / 主檔查詢 / 正式價格 |
| `/freight/quote` | 作業首頁 / 主檔查詢 / 運費試算 |
| `/sales-orders` | 作業首頁 / 銷售作業 / 銷售訂單 |
| `/sales-orders/new` | 作業首頁 / 銷售作業 / 銷售訂單 / 新增訂單 |
| `/sales-orders/[id]` | 作業首頁 / 銷售作業 / 銷售訂單 / `{orderNumber}` |
| `/delivery-notes` | 作業首頁 / 銷售作業 / 銷貨單 |
| `/delivery-notes/[id]` | 作業首頁 / 銷售作業 / 銷貨單 / `{deliveryNoteNumber}` |
| `/admin/users` | 作業首頁 / 系統管理 / 使用者與授權 |
| `/admin/company-settings` | 作業首頁 / 系統管理 / 公司設定 |
| `/admin/customers` | 作業首頁 / 系統管理 / 客戶主檔 |
| `/admin/customers/[id]` | 作業首頁 / 系統管理 / 客戶主檔 / `{customer.name}` |
| `/admin/items` | 作業首頁 / 系統管理 / 品項主檔 |
| `/admin/items/[id]` | 作業首頁 / 系統管理 / 品項主檔 / `{item.name}` |
| `/admin/pricing` | 作業首頁 / 系統管理 / 價格管理 |
| `/admin/pricing/[id]` | 作業首頁 / 系統管理 / 價格管理 / `{priceList.name}` |
| `/admin/freight-rules` | 作業首頁 / 系統管理 / 運費規則 |
| `/admin/freight-rules/[id]` | 作業首頁 / 系統管理 / 運費規則 / `{customerName}／{locationName}` |
| `/admin/master-import` | 作業首頁 / 系統管理 / 主檔匯入 |
| `/admin/master-import/[id]` | 作業首頁 / 系統管理 / 主檔匯入 / `{entityType}` |

Rules：

- 最後一項代表目前頁，不可點擊且有 `aria-current="page"`。
- 「作業首頁」與存在的 list ancestor 可點擊；純 group label 沒有 route，不可點擊。
- List ancestor href 應使用 page 明確提供且驗證過的 return URL，以保留安全 filter。
- Dynamic label loading fallback 使用「載入中…」或正式類型名稱，例如「銷售訂單明細」；不得顯示 UUID。
- Dynamic record 不存在或跨公司時不渲染 record label，直接進安全 404。
- 無權限 ancestor 不建立可點擊 link；正常情況 page server gate 應先拒絕整個 route。
- 小於 768 px 視覺只顯示最近可點擊 ancestor 作為「返回…」，完整 trail 保留給 assistive technology；page title 承擔目前位置。

## 12. Page header contract

```ts
type PageHeaderProps = {
  title: string;
  description?: string;
  breadcrumb: BreadcrumbItem[];
  status?: { label: string; tone: StatusTone };
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  overflowActions?: ReactNode;
  metadata?: Array<{ label: string; value: ReactNode }>;
};
```

- 每頁只能有一個可見 `h1`，由 PageHeader 輸出。
- Primary action 最多一個；secondary 與 overflow 不得競爭相同視覺層級。
- Status 必須有文字，不能只靠顏色。
- Current company 固定在 Shell header；只有在單據 frozen company 與 session context 需要辨識時，才在 metadata 顯示單據公司。
- 不顯示 P1～P5 階段字樣。

使用方式：

- List page：title、簡短 description、primary create action、必要 secondary actions；filter 與 table 在 header 下。
- Detail page：人類可讀名稱／單號作 title，status badge 與主要日期在 metadata，capability action 集中於 actions。
- Form page：建立／編輯語意作 title；primary submit 可由 form action bar承載，PageHeader 不重複 submit。
- 現有頁面於 P4.2 只遷移外層 header／container；內容區完整重構留後續子階段。

## 13. Loading, empty and error states

| State | Presentation | Actions |
| --- | --- | --- |
| 未登入 | Redirect login，不渲染 authenticated Shell | 登入 |
| Session expired | 現況直接redirect `/login`且沒有expired reason；P4.2 Shell presentation應使用不含敏感資料的reason呈現「登入已逾時」 | 重新登入；最低可行行為安全回首頁 |
| 403 | 保留可安全建立的 Shell 與公司資訊，不顯示受限內容 | 返回 module 安全頁或首頁 |
| 無可用公司 | 不渲染 business navigation 或前公司資料 | 登出、聯絡管理員 |
| Company context 失效 | 重新解析有效 default／第一家公司；無公司則專用狀態 | 重試、登出 |
| Navigation metadata failure | 顯示最小安全 navigation fallback：首頁、使用者選單、登出 | 重試 |
| 404 | 保留 Shell，不揭露跨公司 record 是否存在 | 返回 module list 或首頁 |
| Safe query API failure | 保留 Shell、breadcrumb、page header | Retry、返回安全頁 |
| Mutation result unknown | 保留輸入及既有 idempotency session | 使用相同操作重試，不建立新 key |

Error state 顯示繁體中文安全訊息，correlation ID 放在 details／support 區，預設為次要文字；不得顯示 stack、SQL、Prisma、檔案路徑或 raw exception。

目前login POST成功固定redirect `/`，page redirect也沒有攜帶return path。Deep-link return path尚未實作；若要加入，需另立auth／presentation redirect contract任務，限制same-origin relative path並在登入後重新驗證permission與company scope。它不阻塞以安全回首頁為最低行為的P4.2 Shell實作，但完整P4驗收前必須另案決定。

## 14. Accessibility

- Skip link 是 body 中第一個可 focus control，目標為 `#main-content`。
- 使用 `header`、`nav`、`aside`、`main` 等 landmark，navigation 具 accessible label。
- Desktop 與 drawer navigation 都可全鍵盤操作。
- Active state 使用文字／形狀及 `aria-current`，不只使用顏色。
- Sticky header 不可遮住 anchor focus；使用適當 `scroll-margin-top`。
- Focus indicator 符合 WCAG AA 候選對比，不被 overflow clipping。
- Drawer 使用 modal dialog semantics、accessible name、focus trap、Escape 及 focus return。
- User menu 使用 menu button contract；公司選擇可使用 native select 或符合 listbox/menu keyboard contract 的元件。
- Route loading、switch success／failure及 navigation result透過 live region announcement。
- Reduced motion 時關閉非必要 drawer animation。
- Touch target 候選最小 44 × 44 CSS px。

## 15. Server/client component boundaries

### Server responsibilities

- 驗證 session、selected company、role／permission。
- 產生 filtered navigation model。
- 只傳 username、role label、authorized company 的 id／code／name及 selected company 給 Shell。
- 執行 company switch service boundary、logout form action及安全 redirect target mapping。
- 取得 dynamic breadcrumb label及 page data。
- 保留所有 page／service／API server authorization。

### Client responsibilities

- Mobile drawer open／close、focus、body scroll lock。
- User menu open／close及 keyboard interaction。
- Company switch pending presentation，成功後 refresh／navigation。
- Active pathname presentation及 route transition announcement。
- 不保存或推導正式 permission、company scope 或 business capability。
- 不快取跨公司的敏感page data。現有整頁redirect會自然重建state；只有未來核准client-side route preservation時，才評估以selected company id作remount key。

## 16. Reusable component interfaces

P4.2 建立下列 Shell-specific interfaces；generic visual variants 留給 P4.3：

```ts
type AppShellProps = {
  actor: { username: string; roleLabels: string[] };
  selectedCompany: { id: string; code: string; name: string };
  authorizedCompanies: Array<{ id: string; code: string; name: string }>;
  navigation: NavigationGroup[];
  children: ReactNode;
};

type PageContainerProps = {
  width?: "default" | "wide" | "narrow";
  children: ReactNode;
};

type BreadcrumbItem = {
  label: string;
  href?: string;
  current?: boolean;
};

type ShellStateProps = {
  title: string;
  description: string;
  correlationId?: string;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
};
```

Navigation registry、breadcrumb registry及 company switch redirect mapping 應使用同一 route id，避免三套 path 判斷漂移。

## 17. Navigation state

- Desktop sidebar 不 collapse，沒有 persistence。
- Narrow drawer 每次初始為關閉，不保存 local storage、cookie 或 database。
- 因初始狀態固定，server render 與 hydration 一致。
- Drawer 在 pathname 改變時自動關閉。
- Route transition loading 保留 Shell，只替換 main content skeleton。
- Deep link 由 server auth／company／permission gate驗證後直接呈現對應 active item及 breadcrumb。
- P4.2 不新增 domain persistence 或 database setting。

## 18. Explicit exclusions

P4.2 不得：

- 修改 schema、migration、role、permission、RBAC mapping、session model或 company authorization。
- 修改 API response contract。
- 修改訂單／銷貨單 state machine、transaction、locking、audit、idempotency、正式列印、重印或 snapshot。
- 新增 P5 inventory、production、procurement navigation或 UI。
- 重寫全部客戶、品項、價格、運費、訂單、銷貨單內容。
- 建立完整 generic Design System；該工作屬 P4.3。
- 新增個人設定、通知、密碼變更或不存在的管理功能。

## 19. Implementation sequence

後續獨立實作任務依序：

1. 依 `web/AGENTS.md` 閱讀本地 Next.js 文件，確認 route group、layout、loading、error及 not-found API。
2. 建立 typed route/navigation/breadcrumb registry與 unit tests。
3. 以不改 URL 的 authenticated route group建立 server layout及 auth boundary。
4. 建立 PageContainer、AppShell、desktop sidebar、sticky header、skip link及 narrow drawer。
5. 建立 company area、user menu、logout及 keyboard／focus contract。
6. 建立 PageHeader／Breadcrumb並遷移現有 page outer frame。
7. 移除 page-local平行 company context、開發階段文字及重複返回首頁；保留內容本體。
8. 建立 Shell-level loading、403、404、no-company、session-expired及 error presentation。
9. 驗證兩個角色、單／多／零公司、deep link、company switch、session expiry、keyboard及 360／768／1024／1280 viewport。
10. 依 AGENTS.md 執行 lint、type check、unit test及 build；有必要的 route/integration tests 一併執行。

## 20. Acceptance criteria

- 所有 authenticated routes 共用同一 App Shell；login 不使用完整 Shell。
- URL 不因 route group 搬移而改變。
- Navigation 只顯示現有 route，並依本文件 authorization predicate產生。
- ORDER_ENTRY 看不到系統管理 group；ADMIN 可見完整核准管理入口。
- 直達無權限 route 仍由 server 拒絕並顯示 403。
- 目前公司及 username 在所有 authenticated pages 可見；登出從所有頁可達。
- 一家公司顯示 static company，多家公司可切換，零家公司不顯示 business navigation。
- 公司切換不殘留前公司資料，不使 Shell company 與 page content company 不一致。
- Breadcrumb及 PageHeader 使用集中 registry／contract，動態 label不顯示 UUID。
- Desktop、narrow drawer、focus、Escape、outside click、skip link及 `aria-current` 符合本文件。
- Shell-level loading、error、403、404、no-company及 session-expired 都有安全恢復入口。
- 不顯示 P1～P5 階段字樣。
- 未修改 domain、schema、migration、RBAC、session model、company authorization或 API response contract。
- 未開始 P4.3～P4.7、P5或其他業務模組重構。

## 21. Risks and open issues

### 21.1 Non-blocking implementation risks

- 多個頁面以 broad catch redirect `/` 或 `/login`，會把 authorization、not found及資料錯誤混在一起；P4.2 應只調整 presentation error routing，不改 service domain。
- Page-local `companyId` 與 session selected company 目前可不同；Shell 整合必須同一切片 canonicalize，否則是高風險資料辨識問題。
- 公司設定缺少專用 permission；本階段保留既有 ADMIN gate，不以錯誤 permission替代。
- 現有 `/access-denied` 是無guard的static route，文案只適合「無公司」，不適合一般403；P4.2必須分開presentation。
- 現有 root metadata 使用開發名稱「Ragic 本地端系統」；正式品牌名稱沒有決議。P4.2 可維持現名，不因 Shell 任務自行創造品牌。
- 現有 session context只有 username，沒有 display name／email；user menu 不得虛構。
- 現有login成功固定回首頁且沒有return path；deep-link enhancement另案處理，不阻塞以安全首頁為最低行為的App Shell。
- 現有company switch沒有`company.switch` permission check，只有authorized-company membership；P4.2保留此server contract。
- 所有現有管理route實際是`ADMIN` gate；`customers.manage`、`items.manage`、`pricing.manage`、`freight.manage`、`master_import.*`及`admin.users.*` constants目前不得被文件誤述為這些route的server gate。
- P4.2 只保證 Shell 最小 360 px；複雜 editor 的完整 narrow viewport可用性仍在後續模組階段驗收。

### 21.2 Domain/API follow-up

- Proposed follow-up：若需求方要讓目前以 `ADMIN` 角色直接把關的管理路由全面改為 permission-driven authorization，需另立 RBAC decision及 server contract任務。
- Proposed follow-up：若需求方要求 session expired登入後返回原 deep link，需另立 login redirect presentation API contract任務，並驗證 same-origin relative path、permission及 company scope。
- Proposed follow-up：若需求方要求公司切換後保留 list／lookup route，需另立 presentation action／redirect contract任務，驗證 same-origin allowlist、permission、company scope及 filter canonicalization；dynamic detail／create／edit仍回 module list。

上述項目沒有阻止 P4.2 依現有 contract 實作 App Shell；目前沒有未解決的 domain blocker。

## 22. Implementation result

2026-07-31 已依本規格完成下列 presentation implementation：

- 以 `app/(authenticated)` route group 包覆全部既有 authenticated pages；URL、login、access-denied 與 API routes 不變。
- `AuthenticatedLayout` 使用集中且 request-cached 的 session context loader；page/service/API 既有 authorization 仍保留。
- 建立 server-safe navigation registry、breadcrumb resolver、Shell view model、AppShell、desktop sidebar、sticky header、mobile drawer、company switcher、user menu、PageContainer、PageHeader、loading／error／404／no-company presentation。
- Desktop 使用 264 px sidebar、64 px header及 1024 px breakpoint token；narrow drawer具 overlay、Escape、outside click、focus trap、focus return、route navigation後關閉及 body scroll lock。
- Company switch沿用 `/api/auth/company`，沒有新增 `company.switch` gate，成功後仍固定回 `/`。
- Navigation依複合 permission或現有 `ADMIN` role gate過濾；沒有加入 P5 route。
- Home移除舊的平行 route launcher、company selector及 logout，改由固定 Shell提供，並保留 company switch failure的非破壞性錯誤提示。

本次未修改 role、permission、session、cookie、company authorization、API response、schema、migration、package、lockfile、state machine、transaction、audit、idempotency、formal print或 P5。

實際驗證證據記錄於 `docs/P4_2_APP_SHELL_NAVIGATION_IMPLEMENTATION_VALIDATION.md`。
