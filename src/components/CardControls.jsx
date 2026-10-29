"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark, MoreHorizontal } from "lucide-react";

// Corner bookmark toggle, same look and click animation as the original job cards.
export function BookmarkToggle({ saved, disabled, onToggle }) {
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (!pulse) return undefined;
    const timer = setTimeout(() => setPulse(false), 260);
    return () => clearTimeout(timer);
  }, [pulse]);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        setPulse(true);
        onToggle();
      }}
      aria-pressed={saved}
      aria-label={saved ? "Remove bookmark" : "Bookmark job"}
      title={saved ? "Remove bookmark" : "Bookmark to apply later"}
      className={`absolute top-0 right-0 transition disabled:opacity-50 cursor-pointer ${
        saved ? "text-purple-500" : "text-zinc-400 hover:text-purple-400"
      } ${pulse ? "scale-125 -rotate-6" : "scale-100 rotate-0"}`}
    >
      <Bookmark
        size={30}
        className={`transition-all duration-200 ${saved ? "fill-current drop-shadow-[0_0_10px_rgba(168,85,247,0.7)]" : ""}`}
      />
    </button>
  );
}

// Small "⋯" menu for secondary actions. items: [{ label, onClick, tone: "danger" | "success" }]
export function MoreMenu({ items, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="relative ml-auto" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        aria-label="More actions"
        className="rounded-lg border border-zinc-700 p-1.5 text-zinc-300 hover:border-purple-500 hover:text-purple-300 transition disabled:opacity-50"
      >
        <MoreHorizontal size={18} />
      </button>
      {open ? (
        <div className="absolute bottom-full right-0 z-30 mb-2 w-max min-w-[11rem] rounded-xl border border-zinc-700 bg-zinc-900 p-1 shadow-xl">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={`block w-full whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition hover:bg-zinc-800 ${
                item.tone === "danger" ? "text-red-300" : item.tone === "success" ? "text-emerald-300" : "text-zinc-200"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
