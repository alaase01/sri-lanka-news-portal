import type { MetadataRoute } from "next";
import { env } from "@/config/env";

/**
 * Crawling rules. Public pages, images (/media, /brand) and the site's CSS and
 * JavaScript (/_next) stay crawlable. Blocked: the admin area (also protected by
 * sign-in; robots.txt is not security), server endpoints and the ad-click
 * redirects. Noindex pages are not blocked, so search engines can read the noindex.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/go/"] }],
    sitemap: [`${env.SITE_URL}/sitemap.xml`, `${env.SITE_URL}/news-sitemap.xml`],
  };
}
