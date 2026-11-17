/**
 * Estimated cost of one AI request, from the token counts the API reports.
 *
 * Standard Claude API list prices in US dollars per million tokens, checked on
 * 2026-11-17 against platform.claude.com/docs/models. Prices change: update this
 * table when Anthropic changes them. A model that is not listed gets no estimate
 * (null) rather than a guessed one. The invoice from Anthropic is the real cost.
 */

type Price = { input: number; output: number; /** Haiku 5.5 charges more for prompts over 100K tokens. */ longPrompt?: { over: number; input: number; output: number } };

export const PRICES_PER_MTOK: Record<string, Price> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, longPrompt: { over: 100_000, input: 0.5, output: 2.5 } },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

/** Model IDs may come back with a date suffix; match on the listed prefix. */
function priceFor(model: string): Price | null {
  if (PRICES_PER_MTOK[model]) return PRICES_PER_MTOK[model];
  const key = Object.keys(PRICES_PER_MTOK).find((k) => model.startsWith(`${k}-`));
  return key ? PRICES_PER_MTOK[key] : null;
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const p = priceFor(model);
  if (!p) return null;
  const rate = p.longPrompt && inputTokens > p.longPrompt.over ? p.longPrompt : p;
  const cost = (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
