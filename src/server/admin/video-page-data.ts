import "server-only";
import { categoryOptions, tagOptions } from "./articles";
import { articleChoices } from "./videos";
import { getMediaItems, listMedia } from "@/server/media/core";
import type { PickerImage } from "@/components/admin/MediaPicker";

/** Choices shown in the video form. Callers must have checked the admin session. */
export async function videoFormOptions(selectedImageId: string | null) {
  const [categories, tags, articles, recent, selected] = await Promise.all([
    categoryOptions(),
    tagOptions(),
    articleChoices(),
    listMedia({ take: 30 }),
    getMediaItems(selectedImageId ? [selectedImageId] : []),
  ]);
  const toPicker = (m: (typeof recent.items)[number]): PickerImage => ({ id: m.id, storageKey: m.storageKey, width: m.width, height: m.height, alt: m.altEn || m.altSi });
  const images = [...selected.map(toPicker), ...recent.items.filter((m) => m.id !== selectedImageId).map(toPicker)];
  return { options: { categories, tags, articles }, images };
}
