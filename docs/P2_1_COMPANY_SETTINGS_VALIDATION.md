# P2.1 公司參數管理驗證紀錄

執行日期：2026-07-25（Asia/Taipei）  
同步基線：`DECISIONS.md` V0.4／DEC-051  
結論：P2.1 已完成；未開始 P2.2

## 1. 實作範圍

- 沿用既有 `company_settings`，未修改 `prisma/schema.prisma`。
- 未建立 0004 migration；0001、0002、0003 均未修改。
- 第一個正式設定鍵為 `billing_cutoff_day`。
- 值採 JSON number，應用層 Zod 驗證為 1 至 31 的 integer。
- 未登錄的 `setting_key` 一律拒絕。
- 找不到有效版本時回報 `COMPANY_SETTING_MISSING`，不套用預設值。

## 2. 有效版本與短月份

- `getEffectiveCompanySetting` 依公司、設定鍵及指定日期，取得 `effective_from <= effective_date` 中生效日最新的一筆。
- `getBillingCutoffDay` 回傳經 registry 驗證的切帳日。
- `resolveBillingCutoffDate` 依指定公司、年度及月份取得設定，當設定值超過當月最後一天時取月底。
- 已驗證 2 月、4 月及閏年 2 月。

## 3. 版本修改與取消

- 已生效版本不可直接修改、取消或刪除。
- 調整已生效值時必須新增生效日在今天之後的新版本。
- 未生效版本可以修改設定值及生效日。
- 未生效版本取消時，在同一 transaction：
  1. 驗證版本仍未生效。
  2. 保存完整 before-image audit。
  3. 刪除未生效設定列。
  4. 完成 idempotency 狀態。
- 設定歷程 API 合併現存版本及 `company_setting.future_cancelled` audit，因此取消版本仍可由管理頁查閱。
- 同公司、同設定鍵、同 `effective_from` 由既有 unique constraint 拒絕重複。

## 4. 權限、公司範圍、audit 與 idempotency

- 公司參數 API 及管理頁僅允許 `ADMIN`。
- 後端依 Session actor context 重新驗證目標 `company_id` 是否在 `authorizedCompanies`，不信任 client 傳入值。
- `ORDER_ENTRY` 寫入及無公司 scope 的讀寫均被拒絕。
- 新增、修改與取消分別記錄：
  - `company_setting.future_created`
  - `company_setting.future_updated`
  - `company_setting.future_cancelled`
- 寫入 API 必須提供 `Idempotency-Key`；相同 payload 重送回放原結果，不重複建立版本。
- correlation ID 使用既有 request context，並寫入 audit `request_id`。
- 設定異動、audit 及 idempotency 完成狀態位於同一 transaction；失敗時不留下部分設定或 audit。

## 5. API 與 UI

API：

- `GET /api/admin/company-settings`：查詢公司設定歷程，或以 `effectiveDate` 查詢有效設定。
- `POST /api/admin/company-settings`：新增未來版本。
- `PATCH /api/admin/company-settings/{id}`：修改未生效版本。
- `POST /api/admin/company-settings/{id}/cancel`：取消未生效版本。
- 所有錯誤使用 `{ error: { code, message, details? } }` 格式。

UI：

- `/admin/company-settings`
- 只列出登入者已授權公司。
- 顯示設定鍵、值、生效日、已生效／尚未生效／已取消狀態。
- 只有未生效版本顯示修改及取消操作。
- 已生效與已取消版本僅供查看。
- 頁面顯示「超過當月最後一天時，以當月最後一天為準」。

## 6. 初始資料

使用 `npm run bootstrap:company-settings` 的受控程序建立：

| 公司 | 設定鍵 | 值 | 生效日 |
| --- | --- | ---: | --- |
| `INDUSTRIAL` | `billing_cutoff_day` | 25 | 2026-07-25 |
| `BIOTECH` | `billing_cutoff_day` | 20 | 2026-07-25 |

程序要求：

- `DATABASE_URL`
- `BOOTSTRAP_DATABASE_NAME`
- `BOOTSTRAP_ADMIN_USERNAME`
- `BOOTSTRAP_COMPANY_SETTINGS_EFFECTIVE_FROM`

目標 database 名稱與 `BOOTSTRAP_DATABASE_NAME` 不同時拒絕執行。程序驗證管理員狀態、ADMIN 角色及兩家公司 scope；相同生效日及相同值重跑不新增資料或 audit。正式 `erp` 已連續執行兩次，第二次兩家公司均辨識為已存在。資料庫核對為兩筆設定及兩筆 `bootstrap.company_setting.created` audit。

## 7. 測試結果

Unit tests：

- 1、25、31 驗證成功。
- 0、32、小數、字串及 null 驗證失敗。
- 2 月、4 月及閏年月底截短。
- 指定日期有效版本選擇。
- 未登錄 key 及設定缺失。

DB／workflow tests：

- ADMIN 新增未來版本。
- ORDER_ENTRY 禁止寫入。
- 無公司 scope 拒絕。
- 唯一限制。
- 已生效版本不可修改或取消。
- 未生效版本可修改及取消。
- audit 與資料 transaction rollback。
- idempotency replay。
- 跨公司隔離。
- 有效版本日期邊界。
- 初始設定可重跑及兩家公司值核對。

最終執行結果：

| 檢查 | 結果 |
| --- | --- |
| `npm run prisma:validate` | 通過 |
| `npm run prisma:generate` | 通過 |
| `npm run lint` | 通過 |
| `npm run typecheck` | 通過 |
| `npm run test` | 9 files／36 tests 通過 |
| `npm run test:db` | 獨立 `erp_p1_3_final`，4 files／38 tests 通過 |
| `npm run build` | Next.js 16.2.11 production build 通過 |
| `prisma migrate status` | 3 migrations，database schema up to date |
| `prisma migrate diff --exit-code` | `No difference detected` |

## 8. Migration 與 schema 結論

- `web/prisma/schema.prisma` 無差異。
- `web/prisma/migrations/` 只有 0001、0002、0003。
- 未建立 0004。
- 既有三筆 migration SQL 的 Git diff 為空。
- `erp` schema 未因 P2.1 發生變更。
- P2.1 只新增兩筆經 audit 的正式公司設定資料。

## 9. P2.1 完成判定

P2.1 的 registry、型別安全解析、Service、ADMIN API、管理 UI、初始化、audit、idempotency、unit tests、DB workflow tests、production build 及文件同步均已完成。

Hosted CI 仍需在提交及 push 後由 GitHub Actions 驗證；這不改變本機 P2.1 完成判定。未取得下一步授權前不得開始 P2.2 或建立 0004 migration。
