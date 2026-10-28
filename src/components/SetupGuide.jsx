"use client";

import { Check, Loader2, Rocket } from "lucide-react";

const scrollTo = (id) => {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
};

// "Let's get started" checklist on the profile page. Shown until every step is done, then
// offers the first search. steps: [{ id, label, hint, done }]
export default function SetupGuide({ steps, starting, onFinish }) {
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  const next = steps.find((s) => !s.done);

  return (
    <section className="max-w-3xl mx-auto mb-2 overflow-hidden rounded-2xl border border-purple-500/40 bg-gradient-to-br from-purple-600/20 via-zinc-900 to-zinc-900">
      <div className="p-5 sm:p-6">
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
            : "Three quick steps, about five minutes. JobPilot only ever says what you tell it here."}
        </p>

        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full bg-purple-500 transition-all duration-500"
            style={{ width: `${(doneCount / steps.length) * 100}%` }}
          />
        </div>

        <ol className="mt-4 grid gap-2 sm:grid-cols-3">
          {steps.map((step, index) => {
            const current = step === next;
            return (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => scrollTo(step.id)}
                  className={`flex h-full w-full items-start gap-3 rounded-xl border p-3 text-left transition ${
                    step.done
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : current
                        ? "border-purple-500 bg-purple-500/10"
                        : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-600"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      step.done ? "bg-emerald-500 text-black" : current ? "bg-purple-500 text-white" : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {step.done ? <Check size={14} strokeWidth={3} /> : index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-sm font-semibold ${step.done ? "text-emerald-200" : "text-white"}`}>
                      {step.label}
                    </span>
                    <span className="block text-xs text-zinc-500">{step.hint}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        {allDone ? (
          <button
            type="button"
            onClick={onFinish}
            disabled={starting}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold text-black transition hover:bg-purple-600 hover:text-white disabled:opacity-60 sm:w-auto"
          >
            {starting ? <Loader2 size={18} className="animate-spin" /> : <Rocket size={18} />}
            {starting ? "Starting your search…" : "Find my first jobs"}
          </button>
        ) : next ? (
          <button
            type="button"
            onClick={() => scrollTo(next.id)}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 px-5 py-3 font-semibold text-white transition hover:bg-purple-500 sm:w-auto"
          >
            Next: {next.label} ↓
          </button>
        ) : null}
      </div>
    </section>
  );
}
