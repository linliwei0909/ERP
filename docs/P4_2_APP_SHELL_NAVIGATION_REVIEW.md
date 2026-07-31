# P4.2 App Shell 與導覽規格審查紀錄

文件狀態：正式審查已完成，並已同步 P4.2 實作後證據
任務：P4.2 App Shell 與導覽正式規格審查及實作驗證
版本日期：2026-07-31

## 0. Revalidation statement

- `docs/P4_2_APP_SHELL_NAVIGATION_SPEC.md`與本文件原為2026-07-29產生、未納入Git的草稿。
- 本次沒有直接採信前次「route／permission／session證據完整、無blocker、可實作」結論。
- 所有route、layout、auth API、session helper、company switch、RBAC constants、role mapping、page/service/API authorization及shared UI證據均重新由HEAD `91820000a8c3d7cd71eca2804d3729ae0b1cab7c`讀取。
- 正確的現況與設計內容保留；與production code不一致的permission、company switch redirect、route preservation及client remount敘述已修正。
- 正式規格審查階段當時只修訂原兩份P4.2 Markdown，尚未建立第三份文件或開始production implementation；後續實作證據另見第19節。

## 1. Git baseline

### 1.1 Expected

- Branch：`main`
- HEAD：`91820000a8c3d7cd71eca2804d3729ae0b1cab7c`
- `origin/main`：`91820000a8c3d7cd71eca2804d3729ae0b1cab7c`
- Ahead／behind：`0 / 0`
- 預期untracked正好三份：受保護blueprint及兩份既有P4.2草稿

### 1.2 Observed before review

- `git status --short`：正好為`docs/INVENTORY_PRODUCTION_BLUEPRINT.md`、`docs/P4_2_APP_SHELL_NAVIGATION_SPEC.md`、`docs/P4_2_APP_SHELL_NAVIGATION_REVIEW.md`三份untracked
- Branch：`main`
- HEAD：`91820000a8c3d7cd71eca2804d3729ae0b1cab7c`
- `origin/main`：`91820000a8c3d7cd71eca2804d3729ae0b1cab7c`
- Ahead／behind：`0 / 0`
- Staged diff：無
- Tracked diff：無
- Untracked：上述三份核准基線文件

基線完全符合本次重新審查指令，因此進入production code唯讀審查及兩份核准草稿修訂。既有`docs/INVENTORY_PRODUCTION_BLUEPRINT.md`未開啟、修改、stage、刪除、移動或改名。

## 2. Review scope

完整審查：

