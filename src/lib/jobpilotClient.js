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
    return { error: error.code === "23505" ? "JobPilot is busy with another run. Try again when it finishes." : error.message };
  }
  return { run: data };
}

export async function runState(runId) {
  const { data } = await supabase.from("pipeline_runs").select("status, error").eq("id", runId).maybeSingle();
  return data;
}
