import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SITE_URL: z.url().default("http://localhost:3000"),
  // Signs voting device tokens and keys the hashes stored with votes.
  // Required in production; development falls back to a fixed, public value.
  VOTE_SECRET: z.string().min(32).optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Fail fast with the variable names only; never print values.
  const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
  throw new Error(`Invalid or missing environment variables: ${names}`);
}

const DEV_VOTE_SECRET = "development-only-vote-secret-not-for-production";
if (process.env.NODE_ENV === "production" && !parsed.data.VOTE_SECRET) {
  throw new Error("Invalid or missing environment variables: VOTE_SECRET");
}

export const env = {
  VOTE_SECRET: parsed.data.VOTE_SECRET ?? DEV_VOTE_SECRET,
  DATABASE_URL: parsed.data.DATABASE_URL,
  SITE_URL: parsed.data.SITE_URL.replace(/\/$/, ""),
};
