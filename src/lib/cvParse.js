// Reads a CV PDF in the browser and suggests profile fields with plain rules (no AI).
// Every suggestion is shown to the user to confirm before it is used.
import { SKILLS } from "./skills";

// ---- PDF text ---------------------------------------------------------------------------

export async function pdfText(source) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const data = source instanceof Blob ? new Uint8Array(await source.arrayBuffer()) : source;
  const pdf = await pdfjs.getDocument(typeof data === "string" ? data : { data }).promise;
  const lines = [];
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    // Group text pieces into lines by their vertical position.
    const rows = new Map();
    for (const item of content.items) {
      if (!item.str?.trim()) continue;
      const y = Math.round(item.transform[5]);
      const key = [...rows.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
      rows.set(key, [...(rows.get(key) || []), { x: item.transform[4], s: item.str }]);
    }
    [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([, parts]) => lines.push(parts.sort((a, b) => a.x - b.x).map((p) => p.s).join(" ").replace(/\s+/g, " ").trim()));
  }
  await pdf.destroy();
  return lines.filter(Boolean).join("\n");
}

// ---- Rules ------------------------------------------------------------------------------

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SKILL_PATTERNS = Object.entries(SKILLS).map(([name, aliases]) => [
  name,
  new RegExp(
    `(?<![\\w#+])(?:${[...new Set([name.toLowerCase(), ...aliases])].sort((a, b) => b.length - a.length).map(escape).join("|")})(?![\\w#+])`,
    "i"
  ),
]);
// Words like "Go" or "Lit" are too common in normal sentences to count from free text.
const AMBIGUOUS = new Set(["Go", "Web Components", "Rust", "Swift", "Spring", "Responsive Web Design"]);

const LANGUAGES = {
  English: /\benglish\b/i,
  German: /\b(german|deutsch)\b/i,
  Hindi: /\bhindi\b/i,
  French: /\b(french|français)\b/i,
  Spanish: /\b(spanish|español)\b/i,
  Dutch: /\b(dutch|nederlands)\b/i,
  Italian: /\bitalian\b/i,
  Portuguese: /\bportuguese\b/i,
  Swedish: /\bswedish\b/i,
  Finnish: /\bfinnish\b/i,
  Danish: /\bdanish\b/i,
  Polish: /\bpolish\b/i,
  Arabic: /\barabic\b/i,
  Urdu: /\burdu\b/i,
  Bengali: /\bbengali\b/i,
  Tamil: /\btamil\b/i,
  Telugu: /\btelugu\b/i,
  Marathi: /\bmarathi\b/i,
  Punjabi: /\bpunjabi\b/i,
};
const LEVEL_WORDS = [
  [/\b(native|mother tongue|bilingual)\b/i, "Native"],
  [/\b(fluent|proficient|professional working|full professional|advanced)\b/i, "C1"],
  [/\b(upper[- ]intermediate)\b/i, "B2"],
  [/\b(intermediate|conversational|working)\b/i, "B1"],
  [/\b(elementary|basic|beginner)\b/i, "A2"],
];

const COUNTRIES = ["India", "Germany", "Netherlands", "Belgium", "Austria", "Switzerland", "Finland", "Sweden",
  "Denmark", "Norway", "France", "Spain", "Italy", "Poland", "Portugal", "Ireland", "United Kingdom", "UK",
  "United States", "USA", "Canada", "Australia", "Pakistan", "Bangladesh", "Nepal", "Sri Lanka", "Nigeria",
  "Egypt", "Turkey", "Romania", "Czech Republic", "Hungary", "Greece", "Luxembourg", "Estonia"];

const HEADING = /^(work\s+)?(experience|employment|professional experience|work history|career|internships?|projects?|education|academics?|qualifications|skills|technical skills|languages|certifications?|achievements|summary|profile|about me|contact)\b[:\s]*$/i;
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
const DATE = String.raw`(?:(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+|(\d{1,2})[/.-])?((?:19|20)\d{2})`;
const RANGE = new RegExp(`${DATE}\\s*(?:-|–|—|to|until|bis)\\s*(?:${DATE}|(present|current|now|today|ongoing|heute))`, "gi");

function toMonth(mon, num, year) {
  const month = mon ? MONTHS[mon.toLowerCase().slice(0, mon.toLowerCase().startsWith("sept") ? 4 : 3)] ?? 0 : num ? Number(num) - 1 : 0;
  return Number(year) * 12 + Math.min(Math.max(month, 0), 11);
}

