import { describe, expect, it } from "vitest";
import { checkPasswordPolicy, hashPassword, isPlausibleEmail, normaliseEmail, verifyPassword } from "@/server/auth/password";

describe("password policy", () => {
  it("requires at least 12 characters, counting Sinhala letters properly", () => {
    expect(checkPasswordPolicy("short pass", "a@b.co")).toBe("too_short");
    expect(checkPasswordPolicy("correct horse battery", "a@b.co")).toBeNull();
    expect(checkPasswordPolicy("ශ්‍රී ලංකා ජයවේවා", "a@b.co")).toBeNull();
  });
  it("rejects common and repetitive passwords", () => {
    expect(checkPasswordPolicy("Password1234", "a@b.co")).toBe("too_common");
    expect(checkPasswordPolicy("zzzzzzzzzzzzzz", "a@b.co")).toBe("too_common");
  });
  it("rejects a password built on the email name", () => {
    expect(checkPasswordPolicy("asela-secret-2026", "Asela@example.com")).toBe("same_as_email");
  });
  it("caps length to keep hashing cheap", () => {
    expect(checkPasswordPolicy("x".repeat(257) + "y", "a@b.co")).toBe("too_long");
  });
});

describe("password hashing", () => {
  it("uses Argon2id and verifies only the right password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("$argon2id$v=19$m=65536,t=3,p=1$")).toBe(true);
    expect(await verifyPassword(hash, "correct horse battery staple")).toBe(true);
    expect(await verifyPassword(hash, "correct horse battery stapl")).toBe(false);
  });
  it("salts every hash", async () => {
    expect(await hashPassword("same password here")).not.toBe(await hashPassword("same password here"));
  });
  it("fails closed on a malformed stored hash instead of throwing", async () => {
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
  });
});

describe("email handling", () => {
  it("normalises case and spaces", () => {
    expect(normaliseEmail("  Owner@Example.COM ")).toBe("owner@example.com");
  });
  it("accepts plausible addresses only", () => {
    expect(isPlausibleEmail("owner@example.com")).toBe(true);
    expect(isPlausibleEmail("owner@")).toBe(false);
    expect(isPlausibleEmail("a b@c.d")).toBe(false);
  });
});
