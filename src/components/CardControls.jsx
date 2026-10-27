"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark, MoreHorizontal } from "lucide-react";

// Corner bookmark toggle, same look as the old job cards.
export function BookmarkToggle({ saved, disabled, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={saved}
      aria-label={saved ? "Remove bookmark" : "Bookmark this job"}
      title={saved ? "Remove bookmark" : "Bookmark to apply later"}
      className={`absolute top-0 right-4 transition disabled:opacity-50 cursor-pointer ${
        saved ? "text-purple-400" : "text-zinc-500 hover:text-purple-300"
      }`}
    >
      <Bookmark size={30} strokeWidth={1.75} fill={saved ? "currentColor" : "none"} />
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
        <div className="absolute bottom-full right-0 z-30 mb-2 w-44 rounded-xl border border-zinc-700 bg-zinc-900 p-1 shadow-xl">
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
