// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerCreateClient } from "../../src/app/(authenticated)/admin/customers/customer-create-client";
import { CustomerManagerClient } from "../../src/app/(authenticated)/admin/customers/[id]/customer-manager-client";

const failedResponse = (message: string) =>
  ({
    ok: false,
    json: async () => ({ error: { message } }),
  }) as Response;

const managedCustomer = {
  id: "customer-a",
  customerType: "DOMESTIC" as const,
  name: "測試客戶",
  taxId: "12345678",
  countryCode: null,
  foreignIdentifier: null,
  status: "ACTIVE" as const,
  companyRelations: [
    {
      id: "relation-a",
      companyId: "company-a",
      customerCode: "C001",
      status: "ACTIVE" as const,
      company: { code: "A", name: "甲公司" },
    },
  ],
  contacts: [
    {
      id: "contact-a",
      name: "王小明",
      department: "採購",
      jobTitle: "經理",
      phone: "02-12345678",
      mobile: null,
      email: "buyer@example.com",
      notes: null,
      isPrimary: true,
      status: "ACTIVE" as const,
    },
  ],
  deliveryLocations: [
    {
      id: "location-a",
      code: "HQ",
      name: "總公司",
      recipientName: "王小明",
      phone: "02-12345678",
      postalCode: "100",
      city: "台北市",
      district: "中正區",
      addressLine: "測試路1號",
      notes: null,
      isDefault: true,
      status: "ACTIVE" as const,
    },
  ],
};

function formForButton(name: string): HTMLFormElement {
  const form = screen.getByRole("button", { name }).closest("form");
  if (!(form instanceof HTMLFormElement)) {
    throw new Error(`找不到 ${name} 所屬表單`);
  }
  return form;
}

function setFormValue(form: HTMLFormElement, name: string, value: string) {
  const control = form.elements.namedItem(name);
  if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) {
    throw new Error(`找不到欄位 ${name}`);
  }
  fireEvent.change(control, { target: { value } });
}

