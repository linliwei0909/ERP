# P4.2 App Shell 與導覽實作驗證

文件狀態：實作與正式驗證完成，待 Git 收尾
日期：2026-07-31

## 1. Git 基線

- Branch：`main`
- HEAD／`origin/main`：`91820000a8c3d7cd71eca2804d3729ae0b1cab7c`
- Ahead／behind：`0 / 0`
- 起始 staged／tracked diff：無
- 起始 untracked：受保護 inventory blueprint及兩份既有 P4.2 文件
- 受保護 blueprint：20,880 bytes；SHA-256 `930121B91B470DFF25596AE50309060155CF7C0F4B78251184EB13B493AF95B7`

## 2. 實作範圍

本次實作 authenticated layout、App Shell、navigation registry、company switch presentation、user menu、breadcrumb、PageContainer、PageHeader、responsive drawer、accessibility及 Shell special states。

未全面重構客戶、品項、價格、運費、銷售訂單或銷貨單內容，也未開始 P5。

## 3. 新增／修改檔案

主要新增：

- `web/src/app/(authenticated)/layout.tsx`
- `web/src/app/(authenticated)/loading.tsx`
- `web/src/app/(authenticated)/error.tsx`
- `web/src/app/(authenticated)/not-found.tsx`
- `web/src/components/app-shell/*`
- `web/src/lib/app-shell/*`
- `web/src/lib/navigation/*`
- `web/tests/unit/app-shell.test.tsx`

主要修改：

- `web/src/lib/auth/request-context.ts`：增加 request-cached、允許 selected company為 null的 page session loader；既有 protected loader contract不變。
- `web/src/app/globals.css`：集中 Shell tokens與 responsive／focus styles。
- Home：移除重複 route launcher、company selector及 logout，導入代表性 PageHeader與 switch failure提示。
- 既有 route source-contract tests：只同步 route group路徑。

既有 authenticated route trees移入 `web/src/app/(authenticated)/`；route group不進入 URL。

## 4. App Shell hierarchy

```text
RootLayout
├─ Login／AccessDenied／API（原位）
└─ AuthenticatedLayout [Server]
   ├─ loadShellContext [Server]
   ├─ NoCompanyState
   └─ AppShell
      ├─ DesktopSidebar + NavigationList
      ├─ TopHeader
      │  ├─ MobileNavDrawer [Client]
      │  ├─ CompanySwitcher [Client]
      │  └─ UserMenu [Client]
      ├─ Breadcrumbs [Client resolver]
      ├─ PageContainer
      ├─ Route content
      └─ RouteAnnouncer [Client]
```

## 5. Route integration

- `/login`及`/access-denied`不使用 authenticated layout。
- Home、customers、items、pricing、freight、sales orders、delivery notes及全部 admin pages共用 authenticated layout。
- Next production build列出的 URL與實作前相同。
- 既有 page、service及 API authorization均未移除。
- 沒有新增 middleware。

## 6. Navigation authorization

- Registry具 id、label、href、group、order、authorization、match、icon及 company-switch fallback metadata。
- Pricing需要 customers／items／pricing read。
- Freight需要 customers／freight read。
- System management routes依 production contract使用 `ADMIN` role gate。
- `ORDER_ENTRY`沒有 system group。
- 沒有 inventory、production、purchasing、warehouse、lot／batch、stocktake或 costing route。

## 7. Company switch

- 零家公司由 authenticated layout顯示 no-company state。
- 一家公司顯示 code及name static presentation。
- 多家公司使用 native keyboard-operable select及既有 POST `/api/auth/company`。
- 目前公司有明確文字標示。
- 成功仍固定回 `/`；失敗在首頁顯示可恢復 alert。
- 沒有新增 `company.switch` permission check，沒有修改 company authorization或強制 React subtree key。

## 8. User menu

- 使用 username、繁體中文 role label、ADMIN管理入口及既有 logout API。
- 支援 menu button、ArrowUp／Down、Home／End、Escape、outside click、Tab close及 focus return。
- 不顯示不存在的 email、display name、profile、preferences或 account settings。

## 9. Breadcrumb

- 集中 resolver涵蓋 home、list、create、detail及 admin routes。
- Dynamic label可由後續 page傳入；目前使用安全的「客戶明細」、「品項明細」、「訂單明細」、「銷貨單明細」等 fallback。
- 404／跨公司情境不顯示 raw UUID。
- 小於 768 px顯示最近安全 ancestor，完整 trail保留給 assistive technology。

## 10. Responsive behavior

- Desktop breakpoint：1024 px。
- Sidebar／header預設 token：264 px／64 px。
- `<1024px`使用 modal drawer，支援 overlay、outside click、Escape、focus trap、focus return、navigation後關閉及 body scroll lock。
- 768～1023 px page padding 24 px；360～767 px為16 px。
- Dense table以內容區塊水平 overflow相容，不全面重構 editor。

## 11. Accessibility

- Skip link與 `#main-content`。
- Header、aside、nav及既有 page main landmarks。
- Navigation使用 `aria-current="page"`。
- Drawer具 dialog semantics、accessible names、focus trap及 reduced-motion。
- User menu與 company control具 keyboard與 accessible labels。
- Route announcer使用 polite live region。
- Focus-visible樣式與非 color-only active state已建立。

## 12. Tests

- 新增 `app-shell.test.tsx` 13 tests：
  - registry grouping／sorting
  - ADMIN／ORDER_ENTRY visibility
  - composite permissions
  - P5 exclusion
  - active matching
  - safe Shell view model
  - zero／single／multiple company
  - user menu field exclusion
  - PageHeader／404
  - breadcrumb
  - route integration
  - drawer interaction contract
  - existing server authorization preservation
- 完整 unit suite：24 files、194 tests passed。
- 完整 DB suite：15 files、149 tests passed，0 skipped。
- Production server smoke：`/login` 200、未登入 `/` 307至 `/login`、`/access-denied` 200。

## 13. Build

- `npm run lint`：passed。
- `npm run typecheck`：passed。
- `npm run build`：passed。
- Next 16.2.11 route manifest確認既有 routes完整。
- 既有 delivery-note font NFT tracing warning仍存在，非 P4.2差異。

## 14. 禁止範圍驗證

未修改：

- Prisma schema／migration files
- package／lockfile
- roles／permission constants／role-permission mapping
- session model／cookie contract
- company authorization／API response contract
- order／delivery-note state machines
- transaction／locking／audit／idempotency
- formal print／immutable snapshot
- P5文件或實作

獨立 test DB只依 README套用 repository既有 migration chain；沒有建立或修改 migration。

## 15. Git 最終狀態

- Branch、HEAD、origin/main及 ahead／behind未改變。
- Staged diff：無。
- 變更限於核准 P4.2 implementation、tests及文件。
- 受保護 blueprint仍為 untracked且 metadata／hash不變。
- 未 stage、commit或 push。

## 16. 最終判定

`P4.2 App Shell 與導覽實作完成，可進行 P4.2 Git 收尾。`
