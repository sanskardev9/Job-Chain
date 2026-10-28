"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, Lock, Search } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { jobDates } from "../lib/dates";
import Loader from "./Loader";

const SIGNUP = "/login?signup=1&redirect=/jobs";

// Jobs page for visitors: real fresh jobs, but nothing that leads to the posting outside JobChain
// (no company, link, email or description). Every action asks them to sign up.
export default function PublicJobs() {
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [countries, setCountries] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState(false);

  const search = async (q = "", c = "") => {
    setLoading(true);
    const { data, error } = await supabase.rpc("preview_jobs", { p_query: q, p_country: c, p_limit: 24 });
    if (error) console.error("Job preview failed", error);
    setJobs(data || []);
    setLoading(false);
  };

  useEffect(() => {
    search();
    supabase.rpc("preview_countries").then(({ data }) => setCountries(data || []));
  }, []);

  const total = countries.reduce((sum, c) => sum + Number(c.jobs || 0), 0);

  return (
    <div className="min-h-full bg-zinc-950 px-4 sm:px-6 text-white pb-10">
      <div className="flex flex-col items-center justify-center text-center">
        <h1 className="text-3xl font-extrabold mb-3 sm:mb-6 mt-6 tracking-tight sm:text-5xl">Jobs</h1>
        <p className="text-zinc-400 text-sm sm:text-base">
          {total ? `${total.toLocaleString()} jobs posted in the last 15 days` : "Fresh jobs from the last 15 days"}
          {countries.length ? ` across ${countries.length} countries.` : "."} Sign up to see which ones fit you, and
          apply with one email.
        </p>
      </div>

      <div className="max-w-5xl mx-auto py-6 space-y-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            search(query.trim(), country);
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <div className="relative min-w-0 flex-1">
            <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Try “React”, “Frontend Berlin” or “Web Developer”"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 py-3 pl-10 pr-4 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-600"
            />
          </div>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-600"
          >
            <option value="">All countries</option>
            {countries.map((c) => (
              <option key={c.country} value={c.country}>
                {c.country} ({c.jobs})
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="whitespace-nowrap rounded-xl bg-white px-5 py-3 font-semibold text-black hover:bg-purple-600 hover:text-white transition"
          >
            Search
          </button>
        </form>

        <div className="flex flex-col gap-3 rounded-2xl border border-purple-500/40 bg-purple-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-purple-100">
            With a free account you see the company and the full posting, which jobs actually fit your skills, languages
            and visa needs, and you can apply with a tailored email in a minute.
          </p>
          <Link
            href={SIGNUP}
            className="whitespace-nowrap rounded-lg bg-white px-4 py-2 text-center text-sm font-semibold text-black hover:bg-purple-600 hover:text-white transition"
          >
            Get started, free
          </Link>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader size="lg" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center text-zinc-400">
            No fresh jobs match this search. Try other words, or sign up and JobPilot will search the job portals for you.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {jobs.map((job) => {
              const dates = jobDates(job.posted_at, job.deadline);
              return (
                <div
                  key={job.id}
                  className="relative flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-lg hover:shadow-purple-800/40 transition-shadow duration-300"
                >
                  <button
                    type="button"
                    onClick={() => setPrompt(true)}
                    aria-label="Bookmark job"
                    className="absolute top-0 right-0 text-zinc-400 hover:text-purple-400 transition"
                  >
                    <Bookmark size={30} />
                  </button>
                  <h3 className="pr-10 font-semibold break-words">{job.title}</h3>
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-zinc-500">
                    <Lock size={13} /> Company shown after sign-up
                  </p>
                  <p className="text-xs text-zinc-500">{[job.location, job.country].filter(Boolean).join(", ")}</p>
                  {dates ? <p className="text-xs text-zinc-400">{dates}</p> : null}
                  <p className="mt-2 text-xs text-zinc-500">
                    {job.has_email ? "⚡ Quick apply: JobPilot can apply for you" : "Applications go through the employer's site"}
                  </p>
                  <div className="mt-auto pt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPrompt(true)}
                      className="whitespace-nowrap rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black hover:bg-purple-600 hover:text-white transition"
                    >
                      Write application
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrompt(true)}
                      className="whitespace-nowrap rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-semibold hover:bg-purple-600 transition"
                    >
                      View vacancy
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {prompt ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4" onClick={() => setPrompt(false)}>
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl"
          >
            <h3 className="text-lg font-bold text-white">This one could be yours</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Create a free account to see the full posting and the company, check whether it fits your profile, and
              send a tailored application with your CV from your own Gmail.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Link
                href="/login?redirect=/jobs"
                className="whitespace-nowrap rounded-lg border border-zinc-700 px-4 py-2 text-center text-sm hover:border-zinc-500 transition"
              >
                I have an account
              </Link>
              <Link
                href={SIGNUP}
                className="whitespace-nowrap rounded-lg bg-white px-4 py-2 text-center text-sm font-semibold text-black hover:bg-purple-600 hover:text-white transition"
              >
                Get started, free
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
