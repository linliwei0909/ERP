export type BreadcrumbDynamicLabels = Partial<{
  customer: string;
  item: string;
  order: string;
  deliveryNote: string;
  priceList: string;
  freightRule: string;
  importBatch: string;
}>;

export type BreadcrumbItem = {
  label: string;
  href?: string;
  current?: boolean;
};

type BreadcrumbDefinition = {
  pattern: RegExp;
  build: (labels: BreadcrumbDynamicLabels) => BreadcrumbItem[];
};

const home = (): BreadcrumbItem => ({ label: "作業首頁", href: "/" });
const current = (label: string): BreadcrumbItem => ({
  label,
  current: true,
});

const definitions: BreadcrumbDefinition[] = [
  { pattern: /^\/$/, build: () => [current("作業首頁")] },
  {
    pattern: /^\/customers$/,
    build: () => [home(), current("客戶查詢")],
  },
  {
    pattern: /^\/customers\/[^/]+$/,
    build: (labels) => [
      home(),
      { label: "客戶查詢", href: "/customers" },
      current(labels.customer ?? "客戶明細"),
    ],
  },
  {
    pattern: /^\/items$/,
    build: () => [home(), current("品項查詢")],
  },
  {
    pattern: /^\/items\/[^/]+$/,
    build: (labels) => [
      home(),
      { label: "品項查詢", href: "/items" },
      current(labels.item ?? "品項明細"),
    ],
  },
  {
    pattern: /^\/pricing\/lookup$/,
    build: () => [home(), current("正式價格查詢")],
  },
  {
    pattern: /^\/freight\/quote$/,
    build: () => [home(), current("運費試算")],
  },
  {
    pattern: /^\/sales-orders$/,
    build: () => [home(), current("銷售訂單")],
  },
  {
    pattern: /^\/sales-orders\/new$/,
    build: () => [
      home(),
      { label: "銷售訂單", href: "/sales-orders" },
      current("新增訂單"),
    ],
  },
  {
    pattern: /^\/sales-orders\/[^/]+$/,
    build: (labels) => [
      home(),
      { label: "銷售訂單", href: "/sales-orders" },
      current(labels.order ?? "訂單明細"),
    ],
  },
  {
    pattern: /^\/delivery-notes$/,
    build: () => [home(), current("銷貨單")],
  },
  {
    pattern: /^\/delivery-notes\/[^/]+$/,
    build: (labels) => [
      home(),
      { label: "銷貨單", href: "/delivery-notes" },
      current(labels.deliveryNote ?? "銷貨單明細"),
    ],
  },
  {
    pattern: /^\/admin\/users$/,
    build: () => [home(), current("使用者與授權")],
  },
  {
    pattern: /^\/admin\/company-settings$/,
    build: () => [home(), current("公司設定")],
  },
  {
    pattern: /^\/admin\/customers$/,
    build: () => [home(), current("客戶主檔")],
  },
  {
    pattern: /^\/admin\/customers\/[^/]+$/,
    build: (labels) => [
      home(),
      { label: "客戶主檔", href: "/admin/customers" },
      current(labels.customer ?? "客戶明細"),
    ],
  },
  {
    pattern: /^\/admin\/items$/,
    build: () => [home(), current("品項主檔")],
  },
  {
    pattern: /^\/admin\/items\/[^/]+$/,
    build: (labels) => [
      home(),
      { label: "品項主檔", href: "/admin/items" },
      current(labels.item ?? "品項明細"),
    ],
  },
  {
    pattern: /^\/admin\/pricing$/,
    build: () => [home(), current("價格管理")],
  },
  {
    pattern: /^\/admin\/pricing\/[^/]+$/,
    build: (labels) => [
      home(),
      { label: "價格管理", href: "/admin/pricing" },
      current(labels.priceList ?? "價格明細"),
    ],
  },
  {
    pattern: /^\/admin\/freight-rules$/,
    build: () => [home(), current("運費規則")],
  },
  {
    pattern: /^\/admin\/freight-rules\/[^/]+$/,
    build: (labels) => [
      home(),
      { label: "運費規則", href: "/admin/freight-rules" },
      current(labels.freightRule ?? "運費規則明細"),
    ],
  },
  {
    pattern: /^\/admin\/master-import$/,
    build: () => [home(), current("主檔匯入")],
  },
  {
    pattern: /^\/admin\/master-import\/[^/]+$/,
    build: (labels) => [
      home(),
      { label: "主檔匯入", href: "/admin/master-import" },
      current(labels.importBatch ?? "匯入批次明細"),
    ],
  },
];

export function resolveBreadcrumbs(
  pathname: string,
  labels: BreadcrumbDynamicLabels = {},
): BreadcrumbItem[] {
  return (
    definitions.find((definition) => definition.pattern.test(pathname))?.build(
      labels,
    ) ?? [home(), current("目前頁面")]
  );
}
