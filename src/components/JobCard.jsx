"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";
import { EMAIL_RE, requestDraft, runState, wakeWorker } from "../lib/jobpilotClient";
import { companyName, isHiddenEmployer } from "../lib/jobs";
import { jobDates } from "../lib/dates";
import { ExternalLink, Zap } from "lucide-react";
import { BookmarkToggle, MoreMenu } from "./CardControls";
import { LABEL_STYLES } from "./DraftsPanel";

const WRITING = ["starting", "queued", "running"];

/*
 * One job: from the user's matches (has discoveredId) or from search (pool job, added to the
 * user's jobs on first action via adopt_pool_job). The recruiter's email is never shown here;
 * it only appears in the draft after "Write application".
 *
 * job: { discoveredId?, source_url, apply_url?, source, title, company, country, location, posted_at,
 *        deadline, has_email, snippet?, match_label?, score?, blockers?, unknowns?, required_skills?,
 *        missing_skills?, nice_to_have_skills?, matched_skills? }
 * onChange({ type: "saved" | "unsaved" | "applied" | "dismissed", row?, discoveredId })
 */
export default function JobCard({ job, userId, saved, applied, onChange }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [email, setEmail] = useState(null); // null = box closed
  const [write, setWrite] = useState(null); // { runId, status, error }

  useEffect(() => {
    if (!write?.runId || !WRITING.includes(write.status)) return undefined;
    const poll = setInterval(async () => {
      const state = await runState(write.runId);
      if (state && state.status !== write.status) setWrite((w) => ({ ...w, status: state.status, error: state.error }));
    }, 3000);
    const wake = setInterval(wakeWorker, write.status === "queued" ? 20000 : 240000);
    return () => {
      clearInterval(poll);
      clearInterval(wake);
    };
  }, [write]);

  // The user's own copy of this job (needed to bookmark, apply or draft).
  const ensureId = async () => {
    if (job.discoveredId) return job.discoveredId;
    const { data, error: adoptError } = await supabase.rpc("adopt_pool_job", { p_source_url: job.source_url });
    if (adoptError) throw adoptError;
    return data;
  };

  const run = async (name, action) => {
    setBusy(name);
    setError("");
    try {
      await action();
    } catch (err) {
      console.error(`Job action ${name} failed`, err);
      setError(err.message || "Something went wrong.");
    }
    setBusy("");
  };

  const toggleSaved = () =>
    run("save", async () => {
      if (saved) {
        const { error: deleteError } = await supabase.from("jobs").delete().eq("id", saved.id).is("applied_at", null);
        if (deleteError) throw deleteError;
        onChange?.({ type: "unsaved", row: saved });
        window.dispatchEvent(new CustomEvent("jobchain:bookmarks-updated", { detail: { delta: -1 } }));
        return;
      }
      const discoveredId = await ensureId();
      const { data, error: insertError } = await supabase
        .from("jobs")
        .insert({
          user_id: userId,
          title: job.title,
          company: job.company,
          location: [job.location, job.country].filter(Boolean).join(", ") || null,
          job_url: job.apply_url || job.source_url,
          is_saved: true,
          discovered_job_id: discoveredId,
        })
        .select("id, discovered_job_id, job_url, title, company, applied_at, applied_via, is_saved")
        .single();
      if (insertError) throw insertError;
      onChange?.({ type: "saved", row: data, discoveredId });
      window.dispatchEvent(new CustomEvent("jobchain:bookmarks-updated", { detail: { delta: 1 } }));
    });

  const markApplied = () =>
    run("apply", async () => {
      const discoveredId = await ensureId();
      const fields = { status: "applied", applied_at: new Date().toISOString(), applied_via: "manual", is_saved: false };
      const query = saved
        ? supabase.from("jobs").update(fields).eq("id", saved.id)
        : supabase.from("jobs").insert({
            user_id: userId,
            title: job.title,
            company: job.company,
            location: [job.location, job.country].filter(Boolean).join(", ") || null,
            job_url: job.apply_url || job.source_url,
            discovered_job_id: discoveredId,
            ...fields,
          });
      const { data, error: saveError } = await query
        .select("id, discovered_job_id, job_url, title, company, applied_at, applied_via, is_saved")
        .single();
      if (saveError) throw saveError;
      onChange?.({ type: "applied", row: data, discoveredId });
    });

  const dismiss = () =>
    run("dismiss", async () => {
      const discoveredId = await ensureId();
      const { error: dismissError } = await supabase.from("discovered_jobs").update({ dismissed: true }).eq("id", discoveredId);
      if (dismissError) throw dismissError;
      onChange?.({ type: "dismissed", discoveredId, sourceUrl: job.source_url });
    });

  const writeApplication = () =>
    run("write", async () => {
      const typed = (email || "").trim();
      if (!job.has_email && !EMAIL_RE.test(typed)) {
        setEmail(email ?? "");
        return;
      }
      setWrite({ status: "starting" });
      const discoveredId = await ensureId();
      const { run: started, error: runError } = await requestDraft(userId, discoveredId, job.has_email ? null : typed);
      setWrite(runError ? { status: "failed", error: runError } : { runId: started.id, status: started.status });
    });

  const writing = WRITING.includes(write?.status);
  const hidden = isHiddenEmployer(job.company);
  const dates = jobDates(job.posted_at, job.deadline);

  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-5 shadow-lg hover:shadow-purple-800/40 transition-shadow duration-300 ${
        applied
          ? "border-emerald-500/30 bg-zinc-900/60"
          : job.has_email
            ? "border-purple-500/30 bg-zinc-900"
            : "border-zinc-800 bg-zinc-900"
      }`}
    >
      {!applied ? <BookmarkToggle saved={Boolean(saved)} disabled={busy === "save"} onToggle={toggleSaved} /> : null}

      <div className="flex items-start justify-between gap-3 pr-10">
        <h3 className="font-semibold break-words">{job.title}</h3>
        {job.match_label ? (
          <span className={`shrink-0 text-xs font-semibold capitalize ${LABEL_STYLES[job.match_label] || ""}`}>
            {job.match_label}
            {job.score != null ? ` · ${job.score}` : ""}
          </span>
        ) : null}
      </div>
      {applied ? (
        <p className="mt-1 inline-flex w-fit items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
          ✓ Applied {new Date(applied.applied_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          {applied.applied_via === "email" ? " via JobPilot" : ""}
        </p>
      ) : null}
      <p className={`text-sm ${hidden ? "italic text-zinc-500" : "text-zinc-300"}`}>{companyName(job.company)}</p>
      <p className="text-xs text-zinc-500">
        {[[job.location, job.country].filter(Boolean).join(", "), job.source].filter(Boolean).join(" · ")}
      </p>
      {dates ? <p className="text-xs text-zinc-400">{dates}</p> : null}

      {(job.blockers || []).length ? <p className="mt-2 text-xs text-red-300">✕ {job.blockers.join(" · ")}</p> : null}
      {(job.unknowns || []).length ? <p className="mt-1 text-xs text-yellow-300/90">? {job.unknowns.join(" · ")}</p> : null}
      {(job.required_skills || []).length ? (
        <p className="mt-2 text-xs text-zinc-400">
          <span className="text-zinc-500">Required: </span>
          {job.required_skills.map((skill, i) => (
            <span key={skill}>
              {i ? ", " : ""}
              <span className={(job.missing_skills || []).includes(skill) ? "text-red-300/90" : "text-emerald-300/90"}>
                {skill}
              </span>
            </span>
          ))}
        </p>
      ) : null}
      {(job.nice_to_have_skills || []).length ? (
        <p className="mt-1 text-xs text-zinc-400">
          <span className="text-zinc-500">Nice to have: </span>
          {job.nice_to_have_skills.join(", ")}
        </p>
      ) : null}
      {!job.required_skills?.length && job.snippet ? (
        <p className="mt-2 line-clamp-3 text-xs text-zinc-400">{job.snippet}</p>
      ) : null}
      {applied ? null : job.has_email ? (
        <p className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full border border-purple-500/50 bg-purple-500/15 px-2.5 py-1 text-xs font-semibold text-purple-200">
          <Zap size={13} className="fill-current" /> Quick apply: JobPilot writes and sends it for you
        </p>
      ) : (
        <p className="mt-2 text-xs text-zinc-500">Applications go through the employer&apos;s site</p>
      )}

      {!applied && !job.has_email && email !== null && !write?.runId ? (
        <div className="mt-3 rounded-xl border border-zinc-700 bg-zinc-950 p-3">
          <label className="block text-xs text-zinc-400" htmlFor={`email-${job.source_url}`}>
            No email in the posting. Paste the application email from the vacancy page:
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id={`email-${job.source_url}`}
              type="email"
              placeholder="jobs@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-600"
            />
            <button
              type="button"
              onClick={writeApplication}
              disabled={!EMAIL_RE.test((email || "").trim()) || busy === "write"}
              className="whitespace-nowrap rounded-lg bg-purple-600 px-3 py-2 text-sm font-semibold text-white hover:bg-purple-500 transition disabled:opacity-50"
            >
              Write it
            </button>
          </div>
        </div>
      ) : null}

      {write ? (
        <p
          className={`mt-3 text-sm ${
            write.status === "finished"
              ? "text-emerald-300"
              : ["failed", "cancelled"].includes(write.status)
                ? "text-red-300"
                : "text-blue-300"
          }`}
        >
          {write.status === "finished" ? (
            <>
              Draft ready.{" "}
              <Link href="/jobpilot?tab=drafts" className="font-semibold underline">
                Review &amp; send →
              </Link>
            </>
          ) : ["failed", "cancelled"].includes(write.status) ? (
            write.error || "Could not write the application."
          ) : write.status === "queued" ? (
            "Queued. Waking up JobPilot, this can take about a minute…"
          ) : (
            "Writing your application…"
          )}
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

      <div className="mt-auto pt-3 flex items-center gap-2">
        {applied ? null : job.has_email ? (
          <button
            type="button"
            onClick={writeApplication}
            disabled={Boolean(busy) || writing}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-purple-500 transition disabled:opacity-50"
          >
            <Zap size={14} className="fill-current" />
            {writing ? "Writing…" : "Quick apply"}
          </button>
        ) : (
          <a
            href={job.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black hover:bg-purple-600 hover:text-white transition"
          >
            Apply on site <ExternalLink size={14} />
          </a>
        )}
        {applied || job.has_email ? (
          <a
            href={job.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="whitespace-nowrap rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-semibold hover:bg-purple-600 transition"
          >
            View vacancy
          </a>
        ) : null}
        <MoreMenu
          disabled={Boolean(busy)}
          items={[
            ...(!applied && !job.has_email
              ? [{ label: "Found an email? Write application", onClick: writeApplication }]
              : []),
            ...(!applied ? [{ label: "Mark as applied", tone: "success", onClick: markApplied }] : []),
            { label: "Not interested", tone: "danger", onClick: dismiss },
          ]}
        />
      </div>
    </div>
  );
}
