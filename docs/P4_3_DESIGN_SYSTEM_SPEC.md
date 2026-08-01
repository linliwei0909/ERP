# P4.3 Design System 與共用元件規格

文件狀態：P4.3 Implemented and Validated／P4.4～P4.7 Pending
決策依據：`DECISIONS.md` DEC-060、DEC-061；`P4_UI_UX_BLUEPRINT.md` 第 15～23、37～39 節
前置盤點：P4.3 現況盤點（本次對話，唯讀，未 commit）；P4.2 closure commit `29e68fff4cbd005443c0d228563a81e36ecf403d`
適用 Git 基線：`caf5208d7a130c83d858659fbd460707f9d17fd4`
版本：V1.6
版本日期：2026-08-01

## 1. Scope

本文件固定 P4.3 的 design token contract、共用元件 API、accessibility 與測試 contract，以及 `PageHeader`／`PageContainer`／company context 顯示責任的邊界。範圍依 `P4_UI_UX_BLUEPRINT.md` 第 16 節核准清單。

V4 是唯一核准的視覺基準。P4.3a 已完成 semantic tokens、基礎控制項與最小 SVG icon contract；P4.3b 已完成表單語意、feedback、empty 與 loading primitives；P4.3c 已完成 data display、layout surface 與 native Dialog／ConfirmDialog primitives；P4.3d 已完成 page contract 與四組代表頁 presentation 整合；P4.3e 已完成跨切片、正確 migration schema、browser、accessibility 與品質 gate總體驗證。P4.3因此完成，但只代表 Design System及四組 representative integration完成，不表示全部ERP頁面已遷移。

P4.3 可以：

- 建立 semantic design token 層（color、typography、spacing、radius、border、shadow、z-index、focus、motion、disabled 狀態）。
- 建立第 16 節列出的共用 primitive：Button、Icon button、Input、Select、Searchable combobox、Date input、Textarea、Checkbox、Radio、Badge、Data table primitives、Pagination、Tabs、Card、Section header、Dialog、Confirmation、Toast、Inline alert、Inline validation、Error summary、Form layout、Skeleton、Empty state、Error state、Breadcrumb（沿用 P4.2）、Page header（固定 contract）、Description list、Document summary。
- 固定每個元件的 variant、size、disabled、pending、focus、error 與 accessibility contract。
- 以 Home、Customers list、Admin Item create/list、Delivery Notes list 四組代表頁驗證元件，不全面重構業務頁內容；Sales Order editor 與 Delivery Note detail 留待 P4.5／P4.6。
- 建立可執行的 component-level DOM interaction tests，補足現有僅有的 SSR markup／source-contract tests。

P4.3 不可以：

- 全面遷移全部業務頁的外層 frame、內容或表單（屬 P4.4～P4.6）。
- 修改 schema、migration、RBAC、session、state machine、transaction、audit、idempotency、正式列印或 P5 domain。
- 把 OQ-053／OQ-054 仍未決的 canonical redirect、filter preservation、完整 route 順序或 legacy layout 例外假裝成已核准細節。

## 2. 治理依賴

- DEC-061 已固定未來 `SYSTEM_ADMIN`／`COMPANY_ADMIN` 雙層管理方向；現有後端仍以 `ADMIN`／`ORDER_ENTRY` 與既有 permission、company scope、session contract 運作。P4.3 不得把未來治理名稱誤寫成已存在的 role code。
- OQ-052 已由 DEC-061 關閉；現有 `ADMIN` 到未來模型的 role mapping、migration 與 authorization 實作須另案設計及核准，不阻塞 P4.3a 的 presentation primitives。
- OQ-053 已固定一般業務頁只使用 active company，以及跨公司管理必須使用明確標示的「管理公司」scope；只保留 canonical redirect、safe filter preservation 與各 route 遷移細節於 P4.4 前確認。
- OQ-054 已固定 P4.3 的 page contract、P4.3d 代表頁遷移及 P4.4～P4.6 全面遷移；只保留完整 route 順序與例外清單於 P4.4 前確認。
- P4.3a 不修改 route、page migration、RBAC、session、schema、migration 或 authorization implementation，因此不受上述後續實作細節阻塞。

## 3. Current-state 摘要

完整現況見本次對話的 P4.3 唯讀盤點（Git 基線 `caf5208d`，未產出 tracked 文件）。本節僅摘要作為本 SPEC 決策依據：

- 正式共用元件目前只有 `web/src/components/app-shell/`（11 個 Shell 元件）；不存在 generic `components/ui` 或跨模組 Design System 目錄。
- `globals.css` 同時承擔 root baseline、Shell tokens、Shell 元件樣式；業務頁大量使用 Tailwind utility，形成雙軌。
- 重複最明顯的 exact class：`rounded-lg border px-3 py-2`（63 次）、`mt-1 w-full rounded-lg border px-3 py-2`（55 次）、`text-sm font-medium`（34 次）、`rounded-lg border px-4 py-2`（22 次）、`text-3xl font-bold`（21 次）、`mx-auto min-h-screen max-w-6xl px-6 py-12`（17 次）。
- Focus ring（`--shell-focus`）只涵蓋 `a/button/select/[tabindex]`，未涵蓋 `input`／`textarea`（`web/src/app/globals.css:36`）。
- Dialog／confirmation 不一致：Delivery Note 局部 `role="dialog"` 無 focus trap／Escape／focus return；Sales Order 作廢使用 `window.prompt`；多處管理頁使用 `window.confirm`。
- `PageHeader` 只有 Home 採用；其餘 17 個頁面自行輸出 `max-w-4xl/5xl/6xl/7xl` 外層 frame，與 Shell `PageContainer` 形成巢狀寬度。
- 至少 9 類頁面（Customers、Items、Pricing lookup、Freight quote、Admin Customers/Items/Pricing/Freight Rules/Master Import）仍以 URL `companyId` 驅動頁面本地 company selector，與 Shell session `selectedCompany` 並存。
- 依賴現況：`package.json` 無 UI framework、icon library、form state library、toast library、dialog/popover library、React Testing Library、jsdom/happy-dom、Storybook、Playwright、Cypress；Vitest 環境固定為 `node`，現有互動測試皆為 SSR markup 字串比對，非真實 DOM 事件模擬。

