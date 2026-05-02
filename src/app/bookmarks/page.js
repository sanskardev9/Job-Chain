"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import Loader from "../../components/Loader";
import JobCard from "../../components/JobCard";

const SAVED_JOBS_KEY = "jobchain_saved_jobs";
const TRACKED_JOBS_KEY = "jobchain_tracked_jobs";
const BOOKMARKS_UPDATED_EVENT = "jobchain:bookmarks-updated";

function buildTrackedPayload(job, status, existing) {
  return {
    job_id: job.id,
    title: job.title,
    company: job.company_name,
    location: job.candidate_required_location,
    apply_url: job.url,
    status,
    applied_at: existing?.applied_at || new Date().toISOString(),
  };
}

async function upsertTrackedJob(userId, job, status) {
  const jobUrl = job?.url || job?.job_url;
  if (!userId || !jobUrl) {
    throw new Error("Missing user id or job url while tracking applied job");
  }

  const { data: existingRows, error: fetchError } = await supabase
    .from("jobs")
    .select("id, applied_at")
    .eq("user_id", userId)
    .eq("job_url", jobUrl)
    .order("created_at", { ascending: false });

  if (fetchError) throw fetchError;

  const existingRow = Array.isArray(existingRows) ? existingRows[0] : null;
  const payload = {
    user_id: userId,
    title: job.title,
    company: job.company_name,
    location: job.candidate_required_location,
    job_url: jobUrl,
    status,
    applied_at: existingRow?.applied_at || new Date().toISOString(),
  };

  if (existingRow?.id) {
    const { error } = await supabase.from("jobs").update(payload).eq("id", existingRow.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("jobs").insert(payload);
  if (error) throw error;
}

export default function BookmarkedPage() {
  const [jobs, setJobs] = useState([]);
  const [trackedJobs, setTrackedJobs] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingJobKey, setSavingJobKey] = useState("");
  const [user, setUser] = useState(null);

  useEffect(() => {
    const loadBookmarks = async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      setUser(currentUser ?? null);

      if (currentUser) {
        const { data, error } = await supabase
          .from("jobs")
          .select("id, title, company, location, job_url, status, applied_at")
          .eq("user_id", currentUser.id)
          .eq("is_saved", true)
          .order("updated_at", { ascending: false });

        if (!error) {
          const trackedMap = {};
          setJobs(
            (data || []).map((row) => ({
              id: row.id,
              title: row.title,
              company_name: row.company,
              candidate_required_location: row.location,
              url: row.job_url,
              publication_date: row.applied_at || new Date().toISOString(),
            }))
          );
          (data || []).forEach((row) => {
            trackedMap[row.job_url] = {
              status: row.status || "applied",
              applied_at: row.applied_at,
            };
          });
          setTrackedJobs(trackedMap);
          setLoading(false);
          return;
        }
      }

      try {
        const raw = localStorage.getItem(SAVED_JOBS_KEY);
        const saved = raw ? JSON.parse(raw) : {};
        setJobs(Object.values(saved || {}));
        const trackedRaw = localStorage.getItem(TRACKED_JOBS_KEY);
        setTrackedJobs(trackedRaw ? JSON.parse(trackedRaw) : {});
      } catch (error) {
        console.error("Failed to load bookmarked jobs", error);
        setJobs([]);
        setTrackedJobs({});
      } finally {
        setLoading(false);
      }
    };

    loadBookmarks();
  }, []);

  useEffect(() => {
    localStorage.setItem(SAVED_JOBS_KEY, JSON.stringify(
      jobs.reduce((acc, job) => {
        acc[job.url] = job;
        return acc;
      }, {})
    ));
  }, [jobs]);

  useEffect(() => {
    localStorage.setItem(TRACKED_JOBS_KEY, JSON.stringify(trackedJobs));
  }, [trackedJobs]);

  const handleToggleSave = useCallback(async (job) => {
    if (!user) return;
    setSavingJobKey(job.url);

    const { error } = await supabase
      .from("jobs")
      .update({ is_saved: false })
      .eq("user_id", user.id)
      .eq("job_url", job.url);

    if (error) {
      console.error("Failed to unsave job", error);
      setSavingJobKey("");
      return;
    }

    setJobs((prev) => prev.filter((item) => item.url !== job.url));
    window.dispatchEvent(
      new CustomEvent(BOOKMARKS_UPDATED_EVENT, {
        detail: { delta: -1 },
      })
    );
    setSavingJobKey("");
  }, [user]);

  const handleApply = useCallback(async (job) => {
    if (!user) return;

    const jobUrl = job?.url || job?.job_url;
    if (!jobUrl) return;

    setSavingJobKey(jobUrl);
    setTrackedJobs((prev) => {
      const existing = prev[jobUrl];
      return {
        ...prev,
        [jobUrl]: buildTrackedPayload({ ...job, url: jobUrl }, "applied", existing),
      };
    });

    try {
      await upsertTrackedJob(user.id, job, "applied");
    } catch (error) {
      console.error("Failed to persist applied job from bookmarks", {
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
      });
    }

    window.open(jobUrl, "_blank", "noopener,noreferrer");
    setSavingJobKey("");
  }, [user]);

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
          <h1 className="text-2xl font-bold">Sign in to sync bookmarks</h1>
          <p className="mt-3 text-zinc-400">Your saved jobs persist across devices when logged in.</p>
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
    <div className="min-h-full bg-zinc-950 px-6 text-white pb-6">
      <div className="flex flex-col items-center justify-center w-content">
        <h1 className="text-3xl font-extrabold mb-3 sm:mb-6 mt-6 sm:mt-6 tracking-tight text-white sm:text-5xl hover:text-purple-500 hover:drop-shadow-[0_0_15px_rgba(168,85,247,0.9)] transition duration-300">
          Bookmarked Jobs
        </h1>
        <p className="text-zinc-400 mb-3 text-sm sm:text-base">
          All jobs you saved with the bookmark icon.
        </p>
      </div>

      <div className="max-w-5xl mx-auto py-4">

        {jobs.length === 0 ? (
          <div className="mt-8 rounded-2xl text-center border border-zinc-800 bg-zinc-900 p-8 text-zinc-300">
            No bookmarked jobs yet.
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            {jobs.map((job) => (
              <JobCard
                key={job.url}
                job={job}
                tracked={trackedJobs[job.url]}
                isSaved
                isSaving={savingJobKey === job.url}
                isLast={false}
                onToggleSave={handleToggleSave}
                onApply={handleApply}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
