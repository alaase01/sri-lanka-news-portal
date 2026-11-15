/** Neutral block shown where an article image will go. Decorative, so hidden from screen readers. */
export function Thumb({ className }: { className?: string }) {
  return <span aria-hidden="true" className={`block shrink-0 bg-placeholder ${className ?? ""}`} />;
}
