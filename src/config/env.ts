import "server-only";
import { z } from "zod";

/** A whole number setting; an empty value counts as "not set". */
const optionalInt = (min: number, max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.coerce.number().int().min(min).max(max).optional());

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SITE_URL: z.url().default("http://localhost:3000"),
  // Signs voting device tokens and keys the hashes stored with votes.
  // Required in production; development falls back to a fixed, public value.
  VOTE_SECRET: z.string().min(32).optional(),
  // Folder for uploaded images. Must persist between deployments and be backed up.
  MEDIA_DIR: z.string().min(1).default("storage/media"),
  // AI Editorial Assistant. Optional: without a key the assistant shows "not configured".
  // Server-only; never sent to the browser or written to logs.
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().max(100).optional(),
  AI_MODEL_LIGHT: z.string().max(100).optional(),
  AI_EFFORT: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["low", "medium", "high"]).optional()),
  AI_TIMEOUT_SECONDS: optionalInt(10, 600),
  AI_HOURLY_LIMIT: optionalInt(1, 1000),
  AI_DAILY_LIMIT: optionalInt(1, 10000),
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
  MEDIA_DIR: parsed.data.MEDIA_DIR,
};

/** AI settings. Empty strings in .env count as "not set". */
export const aiEnv = {
  apiKey: parsed.data.ANTHROPIC_API_KEY?.trim() || null,
  model: parsed.data.AI_MODEL?.trim() || "claude-sonnet-5-5",
  modelLight: parsed.data.AI_MODEL_LIGHT?.trim() || "claude-haiku-5-5",
  effort: parsed.data.AI_EFFORT ?? "medium",
  timeoutMs: (parsed.data.AI_TIMEOUT_SECONDS ?? 180) * 1000,
  hourlyLimit: parsed.data.AI_HOURLY_LIMIT ?? 30,
  dailyLimit: parsed.data.AI_DAILY_LIMIT ?? 150,
};
