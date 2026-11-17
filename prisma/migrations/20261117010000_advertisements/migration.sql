-- Own-banner advertising. Additive only: two new tables and one new type.

-- CreateEnum
CREATE TYPE "AdPlacement" AS ENUM ('TOP', 'HOME_MID', 'IN_ARTICLE', 'IN_FEED');

-- CreateTable
CREATE TABLE "Advertisement" (
    "id" TEXT NOT NULL,
    "placement" "AdPlacement" NOT NULL,
    "advertiser" TEXT NOT NULL,
    "linkUrl" TEXT NOT NULL,
    "desktopMediaId" TEXT,
    "mobileMediaId" TEXT,
    "showSi" BOOLEAN NOT NULL DEFAULT true,
    "showEn" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Advertisement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdStatDaily" (
    "adId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AdStatDaily_pkey" PRIMARY KEY ("adId","day")
);

-- CreateIndex
CREATE INDEX "Advertisement_placement_isActive_idx" ON "Advertisement"("placement", "isActive");

-- AddForeignKey
ALTER TABLE "Advertisement" ADD CONSTRAINT "Advertisement_desktopMediaId_fkey" FOREIGN KEY ("desktopMediaId") REFERENCES "Media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Advertisement" ADD CONSTRAINT "Advertisement_mobileMediaId_fkey" FOREIGN KEY ("mobileMediaId") REFERENCES "Media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdStatDaily" ADD CONSTRAINT "AdStatDaily_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Advertisement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
