import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  Button,
  Card,
  DescriptionDetails,
  DescriptionItem,
  DescriptionList,
  DescriptionTerm,
  Pagination,
  Section,
  StatusBadge,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableContainer,
  TableEmptyRow,
  TableHead,
  TableHeader,
  TableRow,
  type StatusTone,
} from "../../src/components/ui";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("P4.3c Card and Section", () => {
  it.each([
    ["default", "small"],
    ["subtle", "medium"],
  ] as const)("renders the %s Card with %s padding", (variant, padding) => {
    const markup = renderToStaticMarkup(
      <Card variant={variant} padding={padding}>內容</Card>,
    );
    expect(markup).toContain(`data-variant="${variant}"`);
    expect(markup).toContain(`data-padding="${padding}"`);
    expect(markup).not.toContain("box-shadow");
  });

  it("preserves selectable heading semantics and action composition", () => {
    const markup = renderToStaticMarkup(
      <Section
        title="基本資料"
        description="說明文字"
        headingAs="h3"
        divider
        actions={<Button>編輯</Button>}
      >
        內容
      </Section>,
    );
    expect(markup).toContain("<section");
    expect(markup).toContain("<h3");
    expect(markup).toContain("基本資料");
    expect(markup).toContain("說明文字");
    expect(markup).toContain("編輯");
    expect(markup).not.toContain("<main");
  });
});

describe("P4.3c semantic table primitives", () => {
  it("renders native table semantics, caption, scope and alignment", () => {
    const markup = renderToStaticMarkup(
      <TableContainer aria-label="訂單資料區">
        <Table>
          <TableCaption>訂單清單</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>單號</TableHead>
              <TableHead align="right" numeric>
                金額
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableHead scope="row" monospace>
                SO-001
              </TableHead>
              <TableCell align="right" numeric>
                1,200
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>,
    );
    for (const tag of ["table", "caption", "thead", "tbody", "tr", "th", "td"]) {
      expect(markup).toContain(`<${tag}`);
    }
    expect(markup).toContain('scope="col"');
    expect(markup).toContain('scope="row"');
    expect(markup).toContain('data-align="right"');
    expect(markup).not.toContain("tabindex");
  });

  it("renders TableEmptyRow as tr/td with the explicit colSpan", () => {
    const markup = renderToStaticMarkup(
      <Table>
        <TableBody>
          <TableEmptyRow colSpan={4}>查無資料</TableEmptyRow>
        </TableBody>
      </Table>,
    );
    expect(markup).toContain("<tr");
    expect(markup).toContain('<td colSpan="4"');
    expect(markup).toContain("查無資料");
  });

  it("keeps horizontal scrolling inside the data region", () => {
    const css = source("src/components/ui/ui.module.css");
    expect(css).toMatch(/\.tableContainer\s*\{[\s\S]*?min-width: 0;/);
    expect(css).toMatch(/\.tableContainer\s*\{[\s\S]*?max-width: 100%;/);
    expect(css).toMatch(/\.tableContainer\s*\{[\s\S]*?overflow-x: auto;/);
    expect(css).toMatch(/\.table\s*\{[\s\S]*?min-width: 620px;/);
  });
});

describe("P4.3c Pagination", () => {
  it("renders a disabled non-link previous control on the first page", () => {
    const markup = renderToStaticMarkup(
      <Pagination currentPage={1} totalPages={8} nextHref="?page=2&q=safe" />,
    );
    expect(markup).toContain('aria-label="分頁"');
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).toContain("第 1 / 8 頁");
    expect(markup).not.toContain('href="?page=0');
    expect(markup).toContain('href="?page=2&amp;q=safe"');
  });

  it("uses only caller-provided safe hrefs on a middle page", () => {
    const markup = renderToStaticMarkup(
      <Pagination
        currentPage={4}
        totalPages={8}
        previousHref="?page=3&status=active"
        nextHref="?page=5&status=active"
      />,
    );
    expect(markup).toContain('href="?page=3&amp;status=active"');
    expect(markup).toContain('href="?page=5&amp;status=active"');
    expect(markup).toContain('aria-current="page"');
    expect((markup.match(/<a /g) ?? [])).toHaveLength(2);
  });

  it("renders a disabled non-link next control on the last page", () => {
    const markup = renderToStaticMarkup(
      <Pagination currentPage={8} totalPages={8} previousHref="?page=7" />,
    );
    expect(markup).toContain("第 8 / 8 頁");
    expect((markup.match(/aria-disabled="true"/g) ?? [])).toHaveLength(1);
    expect((markup.match(/<a /g) ?? [])).toHaveLength(1);
  });
});

describe("P4.3c StatusBadge and DescriptionList", () => {
  it.each(["neutral", "info", "success", "warning", "danger"] as const)(
    "renders the semantic %s status with visible text and a shape cue",
    (tone) => {
      const markup = renderToStaticMarkup(
        <StatusBadge tone={tone} label={`${tone} 狀態`} />,
      );
      expect(markup).toContain(`data-tone="${tone}"`);
      expect(markup).toContain(`${tone} 狀態`);
      expect(markup).toContain('aria-hidden="true"');
      expect(markup).not.toContain("<button");
      expect(markup).not.toContain("href=");
    },
  );

  it("does not accept a domain enum at the type boundary", () => {
    // @ts-expect-error Domain enum values must map to a semantic tone outside the primitive.
    const invalidTone: StatusTone = "DELIVERY_CREATED";
    expect(invalidTone).toBe("DELIVERY_CREATED");
  });

  it.each([1, 2, 3, 4] as const)(
    "renders semantic dl/dt/dd with the %s-column contract",
    (columns) => {
      const markup = renderToStaticMarkup(
        <DescriptionList columns={columns}>
          <DescriptionItem>
            <DescriptionTerm>單號</DescriptionTerm>
            <DescriptionDetails>DOC-001</DescriptionDetails>
          </DescriptionItem>
        </DescriptionList>,
      );
      expect(markup).toContain("<dl");
      expect(markup).toContain("<dt");
      expect(markup).toContain("<dd");
      expect(markup).toContain(`data-columns="${columns}"`);
    },
  );

  it("collapses description columns through the approved responsive contract", () => {
    const css = source("src/components/ui/ui.module.css");
    expect(css).toContain("@media (max-width: 760px)");
    expect(css).toContain("@media (max-width: 560px)");
    expect(css).toMatch(/\.descriptionColumns2,[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/);
  });
});

describe("P4.3c server boundary", () => {
  it("keeps every non-overlay primitive server-safe", () => {
    for (const path of [
      "src/components/ui/card.tsx",
      "src/components/ui/section.tsx",
      "src/components/ui/table.tsx",
      "src/components/ui/pagination.tsx",
      "src/components/ui/status-badge.tsx",
      "src/components/ui/description-list.tsx",
    ]) {
      expect(source(path)).not.toMatch(/^\s*["']use client["']/m);
    }
  });
});
