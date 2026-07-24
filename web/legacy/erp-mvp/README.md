# 舊 ERP MVP 封存

此目錄保存 P1.1 前的 ERP MVP 程式、Prisma schema 與 migration 歷史，僅供追溯與差異比對。

- `prisma/migrations/` 內的既有 migration 保持原內容，不得修改。
- 正式 Prisma 設定只讀取 `web/prisma/schema.prisma` 與 `web/prisma/migrations/`。
- 本目錄不屬於正式 migration chain，也不由 Next.js、TypeScript 或 CI 建置。
- 庫存、批號、倉庫、採購、stock movement、舊 delivery、舊 AR/AP 等功能均已從正式入口停用。
- 未經另行核准，不刪除此封存內容。