## 4. V4 visual 與 design token contract

### 4.1 視覺方向

V4 採克制型企業 ERP：淺灰藍頁面背景、白色 surface、深 slate 文字與導覽，以 teal 表示主要操作、focus 與選取狀態。層級主要由 border、spacing 與 alignment 建立；一般內容使用低陰影或無陰影、小圓角，適合長時間桌面操作，並在 360px viewport 保留必要操作能力。

正式設計禁止大圓角 SaaS 卡片風格、漸層、玻璃效果、高飽和多色、大量陰影、過大標題，以及把每個 section 都包成 card。

Token 分兩層：既有 `--shell-*` 暫時保留並可映射至 generic semantic tokens，避免 P4.3a 重寫 P4.2；新 token 不重新定義 Shell 已固定的 sidebar／header 尺寸與 z-index。

### 4.2 Semantic color

```css
--color-page-background: #f8fafc;
--color-surface: #ffffff;
--color-surface-subtle: #f1f5f9;
--color-surface-muted: #e2e8f0;

--color-text: #0f172a;
--color-text-secondary: #475569;
--color-text-muted: #64748b;
--color-text-inverse: #ffffff;

--color-border: #dbe3ea;
--color-border-strong: #94a3b8;

--color-primary: #0f766e;
--color-primary-hover: #115e59;
--color-primary-active: #134e4a;
--color-primary-subtle: #f0fdfa;

--color-danger: #b91c1c;
--color-danger-hover: #991b1b;
--color-danger-subtle: #fef2f2;

--color-success: #047857;
--color-success-subtle: #ecfdf5;

--color-warning: #b45309;
--color-warning-subtle: #fffbeb;

--color-info: #0369a1;
--color-info-subtle: #f0f9ff;

--color-focus: #0f766e;
--color-overlay: rgb(15 23 42 / 55%);
```

共用元件只接受 `neutral`、`primary`、`info`、`success`、`warning`、`danger` semantic tone；任意 Tailwind 色名不得成為 component API。

### 4.3 Font 與 typography

正式 UI font stack：

```css
system-ui,
-apple-system,
BlinkMacSystemFont,
"Segoe UI",
"Microsoft JhengHei",
sans-serif
```

正式 mono stack：

```css
ui-monospace,
"SFMono-Regular",
Menlo,
Consolas,
monospace
```

正式系統不依賴 Google Fonts，也不得建立 remote font request。V4 原型中的 IBM Plex 只代表比例與風格參考，不是 production dependency。

| 用途 | 規格 |
| --- | --- |
| Page title | 25px／600 |
| Document number | 22px／600／mono |
| Dialog title | 18px／600 |
| Section title | 13px／600 |
| Card title | 15px／600 |
| Body／control | 13.5～14px |
| Label | 13.5px／600 |
| Helper／error | 12px |
| Table body | 13px |
| Table header | 11px／600 |
| Status badge | 11.5px／600 |
| Navigation | 13.5px |
| Navigation group | 10.5px |

每頁只允許一個 `h1`。

### 4.4 Radius、motion 與 focus

```css
--radius-control: 4px;
--radius-card: 3px;
--radius-dialog: 4px;

--duration-fast: 120ms;
--duration-normal: 180ms;
--easing-standard: ease-out;
```

既有頁面在遷移前可暫時保留 `rounded-lg/xl/2xl` 等舊 class，但它們不是新 Design System contract。既有 Shell loading 1.4 秒是實作細節，不是 generic motion token。

所有 link、button、input、textarea、select、checkbox、radio 與可互動 `[tabindex]` 元素的 `:focus-visible` 必須符合：

```css
outline: 3px solid var(--color-focus);
outline-offset: 2px;
```

P4.3a 已將 global focus-visible 補正至 `input`／`textarea`，並保留 P4.2 App Shell focus 行為。

其他 token 僅建立元件實際需要的 spacing、border、低陰影、z-index 與 disabled 值；不建立完整 Tailwind scale、dark mode、多品牌 theme、未有需求的 density 組合或正式列印 token。

## 5. Component 清單與 contract 總覽

