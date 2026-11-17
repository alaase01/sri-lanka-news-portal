/**
 * Content of the "Hire the developer" page and the footer credit.
 *
 * Edit this file to change what the page says. Contact entries left empty are
 * simply not shown. Anything filled in here is published on every page's
 * footer link target, so only add what you are happy to make public.
 */

export const developer = {
  /** The heading of the "Hire the developer" page. */
  name: "Asela",

  /** Text after "Website by" at the bottom of every page. */
  footerCredit: "Asela Alahakoon 0716921030",

  /**
   * Whether the footer credit links to the "Hire the developer" page.
   * The page itself stays online either way (/si/developer, /en/developer).
   * Change to true to link it again.
   */
  footerLinksToPage: false,

  title: {
    si: "මෘදුකාංග ඉංජිනේරු සහ ක්‍රියාවලි ස්වයංක්‍රීයකරණ උපදේශක",
    en: "Software engineer and process automation consultant",
  },

  intro: {
    si: "මෘදුකාංග සංවර්ධනයේ වසර විස්සකට වැඩි අත්දැකීම් ඇති මම, ව්‍යාපාරවලට සහ ප්‍රකාශකයින්ට වේගවත්, ආරක්ෂිත සහ නඩත්තු කිරීමට පහසු වෙබ් පද්ධති ගොඩනඟමි. ඔබ කියවන මෙම වෙබ් අඩවිය එහි එක් උදාහරණයකි.",
    en: "With more than twenty years in software development, I build fast, secure and maintainable web systems for businesses and publishers. The site you are reading is one example.",
  },

  services: {
    si: [
      "ප්‍රවෘත්ති සහ අන්තර්ගත වෙබ් අඩවි, පරිපාලන පද්ධති සමඟ",
      "සිංහල සහ ඉංග්‍රීසි ද්විභාෂා වෙබ් අඩවි",
      "ව්‍යාපාරික වෙබ් යෙදුම් සහ දත්ත පද්ධති",
      "ක්‍රියාවලි ස්වයංක්‍රීයකරණය සහ low-code විසඳුම්",
      "AI සහාය ඇති විශේෂාංග",
    ],
    en: [
      "News and content websites with an admin portal",
      "Bilingual Sinhala and English websites",
      "Business web applications and data systems",
      "Process automation and low-code solutions",
      "AI-assisted features",
    ],
  },

  /** What this site demonstrates. Kept factual: only what is actually built. */
  caseStudy: {
    si: [
      "සිංහල සහ ඉංග්‍රීසි සංස්කරණ දෙකක්, එකම අන්තර්ගත පද්ධතියකින්",
      "ජංගම දුරකථනයට මුල් තැන දෙන, වේගවත් පිටු",
      "එක් උපාංගයකින් එක් ඡන්දයක් පමණක් ඉඩ දෙන මහජන මත විමසුම් පද්ධතියක්",
      "සමාජ මාධ්‍ය බෙදාගැනීම සහ සෙවුම් යන්ත්‍ර සඳහා සැකසුම්",
      "ස්වයංක්‍රීය පරීක්ෂණ සහිත ආරක්ෂිත සර්වර් පැත්තේ තර්කනය",
    ],
    en: [
      "Sinhala and English editions from one content system",
      "Mobile-first, fast-loading pages",
      "A public polling system allowing one vote per device",
      "Social sharing and search-engine optimisation",
      "Secure server-side logic backed by automated tests",
    ],
  },

  technologies: ["Next.js", "React", "TypeScript", "PostgreSQL", "Prisma", "Tailwind CSS"],

  credentials: ["B.Sc. (Hons) Computer Science", "PMP", "ITIL"],

  /**
   * Contact options. Fill in the ones you want shown; leave the rest "".
   * email:    "you@example.com"
   * linkedin: "https://www.linkedin.com/in/your-profile"
   * website:  "https://your-portfolio.example"
   */
  contact: {
    email: "",
    linkedin: "",
    website: "",
  },
} as const;

export function developerContacts() {
  const c = developer.contact;
  const list: { kind: "email" | "linkedin" | "website"; href: string; label: string }[] = [];
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) list.push({ kind: "email", href: `mailto:${c.email}`, label: c.email });
  if (/^https:\/\/([a-z]+\.)?linkedin\.com\//i.test(c.linkedin)) list.push({ kind: "linkedin", href: c.linkedin, label: "LinkedIn" });
  if (/^https:\/\//i.test(c.website)) list.push({ kind: "website", href: c.website, label: c.website.replace(/^https:\/\//, "").replace(/\/$/, "") });
  return list;
}
