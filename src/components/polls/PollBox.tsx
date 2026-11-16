"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { Locale } from "@/lib/i18n/config";
import type { PollPhase } from "@/lib/polls/phase";
import type { PollResults } from "@/lib/polls/results";
import { MAX_COMMENT_WORDS, countWords } from "@/lib/polls/text";
import { PollResultsChart } from "./PollResultsChart";

export type PollBoxLabels = Record<
  | "chooseOption" | "votingAs" | "voteAnonymously" | "voteWithCodeName" | "codeNameLabel" | "codeNameHint"
  | "commentLabel" | "commentHint" | "words" | "submitVote" | "submitting" | "voteThanks" | "commentPendingMsg"
  | "alreadyVoted" | "youChose" | "results" | "finalResults" | "resultsAfterVote" | "resultsAfterClose" | "votes"
  | "totalVotes" | "pollNotStarted" | "pollClosedMsg" | "errChoose" | "errCodeName" | "errComment" | "errRate"
  | "errNotOpen" | "errGeneric" | "errLoad" | "loading",
  string
>;

type State = { phase: PollPhase; hasVoted: boolean; votedOptionId: string | null; totalVotes: number; results: PollResults | null };

type Props = {
  pollId: string;
  locale: Locale;
  options: { id: string; label: string }[];
  resultsVisibility: "ALWAYS" | "AFTER_VOTE" | "AFTER_CLOSE";
  labels: PollBoxLabels;
};

/**
 * The interactive part of a poll page. It asks the server what this device may
 * do (which also gives the device its voting cookie), shows the voting form or
 * the results, and submits the vote. All eligibility decisions are the server's;
 * this component only displays them.
 */
