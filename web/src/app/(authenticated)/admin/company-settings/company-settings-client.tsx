"use client";

import { useState, type FormEvent } from "react";
import pageStyles from "@/components/app-shell/page-contract.module.css";
import { Alert, Button, Card, ConfirmDialog, EmptyState, Field, FormActions, Input, Section, Select, StatusBadge } from "@/components/ui";
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
  const [cancelId, setCancelId] = useState<string | null>(null);
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

  async function cancelVersion() {
    const id = cancelId;
    if (!id) return;
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
      setCancelId(null);
    }
  }

  return (
    <>
      <Card>
        <Section title="管理範圍" description="選擇授權公司與既有設定鍵。">
        <div className={pageStyles.formGrid}>
          <Field label="管理公司"><Select
            value={selectedCompanyId}
            onChange={(event) => selectCompany(event.target.value)}
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.code}－{company.name}
              </option>
            ))}
          </Select></Field>
          <Field label="設定鍵"><Select
            value={selectedSettingKey}
            onChange={(event) => selectSetting(event.target.value)}
          >
            {Object.values(COMPANY_SETTING_KEYS).map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </Select></Field>
        </div>
        {selectedSettingKey === COMPANY_SETTING_KEYS.BILLING_CUTOFF_DAY ? (
          <Alert tone="warning" title="短月份規則">超過當月最後一天時，以當月最後一天為準。</Alert>
        ) : null}
        {message ? <Alert tone="danger" title="操作失敗">{message}</Alert> : null}
        </Section>
      </Card>

      <Card>
        <Section title="新增未來版本" description="新版本必須從明日或未來日期生效。">
        <form onSubmit={createVersion} className={pageStyles.formGrid}>
          <Field label="設定鍵"><Input
              value={selectedSettingKey}
              readOnly
            /></Field>
          <Field label="設定值" required><Input
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
            /></Field>
          <Field label="生效日" required><Input
              type="date"
              name="effectiveFrom"
              min={minimumDate}
              required
            /></Field>
          <FormActions className={pageStyles.fullSpan} align="start" primary={<Button type="submit" pending={busyId === "create"} disabled={busyId !== null} pendingLabel="新增中…">新增版本</Button>} />
        </form>
        </Section>
      </Card>

      <Card>
        <Section title="設定歷程" description="已生效版本唯讀；尚未生效版本可修改或取消。">
        <div className={pageStyles.pageStack}>
          {history.length === 0 ? (
            <EmptyState variant="no-data" title="尚無設定版本" />
          ) : (
            history.map((entry) => (
              <article
                key={`${entry.id}-${entry.state}-${entry.cancelledAt ?? ""}`}
                className={pageStyles.pageStack}
              >
                <div className={pageStyles.formGrid}>
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
                    <StatusBadge label={entry.state === "EFFECTIVE" ? "已生效" : entry.state === "FUTURE" ? "尚未生效" : "已取消"} tone={entry.state === "EFFECTIVE" ? "success" : entry.state === "FUTURE" ? "info" : "neutral"} />
                  </div>
                </div>

                {entry.state === "FUTURE" ? (
                  <form
                    onSubmit={(event) => updateVersion(event, entry.id)}
                    className={pageStyles.formGrid}
                  >
                    <Field label="修改設定值" required><Input
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
                      /></Field>
                    <Field label="修改生效日" required><Input
                        type="date"
                        name="effectiveFrom"
                        min={minimumDate}
                        defaultValue={entry.effectiveFrom}
                        required
                      /></Field>
                    <FormActions className={pageStyles.fullSpan} align="start" primary={<Button type="submit" pending={busyId === entry.id} disabled={busyId !== null} pendingLabel="儲存中…">儲存修改</Button>} destructive={<Button type="button" variant="destructive" disabled={busyId !== null} onClick={() => setCancelId(entry.id)}>取消版本</Button>} />
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
        </Section>
      </Card>
      <ConfirmDialog open={cancelId !== null} title="取消未生效版本" description="確定取消這個尚未生效的版本？" confirmLabel="取消版本" destructive pending={cancelId !== null && busyId === cancelId} onCancel={() => setCancelId(null)} onConfirm={() => void cancelVersion()} />
    </>
  );
}
