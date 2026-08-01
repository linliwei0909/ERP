import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("P4.3a design token contract", () => {
  const globalCss = source("src/app/globals.css");
  const uiCss = source("src/components/ui/ui.module.css");

  it("defines the approved V4 semantic colors", () => {
    const colors = {
      "color-page-background": "#f8fafc",
      "color-surface": "#ffffff",
      "color-surface-subtle": "#f1f5f9",
      "color-surface-muted": "#e2e8f0",
      "color-text": "#0f172a",
      "color-text-secondary": "#475569",
      "color-text-muted": "#64748b",
      "color-text-inverse": "#ffffff",
      "color-border": "#dbe3ea",
      "color-border-strong": "#94a3b8",
      "color-primary": "#0f766e",
      "color-primary-hover": "#115e59",
      "color-primary-active": "#134e4a",
      "color-primary-subtle": "#f0fdfa",
      "color-danger": "#b91c1c",
      "color-danger-hover": "#991b1b",
      "color-danger-subtle": "#fef2f2",
      "color-success": "#047857",
      "color-success-subtle": "#ecfdf5",
      "color-warning": "#b45309",
      "color-warning-subtle": "#fffbeb",
      "color-info": "#0369a1",
      "color-info-subtle": "#f0f9ff",
      "color-focus": "#0f766e",
    };

    for (const [token, value] of Object.entries(colors)) {
      expect(globalCss).toContain(`--${token}: ${value};`);
    }
    expect(globalCss).toContain("--color-overlay: rgb(15 23 42 / 55%);");
  });

  it("defines the approved font, radius and motion contracts", () => {
    expect(globalCss).toContain('"Microsoft JhengHei", sans-serif');
    expect(globalCss).toContain('ui-monospace, "SFMono-Regular", Menlo');
    expect(globalCss).toContain("--radius-control: 4px;");
    expect(globalCss).toContain("--radius-card: 3px;");
    expect(globalCss).toContain("--radius-dialog: 4px;");
    expect(globalCss).toContain("--duration-fast: 120ms;");
    expect(globalCss).toContain("--duration-normal: 180ms;");
    expect(globalCss).toContain("--easing-standard: ease-out;");
    expect(globalCss).not.toMatch(/fonts\.googleapis|fonts\.gstatic|https?:\/\//);
  });

  it("covers every approved focus-visible target", () => {
    for (const selector of [
      "a:focus-visible",
      "button:focus-visible",
      "input:focus-visible",
      "textarea:focus-visible",
      "select:focus-visible",
      'input[type="checkbox"]:focus-visible',
      'input[type="radio"]:focus-visible',
      '[tabindex]:not([aria-disabled="true"]):focus-visible',
    ]) {
      expect(globalCss).toContain(selector);
    }
    expect(globalCss).toContain("outline: 3px solid var(--color-focus);");
    expect(globalCss).toContain("outline-offset: 2px;");
  });

  it("keeps the V4 control sizes, hit areas and reduced motion in one module", () => {
    expect(uiCss).toContain("height: 34px;");
    expect(uiCss).toContain("height: 38px;");
    expect(uiCss).toContain("width: 44px;");
    expect(uiCss).toContain("min-height: 40px;");
    expect(uiCss).toContain("min-height: 44px;");
    expect(uiCss).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("keeps every P4.3a primitive server-safe by default", () => {
    for (const path of [
      "src/components/ui/button.tsx",
      "src/components/ui/link-button.tsx",
      "src/components/ui/icon-button.tsx",
      "src/components/ui/input.tsx",
      "src/components/ui/textarea.tsx",
      "src/components/ui/select.tsx",
      "src/components/ui/checkbox.tsx",
      "src/components/ui/icons.tsx",
    ]) {
      expect(source(path)).not.toMatch(/^\s*["']use client["']/m);
    }
  });
});
