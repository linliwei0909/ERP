# P4.4 Master Orchestration Preflight Validation

文件狀態：Ready for Orchestration
版本：V1.1
版本日期：2026-08-01

## 1. Git起始基線

- Branch：`main`
- HEAD／`origin/main`：`45af2d4bb2ea8658cd01708e7387efeaa98b608f`
- ahead／behind：`0 / 0`
- staged：空
- 差異只有前次核准的P4.4 preflight文件與受保護Blueprint。

## 2. Blueprint保護

只檢查status、size、modified time與SHA-256；20,880 bytes、`2026-07-27 11:03:17`、`930121B91B470DFF25596AE50309060155CF7C0F4B78251184EB13B493AF95B7`均相符。未開啟、搜尋、讀取、引用或修改內容。

## 3. Route Inventory摘要

Master Plan保留17個實際頁面routes：Customers 4、Items 4、Pricing 3、Company Settings／Users／其他既有Admin 6。P4.4a未開始。

## 4. CI Blocker根因與修正

`main@45af2d4` Actions service原映射`5432:5432`，`DATABASE_URL`與`P1_TEST_DATABASE_URL`亦使用localhost:5432；repository guard固定localhost:55432、role `p1_test`及含test/closeout、日期與unique suffix的database name。原`erp_p1_ci`也不符合命名contract，只因port先失敗而未顯示。

`.github/workflows/ci.yml`的host mapping改為`55432:5432`，兩個URL改用localhost:55432，database改為`erp_p4_4_ci_test_20260801_01`。Container health check仍在service內部使用PostgreSQL 5432，不需host port。所有migration、DB tests、schema diff與build仍共用同一隔離URL；無`DIRECT_URL`。

Port與database name對齊後，full DB run揭露兩個既有assertion將Delivery Note月份硬編碼為`202607`。Production使用`input.now ?? new Date()`及`taipeiBusinessDate()`，行為正確；測試以Vitest `useFakeTimers({toFake:["Date"]})`固定UTC `2026-07-14T16:30:00Z`（Asia/Taipei `2026-07-15 00:30`），並由`afterEach`恢復real timers。Prefix維持精確`YYYYMM`與六位sequence檢查，日期加強為精確`2026-07-15`；未修改production code。

## 5. Safety Guard未弱化證明

未修改`web/tests/helpers/test-database-safety.ts`、tests、application、schema或migrations。Guard仍要求local host、55432、dedicated role、disposable naming、兩個URL同target、runtime identity與clean database；不允許development/production target。

## 6. Local Disposable DB

Targeted database為`erp_p4_4_preflight_test_20260801_05`：12/12 migrations及`delivery-note-workflow.test.ts` 19/19 tests通過。Full database為`erp_p4_4_preflight_closeout_20260801_01`：依CI順序完成全部gates。兩者都使用localhost:55432、role `p1_test`與全新PostgreSQL 17 tmpfs container，建立前確認database不存在；密碼只在單一process使用且輸出已redact。驗證後database與containers均刪除，原`erp-p1-test-postgres`維持`exited`，development database未使用。

前置診斷用的一次性嘗試亦均已清理；最終readiness只採用上述targeted與full兩個未重用的fresh databases。

## 7. Quality Gates

| Gate | 結果 | 證據 |
| --- | --- | --- |
| Prisma validate/generate | 通過 | Prisma 7.8.0 schema valid、client generated |
| Fresh migrations | 通過 | 12/12 applied |
| lint | 通過 | ESLint exit 0 |
| typecheck | 通過 | Next typegen與TypeScript exit 0 |
| unit | 通過 | 32 files／302 tests |
| DB safety | 通過 | localhost:55432、guard-compliant name、role與cleanliness |
| Targeted DB | 通過 | 1 file／19 tests |
| DB tests | 通過 | 15 files／149 tests |
| schema diff | 通過 | No difference detected |
| production build | 通過 | 37 routes；既有1個NFT tracing warning |

月份相依修正未刪除、skip或放寬assertion；在固定Asia/Taipei日期下同時驗證公司碼、`202607` prefix、六位sequence、fiscal year/month與API serialized date。其後同檔其他tests及完整DB suite通過，證明timer已restore且未污染其他cases。

## 8. GitHub／CI／DB能力

GitHub CLI已登入且可讀Actions；repository permission為ADMIN，connector可建立Draft PR，feature branch/Draft PR fallback已在Master Plan固定。Docker/PostgreSQL 17、fresh disposable DB、migration、guard與完整本地CI等價能力均已證實。Push後仍須以該commit觸發的Actions run作最終外部確認。

## 9. Scope Proof

除核准的`web/tests/db/delivery-note-workflow.test.ts`外，未修改`web/src`、其他tests、package/lockfile、Prisma schema、migrations、DB safety helper、RBAC、session、API、business logic、production UI或Blueprint；未新增dependency、未建立feature branch或PR。

## 10. 結論

`READY FOR P4.4 MASTER ORCHESTRATION`

本結論以前述targeted與full local gates為依據；push後仍需GitHub Actions的install、migrations、lint、typecheck、unit、DB tests、schema diff與build全部成功。P4.4a未開始。
