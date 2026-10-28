"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, CheckCircle2, Lock, Search, Sparkles, X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { jobDates } from "../lib/dates";
import Loader from "./Loader";
import Select from "./Select";

const SIGNUP = "/login?signup=1&redirect=/jobs";

// Jobs page for visitors: real fresh jobs, but nothing that leads to the posting outside JobChain
// (no company, link, email or description). Every action asks them to sign up.
export default function PublicJobs() {
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [countries, setCountries] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  // { job, action } when a visitor tries to act on a job; null when closed.
  const [prompt, setPrompt] = useState(null);

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
          {total ? `${total.toLocaleString()} jobs in Europe posted in the last 15 days` : "Fresh jobs in Europe from the last 15 days"}
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
          <Select
            small
            className="w-full sm:w-52"
            label="Country"
            value={country}
            onChange={setCountry}
            options={[
              { value: "", label: "All countries" },
              ...countries.map((c) => ({ value: c.country, label: `${c.country} (${c.jobs})` })),
            ]}
          />
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
                    onClick={() => setPrompt({ job, action: "save" })}
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
                      onClick={() => setPrompt({ job, action: "write" })}
                      className="whitespace-nowrap rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black hover:bg-purple-600 hover:text-white transition"
                    >
                      Write application
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrompt({ job, action: "view" })}
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

      {prompt ? <SignupPrompt {...prompt} onClose={() => setPrompt(null)} /> : null}
    </div>
  );
}

const HEADLINES = {
  write: "Let JobPilot write this one for you",
  view: "See the full job, and whether it fits you",
  save: "Save it for later",
};

const UNLOCKS = [
  "The company and the full job posting",
  "An honest check against your skills, languages and visa needs",
  "A tailored email with your CV, sent from your own Gmail",
  "Bookmarks and one list of everything you applied to",
];

// Sign-up prompt for visitors, about the exact job they tried to open.
function SignupPrompt({ job, action, onClose }) {
  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const signup = `/login?signup=1&redirect=${encodeURIComponent("/jobs")}`;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="signup-prompt-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md animate-[fadeUp_0.25s_ease-out] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-purple-900/30"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
        >
          <X size={18} />
        </button>

        <div className="border-b border-zinc-800 bg-gradient-to-br from-purple-600/20 to-transparent px-6 pb-5 pt-6">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/40 bg-purple-500/10 px-2.5 py-0.5 text-xs font-semibold text-purple-200">
            <Sparkles size={12} /> Free account
          </p>
          <h3 id="signup-prompt-title" className="mt-3 pr-8 text-xl font-bold text-white">
            {HEADLINES[action] || HEADLINES.view}
          </h3>
          {job ? (
            <div className="mt-3 rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-2.5">
              <p className="truncate text-sm font-semibold text-zinc-100">{job.title}</p>
              <p className="truncate text-xs text-zinc-500">
                {[job.location, job.country].filter(Boolean).join(", ")}
                {job.has_email ? " · ⚡ Quick apply available" : ""}
              </p>
            </div>
          ) : null}
        </div>

        <div className="px-6 py-5">
          <p className="text-sm font-semibold text-zinc-300">Sign up to get</p>
          <ul className="mt-3 space-y-2">
            {UNLOCKS.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-zinc-300">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-400" />
                {item}
              </li>
            ))}
          </ul>

          <Link
            href={signup}
            className="mt-6 block w-full rounded-xl bg-white px-4 py-3 text-center font-semibold text-black transition hover:bg-purple-600 hover:text-white"
          >
            Create free account
          </Link>
          <p className="mt-3 text-center text-sm text-zinc-500">
            Already have one?{" "}
            <Link href={`/login?redirect=${encodeURIComponent("/jobs")}`} className="font-semibold text-purple-300 hover:underline">
              Sign in
            </Link>
          </p>
          <p className="mt-4 text-center text-xs text-zinc-600">Takes about five minutes. No card, no spam.</p>
        </div>
      </div>
    </div>
  );
}
