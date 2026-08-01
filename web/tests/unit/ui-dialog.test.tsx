// @vitest-environment jsdom

import {
  useRef,
  useState,
  type ReactNode,
} from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  Button,
  ConfirmDialog,
  Dialog,
  Input,
} from "../../src/components/ui";
import { acquireBodyScrollLock } from "../../src/lib/ui/body-scroll-lock";

const originalShowModal = HTMLDialogElement.prototype.showModal;
const originalClose = HTMLDialogElement.prototype.close;

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

afterAll(() => {
  if (originalShowModal) {
    HTMLDialogElement.prototype.showModal = originalShowModal;
  } else {
    delete (HTMLDialogElement.prototype as { showModal?: unknown }).showModal;
  }
  if (originalClose) {
    HTMLDialogElement.prototype.close = originalClose;
  } else {
    delete (HTMLDialogElement.prototype as { close?: unknown }).close;
  }
});

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

function DialogHarness({
  children,
  dismissible = true,
  initialFocus = false,
  pending = false,
}: {
  children?: ReactNode;
  dismissible?: boolean;
  initialFocus?: boolean;
  pending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const initialFocusRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        開啟對話框
      </button>
      <Dialog
        actions={<Button>儲存</Button>}
        description="對話框說明"
        dismissible={dismissible}
        initialFocusRef={initialFocus ? initialFocusRef : undefined}
        onOpenChange={setOpen}
        open={open}
        pending={pending}
        title="編輯資料"
      >
        <input ref={initialFocusRef} aria-label="名稱" />
        <button type="button" disabled>
          停用按鈕
        </button>
        <button type="button" hidden>
          隱藏按鈕
        </button>
        <button type="button">內容末端</button>
        {children}
      </Dialog>
    </>
  );
}

