import { NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { clientIp, networkHash } from "@/server/polls/device";
import { ensureDevice, isPollId, localeFrom, NO_STORE } from "@/server/polls/http";
import { getPollState } from "@/server/polls/read";

/**
 * What this device may see and do on a poll: whether voting is open, whether it
 * has voted, and the results if it is allowed to see them. Also the point where
 * a device is given its voting cookie.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isPollId(id)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });

  const now = new Date();
  const { device, wasInvalid } = await ensureDevice(now);
  if (wasInvalid) {
    await db.pollEvent
      .create({ data: { type: "INVALID_DEVICE_TOKEN", pollId: null, networkHash: networkHash(clientIp(request.headers), now) } })
      .catch(() => undefined);
  }

  const locale = localeFrom(new URL(request.url).searchParams.get("locale"));
  const state = await getPollState(id, locale, device.hash, now);
  if (!state) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  return NextResponse.json(state, { headers: NO_STORE });
}