- `AGENTS.md`
- `web/AGENTS.md`
- `docs/P4_UI_UX_BLUEPRINT.md`
- `docs/P4_1_UI_UX_PLANNING_VALIDATION.md`
- `docs/DECISIONS.md`，包含 DEC-060
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/TECHNICAL_ARCHITECTURE.md`
- `docs/business-rules.md`
- `docs/DATABASE_DESIGN.md`
- `docs/OPEN_QUESTIONS.md`
- `docs/P3_3_DELIVERY_NOTE_PRINT_PLAN.md`
- `web/README.md`

唯讀程式審查：

- `web/src/app/layout.tsx`
- 全部 `web/src/app/**/page.tsx`
- `web/src/app/delivery-notes/loading.tsx`
- Delivery Note list/detail/action components
- Sales Order editor及 delivery-note order actions
- 所有 ADMIN page及其 page-local client components的互動模式
- Authentication context、session、company scope、RBAC、authorization、cookie及 auth routes
- Customer、item、pricing、freight、sales order、delivery note、company setting及 master import service authorization evidence
- `web/src/app/globals.css`

重新驗證特別開啟：

- `/api/auth/login`、`/api/auth/logout`、`/api/auth/company`、`/api/auth/context`
- `auth/constants.ts`、`cookie.ts`、`request-context.ts`、`session.ts`、`session-policy.ts`、`company-scope.ts`、`rbac.ts`、`authorization.ts`
- 各page使用的customer、item、pricing、freight、sales-order、delivery-note、company-setting及master-import service gate
- ADMIN page gate與對應API/service authorization；不只依首頁link或檔名推測

沒有開啟 legacy ERP、P5 blueprint或主工作目錄既有 inventory blueprint。

## 3. Specification priority result

- DEC-060 明定 P4 是 UI／UX 與操作流程重整，P5 才是 Inventory and Production。
- P4 原則上保留 backend domain、schema、state machine、RBAC、company scope、transaction、locking、audit、idempotency、formal print、reprint、immutable snapshot、pricing及 freight契約。
- P4.2 精確範圍是 App Shell、固定導覽、公司切換、使用者選單、登出、breadcrumb、page title、authorization-aware navigation、responsive shell及共用狀態。
- P4.3 才建立完整 Design System；P4.4～P4.6 才完整重構主檔、銷售訂單及銷貨單。
- P4 完成前不得開始 P5。
- `OPEN_QUESTIONS.md` 只有 OQ-005、OQ-044、OQ-045，均與 P4.2 App Shell 無直接 blocker。

## 4. Layout and route evidence

### 4.1 Layout

- Repository 只有 `web/src/app/layout.tsx`。
- Root layout 只設定 `zh-Hant`、metadata、global CSS及 `{children}`。
- 不存在 authenticated route group、nested layout、middleware、global `error.tsx` 或 `not-found.tsx`。
- Login、access denied及 authenticated pages目前都由 root layout直接承載。

### 4.2 Public and special routes

- `/login` 是獨立單卡 form，POST `/api/auth/login`；成功固定 redirect `/`，失敗顯示單一泛化訊息。
- `/access-denied` 是無 guard 的 static page，實際文案只描述「沒有公司權限」，提供登出。
- 沒有獨立 session-expired、generic 403、404或 global error presentation。

### 4.3 Authenticated routes

實際 page routes：

- `/`
- `/customers`
- `/customers/[id]`
- `/items`
- `/items/[id]`
- `/pricing/lookup`
- `/freight/quote`
- `/sales-orders`
- `/sales-orders/new`
- `/sales-orders/[id]`
- `/delivery-notes`
- `/delivery-notes/[id]`
- `/admin/users`
- `/admin/company-settings`
- `/admin/customers`
- `/admin/customers/[id]`
- `/admin/items`
- `/admin/items/[id]`
- `/admin/pricing`
- `/admin/pricing/[id]`
- `/admin/freight-rules`
- `/admin/freight-rules/[id]`
- `/admin/master-import`
- `/admin/master-import/[id]`

沒有 P5 inventory、production、procurement、warehouse或 lot route。

## 5. Current navigation and page pattern findings

- 首頁是唯一全功能 launcher，並是唯一同時顯示 username、selected company、session company switch及 logout 的頁面。
- 首頁 navigation 主要以 `hasRole(..., "ADMIN")` 顯示管理入口；Delivery Note 入口使用 permission。
- 其他頁面沒有固定 navigation、user menu或 logout。
- 清單頁多以「返回首頁」，明細／建立頁多以「返回清單」。
- 所有正式 page 都沒有 breadcrumb。
- 客戶及品項查詢使用正式 table；銷售訂單使用無表頭 card/grid row；銷貨單使用 responsive grid list。
- 多數 ADMIN list把 create form與 list放在同一長頁。
- Delivery Note detail是目前最完整的 document view，具有局部 badge、summary field、橫向可捲動 table、relation link及 action區。
- Delivery Note局部 dialog沒有完整 focus trap、Escape、outside click及 focus return。
- Company Settings及 Master Import使用 `window.confirm`；Sales Order使用 `window.prompt`。本輪不修改。
- 只有 Delivery Note有 route loading skeleton。
- Error處理不一致：多數 broad catch redirect `/` 或 `/login`；Delivery Note則在page內顯示大型紅色卡片。
- Empty state多為「查無資料」，沒有統一原因、clear filter或 next action。

## 6. Authentication and session findings

### 6.1 Authentication source

- Repository沒有middleware、authenticated nested layout或單一global auth guard。
- Page及 API分別由 `getPageRequestContext()`、`getApiRequestContext()`取得 protected context。
- 兩者都呼叫 `getSessionContext()`，再由 `assertSelectedCompany()`要求目前公司。
- Context包含 actor `userId/username`、session id、request id、role codes、authorized companies及 selected company。
- 現有 context沒有 display name或 email。

### 6.2 Session validation

- Cookie名稱為 `ragic_session`，HttpOnly、SameSite=Lax、path `/`；production啟用 Secure。
- Database只保存 token hash。
- Session閒置 8 小時到期；活動依 throttle更新。
- Session不存在、已撤銷、逾時或使用者停用時，會拋 `SessionAuthenticationError`。
- 未撤銷但已逾時／帳號停用的 session會在 transaction內撤銷並寫 audit。
- 多數 page catch沒有區分此錯誤與其他錯誤，造成 session expired、資料失敗及 authorization presentation混淆。
- Page redirect沒有攜帶session-expired reason或return path；login POST成功固定303 redirect `/`。

### 6.3 Logout

- POST `/api/auth/logout`先 same-origin檢查，再撤銷 current session、寫 audit、清 cookie並 redirect `/login`。
- Logout domain contract完整，但 UI入口只在首頁及 no-company page。
- 現有login／logout／company switch均沒有deep-link return path contract。

## 7. Company context findings

- `chooseSelectedCompany()`依序保留有效 selected company、使用有效 default company、再使用第一個 authorized company；沒有授權公司時為 null。
- `switchSessionCompany()`重新驗證 authorized company id，在同一 transaction更新 session selected company並寫 before／after audit。
- 首頁 POST `/api/auth/company`使用上述 service，成功固定 redirect `/`；失敗 redirect `/?error=company_access_denied`。
- `/api/auth/company`沒有呼叫`requirePermission("company.switch")`；目前server contract是authenticated context + authorized-company membership。
- 客戶、品項、價格、運費、公司設定、ADMIN主檔及匯入頁可接受 query `companyId`。
- Service仍以 `assertCompanyAccess()`或等價 company scope保護，因此 query不是 authorization bypass。
- Query company不會同步 session selected company。若直接加入 Shell，header可能顯示 A公司而內容查詢 B公司，屬重大 presentation不一致。

審查決策：

- P4.2將 session selected company固定為唯一 presentation context。
- Page-local company select不得與 Shell平行存在。
- P4.2實作應 canonicalize舊 `companyId` query，保留 server authorization及 session domain不變。
- 現有switch endpoint不支援保留route；P4.2最低可行契約固定切換後回首頁。
- 若另案新增route-preserving presentation action，list／lookup才可保留安全filter並重設page；dynamic detail／create／edit一律回module list。
- 現有整頁redirect會重建client state；company id React key只可作未來client-side route preservation的implementation option，不是必要現況契約。

## 8. RBAC findings

### 8.1 Formal permissions

`rbac.ts`現有 permissions：

- `admin.users.read`
- `admin.users.manage`
- `admin.sessions.revoke`
- `company.switch`
- `customers.read`
- `customers.manage`
- `items.read`
- `items.manage`
- `pricing.read`
- `pricing.manage`
- `freight.read`
- `freight.manage`
- `sales_orders.read`
- `sales_orders.manage`
- `delivery_notes.read`
- `delivery_notes.manage`
- `delivery_notes.admin_void`
- `master_import.read`
- `master_import.manage`

### 8.2 Role mapping

- ADMIN具有全部上述 permissions。
- ORDER_ENTRY具有 company switch、客戶／品項／價格／運費 read、銷售訂單 read/manage及銷貨單 read/manage。
- ORDER_ENTRY沒有任何 ADMIN master maintenance、user admin、master import或 delivery note direct void能力。
- Repository沒有 `MANAGER`、read-only或其他 role code。

### 8.3 Route gate differences

- Customer、item、pricing、freight query service使用相對應 read permission。
- `/pricing/lookup`實際組合customer、item及pricing query service，因此有效gate是`customers.read`、`items.read`、`pricing.read` all-of。
- `/freight/quote`先以customer service驗證，再以freight service試算，因此有效gate是`customers.read`與`freight.read`。
- Sales Order及 Delivery Note使用明確 read/manage permission。
- `/sales-orders/[id]`同時查sales order及關聯delivery notes，因此有效read依賴包含`sales_orders.read`與`delivery_notes.read`。
- ADMIN pages多先使用 `requireAdminWithAudit()`；customer、item、pricing、freight write service也實際使用ADMIN gate，而不是對應`*.manage` permission。
- Company Settings正式 service只使用 ADMIN gate，RBAC沒有 dedicated company setting permission。
- Master Import page／service保留 ADMIN gate；雖存在`master_import.read/manage` constants，service沒有用它們作gate。
- User administration page/API使用ADMIN gate；雖存在`admin.users.*` constants，route沒有以它們作gate。
- 多數無權限 ADMIN page broad catch後 redirect首頁；Delivery Note會 redirect `/access-denied`。

審查決策：

- Navigation依實際server predicate過濾：query routes使用permission all-of，所有目前ADMIN routes使用`admin-only`。
- Company Settings及其他ADMIN routes不借用存在但未作為server gate的permission。
- 既有 server authorization全部保留；P4.2不新增 permission。
- Generic 403 presentation取代模糊的首頁 redirect是 P4.2 presentation工作，不改 RBAC。

## 9. Server/client boundary findings

### 9.1 Existing

- 所有 pages是 Server Components。
- Client Components集中於表單 editor、master maintenance mutation、Delivery Note print／void及 order linkage action。
- Server pages取得 context、查詢資料及決定初始 capability。
- Client components使用 fetch、pending state、idempotency key、`router.refresh()`或 `router.push()`。
- Delivery Note print／reprint client保留 mutation session並將純 PDF下載與 mutation分離。

### 9.2 P4.2 decision

- Authenticated layout維持 Server Component，負責 session、company及 authorization-aware navigation。
- Drawer、user menu、company switch pending及 active pathname是小型 Client Components。
- Client不得推導 permission、公司授權或 domain capability。
- 現有company switch使用整頁redirect，不需要React remount key；只有未來另案採client-side route preservation時才評估selected company id key。

## 10. Formal P4.2 decisions

已固定：

- Desktop `>= 1024px`使用固定展開 sidebar及 sticky top header。
- Narrow `< 1024px`使用 modal drawer；Shell最小支援 360 CSS px。
- Desktop sidebar不收合、不保存；mobile drawer每次初始關閉。
- Browser document是主要垂直 scroll owner；table橫向捲動限制於內容區。
- Default PageContainer最大寬 1280 px；另有 wide及 narrow variants。
- Navigation groups為作業首頁、銷售作業、主檔查詢、系統管理。
- Navigation只包含現有 routes，沒有 P5。
- Query navigation使用與service一致的permission all-of；目前系統管理routes全部使用`admin-only`predicate。
- Current company顯示於 top header；一家公司為 static，多家公司才可切換。
- 公司切換最低可行行為沿用現有303回首頁；route preservation不是既有能力。
- Username顯示於 user menu；沒有 email／display name就不虛構。
- User menu只提供核准管理入口及 logout，不新增個人設定。
- Breadcrumb使用集中 route registry及 dynamic label slot。
- PageHeader統一 title、description、breadcrumb、status、actions及 metadata。
- 403、404、no-company、session-expired及 error有分開 presentation。
- Session expired最低可行恢復是重新登入後安全回首頁；現有程式沒有deep-link return path。
- Correlation ID位於錯誤 support details，不顯示技術 exception。
- Skip link、landmarks、keyboard、focus、Escape、outside click、focus return及 live region為驗收要求。

完整契約見 `docs/P4_2_APP_SHELL_NAVIGATION_SPEC.md`。

## 11. Differences from current state

| Area | Current | P4.2 contract |
| --- | --- | --- |
| Auth layout | 每頁自行 guard | authenticated server layout |
| Navigation | 首頁 launcher | server-authorization-aware sidebar + drawer |
| Company | 首頁 session switch + page query select | selected company單一 context |
| User／logout | 只在首頁 | 全部 authenticated pages可達 |
| Breadcrumb | 不存在 | typed centralized mapping |
| Page header | 各頁自行組裝 | common contract |
| Loading | 只有 Delivery Note | Shell保留、route content skeleton |
| 403 | redirect首頁或混用 access denied | generic 403 state |
| No company | `/access-denied` static card | dedicated no-company state |
| 404 | 無 global contract | Shell-preserving safe 404 |
| Error | redirect或整頁紅卡 | recoverable Shell state + correlation ID |
| Responsive shell | 各頁局部 class | 1024 desktop／narrow drawer contract |
| Navigation state | 無 | non-persistent desktop／drawer state |

## 12. Reusable components result

可沿用概念但不可直接視為跨模組 component：

- Delivery Note `StatusBadge`
- Delivery Note `SummaryField`
- Delivery Note list/detail structure
- Delivery Note loading skeleton
- 既有 Link、form control、card、table及 pagination class組合

不存在或需新建：

- AppShell
- AuthenticatedLayout
- DesktopSidebar
- MobileNavigationDrawer
- PermissionNavigation
- CurrentCompanyMenu
- UserMenu
- Breadcrumb
- PageContainer
- PageHeader
- ShellState／ErrorState
- RouteTransitionAnnouncement
- SkipLink

P4.2不把所有現有 button、table、dialog重寫成 Design System；完整 generic component contract留給 P4.3。

## 13. Domain/API follow-up

### 13.1 Proposed RBAC follow-up

Company Settings沒有dedicated permission；其他ADMIN管理route雖有部分`*.manage`、`admin.users.*`或`master_import.*` constants，實際page/service/API仍使用ADMIN gate。P4.2 navigation必須如實使用`admin-only`，不得自行把constants升格為route contract。

若未來要讓管理route完全permission-driven，需另立RBAC decision及獨立server任務。此項不阻塞P4.2，因現有ADMIN predicate是完整且正式的server authorization。

### 13.2 Proposed login redirect follow-up

現有login成功固定回首頁，page redirect也不攜帶return path。P4.2先以「session expired後重新登入並安全回首頁」閉合最低恢復流程，不宣稱已滿足deep-link return。

若要登入後返回原 deep link，需另立 presentation API contract任務，驗證：

- 只接受 same-origin relative path。
- 重新驗證 permission及 selected company。
- 不保存敏感 form payload。
- 無權限或 company不符時回安全首頁。

此項不阻塞 App Shell。

### 13.3 Proposed company route-preservation follow-up

現有`/api/auth/company`成功固定303回首頁，沒有安全return target欄位。P4.2不得假設可保留當前route；若要保留list／lookup route，需另立presentation action／redirect contract任務，驗證same-origin allowlist、permission、company scope及filter canonicalization。Dynamic detail／create／edit仍應回module list。

此項不阻塞採現有安全回首頁行為的App Shell。

### 13.4 Draft retention, corrections and deletions

保留：

- Route清單、唯一root layout、無middleware／global error／not-found、Delivery Note唯一loading file等已重新驗證現況。
- Session cookie、8小時idle expiry、authorized companies、selected company及logout契約。
- App Shell hierarchy、desktop／narrow shell、breadcrumb、PageHeader、special states及accessibility方向。
- P5、schema、migration、API domain、RBAC及業務頁完整重構排除。

修正：

- Pricing、freight及sales-order detail的複合read permission依賴。
- 所有現有ADMIN管理route的正式gate改為`admin-only`，不再把未使用的permission constants寫成route gate。
- Company switch改為如實記錄「沒有`company.switch` permission check、成功固定回首頁」。
- Route preservation改為獨立follow-up，不再寫成既有能力。
- Company id React remount改為條件式implementation option，不再寫成必要契約。
- Session-expired deep-link return改為「尚未實作且需另案」，P4.2最低行為是安全回首頁。

刪除：

- 前次草稿中「permission navigation一律以permission而非role」的過度概括。
- 「現有API可保留list route」及「company id remount必須執行」等無production code證據的敘述。

## 14. Explicitly unchanged

本次沒有修改：

- `web/src/**`
- Production TypeScript／TSX／CSS
- Tests
- Prisma schema
- Migration
- Package或 lockfile
- Role、permission、session model或 company authorization
- API request／response contract
- Sales Order／Delivery Note state machine
- Transaction、locking、audit、idempotency
- Formal print、reprint、PDF或 snapshot
- P5或其他後續模組
- `docs/INVENTORY_PRODUCTION_BLUEPRINT.md`

## 15. Documentation decision（正式規格審查階段）

本次直接修訂既有未追蹤草稿：

- `docs/P4_2_APP_SHELL_NAVIGATION_SPEC.md`
- `docs/P4_2_APP_SHELL_NAVIGATION_REVIEW.md`

未修改其他roadmap、architecture、decision、business rules、database design、open questions或README，原因如下：

- DEC-060及 P4 blueprint已提供足夠上位授權。
- 本次決策都在既有 presentation範圍內，沒有新 domain decision。
- Roadmap及 architecture不需要為了增加變更數量而重複寫入 P4.2細節。
- 管理route permission重構、login return path及company route preservation只記為proposed follow-up，未形成已核准contract。

## 16. Validation（正式規格審查階段）

本輪是文件與唯讀程式審查：

- 不執行 unit tests。
- 不執行 DB tests。
- 不執行 build。
- 不執行 migration。
- 不執行 lint或 typecheck。

Validation結果：

- `git diff --check`：通過；tracked diff沒有 whitespace error。
- `git diff --no-index --check NUL docs/P4_2_APP_SHELL_NAVIGATION_SPEC.md`：通過；exit 1只代表新檔與空檔不同，沒有 whitespace輸出。
- `git diff --no-index --check NUL docs/P4_2_APP_SHELL_NAVIGATION_REVIEW.md`：通過；exit 1只代表新檔與空檔不同，沒有 whitespace輸出。
- 修改檔案邊界：本任務只修訂上述兩份既有未追蹤Markdown。
- Production code、tests、schema、migration、package、lockfile差異：0。
- Staged diff：0。
- Tracked diff：0。
- 一致性搜尋已完成：P4.2、App Shell、navigation、breadcrumb、company switch、session expired、return path、`ADMIN`、`ORDER_ENTRY`、schema、migration、API及RBAC均有明確正向或排除契約。
- `MANAGER`及 read-only只出現在「不存在／不得新增」與 validation搜尋紀錄。
- P5只出現在明確排除、未開始及 DEC-060階段邊界。

## 17. Git final state（正式規格審查階段）

- Branch：`main`
- HEAD：`91820000a8c3d7cd71eca2804d3729ae0b1cab7c`
- `origin/main`：`91820000a8c3d7cd71eca2804d3729ae0b1cab7c`
- Ahead／behind：`0 / 0`
- Staged：無
- Unstaged tracked：無
- Untracked：
  - `docs/INVENTORY_PRODUCTION_BLUEPRINT.md`（既有受保護檔案，未開啟或修改）
  - `docs/P4_2_APP_SHELL_NAVIGATION_SPEC.md`
  - `docs/P4_2_APP_SHELL_NAVIGATION_REVIEW.md`
- 未 stage、commit或 push。

## 18. Readiness decision（正式規格審查階段）

已完整固定：

- Route inventory
- Permission mapping
- App Shell hierarchy
- Company switch behavior
- User menu behavior
- Breadcrumb contract
- Responsive behavior
- Server／client boundary

沒有阻止presentation implementation的domain blocker。管理route permission重構、login deep-link return及company route preservation都是獨立follow-up；P4.2以現有ADMIN gate、重新登入後安全回首頁及切換公司後回首頁即可建立App Shell。

最終判定：

`P4.2 App Shell 與導覽正式規格審查完成，可另開獨立實作任務。`

## 19. Implementation verification

2026-07-31 已在同一正式基線完成獨立 P4.2 implementation：

- 既有 authenticated routes機械式移入 `(authenticated)` route group，Next production build確認公開 URL未改變。
- 新增集中 Shell context view model；只輸出 username、role labels、authorized companies、selected company、filtered navigation及 request ID。
- Page仍保留既有 `getPageRequestContext`、`requirePermission`、`requireAdminWithAudit`及 service authorization；Shell navigation不是安全邊界。
- Navigation registry實際區分複合 permission與 `ADMIN` role gate。
- Company switch仍使用既有 API、authorized-company membership及固定首頁 redirect。
- User menu沒有新增 email、display name、profile或 preferences。
- Breadcrumb已涵蓋 home、list、create、detail及 admin route fallback；不修改 API以取得動態 label。
- Responsive drawer及 menu已加入 keyboard、Escape、outside click、focus trap／return、body scroll lock與 route-close行為。
- 新增 Shell loading、error、not-found及 zero-company presentation；`/access-denied`特殊 route保留原位。
- 沒有建立 middleware，也沒有修改 domain／API／RBAC／session contract。

驗證結果：

- Lint：通過。
- Typecheck：通過。
- Unit tests：24 files、194 tests通過。
- DB tests：15 files、149 tests通過；首次因未注入 test DB環境變數中止，依 README啟動獨立 test container並套用既有 migrations後完整重跑通過，沒有 skipped。
- Production build：通過；route manifest保留全部既有 URL。
- Production server smoke：login與access-denied保持public，未登入首頁安全redirect login。
- Build唯一 warning是既有 delivery-note font NFT tracing，非本次新增。

詳細證據見 `docs/P4_2_APP_SHELL_NAVIGATION_IMPLEMENTATION_VALIDATION.md`。
