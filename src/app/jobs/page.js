"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { runState, wakeWorker } from "../../lib/jobpilotClient";
import { trackedIndex } from "../../lib/jobs";
import Loader from "../../components/Loader";
import JobCard from "../../components/JobCard";

const FRESH_DAYS = 15;
const PAGE_SIZE = 30;
const FEW_RESULTS = 10; // fewer than this: also search the job sources live
const LOOKUP_ACTIVE = ["queued", "running"];

const isoDaysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);

const MINE_COLUMNS =
  "id, source, source_url, apply_url, title, company, country, location, posted_at, deadline, apply_email, " +
  "match_label, score, blockers, unknowns, matched_skills, missing_skills, required_skills, nice_to_have_skills, " +
  "dismissed, evaluated_at";

// A discovered_jobs row (scored for this user) in JobCard's shape.
const fromMine = (row) => ({
  discoveredId: row.id,
  source_url: row.source_url,
  apply_url: row.apply_url,
  source: row.source,
  title: row.title,
  company: row.company,
  country: row.country,
  location: row.location,
  posted_at: row.posted_at,
  deadline: row.deadline,
  has_email: Boolean(row.apply_email),
  match_label: row.match_label,
  score: row.score,
  blockers: row.blockers,
  unknowns: row.unknowns,
  required_skills: row.required_skills,
  missing_skills: row.missing_skills,
  nice_to_have_skills: row.nice_to_have_skills,
});

const isFresh = (job) => {
  const posted = job.posted_at || job.evaluated_at?.slice(0, 10);
  return (!posted || posted >= isoDaysAgo(FRESH_DAYS)) && (!job.deadline || job.deadline >= today());
};

