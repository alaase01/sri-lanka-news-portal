import { NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { isPollId, NO_STORE } from "@/server/polls/http";
import { getApprovedComments } from "@/server/polls/read";

/** Approved comments for a public poll, one page at a time. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cursor = new URL(request.url).searchParams.get("cursor");
  if (!isPollId(id) || (cursor !== null && !isPollId(cursor))) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  }
  const poll = await db.poll.findFirst({
    where: { id, deletedAt: null, isHidden: false, status: { not: "DRAFT" } },
    select: { id: true },
  });
  if (!poll) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });

  return NextResponse.json(await getApprovedComments(id, cursor), { headers: NO_STORE });
}
