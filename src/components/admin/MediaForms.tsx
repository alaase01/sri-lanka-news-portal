"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMediaTextAction, uploadMediaAction, type MediaTextState } from "@/server/media/actions";
import { buttonPrimary, inputClass } from "./ui";

const MAX_MB = 8;

export function MediaUploader() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [altSi, setAltSi] = useState("");
  const [altEn, setAltEn] = useState("");
  const [credit, setCredit] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setMessage(null);
    if (!file) return setMessage({ ok: false, text: "Choose an image file." });
    if (file.size > MAX_MB * 1024 * 1024) return setMessage({ ok: false, text: `The file is larger than ${MAX_MB} MB. Resize or compress it first.` });
    if (!altSi.trim() && !altEn.trim()) return setMessage({ ok: false, text: "Describe the image in at least one language." });
    const fd = new FormData();
    fd.set("file", file);
    fd.set("altSi", altSi);
    fd.set("altEn", altEn);
    fd.set("credit", credit);
    startTransition(async () => {
      try {
        const r = await uploadMediaAction(fd);
        if (!r.ok) return setMessage({ ok: false, text: r.error });
        setMessage({ ok: true, text: r.duplicate ? "This image is already in the library." : "Uploaded." });
        setFile(null);
        setFileKey((k) => k + 1);
        setAltSi("");
        setAltEn("");
        setCredit("");
        router.refresh();
      } catch {
        setMessage({ ok: false, text: "The upload failed. Check the connection and try again." });
      }
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-lg bg-white p-5 md:grid-cols-2">
      <h2 className="text-lg font-bold md:col-span-2">Upload an image</h2>
      <label className="font-semibold md:col-span-2">
        Image file (JPEG, PNG, WebP or AVIF, up to {MAX_MB} MB)
        <input key={fileKey} type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full font-normal" />
      </label>
      <label className="font-semibold">
        Description in Sinhala (alt text)
        <input value={altSi} onChange={(e) => setAltSi(e.target.value)} maxLength={250} lang="si" className={inputClass + " font-sans font-normal"} />
      </label>
      <label className="font-semibold">
        Description in English (alt text)
        <input value={altEn} onChange={(e) => setAltEn(e.target.value)} maxLength={250} className={inputClass + " font-normal"} />
      </label>
      <label className="font-semibold">
        Credit <span className="font-normal text-muted">(optional)</span>
        <input value={credit} onChange={(e) => setCredit(e.target.value)} maxLength={120} className={inputClass + " font-sans font-normal"} />
      </label>
      <div className="flex flex-col justify-end gap-2">
        <p className="text-sm text-muted">Location data and other hidden details are removed when the image is uploaded.</p>
      </div>
      {message && <p role={message.ok ? "status" : "alert"} className={"font-semibold md:col-span-2 " + (message.ok ? "text-[#14532d]" : "text-brand-dark")}>{message.text}</p>}
      <div className="md:col-span-2">
        <button type="submit" disabled={pending} className={buttonPrimary}>{pending ? "Uploading…" : "Upload"}</button>
      </div>
    </form>
  );
}

export type MediaTextValues = { altSi: string; altEn: string; captionSi: string; captionEn: string; credit: string };

export function MediaTextForm({ mediaId, initial }: { mediaId: string; initial: MediaTextValues }) {
  const [state, action, pending] = useActionState<MediaTextState, FormData>(updateMediaTextAction, { ok: null, message: "" });
  const [v, setV] = useState(initial);
  const field = (key: keyof MediaTextValues, label: string, si: boolean, multiline = false) => (
    <label className="font-semibold">
      {label}
      {multiline ? (
        <textarea name={key} value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} rows={2} maxLength={300} lang={si ? "si" : "en"} className={inputClass + " font-normal" + (si ? " font-sans" : "")} />
      ) : (
        <input name={key} value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} maxLength={250} lang={si ? "si" : "en"} className={inputClass + " font-normal" + (si ? " font-sans" : "")} />
      )}
    </label>
  );
  return (
    <form action={action} className="grid gap-3 rounded-lg bg-white p-5 md:grid-cols-2">
      <input type="hidden" name="mediaId" value={mediaId} />
      {state.message && <p role={state.ok ? "status" : "alert"} className={"font-semibold md:col-span-2 " + (state.ok ? "text-[#14532d]" : "text-brand-dark")}>{state.message}</p>}
      {field("altSi", "Description in Sinhala (alt text)", true)}
      {field("altEn", "Description in English (alt text)", false)}
      {field("captionSi", "Caption in Sinhala (optional)", true, true)}
      {field("captionEn", "Caption in English (optional)", false, true)}
      {field("credit", "Credit (optional)", true)}
      <div className="flex items-end">
        <button type="submit" disabled={pending} className={buttonPrimary}>{pending ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}
