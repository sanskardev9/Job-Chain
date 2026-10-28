"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

// Dark-themed dropdown for picking a language level. options: [{ value, label, hint }]
export default function LevelSelect({ options, value, onChange, placeholder = "Choose your level" }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const chosen = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const toggle = () => {
    setActive(Math.max(options.findIndex((o) => o.value === value), 0));
    setOpen((o) => !o);
  };

  const pick = (option) => {
    onChange(option.value);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        toggle();
      }
      return;
    }
    if (e.key === "Escape" || e.key === "Tab") setOpen(false);
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(options[active]);
    }
  };

  return (
    <div ref={rootRef} className="relative w-full sm:w-64 shrink-0">
      <button
        type="button"
        onClick={toggle}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex h-full w-full items-center justify-between gap-2 rounded-xl border bg-zinc-950 px-4 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-purple-600 ${
          open ? "border-purple-500" : "border-zinc-700 hover:border-zinc-500"
        }`}
      >
        <span className="min-w-0">
          {chosen ? (
            <>
              <span className="block truncate text-sm font-semibold text-white">{chosen.label}</span>
              <span className="block truncate text-xs text-zinc-500">{chosen.hint}</span>
            </>
          ) : (
            <span className="text-zinc-500">{placeholder}</span>
          )}
        </span>
        <ChevronDown size={16} className={`shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute right-0 z-30 mt-2 max-h-80 w-full min-w-[17rem] overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-1.5 shadow-2xl shadow-black/60"
        >
          {options.map((option, index) => {
            const selected = option.value === value;
            return (
              <li
                key={option.value}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(option)}
                className={`flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 transition ${
                  index === active ? "bg-purple-500/15" : ""
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-semibold ${selected ? "text-purple-200" : "text-white"}`}>
                    {option.label}
                  </span>
                  <span className="block text-xs text-zinc-400">{option.hint}</span>
                </span>
                {selected ? <Check size={16} className="mt-0.5 shrink-0 text-purple-300" /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
