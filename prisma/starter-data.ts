/**
 * Starting structure of the site: sections, subcategories and the main menu.
 * Shared by the demo seed (development) and `npm run site:init` (production),
 * which creates only this structure and the site settings, never articles.
 */

type L = { si: string; en: string };

/** Sections and subcategories: slug, names, children. */
export const starterCategories: { slug: string; name: L; children?: { slug: string; name: L }[] }[] = [
  { slug: "sri-lanka", name: { si: "ශ්‍රී ලංකා පුවත්", en: "Sri Lanka" } },
  { slug: "world", name: { si: "ලෝක පුවත්", en: "World" } },
  {
    slug: "politics",
    name: { si: "දේශපාලන", en: "Politics" },
    children: [
      { slug: "parliament", name: { si: "පාර්ලිමේන්තුව", en: "Parliament" } },
      { slug: "elections", name: { si: "මැතිවරණ", en: "Elections" } },
      { slug: "local-government", name: { si: "පළාත් පාලන", en: "Local Government" } },
    ],
  },
  {
    slug: "business",
    name: { si: "ව්‍යාපාර", en: "Business" },
    children: [
      { slug: "banking", name: { si: "බැංකු", en: "Banking" } },
      { slug: "tourism", name: { si: "සංචාරක", en: "Tourism" } },
      { slug: "trade", name: { si: "වෙළෙඳාම", en: "Trade" } },
    ],
  },
  { slug: "economy", name: { si: "ආර්ථික", en: "Economy" } },
  {
    slug: "sports",
    name: { si: "ක්‍රීඩා", en: "Sports" },
    children: [
      { slug: "cricket", name: { si: "ක්‍රිකට්", en: "Cricket" } },
      { slug: "football", name: { si: "පාපන්දු", en: "Football" } },
      { slug: "rugby", name: { si: "රග්බි", en: "Rugby" } },
      { slug: "athletics", name: { si: "මලල ක්‍රීඩා", en: "Athletics" } },
    ],
  },
  { slug: "entertainment", name: { si: "රසවින්දන", en: "Entertainment" } },
  { slug: "technology", name: { si: "තාක්ෂණ", en: "Technology" } },
  { slug: "education", name: { si: "අධ්‍යාපන", en: "Education" } },
  { slug: "health", name: { si: "සෞඛ්‍ය", en: "Health" } },
  { slug: "lifestyle", name: { si: "ජීවන රටාව", en: "Lifestyle" } },
  { slug: "environment", name: { si: "පරිසර", en: "Environment" } },
  { slug: "transport", name: { si: "ප්‍රවාහන", en: "Transport" } },
  { slug: "opinion", name: { si: "මතවාද", en: "Opinion" } },
];

/** Main menu items, in order, pointing at starter categories. */
export const starterNavigation: { category: string; label: L }[] = [
  { category: "sri-lanka", label: { si: "දේශීය", en: "Local" } },
  { category: "world", label: { si: "විදේශීය", en: "World" } },
  { category: "politics", label: { si: "දේශපාලන", en: "Politics" } },
  { category: "business", label: { si: "ව්‍යාපාර", en: "Business" } },
  { category: "economy", label: { si: "ආර්ථික", en: "Economy" } },
  { category: "sports", label: { si: "ක්‍රීඩා", en: "Sports" } },
  { category: "entertainment", label: { si: "රසවින්දන", en: "Entertainment" } },
  { category: "technology", label: { si: "තාක්ෂණ", en: "Technology" } },
  { category: "lifestyle", label: { si: "ජීවන රටාව", en: "Lifestyle" } },
  { category: "opinion", label: { si: "මතවාද", en: "Opinion" } },
];
