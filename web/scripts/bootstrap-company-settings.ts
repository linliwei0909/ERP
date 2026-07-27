import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  bootstrapInitialCompanySettings,
  parseDateOnly,
} from "../src/lib/company-settings/service";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`缺少必要環境變數：${name}`);
  }
  return value;
}

async function main() {
  const databaseUrl = required("DATABASE_URL");
  const expectedDatabaseName = required("BOOTSTRAP_DATABASE_NAME");
  const actualDatabaseName = new URL(databaseUrl).pathname.replace(/^\//, "");

  if (actualDatabaseName !== expectedDatabaseName) {
    throw new Error(
      `資料庫名稱確認失敗：預期 ${expectedDatabaseName}，實際 ${actualDatabaseName}`,
    );
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const db = new PrismaClient({ adapter });

  try {
    const results = await bootstrapInitialCompanySettings(db, {
      adminUsername: required("BOOTSTRAP_ADMIN_USERNAME"),
      effectiveFrom: parseDateOnly(
        required("BOOTSTRAP_COMPANY_SETTINGS_EFFECTIVE_FROM"),
      ),
    });

    for (const result of results) {
      console.log(
        result.created
          ? `已建立 ${result.companyCode} / ${result.settingKey} 初始設定`
          : `${result.companyCode} / ${result.settingKey} 相同有效設定已存在，未重複建立`,
      );
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "未知錯誤";
  console.error(`公司設定 Bootstrap 失敗：${message}`);
  process.exitCode = 1;
});
