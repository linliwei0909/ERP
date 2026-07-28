# P3.3c Formal Print Transaction Validation

日期：2026-07-28
基線：`526863443ed6459feedab1812dcb5dd094da5da5`

## 1. Scope 與 exclusions

本切片完成 Delivery Note frozen snapshot validator、immutable print model、server-only deterministic PDF renderer、正式字型、首次正式列印／重印 application service、DB `bytea` storage transaction、locking、idempotency、audit、typed errors、unit tests 與 disposable PostgreSQL integration tests。

未實作 API route、HTTP DTO／error mapping、React UI、client adapter、PDF 下載端點、browser flow 或任何 P3.3d 功能。

## 2. P3.3b2 契約審查

0011／0012 已提供完整 required 欄位、20 MiB 與 byte-size CHECK、唯一正式 version、唯一 `FORMAL_PRINT` event、company-scoped FK、summary CHECK 與 `ENABLE ALWAYS` append-only triggers。P3.3c 未修改 Prisma schema，未新增 migration，未發現需阻塞的額外契約缺口。

## 3. Snapshot validator 與 print model

- 支援版本只允許 `delivery-note-snapshot-v1`。
- 先驗證 persisted scalar discriminator，再解析 frozen JSON；不從目前主檔補值、不 coercion、不提供 legacy fallback。
- 驗證 company/customer/delivery snapshots、Delivery Note／Sales Order／company identity、明細 identity、非空字串、正數 quantity、Decimal 格式、line subtotal 與 header total。
- 客戶 identity 取自 frozen transaction 關係 `DeliveryNote -> SalesOrder.customerId`，顯示資料只取 frozen JSON。
- 現有契約沒有數值稅額，print model 固定 `taxDisplay: "未分列"`；不推算。
- 現有 P3.3 第一版明確排除 remarks，print model 固定 `remarks: null`。
- 輸出以遞迴 `Object.freeze` 保護，且不暴露 Prisma entity。
- `DeliveryNoteSnapshotValidationError` 保存 Delivery Note ID、snapshot version、field path 與 reason。

## 4. Renderer contract 與 deterministic strategy

- Library：`pdf-lib` 1.17.1、`@pdf-lib/fontkit` 1.1.1，兩者皆 MIT。
- Renderer：`DeterministicDeliveryNotePdfRenderer`，只接受 `DeliveryNotePrintModel`。
- Renderer／template version：`delivery-note-pdf-renderer-v1`／`delivery-note-pdf-template-v1`；document version 為 `1`。
- 輸出 Buffer、`application/pdf`、byte size、SHA-256、安全 deterministic filename 與四種版本 identity。
- creation／modification date 固定為 `2000-01-01T00:00:00Z`；creator／producer、page/draw order、locale 與序列化選項固定。
- `useObjectStreams: false`；不使用 runtime clock、random ID、環境 locale、DOM、headless browser、外部 service 或 runtime network。
- 相同 model、renderer/template/font version 與 bytes 的兩次輸出，以 `Buffer.equals` 和 SHA-256 實測完全一致。

## 5. 正式字型

| 欄位 | 值 |
| --- | --- |
| Family | Noto Sans CJK TC |
| Variant／weight | Regular／400 |
| Upstream | `https://github.com/notofonts/noto-cjk` |
| Release／commit | `Sans2.004`／`523d033d6cb47f4a80c58a35753646f5c3608a78` |
| Filename | `NotoSansCJKtc-Regular.otf` |
| Repository path | `web/src/lib/delivery-notes/assets/NotoSansCJKtc-Regular.otf` |
| Byte size | 16,435,884 |
| SHA-256 | `dce08bd4fd91aa8aa76ed8fea4b694c2dfb8550f67871e326843212ddbeb88b4` |
| Font version | `noto-sans-cjk-tc-regular-sans2.004-dce08bd4` |
| License／path | SIL OFL 1.1／`web/src/lib/delivery-notes/assets/OFL-1.1.txt` |

