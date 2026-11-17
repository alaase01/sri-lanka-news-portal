import "server-only";
import { getMediaItems, listMedia } from "@/server/media/core";
import type { PickerImage } from "@/components/admin/MediaPicker";

/** Images for the banner form's pickers. Callers must have checked the admin session. */
export async function adImageChoices(selected: string[]): Promise<PickerImage[]> {
  const [recent, chosen] = await Promise.all([listMedia({ take: 40 }), getMediaItems(selected)]);
  const toPicker = (m: (typeof recent.items)[number]): PickerImage => ({ id: m.id, storageKey: m.storageKey, width: m.width, height: m.height, alt: m.altEn || m.altSi });
  const ids = new Set(selected);
  return [...chosen.map(toPicker), ...recent.items.filter((m) => !ids.has(m.id)).map(toPicker)];
}
