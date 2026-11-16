"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { mediaUrl } from "@/lib/content/media";
import { uploadMediaAction } from "@/server/media/actions";

/**
 * Choose or upload an image without leaving the article. The upload fields
 * have no `name`, so they are never sent with the surrounding article form;
 * the upload goes through its own server action.
 */

export type PickerImage = { id: string; storageKey: string; width: number; height: number; alt: string };

const MAX_MB = 8;

export function MediaPicker({ images, value, onChange }: { images: PickerImage[]; value: string; onChange: (id: string) => void }) {
  const [library, setLibrary] = useState(images);
  const [open, setOpen] = useState<"none" | "library" | "upload">("none");
  const [file, setFile] = useState<File | null>(null);
  const [altSi, setAltSi] = useState("");
  const [altEn, setAltEn] = useState("");
  const [credit, setCredit] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const selected = library.find((i) => i.id === value) ?? null;

  // A local preview of the chosen file, so it is clear which photo will be uploaded.
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  /** "Upload" opens the computer's file dialog straight away. */
  function chooseFile() {
    setMessage(null);
    fileInput.current?.click();
  }

  function onFileChosen(f: File | null) {
    if (!f) return;
    if (f.size > MAX_MB * 1024 * 1024) {
      setMessage({ ok: false, text: `The file is larger than ${MAX_MB} MB. Resize or compress it first.` });
      return;
    }
    setFile(f);
    setOpen("upload");
    // The side column is long; bring the description fields into view.
    requestAnimationFrame(() => panel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  function cancelUpload() {
    setFile(null);
    setOpen("none");
    if (fileInput.current) fileInput.current.value = "";
  }

  function upload() {
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
        const result = await uploadMediaAction(fd);
        if (!result.ok) return setMessage({ ok: false, text: result.error });
        setLibrary((l) => [result.image, ...l.filter((i) => i.id !== result.image.id)]);
        onChange(result.image.id);
        setMessage({ ok: true, text: result.duplicate ? "This image was already in the library; it is now selected." : "Uploaded and selected. Save the article to keep it." });
        setFile(null);
        if (fileInput.current) fileInput.current.value = "";
        setAltSi("");
        setAltEn("");
        setCredit("");
        setOpen("none");
      } catch {
        setMessage({ ok: false, text: "The upload failed. Check the connection and try again." });
      }
    });
  }

  const small = "min-h-9 rounded border border-navy px-3 text-sm font-semibold text-navy hover:bg-soft";

  return (
    <div className="flex flex-col gap-3">
      {selected ? (
        <figure>
          {/* eslint-disable-next-line @next/next/no-img-element -- images are already resized WebP */}
          <img src={mediaUrl(selected.storageKey, 480)} alt={selected.alt} width={selected.width} height={selected.height} className="aspect-video w-full rounded object-cover" />
          <figcaption className="mt-1 font-sans text-xs text-muted">{selected.alt}</figcaption>
        </figure>
      ) : (
        <p className="text-sm text-muted">No image selected. Without one, the site logo is shown when this is shared.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={small} aria-expanded={open === "library"} onClick={() => setOpen(open === "library" ? "none" : "library")}>Choose</button>
        <button type="button" className={small} onClick={chooseFile}>Upload…</button>
        {selected && <button type="button" className="min-h-9 px-2 text-sm font-semibold text-brand-dark hover:underline" onClick={() => onChange("")}>Remove</button>}
      </div>
      {/* No name attribute: never sent with the article form. */}
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => onFileChosen(e.target.files?.[0] ?? null)}
      />
      {message && <p role={message.ok ? "status" : "alert"} className={"text-sm font-semibold " + (message.ok ? "text-[#14532d]" : "text-brand-dark")}>{message.text}</p>}

      {open === "library" && (
        <div>
          {library.length === 0 ? (
            <p className="text-sm text-muted">The library is empty. Upload an image.</p>
          ) : (
            <ul className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto" aria-label="Recent images">
              {library.map((img) => (
                <li key={img.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(img.id);
                      setOpen("none");
                    }}
                    aria-pressed={img.id === value}
                    className={"block w-full overflow-hidden rounded ring-2 " + (img.id === value ? "ring-navy" : "ring-transparent hover:ring-line")}
                    title={img.alt}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mediaUrl(img.storageKey, 480)} alt={img.alt} loading="lazy" className="aspect-video w-full object-cover" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <a href="/admin/media" target="_blank" rel="noopener" className="mt-2 inline-block text-xs font-semibold text-navy hover:underline">Open the full media library ↗</a>
        </div>
      )}

      {open === "upload" && file && (
        <div ref={panel} className="flex flex-col gap-2 rounded border border-line p-3">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen file
            <img src={preview} alt="" className="aspect-video w-full rounded bg-soft object-contain" />
          )}
          <p className="break-all text-xs text-muted">
            {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB ·{" "}
            <button type="button" className="font-semibold text-navy hover:underline" onClick={chooseFile}>Choose another</button>
          </p>
          <label className="text-sm font-semibold">
            Description in Sinhala (alt text)
            <input value={altSi} onChange={(e) => setAltSi(e.target.value)} maxLength={250} lang="si" className="mt-1 w-full rounded border border-muted px-2 py-1.5 font-sans font-normal" />
          </label>
          <label className="text-sm font-semibold">
            Description in English (alt text)
            <input value={altEn} onChange={(e) => setAltEn(e.target.value)} maxLength={250} className="mt-1 w-full rounded border border-muted px-2 py-1.5 font-normal" />
          </label>
          <label className="text-sm font-semibold">
            Credit <span className="font-normal text-muted">(optional, e.g. photographer or agency)</span>
            <input value={credit} onChange={(e) => setCredit(e.target.value)} maxLength={120} className="mt-1 w-full rounded border border-muted px-2 py-1.5 font-sans font-normal" />
          </label>
          <p className="text-xs text-muted">Location data and other hidden details are removed from the photo when it is uploaded.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={upload} disabled={pending} className="min-h-10 rounded bg-navy px-4 font-bold text-white disabled:opacity-60">
              {pending ? "Uploading…" : "Upload and use"}
            </button>
            <button type="button" onClick={cancelUpload} disabled={pending} className="min-h-10 rounded px-3 font-semibold text-navy hover:bg-soft">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
