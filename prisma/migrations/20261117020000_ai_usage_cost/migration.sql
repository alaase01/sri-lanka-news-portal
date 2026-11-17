-- AI Editorial Assistant: estimated cost per request, and a faster per-admin rate-limit lookup.
-- Additive only: a new nullable column and a new index. Existing rows are kept unchanged.
ALTER TABLE "AiUsageLog" ADD COLUMN "estimatedCostUsd" DECIMAL(12,6);

CREATE INDEX "AiUsageLog_adminId_createdAt_idx" ON "AiUsageLog"("adminId", "createdAt");
