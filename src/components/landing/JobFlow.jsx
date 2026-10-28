// Jobs flowing into JobPilot: postings glide in from the left into the JobPilot icon, and come out on
// the right as matches (or skipped). Pure CSS animation (keyframes in globals.css), smooth on phones.
import { Check, X, Zap } from "lucide-react";

const INCOMING = [
  ["Frontend Developer", "Berlin", "DE"],
  ["React Developer", "Amsterdam", "NL"],
  ["Web Developer", "Vienna", "AT"],
  ["UI Engineer", "Helsinki", "FI"],
  ["JavaScript Developer", "Lyon", "FR"],
];
const OUTGOING = [
  { title: "Frontend Developer", label: "Strong match", good: true },
  { title: "Senior Go Engineer", label: "Skipped", good: false },
  { title: "React Developer", label: "Possible match", good: true },
  { title: "Web Developer", label: "Strong match", good: true },
];
const LANES = ["8%", "28%", "48%", "68%", "86%"];
const CYCLE = 7.5; // seconds for one card to cross

export default function JobFlow() {
  return (
    <div className="relative grid h-72 grid-cols-[1fr_auto_1fr] items-center gap-2 sm:h-80 sm:gap-6">
      {/* In: postings travelling right, towards the icon. */}
      <div className="flow-track relative h-full overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_20%,black)]">
        {INCOMING.map(([title, city, code], i) => (
          <span key={title} className="flow-in absolute right-0 flex max-w-[9.5rem] items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-[11px] text-zinc-200 shadow-lg sm:max-w-none sm:px-3 sm:text-xs"
            style={{ top: LANES[i], animationDelay: `${(-CYCLE / INCOMING.length) * i}s`, animationDuration: `${CYCLE}s` }}>
            <span className="rounded bg-zinc-800 px-1 font-mono text-[9px] text-zinc-400">{code}</span>
            <span className="truncate">{title}</span>
            <span className="hidden text-zinc-500 sm:inline">· {city}</span>
          </span>
        ))}
      </div>

      {/* JobPilot in the middle. */}
      <div className="relative flex h-16 w-16 items-center justify-center sm:h-20 sm:w-20">
        <span className="absolute inset-0 animate-ping rounded-full bg-purple-500/20 [animation-duration:2.4s]" />
        <span className="absolute -inset-3 rounded-full bg-purple-600/20 blur-xl" />
        <span className="relative flex h-full w-full items-center justify-center rounded-2xl bg-purple-600 shadow-[0_0_30px_rgba(168,85,247,0.6)]">
          <Zap size={28} className="fill-current text-white" />
        </span>
        <span className="absolute -bottom-7 whitespace-nowrap text-xs font-semibold text-purple-300">JobPilot</span>
      </div>

      {/* Out: checked jobs leaving to the right. */}
      <div className="flow-track relative h-full overflow-hidden [mask-image:linear-gradient(90deg,black,black_80%,transparent)]">
        {OUTGOING.map(({ title, label, good }, i) => (
          <span key={`${title}-${label}`}
            className={`flow-out absolute left-0 flex max-w-[9.5rem] items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] shadow-lg sm:max-w-none sm:px-3 sm:text-xs ${
              good ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-zinc-800 bg-zinc-900/60 text-zinc-500"
            }`}
            style={{ top: LANES[i + 1] ?? LANES[0], animationDelay: `${(-CYCLE / OUTGOING.length) * i - CYCLE / 2}s`, animationDuration: `${CYCLE}s` }}>
            {good ? <Check size={12} className="shrink-0" /> : <X size={12} className="shrink-0" />}
            <span className="truncate font-semibold">{label}</span>
            <span className="hidden truncate opacity-70 sm:inline">· {title}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
