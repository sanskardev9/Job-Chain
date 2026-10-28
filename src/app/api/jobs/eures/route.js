import { NextResponse } from "next/server";

// Instant results for a typed search, straight from EURES's public search (the same request its own
// website makes, ~1-3 s). The worker reads the full ads in the background (lookup run) so they can be
// saved and applied to; until then these are shown as preview cards.
const SEARCH_URL = "https://europa.eu/eures/api/jv-searchengine/public/jv-search/search";
const DETAILS_URL = "https://europa.eu/eures/portal/jv-se/jv-details/";
const LIST_DAYS = 30;
const PAGE_SIZE = 50;
const COUNTRIES = {
  AT: "Austria", BE: "Belgium", BG: "Bulgaria", CH: "Switzerland", CY: "Cyprus", CZ: "Czech Republic",
  DE: "Germany", DK: "Denmark", EE: "Estonia", ES: "Spain", FI: "Finland", FR: "France", GR: "Greece",
  EL: "Greece", HR: "Croatia", HU: "Hungary", IE: "Ireland", IS: "Iceland", IT: "Italy", LI: "Liechtenstein",
  LT: "Lithuania", LU: "Luxembourg", LV: "Latvia", MT: "Malta", NL: "Netherlands", NO: "Norway", PL: "Poland",
  PT: "Portugal", RO: "Romania", SE: "Sweden", SI: "Slovenia", SK: "Slovakia",
};

const plain = (html) =>
  String(html || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") || "").trim().slice(0, 120);
  const wanted = (params.get("countries") || "").split(",").map((c) => c.trim()).filter(Boolean);
  const page = Math.min(Math.max(Number(params.get("page")) || 1, 1), 20);
  if (!q) return NextResponse.json({ jobs: [] });

  const body = {
    resultsPerPage: PAGE_SIZE, page, sortSearch: "BEST_MATCH", publicationPeriod: "LAST_MONTH",
    keywords: [{ keyword: q, specificSearchCode: "EVERYWHERE" }],
    occupationUris: [], skillUris: [], requiredExperienceCodes: [], positionScheduleCodes: [], sectorCodes: [],
    educationAndQualificationLevelCodes: [], positionOfferingCodes: [], locationCodes: [], euresFlagCodes: [],
    otherBenefitsCodes: [], requiredLanguages: [], minNumberPost: null,
  };
  try {
    const response = await fetch(SEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json",
        "User-Agent": "JobPilot/0.1 (personal job-search assistant; rule-based, low volume)" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ jobs: [], error: `EURES ${response.status}` });
    const data = await response.json();
    const cutoff = Date.now() - LIST_DAYS * 24 * 60 * 60 * 1000;
    const jobs = (data.jvs || [])
      .filter((jv) => jv.creationDate && jv.creationDate >= cutoff)
      .map((jv) => {
        const code = Object.keys(jv.locationMap || {}).find((c) => COUNTRIES[c.toUpperCase()]);
        return {
          source: "eures",
          source_url: DETAILS_URL + jv.id,
          title: (jv.title || "").trim(),
          company: jv.employer?.name || null,
          country: code ? COUNTRIES[code.toUpperCase()] : null,
          location: null,
          posted_at: new Date(jv.creationDate).toISOString().slice(0, 10),
          deadline: null,
          has_email: null,
          snippet: plain(jv.description).slice(0, 220),
          live: true,
        };
      })
      .filter((job) => job.title && (!wanted.length || !job.country || wanted.includes(job.country)));
    // More pages exist while EURES fills this one (older ads past the month are filtered out above).
    return NextResponse.json({ jobs, page, more: (data.jvs || []).length === PAGE_SIZE });
  } catch (error) {
    return NextResponse.json({ jobs: [], error: error.name === "TimeoutError" ? "EURES took too long" : "EURES unavailable" });
  }
}