// Splits the CV into sections by headings ("Experience", "Education", ...).
function sections(lines) {
  const out = [];
  let current = { name: "top", lines: [] };
  for (const line of lines) {
    if (line.length < 40 && HEADING.test(line)) {
      out.push(current);
      current = { name: line.toLowerCase(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  out.push(current);
  return out;
}

function experienceMonths(text) {
  const now = new Date();
  const nowMonth = now.getFullYear() * 12 + now.getMonth();
  const spans = [];
  for (const m of text.matchAll(RANGE)) {
    const start = toMonth(m[1], m[2], m[3]);
    const end = m[7] ? nowMonth : toMonth(m[4], m[5], m[6]);
    if (end >= start && end - start < 12 * 40) spans.push([start, end + (m[7] ? 0 : 1)]);
  }
  // Merge overlapping jobs so parallel roles are not counted twice.
  spans.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [cs, ce] = spans[0] || [0, 0];
  for (const [s, e] of spans.slice(1)) {
    if (s <= ce) ce = Math.max(ce, e);
    else {
      total += ce - cs;
      [cs, ce] = [s, e];
    }
  }
  if (spans.length) total += ce - cs;
  return total;
}

export function parseCv(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const parts = sections(lines);
  const found = {};

  // Name: first short line that looks like a name.
  const name = lines.slice(0, 6).find(
    (l) => /^[\p{L}][\p{L}'.-]*(\s+[\p{L}][\p{L}'.-]*){1,3}$/u.test(l) && !HEADING.test(l) && l.length <= 40
  );
  if (name) found.preferred_name = name.replace(/\b(\p{L})(\p{L}*)/gu, (_, a, b) => a.toUpperCase() + b.toLowerCase());

  const github = text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_.-]+/i);
  if (github) found.github_url = github[0].startsWith("http") ? github[0] : `https://${github[0]}`;
  const linkedin = text.match(/(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9_%-]+/i);
  if (linkedin) found.linkedin_url = linkedin[0].startsWith("http") ? linkedin[0] : `https://www.${linkedin[0].replace(/^www\./, "")}`;

  // Current base: a country named near the top (contact line).
  const top = lines.slice(0, 12).join(" ");
  const country = COUNTRIES.find((c) => new RegExp(`\\b${escape(c)}\\b`, "i").test(top));
  if (country) found.current_base = { UK: "United Kingdom", USA: "United States" }[country] || country;

  // Skills: in the profile's own words (canonical names), most mentioned first.
  // Links and emails are not skills (github.com/… must not count as “GitHub”).
  const skillText = text.replace(/(?:https?:\/\/)?(?:www\.)?[\w.-]+\.(?:com|io|dev|org|net|me|in|app)(?:\/[^\s|,]*)?/gi, " ").replace(/\S+@\S+/g, " ");
  const skills = SKILL_PATTERNS.filter(([skill, re]) => {
    if (!re.test(skillText)) return false;
    if (!AMBIGUOUS.has(skill)) return true;
    // Ambiguous words only count inside a skills section.
    return parts.some((p) => /skill|technolog|tools/.test(p.name) && re.test(p.lines.join(" ")));
  })
    .map(([skill, re]) => [skill, (skillText.match(new RegExp(re.source, "gi")) || []).length])
    .sort((a, b) => b[1] - a[1])
    .map(([skill]) => skill);
  if (skills.length) found.skills = skills;

  // Experience: date ranges inside work/experience/internship sections only.
  const work = parts.filter((p) => /experience|employment|work|career|internship/.test(p.name));
  const months = work.length ? experienceMonths(work.map((p) => p.lines.join("\n")).join("\n")) : 0;
  const stated = text.match(/(\d{1,2}(?:\.\d)?)\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:professional\s+)?experience/i);
  if (months > 0) found.experience = { years: Math.floor(months / 12), months: months % 12, how: "from the dates in your experience" };
  else if (stated) {
    const total = Math.round(Number(stated[1]) * 12);
    found.experience = { years: Math.floor(total / 12), months: total % 12, how: `from “${stated[0]}”` };
  }

  // Education: the degree line(s).
  const eduLines = (parts.find((p) => /education|academic|qualification/.test(p.name))?.lines || lines).filter((l) =>
    /\b(bachelor|master|b\.?\s?tech|m\.?\s?tech|b\.?\s?e\b|bca|mca|b\.?\s?sc|m\.?\s?sc|bsc|msc|mba|phd|diploma|degree)\b/i.test(l)
  );
  if (eduLines.length) found.education = eduLines[0].slice(0, 140);

  // Languages: in a languages section, or "English (C1)" style mentions anywhere.
  const langText = parts.find((p) => /language/.test(p.name))?.lines.join("\n") || text;
  const langs = [];
  for (const [language, re] of Object.entries(LANGUAGES)) {
    const line = langText.split("\n").find((l) => re.test(l));
    if (!line) continue;
    // Programming-language mentions ("English" rarely, but be careful) only count in a language section.
    if (langText === text && !/\b([ABC][12]|native|fluent|basic|intermediate|proficient|mother tongue)\b/i.test(line)) continue;
    // Look only right after the language name, so "English (C1), German (A1)" gets each level right.
    const at = line.search(re);
    const after = line.slice(at).replace(re, "").slice(0, 28).split(/[,;|•]/)[0];
    const level = after.match(/\b([ABC][12])\b/i)?.[1] || LEVEL_WORDS.find(([w]) => w.test(after))?.[1] || "";
    langs.push({ language, level: level.toUpperCase() === "NATIVE" ? "Native" : level.toUpperCase() });
  }
  if (langs.length) found.languages = langs;

  return found;
}
