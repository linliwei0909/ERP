# P4.1 UI／UX 規劃驗證紀錄

文件狀態：驗證完成，待人工審查與獨立 Git 收尾
任務：P4.1 — ERP UI／UX 現況盤點、階段重編與正式藍圖
版本日期：2026-07-29

## 1. Git 基線

- 獨立 worktree：`C:\Users\linli\.codex\worktrees\4a4b\ERP`
- Branch：detached HEAD；本任務未建立或切換分支
- HEAD：`ffffc8ce82e497a0b3fd58461c6ae66919271014`
- `origin/main`：`ffffc8ce82e497a0b3fd58461c6ae66919271014`
- Ahead／behind：`0 / 0`
- 起始 staged：無
- 起始 tracked diff：無
- 起始 untracked：無
- `git diff --check`：通過
- `git worktree list --porcelain` 已確認主工作目錄與獨立 worktree。

## 2. Worktree 與 blueprint 受控複製

主工作目錄：

`C:\Users\linli\OneDrive\Documents\ERP`

來源：

`C:\Users\linli\OneDrive\Documents\ERP\docs\INVENTORY_PRODUCTION_BLUEPRINT.md`

初始目的：

`C:\Users\linli\.codex\worktrees\4a4b\ERP\docs\INVENTORY_PRODUCTION_BLUEPRINT.md`

受控複製前後驗證：

- 來源是 regular file。
- 來源大小：20,880 bytes。
- 來源最後修改：2026-07-27 11:03:17。
- 來源 SHA-256：`930121B91B470DFF25596AE50309060155CF7C0F4B78251184EB13B493AF95B7`。
- 主工作目錄起始 Git 狀態只有 `?? docs/INVENTORY_PRODUCTION_BLUEPRINT.md`。
- 只使用明確來源及目的複製一個檔案；沒有移動、刪除或修改來源。
- 複製完成時來源與目的大小均為 20,880 bytes，SHA-256 完全相同。
- 複製後主工作目錄狀態未變。
- 複製後獨立 worktree 唯一差異為 `?? docs/INVENTORY_PRODUCTION_BLUEPRINT.md`。

後續依 DEC-060 在獨立 worktree 內將目的文件重新命名並只調整階段編號、基線與 handoff。主工作目錄來源不受影響。

## 3. 審查範圍

完整或唯讀審查：

- `AGENTS.md`
- `web/AGENTS.md`
- `web/README.md`
- `docs/DECISIONS.md`
- `docs/business-rules.md`
- `docs/DATABASE_DESIGN.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/TECHNICAL_ARCHITECTURE.md`
- `docs/OPEN_QUESTIONS.md`
- `docs/P3_3_DELIVERY_NOTE_PRINT_PLAN.md`
- `docs/INVENTORY_PRODUCTION_BLUEPRINT.md` 受控副本
- 現有 App Router route、root layout、root page、login、access denied
- 客戶、品項、價格、運費、訂單、銷貨單與 ADMIN 頁面
- Delivery Note loading、list/detail view、print／void actions
- Global CSS、RBAC、permission 與 authorization

本次沒有修改任何前端或後端程式。

## 4. 現況前端架構

- Next.js App Router，正式頁面位於 `web/src/app`。
- Root layout 只有 metadata、global CSS 與 `children`，沒有 authenticated App Shell。
- 首頁集中顯示使用者、公司切換、查詢／管理按鈕與登出。
- Route 依功能分為 public query、sales、delivery notes 與 `/admin`。
- 頁面主要直接使用 Tailwind utility class，沒有跨模組 design component contract。
- Delivery Note 已有局部 list/detail view、Status Badge、SummaryField、loading skeleton 與 action component。
- 銷售訂單 editor 使用 client fetch、idempotency key、message state 與 grid line editor。
- 後端 permission gate 正式存在；UI 依 role／permission 顯示部分入口及動作。

## 5. 問題盤點

### 首頁與導覽

- 中央單一卡片與多色功能按鈕像工程入口。
- 沒有左側模組導覽、上方公司／使用者區、麵包屑或一致頁首。
- 多數頁面依賴「返回首頁」。
- 正式 UI 顯示 P1、P2、P3 等開發階段文字。

### 登入