Loader 先驗證存在、byte size 與 SHA-256，再由 fontkit 解析並檢查正式模板字元。每次 render 另檢查實際 model text glyph。任何缺檔、checksum、parse 或 glyph 問題均 typed fail-fast，沒有 CDN、OS 或 Docker font fallback。

## 6. Storage strategy

正式 PDF bytes 只寫入 `delivery_note_print_versions.pdf_bytes`。同一 transaction 保存 hash、byte size、MIME、filename 與版本欄位；DB CHECK 再驗證 byte size 和 20 MiB 上限。Audit、event、log 和 error 不保存 bytes，因此不會產生 filesystem／object-storage orphan。

## 7. 首次正式列印 transaction

1. 驗證 `delivery_notes.manage` 與 authorized company scope。
2. 以 operation `delivery_note.formal_print` claim 現有 idempotency record。
3. P3.3e 已修正 transaction：先以 company-scoped 唯讀查詢解析 relation identity，再以 `SELECT ... FOR UPDATE` 依序鎖 Sales Order、Delivery Note。
4. 鎖後重新驗證 Delivery Note 為 `ACTIVE`、Sales Order 為 `DELIVERY_CREATED`、company／relation identity，且沒有 version 或 `FORMAL_PRINT` event。
5. Strict parse frozen snapshot，產生 immutable print model。
6. Transaction 內呼叫 renderer，驗證 bytes／MIME／size／SHA／snapshot version。
7. 建立唯一 Print Version 與 `FORMAL_PRINT` event。
8. Delivery Note `ACTIVE -> SHIPPED`；Sales Order 依 state-machine contract `DELIVERY_CREATED -> SHIPPED`。
9. `actualDeliveryDate` 使用 `taipeiBusinessDate(now)`；`firstPrintedAt` 是 timestamp；actor 決定 `firstPrintedBy`；`reprintCount = 0`。
10. 同 transaction 寫 audit 與 idempotency completion 後 commit。

Renderer、storage、event、state transition 或 audit 任一步失敗，version、bytes、event、兩張單據狀態、summary、audit 全部 rollback。

## 8. Lock、idempotency、concurrency 與 retry

P3.3c 原始實作與本文件原先記錄的順序為 `idempotency → Delivery Note → Sales Order`；該項與 DEC-058 衝突，已由 P3.3e 修正。正式固定順序為：idempotency → Sales Order → Delivery Note → version invariant → event invariant → audit。P3.3c 其餘歷史驗證結果維持不變，但 P3.3 完整結案必須重新執行，不得沿用先前失敗審查作為通過。

Operation identity 包含 operation、company、Delivery Note、actor 及 canonical payload hash。同 key／同 payload 回傳同一 result reference，不重複 render、event、audit 或 transition；同 key／不同 payload回傳 typed idempotency conflict。

不同 key 的首次併發由同一固定順序的 Sales Order、Delivery Note row lock 序列化，unique constraint 作第二層保護；結果為一個成功，其他 request 收到 typed already-printed／state conflict。不同 key 的重印採相同鎖序，event insert 與 atomic counter increment 同 transaction，沒有 lost update。

P3.3c 不在已進入 renderer 的 transaction 內自動 retry。PostgreSQL deadlock／serialization `P2034` 或 unique race 映射為 typed concurrency conflict；caller 可用原 idempotency key安全重試。

## 9. Reprint semantics

- 只允許 Delivery Note 與 Sales Order 都為 `SHIPPED` 且存在唯一正式 version。
- 驗證 DB bytes、byte size 與 SHA-256 後直接重用；service 不接受 renderer，也不建立新 version。
- 建立一筆 `REPRINT` event、原子 `reprintCount + 1`、寫 audit 並完成 idempotency。
- 同 key replay 同一 event；不同 key 各建立 event 並增加一次 counter。
- 不修改 snapshot、version、PDF、checksum、actual delivery date、first-print summary 或兩張單據狀態。

## 10. Audit、typed errors 與 redaction

