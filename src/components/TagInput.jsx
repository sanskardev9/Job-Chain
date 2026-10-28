"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";

const split = (text) => (text || "").split(",").map((s) => s.trim()).filter(Boolean);
const same = (a, b) => a.toLowerCase() === b.toLowerCase();

// Searchable chip input: pick from suggestions or type your own and press Enter.
// value / onChange use a comma-separated string so forms can keep storing text.
// allowCustom=false limits choices to the suggestions.
export default function TagInput({ value, onChange, suggestions = [], placeholder = "Type to search…", label, allowCustom = true }) {
  const tags = split(value);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const matches = useMemo(() => {
    const q = text.trim().toLowerCase();
    const left = suggestions.filter((s) => !tags.some((t) => same(t, s)));
    if (!q) return left;
    // Words starting with the query first, then any other match.
    const starts = left.filter((s) => s.toLowerCase().split(/[\s/-]+/).some((w) => w.startsWith(q)) || s.toLowerCase().startsWith(q));
    return [...starts, ...left.filter((s) => s.toLowerCase().includes(q) && !starts.includes(s))];
  }, [text, suggestions, value]); // eslint-disable-line react-hooks/exhaustive-deps

  const typed = text.trim();
  const canAddTyped = allowCustom && typed && !tags.some((t) => same(t, typed)) && !matches.some((m) => same(m, typed));
  const items = [...matches, ...(canAddTyped ? [typed] : [])];

  const setTags = (next) => onChange(next.join(", "));
  const add = (tag) => {
    const clean = tag.trim().replace(/,/g, "");
    if (clean && !tags.some((t) => same(t, clean))) setTags([...tags, clean]);
    setText("");
    setActive(0);
    inputRef.current?.focus();
  };
  const remove = (tag) => setTags(tags.filter((t) => t !== tag));

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      setOpen(false);
      // Keep anything typed but not confirmed, so it isn't lost.
      const pending = allowCustom && inputRef.current?.value.trim().replace(/,/g, "");
      if (pending && !split(value).some((t) => same(t, pending))) onChange([...split(value), pending].join(", "));
      setText("");
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, value, onChange, allowCustom]);

  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const onKeyDown = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (open && items[active]) add(items[active]);
      else if (typed && allowCustom) add(typed);
    } else if (e.key === "Backspace" && !text && tags.length) {
      remove(tags[tags.length - 1]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <div
        onClick={() => inputRef.current?.focus()}
        className={`flex min-h-[3.25rem] w-full cursor-text flex-wrap items-center gap-1.5 rounded-xl border bg-zinc-950 px-3 py-2 transition ${
          open ? "border-purple-500 ring-2 ring-purple-600" : "border-zinc-700 hover:border-zinc-500"
        }`}
      >
        {tags.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-purple-500/50 bg-purple-500/15 py-1 pl-3 pr-1.5 text-sm text-purple-100">
            {tag}
            <button type="button" aria-label={`Remove ${tag}`} onClick={() => remove(tag)}
              className="rounded-full p-0.5 text-purple-300 hover:bg-purple-500/30 hover:text-white">
              <X size={13} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={text}
          aria-label={label}
          onChange={(e) => {
            setText(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={tags.length ? "Add more…" : placeholder}
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-white placeholder-zinc-500 focus:outline-none"
        />
      </div>

      {open && !items.length && typed && !allowCustom ? (
        <p className="absolute left-0 right-0 z-30 mt-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-400 shadow-2xl shadow-black/60">
          No match. Only the countries in the list are covered for now.
        </p>
      ) : null}
      {open && items.length ? (
        <ul ref={listRef} role="listbox"
          className="absolute left-0 right-0 z-30 mt-2 max-h-64 overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-1.5 shadow-2xl shadow-black/60">
          {items.map((item, index) => {
            const custom = canAddTyped && index === items.length - 1;
            return (
              <li key={`${item}-${custom}`} role="option" aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(item)}
                className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                  index === active ? "bg-purple-500/15 text-white" : "text-zinc-200"
                }`}>
                {custom ? (
                  <>
                    <Plus size={14} className="text-purple-300" /> Add “{item}”
                  </>
                ) : (
                  item
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