| 元件 | 分類 | Server-safe | 現況證據 |
| --- | --- | --- | --- |
| Button | Base control | 是（無 state 時） | Button variant 分散於全站 |
| IconButton | Base control | 是 | Shell menu/close 已有 pattern |
| LinkButton | Base control | 是 | 多頁以 styled `Link` 模擬按鈕 |
| Input | Form | 是 | 55+ 次重複 control class |
| Textarea | Form | 是 | 作廢理由等少量存在 |
| Select | Form | 是 | 原生 select 廣泛使用 |
| Searchable combobox | Form | 否（需 client 狀態） | 第 20 節要求品項明細改用；目前為超長原生 select |
| Date input | Form | 是 | 訂單/單據日期欄位現況為原生 date input |
| Checkbox | Form | 是 | Admin users/items/customers 已使用 |
| Radio | Form | 是 | 尚無正式實作，依實際需求建立 |
| Field | Form | 是 | 各頁重複組合 `<label>` |
| FormError／ErrorSummary | Feedback | 是 | 多為單一 `<p role="alert">` |
| FormActions | Form | 是 | 多種 flex button row |
| Alert／Inline alert | Feedback | 是 | Shell notice 與多頁 `role=alert` 並存 |
| Toast | Feedback | 否 | 不存在；P4.3 預設不建立，見 §12 |
| Card／Section header | Layout | 是 | `rounded-2xl border bg-white` 重複多處 |
| Table primitives | Data display | 是 | Customers/Items/detail table 各自實作 |
| Pagination | Data display | 是 | Customers/Items/Delivery Notes各自實作 |
| Tabs | Data display | 否 | 目前無現況需求，延後至代表頁出現實際需求 |
| StatusBadge | Data display | 是 | Delivery Note 局部已實作 |
| DescriptionList／Document summary | Data display | 是 | DN `SummaryField` 及多個 `<dl>` |
| EmptyState | Feedback | 是 | Shell 及多頁文字版本並存 |
| LoadingState／Skeleton | Feedback | 部分（動畫需 CSS-only） | Shell 與 Delivery Note 各一套 |
| ErrorState | Feedback | 是 | `ShellErrorState` 已存在，偏 Shell |
| Dialog | Overlay | 否 | Drawer 有完整 modal；DN 確認僅局部 `role=dialog` |
| ConfirmDialog | Overlay | 否 | 原生 `confirm`/`prompt` 與 DN 局部確認並存 |
| Breadcrumb | Navigation | 是 | P4.2 已建立，沿用不重做 |
| PageHeader | Page | 是 | P4.2 已定義 API，只有 Home 採用 |
| PageContainer | Page | 是 | P4.2 已建立，Shell 全站包覆 |

無互動、無 client-only DOM 行為的元件預設維持 server-safe（不加 `"use client"`），避免既有 Server Component 被迫 client 化。

## 6. Base control 元件 API

```ts
type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
type ControlSize = "small" | "medium";

type ButtonProps = {
  variant?: ButtonVariant; // 預設 "primary"
  size?: ControlSize; // 預設 "medium"
  pending?: boolean; // true 時 disabled 且顯示忙碌文字，防止重複觸發
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

type IconButtonProps = {
  variant?: ButtonVariant;
  size?: ControlSize;
  pending?: boolean;
  accessibleName: string; // 必填；無 accessibleName 時元件必須無法通過型別檢查
  icon: ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label">;

type LinkButtonProps = {
  variant?: ButtonVariant;
  size?: ControlSize;
  href: string;
  children: ReactNode;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "children" | "aria-disabled">;
```

- Button／IconButton／LinkButton 共享同一組視覺樣式函式，但保留各自語意（`button` vs `a`）。
- 三者允許合理傳遞對應原生 attributes；IconButton 由 `accessibleName` 產生 accessible name，LinkButton API 不提供 `aria-disabled` 假連結模式。
- Button variant 只允許 `primary`、`secondary`、`ghost`、`destructive`；size 只允許 `small`（34px）與預設 `medium`（38px）。
- `pending` 必須防止重複操作、設定 disabled 與 `aria-busy="true"`、保留按鈕寬度並顯示明確 pending label；P4.3a 不建立 Spinner，也不得只降低 opacity。
- LinkButton 保留 link semantics；disabled link 不作為公開 API。不可導覽時，使用端不輸出 link或改輸出非互動元素；不得以 Button 包住 Link。
- IconButton 的 icon-only hit area 最低 44×44 CSS px，`accessibleName` 為必要 API；只使用 repository-native SVG，不以 emoji 或 Unicode 字元作正式 icon。P4.3a 建立足以驗證 contract 的最小 icon set，不新增大型 icon package。

## 7. Form 元件 API

```ts
type FieldControlProps = {
  id?: string;
  required?: boolean;
  "aria-required"?: AriaAttributes["aria-required"];
  "aria-invalid"?: AriaAttributes["aria-invalid"];
  "aria-describedby"?: string;
};
type FieldProps = {
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactElement<FieldControlProps>;
  className?: string;
};

type FieldErrorProps = ComponentPropsWithoutRef<"p"> & {
  children: ReactNode;
  // 預設不使用 role="alert"；由 Field 的 aria-describedby 關聯
};

type InputProps = {
  size?: ControlSize;
  invalid?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>;

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  size?: ControlSize;
  invalid?: boolean;
};

type SelectProps = {
  size?: ControlSize;
  invalid?: boolean;
} & React.SelectHTMLAttributes<HTMLSelectElement>;

type ComboboxOption = { value: string; label: string; secondaryLabel?: string };
type SearchableComboboxProps = {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  invalid?: boolean;
  disabled?: boolean;
  accessibleName: string;
};

type CheckboxProps = {
  label: string;
  invalid?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

type RadioGroupProps = {
  label: string;
  name: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
};

type ErrorSummaryItem = { fieldId?: string; message: string };
type ErrorSummaryProps = {
  title: ReactNode;
  message?: ReactNode;
  errors?: ErrorSummaryItem[];
  id?: string;
  className?: string;
  // 輸出 role="alert"、tabIndex=-1；focus 移動由使用端流程負責
};

type FormActionsProps = {
  primary: ReactNode;
  secondary?: ReactNode | ReactNode[];
  destructive?: ReactNode;
  align?: "start" | "end";
  className?: string;
};
```

