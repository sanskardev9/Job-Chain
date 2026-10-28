// Shared helpers for job cards (Jobs, Bookmarks).

// Job boards' "employer hidden" placeholders: never use them to match or display as a company.
const HIDDEN_EMPLOYER =
  /^(siehe beschreibung|see description|confidential|vertraulich|anonym(ous)?|nicht eingegeben|keine angabe|n\/a|-|unknown)$/i;

export const isHiddenEmployer = (company) => !company || HIDDEN_EMPLOYER.test(company.trim());
export const companyName = (company) => (isHiddenEmployer(company) ? "Employer not named" : company);

// Same job reposted (other source/URL): company + title without gender tags or legal suffixes.
// Null when the employer is hidden, since unrelated jobs then share the same "company".
export const jobKey = (job) => {
  if (isHiddenEmployer(job.company)) return null;
  const clean = (text) =>
    (text || "")
      .toLowerCase()
      .replace(/\([^)]*\)/g, " ")
      .replace(/\b(gmbh|ag|se|kg|b\.?v\.?|ltd|inc|llc|deutschland|germany)\b/g, " ")
      .replace(/[^a-z0-9äöüß]+/g, " ")
      .trim();
  return `${clean(job.company)}|${clean(job.title)}`;
};

// Index of the user's rows in `jobs` (applied / bookmarked) for quick lookups per job card.
export function trackedIndex(rows) {
  const applied = rows.filter((row) => row.applied_at);
  const byId = new Map(applied.filter((r) => r.discovered_job_id).map((r) => [r.discovered_job_id, r]));
  const byUrl = new Map(applied.filter((r) => r.job_url).map((r) => [r.job_url, r]));
  const byKey = new Map(applied.map((r) => [jobKey(r), r]).filter(([key]) => key));
  const saved = new Map(
    rows.filter((r) => r.is_saved && !r.applied_at).map((r) => [r.discovered_job_id || r.job_url, r])
  );
  return {
    appliedFor: (job) =>
      (job.discoveredId && byId.get(job.discoveredId)) ||
      byUrl.get(job.source_url) ||
      (job.apply_url && byUrl.get(job.apply_url)) ||
      (jobKey(job) && byKey.get(jobKey(job))) ||
      null,
    savedFor: (job) => (job.discoveredId && saved.get(job.discoveredId)) || saved.get(job.source_url) || null,
  };
}
