# P1.2 帳號、Session、RBAC 與公司權限驗證紀錄

版本日期：2026-07-24

## 1. 安全範圍

- `0002_p1_authentication_and_access` 只套用至獨立 `erp-p1-test-postgres` container 的 P1 測試資料庫。
- 現有 `erp` 開發資料庫只執行 `BEGIN TRANSACTION READ ONLY` catalog、筆數與 fingerprint 查詢。
- 未執行 drop database、drop schema、`prisma migrate reset`、資料刪除、Docker volume 清除、現有 migration 修改或現有資料庫重建。
- `0001_p1_foundation_baseline` 內容未修改。

## 2. Migration

Active chain：

1. `0001_p1_foundation_baseline`
2. `0002_p1_authentication_and_access`

0002 只新增：

- `users.failed_login_attempts`，預設 0，並以 CHECK 保證不得小於 0。
- `users.locked_until` 及查詢 index。
- `users.default_company_id`、至 `companies.id` 的 RESTRICT FK 及 index。
- `user_sessions.selected_company_id`、至 `companies.id` 的 RESTRICT FK 及 index。
- `user_sessions.idle_expires_at` 的 PostgreSQL 8 小時預設值。

0002 未建立任何 P2 業務資料表。

## 3. 登入與 Session

- Username 先執行 NFKC、trim 與小寫正規化，再以 `normalized_username` 查詢。
- 密碼以 Node.js scrypt、隨機 salt 與 64-byte derived key 保存；驗證使用 `timingSafeEqual`。
- 不存在帳號也執行 dummy hash 驗證，登入失敗一律回傳相同錯誤。
- 連續失敗門檻及鎖定分鐘數由環境設定；鎖定為暫時性，成功登入後清除計數與 `locked_until`。
- 成功登入產生 32-byte opaque random token；browser 只取得 HttpOnly、SameSite=Lax cookie，production 另使用 Secure。
- DB 只保存 token 的 SHA-256 hash，不保存 token 原文。
- Session 保存 `last_activity_at` 與 `idle_expires_at`，閒置 8 小時到期；活動更新依環境設定節流。
- 登出撤銷目前 Session；管理員可撤銷指定使用者全部 Session。
- 帳號停用、有效 Session 全部撤銷及 audit log 在同一 transaction 完成。

## 4. RBAC 與公司 Scope

- 第一階段角色為 `ADMIN`、`ORDER_ENTRY`，權限判斷由後端執行。
- 每個受保護 request 由 server-side Session 建立 actor、session、role／permission、authorized companies 與 selected company context。
- 目前公司只能從 `user_company_scopes` 選擇；client 傳入未授權 `companyId` 時回傳 `COMPANY_ACCESS_DENIED`。
- 有效 Session 但沒有任何公司範圍時，不得進入受保護功能，會顯示一致的公司權限提示。
- 管理員可建立使用者、停用／重新啟用、指派角色、公司範圍與預設公司，以及撤銷全部 Session。
- 角色或公司範圍異動會撤銷既有 Session，避免舊 context 繼續使用。

## 5. 初始管理員

`npm run bootstrap:admin` 從環境變數取得 database 名稱確認、管理員帳密、公司代碼與公司名稱。目標 database 名稱與 `DATABASE_URL` 不一致時拒絕執行。建立公司、兩個角色、管理員、公司範圍、預設公司及 audit log 使用同一 transaction。

在 `erp_p1_test_c` 實際連續執行兩次：第一次建立管理員，第二次辨識 normalized username 已存在並停止，沒有重複使用者、角色、公司、指派或 audit。

## 6. 測試資料庫驗證

- `erp_p1_test_c`：DB／workflow integration tests 20/20 通過。
- `erp_p1_test_d`：由全新空白 database 依序套用 0001、0002 成功。
- `prisma migrate status`：2 migrations，database schema up to date。
- `prisma migrate diff --exit-code`：`No difference detected`，exit code 0。
- Prisma validate、generate 均通過。
- Unit tests 18/18、DB／workflow integration tests 20/20 通過。
- ESLint、TypeScript typecheck 與 Next.js production build 均通過。

## 7. 現有 `erp` 開發資料庫未變更證據

P1.2 前後以同一份 `scripts/db-fingerprint-readonly.sql` 查詢，兩次結果完全相同：

| 項目 | P1.2 前 | P1.2 後 |
| --- | --- | --- |
| Database／schema／PostgreSQL | `erp`／`public`／17.10 | 相同 |
| `_prisma_migrations` 筆數 | 19 | 19 |
| Columns fingerprint | `075aca42fa5c189bfd4e0ef3495b7980` | 相同 |
| Constraints fingerprint | `3fae7fb84885f36fc5e62b19b01aa891` | 相同 |
| Indexes fingerprint | `6cb016da0f786a81db2807065e983077` | 相同 |
| Migration fingerprint | `d22a753517533175fec6fbc411f913de` | 相同 |

所有資料表精確筆數亦相同。查詢在 read-only transaction 內執行並以 `ROLLBACK` 結束。

## 8. Vulnerability 影響分析

2026-07-24 執行 `npm audit --json`，結果為 7 項：moderate 3、high 4、critical 0。未執行 `npm audit fix` 或 `npm audit fix --force`。

| 套件 | 等級 | 關係 | Production runtime | 非 major 修正版 | 建議 |
| --- | --- | --- | --- | --- | --- |
| `next@16.2.10` | High | Direct | 是；包含 Proxy bypass、DoS、SSRF 與 cache 類問題，且 Proxy bypass 與本階段路由保護直接相關 | `16.2.11`，audit 標示非 major | 優先另案升級至 16.2.11，完整重跑測試與 build |
| Next 內含 `postcss@8.4.31` | High | Transitive | 是；由 Next production dependency 帶入 | 隨 Next 16.2.11 修正 | 與 Next 一併升級 |
| `sharp@0.34.5` | High | Optional transitive | 使用 Next image optimization 時影響 production | audit 指向 Next 16.2.11，非 major | 與 Next 一併升級並驗證 image path |
| `prisma@7.8.0` | Moderate | Direct devDependency | 否；限 migration／開發工具，不是 Web runtime | audit 顯示有修正，但未提供可直接確認的穩定版本 | 延後至 Prisma 套件組協調升級後驗證 |
| `@prisma/dev@0.24.3` | Moderate | Transitive devDependency | 否 | 由 Prisma 上游更新處理 | 與 Prisma 協調升級 |
| `@hono/node-server@1.19.11` | Moderate | Transitive devDependency | 本專案未以其提供 Web runtime；由 Prisma tooling 帶入 | advisory 修正版為 1.19.13 或 2.0.5 | 不單獨 override，交由 Prisma 升級處理 |
| `fast-uri@3.1.3` | High | Transitive devDependency | 否；dependency path 位於 Prisma tooling | audit 顯示有修正 | 交由 Prisma 上游更新；現階段接受受限的開發工具風險 |

本輪依使用者指示不自行升級。Next 16.2.11 是明確非 major 且與 authentication perimeter 相關，應在正式開放使用前另案核准並完成全套回歸。

## 9. 結論與下一個核准點

P1.2 功能及 isolated database 驗證完成後停止，不開始 P1.3 或 P2。正式開發資料庫重建仍屬破壞性操作；在取得使用者明確核准前不得執行。資料庫 migration chain 已具備重建技術條件，但實際操作前仍須另行審查正式資料庫備份、重建、forward 及失敗處理程序；Next 16.2.11 安全更新則應在正式開放使用前完成。
