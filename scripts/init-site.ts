/**
 * One-time setup for a new production database: site settings (name and
 * slogans), the starting sections and subcategories, and the main menu.
 *
 * Safe to run more than once: it only creates what is missing and never
 * changes or deletes anything. It creates no articles, polls or videos, and no
 * "demonstration content" notice.
 *
 *   npm run site:init
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { starterCategories, starterNavigation } from "../prisma/starter-data";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const done: string[] = [];

  if (!(await db.siteSettings.findUnique({ where: { id: 1 } }))) {
    await db.siteSettings.create({
      data: {
        id: 1,
        siteName: "RSnewslk.com",
        localized: {
          si: { tagline: "රටේ තොරතුරු, ලෝකයේ තොරතුරු. මධ්‍යස්ථව. විශ්වාසයෙන්." },
          en: { tagline: "News of the nation, news of the world. Impartial. Trusted." },
        },
      },
    });
    done.push("site settings (name and slogans)");
  }

  if ((await db.category.count()) === 0) {
    const ids = new Map<string, string>();
    for (const [i, c] of starterCategories.entries()) {
      const parent = await db.category.create({
        data: { sortOrder: i, translations: { create: [{ locale: "si", name: c.name.si, slug: c.slug }, { locale: "en", name: c.name.en, slug: c.slug }] } },
      });
      ids.set(c.slug, parent.id);
      for (const [j, child] of (c.children ?? []).entries()) {
        await db.category.create({
          data: { parentId: parent.id, sortOrder: j, translations: { create: [{ locale: "si", name: child.name.si, slug: child.slug }, { locale: "en", name: child.name.en, slug: child.slug }] } },
        });
      }
    }
    done.push(`${starterCategories.length} sections with their subcategories`);

    if ((await db.navigationItem.count()) === 0) {
      for (const [i, n] of starterNavigation.entries()) {
        const categoryId = ids.get(n.category);
        if (!categoryId) continue;
        await db.navigationItem.create({
          data: { targetType: "CATEGORY", categoryId, sortOrder: i, translations: { create: [{ locale: "si", label: n.label.si }, { locale: "en", label: n.label.en }] } },
        });
      }
      done.push(`main menu (${starterNavigation.length} items)`);
    }
  }

  console.log(done.length ? `Created: ${done.join("; ")}.` : "Nothing to do: the site is already set up.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
