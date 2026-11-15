/**
 * Development seed: FICTIONAL demonstration content. None of these stories describe real events.
 * The site shows a notice saying so while this content is present.
 *
 * Wipes all content tables first. Refuses to run in production.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

if (process.env.NODE_ENV === "production") {
  throw new Error("The demo seed must not be run in production.");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

type L = { si: string; en: string };

const doc = (paragraphs: string[]) => ({
  type: "doc",
  content: paragraphs.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })),
});

// slug, names, children
const categories: { slug: string; name: L; children?: { slug: string; name: L }[] }[] = [
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

const navigation: { category: string; label: L }[] = [
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

const tags: { slug: string; name: L }[] = [
  { slug: "investment", name: { si: "ආයෝජන", en: "Investment" } },
  { slug: "weather", name: { si: "කාලගුණය", en: "Weather" } },
  { slug: "exams", name: { si: "විභාග", en: "Exams" } },
  { slug: "railway", name: { si: "දුම්රිය", en: "Railway" } },
  { slug: "renewable-energy", name: { si: "පුනර්ජනනීය බලශක්තිය", en: "Renewable energy" } },
  { slug: "national-team", name: { si: "ජාතික කණ්ඩායම", en: "National team" } },
];

type Story = {
  slug: string;
  category: string;
  extra?: string[];
  tags?: string[];
  minutesAgo: number;
  views?: number;
  featured?: boolean;
  breaking?: boolean;
  si: { headline: string; summary: string; body: string[] };
  en?: { headline: string; summary: string; body: string[] };
};

const stories: Story[] = [
  {
    slug: "new-opportunities-for-economic-progress",
    category: "economy",
    extra: ["business"],
    tags: ["investment"],
    minutesAgo: 95,
    views: 310,
    featured: true,
    breaking: true,
    si: {
      headline: "ශ්‍රී ලංකාවේ ආර්ථික ප්‍රගතියට නව අවස්ථා රැසක්",
      summary: "ආයෝජන, අපනයන සහ සංචාරක යන ක්ෂේත්‍ර තුනෙහිම වර්ධනයක් අපේක්ෂා කරන බව ආදර්ශ වාර්තාවක් පෙන්වා දෙයි.",
      body: [
        "ඉදිරි වසර සඳහා රටේ ආර්ථිකයට නව අවස්ථා කිහිපයක් විවෘත වී ඇති බව ආර්ථික විශ්ලේෂකයින් පිරිසක් සකස් කළ වාර්තාවක දැක්වේ. මෙය ආදර්ශ පුවතක් වන අතර සැබෑ වාර්තාවක් නොවේ.",
        "වාර්තාවට අනුව අපනයන කර්මාන්ත, තොරතුරු තාක්ෂණ සේවා සහ සංචාරක ව්‍යාපාරය ප්‍රධාන වර්ධන ක්ෂේත්‍ර ලෙස හඳුනාගෙන ඇත.",
        "කුඩා හා මධ්‍ය පරිමාණ ව්‍යවසායකයින්ට ණය පහසුකම් පුළුල් කිරීම ද යෝජනා අතර වේ.",
      ],
    },
    en: {
      headline: "New opportunities open for Sri Lanka's economic progress",
      summary: "A demonstration report points to expected growth in investment, exports and tourism.",
      body: [
        "A group of analysts says several new opportunities have opened for the economy in the coming year. This is a demonstration story, not a real report.",
        "The report names export industries, information technology services and tourism as the main areas of growth.",
      ],
    },
  },
  {
    slug: "digital-learning-programme-for-schools",
    category: "education",
    extra: ["technology"],
    minutesAgo: 150,
    views: 180,
    featured: true,
    si: {
      headline: "පාසල් සිසුන් සඳහා නව ඩිජිටල් ඉගෙනුම් වැඩසටහනක්",
      summary: "දිවයින පුරා පාසල් සඳහා ටැබ්ලට් පරිගණක සහ අන්තර්ජාල පහසුකම් ලබා දීමට සැලසුම් කෙරේ.",
      body: [
        "පාසල් සිසුන්ගේ ඩිජිටල් සාක්ෂරතාව ඉහළ නැංවීම අරමුණු කරගත් නව වැඩසටහනක් ආරම්භ කිරීමට සැලසුම් කර ඇත. මෙය ආදර්ශ පුවතකි.",
        "පළමු අදියරේදී ග්‍රාමීය පාසල්වලට මුල් තැන දෙන බව වැඩසටහනේ සැලැස්මේ සඳහන් වේ.",
      ],
    },
  },
  {
    slug: "national-cricket-team-ready-for-new-series",
    category: "cricket",
    tags: ["national-team"],
    minutesAgo: 200,
    views: 420,
    featured: true,
    si: {
      headline: "ජාතික ක්‍රිකට් කණ්ඩායම නව තරගාවලියකට සූදානම්",
      summary: "තරුණ ක්‍රීඩකයින් තිදෙනෙකුට පළමු වරට සංචිතයට කැඳවීම් ලැබේ.",
      body: [
        "ඉදිරි තරගාවලිය සඳහා ජාතික ක්‍රිකට් සංචිතය නම් කර ඇත. මෙය ආදර්ශ පුවතකි.",
        "තේරීම් කමිටුව පවසන්නේ දේශීය තරගවල දක්ෂතා දැක්වූ තරුණ ක්‍රීඩකයින්ට අවස්ථාව දීම මෙවර මූලික අරමුණ බවයි.",
      ],
    },
    en: {
      headline: "National cricket team ready for a new series",
      summary: "Three young players receive their first call-up to the squad.",
      body: [
        "The national squad for the coming series has been named. This is a demonstration story.",
        "Selectors say the aim is to give a chance to young players who performed well in domestic matches.",
      ],
    },
  },
  {
    slug: "parliament-special-session-called",
    category: "parliament",
    minutesAgo: 12,
    views: 150,
    si: {
      headline: "පාර්ලිමේන්තුවේ විශේෂ රැස්වීමක් කැඳවයි",
      summary: "අයවැය යෝජනා පිළිබඳ විවාදය සඳහා විශේෂ සැසිවාරයක් පැවැත්වීමට තීරණය කර ඇත.",
      body: [
        "අයවැය යෝජනා පිළිබඳ විවාදයට වැඩි කාලයක් ලබා දීම සඳහා පාර්ලිමේන්තුවේ විශේෂ රැස්වීමක් කැඳවා ඇත. මෙය ආදර්ශ පුවතකි.",
        "පක්ෂ නායක රැස්වීමේදී මේ සඳහා එකඟතාව පළ වූ බව වාර්තා වේ.",
      ],
    },
  },
  {
    slug: "weather-advisory-for-several-areas",
    category: "sri-lanka",
    extra: ["environment"],
    tags: ["weather"],
    minutesAgo: 28,
    views: 260,
    breaking: true,
    si: {
      headline: "කාලගුණයෙන් ප්‍රදේශ කිහිපයකට අවවාදයක්",
      summary: "ඉදිරි පැය 24 තුළ තද වැසි ඇති විය හැකි බවට ආදර්ශ නිවේදනයක් නිකුත් කර ඇත.",
      body: [
        "බස්නාහිර සහ සබරගමුව පළාත්වල ප්‍රදේශ කිහිපයකට තද වැසි ඇති විය හැකි බව සඳහන් වේ. මෙය ආදර්ශ පුවතක් වන අතර සැබෑ කාලගුණ නිවේදනයක් නොවේ.",
        "පහත් බිම්වල පදිංචි ජනතාව විමසිලිමත් වන ලෙස ඉල්ලා ඇත.",
      ],
    },
  },
  {
    slug: "new-revision-to-flight-services",
    category: "transport",
    minutesAgo: 45,
    views: 90,
    si: {
      headline: "ගුවන් ගමන් සේවාවල නව සංශෝධනයක්",
      summary: "කලාපීය ගමනාන්ත කිහිපයකට අමතර ගුවන් ගමන් එක් කිරීමට යෝජනා වේ.",
      body: [
        "මගී ඉල්ලුම ඉහළ යාමත් සමඟ කලාපීය ගමනාන්ත සඳහා ගුවන් ගමන් වාර ගණන වැඩි කිරීමට යෝජනා වී ඇත. මෙය ආදර්ශ පුවතකි.",
        "නව කාලසටහන ඉදිරි මාසයේ සිට ක්‍රියාත්මක වනු ඇතැයි අපේක්ෂා කෙරේ.",
      ],
    },
  },
  {
    slug: "support-programme-for-agriculture",
    category: "sri-lanka",
    minutesAgo: 62,
    views: 70,
    si: {
      headline: "කෘෂිකර්ම ක්ෂේත්‍රයට නව සහාය වැඩසටහනක්",
      summary: "ගොවීන්ට බීජ සහ තාක්ෂණික උපදෙස් ලබා දීමේ වැඩසටහනක් හඳුන්වා දීමට නියමිතය.",
      body: [
        "කුඩා පරිමාණ ගොවීන් ඉලක්ක කරගත් නව සහාය වැඩසටහනක් හඳුන්වා දීමට නියමිත බව සඳහන් වේ. මෙය ආදර්ශ පුවතකි.",
        "වැඩසටහන යටතේ ගුණාත්මක බීජ, පුහුණු වැඩමුළු සහ වෙළෙඳපොළ සම්බන්ධතා ලබා දෙනු ඇත.",
      ],
    },
  },
  {
    slug: "colombo-port-investment-growth",
    category: "business",
    extra: ["trade"],
    tags: ["investment"],
    minutesAgo: 120,
    views: 130,
    si: {
      headline: "කොළඹ වරායේ නව ආයෝජන වර්ධනයක්",
      summary: "බහාලුම් මෙහෙයුම් ධාරිතාව පුළුල් කිරීමේ ව්‍යාපෘතියක් ගැන ආදර්ශ වාර්තාවක්.",
      body: [
        "වරායේ බහාලුම් මෙහෙයුම් ධාරිතාව පුළුල් කිරීම සඳහා නව ආයෝජන යෝජනා ඉදිරිපත් වී ඇති බව දැක්වේ. මෙය ආදර්ශ පුවතකි.",
        "ව්‍යාපෘතිය මගින් කලාපීය නාවික කේන්ද්‍රස්ථානයක් ලෙස වරායේ තත්ත්වය ශක්තිමත් වනු ඇතැයි අපේක්ෂා කෙරේ.",
      ],
    },
  },
  {
    slug: "ol-results-announcement",
    category: "education",
    tags: ["exams"],
    minutesAgo: 180,
    views: 380,
    si: {
      headline: "අ.පො.ස. (සා/පෙළ) ප්‍රතිඵල සම්බන්ධයෙන් නව නිවේදනයක්",
      summary: "ප්‍රතිඵල නිකුත් කරන දින වකවානු පිළිබඳ ආදර්ශ නිවේදනයක්.",
      body: [
        "සාමාන්‍ය පෙළ විභාගයේ ප්‍රතිඵල නිකුත් කිරීම සම්බන්ධයෙන් නව නිවේදනයක් නිකුත් කර ඇති බව සඳහන් වේ. මෙය ආදර්ශ පුවතකි.",
        "ප්‍රතිඵල අන්තර්ජාලය හරහා පරීක්ෂා කිරීමේ පහසුකම ද සැලසෙනු ඇත.",
      ],
    },
  },
  {
    slug: "railway-service-revisions",
    category: "transport",
    tags: ["railway"],
    minutesAgo: 240,
    views: 110,
    breaking: true,
    si: {
      headline: "දුම්රිය සේවාවල සංශෝධන කිහිපයක්",
      summary: "කාර්යාල වේලාවන්හි අමතර දුම්රිය ගමන් වාර එක් කිරීමට සැලසුම් කෙරේ.",
      body: [
        "ප්‍රධාන මාර්ගයේ සහ මුහුදුබඩ මාර්ගයේ කාර්යාල දුම්රිය සේවා සංශෝධනය කිරීමට සැලසුම් කර ඇත. මෙය ආදර්ශ පුවතකි.",
        "නව කාලසටහන මගීන්ගේ තදබදය අඩු කිරීමට උපකාරී වනු ඇතැයි අපේක්ෂා කෙරේ.",
      ],
    },
  },
  {
    slug: "new-renewable-energy-project-begins",
    category: "environment",
    extra: ["economy"],
    tags: ["renewable-energy"],
    minutesAgo: 300,
    views: 85,
    si: {
      headline: "නව පුනර්ජනනීය බලශක්ති ව්‍යාපෘතියට ආරම්භය",
      summary: "සූර්ය සහ සුළං බලය ඒකාබද්ධ කළ ව්‍යාපෘතියක් ගැන ආදර්ශ වාර්තාවක්.",
      body: [
        "සූර්ය පැනල සහ සුළං ටර්බයින ඒකාබද්ධ කළ නව බලශක්ති ව්‍යාපෘතියක වැඩ ආරම්භ වී ඇති බව දැක්වේ. මෙය ආදර්ශ පුවතකි.",
        "ව්‍යාපෘතිය අවසන් වූ පසු ජාතික විදුලිබල පද්ධතියට පිරිසිදු බලශක්තිය එක් වනු ඇත.",
      ],
    },
    en: {
      headline: "Work begins on a new renewable energy project",
      summary: "A demonstration report on a combined solar and wind project.",
      body: [
        "Work has begun on a new project combining solar panels and wind turbines. This is a demonstration story.",
        "Once complete, the project is expected to add clean energy to the national grid.",
      ],
    },
  },
  {
    slug: "galle-fort-conservation-new-phase",
    category: "lifestyle",
    extra: ["tourism"],
    minutesAgo: 185,
    views: 95,
    si: {
      headline: "ගාලු කොටුවේ සංරක්ෂණ කටයුතු නව අදියරකට",
      summary: "පැරණි ගොඩනැගිලි ප්‍රතිසංස්කරණය කිරීමේ ඊළඟ අදියර ගැන ආදර්ශ වාර්තාවක්.",
      body: [
        "ගාලු කොටුවේ පැරණි ගොඩනැගිලි සංරක්ෂණය කිරීමේ වැඩසටහනේ නව අදියරක් ආරම්භ වී ඇති බව සඳහන් වේ. මෙය ආදර්ශ පුවතකි.",
        "සංචාරකයින්ට බාධාවක් නොවන පරිදි වැඩ කටයුතු අදියරෙන් අදියර සිදු කෙරේ.",
      ],
    },
  },
  {
    slug: "budget-guidelines-for-local-authorities",
    category: "local-government",
    minutesAgo: 330,
    views: 40,
    si: {
      headline: "පළාත් පාලන ආයතන සඳහා නව අයවැය මාර්ගෝපදේශ",
      summary: "ප්‍රාදේශීය සංවර්ධන ව්‍යාපෘති සඳහා අරමුදල් වෙන් කිරීමේ නව ක්‍රමවේදයක් යෝජනා වේ.",
      body: [
        "පළාත් පාලන ආයතනවල අයවැය සකස් කිරීම සඳහා නව මාර්ගෝපදේශ මාලාවක් නිකුත් කර ඇති බව දැක්වේ. මෙය ආදර්ශ පුවතකි.",
        "විනිවිදභාවය සහ මහජන සහභාගීත්වය වැඩි කිරීම මෙහි අරමුණයි.",
      ],
    },
  },
  {
    slug: "voter-register-revision-begins",
    category: "elections",
    minutesAgo: 400,
    views: 55,
    si: {
      headline: "මැතිවරණ නාමලේඛන සංශෝධනය ඇරඹේ",
      summary: "ඡන්ද හිමි නාමලේඛනය යාවත්කාලීන කිරීමේ වාර්ෂික වැඩසටහන ගැන ආදර්ශ වාර්තාවක්.",
      body: [
        "ඡන්ද හිමි නාමලේඛනය සංශෝධනය කිරීමේ වාර්ෂික වැඩසටහන ආරම්භ වී ඇති බව සඳහන් වේ. මෙය ආදර්ශ පුවතකි.",
        "අන්තර්ජාලය හරහා තොරතුරු පරීක්ෂා කිරීමේ පහසුකම ද ලබා දී ඇත.",
      ],
    },
  },
  {
    slug: "schools-rugby-championship-next-week",
    category: "rugby",
    minutesAgo: 360,
    views: 75,
    si: {
      headline: "පාසල් රග්බි ශූරතාවලිය ලබන සතියේ ඇරඹේ",
      summary: "පාසල් කණ්ඩායම් දොළහක් මෙවර ශූරතාවලියට සහභාගී වේ.",
      body: [
        "මෙවර පාසල් රග්බි ශූරතාවලිය ලබන සතියේ ආරම්භ වීමට නියමිතය. මෙය ආදර්ශ පුවතකි.",
        "තරග නගර තුනක ක්‍රීඩාංගණවල පැවැත්වෙනු ඇත.",
      ],
    },
  },
  {
    slug: "national-athletics-squad-named",
    category: "athletics",
    tags: ["national-team"],
    minutesAgo: 480,
    views: 35,
    si: {
      headline: "ජාතික මලල ක්‍රීඩා සංචිතය නම් කෙරේ",
      summary: "කලාපීය තරගාවලිය සඳහා ක්‍රීඩක ක්‍රීඩිකාවන් විසිපස් දෙනෙකු තෝරා ගැනේ.",
      body: [
        "ඉදිරි කලාපීය මලල ක්‍රීඩා තරගාවලිය සඳහා ජාතික සංචිතය නම් කර ඇත. මෙය ආදර්ශ පුවතකි.",
        "පුහුණු කඳවුර ලබන මාසයේ ආරම්භ වීමට නියමිතය.",
      ],
    },
  },
  {
    slug: "two-new-teams-for-football-league",
    category: "football",
    minutesAgo: 540,
    views: 30,
    si: {
      headline: "පාපන්දු ලීගයට නව කණ්ඩායම් දෙකක්",
      summary: "ඉදිරි තරග වාරයේ සිට ලීගය කණ්ඩායම් දොළහකින් සමන්විත වේ.",
      body: [
        "ඉදිරි තරග වාරය සඳහා පාපන්දු ලීගයට නව කණ්ඩායම් දෙකක් එක් කර ගැනීමට තීරණය කර ඇති බව දැක්වේ. මෙය ආදර්ශ පුවතකි.",
        "මෙමගින් පළාත් මට්ටමේ ක්‍රීඩකයින්ට වැඩි අවස්ථා ලැබෙනු ඇත.",
      ],
    },
  },
  {
    slug: "tea-export-income-rises",
    category: "trade",
    extra: ["economy"],
    minutesAgo: 600,
    views: 210,
    si: {
      headline: "තේ අපනයන ආදායමේ වර්ධනයක්",
      summary: "නව වෙළෙඳපොළවල් කිහිපයකින් ඉල්ලුම ඉහළ ගොස් ඇති බව ආදර්ශ වාර්තාවක් කියයි.",
      body: [
        "තේ අපනයන ආදායම පසුගිය කාර්තුවට සාපේක්ෂව ඉහළ ගොස් ඇති බව සඳහන් වේ. මෙය ආදර්ශ පුවතකි.",
        "අගය එකතු කළ තේ නිෂ්පාදන සඳහා ඉල්ලුම වැඩි වීම මෙයට ප්‍රධාන හේතුවක් ලෙස දැක්වේ.",
      ],
    },
  },
];

const videos: { story: string; seconds: number; title: L }[] = [
  {
    story: "galle-fort-conservation-new-phase",
    seconds: 204,
    title: { si: "ගාලු කොටුවේ සංරක්ෂණ කටයුතු නව අදියරකට", en: "Galle Fort conservation enters a new phase" },
  },
  {
    story: "tea-export-income-rises",
    seconds: 130,
    title: { si: "කඳුකර තේ වතුවල නව අස්වනු සමය", en: "A new harvest season in the hill-country tea estates" },
  },
  {
    story: "railway-service-revisions",
    seconds: 96,
    title: { si: "කාර්යාල දුම්රිය සේවාවේ වෙනස්කම්", en: "Changes to office-hour train services" },
  },
];

async function main() {
  // Order matters only for RESTRICT relations; TRUNCATE ... CASCADE clears everything at once.
  await db.$executeRawUnsafe(`TRUNCATE TABLE
    "ArticleRevision","SlugRedirect","ArticleViewDaily","FeaturedArticle","BreakingNews",
    "ArticleTag","ArticleCategory","VideoTranslation","Video","ArticleTranslation","Article",
    "TagTranslation","Tag","NavigationItemTranslation","NavigationItem",
    "HomepageSectionTranslation","HomepageSection","CategoryTranslation","Category",
    "AuthorTranslation","Author","MediaTranslation","Media","SiteSettings" CASCADE`);

  await db.siteSettings.create({
    data: {
      id: 1,
      localized: {
        si: {
          tagline: "රටේ තොරතුරු, ලෝකයේ තොරතුරු. මධ්‍යස්ථව. විශ්වාසයෙන්.",
          notice: "ආදර්ශ අන්තර්ගතය: මෙහි ඇති පුවත් සැබෑ සිදුවීම් නොවේ.",
        },
        en: {
          tagline: "News of the nation, news of the world. Impartial. Trusted.",
          notice: "Demonstration content: the stories here are not real events.",
        },
      },
    },
  });

  const author = await db.author.create({
    data: {
      translations: {
        create: [
          { locale: "si", displayName: "සංස්කාරක මණ්ඩලය" },
          { locale: "en", displayName: "Editorial Desk" },
        ],
      },
    },
  });

  const categoryId = new Map<string, string>();
  const makeCategory = async (c: { slug: string; name: L }, parentId: string | null, sortOrder: number) => {
    const row = await db.category.create({
      data: {
        parentId,
        sortOrder,
        translations: {
          create: [
            { locale: "si", name: c.name.si, slug: c.slug },
            { locale: "en", name: c.name.en, slug: c.slug },
          ],
        },
      },
    });
    categoryId.set(c.slug, row.id);
    return row.id;
  };
  for (const [i, c] of categories.entries()) {
    const id = await makeCategory(c, null, i);
    for (const [j, child] of (c.children ?? []).entries()) await makeCategory(child, id, j);
  }

  for (const [i, n] of navigation.entries()) {
    await db.navigationItem.create({
      data: {
        targetType: "CATEGORY",
        categoryId: categoryId.get(n.category)!,
        sortOrder: i,
        translations: {
          create: [
            { locale: "si", label: n.label.si },
            { locale: "en", label: n.label.en },
          ],
        },
      },
    });
  }

  const tagId = new Map<string, string>();
  for (const t of tags) {
    const row = await db.tag.create({
      data: {
        translations: {
          create: [
            { locale: "si", name: t.name.si, slug: t.slug },
            { locale: "en", name: t.name.en, slug: t.slug },
          ],
        },
      },
    });
    tagId.set(t.slug, row.id);
  }

  const now = Date.now();
  const today = new Date(new Date().toISOString().slice(0, 10));
  const articleId = new Map<string, string>();
  let featuredPosition = 0;

  for (const s of stories) {
    const publishedAt = new Date(now - s.minutesAgo * 60_000);
    const translation = (locale: "si" | "en", t: { headline: string; summary: string; body: string[] }) => ({
      locale,
      headline: t.headline,
      summary: t.summary,
      body: doc(t.body),
      slug: s.slug,
      status: "PUBLISHED" as const,
      publishedAt,
      updatedAt: publishedAt,
    });

    const article = await db.article.create({
      data: {
        primaryCategoryId: categoryId.get(s.category)!,
        authorId: author.id,
        translations: { create: [translation("si", s.si), ...(s.en ? [translation("en", s.en)] : [])] },
        categories: { create: (s.extra ?? []).map((slug) => ({ categoryId: categoryId.get(slug)! })) },
        tags: { create: (s.tags ?? []).map((slug) => ({ tagId: tagId.get(slug)! })) },
      },
    });
    articleId.set(s.slug, article.id);

    const editions = (s.en ? ["si", "en"] : ["si"]) as ("si" | "en")[];
    for (const locale of editions) {
      if (s.views) {
        await db.articleViewDaily.create({
          data: { articleId: article.id, locale, day: today, count: locale === "si" ? s.views : Math.ceil(s.views / 5) },
        });
      }
      if (s.featured) {
        await db.featuredArticle.create({ data: { articleId: article.id, locale, position: featuredPosition } });
      }
      if (s.breaking) await db.breakingNews.create({ data: { articleId: article.id, locale } });
    }
    if (s.featured) featuredPosition++;
  }

  for (const [i, v] of videos.entries()) {
    await db.video.create({
      data: {
        // Placeholder ID: the demo seed does not point at any real video.
        youtubeId: `demo-video-${i + 1}`,
        durationSeconds: v.seconds,
        articleId: articleId.get(v.story)!,
        publishedAt: new Date(now - (i + 3) * 3_600_000),
        translations: {
          create: [
            { locale: "si", title: v.title.si },
            { locale: "en", title: v.title.en },
          ],
        },
      },
    });
  }

  const blocks = ["politics", "sports"];
  for (const [i, slug] of blocks.entries()) {
    await db.homepageSection.create({
      data: { type: "CATEGORY_BLOCK", sortOrder: i, categoryId: categoryId.get(slug)! },
    });
  }

  console.log(
    `Seeded ${stories.length} articles (${stories.filter((s) => s.en).length} with English), ` +
      `${categoryId.size} categories, ${tags.length} tags, ${videos.length} videos.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
