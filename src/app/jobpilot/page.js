"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import Loader from "../../components/Loader";
import DraftsPanel from "../../components/DraftsPanel";
import SearchProgress from "../../components/SearchProgress";
import { Clock } from "lucide-react";
import { freshnessText, getSearchFreshness, wakeWorker } from "../../lib/jobpilotClient";

const TABS = [
  { id: "activity", label: "Run & activity" },
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

const time = (value) =>
  value ? new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
const dateTime = (value) =>
  value ? new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

// What one search did, from everything it looked at down to the emails it wrote.
function SearchFunnel({ run, live, toReview = 0, approved = 0, onOpenDrafts }) {
  const c = run.counts || {};
  const draftState = toReview
    ? `${toReview} waiting for your OK`
    : approved
      ? `${approved} approved, ready to send`
      : c.drafted
        ? "all reviewed ✓"
        : "none this time";
  const stages = [
    { value: c.matched ?? 0, label: "jobs checked", hint: "matching your titles and countries", bar: "bg-zinc-500",
      href: "/jobs?tab=latest" },
    { value: (c.new ?? 0) + (c.updated ?? 0), label: "new or updated", hint: "since your last search", bar: "bg-blue-400",
      href: `/jobs?run=${run.id}&show=new` },
    { value: (c.strong ?? 0) + (c.possible ?? 0), label: "worth applying", hint: `${c.strong ?? 0} strong · ${c.possible ?? 0} possible`,
      bar: "bg-purple-400", href: `/jobs?run=${run.id}&show=good` },
    { value: c.drafted ?? 0, label: "emails drafted", hint: draftState, bar: "bg-emerald-400", onClick: onOpenDrafts },
  ];
  const good = (c.strong ?? 0) + (c.possible ?? 0);
  // Good matches without a draft list no email: they are applied to on the employer's site.
  const onSite = Math.max(good - (c.drafted ?? 0), 0);
  const top = Math.max(stages[0].value, 1);
  return (
    <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {live ? "This search so far" : `Last search · ${dateTime(run.finished_at || run.requested_at)}`}
      </p>
      <ol className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        {stages.map((stage, index) => {
          const body = (
            <>
            <p className="text-2xl font-extrabold text-white tabular-nums">
              {stage.value.toLocaleString()}
              {index < stages.length - 1 ? <span className="ml-2 hidden text-base font-normal text-zinc-600 sm:inline">→</span> : null}
            </p>
            <p className="text-sm text-zinc-300">{stage.label}</p>
            <p className="truncate text-xs text-zinc-500">{stage.hint}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
              <div
                className={`h-full rounded-full ${stage.bar} transition-all duration-700`}
                style={{ width: `${stage.value ? Math.max((stage.value / top) * 100, 4) : 0}%` }}
              />
            </div>
            </>
          );
          // Every number opens the jobs behind it.
          const cls = "-m-2 block w-[calc(100%+1rem)] rounded-lg p-2 text-left transition hover:bg-zinc-800/60";
          return (
            <li key={stage.label} className="relative min-w-0">
              {stage.href ? (
                <Link href={stage.href} className={cls} title={`See the ${stage.label} jobs`}>{body}</Link>
              ) : stage.onClick ? (
                <button type="button" onClick={stage.onClick} className={cls} title="Open your drafts">{body}</button>
              ) : body}
            </li>
          );
        })}
      </ol>
      {onSite ? (
        <p className="mt-3 text-sm text-zinc-300">
          {onSite} of the {good} worth applying {onSite === 1 ? "lists" : "list"} no email, so you apply on the employer&apos;s
          site.{" "}
          <Link href={`/jobs?run=${run.id}&show=good`} className="font-semibold text-purple-300 hover:underline">
            See {onSite === 1 ? "it" : "them"} in For you →
          </Link>
        </p>
      ) : null}
      {c.unlikely ? (
        <p className="mt-3 text-xs text-zinc-500">
          {c.unlikely} skipped as unlikely (missing skills, language or experience), so you don&apos;t waste time on them.
        </p>
      ) : null}
    </div>
  );
}

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
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [draftsKey, setDraftsKey] = useState(0);
  // { ahead, running } for my queued run: how many other users' runs are in front of it.
  const [queueInfo, setQueueInfo] = useState(null);
  const logRef = useRef(null);
  const lastEventId = useRef(0);
  const shownRunId = useRef(null);

  // Applications being written show in the corner tray; this panel follows searches and sends.
  const latestRun = runs.find((run) => run.kind !== "draft") || null;
  const running = latestRun && ACTIVE.includes(latestRun.status);
  // The search funnel stays visible after a send run, so the scale of each search isn't hidden.
  const searches = runs.filter((run) => run.kind === "search" && Object.keys(run.counts || {}).length);
  const foundSomething = (run) => (run.counts.new ?? 0) + (run.counts.updated ?? 0) > 0;
  // A repeat search that found nothing new keeps showing the last search that did, plus a note.
  const latestSearch = searches[0] || null;
  const searchRun =
    latestSearch && (ACTIVE.includes(latestSearch.status) || foundSomething(latestSearch))
      ? latestSearch
      : searches.find(foundSomething) || latestSearch;
  const quietCheck = latestSearch && searchRun && latestSearch.id !== searchRun.id ? latestSearch : null;
  const sendRun = runs.find((run) => run.kind === "send" && Object.keys(run.counts || {}).length) || null;

  const loadSetup = useCallback(async (currentUser) => {
    const [
      { data: profile }, { data: account }, { data: workers }, { count: approved }, { count: toReview },
      { count: scored }, { count: sent }, { data: pool },
    ] =
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
        supabase.from("discovered_jobs").select("*", { count: "exact", head: true }).eq("user_id", currentUser.id),
        supabase.from("application_drafts").select("*", { count: "exact", head: true })
          .eq("user_id", currentUser.id).eq("status", "sent"),
        supabase.rpc("preview_countries"),
      ]);
    const freshness = await getSearchFreshness();
    const lastSeen = workers?.[0]?.last_seen;
    setSetup({
      profile,
      gmail: account?.email || null,
      workerOnline: lastSeen ? (Date.now() - new Date(lastSeen).getTime()) / 1000 < WORKER_ONLINE_SECONDS : false,
      workerLastSeen: lastSeen,
      workerSending: Boolean(workers?.[0]?.sending_enabled),
      approved: approved || 0,
      toReview: toReview || 0,
      freshness,
      totals: {
        pool: (pool || []).reduce((sum, c) => sum + Number(c.jobs || 0), 0),
        countries: (pool || []).length,
        scored: scored || 0,
        sent: sent || 0,
      },
    });
  }, []);

  const loadRuns = useCallback(async (currentUser) => {
    const { data } = await supabase
      .from("pipeline_runs")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("requested_at", { ascending: false })
      .limit(30);
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
    if (data?.length && shownRunId.current === runId) {
      lastEventId.current = Math.max(lastEventId.current, data[data.length - 1].id);
      // Two loads can overlap (poll + live update) and fetch the same rows: add each event once.
      setEvents((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        return [...prev, ...data.filter((e) => !seen.has(e.id))];
      });
    }
  }, []);

  // The tray's "Review & send" while already on this page: switch to the Drafts tab.
  useEffect(() => {
    const openDrafts = () => setTab("drafts");
    window.addEventListener("jobchain:open-drafts", openDrafts);
    return () => window.removeEventListener("jobchain:open-drafts", openDrafts);
  }, []);

  useEffect(() => {
    const init = async () => {
      const params = new URLSearchParams(window.location.search);
      if (TABS.some((t) => t.id === params.get("tab"))) setTab(params.get("tab"));
      // Old links to a found job now open the Jobs page.
      if (params.get("job") || params.get("tab") === "jobs") {
        window.location.replace("/jobs");
        return;
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
      await Promise.all([loadSetup(currentUser), loadEvents(run?.id)]);
      setLoading(false);
    };
    init();
  }, [loadRuns, loadSetup, loadEvents]);

  // Live updates while a run is queued/running; one last refresh when it ends.
  useEffect(() => {
    if (!user || !running) return undefined;
    const timer = setInterval(async () => {
      const run = await loadRuns(user);
      await loadEvents(run?.id);
      if (!run || !ACTIVE.includes(run.status)) {
        await loadSetup(user);
        setDraftsKey((k) => k + 1);
        if (run?.kind === "draft" && run.status === "finished") setTab("drafts");
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [user, running, loadRuns, loadEvents, loadSetup]);

  // Keep a sleeping hosted worker awake for as long as a run is queued or running.
  useEffect(() => {
    if (latestRun?.status !== "queued") {
      setQueueInfo(null);
      return undefined;
    }
    const check = async () => {
      const { data } = await supabase.rpc("run_queue_position", { p_run_id: latestRun.id });
      setQueueInfo(data?.[0] || null);
    };
    check();
    const timer = setInterval(check, POLL_MS);
    return () => clearInterval(timer);
  }, [latestRun?.id, latestRun?.status]);

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

  const stopRun = async () => {
    setBusy(true);
    const { error } = await supabase.from("pipeline_runs").update({ status: "cancelled" }).eq("id", latestRun.id);
    if (error) setActionError(error.message);
    await loadRuns(user);
    setBusy(false);
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
  const sendBlockedReason = !setup?.gmail
    ? "connect Gmail in Profile"
    : profile?.send_mode !== "review"
      ? "choose “Review” send mode in Profile"
      : !setup?.workerSending && setup?.workerOnline
        ? "sending is switched off on the worker"
        : null;
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
                  ? queueInfo && (queueInfo.ahead > 0 || queueInfo.running > 0)
                    ? queueInfo.ahead > 0
                      ? `#${queueInfo.ahead + 1} in line. Other users' searches are running first; yours starts automatically.`
                      : `Next in line. Starts as soon as a slot is free (${queueInfo.running} run${queueInfo.running === 1 ? "" : "s"} in progress).`
                    : setup?.workerOnline
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

            {setup?.totals ? (
              <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
                {[
                  [setup.totals.pool, "fresh jobs", `across ${setup.totals.countries} European countries`],
                  [setup.totals.scored, "jobs checked for you", "against your profile"],
                  [setup.totals.sent, "applications sent", "from your Gmail"],
                ].map(([value, label, hint]) => (
                  <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                    <p className="text-xl sm:text-3xl font-extrabold text-white">{value.toLocaleString()}</p>
                    <p className="text-xs sm:text-sm text-zinc-300">{label}</p>
                    <p className="hidden sm:block text-xs text-zinc-500">{hint}</p>
                  </div>
                ))}
              </div>
            ) : null}

            {running && latestRun.kind === "search" ? (
              <div className="mt-5">
                <SearchProgress status={latestRun.status} step={latestRun.current_step} events={events}
                  startedAt={latestRun.started_at || latestRun.requested_at} />
              </div>
            ) : searchRun ? (
              <SearchFunnel run={searchRun} live={false} toReview={setup?.toReview} approved={setup?.approved}
                onOpenDrafts={() => setTab("drafts")} />
            ) : null}
            {quietCheck ? (
              <p className="mt-3 text-sm text-zinc-400">
                Checked again {dateTime(quietCheck.finished_at || quietCheck.requested_at)}:{" "}
                <span className="text-zinc-200">nothing new yet.</span>
              </p>
            ) : null}
            {!running && setup?.freshness ? (
              <p className="mt-2 flex items-start gap-2 text-xs text-zinc-500">
                <Clock size={14} className="mt-px shrink-0" />
                {freshnessText(setup.freshness)}
              </p>
            ) : null}

            {sendRun ? (
              <p className="mt-3 text-sm text-zinc-400">
                {ACTIVE.includes(sendRun.status) ? "Sending now" : `Last send ${dateTime(sendRun.finished_at || sendRun.requested_at)}`}:{" "}
                <span className="font-semibold text-emerald-300">{sendRun.counts.sent ?? 0} sent</span>
                {sendRun.counts.failed ? <span className="text-red-300">, {sendRun.counts.failed} failed</span> : null}
              </p>
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
                  <Link
                    href="/jobs"
                    className="whitespace-nowrap rounded-xl border border-zinc-700 px-4 py-2.5 font-semibold hover:border-purple-500 hover:text-purple-300 transition"
                  >
                    See my matches →
                  </Link>
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
                        <span className="font-semibold">{{ send: "Send approved", draft: "Write application", lookup: `Live search${run.query ? ` “${run.query}”` : ""}` }[run.kind] || "Find jobs"}</span>
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

        {tab === "drafts" ? (
          <DraftsPanel user={user} refreshKey={draftsKey} onChange={() => loadSetup(user)}
            onSend={() => startRun("send")}
            sendBlocked={running ? "wait for the current run to finish" : sendBlockedReason} />
        ) : null}
      </div>
    </div>
  );
}