describe("P4.3c native Dialog", () => {
  it("opens through showModal in a body portal with accessible title and description", async () => {
    render(<DialogHarness />);
    fireEvent.click(screen.getByRole("button", { name: "開啟對話框" }));
    const dialog = await screen.findByRole("dialog", { name: "編輯資料" });
    expect(dialog.parentElement).toBe(document.body);
    expect((dialog as HTMLDialogElement).open).toBe(true);
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText("對話框說明")).toBeTruthy();
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("focuses an explicit initial target", async () => {
    render(<DialogHarness initialFocus />);
    fireEvent.click(screen.getByRole("button", { name: "開啟對話框" }));
    const input = await screen.findByRole("textbox", { name: "名稱" });
    await waitFor(() => expect(document.activeElement).toBe(input));
  });

  it("closes from its accessible close button and returns focus", async () => {
    render(<DialogHarness />);
    const trigger = screen.getByRole("button", { name: "開啟對話框" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("button", { name: "關閉對話框" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(document.body.style.overflow).toBe("");
  });

  it("handles the native cancel event once and returns focus", async () => {
    render(<DialogHarness />);
    const trigger = screen.getByRole("button", { name: "開啟對話框" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog");
    const cancelEvent = new Event("cancel", { bubbles: false, cancelable: true });
    dialog.dispatchEvent(cancelEvent);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(cancelEvent.defaultPrevented).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("closes from an Escape keydown when the browser does not emit cancel", async () => {
    render(<DialogHarness />);
    fireEvent.click(screen.getByRole("button", { name: "開啟對話框" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("closes on a backdrop mouse down by default", async () => {
    render(<DialogHarness />);
    fireEvent.click(screen.getByRole("button", { name: "開啟對話框" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.mouseDown(dialog);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("contains forward and reverse Tab focus while skipping disabled and hidden controls", async () => {
    render(<DialogHarness />);
    fireEvent.click(screen.getByRole("button", { name: "開啟對話框" }));
    const dialog = await screen.findByRole("dialog");
    const close = screen.getByRole("button", { name: "關閉對話框" });
    const last = screen.getByRole("button", { name: "儲存" });

    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(close);

    close.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    expect(document.activeElement).not.toBe(
      screen.getByRole("button", { name: "停用按鈕" }),
    );
  });

  it("keeps body scrolling locked until every owner releases", () => {
    document.body.style.overflow = "auto";
    const releaseDrawer = acquireBodyScrollLock();
    const releaseDialog = acquireBodyScrollLock();
    expect(document.body.style.overflow).toBe("hidden");
    releaseDrawer();
    expect(document.body.style.overflow).toBe("hidden");
    releaseDialog();
    expect(document.body.style.overflow).toBe("auto");
    releaseDialog();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("cleans body scroll lock when unmounted while open", async () => {
    const { unmount } = render(<DialogHarness />);
    fireEvent.click(screen.getByRole("button", { name: "開啟對話框" }));
    await screen.findByRole("dialog");
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});

function ConfirmHarness({
  children,
  destructive = false,
  pending = false,
  onConfirm = () => undefined,
}: {
  children?: ReactNode;
  destructive?: boolean;
  pending?: boolean;
  onConfirm?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        開啟確認
      </button>
      <ConfirmDialog
        confirmLabel="確認操作"
        description="此動作需要再次確認。"
        destructive={destructive}
        onCancel={() => setOpen(false)}
        onConfirm={onConfirm}
        open={open}
        pending={pending}
        title="確認變更"
      >
        {children}
      </ConfirmDialog>
    </>
  );
}

describe("P4.3c ConfirmDialog", () => {
  it("focuses cancel first and preserves cancel/confirm button order", async () => {
    render(<ConfirmHarness />);
    fireEvent.click(screen.getByRole("button", { name: "開啟確認" }));
    await screen.findByRole("dialog", { name: "確認變更" });
    const cancel = screen.getByRole("button", { name: "取消" });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    const buttons = screen.getAllByRole("button").filter((button) =>
      ["取消", "確認操作"].includes(button.textContent ?? ""),
    );
    expect(buttons.map((button) => button.textContent)).toEqual(["取消", "確認操作"]);
  });

  it("uses the destructive Button and calls confirm once", async () => {
    const onConfirm = vi.fn();
    render(<ConfirmHarness destructive onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "開啟確認" }));
    const confirm = await screen.findByRole("button", { name: "確認操作" });
    expect(confirm.className).toMatch(/destructive/);
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("supports optional children without creating PromptDialog", async () => {
    render(
      <ConfirmHarness>
        <Input aria-label="理由" />
      </ConfirmHarness>,
    );
    fireEvent.click(screen.getByRole("button", { name: "開啟確認" }));
    expect(await screen.findByRole("textbox", { name: "理由" })).toBeTruthy();
  });

  it("disables cancel and confirm and blocks cancel/backdrop while pending", async () => {
    const onConfirm = vi.fn();
    render(<ConfirmHarness pending onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "開啟確認" }));
    const dialog = await screen.findByRole("dialog");
    const cancel = screen.getByRole("button", { name: "取消" }) as HTMLButtonElement;
    const confirm = screen.getByRole("button", {
      name: /處理中/,
    }) as HTMLButtonElement;
    expect(dialog.getAttribute("aria-busy")).toBe("true");
    expect(cancel.disabled).toBe(true);
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    fireEvent.mouseDown(dialog);
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("returns focus after cancel", async () => {
    render(<ConfirmHarness />);
    const trigger = screen.getByRole("button", { name: "開啟確認" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("button", { name: "取消" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});

describe("P4.3c Dialog CSS contract", () => {
  it("keeps responsive sizing and reduced motion in the shared module", async () => {
    const css = await import("node:fs").then(({ readFileSync }) =>
      readFileSync("src/components/ui/ui.module.css", "utf8"),
    );
    expect(css).toContain("width: min(calc(100% - 32px), 560px);");
    expect(css).toContain("max-height: min(calc(100dvh - 32px), 720px);");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toMatch(/\.dialog\[open\],[\s\S]*?\.dialog::backdrop[\s\S]*?animation: none;/);
  });
});