- `Field` 以單一原生 control child 組合：保留使用端明確 `id`，缺少 `id` 時以 React `useId` 產生穩定 ID；合併既有與 description／error 的 `aria-describedby`，error 存在時設定 `aria-invalid`，required 同步至原生 control 及可存取 label。Field 不管理 value、form state、validation、mutation 或 business rule。
- `FieldError` 只呈現單欄錯誤並由 control 的 `aria-describedby` 關聯，預設不使用 `role="alert"`。`ErrorSummary` 負責 server submit 後的立即錯誤語意，固定 `role="alert"`／`tabIndex=-1` 並允許欄位 anchor；自動 focus 不由 server-safe presentation primitive 執行。
- `FormActions` 以明確 slots 保證 destructive、secondary、primary 的結構；desktop 次要 action 位於主要 action 左側，360px 轉為滿寬垂直排列。它不管理 submit、pending 或 mutation，action 視覺沿用 P4.3a Button／LinkButton。
- P4.3a 的 Input／Textarea／Select 在 Field 尚未實作前仍須完整傳遞 `aria-invalid`、`aria-describedby`、`required`、`disabled`、`readOnly` 與其他原生 attributes；最低高度 38px、字級 14px。Select 必須使用原生 `<select>`，placeholder 不取代 label，invalid 不得只靠背景色，也不導入 form state library。
- Checkbox 必須輸出原生 `<input type="checkbox">`，支援 checked、disabled、required、invalid、`aria-describedby` 與其他原生 attributes；desktop row 最低 40px，行動版可點擊區最低 44px，不得以 `div` 模擬。
- `SearchableCombobox` 取代第 20 節要求的品項明細長原生 select；本身為 client-only。
- Radio 只在後續切片或代表頁出現實際需求時建立，不是 P4.3a 強制項目。

## 8. Feedback、data display 與 overlay 元件 API

```ts
type AlertTone = "info" | "success" | "warning" | "danger";
type AlertProps = {
  tone: AlertTone;
  title?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode | false;
  role?: AriaRole;
  "aria-live"?: "off" | "polite" | "assertive";
  // info／warning 預設非 live；success=status；danger=alert；可依情境覆寫
};

type EmptyStateVariant = "no-data" | "no-results" | "permission-limited";
type EmptyStateProps = {
  variant: EmptyStateVariant;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
};

type LoadingStateProps = {
  label?: string; // 預設「載入中」，整體輸出 role="status"
  children?: ReactNode; // 可組合 Skeleton，不建立 route-level abstraction
  "aria-live"?: "off" | "polite" | "assertive";
};

type ErrorStateProps = {
  title: string;
  description: string; // 安全文字，不含 stack/SQL/raw exception
  correlationId?: string;
  retry?: ReactNode;
  secondaryAction?: ReactNode;
};

type SkeletonProps = {
  variant?: "text" | "block" | "circle";
  width?: number | `${number}%`;
  height?: number | `${number}%`;
  lines?: number; // text 限 1～5 行
  // aria-hidden；由 LoadingState 提供 announcement；reduced-motion 停用 pulse
};

type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";
type StatusBadgeProps = {
  label: string; // 繁體中文語意文字，不顯示原始 enum
  tone: StatusTone;
  // 必須同時使用文字、形狀／icon 與色彩，不得只靠顏色
};

type CardProps = NativeDivProps & {
  variant?: "default" | "subtle";
  padding?: "small" | "medium";
};
type SectionProps = NativeSectionProps & {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  divider?: boolean;
  headingAs?: "h2" | "h3" | "h4";
};

type TableAlignment = "left" | "center" | "right";
// TableContainer、Table、TableCaption、TableHeader、TableBody、TableRow、
// TableHead、TableCell、TableEmptyRow 各自傳遞對應原生 attributes。
// TableHead 預設 scope="col"，仍可指定 scope="row"；Head／Cell 支援
// align、numeric、monospace；TableEmptyRow 明確接受 colSpan。

type PaginationProps = {
  currentPage: number;
  totalPages: number;
  previousHref?: string; // 使用端提供已清理且保留安全 query 的 URL
  nextHref?: string;
  ariaLabel?: string;
};

type DescriptionListProps = NativeDlProps & { columns?: 1 | 2 | 3 | 4 };
// DescriptionItem／DescriptionTerm／DescriptionDetails 分別組合 wrapper、dt、dd。

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  dismissible?: boolean;
  pending?: boolean;
  closeLabel?: string;
};

type ConfirmDialogProps = {
  open: boolean;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
};
```