export default function JobsPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mine, setMine] = useState([]);
  const [tracked, setTracked] = useState([]);
  const [countries, setCountries] = useState([]);

  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [submitted, setSubmitted] = useState({ q: "", country: "" });
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [lookup, setLookup] = useState(null); // { q, runId, status, error }

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
      const [{ data: rows }, { data: trackedRows }, { data: profile }] = await Promise.all([
        supabase
          .from("discovered_jobs")
          .select(MINE_COLUMNS)
          .eq("user_id", currentUser.id)
          .order("evaluated_at", { ascending: false, nullsFirst: false })
          .limit(1000),
        supabase
          .from("jobs")
          .select("id, discovered_job_id, job_url, title, company, applied_at, applied_via, is_saved")
          .eq("user_id", currentUser.id)
          .or("applied_at.not.is.null,is_saved.eq.true"),
        supabase.from("candidate_profiles").select("target_countries").eq("user_id", currentUser.id).maybeSingle(),
      ]);
      setMine(rows || []);
      setTracked(trackedRows || []);
      setCountries(profile?.target_countries || []);
      setLoading(false);
    };
    load();
  }, []);

  const index = useMemo(() => trackedIndex(tracked), [tracked]);
  const mineByUrl = useMemo(() => new Map(mine.map((row) => [row.source_url, row])), [mine]);

  // Search the shared pool (all users' searches combined). Fewer than FEW_RESULTS: search live too.
  const runSearch = useCallback(async (q, c, offset = 0) => {
    setSearching(true);
    const { data, error } = await supabase.rpc("search_jobs", {
      p_query: q,
      p_country: c,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    });
    if (error) console.error("Job search failed", error);
    const page = data || [];
    setResults((prev) => (offset ? [...prev, ...page] : page));
    setHasMore(page.length === PAGE_SIZE);
    setSearching(false);
    return page;
  }, []);

  useEffect(() => {
    if (user) runSearch("", "", 0);
  }, [user, runSearch]);

  const startLookup = useCallback(
    async (q) => {
      wakeWorker();
      setLookup({ q, status: "starting" });
      const { data, error } = await supabase
        .from("pipeline_runs")
        .insert({ user_id: user.id, kind: "lookup", query: q })
        .select("id, status")
        .single();
      if (error) {
        setLookup({
          q,
          status: "failed",
          error: error.code === "23505" ? "JobPilot is busy with another run of yours. Try again when it finishes." : error.message,
        });
        return;
      }
      setLookup({ q, runId: data.id, status: data.status });
    },
    [user]
  );

  const submit = async (e) => {
    e?.preventDefault();
    const q = query.trim();
    setSubmitted({ q, country });
    setLookup(null);
    const page = await runSearch(q, country, 0);
    if (q && page.length < FEW_RESULTS) startLookup(q);
  };

  // Follow the live search; show its new jobs when it finishes.
  useEffect(() => {
    if (!lookup?.runId || !LOOKUP_ACTIVE.includes(lookup.status)) return undefined;
    const poll = setInterval(async () => {
      const state = await runState(lookup.runId);
      if (!state || state.status === lookup.status) return;
      setLookup((prev) => ({ ...prev, status: state.status, error: state.error }));
      if (state.status === "finished") runSearch(submitted.q, submitted.country, 0);
    }, 3000);
    const wake = setInterval(wakeWorker, lookup.status === "queued" ? 20000 : 240000);
    return () => {
      clearInterval(poll);
      clearInterval(wake);
    };
  }, [lookup, runSearch, submitted]);

  const handleChange = ({ type, row, discoveredId, sourceUrl }) => {
    if (type === "saved" || type === "applied") {
      setTracked((prev) => [...prev.filter((r) => r.id !== row.id), row]);
    } else if (type === "unsaved") {
      setTracked((prev) => prev.filter((r) => r.id !== row.id));
    } else if (type === "dismissed") {
      setMine((prev) => prev.map((r) => (r.id === discoveredId ? { ...r, dismissed: true } : r)));
      setResults((prev) => prev.filter((r) => r.source_url !== sourceUrl));
    }
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
          <h1 className="text-2xl font-bold">Sign in to see jobs for you!</h1>
          <Link
            href="/login?redirect=/jobs"
            className="inline-block mt-6 rounded-xl bg-white px-4 py-2 text-black font-semibold hover:bg-purple-600 hover:text-white transition"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  const forYou = mine
    .filter((row) => ["strong", "possible"].includes(row.match_label) && !row.dismissed && isFresh(row))
    .map(fromMine)
    .filter((job) => !index.appliedFor(job))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || String(b.posted_at || "").localeCompare(String(a.posted_at || "")));

  const shownResults = results
    .filter((r) => !mineByUrl.get(r.source_url)?.dismissed)
    .map((r) => {
      const own = mineByUrl.get(r.source_url);
      return own ? { ...fromMine(own), snippet: r.snippet, has_email: r.has_email } : { ...r, discoveredId: null };
    });

  const card = (job) => (
    <JobCard
      key={job.source_url}
      job={job}
      userId={user.id}
      saved={index.savedFor(job)}
      applied={index.appliedFor(job)}
      onChange={handleChange}
    />
  );

  return (
    <div className="min-h-full bg-zinc-950 px-4 sm:px-6 text-white pb-10">
      <div className="flex flex-col items-center justify-center">
        <h1 className="text-3xl font-extrabold mb-3 sm:mb-6 mt-6 tracking-tight text-white sm:text-5xl hover:text-purple-500 hover:drop-shadow-[0_0_15px_rgba(168,85,247,0.9)] transition duration-300">
          Jobs
        </h1>
        <p className="text-zinc-400 mb-3 text-sm sm:text-base text-center">
          Fresh jobs from the last {FRESH_DAYS} days, from every JobChain search. The more people search, the more jobs
          there are.
        </p>
      </div>

      <div className="max-w-5xl mx-auto py-4 space-y-8">
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, skill, company or city (e.g. React Berlin)"
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
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={searching}
            className="whitespace-nowrap rounded-xl bg-white px-5 py-3 font-semibold text-black hover:bg-purple-600 hover:text-white transition disabled:opacity-60"
          >
            Search
          </button>
        </form>

        {!submitted.q && !submitted.country ? (
          <section>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-xl font-semibold">For you ({forYou.length})</h2>
              <Link href="/jobpilot" className="text-sm text-purple-300 hover:underline">
                Refresh my matches →
              </Link>
            </div>
            <p className="mt-1 text-sm text-zinc-500">Strong and possible matches for your profile.</p>
            {forYou.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center text-zinc-400">
                No fresh matches yet. Fill in your{" "}
                <Link href="/profile" className="text-purple-300 hover:underline">
                  Profile
                </Link>{" "}
                and click <span className="text-white">Find jobs now</span> in{" "}
                <Link href="/jobpilot" className="text-purple-300 hover:underline">
                  JobPilot
                </Link>
                .
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">{forYou.map(card)}</div>
            )}
          </section>
        ) : null}

        <section>
          <h2 className="text-xl font-semibold">
            {submitted.q ? `Results for “${submitted.q}”` : submitted.country ? `Latest in ${submitted.country}` : "Latest jobs"}
          </h2>

          {lookup && lookup.q === submitted.q ? (
            <p
              className={`mt-2 text-sm ${
                lookup.status === "finished"
                  ? "text-emerald-300"
                  : ["failed", "cancelled"].includes(lookup.status)
                    ? "text-red-300"
                    : "text-blue-300 animate-pulse"
              }`}
            >
              {lookup.status === "finished"
                ? "Searched EURES and Arbeitnow too: new jobs are included below."
                : ["failed", "cancelled"].includes(lookup.status)
                  ? lookup.error || "The live search did not finish."
                  : lookup.status === "queued"
                    ? "Few jobs here yet. Waking up JobPilot to search EURES and Arbeitnow…"
                    : "Searching EURES and Arbeitnow for more…"}
            </p>
          ) : null}

          {searching && results.length === 0 ? (
            <div className="py-12 flex justify-center">
              <Loader size="lg" />
            </div>
          ) : shownResults.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center text-zinc-400">
              {LOOKUP_ACTIVE.includes(lookup?.status) || lookup?.status === "starting"
                ? "Looking for jobs…"
                : "No fresh jobs match this search. Try fewer or different words."}
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">{shownResults.map(card)}</div>
          )}

          {hasMore ? (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                disabled={searching}
                onClick={() => runSearch(submitted.q, submitted.country, results.length)}
                className="whitespace-nowrap rounded-xl border border-zinc-700 px-5 py-2.5 font-semibold hover:border-purple-500 hover:text-purple-300 transition disabled:opacity-50"
              >
                {searching ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
