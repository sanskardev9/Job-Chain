"use client";

import { useEffect, useState } from "react";
import { EmailMock, MatchesMock, SAMPLE_EMAIL, SearchMock, SentMock } from "./Mockups";

const SCENES = [
  { label: "Finds jobs", ms: 3200 },
  { label: "Checks the fit", ms: 3800 },
  { label: "Writes the email", ms: 5200 },
  { label: "You send it", ms: 3400 },
];

// A short looping "video" of JobPilot at work, built from the real screens' look.
export default function HeroDemo() {
  const [scene, setScene] = useState(0);
  const [typed, setTyped] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return undefined;
    const timer = setTimeout(() => setScene((s) => (s + 1) % SCENES.length), SCENES[scene].ms);
    return () => clearTimeout(timer);
  }, [scene, paused]);

  // Typing effect while the email scene plays.
  useEffect(() => {
    if (scene !== 2) {
      setTyped(0);
      return undefined;
    }
    const full = SAMPLE_EMAIL.subject.length + SAMPLE_EMAIL.body.length;
    const start = performance.now();
    let frame;
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / (SCENES[2].ms - 900));
      setTyped(Math.floor(progress * full));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [scene]);

  const subjectLen = SAMPLE_EMAIL.subject.length;

  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} className="relative">
      <div className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-purple-600/20 blur-3xl" />
      <div className="relative">
        <div key={scene} className="animate-[fadeUp_0.45s_ease-out]">
          {scene === 0 ? <SearchMock /> : null}
          {scene === 1 ? <MatchesMock /> : null}
          {scene === 2 ? (
            <EmailMock
              subject={SAMPLE_EMAIL.subject.slice(0, typed)}
              body={SAMPLE_EMAIL.body.slice(0, Math.max(0, typed - subjectLen))}
              cursor
            />
          ) : null}
          {scene === 3 ? <SentMock /> : null}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {SCENES.map((s, i) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setScene(i)}
              className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs transition ${
                i === scene
                  ? "border-purple-500 bg-purple-500/15 text-purple-200"
                  : "border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
              }`}
            >
              {i + 1}. {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
