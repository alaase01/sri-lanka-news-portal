"use client";

/** Ticks or clears every checkbox that belongs to the given form. */
export function SelectAll({ form, label }: { form: string; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm font-semibold">
      <input
        type="checkbox"
        onChange={(e) => {
          document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][form="${form}"]`).forEach((c) => (c.checked = e.target.checked));
        }}
      />
      {label}
    </label>
  );
}
