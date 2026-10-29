"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, Search, Share2, X, Zap } from "lucide-react";
import { SHARE_PARAM } from "../../lib/share";
import { supabase } from "../../lib/supabaseClient";
import { freshnessText, getSearchFreshness, runState, wakeWorker } from "../../lib/jobpilotClient";
import { trackedIndex } from "../../lib/jobs";
import { getSetupStatus, missingSetupText } from "../../lib/setup";
import Loader from "../../components/Loader";
import JobCard from "../../components/JobCard";
import PublicJobs from "../../components/PublicJobs";
import CountryPicker from "../../components/CountryPicker";
import { EUROPEAN_COUNTRIES } from "../../lib/countries";
import SearchProgress, { LookupProgress } from "../../components/SearchProgress";

const FRESH_DAYS = 15; // For you: what JobPilot matches and drafts for
const LIST_DAYS = 30; // Latest jobs, search results and shared links
const PAGE_SIZE = 30;
const LOOKUP_ACTIVE = ["queued", "running"];
const LOOKUP_READS = 25; // job postings the worker reads in full per typed search (worker.LOOKUP_PER_KEYWORD)

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

const isFresh = (job, days = FRESH_DAYS) => {
  const posted = job.posted_at || job.evaluated_at?.slice(0, 10);
  return (!posted || posted >= isoDaysAgo(days)) && (!job.deadline || job.deadline >= today());
};

// Same first cut as the worker's pool.title_patterns(): a title must contain a non-role word of one
// of the user's job titles. A bare "Developer" title means no cut.
const ROLE_WORDS = new Set(["developer", "engineer", "dev", "programmer", "entwickler", "entwicklerin",
  "softwareentwickler", "ontwikkelaar", "développeur"]);
