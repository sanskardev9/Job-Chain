"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Globe, Search } from "lucide-react";

// Checkbox list of countries for one search. Starts from the user's profile countries; changes here
// only affect this search (the profile is edited on the Profile page). Empty selection = all countries.
export default function CountryPicker({ options, profileCountries = [], value, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const escape = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  // Profile countries first, then the rest alphabetically.
  const ordered = useMemo(() => {
    const mine = profileCountries.filter((c) => options.includes(c));
    return [...mine, ...options.filter((c) => !mine.includes(c))];
  }, [options, profileCountries]);
  const shown = ordered.filter((c) => c.toLowerCase().includes(query.trim().toLowerCase()));

  const toggle = (country) =>
    onChange(value.includes(country) ? value.filter((c) => c !== country) : [...value, country]);
  const sameAsProfile =
    value.length === profileCountries.length && profileCountries.every((c) => value.includes(c));

  const label = !value.length
    ? "All countries"
    : value.length === 1
      ? value[0]
      : sameAsProfile
        ? `Your countries (${value.length})`
        : `${value.length} countries`;

  return (
    <div ref={rootRef} className="relative w-full sm:w-56 shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex h-full w-full items-center justify-between gap-2 rounded-xl border bg-zinc-900 px-3 py-3 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-purple-600 ${
          open ? "border-purple-500" : "border-zinc-700 hover:border-zinc-500"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Globe size={15} className="shrink-0 text-zinc-400" />
          <span className="truncate text-white">{label}</span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-full min-w-[17rem] rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl shadow-black/60">
          <div className="border-b border-zinc-800 p-2">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a country"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 py-1.5 pl-8 pr-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-purple-600"
              />
            </div>
            <div className="mt-2 flex gap-1.5 text-xs">
              {profileCountries.length ? (
                <button type="button" onClick={() => onChange(profileCountries)}
                  className={`rounded-md border px-2 py-1 transition ${sameAsProfile ? "border-purple-500 bg-purple-500/15 text-purple-100" : "border-zinc-700 text-zinc-300 hover:border-zinc-500"}`}>
                  Your countries
                </button>
              ) : null}
              <button type="button" onClick={() => onChange([])}
                className={`rounded-md border px-2 py-1 transition ${!value.length ? "border-purple-500 bg-purple-500/15 text-purple-100" : "border-zinc-700 text-zinc-300 hover:border-zinc-500"}`}>
                All of Europe
              </button>
            </div>
          </div>
          <ul role="listbox" aria-multiselectable="true" className="max-h-64 overflow-y-auto p-1.5">
            {shown.map((country) => {
              const checked = value.includes(country);
              return (
                <li key={country}>
                  <button type="button" role="option" aria-selected={checked} onClick={() => toggle(country)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm text-zinc-200 hover:bg-purple-500/10">
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? "border-purple-500 bg-purple-600" : "border-zinc-600"}`}>
                      {checked ? <Check size={12} className="text-white" strokeWidth={3} /> : null}
                    </span>
                    <span className="flex-1">{country}</span>
                    {profileCountries.includes(country) ? (
                      <span className="text-[10px] uppercase tracking-wide text-zinc-500">profile</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
            {!shown.length ? <li className="px-3 py-2 text-sm text-zinc-500">No country matches “{query}”.</li> : null}
          </ul>
          <p className="border-t border-zinc-800 px-3 py-2 text-[11px] text-zinc-500">
            Only changes this search. Your profile countries stay as they are.
          </p>
        </div>
      ) : null}
    </div>
  );
}
