# P3.3d Formal Print API／Download／UI Validation

日期：2026-07-28
基線：`5d7a4cf21a59aba24c8c18f695a75ced962ce3fb`

## 1. Scope

本切片完成 Delivery Note 首次正式列印、補印、正式 PDF read-only 下載、HTTP DTO／error mapping、detail metadata、UI 操作、browser download、client idempotency 及 API／UI／DB regression。

## 2. Exclusions

未修改 Prisma schema、migration、renderer、正式字型、font manifest、snapshot contract、P3.3c transaction、狀態規則或 P4 blueprint；未加入預覽、email、批次列印、template editor、object storage、background job 或 Range request。

## 3. Baseline commit

開始時 `main`、HEAD 與 `origin/main` 均為 `5d7a4cf21a59aba24c8c18f695a75ced962ce3fb`，ahead／behind `0/0`；唯一既存 untracked 是未讀寫、未 stage 的 `docs/INVENTORY_PRODUCTION_BLUEPRINT.md`。

## 4. Endpoint list

| Method | Path | Permission | Side effect |
| --- | --- | --- | --- |
| POST | `/api/delivery-notes/{id}/formal-print` | `delivery_notes.manage` | 呼叫 P3.3c 首次正式列印 transaction |
| POST | `/api/delivery-notes/{id}/reprint` | `delivery_notes.manage` | 呼叫 P3.3c 補印 transaction |
| GET | `/api/delivery-notes/{id}/pdf` | `delivery_notes.read` | 無；只讀 DB bytes |

三個 route 均使用 session selected company、company scope、correlation ID 及 Node runtime。POST 另驗證 same-origin 與 `Idempotency-Key`。

## 5. RBAC

未新增 permission 或 seed。首次正式列印及補印沿用 `delivery_notes.manage`；下載沿用 `delivery_notes.read`；`delivery_notes.admin_void` 保持獨立。

## 6. Company scope

Client 不傳入可信 company ID。Route 只使用 `context.selectedCompany.id`；service/query 同時驗證 authorized company 與資料 row 的 `company_id`。

## 7. Request DTO

兩個 POST 接受空 body 或 strict `{}`；拒絕未知欄位，不接受日期、狀態、版本、actor、PDF metadata／bytes 或 counter。ID 使用既有 UUID schema。

## 8. Response DTO

Mutation JSON 回傳 Delivery Note／Sales Order identity 與狀態、實際出貨日、首次列印摘要、reprint count、Print Version metadata、Print Event identity、stable download URL、replay 與 correlation ID；不含 PDF bytes/base64、Prisma object、font path、lock 或 raw audit metadata。

## 9. Idempotency header

沿用既有 `Idempotency-Key` parser（required、trim、最多 255 字元）與 P3.3c operation。Client 每個明確操作建立一個 key；同一次 timeout/retry 重用 key；下一次獨立補印建立新 key。

## 10. Error mapping

集中於 `mapDeliveryNoteApiError`：

| Category | HTTP |
| --- | --- |
| Invalid ID/body/key/JSON | 400 |
| Unauthenticated | 401 |
| Permission/company scope | 403 |
| Delivery Note/formal PDF missing | 404 |
| State/version/idempotency/concurrency conflict | 409 |
| Snapshot/font/PDF contract invalid | 422 |
| Storage integrity/unexpected renderer/database | 500 |

500 與 contract error 使用安全繁體中文訊息，不回傳 SQL、Prisma、stack、path、checksum detail、snapshot 或 bytes；既有 envelope 與 correlation ID 保持不變。

## 11. Formal print API

Route 只驗證 HTTP boundary 後呼叫 `formalPrintDeliveryNote`。成功為 `200 OK`，相同 key replay 保持 version/event identity；JSON 不含 binary。

## 12. Reprint API

Route 只呼叫 `reprintDeliveryNote`，不注入 renderer、不建立 Print Version、不更改首次摘要、日期或狀態。現有 P3.3c 契約只允許 `SHIPPED`；未在本切片擴張到 `RECEIVABLE_CREATED`。

## 13. Download API

授權後以獨立 select 取得唯一 Print Version 的 `pdf_bytes` 與必要 metadata；驗證 MIME、byte size、SHA-256、最小長度與 `%PDF-` magic，再回傳原 DB bytes；不 render。

## 14. Content-Disposition strategy

固定 `attachment`。Header 移除 CR/LF/control；提供安全 ASCII fallback，並以 RFC 5987 `filename*=UTF-8''...` 保留中文檔名。Caller 無法指定 filename。

## 15. Download／reprint side-effect separation

GET 不建立 event、不增加 counter、不寫 reprint audit、不更新狀態。POST reprint 才原子建立 `REPRINT` event、增加 counter、audit 與 idempotency completion。DB regression 連續兩次 GET 後仍只有原 `FORMAL_PRINT` event且 `reprint_count = 0`。

## 16. Detail API additions

Detail 新增 actual delivery date、首次列印時間／人、reprint count、formal PDF ID／filename／byte size／generated at/by 與 capability flags。未回傳 checksum（UI 不需要）或 PDF bytes。

## 17. UI capability rules

`ACTIVE`＋manage＋無 version顯示正式列印；`SHIPPED`＋manage＋有 version顯示補印；具 read 且有 version顯示下載；`VOIDED` 不顯示 mutation。Server-side permission仍是最終控制。

## 18. Formal print confirmation

Dialog 明示兩張單據轉已出貨、寫入實際出貨日及建立不可變 PDF。Pending期間同步 busy guard與 disabled；成功 refresh server detail後下載。下載失敗不重做 mutation。

## 19. Reprint flow