首次列印 audit 保存兩張單據前後狀態、actual date、first print、version/event IDs、checksum、四種版本、雜湊後 idempotency key 與 correlation ID。重印保存 version/event IDs、counter 前後值、checksum、雜湊 key 與 correlation ID。禁止內容包括 PDF bytes、font bytes、完整 frozen snapshot、secret 與原始 idempotency key。

本切片加入 snapshot unsupported／invalid、formal version exists／missing、font missing／checksum／parse／glyph、PDF render／invalid／checksum／storage、print state、Sales Order state及 concurrency typed errors；沿用既有 not-found、access denied、idempotency conflict 與 state-machine errors。HTTP mapping 留給 P3.3d。

## 11. Tests

- Snapshot unit：合法、unsupported／blank version、缺 company/customer/address、空 lines、quantity、totals、duplicate identity、field path、deep immutability。
- Font unit：manifest、asset、size、SHA、license identity、glyph coverage、integrity fail-fast。
- Renderer unit：真實 TC font、中文 PDF、MIME／size／hash／filename／versions、兩次 bytes 與 hash 完全一致、固定 metadata。
- DB service：正式 transaction、Asia/Taipei UTC 日界、same-key replay、renderer call count、bytes persistence、audit／idempotency、renderer failure rollback、audit failure rollback、different-key concurrency、reprint reuse／same-key／different-key concurrency、append-only、missing version、real-renderer DB smoke。
- Regression：全部 unit、Delivery Note／Sales Order 與全部 DB integration tests。

## 12. Commands、disposable DB 與 schema diff

| Command | Result |
| --- | --- |
| `npm test` | 21 files／149 passed／0 failed／0 skipped |
| P3.3c unit | 1 file／12 passed |
| P3.3c DB | 1 file／7 passed |
| `npm run test:db` | 15 files／146 passed／0 failed／0 skipped |
| Fresh `prisma migrate deploy` | 12 migrations passed |
| Prisma schema diff | `No difference detected.` |
| `npx prisma format` | passed |
| `npm run prisma:validate` | passed |
| `npm run prisma:generate` | Prisma Client 7.8.0 generated |
| `npm run lint` | passed |
| `npm run typecheck` | passed |
| `npm run build` | passed；37 static pages |
| `git diff --check` | passed |

正式 disposable DB：`p3_3c_019fa740_full`。
連線：`postgresql://p1_test:***@localhost:55432/p3_3c_019fa740_full?schema=public`。

最終真實 renderer DB smoke PDF：77,266 bytes，SHA-256 `cf105d0dc6fb28b66050c6462d0f52d10bb18fee3cf27fcbff9b936eb8c3f5cc`。相同 print model 的 unit deterministic test 連續兩次 bytes 與 hash 完全一致。

Unit runner 只將 `delivery-note-print.test.ts` 限制為 single worker；其餘 unit tests 維持原本平行執行。原因是該檔會連續載入、解析並嵌入 16,435,884-byte 正式字型，在與 production build 等高記憶體工作連續執行時曾發生一次 Vitest worker 非預期退出；獨立重跑沒有 assertion failure。審查未發現共享 global state、固定 temporary path、未隔離 mock 或其他測試污染。代價是此單一 renderer test file 串行，並未降低整套既有 unit tests 的平行度。

全 DB 首輪曾在有單檔測試殘留資料的 disposable DB 出現固定單號 collision，重建指定 DB 後 fresh 正式結果通過。既有 P3.2 admin-void regression 原先把固定 2026-07-27 operation 與實際系統時間混用，已將 replay clock 固定在 24 小時 TTL 內，避免時間型 flaky failure。

## 13. Known limitations 與 P3.3d handoff

- 第一版 template 是已核准欄位的 deterministic domain renderer，尚未做 browser PDF 視覺驗收；P3.3d／P3.3e 才進行下載與視覺流程。
- Retry policy 是 typed conflict 後由 caller 使用同 key 重試，不在 renderer transaction 內自動 retry。
- P3.3d 僅可新增 API、strict HTTP DTO／mapping、client adapter、UI、read-only PDF download 與 browser flow；不得重新產生或覆寫正式 PDF。