- `Table` 是原生 tag composition primitives，不接受 columns／rows／renderer schema，也不建立 sorting／filtering／selection／query adapter；資料與互動邏輯留在頁面與既有 API。`TableContainer` 以 inline-size containment 將 620px table 最小內容寬度限制在資料區內，360px 時只有資料區水平捲動，且不預設建立 `tabIndex`。
- `Pagination` 只呈現上一頁、目前頁與下一頁；href 由使用端提供已清理 URL。邊界頁的 disabled control 不輸出 anchor，元件不複製未知 query、不管理 route 或資料查詢。
- `Dialog` 以 portal 包裝原生 `<dialog>`／`showModal()`，是 `ConfirmDialog` 的唯一底層；兩者是 P4.3c 唯一 client primitives。Dialog 內建 explicit initial focus、focus containment、Escape／native cancel、預設 backdrop dismiss、focus return、reduced motion 與 reference-counted body scroll lock。`pending` 或 `dismissible={false}` 時阻擋 dismiss。
- `ConfirmDialog` 的 DOM 順序固定為取消在左、確認在右；預設初始焦點為取消。pending 時關閉、取消及確認皆 disabled，設定 `aria-busy`，並阻擋 Escape、backdrop 與重複 confirm；children 可組合 Field，但不建立 PromptDialog。
- `StatusBadge`、`Alert` 只接受 semantic tone；domain enum 對應 tone／label 的 mapping 留在各模組 adapter，不寫入共用元件。Alert 的 info／warning 預設非 live region、success 預設 `role="status"`、danger 預設 `role="alert"`，使用端可依訊息出現時機覆寫 role／`aria-live`。
- `EmptyState` 的 no-data、no-results、permission-limited 只描述資料可見性，不承擔 server error 或大型 onboarding。`LoadingState` 統一 `role="status"` 與可理解 label；`Skeleton` 本身 decorative、無 live region，且只提供 text／block／circle 三種有限形狀。

## 9. PageHeader／PageContainer 固定 contract 與 migration boundary

- P4.3d 已在不重做 P4.2 App Shell 的前提下正式化 `PageHeaderProps`／`PageContainerProps`；App Shell 仍持有唯一 outer container、breadcrumb、`id="main-content"`、skip link 與 route announcer。
- `PageContainer` width contract 固定為 `standard`（960px）、`wide`（1280px）、`full`（無 max-width）。P4.2 `default` 相容映射至 `wide`、`narrow` 相容映射至 `standard`；既有 App Shell 明確使用 legacy `default`，待 P4.4～P4.6 全面遷移後再移除相容 API。
- `PageHeader` 正式支援 title、description、optional context／eyebrow、actions、optional metadata 與 width variant 宣告；輸出唯一 `h1`，不輸出 `<main>`，並保留 P4.2 action slots 相容期。
- route page 以 `PageHeader.containerVariant` 宣告寬度；App Shell 透過 CSS `:has()` 同步唯一 PageContainer 與 Breadcrumb 寬度，不加入 client pathname registry、不建立巢狀 container，也不迫使 Server Component client 化。
- 每個完成遷移的 route 不得保留 page-local outer `max-w-*`／padding frame；一般返回首頁 action 應由 Breadcrumb 取代，只有既有特殊流程且需保留 href 行為時例外。
- P4.3d 實際遷移 Home、Customers list、Admin Item create/list、Delivery Notes list 四組代表頁；Sales Order editor、Delivery Note detail／print／void 及其餘頁面於 P4.4～P4.6 依模組全面遷移。
- OQ-054 只保留完整 route 遷移順序、legacy layout 例外與過渡相容細節於 P4.4 前確認；不得再重開上述已固定邊界。

## 10. Company context 顯示責任

- 依 DEC-061，未來系統管理採 `SYSTEM_ADMIN` 與 `COMPANY_ADMIN` 雙層模型：前者負責平台及跨公司治理，後者只管理明確授權公司；所有公司級操作同時通過 permission 與 company scope。
- 一般業務頁只使用 session active company。Shell header 的 `selectedCompany` 是既有顯示用信任 context；頁面不得呈現可能與 Shell 不同步的平行公司資訊。
- `SYSTEM_ADMIN` 進行跨公司管理時，UI 必須以「管理公司」明確標示獨立 admin scope，不得把它偽裝成一般 active-company context。
- `COMPANY_ADMIN` 不得指派 `SYSTEM_ADMIN`、擴大自身 scope 或管理未授權公司；系統至少保留一個有效 `SYSTEM_ADMIN`。
- 上述是 UI、資訊架構及未來 authorization contract，不表示現有後端已具有 `SYSTEM_ADMIN` 或 `COMPANY_ADMIN` role code。現有後端仍使用 `ADMIN`／`ORDER_ENTRY` 及既有 authorization；role mapping、RBAC、session、schema、migration 與 enforcement 另案審查。
- P4.3d 只改 presentation；Customers 與 Admin Items 的既有 page-local company selector、query 與 href preservation 原樣保留並明確列為 P4.4 待處理，不把未來 `SYSTEM_ADMIN`「管理公司」語意誤寫成現有後端能力。OQ-053 仍只保留 canonical redirect、safe filter preservation 與逐 route 遷移細節。

## 11. Accessibility contract

- 所有共用 interactive 元件（Button、IconButton、Input、Textarea、Select、Checkbox、Radio、SearchableCombobox）必須有可辨識 focus-visible，並擴大 `--shell-focus` token 涵蓋範圍至 `input`／`textarea`。
- `Field` 保證 label／description／error／`aria-describedby`／`aria-invalid`／`aria-required` 關聯。
- `Dialog`／`ConfirmDialog` 保證 focus trap、Escape 關閉、focus return、initial focus、背景 inert 或 overlay 阻擋互動。
- `pending`／`disabled` 狀態必須配合 `aria-busy`／`disabled`（或 `aria-disabled`），不得只用 opacity 表達。
- `Alert`／`ErrorState`／`FormErrorSummary` 依語意選擇 `role="alert"`（warning/error）或 `role="status"`（info/success）。
- `Table` 必須有 caption 或由 `TableContainer` 提供 accessible region label；橫向捲動只限資料區，容器不因捲動能力無必要建立 `tabIndex`。
- 所有動畫元件（Skeleton、Dialog、Drawer 既有行為）於 `prefers-reduced-motion: reduce` 時停用非必要動畫。
- IconButton 與行動版 Checkbox／Radio 可點擊區域最低為 44×44 CSS px；這是正式規則，不是候選值。
- 色彩對比僅能以程式推導排除明顯不合格組合；正式 WCAG AA 對比與 screen reader 驗證仍需人工瀏覽器測試，屬 §14 驗收項目而非本 SPEC 可單獨完成的靜態檢查。

