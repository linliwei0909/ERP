-- AlterTable
ALTER TABLE "user_sessions" ADD COLUMN     "selected_company_id" UUID,
ALTER COLUMN "idle_expires_at" SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '8 hours');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "default_company_id" UUID,
ADD COLUMN     "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "locked_until" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "user_sessions_selected_company_id_idx" ON "user_sessions"("selected_company_id");

-- CreateIndex
CREATE INDEX "users_locked_until_idx" ON "users"("locked_until");

-- CreateIndex
CREATE INDEX "users_default_company_id_idx" ON "users"("default_company_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_default_company_id_fkey" FOREIGN KEY ("default_company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_selected_company_id_fkey" FOREIGN KEY ("selected_company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Account lockout counters must never become negative.
ALTER TABLE "users"
ADD CONSTRAINT "users_failed_login_attempts_check"
CHECK ("failed_login_attempts" >= 0);
