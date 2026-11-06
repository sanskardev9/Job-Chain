"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowRight, Clock3, FileText,
  MailCheck, RefreshCw, Sparkles, Zap,
} from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import Loader from "../../components/Loader";

const ACTIVE = ["queued", "running"];
const authFailure = (error = "") => /gmail access expired|gmail.*revoked|invalid_grant/i.test(error);
const when = (value) => value ? new Date(value).toLocaleString("en-GB", {
  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
}) : "Not yet";

function Stat({ value, label, tone = "text-white" }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
      <p className={`text-2xl font-extrabold tabular-nums sm:text-3xl ${tone}`}>{value}</p>
      <p className="mt-1 text-xs text-zinc-500 sm:text-sm">{label}</p>
    </div>
  );
}

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const currentUser = auth.user;
    setUser(currentUser || null);
    if (!currentUser) {
      setLoading(false);
      return;
    }

    const [
      { data: profile }, { data: gmail }, { data: drafts }, { data: matches },
      { data: runs }, { data: tracked }, { count: saved },
    ] = await Promise.all([
      supabase.from("candidate_profiles")
        .select("preferred_name, keywords, auto_search_enabled, cv_storage_path")
        .eq("user_id", currentUser.id).maybeSingle(),
      supabase.from("email_accounts").select("email").eq("user_id", currentUser.id).maybeSingle(),
      supabase.from("application_drafts").select("id, status, error, created_at")
        .eq("user_id", currentUser.id).in("status", ["draft", "approved", "failed"]),
      supabase.from("discovered_jobs")
        .select("id, source_url, title, company, country, location, match_label, score, matched_skills, unknowns, evaluated_at")
        .eq("user_id", currentUser.id).eq("dismissed", false).in("match_label", ["strong", "possible"])
        .order("evaluated_at", { ascending: false }).limit(3),
      supabase.from("pipeline_runs").select("id, kind, status, counts, current_step, requested_at, finished_at")
        .eq("user_id", currentUser.id).in("kind", ["search", "send"])
        .order("requested_at", { ascending: false }).limit(8),
      supabase.from("jobs").select("status, applied_at").eq("user_id", currentUser.id).not("applied_at", "is", null),
      supabase.from("jobs").select("*", { count: "exact", head: true })
        .eq("user_id", currentUser.id).eq("is_saved", true).is("applied_at", null),
    ]);

    const openDrafts = drafts || [];
    const applications = tracked || [];
    setData({
      profile: profile || {},
      gmail: gmail?.email || null,
      matches: matches || [],
      runs: runs || [],
      counts: {
        drafts: openDrafts.filter((draft) => draft.status === "draft").length,
        approved: openDrafts.filter((draft) => draft.status === "approved").length,
        failed: openDrafts.filter((draft) => draft.status === "failed").length,
        gmailFailed: openDrafts.some((draft) => draft.status === "failed" && authFailure(draft.error)),
        saved: saved || 0,
        applied: applications.length,
        interviews: applications.filter((job) => job.status === "interview").length,
        offers: applications.filter((job) => job.status === "offer").length,
      },
    });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const latestRun = data?.runs?.[0];
  const lastSearch = data?.runs?.find((run) => run.kind === "search");
  const running = latestRun && ACTIVE.includes(latestRun.status);
  const name = data?.profile?.preferred_name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "there";
  const firstName = name.trim().split(" ")[0];
  const counts = data?.counts || {};
  const automationReady = Boolean(
    data?.profile?.auto_search_enabled !== false && data?.profile?.cv_storage_path && data?.profile?.keywords?.length
  );

  const nextAction = useMemo(() => {
    if (!data) return null;
    if (!data.profile.keywords?.length) return { href: "/profile", label: "Add search titles", note: "Tell JobPilot which related job titles to search each day" };
    if (counts.gmailFailed) return { href: "/jobpilot?tab=drafts&draft=failed", label: "Reconnect Gmail", note: `${counts.failed} failed application${counts.failed === 1 ? "" : "s"} need attention` };
    if (counts.failed) return { href: "/jobpilot?tab=drafts&draft=failed", label: "Review failed applications", note: `${counts.failed} can be corrected or retried` };
    if (counts.drafts) return { href: "/jobpilot?tab=drafts", label: "Review drafts", note: `${counts.drafts} application${counts.drafts === 1 ? " is" : "s are"} ready for your approval` };
    if (data.matches.length) return { href: "/jobs?tab=forYou", label: "See your best picks", note: "JobPilot found matches worth a look" };
    return { href: "/jobpilot", label: "Open JobPilot", note: "Your daily search will run automatically" };
  }, [data, counts.drafts, counts.failed, counts.gmailFailed]);

  if (loading) return <div className="flex min-h-[calc(100svh-9rem)] items-center justify-center"><Loader size="lg" /></div>;

  return (
    <div className="min-h-full bg-zinc-950 px-4 pb-10 text-white sm:px-6">
      <div className="mx-auto max-w-6xl py-7 sm:py-10">
        <section className="relative overflow-hidden rounded-3xl border border-purple-500/25 bg-gradient-to-br from-purple-600/15 via-zinc-900 to-zinc-900 p-5 sm:p-8">
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-purple-500/15 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-purple-300">Your JobChain home</p>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Welcome back, {firstName}.</h1>
              <p className="mt-3 max-w-xl text-zinc-400">{nextAction?.note}</p>
              <Link href={nextAction?.href || "/jobs"}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold sm:inline-flex sm:w-auto text-black transition hover:bg-purple-600 hover:text-white">
                {nextAction?.label} <ArrowRight size={17} />
              </Link>
            </div>
            <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-zinc-700/70 bg-zinc-950/70 p-3 sm:px-4">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${running ? "bg-purple-500/20 text-purple-300" : "bg-emerald-500/15 text-emerald-300"}`}>
                {running ? <RefreshCw size={19} className="animate-spin" /> : automationReady ? <Sparkles size={19} /> : <AlertTriangle size={19} />}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{running ? latestRun.current_step || "JobPilot is working" : automationReady ? "Daily search is on" : "Automation needs setup"}</p>
                <p className="text-xs text-zinc-500">{running ? "Your results will appear automatically" : automationReady ? "Pauses after 7 days away" : "Add your CV and search titles"}</p>
              </div>
            </div>
          </div>
        </section>

        {(counts.failed || counts.drafts) ? (
          <section className="mt-6 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-5">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-300" />
                <div>
                  <h2 className="font-semibold">Applications need your attention</h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    {counts.failed ? `${counts.failed} failed` : ""}{counts.failed && counts.drafts ? " · " : ""}
                    {counts.drafts ? `${counts.drafts} waiting for review` : ""}
                  </p>
                </div>
              </div>
              <Link href={counts.failed ? "/jobpilot?tab=drafts&draft=failed" : "/jobpilot?tab=drafts"}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-amber-500/40 px-4 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-500/10">
                Review now <ArrowRight size={14} />
              </Link>
            </div>
          </section>
        ) : null}

        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat value={counts.saved || 0} label="saved jobs" />
          <Stat value={counts.applied || 0} label="applications" />
          <Stat value={counts.interviews || 0} label="interviews" tone="text-blue-300" />
          <Stat value={counts.offers || 0} label="offers" tone="text-emerald-300" />
        </section>

        <div className="mt-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-3xl border border-zinc-800 bg-zinc-900/50 p-5 sm:p-6">
              <div className="flex items-center gap-2"><Zap size={18} className="fill-current text-purple-300" /><h2 className="font-semibold">JobPilot automation</h2></div>
              <div className="mt-5 space-y-4 text-sm">
                <div className="flex items-start justify-between gap-4"><span className="text-zinc-500">Automatic search</span><span className={automationReady ? "text-emerald-300" : "text-amber-300"}>{automationReady ? "On · daily" : data.profile.auto_search_enabled === false ? "Paused" : "Needs setup"}</span></div>
                <div className="flex items-start justify-between gap-4"><span className="text-zinc-500">Last search</span><span className="text-right text-zinc-300">{when(lastSearch?.finished_at || lastSearch?.requested_at)}</span></div>
                <div className="flex items-start justify-between gap-4"><span className="text-zinc-500">Search titles</span><span className="text-zinc-300">{data.profile.keywords?.length || 0}</span></div>
                <div className="flex items-start justify-between gap-4"><span className="text-zinc-500">Gmail</span><span className={`min-w-0 break-all text-right ${data.gmail ? "text-zinc-300" : "text-amber-300"}`}>{data.gmail || "Not connected"}</span></div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2 border-t border-zinc-800 pt-4">
                <Link href="/jobpilot" className="rounded-lg bg-purple-600 px-3 py-2 text-sm font-semibold hover:bg-purple-500">Open JobPilot</Link>
                <Link href="/profile" className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-purple-500">Settings</Link>
              </div>
            </section>

            <section className="rounded-3xl border border-zinc-800 bg-zinc-900/50 p-5 sm:p-6">
              <h2 className="font-semibold">Applications</h2>
              <div className="mt-4 space-y-3">
                <Link href="/jobpilot?tab=drafts" className="flex items-center gap-3 rounded-xl bg-zinc-950/70 p-3 hover:bg-zinc-800/70">
                  <FileText size={18} className="text-purple-300" /><span className="flex-1 text-sm">Drafts to review</span><strong>{counts.drafts || 0}</strong>
                </Link>
                <Link href="/jobpilot?tab=drafts&draft=failed" className="flex items-center gap-3 rounded-xl bg-zinc-950/70 p-3 hover:bg-zinc-800/70">
                  <AlertTriangle size={18} className="text-red-300" /><span className="flex-1 text-sm">Failed</span><strong>{counts.failed || 0}</strong>
                </Link>
                <Link href="/applied" className="flex items-center gap-3 rounded-xl bg-zinc-950/70 p-3 hover:bg-zinc-800/70">
                  <MailCheck size={18} className="text-emerald-300" /><span className="flex-1 text-sm">Sent and tracked</span><ArrowRight size={15} className="text-zinc-500" />
                </Link>
              </div>
            </section>
          </div>
        </div>

        <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-zinc-600">
          <Clock3 size={13} /> JobPilot prepares applications automatically. Nothing is sent until you approve it.
        </p>
      </div>
    </div>
  );
}