- 使用開發名稱「Ragic 本地端系統」。
- 沒有密碼顯示切換、client pending 或防重複送出。
- 錯誤訊息只有單一泛化狀態。

### 清單與表單

- 清單混用 table、grid row、article card，密度及欄位語意不一致。
- 銷售訂單清單沒有表頭，欄位與連結辨識弱。
- 管理頁常把新增表單與清單堆疊在同一長頁。
- 銷售訂單明細以無表頭輸入 grid 呈現；placeholder 承擔欄位說明。
- 名稱與代碼優先順序不一致，部分頁面直接顯示 enum／error code／raw snapshot。

### Error、loading、empty

- 只有 Delivery Note route 有 loading skeleton。
- 多數 catch 直接 redirect `/` 或 `/login`，錯誤類型不明。
- Delivery Note 失敗整頁只顯示紅色卡片，導覽消失，沒有 Retry、返回或 correlation ID。
- Empty state 多為「查無資料」，缺少清除篩選或下一步。

### 權限

- 實際 role code 只有 `ADMIN`、`ORDER_ENTRY`。
- 沒有 `MANAGER` 或 read-only 正式角色。
- 無權限 presentation 不一致；只有部分 route 明確導向 access denied。
- UI hidden state 不能取代既有 server authorization。

## 6. Ragic 操作基準

正式藍圖保留高密度清單、完整單據、狀態動作集中、清單／明細快速切換、單號與關聯資料可點擊、子表為核心及人類可讀名稱優先。沒有複製 Ragic 視覺、舊式元件、平台特有行為或不必要管理功能。

## 7. P4／P5 重編決策

新增 `DEC-060`：

- P4：ERP UI／UX 與操作流程重整。
- P5：Inventory and Production。
- P4 必須先於 P5 完成。
- P4 是跨模組設計與操作流程階段。
- 既有後端契約原則上保持。
- Domain change 必須獨立決議與核准。
- P4 完成前不得開始 P5。
- Inventory blueprint 正式歸屬 P5。
- 原正式 roadmap 的應收、收款、月結、應付、切換順延為 P6～P10，避免編號碰撞。

DEC-001、DEC-044 與第一階段庫存排除維持不變。

## 8. Inventory blueprint 處理

- 原檔名：`docs/INVENTORY_PRODUCTION_BLUEPRINT.md`
- 已開啟並完整審查受控副本。
- 新檔名：`docs/P5_INVENTORY_PRODUCTION_BLUEPRINT.md`
- 採 rename，因內容確實集中在庫存、採購、生產、銷售出庫、盤點與成本。
- 全庫搜尋沒有 production code 引用；既有引用主要位於歷史 validation，保留原文以維持當時 Git 狀態證據。
- 文件內原 P4～P8 建議階段改為 P5.1～P5.5。
- 只更新頁首、適用基線、階段編號、校正清單與 handoff。
- 沒有核准或重寫倉庫、批號、負庫存、採購、生產、成本或銷售出庫業務規則。

## 9. 新增文件

- `docs/P4_UI_UX_BLUEPRINT.md`：P4 正式 UI／UX、角色、流程、資訊架構、Design System、頁面標準、錯誤、accessibility、技術邊界、子階段與驗收。
- `docs/P4_1_UI_UX_PLANNING_VALIDATION.md`：本次基線、審查、決策、文件、搜尋與驗證紀錄。
- `docs/P5_INVENTORY_PRODUCTION_BLUEPRINT.md`：原受控 blueprint 的 P5 handoff 名稱。

## 10. 修改文件

- `docs/DECISIONS.md`：新增 DEC-060，版本升至 V0.14。
- `docs/business-rules.md`：同步 P4／P5 與第一階段排除不變。
- `docs/DATABASE_DESIGN.md`：確認 P4.1 沒有 schema／migration；P5 草案不構成正式資料模型。
- `docs/IMPLEMENTATION_PLAN.md`：重編 roadmap，加入 P4.1～P4.7、P5 與 P6～P10。
- `docs/TECHNICAL_ARCHITECTURE.md`：加入 P4 presentation architecture 與後端契約邊界。
- `docs/OPEN_QUESTIONS.md`：只把切換階段 P8 同步為 P10；沒有新增問題。
- `docs/P3_3_DELIVERY_NOTE_PRINT_PLAN.md`：更新正式結案基線與 P5 blueprint handoff；保留 P3.3 domain。
- `web/README.md`：更新專案入口的正式現況與 P4／P5 指引。

