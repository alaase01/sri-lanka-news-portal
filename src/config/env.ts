import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SITE_URL: z.url().default("http://localhost:3000"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Fail fast with the variable names only; never print values.
  const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
  throw new Error(`Invalid or missing environment variables: ${names}`);
}

export const env = {
  DATABASE_URL: parsed.data.DATABASE_URL,
  SITE_URL: parsed.data.SITE_URL.replace(/\/$/, ""),
};
