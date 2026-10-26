"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Loader from "./Loader";

const FILTERS = ["draft", "approved", "sent", "rejected", "failed"];
const STATUS_STYLES = {
  draft: "bg-zinc-500/20 text-zinc-300 border-zinc-500/40",
  approved: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  sending: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  sent: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  rejected: "bg-red-500/20 text-red-300 border-red-500/40",
  failed: "bg-red-500/20 text-red-300 border-red-500/40",
};
export const LABEL_STYLES = {
  strong: "text-emerald-300",
  possible: "text-yellow-300",
  unlikely: "text-red-300",
};

const inputClass =
  "w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-600";

const inFilter = (draft, filter) =>
  filter === "sent" ? ["sent", "sending"].includes(draft.status) : draft.status === filter;

export default function DraftsPanel({ user, refreshKey = 0, onChange }) {
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState([]);
  const [filter, setFilter] = useState("draft");
  const [busyId, setBusyId] = useState("");
  const [errors, setErrors] = useState({});

  useEffect(() => {
    const loadDrafts = async () => {
      const { data, error } = await supabase
        .from("application_drafts")
        .select(
          "id, recipient, recipient_evidence, subject, body, cv_filename, status, approved_at, sent_at, error, created_at, " +
            "discovered_jobs(id, title, company, location, country, source, source_url, match_label, score, matched_skills, missing_skills, blockers, unknowns, deadline)"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to load drafts", error);
      }
      // Keep unsaved edits when refreshed by a finished run.
      setDrafts((prev) => {
        const dirty = Object.fromEntries(prev.filter((d) => d.dirty).map((d) => [d.id, d]));
        return (data || []).map((d) => dirty[d.id] || d);
      });
      setLoading(false);
    };

    loadDrafts();
  }, [user.id, refreshKey]);

  const setDraftField = (id, name, value) =>
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, [name]: value, dirty: true } : d)));

  const updateDraft = async (draft, values) => {
    setBusyId(draft.id);
    setErrors((prev) => ({ ...prev, [draft.id]: "" }));
    const { data, error } = await supabase
      .from("application_drafts")
      .update(values)
      .eq("id", draft.id)
      .eq("user_id", user.id)
      .select("status, approved_at, subject, body")
      .single();

    if (error) {
      console.error("Failed to update draft", error);
      setErrors((prev) => ({ ...prev, [draft.id]: error.message }));
    } else {
      setDrafts((prev) => prev.map((d) => (d.id === draft.id ? { ...d, ...data, dirty: false } : d)));
      onChange?.();
    }
    setBusyId("");
  };

  if (loading) {
    return (
      <div className="py-16 flex justify-center">
        <Loader size="lg" />
      </div>
    );
  }

  const counts = Object.fromEntries(FILTERS.map((f) => [f, drafts.filter((d) => inFilter(d, f)).length]));
  const visible = drafts.filter((d) => inFilter(d, filter));

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold capitalize transition ${
              filter === f
                ? "border-purple-500 text-purple-300 bg-purple-500/10"
                : "border-zinc-700 text-zinc-300 hover:border-purple-500 hover:text-purple-300"
            }`}
          >
            {f === "draft" ? "To review" : f} ({counts[f]})
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="mt-6 rounded-2xl text-center border border-zinc-800 bg-zinc-900 p-8 text-zinc-400">
          {filter === "draft"
            ? "Nothing to review. Click “Find jobs now” and drafts for good matches will appear here."
            : `No ${filter} drafts.`}
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {visible.map((draft) => {
            const job = draft.discovered_jobs || {};
            const editable = ["draft", "approved", "rejected"].includes(draft.status);
            const busy = busyId === draft.id;
            return (
              <div key={draft.id} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-lg">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-xl font-semibold">{job.title}</h2>
                    <p className="text-zinc-300">
                      {job.company} · {[job.location, job.country].filter(Boolean).join(", ")}
                    </p>
                    <p className="mt-1 text-sm">
                      <span className={`font-semibold capitalize ${LABEL_STYLES[job.match_label] || ""}`}>
                        {job.match_label} match
                      </span>
                      {job.score != null ? <span className="text-zinc-500"> · score {job.score}</span> : null}
                      {job.deadline ? <span className="text-zinc-500"> · apply by {job.deadline}</span> : null}
                    </p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${STATUS_STYLES[draft.status]}`}>
                    {draft.status}
                  </span>
                </div>

                {(job.unknowns || []).length ? (
                  <p className="mt-3 text-sm text-yellow-300/90">To check: {job.unknowns.join(" · ")}</p>
                ) : null}
                {(job.missing_skills || []).length ? (
                  <p className="mt-1 text-sm text-zinc-400">Skills you don&apos;t list: {job.missing_skills.join(", ")}</p>
                ) : null}

                <div className="mt-4 space-y-3">
                  <p className="text-sm text-zinc-300">
                    <span className="text-zinc-500">To:</span> {draft.recipient}
                    <span className="block text-xs text-zinc-500">Found in: {draft.recipient_evidence}</span>
                  </p>
                  <input
                    className={inputClass}
                    value={draft.subject}
                    disabled={!editable || busy}
                    onChange={(e) => setDraftField(draft.id, "subject", e.target.value)}
                  />
                  <textarea
                    className={`${inputClass} min-h-72 font-mono text-sm leading-relaxed`}
                    value={draft.body}
                    disabled={!editable || busy}
                    onChange={(e) => setDraftField(draft.id, "body", e.target.value)}
                  />
                  <p className="text-xs text-zinc-500">Attachment: {draft.cv_filename || "CV.pdf"}</p>
                </div>

                {draft.error ? <p className="mt-3 text-sm text-red-400">{draft.error}</p> : null}
                {errors[draft.id] ? <p className="mt-3 text-sm text-red-400">{errors[draft.id]}</p> : null}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <a
                    href={job.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold hover:bg-purple-600 transition"
                  >
                    View vacancy
                  </a>
                  {editable && draft.dirty ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => updateDraft(draft, { subject: draft.subject, body: draft.body })}
                      className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:border-purple-500 hover:text-purple-300 transition disabled:opacity-50"
                    >
                      Save changes
                    </button>
                  ) : null}
                  {editable && draft.status !== "approved" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => updateDraft(draft, { subject: draft.subject, body: draft.body, status: "approved" })}
                      className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-purple-600 hover:text-white transition disabled:opacity-50"
                    >
                      Approve to send
                    </button>
                  ) : null}
                  {draft.status === "approved" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => updateDraft(draft, { status: "draft" })}
                      className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:border-purple-500 hover:text-purple-300 transition disabled:opacity-50"
                    >
                      Undo approval
                    </button>
                  ) : null}
                  {editable && draft.status !== "rejected" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => updateDraft(draft, { status: "rejected" })}
                      className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:border-red-500 hover:text-red-300 transition disabled:opacity-50"
                    >
                      Reject
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
