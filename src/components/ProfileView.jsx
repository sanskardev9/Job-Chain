"use client";

import {
  Briefcase, FileText, Github, Globe, GraduationCap, Languages, Linkedin, Loader2, MapPin, Pencil, Send,
} from "lucide-react";

const list = (text) => (text || "").split(",").map((s) => s.trim()).filter(Boolean);

function Card({ icon: Icon, title, onEdit, children }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          <Icon size={16} className="text-purple-300" /> {title}
        </h2>
        <button type="button" onClick={onEdit}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-purple-300 transition">
          <Pencil size={12} /> Edit
        </button>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

const Chips = ({ items, empty }) =>
  items.length ? (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span key={item} className="rounded-full border border-purple-500/40 bg-purple-500/10 px-2.5 py-1 text-xs text-purple-100">
          {item}
        </span>
      ))}
    </div>
  ) : (
    <p className="text-sm text-zinc-500">{empty}</p>
  );

const Row = ({ label, children }) => (
  <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
    <span className="text-zinc-500">{label}</span>
    <span className="text-right text-zinc-200">{children}</span>
  </div>
);

function experienceText(form) {
  const y = Number(form.experience_years_part) || 0;
  const m = Number(form.experience_months_part) || 0;
  if (!y && !m) return "Not set";
  return [y ? `${y} year${y === 1 ? "" : "s"}` : "", m ? `${m} month${m === 1 ? "" : "s"}` : ""].filter(Boolean).join(" ");
}

// Read-only profile for users who finished setup. Every card jumps to its tab in the form.
export default function ProfileView({ form, cv, gmail, levels, sendModes, message, cvOpening, onViewCv, onEdit }) {
  const name = form.preferred_name || "Your profile";
  const levelLabel = (code) => levels.find((l) => l.value === code)?.label || code;
  const mode = sendModes.find((m) => m.value === form.send_mode);

  return (
    <div className="max-w-3xl mx-auto py-4 space-y-4">
      {message ? (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</p>
      ) : null}

      <section className="rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-600/20 via-zinc-900 to-zinc-900 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-purple-600 text-2xl font-bold text-white">
            {name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-2xl font-bold text-white">{name}</h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-400">
              {form.role_family ? <span className="inline-flex items-center gap-1"><Briefcase size={14} /> {form.role_family}</span> : null}
              {form.current_base ? <span className="inline-flex items-center gap-1"><MapPin size={14} /> {form.current_base}</span> : null}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {form.github_url ? (
                <a href={form.github_url} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-purple-500 hover:text-purple-300 transition">
                  <Github size={14} /> GitHub
                </a>
              ) : null}
              {form.linkedin_url ? (
                <a href={form.linkedin_url} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-purple-500 hover:text-purple-300 transition">
                  <Linkedin size={14} /> LinkedIn
                </a>
              ) : null}
            </div>
          </div>
          <button type="button" onClick={() => onEdit("details")}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 font-semibold text-black hover:bg-purple-600 hover:text-white transition">
            <Pencil size={16} /> Edit profile
          </button>
        </div>
      </section>

      {/* Two columns that pack cards by height, so short cards don't leave empty boxes. */}
      <div className="gap-4 md:columns-2 [&>section]:mb-4 [&>section]:break-inside-avoid">
        <Card icon={Briefcase} title="Experience" onEdit={() => onEdit("details")}>
          <Row label="Your experience">{experienceText(form)}</Row>
          <Row label="Applies to jobs asking up to">
            {form.max_required_experience_years !== "" && form.max_required_experience_years != null
              ? `${form.max_required_experience_years} years`
              : "Only jobs you fully meet"}
          </Row>
          {form.education ? (
            <p className="mt-2 flex items-start gap-2 border-t border-zinc-800 pt-3 text-sm text-zinc-300">
              <GraduationCap size={16} className="mt-0.5 shrink-0 text-zinc-500" /> {form.education}
            </p>
          ) : null}
        </Card>

        <Card icon={FileText} title="CV" onEdit={() => onEdit("cv")}>
          {cv ? (
            <div className="flex items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5">
              <FileText size={18} className="shrink-0 text-red-300" />
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">{cv.filename}</span>
              <button type="button" onClick={onViewCv} disabled={cvOpening}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1 text-xs hover:border-purple-500 hover:text-purple-300 transition disabled:opacity-60">
                {cvOpening ? <Loader2 size={12} className="animate-spin" /> : null} View
              </button>
            </div>
          ) : (
            <p className="text-sm text-amber-300">No CV uploaded</p>
          )}
          <p className="mt-2 text-xs text-zinc-500">Attached to every application JobPilot sends.</p>
        </Card>

        <Card icon={Briefcase} title="Skills" onEdit={() => onEdit("details")}>
          <Chips items={list(form.skills)} empty="No skills yet" />
        </Card>

        <Card icon={Languages} title="Languages" onEdit={() => onEdit("details")}>
          <Chips
            items={(form.languages || []).filter((l) => l.language).map((l) => (l.level ? `${l.language} · ${levelLabel(l.level)}` : l.language))}
            empty="No languages yet"
          />
        </Card>

        <Card icon={Globe} title="What you're looking for" onEdit={() => onEdit("search")}>
          <Row label="Visa sponsorship">
            {form.needs_sponsorship === "true" ? "Needed" : form.needs_sponsorship === "false" ? "Not needed" : "Not set"}
          </Row>
          <p className="mt-2 text-xs text-zinc-500">Countries</p>
          <div className="mt-1"><Chips items={list(form.target_countries)} empty="All of Europe" /></div>
          <p className="mt-3 text-xs text-zinc-500">Job titles</p>
          <div className="mt-1"><Chips items={list(form.keywords)} empty="Frontend developer titles" /></div>
        </Card>

        <Card icon={Send} title="Gmail & sending" onEdit={() => onEdit("gmail")}>
          <Row label="Sends from">
            {gmail ? gmail.email : <span className="text-amber-300">Not connected</span>}
          </Row>
          <Row label="Mode">{mode?.label || form.send_mode}</Row>
          <Row label="Max emails per run">{form.max_sends_per_run}</Row>
        </Card>
      </div>
    </div>
  );
}