Dialog 明示只新增補印紀錄且不重新產生 PDF。Mutation成功後 refresh counter再純下載；下載失敗只提示重試下載，不重做補印。

## 20. Download helper

使用 same-origin authenticated fetch、檢查 HTTP status與 `application/pdf`、解析 filename、讀 Blob、建立 temporary object URL、觸發 anchor、finally remove/revoke。Blob不進 React state/storage/log；SSR無 browser API時 fail safe。

## 21. Loading／error handling

Formal mutation、reprint mutation與 download state分離。409會 refresh detail；typed public message保留；未知/network error使用安全訊息。Mutation timeout保留同一 session key供重試。

## 22. Client idempotency lifecycle

`createPrintMutationSession` 將 operation、Delivery Note與單一 random UUID綁定。Session retry不換 key；操作成功後 UI清除 session。Formal/reprint互不共用 session；download URL不含 key。

## 23. Server-only boundary

Route/server query依賴 Prisma／Node crypto；client僅 type-import response DTO，未 import Prisma、formal-print service、renderer、font、`pdf-lib`或 binary module。

## 24. Binary query strategy

List不 join Print Version。Detail只 select metadata與 generatedBy，明確不 select `pdfBytes`。只有 download query select binary；response與 Next cache不保存 binary，GET固定 `force-dynamic`、`private, no-store`。

## 25. Tests

新增 route boundary、strict DTO、central error mapping、download integrity/header/filename、capability、metadata render、mutation key lifecycle、Blob cleanup/SSR與 DB GET side-effect regression。

## 26. Commands and results

| Command | Result |
| --- | --- |
| `git diff --check` | passed |
| `npx prisma format` | passed，76ms；schema無 diff |
| `npm run prisma:validate` | passed |
| `npm run prisma:generate` | passed，Prisma Client 7.8.0，495ms |
| `npm run lint` | passed，0 errors／0 warnings |
| `npm run typecheck` | passed，含 Next route type generation |
| P3.3d targeted unit/API/UI | 5 files，82 passed，0 failed，0 skipped，3.55s |
| `npm test` | 22 files，178 passed，0 failed，0 skipped，約 3.20s |
| `npm run test:db` | 15 files，146 passed，0 failed，0 skipped，30.03s |
| `npm run build` | clean-output final passed；compile 17.1s、TypeScript 10.9s、37 static pages |

## 27. Disposable DB

沿用獨立 PostgreSQL test server建立 fresh disposable database；不連線或修改本機 `erp`。

## 28. Schema diff

本切片不修改 schema/migration；正式 gate必須由 fresh 0001～0012後確認 diff為零。

## 29. Build results

Next.js 16.2.11 production build passed，三個新增 API route均為 dynamic。前兩次 final rerun在編譯前因 OneDrive鎖住舊 `.next/static` reparse directory而發生 `EPERM unlink`；只清除可重建的 `web/.next`後，clean-output build通過。

Build warning為 `Encountered unexpected file in NFT list`，import trace是 `next.config.ts -> delivery-notes/font.ts -> renderer.ts -> formal-print.ts -> reprint/route.ts`。來源是 P3.3c以 `resolve(process.cwd(), manifest.repositoryAssetPath)`動態解析字型，使 server NFT manifest過度追蹤整個 `web`專案；production build仍以成功 exit code結束。Formal-print與 reprint route的 `.nft.json`均明確包含 `src/lib/delivery-notes/assets/NotoSansCJKtc-Regular.otf`，來源檔為 16,435,884 bytes且 SHA-256為 `dce08bd4fd91aa8aa76ed8fea4b694c2dfb8550f67871e326843212ddbeb88b4`，因此不是 runtime asset缺失警告。部署時必須依 NFT manifest封裝 traced files，或連同 `web/src/lib/delivery-notes/assets`並以 `web`為 working directory部署；不得只複製未含 traced source assets的 `.next`目錄。

此 warning不是 client bundle或 public asset exposure。`.next/static`搜尋 `NotoSansCJKtc-Regular`、`.otf`、renderer module path、font module path及 `pdf-lib`均零匹配，最大 client chunk 283,405 bytes；`public`沒有 OTF複本。Server NFT過度追蹤屬既有 P3.3c部署體積限制，本 Git收尾不重構字型載入。

## 30. Known limitations

- P3.3c reprint service目前只接受 `SHIPPED`，因此 capability同樣限制為 `SHIPPED`；`RECEIVABLE_CREATED` 尚未在目前可達流程出現，未為 UI擅改 transaction contract。
- 第一版使用 attachment，不支援 inline preview或 Range request。
- 本階段不執行 production browser PDF視覺驗收；正式 renderer deterministic/中文字型測試沿用 P3.3c。

## 31. P3.3 completion handoff

P3.3a／P3.3b storage contract、P3.3b2 version contract、P3.3c renderer／transaction與 P3.3d API／download／UI已完成。Email delivery、batch printing、template editor與 preview PDF未包含。

## 32. Validation results and P4 status

正式 disposable DB：`p3_3d_019fa77a_full`。連線為 `postgresql://p1_test:***@localhost:55432/p3_3d_019fa77a_full?schema=public`；由零套用 0001～0012 共 12 migrations，全部 DB tests 146 passed／0 failed／0 skipped，Prisma schema diff為 `No difference detected.`。

Formal print API route boundary、selected company、strict body、header key與無 binary JSON已通過；reprint route獨立呼叫既有 service且 response event identity正確；download bytes與 DB一致、連續兩次 GET無 event/counter副作用。Client bundle inspection未發現 font、renderer或 `pdf-lib`。P4 inventory／production未開始，且受保護 blueprint未修改、未 stage、未 commit、未 push。
