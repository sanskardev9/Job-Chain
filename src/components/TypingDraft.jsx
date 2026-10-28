"use client";

import { useEffect, useRef, useState } from "react";

const SEEN_KEY = "jobchain:drafts-typed";
const FRESH_MS = 15 * 60 * 1000;

// Drafts written in the last few minutes that this browser has not shown yet get the typing effect once.
export function shouldType(draft) {
  if (draft.status !== "draft" || Date.now() - new Date(draft.created_at).getTime() > FRESH_MS) return false;
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  try {
    return !(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]")).includes(draft.id);
  } catch {
    return false;
  }
}

export function markTyped(id) {
  try {
    const seen = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen.filter((x) => x !== id), id].slice(-200)));
  } catch {
    // Storage unavailable: the effect may simply play again.
  }
}

// Types the subject, then the body, with a blinking cursor; calls onDone at the end.
export default function TypingDraft({ subject, body, inputClass, onDone }) {
  const [shown, setShown] = useState(0);
  const total = subject.length + body.length;
  // Latest callback without restarting the animation when the parent re-renders.
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    // About 2.5-4.5 s whatever the length, in small irregular steps so it reads like typing.
    const duration = Math.min(4500, Math.max(2500, total * 6));
    const start = performance.now();
    let frame;
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 1.6;
      setShown(Math.floor(eased * total));
      if (progress < 1) frame = requestAnimationFrame(tick);
      else done.current();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [total]);

  const subjectShown = subject.slice(0, shown);
  const bodyShown = body.slice(0, Math.max(0, shown - subject.length));
  const cursor = <span className="ml-px inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-purple-400 align-baseline" />;

  return (
    <div className="space-y-3" aria-live="polite">
      <p className="inline-flex items-center gap-2 rounded-full border border-purple-500/40 bg-purple-500/10 px-3 py-1 text-xs font-semibold text-purple-200">
        <span className="h-2 w-2 animate-ping rounded-full bg-purple-400" />
        ✨ JobPilot is writing your email…
      </p>
      <div className={`${inputClass} min-h-[3rem]`}>
        {subjectShown}
        {shown < subject.length ? cursor : null}
      </div>
      <div className={`${inputClass} min-h-72 whitespace-pre-wrap font-mono text-sm leading-relaxed`}>
        {bodyShown}
        {shown >= subject.length ? cursor : null}
      </div>
    </div>
  );
}
