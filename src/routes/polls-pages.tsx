import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { otherLocale, type Locale } from "@/lib/i18n/config";
import { getDictionary, type Dictionary } from "@/lib/i18n/dictionary";
import { alternates } from "@/lib/seo/metadata";
import { formatDateTime } from "@/lib/utils/dates";
import { getPollList, getPollPage, getPollSlugs, type PollCard } from "@/server/services/content";
import { AdSlot } from "@/components/ads/AdSlot";
import { Breadcrumbs } from "@/components/article/Breadcrumbs";
import { PollBox } from "@/components/polls/PollBox";
import { PollComments } from "@/components/polls/PollComments";

const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;
const base = (locale: Locale) => `/${locale}/public-opinions`;

// ───────────────────────── landing page ─────────────────────────

export function pollsMetadata(locale: Locale): Metadata {
  const t = getDictionary(locale);
  return {
    title: t.publicOpinions,
    description: t.pollsIntro,
    alternates: alternates(locale, base(locale), base(otherLocale(locale))),
  };
}

function StatusBadge({ phase, t }: { phase: PollCard["phase"]; t: Dictionary }) {
  const map = {
    active: { text: t.pollActive, style: "bg-brand text-white" },
    upcoming: { text: t.pollUpcoming, style: "bg-navy text-white" },
    closed: { text: t.pollClosed, style: "bg-soft text-ink" },
    archived: { text: t.pollClosed, style: "bg-soft text-ink" },
  }[phase];
  return <span className={`rounded-sm px-2 py-0.5 text-[13px] font-semibold ${map.style}`}>{map.text}</span>;
}

function when(card: Pick<PollCard, "phase" | "startsAt" | "endsAt">, locale: Locale, t: Dictionary) {
  if (card.phase === "upcoming") return `${t.votingStarts}: ${formatDateTime(card.startsAt, locale)}`;
  if (card.phase === "active") return `${t.votingEnds}: ${formatDateTime(card.endsAt, locale)}`;
  return `${t.votingEnded}: ${formatDateTime(card.endsAt, locale)}`;
}

function PollCardView({ card, locale, t }: { card: PollCard; locale: Locale; t: Dictionary }) {
  return (
    <article className="flex flex-col gap-2 rounded-lg bg-white p-5">
      <p>
        <StatusBadge phase={card.phase} t={t} />
      </p>
      <h3 className="text-xl font-bold leading-snug">
        <Link href={card.href} className="hover:text-brand-dark">
          {card.question}
        </Link>
      </h3>
      {card.description && <p className="line-clamp-3 text-body">{card.description}</p>}
      <p className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
        <span>{when(card, locale, t)}</span>
        {card.phase !== "upcoming" && (
          <span>
            {t.totalVotes}: <span className="font-latin font-semibold text-ink">{card.totalVotes.toLocaleString("en-US")}</span>
          </span>
        )}
      </p>
      <Link href={card.href} className="mt-2 flex min-h-11 items-center self-start rounded border border-navy px-4 font-semibold hover:bg-soft">
        {t.viewPoll}
        <span className="sr-only">: {card.question}</span>
      </Link>
    </article>
  );
}

