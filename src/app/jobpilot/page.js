"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import Loader from "../../components/Loader";
import DraftsPanel, { LABEL_STYLES } from "../../components/DraftsPanel";
import { BookmarkToggle, MoreMenu } from "../../components/CardControls";
import { wakeWorker } from "../../lib/jobpilotClient";

const TABS = [
  { id: "activity", label: "Run & activity" },
  { id: "jobs", label: "Found jobs" },
  { id: "drafts", label: "Drafts" },
];
const ACTIVE = ["queued", "running"];
const POLL_MS = 3000;
const WORKER_ONLINE_SECONDS = 60;
const WORKER_URL = process.env.NEXT_PUBLIC_JOBPILOT_WORKER_URL;
const KEEP_AWAKE_MS = 4 * 60 * 1000;
const WAKE_RETRY_MS = 20 * 1000;

const RUN_STYLES = {
  queued: "bg-zinc-500/20 text-zinc-300 border-zinc-500/40",
  running: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  finished: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  failed: "bg-red-500/20 text-red-300 border-red-500/40",
  cancelled: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
};
const EVENT_STYLES = {
  error: "text-red-300",
  failed: "text-red-300",
  warning: "text-yellow-300",
  sent: "text-emerald-300",
  drafted: "text-purple-300",
  summary: "text-white font-semibold",
  step: "text-blue-300 font-semibold",
};

// Job boards' "employer hidden" placeholders: never use them to match or display as a company.
const HIDDEN_EMPLOYER = /^(siehe beschreibung|see description|confidential|vertraulich|anonym(ous)?|nicht eingegeben|keine angabe|n\/a|-|unknown)$/i;
const isHiddenEmployer = (company) => !company || HIDDEN_EMPLOYER.test(company.trim());
const companyName = (company) => (isHiddenEmployer(company) ? "Employer not named" : company);

// Same job reposted (other source/URL): compare company + title without gender tags or legal suffixes.
// Null when the employer is hidden, since unrelated jobs then share the same "company".
const jobKey = (job) => {
  if (isHiddenEmployer(job.company)) return null;
  const clean = (text) =>
    (text || "")
      .toLowerCase()
      .replace(/\([^)]*\)/g, " ")
      .replace(/\b(gmbh|ag|se|kg|b\.?v\.?|ltd|inc|llc|deutschland|germany)\b/g, " ")
      .replace(/[^a-z0-9äöüß]+/g, " ")
      .trim();
  return `${clean(job.company)}|${clean(job.title)}`;
};

const time = (value) =>
  value ? new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
const dateTime = (value) =>
  value ? new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

function CheckRow({ ok, label, hint, href }) {
  return (
    <li className="flex items-start gap-3">
      <span className={`mt-0.5 h-5 w-5 shrink-0 rounded-full border text-center text-xs leading-[18px] ${
        ok ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300" : "border-yellow-500/50 bg-yellow-500/15 text-yellow-300"
      }`}>
        {ok ? "✓" : "!"}
      </span>
      <span className="min-w-0">
        <span className="text-zinc-200">{label}</span>
        {hint ? (
          <span className="block text-xs text-zinc-500">
            {hint}
            {href ? (
              <>
                {" "}
                <Link href={href} className="text-purple-300 hover:underline">Fix</Link>
              </>
            ) : null}
          </span>
        ) : null}
      </span>
    </li>
  );
}

