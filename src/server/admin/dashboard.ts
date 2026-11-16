import "server-only";
import { db } from "@/server/db/client";
import { pollPhase } from "@/lib/polls/phase";

export type Dashboard = {
  articles: { status: string; si: number; en: number }[];
  dueScheduled: number;
  categories: number;
  tags: number;
  polls: { active: number; upcoming: number; closed: number; votes: number };
  pendingComments: number;
  flaggedComments: number;
  suspicious24h: number;
  mostViewed: { headline: string; views: number }[];
  activity: { id: string; action: string; at: string; ip: string | null }[];
};

const STATUSES = ["DRAFT", "IN_REVIEW", "SCHEDULED", "PUBLISHED", "HIDDEN", "ARCHIVED"] as const;

/** Figures for the admin dashboard. Requires an authenticated caller; never call from public code. */
export async function getDashboard(now: Date): Promise<Dashboard> {
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const dayAgo = new Date(now.getTime() - 86_400_000);

  const [byStatus, dueScheduled, categories, tags, polls, votes, pendingComments, flaggedComments, suspicious24h, views, activity] =
    await Promise.all([
      db.articleTranslation.groupBy({ by: ["status", "locale"], where: { article: { deletedAt: null } }, _count: { _all: true } }),
      db.articleTranslation.count({ where: { status: "SCHEDULED", scheduledAt: { lte: now }, article: { deletedAt: null } } }),
      db.category.count(),
      db.tag.count(),
      db.poll.findMany({ where: { deletedAt: null }, select: { status: true, startsAt: true, endsAt: true } }),
      db.pollVote.count(),
      db.pollComment.count({ where: { status: "PENDING" } }),
      db.pollComment.count({ where: { status: "PENDING", flagged: true } }),
      db.pollEvent.count({ where: { createdAt: { gte: dayAgo } } }),
      db.articleViewDaily.groupBy({
        by: ["articleId"],
        where: { locale: "si", day: { gte: weekAgo } },
        _sum: { count: true },
        orderBy: { _sum: { count: "desc" } },
        take: 5,
      }),
      db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 10, select: { id: true, action: true, createdAt: true, ip: true } }),
    ]);

  const headlines = await db.articleTranslation.findMany({
    where: { locale: "si", articleId: { in: views.map((v) => v.articleId) } },
    select: { articleId: true, headline: true },
  });
  const headlineById = new Map(headlines.map((h) => [h.articleId, h.headline]));

  const phases = polls.map((p) => pollPhase(p, now));

  return {
    articles: STATUSES.map((status) => ({
      status,
      si: byStatus.find((r) => r.status === status && r.locale === "si")?._count._all ?? 0,
      en: byStatus.find((r) => r.status === status && r.locale === "en")?._count._all ?? 0,
    })),
    dueScheduled,
    categories,
    tags,
    polls: {
      active: phases.filter((p) => p === "active").length,
      upcoming: phases.filter((p) => p === "upcoming").length,
      closed: phases.filter((p) => p === "closed" || p === "archived").length,
      votes,
    },
    pendingComments,
    flaggedComments,
    suspicious24h,
    mostViewed: views.map((v) => ({ headline: headlineById.get(v.articleId) ?? "(untitled)", views: v._sum.count ?? 0 })),
    activity: activity.map((a) => ({ id: a.id, action: a.action, at: a.createdAt.toISOString(), ip: a.ip })),
  };
}
