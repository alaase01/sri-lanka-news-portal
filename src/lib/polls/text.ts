/**
 * Text rules for votes, shared by the form (live counter) and the server (the
 * check that counts). No HTML is ever accepted or produced: comments and code
 * names are plain text and are rendered as text.
 */

export const MAX_COMMENT_WORDS = 400;

/** Words are runs of non-space characters, which works for Sinhala and English alike. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/u).length;
}

/** Removes control and invisible formatting characters, keeping the zero-width joiner Sinhala needs. */
function stripControl(text: string): string {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​‎‏‪-‮⁠-⁤﻿]/g, "");
}

/** Single-line display name: control characters removed, whitespace collapsed. */
export function cleanCodeName(input: string): string {
  return stripControl(input).normalize("NFC").replace(/\s+/gu, " ").trim();
}

/** Comment text: control characters removed, line endings unified, at most one blank line in a row. */
export function cleanComment(input: string): string {
  return stripControl(input)
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Signs that a comment deserves a closer look by the moderator. Never blocks the vote. */
export function looksSuspicious(comment: string): boolean {
  if (/(https?:\/\/|www\.)/i.test(comment)) return true;
  if (/<\s*\/?\s*[a-z][^>]*>/i.test(comment)) return true;
  if (/(.)\1{14,}/u.test(comment)) return true;
  return false;
}