## 12. 測試策略與 dependency 決策

- 現有 Vitest 環境固定 `node`，既有「互動測試」實際為 source 字串比對，不驗證真實 keyboard／focus 行為。
- P4.3a 的 pending 防重複與 accessible interaction 需要真實 click／keyboard／focus DOM test。實作時應先確認現有環境；若 node SSR 測試不足，才可引入 jsdom 或 happy-dom 加 React Testing Library 的最小組合，並在 P4.3a validation 記錄用途與必要性。不得散落加入不同工具。
- `Dialog` 若無法以 native `<dialog>` 或自製 div 可靠達成 focus-trap／Escape／focus-return 全部 contract，才核准導入最小 headless dialog primitive；預設先嘗試不新增 dependency 的實作。
- Toast 預設不建立（inline alert／inline feedback 優先）；只有代表頁驗證階段出現「跨頁保留訊息」的實際需求，才另案核准 Toast。
- Icon 預設使用 repository-native 小型 SVG 集合，不引入 icon package。
- 測試層次（對應 §14 實作切分）：
  1. Pure rendering：variant、size、disabled、pending、error 呈現。
  2. DOM interaction：click、keyboard、Escape、Tab cycle、focus return。
  3. Accessibility contract：accessible name、label/error 關聯、live region、`aria-busy`。
  4. Representative integration：四組代表頁的元件替換前後行為一致。
  5. Regression：既有 unit、API/domain、正式列印測試維持通過；P4.3 不需 DB tests。

## 13. 明確排除事項

P4.3 不得：

- 全面重構業務頁內容（Customers/Items/Pricing/Freight/Sales Orders/Delivery Notes 詳細流程屬 P4.4～P4.6）。
- 建立完整 DataTable engine（排序／selection／schema abstraction）。
- 建立完整 spacing／color scale、dark mode、多品牌 theme。
- 修改 schema、migration、RBAC、session、company authorization、API response contract、state machine、transaction、audit、idempotency、正式列印或 P5 domain。
- 把未來 `SYSTEM_ADMIN`／`COMPANY_ADMIN` contract 誤寫成現有後端已實作的 role、session 或 authorization 能力。
- 新增本文件未列出的 dependency（例外見 §12 的核准條件）。

## 14. 實作切分與驗收

P4.3a 的正式範圍只有 semantic tokens、Button、LinkButton、IconButton、Input、Textarea、Select、Checkbox、最小 repository-native SVG icon contract、rendering／accessibility tests 與 P4.3a implementation validation。

P4.3a 明確不包含 Field、FieldError、ErrorSummary、Alert、EmptyState、LoadingState、Skeleton、Table、Pagination、StatusBadge、Dialog、ConfirmDialog、Toast、PageHeader 全面遷移或代表頁整合；這些工作只能依下表進入後續切片。

| 切片 | 範圍 | 前置 | 驗收 |
| --- | --- | --- | --- |
| P4.3a | Semantic tokens、Button、LinkButton、IconButton、Input、Textarea、Select、Checkbox、最小 repository-native SVG icon contract、rendering／a11y tests、implementation validation | 本 SPEC 與 DEC-061 已同步 | §15.1 全部通過；不含 Field、feedback、data display、overlay 或代表頁整合 |
| P4.3b | Field、FormError／ErrorSummary、FormActions、Alert、LoadingState、EmptyState、Skeleton | ARIA contract、Toast 策略（預設不建） | label/error 關聯、live region、pending 防重 |
| P4.3c | Card、Section、Table primitives、Pagination、StatusBadge、DescriptionList、Dialog、ConfirmDialog | DataTable boundary（native composition-only）、native Dialog strategy | keyboard/focus、responsive overflow、destructive confirmation 順序 |
| P4.3d | PageHeader／PageContainer 目標 contract、最多四組代表頁整合 | OQ-053／054 剩餘 route 細節（若涉及） | `standard`／`wide`／`full`、無重複 outer container/h1/action frame；desktop／360px 人工驗證 |
| P4.3e | P4.3 總體 closure、跨切片文件與人工 a11y/visual 證據 | 前述切片各自品質 gate 已完成 | Git、package/schema/domain 範圍與代表頁證據齊全；不取代各切片 lint/typecheck/unit/build/validation |

## 15. Acceptance criteria

### 15.1 P4.3a 專屬驗收與停止條件

1. V4 semantic tokens 已建立並由核准 primitives 使用。
2. 系統 UI 與 mono font stack 已建立，沒有 Google Fonts 或其他 remote font request。
3. Focus-visible 涵蓋 link、button、input、textarea、select、checkbox、radio 與 tabindex control，且不破壞 P4.2。
4. Button 四 variants、small／medium 兩 sizes 與 34px／38px 尺寸完成。
5. Pending／disabled／`aria-busy`、防重複、保留寬度及 pending label contract 完成。
6. LinkButton 保留 link semantics，沒有一般 disabled API，也未以 Button 包住 Link。
7. IconButton 44px hit area、accessible name 及 repository-native SVG contract 完成。
8. Input／Textarea／Select 保留原生元素，傳遞 required／disabled／readOnly／ARIA／其他原生 attributes，invalid 不只靠背景色。
9. Checkbox 使用原生 input，支援 checked／disabled／required／invalid／`aria-describedby` 與最低操作區。
10. 足以證明 IconButton contract 的最小 SVG icon set 完成，未使用 emoji、Unicode icon 或大型 icon package。
11. 必要 rendering、DOM interaction 與 accessibility tests 通過；沒有以刪 assertion 或改 snapshot 掩蓋 regression。
12. `docs/P4_3A_DESIGN_TOKENS_BASE_CONTROLS_IMPLEMENTATION_VALIDATION.md` 完成。
13. P4.3a 自身的 lint、typecheck、unit tests 與 production build 全部通過；不得推遲至 P4.3e。
14. 未修改 schema、migration、RBAC、session、authorization、domain transaction、formal print 或 P5。
15. 未開始 P4.3b、PageHeader 全面遷移或代表頁整合；達成以上條件後停止。

