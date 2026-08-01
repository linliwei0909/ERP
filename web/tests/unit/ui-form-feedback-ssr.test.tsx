import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  Alert,
  EmptyState,
  ErrorSummary,
  Field,
  FormActions,
  Input,
  LoadingState,
  Skeleton,
  Button,
} from "../../src/components/ui";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("P4.3b server rendering and CSS contracts", () => {
  it("server-renders the complete Field accessibility relationship", () => {
    const markup = renderToStaticMarkup(
      <Field label="客戶名稱" description="正式名稱" error="不得空白" required>
        <Input id="customer-name" />
      </Field>,
    );
    expect(markup).toContain('for="customer-name"');
    expect(markup).toContain('id="customer-name"');
    expect(markup).toContain('required=""');
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain(
      'aria-describedby="customer-name-description customer-name-error"',
    );
  });

  it("server-renders every P4.3b presentation primitive", () => {
    const markup = renderToStaticMarkup(
      <>
        <ErrorSummary title="請修正" message="資料未送出" />
        <FormActions primary={<Button>儲存</Button>} />
        <Alert tone="success">完成</Alert>
        <EmptyState variant="no-data" title="尚無資料" />
        <LoadingState label="載入中">
          <Skeleton variant="block" />
        </LoadingState>
      </>,
    );
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('data-variant="no-data"');
    expect(markup).toContain('data-variant="block"');
  });

  it("keeps P4.3b server-safe and uses approved responsive motion tokens", () => {
    for (const path of [
      "src/components/ui/field.tsx",
      "src/components/ui/field-error.tsx",
      "src/components/ui/error-summary.tsx",
      "src/components/ui/form-actions.tsx",
      "src/components/ui/alert.tsx",
      "src/components/ui/empty-state.tsx",
      "src/components/ui/loading-state.tsx",
      "src/components/ui/skeleton.tsx",
    ]) {
      expect(source(path)).not.toMatch(/^\s*["']use client["']/m);
    }

    const globalCss = source("src/app/globals.css");
    const uiCss = source("src/components/ui/ui.module.css");
    expect(globalCss).toContain("--duration-slow: 1440ms;");
    expect(uiCss).toContain("var(--duration-slow)");
    expect(uiCss).toContain("@media (max-width: 560px)");
    expect(uiCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(uiCss).toMatch(/\.loadingIndicator,[\s\S]*?\.skeleton[\s\S]*?animation: none;/);
  });
});
