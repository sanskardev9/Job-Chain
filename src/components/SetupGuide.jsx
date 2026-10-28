"use client";

import { Check, Loader2, Rocket } from "lucide-react";

// Profile set up as tabs: one step visible at a time. steps: [{ id, label, hint, done }]
// While setup is incomplete (or just finished) it also shows progress and the first-search button.
export default function SetupGuide({ steps, active, onSelect, showProgress, starting, onFinish }) {
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;

  return (
    <section className="max-w-3xl mx-auto mb-2 overflow-hidden rounded-2xl border border-purple-500/40 bg-gradient-to-br from-purple-600/20 via-zinc-900 to-zinc-900">
      <div className="p-4 sm:p-6">
        {showProgress ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-bold text-white">
                {allDone ? "You're all set 🎉" : doneCount === 0 ? "Let's get you started" : "Almost there"}
              </h2>
              <span className="text-sm text-purple-200">
                {doneCount} of {steps.length} done
              </span>
            </div>
            <p className="mt-1 text-sm text-zinc-400">
              {allDone
                ? "JobPilot knows what to look for. Run your first search and see which jobs fit you."
                : "Four quick steps, about five minutes. JobPilot only ever says what you tell it here."}
            </p>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-purple-500 transition-all duration-500"
                style={{ width: `${(doneCount / steps.length) * 100}%` }}
              />
            </div>
          </>
        ) : null}

        <div role="tablist" aria-label="Profile steps" className={`grid gap-2 grid-cols-2 lg:grid-cols-4 ${showProgress ? "mt-4" : ""}`}>
          {steps.map((step, index) => {
            const selected = step.id === active;
            return (
              <button
                key={step.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onSelect(step.id)}
                className={`flex h-full w-full items-start gap-2.5 rounded-xl border p-3 text-left transition ${
                  selected
                    ? "border-purple-500 bg-purple-500/15 ring-1 ring-purple-500/50"
                    : step.done
                      ? "border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/60"
                      : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-600"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    step.done ? "bg-emerald-500 text-black" : selected ? "bg-purple-500 text-white" : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {step.done ? <Check size={14} strokeWidth={3} /> : index + 1}
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm font-semibold ${selected ? "text-white" : step.done ? "text-emerald-200" : "text-zinc-200"}`}>
                    {step.label}
                  </span>
                  <span className="hidden sm:block text-xs text-zinc-500">{step.hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        {showProgress && allDone ? (
          <button
            type="button"
            onClick={onFinish}
            disabled={starting}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold text-black transition hover:bg-purple-600 hover:text-white disabled:opacity-60 sm:w-auto"
          >
            {starting ? <Loader2 size={18} className="animate-spin" /> : <Rocket size={18} />}
            {starting ? "Starting your search…" : "Find my first jobs"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
