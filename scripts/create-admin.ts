/**
 * Creates the site's single administrator, or resets their email and password.
 *
 *   npm run admin:create            first-time setup (refuses if an administrator exists)
 *   npm run admin:create -- --reset change the administrator's email/password and
 *                                   sign out every existing session
 *
 * Run it on the server, in a terminal. There is deliberately no web form for this:
 * nobody can create or take over the administrator account through the website.
 * The password is typed at a hidden prompt and never echoed, logged or stored
 * anywhere except as an Argon2id hash.
 */
import "dotenv/config";
import { createInterface } from "node:readline";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { checkPasswordPolicy, hashPassword, isPlausibleEmail, normaliseEmail } from "../src/server/auth/password";

const PROBLEMS = {
  too_short: "The password must be at least 12 characters. A few unrelated words make a strong, memorable one.",
  too_long: "The password must be at most 256 characters.",
  too_common: "That password is too easy to guess. Choose another.",
  same_as_email: "The password must not contain the email name.",
} as const;

// One reader for the whole session, so typed or piped lines are never lost between questions.
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY) });
const internals = rl as unknown as { _writeToOutput: (s: string) => void };
const echo = internals._writeToOutput.bind(rl);
let muted = false;
// While a password is being typed, suppress the echo of every keystroke.
internals._writeToOutput = (s: string) => {
  if (!muted) echo(s);
};
const lines = rl[Symbol.asyncIterator]();

async function ask(question: string, hidden = false): Promise<string> {
  process.stdout.write(question);
  muted = hidden && Boolean(process.stdin.isTTY);
  const next = await lines.next();
  if (muted) process.stdout.write("\n");
  muted = false;
  if (next.done) throw new Error("Input ended before all questions were answered.");
  return next.value;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set. Check your .env file.");
  const reset = process.argv.includes("--reset");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

  try {
    const existing = await db.admin.findMany({ select: { id: true, email: true } });
    if (existing.length > 1) throw new Error("More than one administrator exists. This site supports exactly one; fix the Admin table first.");
    if (existing.length === 1 && !reset) {
      console.error("An administrator already exists. To change the email or password, run:  npm run admin:create -- --reset");
      process.exitCode = 1;
      return;
    }
    if (existing.length === 0 && reset) console.log("No administrator exists yet, so this will create one.");

    console.log(reset && existing.length ? "Reset the administrator's email and password.\n" : "Create the site administrator.\n");

    const email = normaliseEmail(await ask(existing[0] ? `Email [${existing[0].email}]: ` : "Email: ")) || existing[0]?.email || "";
    if (!isPlausibleEmail(email)) throw new Error("That is not a valid email address.");

    const password = await ask("Password (hidden): ", true);
    const problem = checkPasswordPolicy(password, email);
    if (problem) throw new Error(PROBLEMS[problem]);
    const confirm = await ask("Repeat password (hidden): ", true);
    if (confirm !== password) throw new Error("The two passwords do not match.");

    const passwordHash = await hashPassword(password);

    if (existing[0]) {
      const admin = existing[0];
      await db.$transaction([
        db.admin.update({ where: { id: admin.id }, data: { email, passwordHash } }),
        db.adminSession.deleteMany({ where: { adminId: admin.id } }),
        db.auditLog.create({ data: { adminId: admin.id, action: "auth.credentials_reset", meta: { emailChanged: email !== admin.email } } }),
      ]);
      console.log(`\nDone. The administrator is ${email}. All existing sessions have been signed out.`);
    } else {
      const admin = await db.admin.create({ data: { email, passwordHash } });
      await db.auditLog.create({ data: { adminId: admin.id, action: "auth.admin_created" } });
      console.log(`\nDone. Sign in at /admin/login as ${email}.`);
    }
  } finally {
    rl.close();
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : "Something went wrong."}`);
  process.exitCode = 1;
});
