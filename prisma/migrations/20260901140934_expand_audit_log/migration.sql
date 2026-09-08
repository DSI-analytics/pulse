-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('SUCESSO', 'FALHA', 'NEGADO');

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_clinicId_fkey";

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_userId_fkey";

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "after" JSONB,
ADD COLUMN     "before" JSONB,
ADD COLUMN     "endpoint" TEXT,
ADD COLUMN     "httpMethod" TEXT,
ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "module" TEXT,
ADD COLUMN     "requestId" TEXT,
ADD COLUMN     "result" "AuditResult" NOT NULL DEFAULT 'SUCESSO',
ADD COLUMN     "sessionId" TEXT,
ADD COLUMN     "userAgent" TEXT,
ADD COLUMN     "userName" TEXT,
ADD COLUMN     "userRole" "UserRole";

-- CreateIndex
CREATE INDEX "AuditLog_clinicId_action_createdAt_idx" ON "AuditLog"("clinicId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_clinicId_userId_createdAt_idx" ON "AuditLog"("clinicId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_clinicId_module_createdAt_idx" ON "AuditLog"("clinicId", "module", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_clinicId_result_createdAt_idx" ON "AuditLog"("clinicId", "result", "createdAt");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