export default function JobPilotPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("activity");
  const [setup, setSetup] = useState(null);
  const [runs, setRuns] = useState([]);
  const [events, setEvents] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [jobFilter, setJobFilter] = useState("all");
  const [appliedJobs, setAppliedJobs] = useState([]);
  // Bookmarked found jobs (rows in `jobs` with is_saved), shown on the Bookmarks page.
  const [savedRows, setSavedRows] = useState([]);
  const [savingId, setSavingId] = useState("");
  // Opened from Bookmarks: show this job first and highlighted.
  const [focusJobId, setFocusJobId] = useState("");
  const [markingId, setMarkingId] = useState("");
  // Job id -> recipient typed for jobs whose posting lists no email.
  const [recipientDrafts, setRecipientDrafts] = useState({});
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [draftsKey, setDraftsKey] = useState(0);
  const logRef = useRef(null);
  const lastEventId = useRef(0);
  const shownRunId = useRef(null);

  const latestRun = runs[0] || null;
  const running = latestRun && ACTIVE.includes(latestRun.status);

  const loadSetup = useCallback(async (currentUser) => {
    const [{ data: profile }, { data: account }, { data: workers }, { count: approved }, { count: toReview }] =
      await Promise.all([
        supabase.from("candidate_profiles")
          .select("skills, keywords, cv_storage_path, send_mode, max_sends_per_run, experience_years, languages")
          .eq("user_id", currentUser.id).maybeSingle(),
        supabase.from("email_accounts").select("email").eq("user_id", currentUser.id).maybeSingle(),
        supabase.from("pipeline_workers").select("id, last_seen, sending_enabled").order("last_seen", { ascending: false }).limit(1),
        supabase.from("application_drafts").select("*", { count: "exact", head: true })
          .eq("user_id", currentUser.id).eq("status", "approved"),
        supabase.from("application_drafts").select("*", { count: "exact", head: true })
          .eq("user_id", currentUser.id).eq("status", "draft"),
      ]);
    const lastSeen = workers?.[0]?.last_seen;
    setSetup({
      profile,
      gmail: account?.email || null,
      workerOnline: lastSeen ? (Date.now() - new Date(lastSeen).getTime()) / 1000 < WORKER_ONLINE_SECONDS : false,
      workerLastSeen: lastSeen,
      workerSending: Boolean(workers?.[0]?.sending_enabled),
      approved: approved || 0,
      toReview: toReview || 0,
    });
  }, []);

  const loadRuns = useCallback(async (currentUser) => {
    const { data } = await supabase
      .from("pipeline_runs")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("requested_at", { ascending: false })
      .limit(10);
    setRuns(data || []);
    return data?.[0] || null;
  }, []);

  const loadEvents = useCallback(async (runId) => {
    if (shownRunId.current !== runId) {
      shownRunId.current = runId;
      lastEventId.current = 0;
      setEvents([]);
    }
    if (!runId) return;
    const { data } = await supabase
      .from("pipeline_events")
      .select("id, event_type, details, created_at")
      .eq("run_id", runId)
      .gt("id", lastEventId.current)
      .order("id", { ascending: true })
      .limit(500);
    if (data?.length) {
      lastEventId.current = data[data.length - 1].id;
      setEvents((prev) => [...prev, ...data]);
    }
  }, []);

  const loadJobs = useCallback(async (currentUser) => {
    const [{ data }, { data: tracked }] = await Promise.all([
      supabase
        .from("discovered_jobs")
        .select("id, title, company, location, country, source, source_url, apply_url, match_label, score, blockers, unknowns, matched_skills, missing_skills, required_skills, nice_to_have_skills, apply_email, evaluated_at")
        .eq("user_id", currentUser.id)
        .eq("dismissed", false)
        .not("evaluated_at", "is", null)
        .order("evaluated_at", { ascending: false })
        .limit(300),
      supabase
        .from("jobs")
        .select("id, discovered_job_id, job_url, title, company, applied_at, applied_via, is_saved")
        .eq("user_id", currentUser.id)
        .or("applied_at.not.is.null,is_saved.eq.true"),
    ]);
    setJobs(data || []);
    setAppliedJobs((tracked || []).filter((row) => row.applied_at));
    setSavedRows((tracked || []).filter((row) => row.is_saved && row.discovered_job_id));
  }, []);

  useEffect(() => {
    const init = async () => {
      const params = new URLSearchParams(window.location.search);
      if (TABS.some((t) => t.id === params.get("tab"))) setTab(params.get("tab"));
      if (params.get("job")) {
        setTab("jobs");
        setFocusJobId(params.get("job"));
      }

      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      setUser(currentUser ?? null);
      if (!currentUser) {
        setLoading(false);
        return;
      }
      const run = await loadRuns(currentUser);
      await Promise.all([loadSetup(currentUser), loadEvents(run?.id), loadJobs(currentUser)]);
      setLoading(false);
    };
    init();
  }, [loadRuns, loadSetup, loadEvents, loadJobs]);

  // Live updates while a run is queued/running; one last refresh when it ends.
  useEffect(() => {
    if (!user || !running) return undefined;
    const timer = setInterval(async () => {
      const run = await loadRuns(user);
      await loadEvents(run?.id);
      if (!run || !ACTIVE.includes(run.status)) {
        await Promise.all([loadSetup(user), loadJobs(user)]);
        setDraftsKey((k) => k + 1);
        if (run?.kind === "draft" && run.status === "finished") setTab("drafts");
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [user, running, loadRuns, loadEvents, loadSetup, loadJobs]);

  // Keep a sleeping hosted worker awake for as long as a run is queued or running.
  // While queued, ping often until the worker picks the run up; while running, just keep it awake.
  const queued = latestRun?.status === "queued";
  useEffect(() => {
    if (!running) return undefined;
    wakeWorker();
    const timer = setInterval(wakeWorker, queued ? WAKE_RETRY_MS : KEEP_AWAKE_MS);
    return () => clearInterval(timer);
  }, [running, queued]);

  // Keep the worker status fresh even when idle.
  useEffect(() => {
    if (!user) return undefined;
    const timer = setInterval(() => loadSetup(user), 20000);
    return () => clearInterval(timer);
  }, [user, loadSetup]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [events]);

  const startRun = async (kind, extra = {}) => {
    setBusy(true);
    setActionError("");
    wakeWorker();
    const { error } = await supabase.from("pipeline_runs").insert({ user_id: user.id, kind, ...extra });
    if (error) {
      setActionError(error.code === "23505" ? "A run is already in progress. Wait for it to finish." : error.message);
    } else {
      const run = await loadRuns(user);
      await loadEvents(run?.id);
      setTab("activity");
    }
    setBusy(false);
    return !error;
  };

  // "Write application" on a found job: the worker drafts it, then it appears in Drafts.
  const writeApplication = async (job) => {
    const recipient = (recipientDrafts[job.id] || "").trim();
    if (!job.apply_email && !/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(recipient)) {
      setRecipientDrafts((prev) => ({ ...prev, [job.id]: prev[job.id] ?? "" }));
      return;
    }
    await startRun("draft", { discovered_job_id: job.id, ...(recipient ? { recipient } : {}) });
  };

  const stopRun = async () => {
    setBusy(true);
    const { error } = await supabase.from("pipeline_runs").update({ status: "cancelled" }).eq("id", latestRun.id);
    if (error) setActionError(error.message);
    await loadRuns(user);
    setBusy(false);
  };

  const dismissJob = async (jobId) => {
    const { error } = await supabase.from("discovered_jobs").update({ dismissed: true }).eq("id", jobId);
    if (!error) setJobs((prev) => prev.filter((j) => j.id !== jobId));
  };

  // For jobs applied to outside JobPilot: records it in Applied so it is never drafted or sent again.
  const markApplied = async (job) => {
    setMarkingId(job.id);
    const savedRow = savedRows.find((row) => row.discovered_job_id === job.id);
    const appliedFields = { status: "applied", applied_at: new Date().toISOString(), applied_via: "manual", is_saved: false };
    const query = savedRow
      ? supabase.from("jobs").update(appliedFields).eq("id", savedRow.id)
      : supabase.from("jobs").insert({
        user_id: user.id,
        title: job.title,
        company: job.company,
        location: [job.location, job.country].filter(Boolean).join(", ") || null,
        job_url: job.apply_url || job.source_url,
        status: "applied",
        applied_at: new Date().toISOString(),
        applied_via: "manual",
        discovered_job_id: job.id,
      });
    const { data, error } = await query
      .select("id, discovered_job_id, job_url, title, company, applied_at, applied_via, is_saved")
      .single();
    if (error) {
      console.error("Failed to mark as applied", error);
    } else {
      setAppliedJobs((prev) => [...prev, data]);
      setSavedRows((prev) => prev.filter((row) => row.discovered_job_id !== job.id));
    }
    setMarkingId("");
  };

  const toggleSaved = async (job) => {
    setSavingId(job.id);
    const savedRow = savedRows.find((row) => row.discovered_job_id === job.id);
    if (savedRow) {
      const { error } = await supabase.from("jobs").delete().eq("id", savedRow.id).is("applied_at", null);
      if (!error) setSavedRows((prev) => prev.filter((row) => row.id !== savedRow.id));
    } else {
      const { data, error } = await supabase
        .from("jobs")
        .insert({
          user_id: user.id,
          title: job.title,
          company: job.company,
          location: [job.location, job.country].filter(Boolean).join(", ") || null,
          job_url: job.apply_url || job.source_url,
          is_saved: true,
          discovered_job_id: job.id,
        })
        .select("id, discovered_job_id, job_url, title, company, applied_at, applied_via, is_saved")
        .single();
      if (error) console.error("Failed to save job", error);
      else setSavedRows((prev) => [...prev, data]);
    }
    setSavingId("");
    window.dispatchEvent(new CustomEvent("jobchain:bookmarks-updated", { detail: { delta: savedRow ? -1 : 1 } }));
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
          <h1 className="text-2xl font-bold">Sign in to use JobPilot!</h1>
          <Link
            href="/login?redirect=/jobpilot"
            className="inline-block mt-6 rounded-xl bg-white px-4 py-2 text-black font-semibold hover:bg-purple-600 hover:text-white transition"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  const profile = setup?.profile;
  const profileReady = Boolean(profile?.skills?.length);
  const canSend = profile?.send_mode === "review" && setup?.gmail && setup?.approved > 0 && setup?.workerSending;
  const sendHint = !setup?.gmail
    ? "Connect Gmail in Profile first"
    : profile?.send_mode !== "review"
      ? "Choose “Review” send mode in Profile to allow sending"
      : !setup?.workerSending
        ? "Sending is switched off on the JobPilot worker (JOBPILOT_SENDING_ENABLED)"
        : setup?.approved === 0
        ? "Approve drafts in the Drafts tab first"
        : `Sends up to ${profile.max_sends_per_run} approved email(s)`;
  const appliedById = new Map(appliedJobs.filter((a) => a.discovered_job_id).map((a) => [a.discovered_job_id, a]));
  const appliedByUrl = new Map(appliedJobs.filter((a) => a.job_url).map((a) => [a.job_url, a]));
  const appliedByKey = new Map(appliedJobs.map((a) => [jobKey(a), a]).filter(([key]) => key));
  const appliedFor = (job) =>
    appliedById.get(job.id) ||
    appliedByUrl.get(job.source_url) ||
    appliedByUrl.get(job.apply_url) ||
    (jobKey(job) && appliedByKey.get(jobKey(job))) ||
    null;
  const sendBlockedReason = !setup?.gmail
    ? "connect Gmail in Profile"
    : profile?.send_mode !== "review"
      ? "choose “Review” send mode in Profile"
      : !setup?.workerSending && setup?.workerOnline
        ? "sending is switched off on the worker"
        : null;
  const jobCounts = ["strong", "possible", "unlikely"].reduce(
    (acc, label) => ({ ...acc, [label]: jobs.filter((j) => j.match_label === label && !appliedFor(j)).length }),
    { applied: jobs.filter((j) => appliedFor(j)).length }
  );
  const filteredJobs =
    jobFilter === "all"
      ? jobs
      : jobFilter === "applied"
        ? jobs.filter((j) => appliedFor(j))
        : jobs.filter((j) => j.match_label === jobFilter && !appliedFor(j));
  const focusedJob = focusJobId ? jobs.find((j) => j.id === focusJobId) : null;
  const visibleJobs = focusedJob ? [focusedJob, ...filteredJobs.filter((j) => j.id !== focusJobId)] : filteredJobs;

  return (
    <div className="min-h-full bg-zinc-950 px-4 sm:px-6 text-white pb-6">
      <div className="flex flex-col items-center justify-center w-content">
        <h1 className="text-3xl font-extrabold mb-3 sm:mb-6 mt-6 sm:mt-6 tracking-tight text-white sm:text-5xl hover:text-purple-500 hover:drop-shadow-[0_0_15px_rgba(168,85,247,0.9)] transition duration-300">
          JobPilot
        </h1>
        <p className="text-zinc-400 mb-3 text-sm sm:text-base text-center">
          Finds matching jobs, drafts applications, and sends only what you approve.
        </p>
      </div>

      <div className="max-w-5xl mx-auto py-4 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Automation</h2>
              {latestRun ? (
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${RUN_STYLES[latestRun.status]}`}>
                  {latestRun.kind === "send" ? "Sending" : "Search"} · {latestRun.status}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-zinc-400">
              {running
                ? latestRun.status === "queued"
                  ? setup?.workerOnline
                    ? "Waiting for the JobPilot worker to pick this up…"
                    : WORKER_URL
                      ? "Queued. Waking up the JobPilot worker, this can take about a minute…"
                      : "Queued. It starts as soon as the JobPilot worker is online."
                  : `Now: ${latestRun.current_step || "Starting"}`
                : latestRun
                  ? `Last run ${dateTime(latestRun.finished_at || latestRun.requested_at)}: ${latestRun.current_step || latestRun.status}`
                  : "No runs yet. Start your first search below."}
            </p>
            {latestRun?.error ? <p className="mt-2 text-sm text-red-400">{latestRun.error}</p> : null}

            {Object.keys(latestRun?.counts || {}).length ? (
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                {Object.entries(latestRun.counts).map(([name, value]) => (
                  <span key={name} className="rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-zinc-300">
                    {name}: <span className="font-semibold text-white">{value}</span>
                  </span>
                ))}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              {running ? (
                <button
                  type="button"
                  onClick={stopRun}
                  disabled={busy || latestRun.status === "cancelled"}
                  className="whitespace-nowrap rounded-xl border border-red-500/60 px-4 py-2.5 font-semibold text-red-300 hover:bg-red-500/10 transition disabled:opacity-50"
                >
                  Stop
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => startRun("search")}
                    disabled={busy || !profileReady}
                    className="whitespace-nowrap rounded-xl bg-white px-4 py-2.5 font-semibold text-black hover:bg-purple-600 hover:text-white transition disabled:opacity-50"
                  >
                    Find jobs now
                  </button>
                  <button
                    type="button"
                    onClick={() => startRun("send")}
                    disabled={busy || !canSend}
                    title={sendHint}
                    className="whitespace-nowrap rounded-xl border border-zinc-700 px-4 py-2.5 font-semibold hover:border-purple-500 hover:text-purple-300 transition disabled:opacity-50"
                  >
                    Send approved ({setup?.approved || 0})
                  </button>
                </>
              )}
            </div>
            {!running ? <p className="mt-2 text-xs text-zinc-500">{sendHint}</p> : null}
            {actionError ? <p className="mt-2 text-sm text-red-400">{actionError}</p> : null}
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-6">
            <h2 className="text-xl font-semibold">Setup</h2>
            <ul className="mt-4 space-y-3 text-sm">
              <CheckRow ok={profileReady} label="Profile filled in"
                hint={profileReady ? `${profile.skills.length} skills, ${profile.keywords?.length || 0} keywords` : "Add your skills and keywords"}
                href={profileReady ? null : "/profile"} />
              <CheckRow ok={Boolean(profile?.cv_storage_path)} label="CV uploaded"
                hint={profile?.cv_storage_path ? null : "Needed to send applications"} href={profile?.cv_storage_path ? null : "/profile"} />
              <CheckRow ok={Boolean(setup?.gmail)} label={setup?.gmail ? `Gmail: ${setup.gmail}` : "Gmail not connected"}
                hint={setup?.gmail ? null : "Needed to send applications"} href={setup?.gmail ? null : "/profile"} />
              <CheckRow ok={profile?.send_mode === "review"}
                label={`Send mode: ${profile?.send_mode === "review" ? "Review" : "Dry run"}`}
                hint={profile?.send_mode === "review" ? `Max ${profile.max_sends_per_run} per run` : "Dry run never sends"}
                href={profile?.send_mode === "review" ? null : "/profile"} />
              <CheckRow ok={Boolean(setup?.workerOnline) || Boolean(WORKER_URL && setup?.workerLastSeen)}
                label={setup?.workerOnline
                  ? "JobPilot worker online"
                  : WORKER_URL && setup?.workerLastSeen ? "JobPilot worker asleep" : "JobPilot worker offline"}
                hint={setup?.workerOnline
                  ? `Last seen ${time(setup.workerLastSeen)}`
                  : WORKER_URL && setup?.workerLastSeen
                    ? "Wakes up automatically when you start a run (about a minute)"
                    : setup?.workerLastSeen ? `Last seen ${dateTime(setup.workerLastSeen)}` : "Start it with: python -m jobpilot worker"} />
              <CheckRow ok={Boolean(setup?.workerSending)}
                label={setup?.workerSending ? "Sending enabled on worker" : "Sending disabled on worker"}
                hint={setup?.workerSending
                  ? null
                  : setup?.workerOnline
                    ? "Safety switch: set JOBPILOT_SENDING_ENABLED=true on the worker and restart it"
                    : "Shown as off while the worker sleeps; checked again when it wakes"} />
            </ul>
          </section>
        </div>

        <div className="-mx-1 flex gap-2 overflow-x-auto border-b border-zinc-800 px-1 pb-3 sm:flex-wrap sm:overflow-visible">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`shrink-0 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                tab === t.id
                  ? "border-purple-500 text-purple-300 bg-purple-500/10"
                  : "border-zinc-700 text-zinc-300 hover:border-purple-500 hover:text-purple-300"
              }`}
            >
              {t.label}
              {t.id === "drafts" && setup?.toReview ? ` (${setup.toReview})` : ""}
              {t.id === "jobs" && jobs.length ? ` (${jobs.length})` : ""}
            </button>
          ))}
        </div>

        {tab === "activity" ? (
          <div className="space-y-6">
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Live log</h2>
                {running ? <span className="text-xs text-blue-300 animate-pulse">updating…</span> : null}
              </div>
              <div ref={logRef} className="mt-3 max-h-[28rem] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs leading-relaxed">
                {events.length === 0 ? (
                  <p className="text-zinc-500">
                    {latestRun ? "No log entries for this run yet." : "Logs of what JobPilot searches, opens and finds appear here."}
                  </p>
                ) : (
                  events.map((event) => (
                    <div key={event.id} className={`flex gap-3 ${EVENT_STYLES[event.event_type] || "text-zinc-300"}`}>
                      <span className="shrink-0 text-zinc-600">{time(event.created_at)}</span>
                      <span className="break-words">
                        {event.details?.message || event.event_type.replaceAll("_", " ")}
                        {event.details?.url ? (
                          <>
                            {" "}
                            <a href={event.details.url} target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-purple-300">↗</a>
                          </>
                        ) : null}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-6">
              <h2 className="text-lg font-semibold">Recent runs</h2>
              {runs.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500">No runs yet.</p>
              ) : (
                <ul className="mt-3 divide-y divide-zinc-800 text-sm">
                  {runs.map((run) => (
                    <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <button type="button" onClick={() => loadEvents(run.id)} className="text-left hover:text-purple-300">
                        <span className="font-semibold">{run.kind === "send" ? "Send approved" : "Find jobs"}</span>
                        <span className="text-zinc-500"> · {dateTime(run.requested_at)}</span>
                        {run.counts?.drafted != null ? <span className="text-zinc-400"> · {run.counts.drafted} drafted</span> : null}
                        {run.counts?.sent != null ? <span className="text-zinc-400"> · {run.counts.sent} sent</span> : null}
                      </button>
                      <span className={`rounded-full border px-2.5 py-0.5 text-xs capitalize ${RUN_STYLES[run.status]}`}>{run.status}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-zinc-500">Click a run to show its log.</p>
            </section>
          </div>
        ) : null}

        {tab === "jobs" ? (
          <section>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
              {["all", "strong", "possible", "unlikely", "applied"].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setJobFilter(f)}
                  className={`shrink-0 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-semibold capitalize transition ${
                    jobFilter === f
                      ? "border-purple-500 text-purple-300 bg-purple-500/10"
                      : "border-zinc-700 text-zinc-300 hover:border-purple-500 hover:text-purple-300"
                  }`}
                >
                  {f} ({f === "all" ? jobs.length : jobCounts[f]})
                </button>
              ))}
            </div>
            {visibleJobs.length === 0 ? (
              <div className="mt-6 rounded-2xl text-center border border-zinc-800 bg-zinc-900 p-8 text-zinc-400">
                No jobs here yet. Click “Find jobs now”.
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                {visibleJobs.map((job) => {
                  const applied = appliedFor(job);
                  const saved = savedRows.some((row) => row.discovered_job_id === job.id);
                  return (
                  <div key={job.id} className={`relative flex flex-col rounded-2xl border p-5 ${
                    job.id === focusJobId ? "border-purple-500 ring-1 ring-purple-500/60 bg-zinc-900"
                      : applied ? "border-emerald-500/30 bg-zinc-900/60" : "border-zinc-800 bg-zinc-900"
                  } shadow-lg hover:shadow-purple-800/40 transition-shadow duration-300`}>
                    {!applied ? (
                      <BookmarkToggle saved={saved} disabled={savingId === job.id} onToggle={() => toggleSaved(job)} />
                    ) : null}
                    <div className="flex items-start justify-between gap-3 pr-10">
                      <h3 className="font-semibold break-words">{job.title}</h3>
                      <span className={`shrink-0 text-xs font-semibold capitalize ${LABEL_STYLES[job.match_label] || ""}`}>
                        {job.match_label} · {job.score}
                      </span>
                    </div>
                    {applied ? (
                      <p className="mt-1 inline-flex w-fit items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
                        ✓ Applied {new Date(applied.applied_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        {applied.applied_via === "email" ? " via JobPilot" : ""}
                      </p>
                    ) : null}
                    <p className={`text-sm ${isHiddenEmployer(job.company) ? "italic text-zinc-500" : "text-zinc-300"}`}>
                      {companyName(job.company)}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {[job.location, job.country].filter(Boolean).join(", ")} · {job.source}
                    </p>
                    {(job.blockers || []).length ? (
                      <p className="mt-2 text-xs text-red-300">✕ {job.blockers.join(" · ")}</p>
                    ) : null}
                    {(job.unknowns || []).length ? (
                      <p className="mt-1 text-xs text-yellow-300/90">? {job.unknowns.join(" · ")}</p>
                    ) : null}
                    {(job.required_skills || []).length ? (
                      <p className="mt-2 text-xs text-zinc-400">
                        <span className="text-zinc-500">Required: </span>
                        {job.required_skills.map((skill, i) => {
                          const missing = (job.missing_skills || []).includes(skill);
                          return (
                            <span key={skill}>
                              {i ? ", " : ""}
                              <span className={missing ? "text-red-300/90" : "text-emerald-300/90"}>{skill}</span>
                            </span>
                          );
                        })}
                      </p>
                    ) : null}
                    {(job.nice_to_have_skills || []).length ? (
                      <p className="mt-1 text-xs text-zinc-400">
                        <span className="text-zinc-500">Nice to have: </span>{job.nice_to_have_skills.join(", ")}
                      </p>
                    ) : null}
                    {(job.matched_skills || []).length ? (
                      <p className="mt-1 text-xs text-emerald-300/90">✓ You have: {job.matched_skills.join(", ")}</p>
                    ) : null}
                    <p className="mt-2 text-xs text-zinc-500">
                      {job.apply_email ? `Apply by email: ${job.apply_email}` : "No application email listed: apply on the vacancy page"}
                    </p>
                    {!applied && !job.apply_email && recipientDrafts[job.id] !== undefined ? (
                      <div className="mt-3 rounded-xl border border-zinc-700 bg-zinc-950 p-3">
                        <label className="block text-xs text-zinc-400" htmlFor={`recipient-${job.id}`}>
                          This posting lists no email. Paste the application email from the vacancy page:
                        </label>
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                          <input id={`recipient-${job.id}`} type="email" placeholder="jobs@company.com"
                            value={recipientDrafts[job.id]}
                            onChange={(e) => setRecipientDrafts((prev) => ({ ...prev, [job.id]: e.target.value }))}
                            className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-600" />
                          <button type="button" onClick={() => writeApplication(job)}
                            disabled={busy || running || !/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test((recipientDrafts[job.id] || "").trim())}
                            className="whitespace-nowrap rounded-lg bg-purple-600 px-3 py-2 text-sm font-semibold text-white hover:bg-purple-500 transition disabled:opacity-50">
                            Write it
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-auto pt-3 flex items-center gap-2">
                      {!applied ? (
                        <button type="button" onClick={() => writeApplication(job)} disabled={busy || running}
                          title={running ? "Wait for the current run to finish" : "JobPilot writes a tailored email you can review"}
                          className="whitespace-nowrap rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black hover:bg-purple-600 hover:text-white transition disabled:opacity-50">
                          Write application
                        </button>
                      ) : null}
                      <a href={job.source_url} target="_blank" rel="noopener noreferrer"
                        className="whitespace-nowrap rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-semibold hover:bg-purple-600 transition">
                        View vacancy
                      </a>
                      <MoreMenu disabled={markingId === job.id} items={[
                        ...(!applied ? [{ label: "Mark as applied", tone: "success", onClick: () => markApplied(job) }] : []),
                        { label: "Dismiss", tone: "danger", onClick: () => dismissJob(job.id) },
                      ]} />
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </section>
        ) : null}

        {tab === "drafts" ? (
          <DraftsPanel user={user} refreshKey={draftsKey} onChange={() => loadSetup(user)}
            onSend={() => startRun("send")}
            sendBlocked={running ? "wait for the current run to finish" : sendBlockedReason} />
        ) : null}
      </div>
    </div>
  );
}
