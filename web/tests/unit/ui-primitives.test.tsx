// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  Button,
  Checkbox,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  IconButton,
  Input,
  LinkButton,
  MenuIcon,
  SearchIcon,
  Select,
  Textarea,
  type IconButtonProps,
} from "../../src/components/ui";

afterEach(cleanup);

describe("P4.3a Button", () => {
  it("renders primary medium button semantics by default", () => {
    render(<Button>儲存</Button>);
    const button = screen.getByRole("button", { name: "儲存" });
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.className).toMatch(/primary/);
    expect(button.className).toMatch(/medium/);
  });

  it.each(["primary", "secondary", "ghost", "destructive"] as const)(
    "renders the %s variant",
    (variant) => {
      render(<Button variant={variant}>{variant}</Button>);
      expect(screen.getByRole("button").className).toMatch(
        new RegExp(variant),
      );
    },
  );

  it.each(["small", "medium"] as const)("renders the %s size", (size) => {
    render(<Button size={size}>{size}</Button>);
    expect(screen.getByRole("button").className).toMatch(new RegExp(size));
  });

  it("passes native attributes and className", () => {
    render(
      <Button
        type="submit"
        name="intent"
        value="save"
        data-action="save"
        className="layout-extension"
      >
        儲存
      </Button>,
    );
    const button = screen.getByRole("button");
    expect(button.getAttribute("type")).toBe("submit");
    expect(button.getAttribute("name")).toBe("intent");
    expect(button.getAttribute("value")).toBe("save");
    expect(button.getAttribute("data-action")).toBe("save");
    expect(button.className).toContain("layout-extension");
  });

  it("prevents disabled and pending clicks", () => {
    const disabledClick = vi.fn();
    const pendingClick = vi.fn();
    const { rerender } = render(
      <Button disabled onClick={disabledClick}>
        停用
      </Button>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(disabledClick).not.toHaveBeenCalled();

    rerender(
      <Button pending pendingLabel="儲存中" onClick={pendingClick}>
        儲存
      </Button>,
    );
    const pendingButton = screen.getByRole("button");
    fireEvent.click(pendingButton);
    fireEvent.click(pendingButton);
    expect(pendingClick).not.toHaveBeenCalled();
    expect((pendingButton as HTMLButtonElement).disabled).toBe(true);
    expect(pendingButton.getAttribute("aria-busy")).toBe("true");
    expect(pendingButton.textContent).toContain("儲存中");
    expect(pendingButton.textContent).toContain("儲存");
  });
});

describe("P4.3a LinkButton and IconButton", () => {
  it("keeps Next Link anchor semantics and anchor attributes", () => {
    render(
      <LinkButton
        href="/customers"
        variant="secondary"
        size="small"
        target="_blank"
        rel="noreferrer"
        className="layout-extension"
      >
        客戶清單
      </LinkButton>,
    );
    const link = screen.getByRole("link", { name: "客戶清單" });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/customers");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noreferrer");
    expect(link.className).toMatch(/secondary/);
    expect(link.className).toMatch(/small/);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("uses an accessible name while keeping the SVG decorative", () => {
    render(
      <IconButton accessibleName="搜尋" icon={<SearchIcon />} />,
    );
    const button = screen.getByRole("button", { name: "搜尋" });
    const svg = button.querySelector("svg");
    expect(button.className).toMatch(/iconButton/);
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("stroke")).toBe("currentColor");
    expect(svg?.getAttribute("width")).toBe("18");
  });

  it("ships the approved minimal repository-native icon set", () => {
    const { container } = render(
      <>
        <MenuIcon />
        <CloseIcon />
        <SearchIcon />
        <ChevronLeftIcon />
        <ChevronRightIcon />
      </>,
    );
    const icons = container.querySelectorAll("svg");
    expect(icons).toHaveLength(5);
    for (const icon of icons) {
      expect(icon.getAttribute("aria-hidden")).toBe("true");
      expect(icon.getAttribute("focusable")).toBe("false");
      expect(icon.getAttribute("stroke")).toBe("currentColor");
    }
  });

  it("requires IconButton accessibleName at the type boundary", () => {
    // @ts-expect-error accessibleName is required for icon-only controls.
    const invalidProps: IconButtonProps = { icon: <SearchIcon /> };
    expect(invalidProps.icon).toBeDefined();
  });
});

describe("P4.3a native form controls", () => {
  it("passes Input states, ARIA and native attributes", () => {
    render(
      <Input
        name="customerCode"
        defaultValue="C001"
        readOnly
        required
        invalid
        aria-describedby="customer-code-help"
        data-field="customer-code"
        className="layout-extension"
      />,
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.tagName).toBe("INPUT");
    expect(input.readOnly).toBe(true);
    expect(input.required).toBe(true);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("customer-code-help");
    expect(input.getAttribute("data-field")).toBe("customer-code");
    expect(input.className).toContain("layout-extension");
  });

  it("renders a native disabled Textarea with described-by", () => {
    render(
      <Textarea
        aria-label="備註"
        disabled
        required
        invalid
        aria-describedby="notes-error"
        rows={4}
      />,
    );
    const textarea = screen.getByRole("textbox", {
      name: "備註",
    }) as HTMLTextAreaElement;
    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea.disabled).toBe(true);
    expect(textarea.required).toBe(true);
    expect(textarea.rows).toBe(4);
    expect(textarea.getAttribute("aria-invalid")).toBe("true");
    expect(textarea.getAttribute("aria-describedby")).toBe("notes-error");
  });

  it("renders a native Select and passes required invalid attributes", () => {
    render(
      <Select
        aria-label="公司"
        defaultValue=""
        required
        invalid
        aria-describedby="company-error"
      >
        <option value="" disabled>
          選擇公司
        </option>
        <option value="a">甲公司</option>
      </Select>,
    );
    const select = screen.getByRole("combobox", {
      name: "公司",
    }) as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    expect(select.required).toBe(true);
    expect(select.getAttribute("aria-invalid")).toBe("true");
    expect(select.getAttribute("aria-describedby")).toBe("company-error");
  });

  it("keeps native Checkbox checked, required, invalid and label semantics", () => {
    render(
      <Checkbox
        label="啟用銷售"
        defaultChecked
        required
        invalid
        aria-describedby="sales-help"
      />,
    );
    const checkbox = screen.getByRole("checkbox", {
      name: "啟用銷售",
    }) as HTMLInputElement;
    expect(checkbox.type).toBe("checkbox");
    expect(checkbox.checked).toBe(true);
    expect(checkbox.required).toBe(true);
    expect(checkbox.getAttribute("aria-invalid")).toBe("true");
    expect(checkbox.getAttribute("aria-describedby")).toBe("sales-help");
  });

  it("supports an accessible-name-only disabled Checkbox", () => {
    const onChange = vi.fn();
    render(
      <Checkbox aria-label="停用選項" disabled onChange={onChange} />,
    );
    const checkbox = screen.getByRole("checkbox", {
      name: "停用選項",
    }) as HTMLInputElement;
    checkbox.click();
    expect(checkbox.disabled).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });
});
