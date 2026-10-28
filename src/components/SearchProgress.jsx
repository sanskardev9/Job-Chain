"use client";

import { useEffect, useState } from "react";
import { Check, Coffee, CloudDownload, FileSearch, Loader2, Mail, Radar, Target } from "lucide-react";

// JobPilot talking while it works: what it's doing, in turn, under "Sit back".
const SIT_BACK_LINES = [
  "Reading every job posting in full, so you don't have to.",
  "Checking languages, visa needs and experience for each one.",
  "Skipping the jobs that don't fit you.",
  "Writing a tailored email for every good match.",
  "Grab a coffee. Your matches will be waiting here.",
];

function SitBack() {
  const [line, setLine] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setLine((i) => (i + 1) % SIT_BACK_LINES.length), 3500);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="relative mt-5 flex items-start gap-3 rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-3">
      <Coffee size={20} className="mt-0.5 shrink-0 text-purple-300" />
      <div className="min-w-0">
        <p className="font-semibold text-white">Sit back, I&apos;ll handle it from here.</p>
        <p key={line} className="mt-0.5 animate-[fadeUp_0.5s_ease-out] text-sm text-purple-200/80">
          {SIT_BACK_LINES[line]}
        </p>
      </div>
    </div>
  );
}

const STAGES = [
  { id: "wake", label: "Starting JobPilot" },
  { id: "search", label: "Searching job sources" },
  { id: "score", label: "Checking every job against you" },
  { id: "write", label: "Writing your emails" },
];

// What the run is doing, from its current step and the log lines it wrote so far.
function stageOf(status, step, events) {
  if (["queued", "starting"].includes(status) || !step || step === "Starting" || step.startsWith("Loading")) return 0;
  if (events.some((e) => e.event_type === "drafted")) return 3;
  if (step.startsWith("Scoring")) return 2;
  return 1;
}

// Recruiter addresses stay hidden until the user writes an application, so the live feed never shows them.
const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const message = (event) =>
  (event.details?.message || "").replace(/contact email \S+/g, "email found").replace(/→\s*\S+@\S+/g, "").replace(EMAIL, "email");

/**
 * Live view of a JobPilot search: stages, progress across the user's job titles, running totals
 * and a ticker of what is being read right now. events: pipeline_events rows of this run.
 */
