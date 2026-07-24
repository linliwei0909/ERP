import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { bootstrapAdmin } from "../src/lib/auth/bootstrap";

function required(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`缺少必要環境變數：${name}`);
  }

  return value;
}

function requiredRaw(name: string): string {
  const value = process.env[name];

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
    const result = await bootstrapAdmin(db, {
      username: required("BOOTSTRAP_ADMIN_USERNAME"),
      password: requiredRaw("BOOTSTRAP_ADMIN_PASSWORD"),
      companyCode: required("BOOTSTRAP_COMPANY_CODE"),
      companyName: required("BOOTSTRAP_COMPANY_NAME"),
    });

    console.log(
      result.created
        ? `已建立初始管理員，user_id=${result.userId}`
        : `初始管理員已存在，未重複建立，user_id=${result.userId}`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "未知錯誤";
  console.error(`Bootstrap 失敗：${message}`);
  process.exitCode = 1;
});
