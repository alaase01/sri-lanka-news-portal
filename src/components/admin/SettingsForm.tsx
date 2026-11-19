"use client";

import { useState } from "react";
import { SOCIAL_NETWORKS } from "@/lib/seo/social";
import { saveSettingsAction } from "@/server/admin/settings-actions";
import type { SettingsView } from "@/server/admin/settings";
import { MediaPicker, type PickerImage } from "./MediaPicker";
import { Notice, buttonPrimary, inputClass } from "./ui";

export function SettingsForm({ initial, images }: { initial: SettingsView; images: PickerImage[] }) {
  const [social, setSocial] = useState<Record<string, string>>(Object.fromEntries(SOCIAL_NETWORKS.map((n) => [n.key, initial.social[n.key] ?? ""])));
  const [shareId, setShareId] = useState(initial.defaultShareMediaId ?? "");
  const [budget, setBudget] = useState(initial.aiMonthlyBudgetUsd);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    setSaving(true);
    setMessage(null);
    setErrors({});
    try {
      const r = await saveSettingsAction(JSON.stringify({ social, defaultShareMediaId: shareId, aiMonthlyBudgetUsd: budget }));
      if (r.ok) setMessage({ ok: true, text: "Settings saved. Footer links and share previews now use them." });
      else {
        setMessage({ ok: false, text: r.message });
        setErrors(r.errors);
      }
    } catch {
      setMessage({ ok: false, text: "The server could not be reached, so nothing was saved. Try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3 rounded-lg bg-white p-4">
        <h2 className="text-base font-bold">Official social profiles</h2>
        <p className="text-sm text-muted">
          Only add your own official profiles. They appear as links in the site footer and tell search engines which profiles belong to RSnewslk.com.
          Leave a field empty if you have no profile there.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {SOCIAL_NETWORKS.map((n) => (
            <label key={n.key} className="text-sm font-semibold">
              {n.label}
              <input
                value={social[n.key]}
                onChange={(e) => setSocial((s) => ({ ...s, [n.key]: e.target.value }))}
                placeholder={n.example}
                inputMode="url"
                aria-invalid={!!errors[n.key]}
                className={inputClass + " font-latin"}
              />
              {errors[n.key] && <span className="block font-normal text-brand-dark">{errors[n.key]}</span>}
            </label>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-lg bg-white p-4">
        <h2 className="text-base font-bold">Default share image</h2>
        <p className="text-sm text-muted">
          Shown on Facebook, WhatsApp and X when a page has no image of its own. Leave empty to use the built-in RSnewslk.com image. Best size: 1200 × 630
          pixels or larger; it is cropped to that shape.
        </p>
        <MediaPicker images={images} value={shareId} onChange={setShareId} />
        {errors.defaultShareMediaId && <span className="text-sm text-brand-dark">{errors.defaultShareMediaId}</span>}
      </section>

      <section className="flex flex-col gap-3 rounded-lg bg-white p-4">
        <h2 className="text-base font-bold">Monthly AI budget</h2>
        <p className="text-sm text-muted">
          Hard limit for all AI use on the site (AI Editorial Assistant and the Automated Global Newsroom) per Sri Lanka calendar month, in US dollars,
          estimated from real usage and list prices. Warnings at 75% and 90%; AI work stops at the limit. This is separate from any Claude subscription;
          also set a spending limit in your Anthropic Console as a second safeguard.
        </p>
        <label className="text-sm font-semibold sm:w-64">
          Limit (USD)
          <input value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal" aria-invalid={!!errors.aiMonthlyBudgetUsd} className={inputClass} />
          {errors.aiMonthlyBudgetUsd && <span className="block font-normal text-brand-dark">{errors.aiMonthlyBudgetUsd}</span>}
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className={buttonPrimary}>
          {saving ? "Saving…" : "Save settings"}
        </button>
        <div aria-live="polite">{message && <Notice tone={message.ok ? undefined : "error"}>{message.text}</Notice>}</div>
      </div>
    </div>
  );
}
