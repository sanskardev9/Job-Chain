"use client";

import { useEffect, useState } from "react";

// Namaste first and longest, then "Hello" in European languages (JobChain is about jobs anywhere in
// Europe), then a welcome.
const GREETINGS = ["नमस्ते", "Hello", "Hallo", "Bonjour", "Hola", "Ciao", "Hej", "Olá", "Cześć", "Hei", "Γεια σας"];
const FIRST_MS = 1000; // Namaste stays longest
const WORD_MS = 140;
const WELCOME_MS = 1100;
const LEAVE_MS = 900;

// When each word appears, and when the screen lifts and is gone (ms after the intro started).
const SCHEDULE = (() => {
  const words = [0];
  let at = FIRST_MS;
  for (let i = 1; i < GREETINGS.length; i += 1) {
    words.push(at);
    at += WORD_MS;
  }
  words.push(at); // the welcome
  return { words, leave: at + WELCOME_MS, done: at + WELCOME_MS + LEAVE_MS };
})();

// When the intro started in this page load. A module variable: it survives React re-running effects
// and moving between pages, and resets on every refresh, so the intro plays once per page load.
let startedAt = null;
const finished = () => startedAt !== null && performance.now() - startedAt >= SCHEDULE.done;

// A short greeting screen on every full load of Home. It slides up with a curved edge to reveal the
// page. Skipped for people who prefer reduced motion.
export default function IntroScreen() {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState(() => (typeof window !== "undefined" && finished() ? "done" : "words"));

  useEffect(() => {
    if (finished() || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase("done");
      return undefined;
    }
    if (startedAt === null) startedAt = performance.now();
    const elapsed = performance.now() - startedAt;
    const later = (at, fn) => setTimeout(fn, Math.max(at - elapsed, 0));

    document.documentElement.style.overflow = "hidden";
    const timers = SCHEDULE.words.map((at, i) => later(at, () => setIndex(i)));
    timers.push(later(SCHEDULE.leave, () => setPhase("leaving")));
    timers.push(later(SCHEDULE.done, () => {
      setPhase("done");
      document.documentElement.style.overflow = "";
    }));
    return () => {
      timers.forEach(clearTimeout);
      document.documentElement.style.overflow = "";
    };
  }, []);

  if (phase === "done") return null;
  const welcome = index >= GREETINGS.length;

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950 px-6 transition-transform duration-[900ms] ease-[cubic-bezier(0.76,0,0.24,1)] ${
        phase === "leaving" ? "-translate-y-full" : "translate-y-0"
      }`}
    >
      {/* Curved bottom edge: bulges down while the screen lifts away. */}
      <span
        className={`absolute left-[-10%] top-full h-40 w-[120%] -translate-y-1/2 rounded-[50%] bg-zinc-950 transition-transform duration-[900ms] ease-[cubic-bezier(0.76,0,0.24,1)] ${
          phase === "leaving" ? "scale-y-100" : "scale-y-0"
        }`}
      />
      <p
        key={welcome ? "welcome" : "hello"}
        className={`flex items-center gap-3 text-center font-semibold text-white transition-opacity duration-300 ${
          welcome ? "animate-[fadeUp_0.5s_ease-out] text-3xl sm:text-5xl" : index === 0 ? "text-5xl sm:text-7xl" : "text-4xl sm:text-6xl"
        } ${phase === "leaving" ? "opacity-0" : "opacity-100"}`}
      >
        <span className="h-3 w-3 shrink-0 rounded-full bg-purple-400 shadow-[0_0_14px_rgba(192,132,252,0.9)] sm:h-4 sm:w-4" />
        {welcome ? (
          <span>
            Welcome to <span className="text-purple-400">JobChain</span>
          </span>
        ) : (
          GREETINGS[index]
        )}
      </p>
    </div>
  );
}
