export type OptionResult = { optionId: string; label: string; votes: number; percent: number };
export type PollResults = { total: number; options: OptionResult[] };

/**
 * Whole-number percentages that always add up to 100 (largest-remainder method),
 * so the chart never shows 99% or 101%. With no votes, every option is 0.
 */
export function withPercentages(options: { optionId: string; label: string; votes: number }[]): PollResults {
  const total = options.reduce((sum, o) => sum + o.votes, 0);
  if (total === 0) return { total, options: options.map((o) => ({ ...o, percent: 0 })) };

  const exact = options.map((o) => (o.votes * 100) / total);
  const floors = exact.map(Math.floor);
  let remaining = 100 - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of order) {
    if (remaining <= 0) break;
    floors[index] += 1;
    remaining -= 1;
  }
  return { total, options: options.map((o, i) => ({ ...o, percent: floors[i] })) };
}
