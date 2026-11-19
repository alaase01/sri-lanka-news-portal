-- Automated global newsroom. Additive only: new tables, enums and nullable/defaulted columns.

-- CreateEnum
CREATE TYPE "NewsroomRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');
CREATE TYPE "NewsroomStoryStatus" AS ENUM ('DRAFTED', 'HELD', 'REJECTED', 'FAILED', 'DISCARDED');
CREATE TYPE "CopyrightRisk" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AI usage: server-side tool counts and the run that made the request
ALTER TABLE "AiUsageLog" ADD COLUMN "webSearchRequests" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AiUsageLog" ADD COLUMN "webFetchRequests" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AiUsageLog" ADD COLUMN "newsroomRunId" TEXT;
CREATE INDEX "AiUsageLog_newsroomRunId_idx" ON "AiUsageLog"("newsroomRunId");

-- Monthly AI budget (USD 20 to start)
ALTER TABLE "SiteSettings" ADD COLUMN "aiMonthlyBudgetUsd" DECIMAL(10,2) NOT NULL DEFAULT 20;

-- CreateTable
CREATE TABLE "NewsroomSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "maxStoriesPerRun" INTEGER NOT NULL DEFAULT 2,
    "lockRunId" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsroomSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsroomRun" (
    "id" TEXT NOT NULL,
    "slotKey" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" "NewsroomRunStatus" NOT NULL DEFAULT 'RUNNING',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "discovered" INTEGER NOT NULL DEFAULT 0,
    "selected" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "insufficient" INTEGER NOT NULL DEFAULT 0,
    "copyright" INTEGER NOT NULL DEFAULT 0,
    "drafted" INTEGER NOT NULL DEFAULT 0,
    "held" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "costUsd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "triggeredById" TEXT,

    CONSTRAINT "NewsroomRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsroomStory" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "status" "NewsroomStoryStatus" NOT NULL,
    "reason" TEXT,
    "fingerprint" TEXT NOT NULL DEFAULT '',
    "research" JSONB NOT NULL,
    "verification" TEXT NOT NULL DEFAULT '',
    "copyrightRisk" "CopyrightRisk",
    "copyrightNotes" TEXT,
    "heldContent" JSONB,
    "enHeadline" TEXT,
    "siHeadline" TEXT,
    "enWords" INTEGER,
    "siWords" INTEGER,
    "articleId" TEXT,
    "model" TEXT,
    "costUsd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsroomStory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsroomNotice" (
    "id" TEXT NOT NULL,
    "key" TEXT,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "NewsroomNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NewsroomRun_slotKey_key" ON "NewsroomRun"("slotKey");
CREATE INDEX "NewsroomRun_startedAt_idx" ON "NewsroomRun"("startedAt" DESC);
CREATE UNIQUE INDEX "NewsroomStory_articleId_key" ON "NewsroomStory"("articleId");
CREATE INDEX "NewsroomStory_createdAt_idx" ON "NewsroomStory"("createdAt" DESC);
CREATE INDEX "NewsroomStory_status_idx" ON "NewsroomStory"("status");
CREATE UNIQUE INDEX "NewsroomNotice_key_key" ON "NewsroomNotice"("key");
CREATE INDEX "NewsroomNotice_createdAt_idx" ON "NewsroomNotice"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "NewsroomStory" ADD CONSTRAINT "NewsroomStory_runId_fkey" FOREIGN KEY ("runId") REFERENCES "NewsroomRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NewsroomStory" ADD CONSTRAINT "NewsroomStory_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The settings row, switched off.
INSERT INTO "NewsroomSettings" ("id", "enabled", "maxStoriesPerRun", "updatedAt") VALUES (1, false, 2, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;
