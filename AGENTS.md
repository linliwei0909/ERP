# Project Instructions

## Language

- 程式碼、資料表及 API 名稱使用英文。
- 使用者介面、錯誤訊息及文件使用繁體中文。

## Specification Priority

本專案文件內容發生衝突時，必須依照以下優先順序判斷：

1. `docs/DECISIONS.md`
2. `docs/business-rules.md`
3. `docs/DATABASE_DESIGN.md`
4. `docs/TECHNICAL_ARCHITECTURE.md`
5. `docs/IMPLEMENTATION_PLAN.md`
6. 原始 Word／Excel 規格文件
7. `docs/OPEN_QUESTIONS.md`
8. 其他 ERP MVP、原型、草稿或舊版文件

規則：

- 高優先級文件已明確決議的事項，不得因低優先級文件內容不同而重新列為待確認。
- `OPEN_QUESTIONS.md` 只記錄真正尚未決議的問題，不是正式規格來源。
- 若發現文件衝突，先查閱 `docs/DECISIONS.md`。
- 若 `docs/DECISIONS.md` 沒有答案，才可寫入 `docs/OPEN_QUESTIONS.md`。
- 不得自行採用其他 ERP MVP 的庫存、批號、分批出貨或會計規則。
- 未經使用者確認，不得建立基於未決事項的不可逆 migration。
- 新決議應先更新 `docs/DECISIONS.md`，再同步更新其他設計文件與程式碼。

## Business Rules

- 不得自行修改已確認的業務規則。
- 不得以刪除交易資料代替作廢或沖銷。
- 所有跨單據操作必須使用資料庫 transaction。
- 所有重要狀態異動必須保留 audit log。

## Development Rules

- 每次只實作指定模組。
- 修改資料庫結構時必須建立 migration。
- 所有核心規則必須有測試。
- 完成任務前必須執行 lint、type check、unit test 與 build。