## 11. 未修改 production code

確認沒有修改：

- `web/src/**`
- Production TypeScript／TSX／JavaScript／CSS
- API、DTO、RBAC、state machine
- Formal print、reprint、PDF renderer

## 12. 未修改 schema／migration

確認沒有修改：

- `web/prisma/schema.prisma`
- `web/prisma/migrations/**`
- `web/legacy/**`

沒有新增 migration，沒有執行資料庫 mutation。

## 13. 未修改 package／lockfile／tests

確認沒有修改：

- `web/package.json`
- `web/package-lock.json`
- `web/tests/**`
- `web/vitest.config.mts`
- TypeScript／Next／ESLint config

沒有安裝 package。

## 14. 一致性搜尋

搜尋字詞：

- `P4`
- `Phase 4`
- `inventory`
- `production`
- `庫存`
- `生產`
- `UI`
- `UX`
- `frontend`
- `user interface`
- `P4未開始`
- `P4開始前`
- `P5`
- `INVENTORY_PRODUCTION_BLUEPRINT`

判定原則：

- 正式 roadmap 以 DEC-060、P4 blueprint、IMPLEMENTATION_PLAN 與 TECHNICAL_ARCHITECTURE 為準。
- `docs/P3_*_VALIDATION.md` 中的「P4 未開始」與舊檔名是當時驗收證據，保留原文，不代表現行 roadmap。
- `docs/P3_2_DELIVERY_NOTE_PLAN.md` 中的舊 P4 應收欄位是歷史計畫語境；現行應收階段已由 DEC-060 明定為 P6。
- Legacy ERP 程式、generated code 與 lockfile 搜尋命中不構成 roadmap。
- 正式文件沒有把 P4 描述為庫存／生產，也沒有把 P5 描述為已開始。

## 15. 驗證結果

- `git diff --check`：通過，tracked 差異沒有 whitespace error。
- 三份 untracked 文件另以 `git diff --no-index --check` 檢查：通過，沒有 whitespace error。
- `git diff --name-status`：8 份 tracked Markdown 文件為 modified。
- `git status --short`：另有 3 份 untracked Markdown 文件；合計 11 份文件差異。
- Git 觀點為 modified 8、added 3、renamed 0、deleted 0。Inventory blueprint 的改名是從未追蹤受控副本產生新的 P5 檔名，因此不會出現在 tracked rename。
- 禁止範圍差異搜尋：production code、tests、schema、migration、package、lockfile 均為 0。
- 主工作目錄原始 blueprint 最終仍為 20,880 bytes，SHA-256 仍為 `930121B91B470DFF25596AE50309060155CF7C0F4B78251184EB13B493AF95B7`。
- 獨立 worktree 最終 P5 blueprint 因文件名稱、基線、階段與 handoff 更新而與原始副本不同；最終為 21,577 bytes，SHA-256 為 `5FEA3165A74D8CD502B0F416E496129B735B58C34A0DD4355B283218056C09DD`。

## 16. Git 最終狀態

- 獨立 worktree：detached HEAD，沒有建立或切換 branch。
- HEAD 與 `origin/main` 均為 `ffffc8ce82e497a0b3fd58461c6ae66919271014`，ahead／behind 為 `0 / 0`。
- Staged：0。
- Unstaged tracked：8 份 Markdown 文件。
- Untracked：3 份 Markdown 文件。
- 主工作目錄狀態仍只有 `?? docs/INVENTORY_PRODUCTION_BLUEPRINT.md`，來源未修改。
- 未 stage、未 commit、未 push。

## 17. 下一步

若最終驗證通過：

1. 下一步先完成 P4.1 文件 Git 收尾。
2. Git 收尾後另開 P4.2 App Shell 與導覽規格審查。
3. 不得直接同時實作所有主檔、訂單及銷貨單頁面。
4. 不得開始 P5。

## 18. 排除階段

- 未開始 P4.2。
- 未開始 P4.3～P4.7。
- 未開始 P5。
- 未開始 P6～P10。
