"use client";

import { useActionState, useState } from "react";
import { saveAdAction, type AdFormState } from "@/server/admin/ad-actions";
import { AD_ROTATE_SECONDS, AD_SLOTS, PLACEMENT_TO_SLOT, type AdPlacementKey } from "@/lib/content/ads";
import { MediaPicker, type PickerImage } from "./MediaPicker";
import { buttonPrimary, inputClass } from "./ui";

export type AdFormValues = {
  id: string | null;
  updatedAt: string | null;
  placement: AdPlacementKey;
  advertiser: string;
  linkUrl: string;
  desktopMediaId: string;
  mobileMediaId: string;
  showSi: boolean;
  showEn: boolean;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

export function AdForm({ initial, images }: { initial: AdFormValues; images: PickerImage[] }) {
  const [state, action, pending] = useActionState(saveAdAction, { ok: null, message: "", errors: {}, updatedAt: initial.updatedAt, seq: 0 } satisfies AdFormState);
  const [v, setV] = useState(initial);
  const set = <K extends keyof AdFormValues>(k: K, value: AdFormValues[K]) => setV((x) => ({ ...x, [k]: value }));
  const e = state.errors;
  const slot = AD_SLOTS[PLACEMENT_TO_SLOT[v.placement]];
  const err = (k: string) => (e[k] ? <span className="mt-1 block text-sm font-normal text-brand-dark">{e[k]}</span> : null);
  const payload = JSON.stringify({ ...v, id: v.id ?? "", expectedUpdatedAt: state.updatedAt ?? "" });

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="payload" value={payload} />
      {state.message && (
        <p role={state.ok ? "status" : "alert"} className={"rounded px-4 py-3 font-semibold " + (state.ok ? "bg-[#e1f4e8] text-[#14532d]" : "bg-[#fdecee] text-brand-dark")}>{state.message}</p>
      )}
      <section className="grid gap-4 rounded-lg bg-white p-5 md:grid-cols-2">
        <label className="font-semibold">
          Position
          <select value={v.placement} onChange={(ev) => set("placement", ev.target.value as AdPlacementKey)} aria-invalid={!!e.placement} className={inputClass + " font-normal"}>
            {Object.values(AD_SLOTS).map((s) => <option key={s.placement} value={s.placement}>{s.label}</option>)}
          </select>
          <span className="mt-1 block text-sm font-normal text-muted">{slot.where}.</span>
          {err("placement")}
        </label>
        <label className="font-semibold">
          Advertiser
          <input value={v.advertiser} onChange={(ev) => set("advertiser", ev.target.value)} maxLength={120} aria-invalid={!!e.advertiser} className={inputClass + " font-sans font-normal"} />
          <span className="mt-1 block text-sm font-normal text-muted">Also read out by screen readers as the banner&rsquo;s description.</span>
          {err("advertiser")}
        </label>
        <label className="font-semibold md:col-span-2">
          Opens this web address
          <input value={v.linkUrl} onChange={(ev) => set("linkUrl", ev.target.value)} placeholder="https://" aria-invalid={!!e.linkUrl} className={inputClass + " font-normal"} />
          {err("linkUrl")}
        </label>
      </section>

      <section className="grid gap-4 rounded-lg bg-white p-5 md:grid-cols-2" aria-labelledby="images-heading">
        <h2 id="images-heading" className="font-bold md:col-span-2">Banner images</h2>
        <p className="-mt-2 text-sm text-muted md:col-span-2">
          Make the images exactly these sizes (or twice as large for sharp screens). One image is enough; it is then used on all screens.
        </p>
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Computers and tablets: {slot.desktop.w} × {slot.desktop.h} pixels</h3>
          <MediaPicker images={images} value={v.desktopMediaId} onChange={(x) => set("desktopMediaId", x)} />
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Phones: {slot.mobile.w} × {slot.mobile.h} pixels</h3>
          <MediaPicker images={images} value={v.mobileMediaId} onChange={(x) => set("mobileMediaId", x)} />
        </div>
        <div className="md:col-span-2">{err("images")}</div>
      </section>

      <section className="grid gap-4 rounded-lg bg-white p-5 md:grid-cols-2">
        <fieldset>
          <legend className="font-semibold">Show on</legend>
          <div className="mt-2 flex gap-5">
            <label className="flex items-center gap-2"><input type="checkbox" checked={v.showSi} onChange={(ev) => set("showSi", ev.target.checked)} /> Sinhala edition</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={v.showEn} onChange={(ev) => set("showEn", ev.target.checked)} /> English edition</label>
          </div>
          {err("editions")}
        </fieldset>
        <label className="flex items-center gap-2 self-end font-semibold">
          <input type="checkbox" checked={v.isActive} onChange={(ev) => set("isActive", ev.target.checked)} /> Switched on
        </label>
        <label className="font-semibold">
          Starts (Sri Lanka time)
          <input type="datetime-local" value={v.startsAt} onChange={(ev) => set("startsAt", ev.target.value)} aria-invalid={!!e.startsAt} className={inputClass + " font-normal"} />
          {err("startsAt")}
        </label>
        <label className="font-semibold">
          Ends (optional)
          <input type="datetime-local" value={v.endsAt} onChange={(ev) => set("endsAt", ev.target.value)} aria-invalid={!!e.endsAt} className={inputClass + " font-normal"} />
          {err("endsAt") ?? <span className="mt-1 block text-sm font-normal text-muted">The banner stops by itself at this time.</span>}
        </label>
        <p className="text-sm text-muted md:col-span-2">
          When several banners run in one position, they take turns every {AD_ROTATE_SECONDS} seconds, starting from a random one on each page.
        </p>
      </section>
      <div>
        <button type="submit" disabled={pending} className={buttonPrimary}>{pending ? "Saving…" : v.id ? "Save banner" : "Create banner"}</button>
      </div>
    </form>
  );
}
