import Link from "next/link";
import type { Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionary";

export function NotFoundPage({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
  return (
    <div className="mx-auto max-w-xl rounded-lg bg-white p-8 text-center">
      <h1 className="text-2xl font-bold">{t.notFoundTitle}</h1>
      <p className="mt-2 text-body">{t.notFoundText}</p>
      <Link href={`/${locale}`} className="mt-5 inline-flex min-h-11 items-center rounded bg-brand px-4 font-semibold text-white hover:bg-brand-dark">
        {t.backHome}
      </Link>
    </div>
  );
}
