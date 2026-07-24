import { describe, expect, it } from "vitest";
import {
  isRegisteredCompanySetting,
  validateCompanySetting,
} from "../../src/lib/company-settings/registry";

describe("company setting schema registry", () => {
  it("rejects keys that have not been registered by the application", () => {
    expect(isRegisteredCompanySetting("unknown.setting")).toBe(false);
    expect(() =>
      validateCompanySetting("unknown.setting", { value: true }),
    ).toThrow("未登錄的公司設定鍵");
  });
});