export async function PollsPage({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
  const { active, upcoming, closed } = await getPollList(locale);
  const groups = [
    { id: "active", title: t.activePolls, cards: active },
    { id: "upcoming", title: t.upcomingPolls, cards: upcoming },
    { id: "completed", title: t.completedPolls, cards: closed },
  ];

  return (
    <div className="flex flex-col gap-6">
      <AdSlot slot="top" label={t.advertisement} />
      <header className="border-l-[5px] border-brand pl-3">
        <h1 className="text-3xl font-bold leading-snug">{t.publicOpinions}</h1>
        <p className="mt-1 text-body">{t.pollsIntro}</p>
      </header>

      <nav aria-label={t.publicOpinions}>
        <ul className="flex flex-wrap gap-2">
          {groups.map((g) => (
            <li key={g.id}>
              <a href={`#${g.id}`} className="flex min-h-11 items-center rounded-full bg-white px-4 text-sm font-semibold hover:text-brand-dark">
                {g.title} <span className="ml-2 font-latin text-muted">{g.cards.length}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {groups.map((g) => (
        <section key={g.id} id={g.id} className="flex scroll-mt-20 flex-col gap-3.5">
          <h2 className="text-[22px] font-bold">{g.title}</h2>
          {g.cards.length === 0 ? (
            <p className="rounded-lg bg-white p-5 text-body">{t.noPolls}</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {g.cards.map((card) => (
                <PollCardView key={card.id} card={card} locale={locale} t={t} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

// ───────────────────────── poll page ─────────────────────────

export type PollProps = { params: Promise<{ slug: string }> };

export async function pollStaticParams(locale: Locale): Promise<{ slug: string }[]> {
  const slugs = await getPollSlugs(locale);
  return (slugs.length > 0 ? slugs : ["-"]).map((slug) => ({ slug }));
}

export async function pollMetadata(locale: Locale, props: PollProps): Promise<Metadata> {
  const { slug } = await props.params;
  if (!SLUG.test(slug)) return {};
  const poll = await getPollPage(locale, slug);
  if (!poll) return {};
  const description = poll.metaDescription ?? (poll.description || getDictionary(locale).pollsIntro);
  return {
    title: poll.seoTitle ?? poll.question,
    description,
    // Both editions use the same slug, so the counterpart URL is known without a lookup.
    alternates: alternates(locale, poll.href, poll.hasOtherEdition ? `${base(otherLocale(locale))}/${poll.slug}` : null),
    openGraph: { type: "website", title: poll.question, description, url: poll.href },
    twitter: { card: "summary", title: poll.question, description },
  };
}

export async function PollPage({ locale, params }: PollProps & { locale: Locale }) {
  const { slug } = await params;
  if (!SLUG.test(slug)) notFound();
  const poll = await getPollPage(locale, slug);
  if (!poll) notFound();
  const t = getDictionary(locale);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <AdSlot slot="top" label={t.advertisement} />
      <header className="rounded-lg bg-white p-5 sm:p-6">
        <Breadcrumbs crumbs={[{ name: t.publicOpinions, href: base(locale) }]} homeHref={`/${locale}`} homeLabel={t.home} />
        <h1 className="mt-3 text-[26px] font-bold leading-[1.45] sm:text-3xl sm:leading-[1.4]">{poll.question}</h1>
        {poll.description && <p className="mt-3 whitespace-pre-line text-lg leading-relaxed text-body">{poll.description}</p>}
        <p className="mt-4 border-t border-line pt-3 text-sm text-muted">{when(poll, locale, t)}</p>
      </header>

      <PollBox
        pollId={poll.id}
        locale={locale}
        options={poll.options}
        resultsVisibility={poll.resultsVisibility}
        labels={{
          chooseOption: t.chooseOption, votingAs: t.votingAs, voteAnonymously: t.voteAnonymously,
          voteWithCodeName: t.voteWithCodeName, codeNameLabel: t.codeNameLabel, codeNameHint: t.codeNameHint,
          commentLabel: t.commentLabel, commentHint: t.commentHint, words: t.words, submitVote: t.submitVote,
          submitting: t.submitting, voteThanks: t.voteThanks, commentPendingMsg: t.commentPendingMsg,
          alreadyVoted: t.alreadyVoted, youChose: t.youChose, results: t.results, finalResults: t.finalResults,
          resultsAfterVote: t.resultsAfterVote, resultsAfterClose: t.resultsAfterClose, votes: t.votes,
          totalVotes: t.totalVotes, pollNotStarted: t.pollNotStarted, pollClosedMsg: t.pollClosedMsg,
          errChoose: t.errChoose, errCodeName: t.errCodeName, errComment: t.errComment, errRate: t.errRate,
          errNotOpen: t.errNotOpen, errGeneric: t.errGeneric, errLoad: t.errLoad, loading: t.loading,
        }}
      />

      <PollComments
        pollId={poll.id}
        locale={locale}
        labels={{ comments: t.comments, noComments: t.noComments, loadMore: t.loadMore, loading: t.loading, anonymous: t.anonymous }}
      />
    </div>
  );
}
