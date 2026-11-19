import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { newsroomEnv } from "@/config/env";
import { executeRun, tick } from "@/server/newsroom/service";

/**
 * Schedule tick for the automated newsroom, called by the server's systemd timer
 * (deploy/rsnewslk-newsroom.timer) on 127.0.0.1. It can only start the run that
 * is due; it cannot publish or change anything else.
 *
 * Refused unless: a secret is configured, the request carries it, and every
 * address in X-Forwarded-For is the server itself (requests through the public
 * web server carry the visitor's address). Caddy also blocks /api/internal/.
 */

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"]);

function fromThisServer(request: Request): boolean {
  const chain = [request.headers.get("x-forwarded-for"), request.headers.get("x-real-ip")]
    .filter((v): v is string => !!v)
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
  return chain.every((ip) => LOOPBACK.has(ip));
}
const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

function secretMatches(header: string | null, secret: string): boolean {
  const given = Buffer.from(header?.replace(/^Bearer /, "") ?? "");
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request) {
  const secret = newsroomEnv.cronSecret;
  if (!secret) return notFound();
  if (!fromThisServer(request)) return notFound();
  if (!secretMatches(request.headers.get("authorization"), secret)) return notFound();

  const result = await tick(new Date());
  if (result.runId) {
    const runId = result.runId;
    // Respond at once; the run continues on the server.
    after(() => executeRun(runId));
  }
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}

export function GET() {
  return notFound();
}
