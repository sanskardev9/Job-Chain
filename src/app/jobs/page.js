"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import axios from "../../lib/axios";
import JobCard from "../../components/JobCard";
import Loader from "../../components/Loader";
import { supabase } from "../../lib/supabaseClient";

const PAGE_SIZE = 102;
const TRACKED_JOBS_KEY = "jobchain_tracked_jobs";
const SAVED_JOBS_KEY = "jobchain_saved_jobs";
const PENDING_APPLY_KEY = "jobchain_pending_apply";

function dedupeJobs(jobList) {
  const seen = new Set();

  return jobList.filter((job) => {
    const uniqueKey = `${job.id}-${job.url}`;

    if (seen.has(uniqueKey)) {
      return false;
    }

    seen.add(uniqueKey);
    return true;
  });
}

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

export default function JobsPage() {
  const [jobs, setJobs] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [visibleJobs, setVisibleJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [trackedJobs, setTrackedJobs] = useState({});
  const [savedJobs, setSavedJobs] = useState({});
  const [savingJobKey, setSavingJobKey] = useState("");
  const [user, setUser] = useState(null);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [pendingApplyJob, setPendingApplyJob] = useState(null);

  const observer = useRef();
  const router = useRouter();

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user ?? null);
    };

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    try {
      const tracked = localStorage.getItem(TRACKED_JOBS_KEY);
      const saved = localStorage.getItem(SAVED_JOBS_KEY);

      if (tracked) {
        setTrackedJobs(JSON.parse(tracked));
      }

      if (saved) {
        setSavedJobs(JSON.parse(saved));
      }
    } catch (error) {
      console.error("Failed to restore local job state", error);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(TRACKED_JOBS_KEY, JSON.stringify(trackedJobs));
  }, [trackedJobs]);

  useEffect(() => {
    const loadTrackedFromBackend = async () => {
      if (!user) return;

      const { data, error } = await supabase
        .from("jobs")
        .select("title, company, location, job_url, status, applied_at")
        .eq("user_id", user.id)
        .not("applied_at", "is", null);

      if (error) {
        console.error("Failed to load tracked jobs from backend", error);
        return;
      }

      const mapped = (data || []).reduce((acc, row) => {
        if (!row.job_url) return acc;
        acc[row.job_url] = {
          title: row.title,
          company: row.company,
          location: row.location,
          apply_url: row.job_url,
          status: row.status || "applied",
          applied_at: row.applied_at,
        };
        return acc;
      }, {});

      setTrackedJobs(mapped);
    };

    loadTrackedFromBackend();
  }, [user]);

  useEffect(() => {
    localStorage.setItem(SAVED_JOBS_KEY, JSON.stringify(savedJobs));
  }, [savedJobs]);

  useEffect(() => {
    const loadSavedFromBackend = async () => {
      if (!user) return;

      const { data, error } = await supabase
        .from("jobs")
        .select("id, title, company, location, job_url, is_saved")
        .eq("user_id", user.id)
        .eq("is_saved", true);

      if (error) {
        console.error("Failed to load bookmarks from backend", error);
        return;
      }

      const mapped = (data || []).reduce((acc, row) => {
        if (!row.job_url) return acc;
        acc[row.job_url] = {
          db_id: row.id,
          id: row.id,
          title: row.title,
          company_name: row.company,
          candidate_required_location: row.location,
          url: row.job_url,
        };
        return acc;
      }, {});

      setSavedJobs(mapped);
    };

    loadSavedFromBackend();
  }, [user]);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        setLoading(true);
        const response = await axios.get("https://remotive.com/api/remote-jobs");
        const uniqueJobs = dedupeJobs(response.data.jobs);

        setJobs(uniqueJobs);
        setVisibleJobs(uniqueJobs.slice(0, PAGE_SIZE));
      } catch (error) {
        console.error("error fetching jobs", error);
      } finally {
        setLoading(false);
      }
    };

    fetchJobs();
  }, []);

  const loadMore = useCallback(() => {
    setVisibleJobs((currentVisibleJobs) => {
      const next = jobs.slice(
        currentVisibleJobs.length,
        currentVisibleJobs.length + PAGE_SIZE
      );

      return next.length === 0
        ? currentVisibleJobs
        : [...currentVisibleJobs, ...next];
    });
  }, [jobs]);

  const lastJobRef = useCallback(
    (node) => {
      if (loading) return;

      if (observer.current) observer.current.disconnect();

      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      });

      if (node) observer.current.observe(node);
    },
    [loading, loadMore]
  );

  const filteredJobs = useMemo(
    () =>
      visibleJobs.filter(
        (job) =>
          job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          job.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          job.candidate_required_location
            .toLowerCase()
            .includes(searchTerm.toLowerCase())
      ),
    [visibleJobs, searchTerm]
  );

  const handleToggleSave = useCallback(async (job) => {
    if (!user) {
      router.push("/login?redirect=/jobs");
      return;
    }

    const current = savedJobs[job.url];
    setSavingJobKey(job.url);

    if (current?.db_id) {
      const { error } = await supabase
        .from("jobs")
        .update({ is_saved: false })
        .eq("id", current.db_id)
        .eq("user_id", user.id);

      if (error) {
        console.error("Failed to unsave job", error);
        setSavingJobKey("");
        return;
      }

      setSavedJobs((prev) => {
        const next = { ...prev };
        delete next[job.url];
        return next;
      });
      setSavingJobKey("");
      return;
    }

    const { data, error } = await supabase
      .from("jobs")
      .insert({
        user_id: user.id,
        title: job.title,
        company: job.company_name,
        location: job.candidate_required_location,
        job_url: job.url,
        is_saved: true,
      })
      .select("id, title, company, location, job_url")
      .single();

    if (error) {
      console.error("Failed to save job", error);
      setSavingJobKey("");
      return;
    }

    setSavedJobs((prev) => ({
      ...prev,
      [job.url]: {
        db_id: data.id,
        id: data.id,
        title: data.title,
        company_name: data.company,
        candidate_required_location: data.location,
        url: data.job_url,
      },
    }));
    setSavingJobKey("");
  }, [router, savedJobs, user]);

  const handleApply = useCallback((job) => {
    if (!user) {
      setPendingApplyJob({
        id: job.id,
        title: job.title,
        company_name: job.company_name,
        candidate_required_location: job.candidate_required_location,
        url: job.url,
      });
      setShowLoginPrompt(true);
      return;
    }

    setSavingJobKey(job.url);

    setTrackedJobs((prev) => {
      const existing = prev[job.url];
      return {
        ...prev,
        [job.url]: buildTrackedPayload(job, "applied", existing),
      };
    });

    window.open(job.url, "_blank", "noopener,noreferrer");
    setSavingJobKey("");
  }, [user]);

  const handleStatusChange = useCallback((job, status) => {
    setSavingJobKey(job.url);

    setTrackedJobs((prev) => {
      const existing = prev[job.url];
      if (existing?.status === status) {
        return {
          ...prev,
          [job.url]: buildTrackedPayload(job, "applied", existing),
        };
      }
      return {
        ...prev,
        [job.url]: buildTrackedPayload(job, status, existing),
      };
    });

    setSavingJobKey("");
  }, []);

  useEffect(() => {
    if (!user) return;

    const raw = localStorage.getItem(PENDING_APPLY_KEY);
    if (!raw) return;

    try {
      const job = JSON.parse(raw);
      if (!job?.url) {
        localStorage.removeItem(PENDING_APPLY_KEY);
        return;
      }

      setTrackedJobs((prev) => {
        const existing = prev[job.url];
        return {
          ...prev,
          [job.url]: buildTrackedPayload(job, "applied", existing),
        };
      });

      window.open(job.url, "_blank", "noopener,noreferrer");
      localStorage.removeItem(PENDING_APPLY_KEY);
    } catch (error) {
      console.error("Failed to handle pending apply job", error);
      localStorage.removeItem(PENDING_APPLY_KEY);
    }
  }, [user]);

  if (loading && visibleJobs.length === 0) {
    return (
      <div className="min-h-[calc(100svh-9rem)] bg-zinc-950 text-white flex items-center justify-center">
        <Loader size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-zinc-950 px-6 text-white">
      <div className="flex flex-col items-center justify-center w-content">
        <h1 className="text-3xl font-extrabold mb-3 sm:mb-6 mt-6 sm:mt-6 tracking-tight text-white sm:text-5xl hover:text-purple-500 hover:drop-shadow-[0_0_15px_rgba(168,85,247,0.9)] transition duration-300">
          Job Listing
        </h1>
        <p className="text-zinc-400 mb-3 text-sm sm:text-base">
          Track applications manually: Apply, update status, and bookmark saved jobs.
        </p>
      </div>

      <div className="sticky top-0 z-40 bg-zinc-950/80 backdrop-blur-lg py-6">
        <div className="max-w-xl mx-auto mb-0 sm:mb-2 ">
          <input
            type="text"
            placeholder="Search for title, company, location"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-4 text-sm sm:text-lg bg-zinc-900 border border-zinc-700 rounded-xl placeholder-zinc-500 text-white focus:outline-none focus:ring-2 focus:ring-purple-600 focus:drop-shadow-[0_0_15px_rgba(168,85,247,0.9)] duration-200"
          />
        </div>
      </div>

      <div>
        <div className="grid grid-cols-1 sm:cols-2 lg:grid-cols-3 gap-8 mt-6">
          {filteredJobs.map((job, index) => {
            const isLastJob = index === filteredJobs.length - 1;
            const tracked = trackedJobs[job.url];
            const isSaved = !!savedJobs[job.url];
            const isSaving = savingJobKey === job.url;

            return (
              <JobCard
                key={`${job.id}-${job.url}`}
                job={job}
                tracked={tracked}
                isSaved={isSaved}
                isSaving={isSaving}
                isLast={isLastJob}
                lastJobRef={lastJobRef}
                onToggleSave={handleToggleSave}
                onApply={handleApply}
                onStatusChange={handleStatusChange}
              />
            );
          })}
        </div>
        <div className="dummy-div"></div>
      </div>

      {showLoginPrompt ? (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
            <h2 className="text-xl font-bold text-white">Sign in required</h2>
            <p className="mt-2 text-zinc-400 text-sm">
              You need to sign in before applying to a job.
            </p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowLoginPrompt(false)}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:border-zinc-500 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (pendingApplyJob) {
                    localStorage.setItem(PENDING_APPLY_KEY, JSON.stringify(pendingApplyJob));
                  }
                  router.push("/login?redirect=/jobs");
                }}
                className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-purple-600 hover:text-white transition cursor-pointer"
              >
                Sign in
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
