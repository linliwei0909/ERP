import { describe, expect, it } from "vitest";
import { errorResponse } from "../../src/lib/http";

describe("error response", () => {
  it("uses the shared error envelope", async () => {
    const response = errorResponse({
      code: "INVALID_INPUT",
      message: "輸入資料不正確",
      status: 400,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INVALID_INPUT",
        message: "輸入資料不正確",
      },
    });
  });
});
