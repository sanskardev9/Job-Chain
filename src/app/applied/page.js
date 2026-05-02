"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import Loader from "../../components/Loader";

export default function AppliedPage() {
  const STATUS_OPTIONS = ["interview", "offer", "rejected"];
  const FILTER_OPTIONS = ["all", "applied", "interview", "offer", "rejected"];
  const STATUS_STYLES = {
    applied: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
    interview: "bg-blue-500/20 text-blue-300 border-blue-500/40",
    offer: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    rejected: "bg-red-500/20 text-red-300 border-red-500/40",
  };
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState([]);
  const [updatingId, setUpdatingId] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef(null);

  useEffect(() => {
    const loadUserAndJobs = async () => {
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
        .select("id, title, company, location, job_url, status, applied_at, created_at")
        .eq("user_id", currentUser.id)
        .not("applied_at", "is", null)
        .order("applied_at", { ascending: false });

      if (error) {
        console.error("Failed to load applied jobs", error);
        setLoading(false);
        return;
      }

      setJobs(data || []);
      setLoading(false);
    };

    loadUserAndJobs();
  }, []);

  useEffect(() => {
    const onClickOutside = (event) => {
      if (!filterRef.current) return;
      if (!filterRef.current.contains(event.target)) {
        setFilterOpen(false);
      }
    };

    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const handleStatusChange = async (jobId, status) => {
    setUpdatingId(jobId);
    const current = jobs.find((job) => job.id === jobId);
    const nextStatus = current?.status === status ? "applied" : status;

    const { error } = await supabase
      .from("jobs")
      .update({ status: nextStatus })
      .eq("id", jobId)
      .eq("user_id", user.id);

    if (error) {
      console.error("Failed to update status", error);
      setUpdatingId("");
      return;
    }

    setJobs((prev) =>
      prev.map((job) => (job.id === jobId ? { ...job, status: nextStatus } : job))
    );
    setUpdatingId("");
  };

  const filteredJobs =
    activeFilter === "all"
      ? jobs
      : jobs.filter((job) => (job.status || "applied") === activeFilter);

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
          <h1 className="text-2xl font-bold">Sign in to see applied jobs</h1>
          <p className="mt-3 text-zinc-400">Your applied list is stored in your account.</p>
          <Link
            href="/login?redirect=/applied"
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
          Applied Jobs
        </h1>
        <p className="text-zinc-400 mb-3 text-sm sm:text-base">
          Track all jobs you applied to from Job-Chain.
        </p>
      </div>

      <div className="max-w-5xl mx-auto py-4">

        <div className="mt-6 max-w-xs mx-auto sm:mx-0 relative z-20" ref={filterRef}>
          <label className="block text-xs text-zinc-400 mb-2">Filter by status</label>
          <button
            type="button"
            onClick={() => setFilterOpen((value) => !value)}
            className="w-full flex items-center justify-between rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-purple-600 focus:drop-shadow-[0_0_15px_rgba(168,85,247,0.5)] transition"
          >
            <span>
              {activeFilter === "all"
                ? "All"
                : activeFilter.charAt(0).toUpperCase() + activeFilter.slice(1)}
            </span>
            <span
              className={`text-zinc-400 transition-transform duration-200 ${
                filterOpen ? "rotate-180" : ""
              }`}
            >
              ▼
            </span>
          </button>

          <div
            className={`absolute left-0 top-full mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-900 p-1 shadow-xl z-30 origin-top transition-all duration-200 ${
              filterOpen
                ? "pointer-events-auto opacity-100 translate-y-0 scale-100"
                : "pointer-events-none opacity-0 -translate-y-2 scale-95"
            }`}
          >
              {FILTER_OPTIONS.map((filter) => {
                const selected = activeFilter === filter;
                const label =
                  filter === "all"
                    ? "All"
                    : filter.charAt(0).toUpperCase() + filter.slice(1);

                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => {
                      setActiveFilter(filter);
                      setFilterOpen(false);
                    }}
                    className={`w-full text-left rounded-lg px-3 py-2 text-sm transition ${
                      selected
                        ? "bg-purple-500/15 text-purple-300 border border-purple-500/40"
                        : "text-zinc-200 hover:bg-zinc-800 hover:text-purple-300"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
          </div>
        </div>

        {filteredJobs.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-zinc-300">
            No jobs found for this status.
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredJobs.map((job) => {
              const appliedDate = new Date(job.applied_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              });

              return (
                <div
                  key={job.id}
                  className="relative flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-lg hover:shadow-purple-800/40 transition-shadow duration-300"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-4 text-xl font-semibold text-white">{job.title}</h2>
                    <span
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold capitalize ${STATUS_STYLES[job.status || "applied"]}`}
                    >
                      {job.status || "applied"}
                    </span>
                  </div>
                  <p className="text-zinc-300 font-medium mt-1">{job.company}</p>
                  <p className="text-zinc-500 italic mt-3">{job.location}</p>
                  <p className="text-zinc-200 mt-3">Applied on {appliedDate}</p>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {STATUS_OPTIONS.map((status) => (
                      <button
                        key={status}
                        type="button"
                        disabled={updatingId === job.id}
                        onClick={() => handleStatusChange(job.id, status)}
                        className={`rounded-lg border px-3 py-2 text-xs sm:text-sm font-semibold capitalize transition disabled:opacity-50 ${
                          job.status === status
                            ? "border-purple-500 text-purple-300 bg-purple-500/10"
                            : "border-zinc-700 text-zinc-300 hover:border-purple-500 hover:text-purple-300"
                        }`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>

                  <div className="mt-auto text-zinc-400 text-sm">
                    <div className="flex justify-between items-end gap-4">
                      <a
                        href={job.job_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block mt-5 bg-zinc-800 text-white hover:bg-purple-600 hover:text-white transition-colors duration-300 font-semibold px-4 py-2 rounded-lg shadow-md"
                      >
                        View Job
                      </a>
                      <div className="mt-10 text-right text-zinc-500 text-[11px] sm:text-sm">
                        Sourced from{" "}
                        <a
                          href="https://remotive.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-purple-400 hover:underline font-extrabold hover:drop-shadow-[0_0_15px_rgba(168,85,247,0.9)] transition duration-300"
                        >
                          Remotive
                        </a>
                      </div>
                    </div>
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