export function PollBox({ pollId, locale, options, resultsVisibility, labels: t }: Props) {
  const [state, setState] = useState<State | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [optionId, setOptionId] = useState("");
  const [identity, setIdentity] = useState<"anonymous" | "codename">("anonymous");
  const [codeName, setCodeName] = useState("");
  const [comment, setComment] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [justVoted, setJustVoted] = useState<{ commentPending: boolean } | null>(null);
  const retried = useRef(false);
  const uid = useId();

  const fetchState = useCallback(async (): Promise<State> => {
    const res = await fetch(`/api/polls/${pollId}/state?locale=${locale}`, { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as State;
  }, [pollId, locale]);

  const load = useCallback(async () => {
    try {
      setState(await fetchState());
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [fetchState]);

  // Initial load. This request is also what gives the device its voting cookie.
  useEffect(() => {
    let cancelled = false;
    fetchState()
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchState]);

  const words = countWords(comment);
  const overLimit = words > MAX_COMMENT_WORDS;

  const send = async (): Promise<void> => {
    const res = await fetch(`/api/polls/${pollId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ optionId, identity, codeName, comment, locale, website }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; commentPending?: boolean; state?: State };

    if (res.ok && data.ok && data.state) {
      setState(data.state);
      setJustVoted({ commentPending: Boolean(data.commentPending) });
      return;
    }
    switch (data.error) {
      case "too_fast":
      case "no_device":
        // The device was recognised only a moment ago. Wait briefly and try once more.
        if (!retried.current) {
          retried.current = true;
          if (data.error === "no_device") await load();
          await new Promise((r) => setTimeout(r, 3500));
          return send();
        }
        setError(t.errGeneric);
        return;
      case "already_voted":
        await load();
        return;
      case "not_open":
      case "not_found":
        setError(t.errNotOpen);
        await load();
        return;
      case "invalid_code_name":
        setError(t.errCodeName);
        return;
      case "invalid_comment":
        setError(t.errComment);
        return;
      case "rate_limited":
        setError(t.errRate);
        return;
      default:
        setError(t.errGeneric);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!optionId) return setError(t.errChoose);
    const nameLength = [...codeName.trim()].length;
    if (identity === "codename" && (nameLength < 2 || nameLength > 40)) return setError(t.errCodeName);
    if (overLimit) return setError(t.errComment);
    setError("");
    setBusy(true);
    retried.current = false;
    try {
      await send();
    } catch {
      setError(t.errGeneric);
    } finally {
      setBusy(false);
    }
  };

  if (loadFailed) return <p role="alert" className="rounded-lg bg-white p-5 text-body">{t.errLoad}</p>;
  if (!state) return <p className="min-h-64 rounded-lg bg-white p-5 text-muted" aria-busy="true">{t.loading}</p>;

  const closed = state.phase === "closed" || state.phase === "archived";
  const canVote = state.phase === "active" && !state.hasVoted;
  const field = "mt-1.5 w-full rounded border border-muted bg-white px-3 py-2.5 text-base text-ink";

  return (
    <div className="flex flex-col gap-5">
      {state.phase === "upcoming" && <p className="rounded-lg bg-white p-5 font-semibold">{t.pollNotStarted}</p>}
      {closed && <p className="rounded-lg bg-white p-5 font-semibold">{t.pollClosedMsg}</p>}

      {justVoted && (
        <div role="status" className="rounded-lg border-l-[5px] border-navy bg-white p-5">
          <p className="font-semibold">{t.voteThanks}</p>
          {justVoted.commentPending && <p className="mt-1 text-body">{t.commentPendingMsg}</p>}
        </div>
      )}
      {state.hasVoted && !justVoted && state.phase === "active" && (
        <p role="status" className="rounded-lg bg-white p-5 font-semibold">{t.alreadyVoted}</p>
      )}

      {canVote && (
        <form onSubmit={submit} noValidate className="flex flex-col gap-6 rounded-lg bg-white p-5 sm:p-6">
          <fieldset>
            <legend className="text-lg font-bold">{t.chooseOption}</legend>
            <div className="mt-2 flex flex-col gap-2">
              {options.map((o) => (
                <label
                  key={o.id}
                  className={`flex min-h-12 cursor-pointer items-center gap-3 rounded border px-3.5 py-2.5 ${optionId === o.id ? "border-navy bg-soft" : "border-line"}`}
                >
                  <input type="radio" name={`${uid}-option`} value={o.id} checked={optionId === o.id} onChange={() => { setOptionId(o.id); setError(""); }} className="h-5 w-5 accent-[#0b1f3a]" />
                  <span className="font-semibold">{o.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="font-bold">{t.votingAs}</legend>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
              <label className="flex min-h-11 cursor-pointer items-center gap-2">
                <input type="radio" name={`${uid}-identity`} checked={identity === "anonymous"} onChange={() => setIdentity("anonymous")} className="h-5 w-5 accent-[#0b1f3a]" />
                {t.voteAnonymously}
              </label>
              <label className="flex min-h-11 cursor-pointer items-center gap-2">
                <input type="radio" name={`${uid}-identity`} checked={identity === "codename"} onChange={() => setIdentity("codename")} className="h-5 w-5 accent-[#0b1f3a]" />
                {t.voteWithCodeName}
              </label>
            </div>
            {identity === "codename" && (
              <div className="mt-2">
                <label htmlFor={`${uid}-name`} className="text-sm font-semibold">{t.codeNameLabel}</label>
                <input id={`${uid}-name`} type="text" value={codeName} onChange={(e) => { setCodeName(e.target.value); setError(""); }} maxLength={40} autoComplete="off" aria-describedby={`${uid}-name-hint`} className={field} />
                <p id={`${uid}-name-hint`} className="mt-1 text-sm text-muted">{t.codeNameHint}</p>
              </div>
            )}
          </fieldset>

          <div>
            <label htmlFor={`${uid}-comment`} className="font-bold">{t.commentLabel}</label>
            <textarea id={`${uid}-comment`} value={comment} onChange={(e) => { setComment(e.target.value); setError(""); }} rows={4} aria-describedby={`${uid}-comment-hint`} aria-invalid={overLimit} className={`${field} leading-relaxed`} />
            <p id={`${uid}-comment-hint`} className="mt-1 flex flex-wrap justify-between gap-x-4 text-sm text-muted">
              <span>{t.commentHint}</span>
              <span aria-live="polite" className={`font-latin ${overLimit ? "font-bold text-brand-dark" : ""}`}>
                {words} / {MAX_COMMENT_WORDS} <span className="font-sans">{t.words}</span>
              </span>
            </p>
          </div>

          {/* Hidden from people; automated form-fillers tend to complete it. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label>
              Website
              <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </label>
          </div>

          {error && <p role="alert" className="font-semibold text-brand-dark">{error}</p>}

          <button type="submit" disabled={busy} className="min-h-12 self-start rounded bg-brand px-6 text-base font-bold text-white hover:bg-brand-dark disabled:opacity-70">
            {busy ? t.submitting : t.submitVote}
          </button>
        </form>
      )}

      <section className="rounded-lg bg-white p-5 sm:p-6">
        <h2 className="mb-4 text-xl font-bold">{closed ? t.finalResults : t.results}</h2>
        {state.results ? (
          <PollResultsChart results={state.results} votedOptionId={state.votedOptionId} labels={{ votes: t.votes, totalVotes: t.totalVotes, youChose: t.youChose }} />
        ) : (
          <p className="text-body">
            {state.phase === "upcoming" ? t.pollNotStarted : resultsVisibility === "AFTER_CLOSE" ? t.resultsAfterClose : t.resultsAfterVote}
          </p>
        )}
      </section>
    </div>
  );
}
