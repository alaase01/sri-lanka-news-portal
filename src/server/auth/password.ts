import { hash, verify } from "@node-rs/argon2";
import { authConfig } from "@/config/auth";

/**
 * Password hashing with Argon2id (64 MiB memory, 3 passes, 1 lane), the
 * OWASP-recommended algorithm. The hash string records its own parameters,
 * so they can be raised later without breaking existing hashes.
 *
 * Deliberately free of "server-only" so the setup script can use it too.
 */

const ARGON2ID = 2;
const OPTIONS = { algorithm: ARGON2ID, memoryCost: 65_536, timeCost: 3, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    // A malformed stored hash must fail closed, never throw a 500.
    return false;
  }
}

/**
 * A real Argon2id hash of a random value nobody knows. Verifying against it when
 * an email does not exist makes a wrong email take as long as a wrong password,
 * so response time does not reveal whether the account exists.
 */
let dummyHash: Promise<string> | null = null;
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(`dummy-${Math.random()}-${Date.now()}`);
  return dummyHash;
}

/** Passwords that meet the length rule but are still too obvious. Checked case-insensitively. */
const COMMON = new Set([
  "password1234", "password12345", "password123456", "123456789012", "1234567890123", "qwertyuiop12",
  "qwerty123456", "iloveyou1234", "administrator", "admin1234567", "letmein12345", "welcome12345",
  "srilanka1234", "srilanka12345", "colombo12345", "rsnewslk1234", "rsnewslk.com", "changeme1234",
  "abcdefghijkl", "aaaaaaaaaaaa", "111111111111", "000000000000", "passwordpassword", "newspassword",
]);

export type PasswordProblem = "too_short" | "too_long" | "too_common" | "same_as_email";

/** Length is what matters most for passphrases; no composition rules. */
export function checkPasswordPolicy(password: string, email: string): PasswordProblem | null {
  const length = [...password].length;
  if (length < authConfig.minPasswordLength) return "too_short";
  if (length > authConfig.maxPasswordLength) return "too_long";
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/u.test(password)) return "too_common";
  if (email && lower.includes(email.toLowerCase().split("@")[0]) && email.split("@")[0].length >= 4) return "same_as_email";
  return null;
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isPlausibleEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
