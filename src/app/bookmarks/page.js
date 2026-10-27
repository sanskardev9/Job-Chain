"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import Loader from "../../components/Loader";
import { LABEL_STYLES } from "../../components/DraftsPanel";
import { BookmarkToggle, MoreMenu } from "../../components/CardControls";

const BOOKMARKS_UPDATED_EVENT = "jobchain:bookmarks-updated";
const HIDDEN_EMPLOYER = /^(siehe beschreibung|see description|confidential|vertraulich|anonym(ous)?)$/i;

// Shortlist of JobPilot found jobs you saved to apply to later. Applying moves them to Applied.
export default function BookmarksPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    const load = async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      setUser(currentUser ?? null);
      if (!currentUser) {
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("jobs")
        .select(
          "id, title, company, location, job_url, created_at, discovered_job_id, " +
            "discovered_jobs(id, source, source_url, match_label, score, apply_email, required_skills, missing_skills, unknowns)"
        )
        .eq("user_id", currentUser.id)
        .eq("is_saved", true)
        .is("applied_at", null)
        .order("created_at", { ascending: false });
      if (error) console.error("Failed to load bookmarks", error);
      setRows(data || []);
      setLoading(false);
    };
    load();
  }, []);

  const removeRow = (id) => {
    setRows((prev) => prev.filter((row) => row.id !== id));
    window.dispatchEvent(new CustomEvent(BOOKMARKS_UPDATED_EVENT, { detail: { delta: -1 } }));
  };

  const unsave = async (row) => {
    setBusyId(row.id);
    const { error } = await supabase.from("jobs").delete().eq("id", row.id).eq("user_id", user.id);
    if (error) console.error("Failed to remove bookmark", error);
    else removeRow(row.id);
    setBusyId("");
  };

  const markApplied = async (row) => {
    setBusyId(row.id);
    const { error } = await supabase
      .from("jobs")
      .update({ status: "applied", applied_at: new Date().toISOString(), applied_via: "manual", is_saved: false })
      .eq("id", row.id)
      .eq("user_id", user.id);
    if (error) console.error("Failed to mark as applied", error);
    else removeRow(row.id);
    setBusyId("");
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100svh-9rem)] bg-zinc-950 text-white flex items-center justify-center">
        <Loader size="lg" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[calc(100svh-9rem)] bg-zinc-950 text-white px-6 flex items-center justify-center">
        <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
          <h1 className="text-2xl font-bold">Sign in to see your bookmarks!</h1>
          <Link
            href="/login?redirect=/bookmarks"
            className="inline-block mt-6 rounded-xl bg-white px-4 py-2 text-black font-semibold hover:bg-purple-600 hover:text-white transition"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-zinc-950 px-4 sm:px-6 text-white pb-6">
      <div className="flex flex-col items-center justify-center">
        <h1 className="text-3xl font-extrabold mb-3 sm:mb-6 mt-6 tracking-tight text-white sm:text-5xl hover:text-purple-500 hover:drop-shadow-[0_0_15px_rgba(168,85,247,0.9)] transition duration-300">
          Bookmarks
        </h1>
        <p className="text-zinc-400 mb-3 text-sm sm:text-base text-center">
          Jobs you saved in JobPilot to apply to later. Once you apply, they move to Applied.
        </p>
      </div>

      <div className="max-w-5xl mx-auto py-4">
        {rows.length === 0 ? (
          <div className="mt-6 rounded-2xl text-center border border-zinc-800 bg-zinc-900 p-8 text-zinc-300">
            <p className="text-lg font-semibold text-white">No saved jobs</p>
            <p className="mt-2 text-zinc-400">
              Tap the bookmark icon on any job in JobPilot → Found jobs.
            </p>
            <Link
              href="/jobpilot?tab=jobs"
              className="inline-block mt-5 whitespace-nowrap rounded-xl bg-white px-4 py-2 text-black font-semibold hover:bg-purple-600 hover:text-white transition"
            >
              Open found jobs
            </Link>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {rows.map((row) => {
              const job = row.discovered_jobs || {};
              const company = HIDDEN_EMPLOYER.test((row.company || "").trim()) ? "Employer not named" : row.company;
              const busy = busyId === row.id;
              return (
                <div key={row.id} className="relative flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-lg hover:shadow-purple-800/40 transition-shadow duration-300">
                  <BookmarkToggle saved disabled={busy} onToggle={() => unsave(row)} />
                  <div className="flex items-start justify-between gap-3 pr-10">
                    <h2 className="font-semibold break-words">{row.title}</h2>
                    {job.match_label ? (
                      <span className={`shrink-0 text-xs font-semibold capitalize ${LABEL_STYLES[job.match_label] || ""}`}>
                        {job.match_label} · {job.score}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm text-zinc-300">{company}</p>
                  <p className="text-xs text-zinc-500">
                    {[row.location, job.source].filter(Boolean).join(" · ")}
                  </p>
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
                  <p className="mt-2 text-xs text-zinc-500">
                    {job.apply_email ? `Apply by email: ${job.apply_email}` : "No application email listed: apply on the vacancy page"}
                  </p>
                  <div className="mt-auto pt-3 flex items-center gap-2">
                    {row.discovered_job_id ? (
                      <Link
                        href={`/jobpilot?job=${row.discovered_job_id}`}
                        className="whitespace-nowrap rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black hover:bg-purple-600 hover:text-white transition"
                      >
                        Write application
                      </Link>
                    ) : null}
                    <a
                      href={job.source_url || row.job_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="whitespace-nowrap rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-semibold hover:bg-purple-600 transition"
                    >
                      View vacancy
                    </a>
                    <MoreMenu disabled={busy} items={[
                      { label: "Mark as applied", tone: "success", onClick: () => markApplied(row) },
                    ]} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
