/**
 * The RSNEWSLK.COM wordmark as styled text (never an image), so it stays sharp
 * at any size, is read by screen readers, and appears in screenshots.
 * `tone` picks the colours for a dark (navy) or light (white) background.
 */
export function Wordmark({ tone = "dark", className }: { tone?: "dark" | "light"; className?: string }) {
  const base = tone === "dark" ? "text-white" : "text-navy";
  const accent = tone === "dark" ? "text-brand-light" : "text-brand";
  return (
    <span className={`font-latin font-extrabold italic tracking-tight ${base} ${className ?? ""}`}>
      RSNEWS<span className={accent}>LK</span>.COM
    </span>
  );
}
