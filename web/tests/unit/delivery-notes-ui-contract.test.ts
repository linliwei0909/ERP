import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("P3.2e delivery-note page integration contracts", () => {
  it("gates the home delivery-note navigation by read permission", () => {
    const home = source("src/app/page.tsx");
    expect(home).toContain(
      'hasPermission(context.roleCodes, "delivery_notes.read")',
    );
    expect(home).toContain('href="/delivery-notes"');
  });

  it("redirects unauthenticated and unauthorized list/detail page access", () => {
    for (const path of [
      "src/app/delivery-notes/page.tsx",
      "src/app/delivery-notes/[id]/page.tsx",
    ]) {
      const page = source(path);
      expect(page).toContain(
        'requirePermission(context, "delivery_notes.read")',
      );
      expect(page).toContain(
        'if (error instanceof SessionAuthenticationError) redirect("/login")',
      );
      expect(page).toContain(
        'if (error instanceof AuthorizationError) redirect("/access-denied")',
      );
    }
  });

  it("keeps explicit list load-error and duplicate-submit guards", () => {
    const listPage = source("src/app/delivery-notes/page.tsx");
    expect(listPage).toContain("銷貨單清單載入失敗");
    expect(listPage).toContain("viewData = undefined");

    for (const path of [
      "src/app/sales-orders/delivery-note-order-actions.tsx",
      "src/app/delivery-notes/[id]/delivery-note-actions.tsx",
    ]) {
      const action = source(path);
      expect(action).toMatch(/if \([^)]*busy\.current[^)]*\) return;/);
      expect(action).toContain("busy.current = true");
      expect(action).toContain("busy.current = false");
      expect(action).toContain("disabled={pending}");
      expect(action).toContain("router.refresh()");
    }
  });
});