beforeEach(() => {
  vi.stubGlobal("crypto", { randomUUID: () => "test-idempotency-key" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("P4.4a Customers DOM interaction", () => {
  it("connects required fields and exposes native invalid presentation", () => {
    render(<CustomerCreateClient selectedCompanyId="company-a" />);

    const customerCode = screen.getByLabelText(/公司客戶代碼/);
    const customerName = screen.getByLabelText(/客戶名稱/);
    expect(customerCode.getAttribute("aria-required")).toBe("true");
    expect(customerName.getAttribute("aria-required")).toBe("true");
    expect((customerCode as HTMLInputElement).required).toBe(true);
    expect((customerCode as HTMLInputElement).checkValidity()).toBe(false);
    expect(screen.getByText("可留空。").id).toBe(
      screen.getByLabelText("統一編號").getAttribute("aria-describedby"),
    );
  });

  it("disables the create action while pending and renders an API error alert", async () => {
    let resolveRequest!: (response: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<CustomerCreateClient selectedCompanyId="company-a" />);

    fireEvent.change(screen.getByLabelText(/公司客戶代碼/), {
      target: { value: "C001" },
    });
    fireEvent.change(screen.getByLabelText(/客戶名稱/), {
      target: { value: "測試客戶" },
    });
    const submit = screen.getByRole("button", { name: "建立客戶" });
    fireEvent.submit(submit.closest("form")!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    expect(submit.getAttribute("aria-busy")).toBe("true");
    expect(submit.textContent).toContain("建立中…");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/customers");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      companyId: "company-a",
      customer: {
        customerType: "DOMESTIC",
        name: "測試客戶",
        taxId: "",
      },
      customerCode: "C001",
    });

    resolveRequest(failedResponse("客戶代碼已存在"));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "客戶代碼已存在",
    );
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    expect(submit.getAttribute("aria-busy")).toBeNull();
  });

  it("recovers customer create after a rejected fetch", async () => {
    let rejectRequest!: (reason: Error) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((_resolve, reject) => {
      rejectRequest = reject;
    })));
    render(<CustomerCreateClient selectedCompanyId="company-a" />);
    const submit = screen.getByRole("button", { name: "建立客戶" });
    fireEvent.submit(submit.closest("form")!);
    await waitFor(() => expect(submit.getAttribute("aria-busy")).toBe("true"));
    rejectRequest(new Error("網路連線失敗"));
    expect((await screen.findByRole("alert")).textContent).toContain("網路連線失敗");
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    expect(submit.getAttribute("aria-busy")).toBeNull();
  });

  it("preserves manager endpoints, method selection and payload construction", async () => {
    const fetchMock = vi.fn(async () => failedResponse("測試拒絕"));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <CustomerManagerClient
        selectedCompanyId="company-a"
        companies={[{ id: "company-a", code: "A", name: "甲公司" }]}
        customer={managedCustomer}
      />,
    );

    const submissions: Array<{
      button: string;
      fields?: Record<string, string>;
      url: string;
      method: "POST" | "PATCH";
      body: Record<string, unknown>;
    }> = [
      {
        button: "儲存客戶",
        fields: { name: "更新客戶" },
        url: "/api/customers/customer-a",
        method: "PATCH",
        body: {
          companyId: "company-a",
          customer: {
            customerType: "DOMESTIC",
            name: "更新客戶",
            taxId: "12345678",
            status: "ACTIVE",
          },
        },
      },
      {
        button: "新增或更新授權",
        fields: { customerCode: "C002" },
        url: "/api/customers/customer-a/companies",
        method: "POST",
        body: {
          companyId: "company-a",
          relation: { customerCode: "C002", status: "ACTIVE" },
        },
      },
      {
        button: "新增聯絡人",
        fields: { name: "新聯絡人", phone: "02-11111111" },
        url: "/api/customers/customer-a/contacts",
        method: "POST",
        body: {
          companyId: "company-a",
          value: {
            name: "新聯絡人",
            department: "",
            jobTitle: "",
            phone: "02-11111111",
            mobile: "",
            email: "",
            notes: "",
            isPrimary: false,
            status: "ACTIVE",
          },
        },
      },
      {
        button: "儲存聯絡人",
        url: "/api/customers/customer-a/contacts/contact-a",
        method: "PATCH",
        body: {
          companyId: "company-a",
          value: {
            name: "王小明",
            department: "採購",
            jobTitle: "經理",
            phone: "02-12345678",
            mobile: "",
            email: "buyer@example.com",
            notes: "",
            isPrimary: true,
            status: "ACTIVE",
          },
        },
      },
      {
        button: "新增地點",
        fields: {
          code: "BRANCH",
          name: "分公司",
          recipientName: "李小華",
          phone: "02-22222222",
          addressLine: "測試路2號",
        },
        url: "/api/customers/customer-a/locations",
        method: "POST",
        body: {
          companyId: "company-a",
          value: {
            code: "BRANCH",
            name: "分公司",
            recipientName: "李小華",
            phone: "02-22222222",
            postalCode: "",
            city: "",
            district: "",
            addressLine: "測試路2號",
            notes: "",
            isDefault: false,
            status: "ACTIVE",
          },
        },
      },
      {
        button: "儲存地點",
        url: "/api/customers/customer-a/locations/location-a",
        method: "PATCH",
        body: {
          companyId: "company-a",
          value: {
            code: "HQ",
            name: "總公司",
            recipientName: "王小明",
            phone: "02-12345678",
            postalCode: "100",
            city: "台北市",
            district: "中正區",
            addressLine: "測試路1號",
            notes: "",
            isDefault: true,
            status: "ACTIVE",
          },
        },
      },
    ];

    for (const [index, submission] of submissions.entries()) {
      const form = formForButton(submission.button);
      for (const [name, value] of Object.entries(submission.fields ?? {})) {
        setFormValue(form, name, value);
      }
      fireEvent.submit(form);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(index + 1));
      const [url, init] = fetchMock.mock.calls[index] as unknown as [
        string,
        RequestInit,
      ];
      expect(url).toBe(submission.url);
      expect(init.method).toBe(submission.method);
      expect(JSON.parse(String(init.body))).toEqual(submission.body);
      await waitFor(() =>
        expect(screen.getByRole("alert").textContent).toContain("測試拒絕"),
      );
    }
  });
});
