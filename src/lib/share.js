// Shareable JobChain links for one job: /jobs?job=<source url>. Friends who are signed in see the
// full job; visitors see the safe preview with a sign-up prompt that brings them back to it.
export const SHARE_PARAM = "job";

export function jobShareUrl(job) {
  return `${window.location.origin}/jobs?${SHARE_PARAM}=${encodeURIComponent(job.source_url)}`;
}

// Native share sheet on phones, otherwise copy the link. Returns "shared", "copied" or "failed".
export async function shareJob(job) {
  const url = jobShareUrl(job);
  const where = [job.location, job.country].filter(Boolean).join(", ");
  const text = `${job.title}${where ? ` in ${where}` : ""}. Found on JobChain:`;
  if (navigator.share) {
    try {
      await navigator.share({ title: job.title, text, url });
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
