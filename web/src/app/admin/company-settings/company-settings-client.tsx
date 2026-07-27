"use client";

import { useState, type FormEvent } from "react";
import type { CompanySettingHistoryEntry } from "@/lib/company-settings/service";
import { COMPANY_SETTING_KEYS } from "@/lib/company-settings/registry";
import type { CompanySettingKey } from "@/lib/company-settings/registry";

type Company = {
  id: string;
  code: string;
  name: string;
};

function tomorrowDate(): string {
  const value = new Date();
  value.setDate(value.getDate() + 1);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;
  return body?.error?.message ?? "操作失敗，請稍後再試";
}

async function settingRequest(
  url: string,
  method: "POST" | "PATCH",
  body: unknown,
): Promise<void> {
  const response = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      "idempotency-key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }
}

export function CompanySettingsClient({
  companies,
  selectedCompanyId,
  selectedSettingKey,
  history,
}: {
  companies: Company[];
  selectedCompanyId: string;
  selectedSettingKey: CompanySettingKey;
  history: CompanySettingHistoryEntry[];
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const minimumDate = tomorrowDate();

  function selectCompany(companyId: string) {
    const params = new URLSearchParams({
      companyId,
      settingKey: selectedSettingKey,
    });
    window.location.assign(`/admin/company-settings?${params.toString()}`);
  }

  function selectSetting(settingKey: string) {
    const params = new URLSearchParams({
      companyId: selectedCompanyId,
      settingKey,
    });
    window.location.assign(`/admin/company-settings?${params.toString()}`);
  }

  function parseSettingValue(value: FormDataEntryValue | null) {
    return selectedSettingKey === COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY
      ? Number(value)
      : String(value ?? "");
  }

  async function createVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setBusyId("create");
    const form = new FormData(event.currentTarget);

    try {
      await settingRequest("/api/admin/company-settings", "POST", {
        companyId: selectedCompanyId,
        settingKey: selectedSettingKey,
        settingValue: parseSettingValue(form.get("settingValue")),
        effectiveFrom: form.get("effectiveFrom"),
      });
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "新增失敗");
      setBusyId(null);
    }
  }

  async function updateVersion(
    event: FormEvent<HTMLFormElement>,
    id: string,
  ) {
    event.preventDefault();
    setMessage(null);
    setBusyId(id);
    const form = new FormData(event.currentTarget);

    try {
      await settingRequest(
        `/api/admin/company-settings/${id}`,
        "PATCH",
        {
          companyId: selectedCompanyId,
          settingKey: selectedSettingKey,
          settingValue: parseSettingValue(form.get("settingValue")),
          effectiveFrom: form.get("effectiveFrom"),
        },
      );
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "修改失敗");
      setBusyId(null);
    }
  }

  async function cancelVersion(id: string) {
    if (!window.confirm("確定取消這個尚未生效的版本？")) {
      return;
    }
    setMessage(null);
    setBusyId(id);

    try {
      await settingRequest(
        `/api/admin/company-settings/${id}/cancel`,
        "POST",
        {
          companyId: selectedCompanyId,
          settingKey: selectedSettingKey,
        },
      );
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "取消失敗");
      setBusyId(null);
    }
  }

  return (
    <>
      <section className="mt-8 rounded-2xl border bg-white p-6">
        <label className="text-sm font-medium">
          管理公司
          <select
            value={selectedCompanyId}
            onChange={(event) => selectCompany(event.target.value)}
            className="mt-1 block w-full max-w-md rounded-lg border px-3 py-2"
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.code}－{company.name}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-4 block text-sm font-medium">
          設定鍵
          <select
            value={selectedSettingKey}
            onChange={(event) => selectSetting(event.target.value)}
            className="mt-1 block w-full max-w-md rounded-lg border px-3 py-2"
          >
            {Object.values(COMPANY_SETTING_KEYS).map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </label>
        {selectedSettingKey === COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY ? (
          <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
            短月份規則：超過當月最後一天時，以當月最後一天為準。
          </p>
        ) : null}
        {message ? (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {message}
          </p>
        ) : null}
      </section>

      <section className="mt-6 rounded-2xl border bg-white p-6">
        <h2 className="text-xl font-bold">新增未來版本</h2>
        <form
          onSubmit={createVersion}
          className="mt-4 grid gap-4 md:grid-cols-3"
        >
          <label className="text-sm font-medium">
            設定鍵
            <input
              value={selectedSettingKey}
              readOnly
              className="mt-1 w-full rounded-lg border bg-slate-50 px-3 py-2"
            />
          </label>
          <label className="text-sm font-medium">
            設定值
            <input
              type={
                selectedSettingKey ===
                COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY
                  ? "number"
                  : "text"
              }
              name="settingValue"
              min={
                selectedSettingKey ===
                COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY
                  ? 1
                  : undefined
              }
              max={
                selectedSettingKey ===
                COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY
                  ? 31
                  : undefined
              }
              step={
                selectedSettingKey ===
                COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY
                  ? 1
                  : undefined
              }
              required
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <label className="text-sm font-medium">
            生效日
            <input
              type="date"
              name="effectiveFrom"
              min={minimumDate}
              required
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
          <button
            disabled={busyId !== null}
            className="rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-50 md:col-span-3 md:justify-self-start"
          >
            {busyId === "create" ? "新增中…" : "新增版本"}
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-2xl border bg-white p-6">
        <h2 className="text-xl font-bold">設定歷程</h2>
        <div className="mt-4 space-y-4">
          {history.length === 0 ? (
            <p className="text-sm text-slate-500">尚無設定版本。</p>
          ) : (
            history.map((entry) => (
              <article
                key={`${entry.id}-${entry.state}-${entry.cancelledAt ?? ""}`}
                className="rounded-xl border p-4"
              >
                <div className="grid gap-3 text-sm md:grid-cols-4">
                  <div>
                    <div className="text-slate-500">設定鍵</div>
                    <div className="font-medium">{entry.settingKey}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">設定值</div>
                    <div className="font-medium">
                      {String(entry.settingValue)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">生效日</div>
                    <div className="font-medium">{entry.effectiveFrom}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">狀態</div>
                    <div className="font-medium">
                      {entry.state === "EFFECTIVE"
                        ? "已生效"
                        : entry.state === "FUTURE"
                          ? "尚未生效"
                          : "已取消"}
                    </div>
                  </div>
                </div>

                {entry.state === "FUTURE" ? (
                  <form
                    onSubmit={(event) => updateVersion(event, entry.id)}
                    className="mt-4 grid gap-3 border-t pt-4 md:grid-cols-3"
                  >
                    <label className="text-sm font-medium">
                      修改設定值
                      <input
                        type={
                          selectedSettingKey ===
                          COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY
                            ? "number"
                            : "text"
                        }
                        name="settingValue"
                        min={
                          selectedSettingKey ===
                          COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY
                            ? 1
                            : undefined
                        }
                        max={
                          selectedSettingKey ===
                          COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY
                            ? 31
                            : undefined
                        }
                        step={
                          selectedSettingKey ===
                          COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY
                            ? 1
                            : undefined
                        }
                        defaultValue={String(entry.settingValue)}
                        required
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                      />
                    </label>
                    <label className="text-sm font-medium">
                      修改生效日
                      <input
                        type="date"
                        name="effectiveFrom"
                        min={minimumDate}
                        defaultValue={entry.effectiveFrom}
                        required
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                      />
                    </label>
                    <div className="flex items-end gap-2">
                      <button
                        disabled={busyId !== null}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
                      >
                        儲存修改
                      </button>
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => cancelVersion(entry.id)}
                        className="rounded-lg border border-red-300 px-4 py-2 text-red-700 disabled:opacity-50"
                      >
                        取消版本
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className="mt-4 border-t pt-3 text-sm text-slate-500">
                    {entry.state === "EFFECTIVE"
                      ? "已生效版本僅供查看，不可直接修改或刪除。"
                      : `取消時間：${entry.cancelledAt ?? "—"}`}
                  </p>
                )}
              </article>
            ))
          )}
        </div>
      </section>
    </>
  );
}