export default function SearchProgress({ status, step, events = [], startedAt, compact = false }) {
  const stage = stageOf(status, step, events);

  const keyword = step?.match(/^EURES: “(.+)” \((\d+)\/(\d+)\)/);
  const titleProgress = keyword ? Number(keyword[2]) / Number(keyword[3]) : stage >= 2 ? 1 : 0;

  // Jobs come from two places: ads read fresh from the sources now, and ads already in the shared
  // database. "Checked" counts both, so the numbers always add up for the user.
  const read = events.filter((e) => e.event_type === "read").length;
  const scored = events.filter((e) => e.event_type === "scored");
  const good = scored.filter((e) => ["strong", "possible"].includes(e.details?.label)).length;
  const drafted = events.filter((e) => e.event_type === "drafted").length;
  const ticker = events
    .filter((e) => ["open", "read", "scored", "drafted"].includes(e.event_type))
    .slice(-4)
    .reverse();

  const stats = [
    { icon: FileSearch, value: scored.length, label: "jobs checked", sub: "against your profile" },
    { icon: Target, value: good, label: "worth applying", sub: "strong or possible" },
    { icon: Mail, value: drafted, label: "emails drafted", sub: good && !drafted && stage >= 2 ? "only for jobs that list an email" : null },
    { icon: CloudDownload, value: read, label: "new from job sources",
      sub: stage >= 2 && !read ? "searched recently, used jobs already found" : "read in full right now" },
  ];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-purple-500/40 bg-gradient-to-br from-purple-600/20 via-zinc-900 to-zinc-950 p-5">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-purple-600/20 blur-3xl" />

      <div className="relative flex items-start gap-4">
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-purple-500/25" />
          <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-purple-600">
            <Radar size={20} className="text-white" />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="font-semibold text-white">JobPilot is searching Europe for you</p>
          </div>
          <p className="mt-0.5 truncate text-sm text-purple-200">
            {stage === 0 ? "Waking up the search engine (about a minute the first time)…" : step}
          </p>
        </div>
      </div>

      <ol className="relative mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STAGES.map((s, i) => (
          <li
            key={s.id}
            className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition ${
              i < stage
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : i === stage
                  ? "border-purple-500/60 bg-purple-500/15 text-white"
                  : "border-zinc-800 text-zinc-500"
            }`}
          >
            {i < stage ? (
              <Check size={14} className="shrink-0" />
            ) : i === stage ? (
              <Loader2 size={14} className="shrink-0 animate-spin" />
            ) : (
              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-zinc-700 text-[9px]">{i + 1}</span>
            )}
            <span className="leading-tight">{s.label}</span>
          </li>
        ))}
      </ol>

      {stage >= 1 ? (
        <div className="relative mt-4">
          <div className="flex justify-between text-[11px] text-zinc-500">
            <span>{keyword ? `Job title ${keyword[2]} of ${keyword[3]}` : stage >= 2 ? "All job titles searched" : "Preparing"}</span>
            <span>{Math.round(titleProgress * 100)}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-400 transition-all duration-700"
              style={{ width: `${Math.max(titleProgress * 100, 3)}%` }} />
          </div>
        </div>
      ) : null}

      {!compact ? (
        <div className="relative mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.map(({ icon: Icon, value, label, sub }) => (
            <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-xl font-extrabold tabular-nums text-white">
                <Icon size={15} className="text-purple-300" /> {value}
              </p>
              <p className="text-xs text-zinc-400">{label}</p>
              {sub ? <p className="text-[11px] text-zinc-600">{sub}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      {ticker.length ? (
        <ul className="relative mt-4 space-y-1 font-mono text-[11px]">
          {ticker.map((event, i) => (
            <li key={event.id} className={`truncate transition-opacity ${i === 0 ? "text-zinc-200" : "text-zinc-500"}`}>
              <span className="text-purple-400">›</span> {message(event)}
            </li>
          ))}
        </ul>
      ) : null}

      <SitBack />
    </div>
  );
}

/**
 * Compact progress for a typed search: the worker reading EURES ads in full to find which ones list an
 * email (quick apply). events: pipeline_events rows of the lookup run.
 */
export function LookupProgress({ query, status, events = [], startedAt, target = 25 }) {
  const read = events.filter((e) => e.event_type === "read");
  const withEmail = read.filter((e) => /contact email \S+@/.test(e.details?.message || "")).length;
  const latest = [...events].reverse().find((e) => ["open", "read"].includes(e.event_type));
  const waking = ["queued", "starting"].includes(status);
  const progress = Math.min(read.length / Math.max(target, 1), 1);

  return (
    <div className="relative mt-3 overflow-hidden rounded-2xl border border-purple-500/40 bg-gradient-to-br from-purple-600/15 via-zinc-900 to-zinc-950 p-4">
      <div className="flex items-start gap-3">
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-purple-500/25" />
          <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-purple-600">
            <Radar size={17} className="text-white" />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-sm font-semibold text-white">JobPilot is reading the job postings for “{query}”</p>
          </div>
          <p className="mt-0.5 text-xs text-zinc-400">
            {waking
              ? "Waking up the search engine (about a minute the first time)…"
              : "Finding which ones list an email, so you can quick apply. The list updates by itself."}
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-400 transition-all duration-700"
              style={{ width: `${Math.max(progress * 100, waking ? 0 : 3)}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="text-zinc-300"><FileSearch size={12} className="mr-1 inline text-purple-300" />{read.length} of {target} jobs read</span>
            <span className="text-emerald-300"><Mail size={12} className="mr-1 inline" />{withEmail} with an email (quick apply)</span>
          </div>
          {latest ? (
            <p className="mt-2 truncate font-mono text-[11px] text-zinc-500"><span className="text-purple-400">›</span> {message(latest)}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
