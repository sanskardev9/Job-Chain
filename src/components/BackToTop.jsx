"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

// Appears after scrolling about two screens down; glides back to the top. Bottom centre, so it never
// covers the activity tray in the corner.
export default function BackToTop() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > window.innerHeight * 1.5);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toTop = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label="Back to top"
      tabIndex={shown ? 0 : -1}
      className={`fixed bottom-5 left-1/2 z-[55] flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900/90 px-4 py-2 text-sm font-semibold text-zinc-200 shadow-xl shadow-black/40 backdrop-blur transition-all duration-300 hover:border-purple-500 hover:text-white ${
        shown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
      }`}
    >
      <ArrowUp size={16} /> Top
    </button>
  );
}
