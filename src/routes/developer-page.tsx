import type { Metadata } from "next";
import { developer, developerContacts } from "@/config/developer";
import { otherLocale, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionary";
import { alternates } from "@/lib/seo/metadata";
import { Breadcrumbs } from "@/components/article/Breadcrumbs";

const path = (locale: Locale) => `/${locale}/developer`;

export function developerMetadata(locale: Locale): Metadata {
  const t = getDictionary(locale);
  return {
    title: `${t.hireDeveloper}: ${developer.name}`,
    description: developer.intro[locale],
    alternates: alternates(locale, path(locale), path(otherLocale(locale))),
  };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-5">
      <h2 className="text-xl font-bold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: readonly string[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item} className="flex gap-3 leading-relaxed">
          <span aria-hidden="true" className="mt-[0.7em] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function DeveloperPage({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
  const contacts = developerContacts();

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 rounded-lg bg-white px-4 py-6 sm:px-8 sm:py-8">
      <Breadcrumbs crumbs={[{ name: t.hireDeveloper, href: path(locale) }]} homeHref={`/${locale}`} homeLabel={t.home} />

      <header>
        <p className="text-sm font-semibold text-muted">{t.devNoticeTitle}</p>
        <h1 className="mt-1 text-3xl font-bold leading-snug">{developer.name}</h1>
        <p className="mt-1 text-lg font-semibold text-brand-dark">{developer.title[locale]}</p>
        <p className="mt-4 text-lg leading-relaxed text-body">{developer.intro[locale]}</p>
      </header>

      <Section title={t.devServices}>
        <Bullets items={developer.services[locale]} />
      </Section>

      <Section title={t.devCaseStudy}>
        <Bullets items={developer.caseStudy[locale]} />
      </Section>

      <Section title={t.devTech}>
        <ul className="flex flex-wrap gap-2 font-latin">
          {developer.technologies.map((tech) => (
            <li key={tech} className="rounded-full bg-soft px-3 py-1 text-sm font-medium">
              {tech}
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t.devCredentials}>
        <ul className="flex flex-col gap-1 font-latin">
          {developer.credentials.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </Section>

      {contacts.length > 0 ? (
        <Section title={t.devContact}>
          <p className="text-body">{t.devContactIntro}</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {contacts.map((c) => (
              <li key={c.kind}>
                <a
                  href={c.href}
                  rel={c.kind === "email" ? undefined : "noopener noreferrer"}
                  target={c.kind === "email" ? undefined : "_blank"}
                  className="flex min-h-11 items-center rounded bg-navy px-4 font-latin font-semibold text-white hover:bg-navy-deep"
                >
                  {c.label}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      ) : (
        process.env.NODE_ENV !== "production" && (
          <p className="rounded border border-dashed border-muted bg-soft p-4 font-latin text-sm text-muted">
            Development note: no contact details are set. Add them in src/config/developer.ts.
          </p>
        )
      )}

      <p className="border-t border-line pt-4 text-sm text-muted">{t.devDisclaimer}</p>
    </article>
  );
}
