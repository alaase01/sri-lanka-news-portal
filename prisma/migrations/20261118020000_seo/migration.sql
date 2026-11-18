-- Technical SEO. Additive only: two new nullable columns.

-- Last significant change to a published article's text (see schema comment).
ALTER TABLE "ArticleTranslation" ADD COLUMN "modifiedAt" TIMESTAMP(3);

-- Fill it only where an article was really edited after it was published, so the
-- "Updated" label that readers see today stays the same. Touches only the new column.
UPDATE "ArticleTranslation"
SET "modifiedAt" = "updatedAt"
WHERE "publishedAt" IS NOT NULL
  AND "status" IN ('PUBLISHED', 'SCHEDULED', 'HIDDEN')
  AND "updatedAt" > "publishedAt" + INTERVAL '1 minute';

-- Default share image (null: the built-in brand image).
ALTER TABLE "SiteSettings" ADD COLUMN "defaultShareMediaId" TEXT;
