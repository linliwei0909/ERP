import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("P3.2e delivery-note page integration contracts", () => {
  it("gates the home delivery-note navigation by read permission", () => {
    const registry = source("src/lib/navigation/registry.ts");
    expect(registry).toContain('"delivery_notes.read"');
    expect(registry).toContain('href: "/delivery-notes"');
  });

  it("redirects unauthenticated and unauthorized list/detail page access", () => {
    for (const path of [
      "src/app/(authenticated)/delivery-notes/page.tsx",
      "src/app/(authenticated)/delivery-notes/[id]/page.tsx",
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
    const listPage = source(
      "src/app/(authenticated)/delivery-notes/page.tsx",
    );
    expect(listPage).toContain("銷貨單清單載入失敗");
    expect(listPage).toContain("viewData = undefined");

    for (const path of [
      "src/app/(authenticated)/sales-orders/delivery-note-order-actions.tsx",
      "src/app/(authenticated)/delivery-notes/[id]/delivery-note-actions.tsx",
    ]) {
      const action = source(path);
      expect(action).toMatch(/if \([^)]*busy\.current[^)]*\) return;/);
      expect(action).toContain("busy.current = true");
      expect(action).toContain("busy.current = false");
      expect(action).toContain("disabled={pending}");
      expect(action).toContain("router.refresh()");
    }
  });

  it("keeps P3.3d confirmation, cancel and same-operation retry boundaries", () => {
    const action = source(
      "src/app/(authenticated)/delivery-notes/[id]/delivery-note-actions.tsx",
    );
    expect(action).toContain('role="dialog"');
    expect(action).toContain("確認正式列印");
    expect(action).toContain(
      "此操作會將銷貨單與來源訂單標記為已出貨、寫入實際出貨日，並建立不可變的正式 PDF。",
    );
    expect(action).toContain(
      "if (busy.current || !dialog || !session.current) return;",
    );
    expect(action).toContain("if (!session.current)");
    expect(action).toContain("disabled={mutationPending}");
    expect(action).toContain("onClick={() => setDialog(null)}");
    expect(action).toContain(
      "正式列印已完成，但 PDF 下載失敗；請使用「下載 PDF」重試",
    );
    expect(action).toContain(
      "補印紀錄已完成，但 PDF 下載失敗；請只重試下載",
    );
  });
});