### 15.2 P4.3b 專屬驗收與停止條件

1. Field 保留 explicit ID，缺少 ID 時產生穩定 ID，並正確組合 label、required、description、error、`aria-describedby` 與 `aria-invalid`。
2. FieldError 使用 danger token 且預設不濫用 live region；ErrorSummary 使用 `role="alert"`、`tabIndex=-1` 並支援一般錯誤與可選欄位連結。
3. ErrorSummary 是可聚焦 presentation target；提交後自動 focus 由使用端或代表頁 integration 負責，不迫使全部 form primitive client 化。
4. FormActions 保留 destructive／secondary／primary 的語意順序，desktop 水平、360px 垂直且 action 滿寬，並沿用 P4.3a Button／LinkButton。
5. Alert 只有 info／success／warning／danger semantic tones，預設 ARIA matrix 與 role／`aria-live` override 完成；icon decorative，訊息不只靠色彩或 icon。
6. EmptyState 完成 no-data／no-results／permission-limited，支援既有 action primitives，且不輸出 error live semantics。
7. LoadingState 使用 `role="status"` 與可理解 label；Skeleton 只有 text／block／circle，無獨立 live region，動畫使用 motion token並在 reduced-motion 停止。
8. 新增 info／check／warning／error repository-native SVG icons；未加入 icon package、form framework、toast library 或其他 dependency。
9. SSR、DOM、ARIA、responsive CSS 與 reduced-motion tests 通過；隔離 fixture 完成 desktop／360px 人工驗證。
10. `docs/P4_3B_FORM_FEEDBACK_IMPLEMENTATION_VALIDATION.md`、lint、typecheck、全部 unit tests 與 production build 完成。
11. 未修改業務頁、App Shell、schema、migration、RBAC、session、authorization、domain transaction、formal print 或 P5。
12. 未開始 P4.3c、P4.3d、P4.3e；達成以上條件後停止。

### 15.3 P4.3c 專屬驗收與停止條件

1. Card 只有 default／subtle 及 small／medium；一般 surface 無明顯陰影。Section 支援 title、description、actions、divider 與可選 h2／h3／h4，不產生 `<main>`。
2. Table primitives 保留 table／caption／thead／tbody／tr／th／td 原生語意、scope、alignment、numeric／mono 與 TableEmptyRow colSpan，不包含 columns schema 或 DataTable engine。
3. TableContainer 在 360px 只讓資料區水平捲動，不造成 viewport overflow，也不預設建立 tabindex。
4. Pagination 使用 nav 語意、caller-provided safe href；首／末頁 disabled control 不輸出 anchor，元件不管理 query 或 route state。
5. StatusBadge 只有五種 semantic tone，保留文字及 dot shape cue，不可互動且不接受 domain enum。
6. DescriptionList 使用 dl／dt／dd，支援 1～4 欄並於 360px 回到單欄。
7. Card、Section、Table、Pagination、StatusBadge、DescriptionList 均 server-safe；只有 Dialog／ConfirmDialog 為 client primitives。
8. Dialog 以 native `<dialog>`／portal 實作 controlled state、accessible title／description、initial focus、Tab／Shift+Tab containment、Escape／cancel、預設 backdrop dismiss、focus return、360px 與 reduced-motion contract。
9. body scroll lock 為 reference-counted、release idempotent，Dialog unmount 時清理；App Shell Drawer 共用同一 helper，不會提早恢復 scroll。
10. ConfirmDialog 建於 Dialog 上，取消在左且預設聚焦；destructive 使用既有 destructive Button，pending 停用 close／cancel／confirm、設定 aria-busy 並阻擋 Escape、backdrop及重複確認。
11. 未建立 PromptDialog、Toast、Tabs、DropdownMenu、Drawer、DataTable engine、sorting／filtering／selection 或 production page migration；未新增 dependency。
12. SSR／DOM／keyboard／CSS tests、隔離 fixture、desktop／360px 人工驗證、lint、typecheck、全部 unit tests 與 production build 全部通過。
13. `docs/P4_3C_DATA_DISPLAY_OVERLAY_IMPLEMENTATION_VALIDATION.md` 完成；未修改 schema、migration、RBAC、session、authorization、domain transaction、formal print 或 P5。
14. 未開始 P4.3d、P4.3e、P4.4 或 P5；達成以上條件後停止。

### 15.4 P4.3d 專屬驗收與停止條件

