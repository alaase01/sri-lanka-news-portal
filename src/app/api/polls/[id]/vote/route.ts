import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, networkHash } from "@/server/polls/device";
import { isPollId, isSameOrigin, NO_STORE, readDevice } from "@/server/polls/http";
import { getPollState } from "@/server/polls/read";
import { castVote, type VoteFailure } from "@/server/polls/vote";

const body = z.object({
  optionId: z.string().regex(/^[a-z0-9]{20,40}$/),
  identity: z.enum(["anonymous", "codename"]),
  codeName: z.string().max(200).optional(),
  comment: z.string().max(20_000).optional(),
  locale: z.enum(["si", "en"]),
  // Honeypot: a field hidden from people. Anything in it marks an automated submission.
  website: z.string().max(200).optional(),
});

const STATUS: Record<VoteFailure, number> = {
  rejected: 400,
  no_device: 409,
  not_found: 404,
  not_open: 409,
  too_fast: 429,
  invalid_option: 400,
  invalid_code_name: 400,
  invalid_comment: 400,
  already_voted: 409,
  rate_limited: 429,
};

const fail = (code: string, status: number) => NextResponse.json({ error: code }, { status, headers: NO_STORE });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isPollId(id)) return fail("not_found", 404);
  if (!isSameOrigin(request)) return fail("forbidden", 403);
  if (!(request.headers.get("content-type") ?? "").startsWith("application/json")) return fail("bad_request", 415);

  const text = await request.text();
  if (text.length > 30_000) return fail("bad_request", 413);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail("bad_request", 400);
  }
  const parsed = body.safeParse(json);
  if (!parsed.success) return fail("bad_request", 400);

  const now = new Date();
  // The vote endpoint never issues a device cookie: a device must already have
  // been recognised by loading the poll.
  const { device, invalid } = await readDevice(now);

  const result = await castVote({
    pollId: id,
    optionId: parsed.data.optionId,
    identity: parsed.data.identity,
    codeName: parsed.data.codeName,
    comment: parsed.data.comment,
    locale: parsed.data.locale,
    honeypot: parsed.data.website,
    device,
    deviceInvalid: invalid,
    networkHash: networkHash(clientIp(request.headers), now),
    now,
  });

  if (!result.ok) return fail(result.code, STATUS[result.code]);

  const state = await getPollState(id, parsed.data.locale, device!.hash, now);
  return NextResponse.json({ ok: true, commentPending: result.commentPending, state }, { headers: NO_STORE });
}
