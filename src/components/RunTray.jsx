"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, Loader2, X, XCircle, Zap } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { wakeWorker } from "../lib/jobpilotClient";

const ACTIVE = ["queued", "running"];
const SEEN_KEY = "jobchain:runs-seen";
const RECENT_MS = 30 * 60 * 1000;

const readSeen = () => {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
  } catch {
    return [];
  }
};
const writeSeen = (ids) => {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-200)));
  } catch {
    // Storage unavailable: finished items simply show again after a reload.
  }
};

// Bottom-corner tray on every page: applications being written (and live searches), then
// "Draft ready" links, so users can keep browsing instead of waiting on one card.
export default function RunTray({ userId }) {
  const [runs, setRuns] = useState([]);
  const [seen, setSeen] = useState([]);
  const [open, setOpen] = useState(true);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - RECENT_MS).toISOString();
    const { data } = await supabase
      .from("pipeline_runs")
      .select("id, kind, status, error, query, requested_at, finished_at, discovered_jobs(title)")
      .eq("user_id", userId)
      .in("kind", ["draft", "lookup"])
      .gte("requested_at", since)
      .order("requested_at", { ascending: false })
      .limit(20);
    setRuns(data || []);
  }, [userId]);

  useEffect(() => {
    setSeen(readSeen());
    load();
    // Cards and searches announce new runs so the tray picks them up at once.
    const onNewRun = () => load();
    window.addEventListener("jobchain:run-started", onNewRun);
    return () => window.removeEventListener("jobchain:run-started", onNewRun);
  }, [load]);

  const active = runs.filter((r) => ACTIVE.includes(r.status));
  const queued = active.some((r) => r.status === "queued");

  // Poll quickly while something is in progress, slowly otherwise; keep a sleeping worker awake.
  useEffect(() => {
    const poll = setInterval(load, active.length ? 3000 : 30000);
    if (!active.length) return () => clearInterval(poll);
    wakeWorker();
    const wake = setInterval(wakeWorker, queued ? 20000 : 240000);
    return () => {
      clearInterval(poll);
      clearInterval(wake);
    };
  }, [load, active.length, queued]);

  const visible = runs.filter((r) => ACTIVE.includes(r.status) || !seen.includes(r.id));
  if (!visible.length) return null;

  const dismiss = (id) => {
    const next = [...seen, id];
    setSeen(next);
    writeSeen(next);
  };
  const dismissAll = () => {
    const next = [...seen, ...visible.filter((r) => !ACTIVE.includes(r.status)).map((r) => r.id)];
    setSeen(next);
    writeSeen(next);
  };

  const ready = visible.filter((r) => r.kind === "draft" && r.status === "finished").length;
  const title = (run) =>
    run.kind === "lookup" ? `Searching for “${run.query}”` : run.discovered_jobs?.title || "Application";

  return (
    <div className="fixed bottom-4 right-4 z-[60] w-[min(22rem,calc(100vw-2rem))]">
      <div className="rounded-2xl border border-zinc-700 bg-zinc-900/95 shadow-2xl shadow-black/50 backdrop-blur">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center gap-2 px-4 py-3 text-left"
        >
          {active.length ? (
            <Loader2 size={16} className="animate-spin text-purple-300" />
          ) : (
            <Zap size={16} className="fill-current text-purple-300" />
          )}
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
            {active.length
              ? `JobPilot is working on ${active.length} item${active.length === 1 ? "" : "s"}`
              : ready
                ? `${ready} draft${ready === 1 ? "" : "s"} ready to review`
                : "JobPilot activity"}
          </span>
          <ChevronDown size={16} className={`text-zinc-400 transition ${open ? "" : "rotate-180"}`} />
        </button>

        {open ? (
          <div className="max-h-72 overflow-y-auto border-t border-zinc-800 px-2 py-2">
            {visible.map((run) => {
              const done = run.status === "finished";
              const failed = ["failed", "cancelled"].includes(run.status);
              return (
                <div key={run.id} className="flex items-start gap-2 rounded-lg px-2 py-2 hover:bg-zinc-800/60">
                  {done ? (
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-300" />
                  ) : failed ? (
                    <XCircle size={16} className="mt-0.5 shrink-0 text-red-300" />
                  ) : (
                    <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-blue-300" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-zinc-200">{title(run)}</p>
                    <p className={`text-xs ${failed ? "text-red-300" : "text-zinc-500"}`}>
                      {done ? (
                        run.kind === "draft" ? (
                          <Link href="/jobpilot?tab=drafts" className="font-semibold text-purple-300 hover:underline">
                            Draft ready · Review &amp; send →
                          </Link>
                        ) : (
                          "New jobs added to the list"
                        )
                      ) : failed ? (
                        run.error?.replace(/^RuntimeError:\s*/, "") || "Did not finish"
                      ) : run.status === "queued" ? (
                        "Queued · waking up JobPilot…"
                      ) : run.kind === "draft" ? (
                        "Writing the email…"
                      ) : (
                        "Searching job sources…"
                      )}
                    </p>
                  </div>
                  {!ACTIVE.includes(run.status) ? (
                    <button
                      type="button"
                      onClick={() => dismiss(run.id)}
                      aria-label="Dismiss"
                      className="rounded p-0.5 text-zinc-500 hover:text-zinc-200"
                    >
                      <X size={14} />
                    </button>
                  ) : null}
                </div>
              );
            })}
            {visible.some((r) => !ACTIVE.includes(r.status)) ? (
              <button
                type="button"
                onClick={dismissAll}
                className="mt-1 w-full rounded-lg px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-300"
              >
                Clear finished
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
