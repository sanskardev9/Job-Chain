import { supabase } from "./supabaseClient";

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/;

// Hosted worker (e.g. Render free web service) sleeps when idle. The app's own API pings it,
// so browser shields cannot block the wake-up.
export function wakeWorker() {
  if (!process.env.NEXT_PUBLIC_JOBPILOT_WORKER_URL) return;
  fetch("/api/jobpilot/wake", { method: "POST", cache: "no-store" }).catch(() => {});
}

// Queues a "draft" run for one found job. Returns { run } or { error }.
export async function requestDraft(userId, discoveredJobId, recipient) {
  wakeWorker();
  const { data, error } = await supabase
    .from("pipeline_runs")
    .insert({
      user_id: userId,
      kind: "draft",
      discovered_job_id: discoveredJobId,
      ...(recipient ? { recipient } : {}),
    })
    .select("id, status")
    .single();
  if (error) {
    return { error: error.code === "23505" ? "This application is already being written." : error.message };
  }
  window.dispatchEvent(new CustomEvent("jobchain:run-started"));
  return { run: data };
}

// When the user's job titles were last searched at the job sources, and from when a search can
// go to the sources again (nextAt null = now). Searches in between use the jobs already found.
export async function getSearchFreshness() {
  const { data } = await supabase.rpc("search_freshness");
  const row = data?.[0];
  if (!row?.titles) return null;
  return {
    lastAt: row.last_searched_at ? new Date(row.last_searched_at) : null,
    nextAt: row.next_fresh_at && new Date(row.next_fresh_at) > new Date() ? new Date(row.next_fresh_at) : null,
  };
}

const clock = (date) => date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const minutesAgo = (date) => Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));

// One plain sentence about freshness, for the places that explain an empty search.
export function freshnessText(freshness) {
  if (!freshness) return "";
  if (freshness.nextAt) {
    return `Your job titles were searched at the job sources ${minutesAgo(freshness.lastAt)} min ago. The next search there is possible from ${clock(freshness.nextAt)}; until then JobPilot checks the jobs already found.`;
  }
  return freshness.lastAt
    ? `Job sources last searched for your titles at ${clock(freshness.lastAt)}. Finding jobs now searches them again if nothing new is waiting.`
    : "Finding jobs now searches the job sources for your titles.";
}

export async function runState(runId) {
  const { data } = await supabase.from("pipeline_runs").select("status, error, counts, started_at").eq("id", runId).maybeSingle();
  return data;
}