const titleWords = (text) =>
  (text.toLowerCase().replace(/front-end|front end/g, "frontend").replace(/\//g, " ").match(/[a-zà-ÿ0-9+#.]+/g) || []);
function titlePatterns(keywords) {
  const words = new Set();
  for (const keyword of keywords) {
    const required = titleWords(keyword).filter((w) => !ROLE_WORDS.has(w));
    if (!required.length) return [];
    required.forEach((w) => words.add(w));
  }
  return [...words].sort().map((w) => `%${w}%`);
}

// Progress and outcome of "Refresh my matches".
function RefreshStatus({ refresh }) {
  const { status, step, counts = {}, error, freshness } = refresh;
  const fresh = (counts?.new ?? 0) + (counts?.updated ?? 0);
  const good = (counts?.strong ?? 0) + (counts?.possible ?? 0);
  if (status === "failed" || status === "cancelled") {
    return <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error || "The refresh did not finish."}</p>;
  }
  if (status === "finished") {
    return (
      <p className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
        {fresh
          ? `Checked ${counts.matched ?? fresh} jobs: ${fresh} new, ${good} of them worth applying${counts.drafted ? `, ${counts.drafted} emails drafted in JobPilot` : ""}.`
          : `Checked ${counts?.matched ?? 0} jobs: nothing new since your last refresh.`}
        {freshness ? <span className="mt-1 block text-xs text-emerald-200/70">{freshnessText(freshness)}</span> : null}
      </p>
    );
  }
  return (
    <div className="mt-3">
      <SearchProgress status={status} step={step} events={refresh.events} startedAt={refresh.startedAt || refresh.requestedAt} />
    </div>
  );
}

// The user's own scored jobs (For you).
// Removes some parameters from the address and keeps the rest (the search, Quick apply).
const dropParams = (...names) => {
  const url = new URL(window.location.href);
  names.forEach((name) => url.searchParams.delete(name));
  window.history.replaceState(null, "", url.pathname + url.search);
};

const fetchMine = async (userId) => {
  const { data } = await supabase
    .from("discovered_jobs")
    .select(MINE_COLUMNS)
    .eq("user_id", userId)
    .order("evaluated_at", { ascending: false, nullsFirst: false })
    .limit(1000);
  return data || [];
};

export default function JobsPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mine, setMine] = useState([]);
  const [tracked, setTracked] = useState([]);
  const [countries, setCountries] = useState([]);
  const [setup, setSetup] = useState(null);

  const [query, setQuery] = useState("");
  // Only jobs whose ad lists an application email, so JobPilot can apply for you.
  const [quickOnly, setQuickOnly] = useState(false);
  const [showUnlikely, setShowUnlikely] = useState(false);
  // For you | Latest jobs. A search always shows its results.
  const [tab, setTab] = useState("forYou");
  const [submitted, setSubmitted] = useState({ q: "", country: "" });
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [lookup, setLookup] = useState(null); // { q, runId, status, error }
  const [live, setLive] = useState(null); // { q, jobs, loading, error }: instant EURES results
  // "Refresh my matches": a JobPilot search run (pool first, sources only for stale titles).
  const [refresh, setRefresh] = useState(null); // { runId, status, step, counts, error }

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
      const [rows, { data: trackedRows }, { data: profile }] = await Promise.all([
        fetchMine(currentUser.id),
        supabase
          .from("jobs")
          .select("id, discovered_job_id, job_url, title, company, applied_at, applied_via, is_saved")
          .eq("user_id", currentUser.id)
          .or("applied_at.not.is.null,is_saved.eq.true"),
        supabase.from("candidate_profiles").select("target_countries, keywords").eq("user_id", currentUser.id).maybeSingle(),
      ]);
      setMine(rows);
      setTracked(trackedRows || []);
      setCountries(profile?.target_countries || []);
      profileFilterRef.current = { titles: titlePatterns(profile?.keywords || []) };
      // The search starts from the profile countries; the picker changes only this search.
      pickedRef.current = profile?.target_countries || [];
      setPicked(profile?.target_countries || []);
      // Coming back to /jobs?q=…: the same search, without searching the sources again.
      const restore = new URLSearchParams(window.location.search);
      if (restore.get("q")) {
        setQuery(restore.get("q"));
        setSubmitted({ q: restore.get("q"), country: "" });
        fetchLive(restore.get("q"));
      }
      if (restore.get("quick") === "1") setQuickOnly(true);
      setFilterReady(true);
      loadDrafts(currentUser.id);
      // Coming back while a search runs: show its progress right away.
      findActiveSearch(currentUser.id).then((run) => run && followRun(run));
      const params = new URLSearchParams(window.location.search);
      if (["forYou", "latest"].includes(params.get("tab"))) setTab(params.get("tab"));
      const runId = params.get("run");
      if (runId) {
        const show = params.get("show") === "good" ? "good" : "new";
        Promise.all([
          supabase.from("pipeline_runs").select("finished_at, requested_at").eq("id", runId).maybeSingle(),
          supabase.from("pipeline_events").select("details").eq("run_id", runId).eq("event_type", "scored").limit(500),
        ]).then(([{ data: run }, { data: events }]) => {
          const urls = (events || [])
            .filter((e) => show === "new" || ["strong", "possible"].includes(e.details?.label))
            .map((e) => e.details?.url).filter(Boolean);
          setFromRun({ show, at: run?.finished_at || run?.requested_at, urls: [...new Set(urls)] });
        });
      }
      const sharedUrl = params.get(SHARE_PARAM);
      if (sharedUrl) {
        supabase.rpc("get_shared_job", { p_source_url: sharedUrl }).then(({ data }) =>
          setSharedJob(data?.[0] ? { ...data[0], discoveredId: null } : { missing: true }));
      }
      getSetupStatus(currentUser.id).then(setSetup);
      setLoading(false);
    };
    load();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setUser(null);
        setMine([]);
        setTracked([]);
        setResults([]);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const index = useMemo(() => trackedIndex(tracked), [tracked]);
  const mineByUrl = useMemo(() => new Map(mine.map((row) => [row.source_url, row])), [mine]);

  // Search the shared pool (all users' searches combined); typed searches also ask EURES live.
  // Jobs scored unlikely for this user (and, with Quick apply, jobs already applied to) are left out
  // by the database, so every page is full of jobs worth looking at.
  const showUnlikelyRef = useRef(false);
  showUnlikelyRef.current = showUnlikely;
  // Without a typed search, "Latest jobs" shows only jobs for the user's own titles and countries.
  const profileFilterRef = useRef({ titles: [] });
  const [picked, setPicked] = useState([]);
  // Open application drafts by job: cards lead to them instead of writing a second one.
  const [drafts, setDrafts] = useState(new Map());
  const loadDrafts = useCallback(async (userId) => {
    const { data } = await supabase.from("application_drafts").select("discovered_job_id, status, error")
      .eq("user_id", userId).in("status", ["draft", "approved", "sending", "failed"]);
    // An interrupted send may still have reached Gmail: the card warns before a second application.
    const state = (d) => (d.status === "failed" ? (d.error?.startsWith("Interrupted") ? "interrupted" : null) : d.status);
    const open = (data || []).filter((d) => state(d)).sort((a, b) => (a.status === "failed") - (b.status === "failed"));
    setDrafts(new Map(open.reverse().map((d) => [d.discovered_job_id, state(d)])));
  }, []);
  // A job a friend shared with this user (/jobs?job=<source url>), shown above the lists.
  const [sharedJob, setSharedJob] = useState(null);
  // Jobs from one JobPilot search, opened from its funnel (/jobs?run=<id>&show=new|good).
  const [fromRun, setFromRun] = useState(null); // { show, at, urls }
  const pickedRef = useRef([]);
  pickedRef.current = picked;
  const [filterReady, setFilterReady] = useState(false);
  const runSearch = useCallback(async (q, c, offset = 0, emailOnly = false) => {
    setSearching(true);
    const { data, error } = await supabase.rpc("search_jobs", {
      p_query: q,
      p_country: "",
      p_country_patterns: pickedRef.current.map((name) => `%${name.toLowerCase()}%`),
      p_limit: PAGE_SIZE,
      p_offset: offset,
      p_email_only: emailOnly,
      p_hide_unlikely: !showUnlikelyRef.current,
      p_hide_applied: emailOnly,
      ...(q ? {} : { p_title_patterns: profileFilterRef.current.titles }),
    });
    if (error) console.error("Job search failed", error);
    const page = data || [];
    setResults((prev) => (offset ? [...prev, ...page] : page));
    setHasMore(page.length === PAGE_SIZE);
    setSearching(false);
    return page;
  }, []);

  useEffect(() => {
    if (user && filterReady) runSearch(submitted.q, submitted.country, 0, quickOnly);
    // Re-run when a filter changes; new searches go through submit().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, filterReady, runSearch, quickOnly, showUnlikely, picked]);

  const startLookup = useCallback(
    async (q) => {
      // The same words were searched at the sources in the last hour: those results are already in
      // the list, and the worker would not search again anyway. Don't queue a run that does nothing.
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: recent } = await supabase
        .from("pipeline_runs")
        .select("id, status, counts")
        .eq("user_id", user.id).eq("kind", "lookup").ilike("query", q)
        .gte("requested_at", since)
        .order("requested_at", { ascending: false })
        .limit(1);
      if (recent?.length) {
        const run = recent[0];
        setLookup({ q, runId: run.id, status: run.status, fetched: run.counts?.fetched ?? null, recent: true });
        return;
      }
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
      setLookup({ q, runId: data.id, status: data.status, requestedAt: new Date().toISOString(), events: [] });
      window.dispatchEvent(new CustomEvent("jobchain:run-started"));
    },
    [user]
  );

  // Instant results straight from EURES (one request, a few seconds), shown while the worker reads the
  // full ads in the background (lookup run). Re-asked when the picked countries change.
  const fetchLive = useCallback(async (q, page = 1) => {
    if (!q) return setLive(null);
    setLive((prev) => (page > 1 && prev?.q === q ? { ...prev, loading: true } : { q, jobs: [], loading: true, page: 0 }));
    try {
      const params = new URLSearchParams({ q, page: String(page), countries: pickedRef.current.join(",") });
      const data = await (await fetch(`/api/jobs/eures?${params}`)).json();
      setLive((prev) => ({
        q, page, more: Boolean(data.more), loading: false, error: data.error || null,
        jobs: page > 1 && prev?.q === q ? [...prev.jobs, ...(data.jobs || [])] : data.jobs || [],
      }));
    } catch {
      setLive((prev) => ({ ...(prev || { q, jobs: [] }), loading: false, more: false, error: "EURES unavailable" }));
    }
  }, []);

  const submit = async (e) => {
    e?.preventDefault();
    const q = query.trim();
    setSubmitted({ q, country: "" });
    setLookup(null);
    fetchLive(q);
    await runSearch(q, "", 0, quickOnly);
    if (q) startLookup(q);
  };

  useEffect(() => {
    if (submitted.q) fetchLive(submitted.q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked]);

  // The search and Quick apply live in the address, so going to JobPilot and back keeps them.
  useEffect(() => {
    if (!filterReady) return;
    const url = new URL(window.location.href);
    if (submitted.q) url.searchParams.set("q", submitted.q);
    else url.searchParams.delete("q");
    if (quickOnly) url.searchParams.set("quick", "1");
    else url.searchParams.delete("quick");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [filterReady, submitted.q, quickOnly]);

  const clearSearch = () => {
    setQuery("");
    setSubmitted({ q: "", country: "" });
    setLookup(null);
    setLive(null);
    runSearch("", "", 0, quickOnly);
  };

  // Follow the live search; show its new jobs when it finishes.
  useEffect(() => {
    if (!lookup?.runId || !LOOKUP_ACTIVE.includes(lookup.status)) return undefined;
    const poll = setInterval(async () => {
      const lastId = lookup.events?.at(-1)?.id ?? 0;
      const [state, { data: newEvents }] = await Promise.all([
        runState(lookup.runId),
        supabase.from("pipeline_events").select("id, event_type, details")
          .eq("run_id", lookup.runId).gt("id", lastId).order("id").limit(200),
      ]);
      if (!state) return;
      if (state.status === lookup.status && !newEvents?.length) return;
      setLookup((prev) => ({
        ...prev, status: state.status, error: state.error, fetched: state.counts?.fetched ?? null,
        startedAt: prev.startedAt || state.started_at,
        events: [...(prev.events || []), ...(newEvents || [])].slice(-300),
      }));
      if (state.status === "finished") {
        // The search also scored its jobs for this user and drafted the good ones that list an email.
        runSearch(submitted.q, submitted.country, 0, quickOnly);
        setMine(await fetchMine(user.id));
        loadDrafts(user.id);
      }
    }, 3000);
    const wake = setInterval(wakeWorker, lookup.status === "queued" ? 20000 : 240000);
    return () => {
      clearInterval(poll);
      clearInterval(wake);
    };
  }, [lookup, runSearch, submitted, quickOnly, user, loadDrafts]);

  // A search already running for this user (started here, in JobPilot, or before leaving the page).
  const findActiveSearch = async (userId) => {
    const { data } = await supabase.from("pipeline_runs")
      .select("id, status, current_step, counts, requested_at, started_at")
      .eq("user_id", userId).eq("kind", "search").in("status", LOOKUP_ACTIVE)
      .order("requested_at", { ascending: false }).limit(1);
    return data?.[0] || null;
  };
  const followRun = (run) =>
    setRefresh({ runId: run.id, status: run.status, step: run.current_step, counts: run.counts,
      startedAt: run.started_at, requestedAt: run.requested_at, events: [] });

  const startRefresh = async () => {
    wakeWorker();
    const active = await findActiveSearch(user.id);
    if (active) {
      followRun(active);
      return;
    }
    setRefresh({ status: "starting" });
    const { data, error } = await supabase
      .from("pipeline_runs")
      .insert({ user_id: user.id, kind: "search" })
      .select("id, status")
      .single();
    if (error) {
      // Started elsewhere a moment ago: show that one instead of an error.
      const running = error.code === "23505" ? await findActiveSearch(user.id) : null;
      if (running) followRun(running);
      else setRefresh({ status: "failed", error: error.message });
      return;
    }
    setRefresh({ runId: data.id, status: data.status, requestedAt: new Date().toISOString(), events: [] });
    window.dispatchEvent(new CustomEvent("jobchain:run-started"));
  };

  // Follow the refresh; when it finishes, reload the matches it scored.
  useEffect(() => {
    if (!refresh?.runId || !LOOKUP_ACTIVE.includes(refresh.status)) return undefined;
    const poll = setInterval(async () => {
      const lastId = refresh.events?.at(-1)?.id ?? 0;
      const [{ data }, { data: newEvents }] = await Promise.all([
        supabase.from("pipeline_runs").select("status, error, current_step, counts, started_at")
          .eq("id", refresh.runId).maybeSingle(),
        supabase.from("pipeline_events").select("id, event_type, details")
          .eq("run_id", refresh.runId).gt("id", lastId).order("id").limit(200),
      ]);
      if (!data) return;
      setRefresh((prev) => ({
        ...prev, status: data.status, step: data.current_step, counts: data.counts, error: data.error,
        startedAt: data.started_at || prev.startedAt,
        events: [...(prev.events || []), ...(newEvents || [])].slice(-400),
      }));
      if (data.status === "finished") {
        const freshness = await getSearchFreshness();
        setRefresh((prev) => ({ ...prev, freshness }));
        setMine(await fetchMine(user.id));
        loadDrafts(user.id);
        runSearch(submitted.q, submitted.country, 0, quickOnly);
      }
    }, 3000);
    const wake = setInterval(wakeWorker, refresh.status === "queued" ? 20000 : 240000);
    return () => {
      clearInterval(poll);
      clearInterval(wake);
    };
  }, [refresh, user, runSearch, submitted, quickOnly]);

  const isVisible = (row) =>
    !mineByUrl.get(row.source_url)?.dismissed && isFresh(row, LIST_DAYS) && (!quickOnly || !index.appliedFor(row));

  // Next page at the bottom. If a page brings nothing visible, keep going (up to 5 pages) so the
  // button never just disappears while more jobs exist.
  const loadMore = async () => {
    // Stored jobs first; once they run out, the next page straight from EURES.
    if (!hasMore && live?.more && live.q === submitted.q) {
      await fetchLive(live.q, (live.page || 1) + 1);
      return;
    }
    let offset = results.length;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const page = await runSearch(submitted.q, "", offset, quickOnly);
      if (page.length < PAGE_SIZE || page.some(isVisible)) return;
      offset += page.length;
    }
  };

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

  if (!user) return <PublicJobs />;

  const refreshing = Boolean(refresh) && ["starting", ...LOOKUP_ACTIVE].includes(refresh.status);
  const searchActive = Boolean(submitted.q);
  const view = searchActive ? "latest" : tab;
  const goodMatches = mine
    .filter((row) => ["strong", "possible"].includes(row.match_label) && !row.dismissed && isFresh(row))
    .map(fromMine);
  // Matches with an email that were already applied to: "For you" can be empty because the work is done.
  const appliedQuick = goodMatches.filter((job) => job.has_email && index.appliedFor(job)).length;
  const forYou = goodMatches
    .filter((job) => !index.appliedFor(job))
    .filter((job) => !quickOnly || job.has_email)
    .sort(
      (a, b) =>
        Number(b.has_email) - Number(a.has_email) ||
        (b.score ?? 0) - (a.score ?? 0) ||
        String(b.posted_at || "").localeCompare(String(a.posted_at || ""))
    );

  // Kept in the database's order, so "Load more" always adds to the bottom. The database already
  // leaves out unlikely jobs and (with Quick apply) jobs applied to; this only drops dismissed ones.
  const stored = results
    .filter((r) => isVisible(r))
    .map((r) => {
      const own = mineByUrl.get(r.source_url);
      return own ? { ...fromMine(own), snippet: r.snippet, has_email: r.has_email } : { ...r, discoveredId: null };
    });
  // EURES results not stored yet, after the stored ones. Quick apply needs a known email, so not there.
  const storedUrls = new Set(results.map((r) => r.source_url));
  const reading = LOOKUP_ACTIVE.includes(lookup?.status) || lookup?.status === "starting";
  // Only the ads the worker is reading right now get a "checking" note; the rest are plain previews.
  const liveOnly = live && live.q === submitted.q && !quickOnly
    ? live.jobs.filter((j) => !storedUrls.has(j.source_url) && isVisible(j))
        .map((j, i) => ({ ...j, checking: reading && i < LOOKUP_READS }))
    : [];
  const shownResults = [...stored, ...liveOnly];
  const searchingSources = Boolean(live?.loading) || LOOKUP_ACTIVE.includes(lookup?.status) || lookup?.status === "starting";

  const card = (job) => (
    <JobCard
      key={job.source_url}
      job={job}
      userId={user.id}
      saved={index.savedFor(job)}
      applied={index.appliedFor(job)}
      onChange={handleChange}
      setupMissing={missingSetupText(setup)}
      draftStatus={drafts.get(job.discoveredId || mineByUrl.get(job.source_url)?.id)}
    />
  );

  return (
    <div className="min-h-full bg-zinc-950 px-4 sm:px-6 text-white pb-10">
      <div className="flex flex-col items-center justify-center">
        <h1 className="text-3xl font-extrabold mb-3 sm:mb-6 mt-6 tracking-tight text-white sm:text-5xl hover:text-purple-500 hover:drop-shadow-[0_0_15px_rgba(168,85,247,0.9)] transition duration-300">
          Jobs
        </h1>
        <p className="text-zinc-400 mb-3 text-sm sm:text-base text-center">
          Jobs across Europe from the last month, from every JobChain search. The more people search, the more jobs
          there are.
        </p>
      </div>

      {/* Flex so a typed search's results can sit right under the search bar (sections below use order-last). */}
      <div className="max-w-7xl mx-auto flex flex-col gap-8 py-4">
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, skill, company or city (e.g. React Berlin)"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 py-3 pl-10 pr-10 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-600"
            />
            {query ? (
              <button type="button" onClick={() => (submitted.q ? clearSearch() : setQuery(""))} aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white">
                <X size={16} />
              </button>
            ) : null}
          </div>
          <CountryPicker options={EUROPEAN_COUNTRIES} profileCountries={countries} value={picked} onChange={setPicked} />
          <button
            type="submit"
            disabled={searching}
            className="whitespace-nowrap rounded-xl bg-white px-5 py-3 font-semibold text-black hover:bg-purple-600 hover:text-white transition disabled:opacity-60"
          >
            Search
          </button>
        </form>

        <div className="-mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setQuickOnly((value) => !value)}
            aria-pressed={quickOnly}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
              quickOnly
                ? "border-purple-500 bg-purple-500/20 text-purple-100"
                : "border-zinc-700 text-zinc-300 hover:border-purple-500 hover:text-purple-300"
            }`}
          >
            <Zap size={14} className="fill-current" /> Quick apply only
          </button>
          <span className="text-xs text-zinc-500">
            Quick apply jobs list an application email, so JobPilot can write and send it for you.
          </span>
        </div>

        {fromRun ? (() => {
          // Best first: strong, then possible, then unlikely; higher score first within each.
          const RANK = { strong: 0, possible: 1, unlikely: 2 };
          const jobs = fromRun.urls.map((url) => mineByUrl.get(url)).filter(Boolean).map(fromMine)
            .sort((a, b) => (RANK[a.match_label] ?? 3) - (RANK[b.match_label] ?? 3) || (b.score ?? 0) - (a.score ?? 0));
          const when = fromRun.at
            ? new Date(fromRun.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
            : "";
          return (
            <section className={`rounded-2xl border border-purple-500/40 bg-purple-500/5 p-4 ${searchActive ? "order-last" : ""}`}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-purple-200">
                  {fromRun.show === "good" ? "Worth applying" : "New or updated"} · from your search{when ? ` on ${when}` : ""}
                  <span className="ml-2 rounded-full bg-purple-500/25 px-2 py-0.5 text-xs">{jobs.length}</span>
                </p>
                <button type="button"
                  onClick={() => { setFromRun(null); dropParams("run", "show"); }}
                  className="text-xs text-zinc-400 hover:text-zinc-200">
                  ✕ Close
                </button>
              </div>
              {jobs.length ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{jobs.map(card)}</div>
              ) : (
                <p className="text-sm text-zinc-400">These jobs are no longer open (closed or older than a month).</p>
              )}
            </section>
          );
        })() : null}

        {sharedJob ? (
          <section className={`rounded-2xl border border-purple-500/40 bg-purple-500/5 p-4 ${searchActive ? "order-last" : ""}`}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-purple-200">
                <Share2 size={15} /> Shared with you
              </p>
              <button
                type="button"
                onClick={() => {
                  setSharedJob(null);
                  dropParams(SHARE_PARAM);
                }}
                className="text-xs text-zinc-400 hover:text-zinc-200"
              >
                ✕ Close
              </button>
            </div>
            {sharedJob.missing ? (
              <p className="text-sm text-zinc-400">This job is no longer open (jobs stay listed for a month after posting).</p>
            ) : (
              <div>
                {card(mineByUrl.get(sharedJob.source_url) ? fromMine(mineByUrl.get(sharedJob.source_url)) : sharedJob)}
              </div>
            )}
          </section>
        ) : null}

        {searchActive ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
            <h2 className="text-xl font-semibold">
              Results for “{submitted.q}”
            </h2>
            <button type="button" onClick={clearSearch} className="text-sm font-semibold text-purple-300 hover:underline">
              ✕ Clear search
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-800">
            <div role="tablist" aria-label="Job lists" className="flex gap-1">
              {[
                ["forYou", "For you", forYou.length],
                ["latest", quickOnly ? "All quick apply jobs" : "Latest jobs", null],
              ].map(([id, label, count]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm sm:text-base font-semibold transition ${
                    tab === id ? "border-purple-500 text-white" : "border-transparent text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  {label}
                  {count != null ? (
                    <span className={`rounded-full px-2 py-0.5 text-xs ${tab === id ? "bg-purple-500/25 text-purple-100" : "bg-zinc-800 text-zinc-400"}`}>
                      {count}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            {tab === "forYou" ? (
              <button
                type="button"
                onClick={startRefresh}
                disabled={refreshing}
                className="mb-2 inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-purple-300 hover:underline disabled:opacity-60 disabled:no-underline"
              >
                <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
                {refreshing ? "Refreshing…" : "Refresh my matches"}
              </button>
            ) : null}
          </div>
        )}

        {/* A running or just-finished refresh stays visible on both tabs. */}
        {refresh ? <div className="-mt-4"><RefreshStatus refresh={refresh} /></div> : null}

        {view === "forYou" ? (
          <section role="tabpanel" className="-mt-4">
            <p className="text-sm text-zinc-500">Strong and possible matches for your profile, best first.</p>
            {forYou.length === 0 && quickOnly ? (
              <div className="mt-4 rounded-2xl border border-purple-500/30 bg-purple-500/10 p-5 text-center text-sm text-purple-100">
                {appliedQuick
                  ? `You've applied to all ${appliedQuick} of your matches that list an email 🎉 `
                  : "None of your matches lists an email right now. "}
                {shownResults.length ? (
                  <button type="button" onClick={() => setTab("latest")} className="font-semibold underline">
                    See {shownResults.length}
                    {hasMore ? "+" : ""} more quick-apply jobs from everyone&apos;s searches →
                  </button>
                ) : (
                  <button type="button" onClick={startRefresh} disabled={refreshing} className="font-semibold underline disabled:opacity-60">
                    Find new quick apply jobs now →
                  </button>
                )}
              </div>
            ) : forYou.length === 0 ? (
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
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{forYou.map(card)}</div>
            )}
          </section>
        ) : null}

        {view === "latest" ? (
        <section role="tabpanel" className="-mt-4">
          {!searchActive ? (
            <p className="text-sm text-zinc-500">
              {quickOnly
                ? "Jobs from everyone's searches that list an application email."
                : "The newest jobs for your job titles and countries, from everyone's searches. Search above to see every job."}
            </p>
          ) : null}

          {lookup && lookup.q === submitted.q && reading ? (
            <LookupProgress query={submitted.q} status={lookup.status} events={lookup.events}
              startedAt={lookup.startedAt || lookup.requestedAt} target={LOOKUP_READS} />
          ) : lookup && lookup.q === submitted.q && shownResults.length ? (
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
                ? lookup.fetched
                  ? `Searched EURES and Arbeitnow too: ${lookup.fetched} new job${lookup.fetched === 1 ? "" : "s"} added below.`
                  : lookup.recent
                    ? "These words were searched at EURES and Arbeitnow within the last hour: everything they had is below."
                    : "Searched EURES and Arbeitnow too: they have no new jobs for these words right now."
                : ["failed", "cancelled"].includes(lookup.status)
                  ? lookup.error || "The live search did not finish."
                  : liveOnly.length
                    ? `JobPilot is reading the first ${Math.min(liveOnly.length, LOOKUP_READS)} of these job postings in full to find which ones you can quick apply to. About a minute; the list updates by itself.`
                    : "Searching EURES and Arbeitnow for more…"}
            </p>
          ) : null}

          {(searching && results.length === 0 && !searchActive) ? (
            <div className="py-12 flex justify-center">
              <Loader size="lg" />
            </div>
          ) : shownResults.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center text-zinc-400">
              {searchActive && (searching || searchingSources) ? (
                <span className="inline-flex items-center gap-2 text-purple-200">
                  <Loader2 size={16} className="animate-spin" />
                  Searching EURES and Arbeitnow for “{submitted.q}”…
                </span>
              ) : searchActive ? (
                "No fresh jobs match this search. Try fewer or different words."
              ) : quickOnly ? (
                <>
                  <p className="text-zinc-200">You&apos;re all caught up on quick apply jobs.</p>
                  <p className="mt-1 text-sm">
                    You&apos;ve applied to every one that fits you. JobPilot finds new ones each time it searches the job
                    sources.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setTab("forYou");
                      startRefresh();
                    }}
                    disabled={refreshing}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black hover:bg-purple-600 hover:text-white transition disabled:opacity-60"
                  >
                    <RefreshCw size={14} /> Find new quick apply jobs
                  </button>
                </>
              ) : (
                "No fresh jobs right now. JobPilot adds more each time anyone searches."
              )}
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{shownResults.map(card)}</div>
          )}

          <p className="mt-4 text-center text-xs text-zinc-500">
            {showUnlikely ? (
              <>
                Showing jobs that look unlikely for you too.{" "}
                <button type="button" onClick={() => setShowUnlikely(false)} className="text-purple-300 hover:underline">
                  Hide them
                </button>
              </>
            ) : (
              <>
                Jobs that look unlikely for you (a language, seniority or stack you don&apos;t have) are hidden.{" "}
                <button type="button" onClick={() => setShowUnlikely(true)} className="text-purple-300 hover:underline">
                  Show them
                </button>
              </>
            )}
          </p>

          {hasMore || (searchActive && live?.more && !quickOnly) ? (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                disabled={searching}
                onClick={loadMore}
                className="whitespace-nowrap rounded-xl border border-zinc-700 px-5 py-2.5 font-semibold hover:border-purple-500 hover:text-purple-300 transition disabled:opacity-50"
              >
                {searching || live?.loading ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
        </section>
        ) : null}
      </div>
    </div>
  );
}
