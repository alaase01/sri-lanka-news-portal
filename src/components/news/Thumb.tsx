import { mediaSrcSet, mediaUrl } from "@/lib/content/media";
import type { CardImage } from "@/server/services/content";

/**
 * Article thumbnail. Uses the featured image when there is one, otherwise a
 * plain placeholder block of the same size so layouts do not shift.
 */
export function Thumb({ className, image, sizes = "(min-width: 1024px) 320px, 50vw" }: { className?: string; image?: CardImage | null; sizes?: string }) {
  if (!image) return <span aria-hidden="true" className={`block shrink-0 bg-placeholder ${className ?? ""}`} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- images are pre-resized WebP served from /media with srcset
    <img
      src={mediaUrl(image.storageKey, 480)}
      srcSet={mediaSrcSet(image.storageKey, image.width)}
      sizes={sizes}
      width={image.width}
      height={image.height}
      // The headline next to the thumbnail already says what the story is; the picture is decorative here.
      alt=""
      loading="lazy"
      decoding="async"
      className={`block shrink-0 bg-placeholder object-cover ${className ?? ""}`}
    />
  );
}