1. PageContainer 正式支援 standard／wide／full，並保留 default／narrow legacy mapping；App Shell 仍持有唯一 outer container。
2. PageHeader 支援 title、description、context、actions、metadata 與唯一 h1，不建立 main 或 client boundary。
3. Home、Customers list、Admin Item create/list、Delivery Notes list 完成 presentation 整合，移除重複 outer max-width／padding；既有 query、authorization、field names、payload、href 與 error behavior 不變。
4. Customers／Admin Items 的 legacy local company selector 保留；未新增 `SYSTEM_ADMIN`／`COMPANY_ADMIN` role、管理 scope、session 或 canonical redirect。
5. Sales Order editor、Delivery Note detail／print／void、其餘 production routes、全面 business page migration 與 P4.4～P5 均未開始。
6. SSR／DOM markup／integration tests、lint、typecheck、全部 unit tests、production build、desktop／360px、keyboard／focus／overflow 驗證全部完成。
7. `docs/P4_3D_PAGE_CONTRACT_REPRESENTATIVE_INTEGRATION_VALIDATION.md` 完成；未修改 schema、migration、RBAC、authorization、domain transaction、formal print 或 dependency。
8. 達成以上條件後停止；P4.3e 必須另案授權。

### 15.5 P4.3 總體驗收

- Token 層被各後續核准元件實際引用，不建立平行 ad hoc contract。
- 後續切片依 §14 分別完成元件、代表頁及 interaction／accessibility 驗證；每一切片都有自己的品質 gate。
- 代表頁 presentation 改變後，既有 domain、API 與授權行為不變。
- 未修改 schema、migration、RBAC、session、company authorization、API response contract、state machine、transaction、audit、idempotency、正式列印或 P5 契約。
- P4.3e 只做總體 closure，不取代 P4.3a～P4.3d 各自的 lint、typecheck、tests、build 與 validation。
- `docs/P4_3E_DESIGN_SYSTEM_CLOSURE_VALIDATION.md` 已完成，記錄component inventory、adoption matrix、static scan、disposable DB、representative routes、browser／a11y、完整gates與scope證據；P4.3總體驗收完成。

## 16. Risks and open issues

### 16.1 Non-blocking implementation risks

- `globals.css` 與頁面 utility雙軌若疊加第三層 component CSS，可能形成三套系統；P4.3 必須明定 `globals.css` 只保留 reset、token 與跨元件基礎樣式。
- Table 現況同時存在 table、grid link 與 card list 三種 pattern；composition primitive 若設計過寬，容易演變成過早的 DataTable engine。
- 多數 list/detail 現為 Server Component；元件若預設 `"use client"`，可能迫使非必要頁面 client 化，增加 bundle 體積。
- 四組代表頁之外的頁面在 P4.3 完成後仍會暫時維持雙軌（部分用新元件、部分用舊 class），需在 P4.4～P4.6 逐步收斂，屬預期過渡狀態而非缺陷。

### 16.2 Domain/governance follow-up

- OQ-052 已由 DEC-061 關閉；現有 `ADMIN` 如何映射至未來雙層模型，以及 role、permission、session、schema 與 migration 如何實作，須另案審查，不在 P4.3 內裁定。
- OQ-053 只保留 canonical redirect、safe filter preservation 與各 route 移除 page-local `companyId` 的細節；一般 active company 與明確「管理公司」scope 已固定。
- OQ-054 只保留 P4.4～P4.6 完整 route 遷移順序、legacy layout 例外及相容期；P4.3d 代表頁邊界與 `standard`／`wide`／`full` contract 已固定。

## 17. 變更紀錄

- V1.6（2026-08-01）：完成 P4.3e總體closure；重新驗證component inventory、V4 tokens、Server／Client boundary、PageContainer／PageHeader、static contracts、test coverage、disposable DB 0001～0012、四組代表route、desktop／360px、Dialog／focus／reduced-motion、lint、typecheck、302 tests與37-unit production build；修正User Menu 44px觸控高度。P4.4～P4.7仍未開始，未修改後端、資料庫、治理或P5。
- V1.5（2026-08-01）：完成 P4.3d PageContainer standard／wide／full、legacy compatibility、PageHeader 正式 API、App Shell 單一 container 寬度協調，以及 Home、Customers、Admin Items、Delivery Notes list 四組代表頁 presentation 整合與 SSR／integration／desktop／360px 驗證；P4.3e、全面 route migration、後端及資料庫均未開始或未變更。
- V1.4（2026-08-01）：同步 P4.3c Card／Section、native table composition、caller-provided Pagination、StatusBadge、semantic DescriptionList、native Dialog／ConfirmDialog、共享 body scroll lock、SSR／DOM／keyboard tests、360px／reduced-motion 視覺驗證與完整品質 gate；P4.3d～P4.3e 尚未開始。
- V1.3（2026-08-01）：同步 P4.3b Field／FieldError／ErrorSummary／FormActions／Alert／EmptyState／LoadingState／Skeleton、四個 feedback icons、ARIA matrix、SSR／DOM tests 與視覺驗證完成；正式 Alert tone 統一為 danger，P4.3c～P4.3e 尚未開始。
- V1.2（2026-08-01）：同步 P4.3a 實作與驗證完成狀態；設計方向與後續切片邊界不變，P4.3b～P4.3e 尚未開始。
- V1.1（2026-08-01）：核准 V4 唯一視覺基準、semantic colors、system font、typography、radius、motion、focus、P4.3a primitive 與專屬品質 gate；依 DEC-061 固定未來雙層管理 UI contract，關閉 OQ-052 並收斂 OQ-053／054；尚未開始程式實作。
- V1.0（2026-07-31）：依 P4.3 現況盤點初版草案；固定 token、component API、accessibility 與測試 contract；§9、§10 明確標示為待 OQ-052～054 核准的建議方案，未擅自裁定。
