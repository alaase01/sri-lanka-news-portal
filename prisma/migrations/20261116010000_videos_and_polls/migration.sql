-- Increment 2: video publishing fields and the public opinions (polls) tables.
-- Additive only: no column or table is dropped, and every new column on an
-- existing table is nullable or has a default, so existing rows are kept.

-- CreateEnum
CREATE TYPE "PollStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PollResultsVisibility" AS ENUM ('ALWAYS', 'AFTER_VOTE', 'AFTER_CLOSE');

-- CreateEnum
CREATE TYPE "VoteIdentity" AS ENUM ('ANONYMOUS', 'CODE_NAME');

-- CreateEnum
CREATE TYPE "CommentStatus" AS ENUM ('PENDING', 'APPROVED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "PollEventType" AS ENUM ('DUPLICATE_ATTEMPT', 'RATE_LIMITED', 'FRESH_DEVICE_BURST', 'INVALID_DEVICE_TOKEN', 'TOO_FAST', 'HONEYPOT', 'NOT_OPEN');

-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "isFeatured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" "ArticleStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "durationSeconds" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "VideoTranslation" ADD COLUMN     "metaDescription" TEXT,
ADD COLUMN     "seoTitle" TEXT,
ADD COLUMN     "slug" TEXT;

-- CreateTable
CREATE TABLE "VideoTag" (
    "videoId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "VideoTag_pkey" PRIMARY KEY ("videoId","tagId")
);

-- CreateTable
CREATE TABLE "Poll" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "PollStatus" NOT NULL DEFAULT 'DRAFT',
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "resultsVisibility" "PollResultsVisibility" NOT NULL DEFAULT 'AFTER_VOTE',
    "featuredMediaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Poll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollTranslation" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "question" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "seoTitle" TEXT,
    "metaDescription" TEXT,

    CONSTRAINT "PollTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollOption" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PollOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollOptionTranslation" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "PollOptionTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollVote" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "deviceHash" TEXT NOT NULL,
    "identity" "VoteIdentity" NOT NULL DEFAULT 'ANONYMOUS',
    "codeName" TEXT,
    "locale" "Locale" NOT NULL,
    "networkHash" TEXT,
    "freshDevice" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollComment" (
    "id" TEXT NOT NULL,
    "voteId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "CommentStatus" NOT NULL DEFAULT 'PENDING',
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "moderatedAt" TIMESTAMP(3),

    CONSTRAINT "PollComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollEvent" (
    "id" TEXT NOT NULL,
    "pollId" TEXT,
    "type" "PollEventType" NOT NULL,
    "deviceHash" TEXT,
    "networkHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoTag_tagId_idx" ON "VideoTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "Poll_slug_key" ON "Poll"("slug");

-- CreateIndex
CREATE INDEX "Poll_status_startsAt_idx" ON "Poll"("status", "startsAt");

-- CreateIndex
CREATE INDEX "Poll_status_endsAt_idx" ON "Poll"("status", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "PollTranslation_pollId_locale_key" ON "PollTranslation"("pollId", "locale");

-- CreateIndex
CREATE INDEX "PollOption_pollId_sortOrder_idx" ON "PollOption"("pollId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PollOption_id_pollId_key" ON "PollOption"("id", "pollId");

-- CreateIndex
CREATE UNIQUE INDEX "PollOptionTranslation_optionId_locale_key" ON "PollOptionTranslation"("optionId", "locale");

-- CreateIndex
CREATE INDEX "PollVote_pollId_optionId_idx" ON "PollVote"("pollId", "optionId");

-- CreateIndex
CREATE INDEX "PollVote_pollId_createdAt_idx" ON "PollVote"("pollId", "createdAt");

-- CreateIndex
CREATE INDEX "PollVote_pollId_networkHash_createdAt_idx" ON "PollVote"("pollId", "networkHash", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PollVote_pollId_deviceHash_key" ON "PollVote"("pollId", "deviceHash");

-- CreateIndex
CREATE UNIQUE INDEX "PollComment_voteId_key" ON "PollComment"("voteId");

-- CreateIndex
CREATE INDEX "PollComment_status_createdAt_idx" ON "PollComment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PollEvent_pollId_createdAt_idx" ON "PollEvent"("pollId", "createdAt");

-- CreateIndex
CREATE INDEX "PollEvent_type_createdAt_idx" ON "PollEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "PollEvent_networkHash_createdAt_idx" ON "PollEvent"("networkHash", "createdAt");

-- CreateIndex
CREATE INDEX "Video_status_publishedAt_idx" ON "Video"("status", "publishedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "VideoTranslation_locale_slug_key" ON "VideoTranslation"("locale", "slug");

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoTag" ADD CONSTRAINT "VideoTag_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoTag" ADD CONSTRAINT "VideoTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_featuredMediaId_fkey" FOREIGN KEY ("featuredMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollTranslation" ADD CONSTRAINT "PollTranslation_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollOption" ADD CONSTRAINT "PollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollOptionTranslation" ADD CONSTRAINT "PollOptionTranslation_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "PollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_optionId_pollId_fkey" FOREIGN KEY ("optionId", "pollId") REFERENCES "PollOption"("id", "pollId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollComment" ADD CONSTRAINT "PollComment_voteId_fkey" FOREIGN KEY ("voteId") REFERENCES "PollVote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollEvent" ADD CONSTRAINT "PollEvent_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
