// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  Alert,
  Button,
  EmptyState,
  ErrorSummary,
  Field,
  FieldError,
  FormActions,
  InfoIcon,
  Input,
  LinkButton,
  LoadingState,
  Select,
  Skeleton,
  Textarea,
} from "../../src/components/ui";

afterEach(cleanup);

describe("P4.3b Field and FieldError", () => {
  it("associates a generated stable control ID with its label", () => {
    const { rerender } = render(
      <Field label="客戶名稱">
        <Input name="customerName" />
      </Field>,
    );
    const input = screen.getByLabelText("客戶名稱");
    const generatedId = input.id;
    expect(generatedId).toMatch(/^field-/);

    rerender(
      <Field label="客戶名稱">
        <Input name="customerName" />
      </Field>,
    );
    expect(screen.getByLabelText("客戶名稱").id).toBe(generatedId);
  });

  it("preserves an explicit ID and combines existing, description and error IDs", () => {
    render(
      <Field
        label="公司代碼"
        description="顯示於公司文件"
        error="公司代碼不得空白"
        required
      >
        <Input id="company-code" aria-describedby="external-help" />
      </Field>,
    );
    const input = screen.getByLabelText(/公司代碼/) as HTMLInputElement;
    expect(input.id).toBe("company-code");
    expect(input.required).toBe(true);
    expect(input.getAttribute("aria-required")).toBe("true");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(
      "external-help company-code-description company-code-error",
    );
    expect(document.getElementById("company-code-description")?.textContent).toBe(
      "顯示於公司文件",
    );
    expect(document.getElementById("company-code-error")?.textContent).toBe(
      "公司代碼不得空白",
    );
  });

  it("derives the required indicator from a required native control", () => {
    render(
      <Field label="備註">
        <Textarea required />
      </Field>,
    );
    const textarea = screen.getByLabelText(/備註/) as HTMLTextAreaElement;
    expect(textarea.required).toBe(true);
    expect(screen.getByText("（必填）").className).toBe("sr-only");
  });

  it("composes with a native Select without inventing field state", () => {
    render(
      <Field label="公司" description="選擇目前作業公司">
        <Select defaultValue="a">
          <option value="a">甲公司</option>
        </Select>
      </Field>,
    );
    const select = screen.getByRole("combobox", { name: "公司" });
    expect(select.tagName).toBe("SELECT");
    expect(select.getAttribute("aria-invalid")).toBeNull();
    expect(select.getAttribute("aria-describedby")).toContain("-description");
  });

  it("renders FieldError with danger presentation and no alert role by default", () => {
    render(<FieldError id="name-error">請輸入名稱</FieldError>);
    const error = screen.getByText("請輸入名稱");
    expect(error.id).toBe("name-error");
    expect(error.className).toMatch(/fieldError/);
    expect(error.getAttribute("role")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("P4.3b ErrorSummary and FormActions", () => {
  it("renders an alert, focus target, safe message and field links", () => {
    render(
      <ErrorSummary
        id="form-errors"
        title="請修正以下問題"
        message="資料尚未送出。"
        errors={[
          { fieldId: "customer-name", message: "客戶名稱不得空白" },
          { message: "請確認表單內容" },
        ]}
      />,
    );
    const summary = screen.getByRole("alert");
    expect(summary.id).toBe("form-errors");
    expect(summary.getAttribute("tabindex")).toBe("-1");
    expect(screen.getByText("請修正以下問題")).toBeTruthy();
    expect(screen.getByText("資料尚未送出。")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "客戶名稱不得空白" })
        .getAttribute("href"),
    ).toBe("#customer-name");
    expect(screen.getByText("請確認表單內容").tagName).toBe("LI");
    expect(summary.textContent).not.toContain("stack");
  });

  it("remains valid without field-linked errors", () => {
    render(
      <ErrorSummary title="無法儲存" message="請稍後再試。" />,
    );
    expect(screen.getByRole("alert").querySelector("ul")).toBeNull();
  });

  it("keeps destructive, secondary and primary actions in explicit DOM order", () => {
    const { container } = render(
      <FormActions
        destructive={<Button variant="ghost">停用</Button>}
        secondary={<Button variant="secondary">取消</Button>}
        primary={<Button type="submit">儲存</Button>}
      />,
    );
    const buttons = [...container.querySelectorAll("button")];
    expect(buttons.map((button) => button.textContent)).toEqual([
      "停用",
      "取消",
      "儲存",
    ]);
    expect(buttons[2]?.getAttribute("type")).toBe("submit");
    expect(buttons[2]?.className).toMatch(/primary/);
  });

  it("exposes the approved alignment and responsive layout class contract", () => {
    const { container } = render(
      <FormActions
        align="start"
        secondary={<LinkButton href="/">返回</LinkButton>}
        primary={<Button>繼續</Button>}
      />,
    );
    const actions = container.firstElementChild;
    expect(actions?.getAttribute("data-align")).toBe("start");
    expect(actions?.className).toMatch(/formActions/);
    expect(screen.getByRole("link", { name: "返回" })).toBeTruthy();
  });
});

describe("P4.3b Alert", () => {
  it.each([
    ["info", null],
    ["success", "status"],
    ["warning", null],
    ["danger", "alert"],
  ] as const)("uses the approved %s default ARIA semantics", (tone, role) => {
    const { container } = render(<Alert tone={tone}>{tone}</Alert>);
    expect(container.firstElementChild?.getAttribute("data-tone")).toBe(tone);
    expect(container.firstElementChild?.getAttribute("role")).toBe(role);
  });

  it("allows a contextual role and live-region override", () => {
    render(
      <Alert tone="warning" role="status" aria-live="polite">
        即將到期
      </Alert>,
    );
    const alert = screen.getByRole("status");
    expect(alert.getAttribute("aria-live")).toBe("polite");
  });

  it("composes a title, body, action and decorative repository SVG", () => {
    render(
      <Alert
        tone="info"
        title="操作提示"
        actions={<LinkButton href="/help">查看說明</LinkButton>}
      >
        請先選擇公司。
      </Alert>,
    );
    expect(screen.getByText("操作提示")).toBeTruthy();
    expect(screen.getByText("請先選擇公司。")).toBeTruthy();
    expect(screen.getByRole("link", { name: "查看說明" })).toBeTruthy();
    expect(document.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("accepts an explicit decorative icon override", () => {
    render(<Alert icon={<InfoIcon />}>自訂圖示</Alert>);
    expect(document.querySelectorAll("svg")).toHaveLength(1);
  });
});

describe("P4.3b EmptyState, LoadingState and Skeleton", () => {
  it.each(["no-data", "no-results", "permission-limited"] as const)(
    "renders the %s empty-state meaning without error semantics",
    (variant) => {
      const { container } = render(
        <EmptyState variant={variant} title={variant} description="說明" />,
      );
      expect(container.querySelector("section")?.getAttribute("data-variant")).toBe(
        variant,
      );
      expect(screen.queryByRole("alert")).toBeNull();
    },
  );

  it("composes optional empty-state actions using existing primitives", () => {
    render(
      <EmptyState
        variant="no-results"
        title="查無結果"
        primaryAction={<Button>清除篩選</Button>}
        secondaryAction={<LinkButton href="/items">返回清單</LinkButton>}
      />,
    );
    expect(screen.getByRole("button", { name: "清除篩選" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "返回清單" })).toBeTruthy();
  });

  it("announces LoadingState once while Skeleton remains decorative", () => {
    render(
      <LoadingState label="正在載入客戶資料">
        <Skeleton variant="text" lines={2} />
      </LoadingState>,
    );
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("正在載入客戶資料");
    const skeleton = status.querySelector('[data-variant="text"]');
    expect(skeleton?.getAttribute("aria-hidden")).toBe("true");
    expect(skeleton?.getAttribute("role")).toBeNull();
    expect(skeleton?.querySelectorAll("span")).toHaveLength(2);
  });

  it.each(["text", "block", "circle"] as const)(
    "renders the finite %s Skeleton variant",
    (variant) => {
      const { container } = render(<Skeleton variant={variant} />);
      expect(container.firstElementChild?.getAttribute("data-variant")).toBe(variant);
      expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
    },
  );

  it("caps text skeleton lines to the finite design contract", () => {
    const { container } = render(<Skeleton lines={20} />);
    expect(container.querySelectorAll('[data-variant="text"] > span')).toHaveLength(5);
  });
});
