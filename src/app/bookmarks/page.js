"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import Loader from "../../components/Loader";

const SAVED_JOBS_KEY = "jobchain_saved_jobs";

export default function BookmarkedPage() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
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
          .select("id, title, company, location, job_url")
          .eq("user_id", currentUser.id)
          .eq("is_saved", true)
          .order("updated_at", { ascending: false });

        if (!error) {
          setJobs(
            (data || []).map((row) => ({
              id: row.id,
              title: row.title,
              company_name: row.company,
              candidate_required_location: row.location,
              url: row.job_url,
            }))
          );
          setLoading(false);
          return;
        }
      }

      try {
        const raw = localStorage.getItem(SAVED_JOBS_KEY);
        const saved = raw ? JSON.parse(raw) : {};
        setJobs(Object.values(saved || {}));
      } catch (error) {
        console.error("Failed to load bookmarked jobs", error);
        setJobs([]);
      } finally {
        setLoading(false);
      }
    };

    loadBookmarks();
  }, []);

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
    <div className="min-h-full bg-zinc-950 px-6 text-white">
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
          <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-zinc-300">
            No bookmarked jobs yet.
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            {jobs.map((job) => (
              <div
                key={job.url}
                className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-lg"
              >
                <h2 className="text-xl font-semibold">{job.title}</h2>
                <p className="text-zinc-300 mt-1">{job.company_name}</p>
                <p className="text-zinc-500 italic mt-1">{job.candidate_required_location}</p>
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-4 rounded-lg bg-white px-4 py-2 text-black font-semibold hover:bg-purple-600 hover:text-white transition"
                >
                  View Job
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
