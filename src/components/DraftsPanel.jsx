"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Loader from "./Loader";
import Select from "./Select";
import TypingDraft, { markTyped, shouldType } from "./TypingDraft";
import { jobDates } from "../lib/dates";
import { startGmailConnect } from "../lib/gmailClient";

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

const gmailAuthFailed = (error = "") => /gmail access expired|gmail.*revoked|invalid_grant/i.test(error);
const validEmail = (email = "") => /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(email.trim());

export default function DraftsPanel({ user, refreshKey = 0, initialFilter = "draft", onChange, onSend, sendBlocked }) {
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState([]);
  const [filter, setFilter] = useState(FILTERS.includes(initialFilter) ? initialFilter : "draft");
  const [busyId, setBusyId] = useState("");
  const [errors, setErrors] = useState({});
  const [selected, setSelected] = useState([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [gmailBusy, setGmailBusy] = useState(false);
  const [gmailReconnected] = useState(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("gmail") === "connected"
  );
  // Draft ids currently playing the typing effect.
  const [typing, setTyping] = useState([]);

  useEffect(() => {
    if (FILTERS.includes(initialFilter)) setFilter(initialFilter);
  }, [initialFilter]);

  useEffect(() => {
    const loadDrafts = async () => {
      const { data, error } = await supabase
        .from("application_drafts")
        .select(
          "id, recipient, recipient_evidence, subject, body, cv_filename, status, approved_at, sent_at, error, created_at, " +
            "discovered_jobs(id, title, company, location, country, source, source_url, match_label, score, matched_skills, missing_skills, required_skills, nice_to_have_skills, blockers, unknowns, deadline, posted_at)"
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
      const fresh = (data || []).filter(shouldType).map((d) => d.id);
      if (fresh.length) {
        fresh.forEach(markTyped);
        setTyping((prev) => [...new Set([...prev, ...fresh])]);
      }
      setLoading(false);
    };

    loadDrafts();
  }, [user.id, refreshKey]);

  const finishTyping = useCallback((id) => setTyping((prev) => prev.filter((x) => x !== id)), []);

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
      .select("status, approved_at, subject, body, recipient, error")
      .single();

    if (error) {
      console.error("Failed to update draft", error);
      setErrors((prev) => ({ ...prev, [draft.id]: error.message }));
    } else {
      setDrafts((prev) => prev.map((d) => (d.id === draft.id ? { ...d, ...data, dirty: false } : d)));
      onChange?.();
    }
    setBusyId("");
    return !error;
  };

  // Approves this draft and starts a send run right away (it sends all approved drafts, up to the cap).
  const approveAndSend = async (draft) => {
    const values = draft.status === "approved" ? null : { subject: draft.subject, body: draft.body, status: "approved" };
    if (values && !(await updateDraft(draft, values))) return;
    onSend?.();
    window.dispatchEvent(new CustomEvent("jobchain:run-started"));
  };

  const retryFailed = async (draft) => {
    const recipient = draft.recipient.trim();
    if (!validEmail(recipient)) {
      setErrors((prev) => ({ ...prev, [draft.id]: "Enter a valid recipient email before retrying." }));
      return;
    }
    if (!(await updateDraft(draft, { recipient, status: "approved", error: null }))) return;
    onSend?.();
    window.dispatchEvent(new CustomEvent("jobchain:run-started"));
  };

  const retryFailedBatch = async (chosen) => {
    if (!chosen.length) return;
    const invalid = chosen.filter((draft) => !validEmail(draft.recipient));
    if (invalid.length) {
      setBulkError(`Fix ${invalid.length} invalid recipient email${invalid.length === 1 ? "" : "s"} before retrying.`);
      setErrors((prev) => ({
        ...prev,
        ...Object.fromEntries(invalid.map((draft) => [draft.id, "Enter a valid recipient email before retrying."])),
      }));
      return;
    }

    setBulkBusy(true);
    setBulkError("");
    const results = await Promise.all(
      chosen.map((draft) =>
        supabase
          .from("application_drafts")
          .update({ recipient: draft.recipient.trim(), status: "approved", error: null })
          .eq("id", draft.id)
          .eq("user_id", user.id)
          .eq("status", "failed")
          .select("id, status, approved_at, recipient, error")
          .single()
      )
    );
    const failedResults = results.filter((result) => result.error);
    const updated = Object.fromEntries(results.flatMap((result) => result.data ? [[result.data.id, result.data]] : []));

    if (failedResults.length) {
      console.error("Failed to retry drafts", failedResults[0].error);
      setBulkError(`${failedResults.length} email${failedResults.length === 1 ? "" : "s"} could not be queued: ${failedResults[0].error.message}`);
    }
    setDrafts((prev) => prev.map((draft) => updated[draft.id] ? { ...draft, ...updated[draft.id], dirty: false } : draft));
    setSelected((prev) => prev.filter((id) => !updated[id]));
    setBulkBusy(false);
    onChange?.();
    if (Object.keys(updated).length) {
      onSend?.();
      window.dispatchEvent(new CustomEvent("jobchain:run-started"));
    }
  };

  const reconnectGmail = async () => {
    setGmailBusy(true);
    setBulkError("");
    try {
      await startGmailConnect("/jobpilot?tab=drafts&gmail=connected");
    } catch (error) {
      setBulkError(error.message);
      setGmailBusy(false);
    }
  };

  const toggleSelected = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const bulkUpdate = async (status) => {
    const chosen = drafts.filter((d) => selected.includes(d.id) && d.status === "draft");
    if (!chosen.length) return;
    setBulkBusy(true);
    setBulkError("");
    const columns = "id, status, approved_at, subject, body";
    // Edited drafts keep their edits; the rest go in one request.
    const clean = chosen.filter((d) => !d.dirty).map((d) => d.id);
    const results = await Promise.all([
      ...(clean.length
        ? [supabase.from("application_drafts").update({ status }).in("id", clean).eq("user_id", user.id).select(columns)]
        : []),
      ...chosen
        .filter((d) => d.dirty)
        .map((d) =>
          supabase
            .from("application_drafts")
            .update({ subject: d.subject, body: d.body, status })
            .eq("id", d.id)
            .eq("user_id", user.id)
            .select(columns)
        ),
    ]);

    const failed = results.find((r) => r.error);
    if (failed) {
      console.error("Failed to update drafts", failed.error);
      setBulkError(failed.error.message);
    }
    const updated = Object.fromEntries(results.flatMap((r) => r.data || []).map((d) => [d.id, d]));
    setDrafts((prev) => prev.map((d) => (updated[d.id] ? { ...d, ...updated[d.id], dirty: false } : d)));
    setSelected((prev) => prev.filter((id) => !updated[id]));
    onChange?.();
    setBulkBusy(false);
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
  const selectable = ["draft", "failed"].includes(filter) ? visible.map((d) => d.id) : [];
  const selectedVisible = selected.filter((id) => selectable.includes(id));
  const allSelected = selectable.length > 0 && selectedVisible.length === selectable.length;
  const failedNeedsReconnect = filter === "failed" && visible.some((draft) => gmailAuthFailed(draft.error)) && !gmailReconnected;

  return (
    <div>
      <div className="sm:hidden">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Show applications</span>
        <Select
          label="Show applications"
          value={filter}
          onChange={setFilter}
          className="w-full min-h-12"
          options={FILTERS.map((f) => ({
            value: f,
            label: `${f === "draft" ? "To review" : f[0].toUpperCase() + f.slice(1)} (${counts[f]})`,
          }))}
        />
      </div>
      <div className="hidden gap-2 sm:flex sm:flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`shrink-0 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-semibold capitalize transition ${
              filter === f
                ? "border-purple-500 text-purple-300 bg-purple-500/10"
                : "border-zinc-700 text-zinc-300 hover:border-purple-500 hover:text-purple-300"
            }`}
          >
            {f === "draft" ? "To review" : f} ({counts[f]})
          </button>
        ))}
      </div>

      {selectable.length ? (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900 p-3 sm:flex sm:flex-wrap sm:items-center sm:gap-3 sm:px-4">
          <div className="flex items-center justify-between gap-3">
          <label className="flex min-h-10 items-center gap-2 text-sm text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 accent-purple-600"
              checked={allSelected}
              disabled={bulkBusy}
              onChange={() => setSelected(allSelected ? [] : selectable)}
            />
            Select all ({selectable.length})
          </label>
          <span className="text-sm text-zinc-500">{selectedVisible.length} selected</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:ml-auto sm:mt-0 sm:flex sm:flex-wrap">
            {filter === "failed" ? (
              failedNeedsReconnect ? (
                <button type="button" disabled={gmailBusy} onClick={reconnectGmail}
                  className="col-span-2 min-h-11 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-purple-600 hover:text-white disabled:opacity-50 whitespace-nowrap">
                  {gmailBusy ? "Opening Google..." : "Reconnect Gmail to retry"}
                </button>
              ) : (
                <>
                  <button type="button" disabled={bulkBusy || Boolean(sendBlocked)}
                    onClick={() => retryFailedBatch(visible)}
                    className="col-span-2 min-h-11 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500 disabled:opacity-50 whitespace-nowrap sm:col-auto">
                    {bulkBusy ? "Retrying…" : `Retry all ${visible.length}`}
                  </button>
                  <button type="button"
                    disabled={bulkBusy || !selectedVisible.length || Boolean(sendBlocked)}
                    onClick={() => retryFailedBatch(visible.filter((draft) => selectedVisible.includes(draft.id)))}
                    className="min-h-11 rounded-lg border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-50 whitespace-nowrap sm:px-4">
                    Retry selected ({selectedVisible.length})
                  </button>
                </>
              )
            ) : (
              <>
                <button type="button" disabled={bulkBusy || !selectedVisible.length}
                  onClick={() => bulkUpdate("approved")}
                  className="min-h-11 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black transition hover:bg-purple-600 hover:text-white disabled:opacity-50 whitespace-nowrap sm:px-4">
                  Approve selected ({selectedVisible.length})
                </button>
                <button type="button" disabled={bulkBusy || !selectedVisible.length}
                  onClick={() => bulkUpdate("rejected")}
                  className="min-h-11 rounded-lg border border-zinc-700 px-3 py-2 text-sm transition hover:border-red-500 hover:text-red-300 disabled:opacity-50 whitespace-nowrap sm:px-4">
                  Reject selected
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
      {selectable.length && sendBlocked ? <p className="mt-2 text-xs text-zinc-500">Sending is unavailable: {sendBlocked}.</p> : null}
      {bulkError ? <p className="mt-3 text-sm text-red-400">{bulkError}</p> : null}
      {gmailReconnected && filter === "failed" ? (
        <p className="mt-3 text-sm text-emerald-400">Gmail reconnected. You can retry the failed emails now.</p>
      ) : null}

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
            const retryable = draft.status === "failed";
            const reconnectRequired = retryable && gmailAuthFailed(draft.error) && !gmailReconnected;
            const busy = busyId === draft.id;
            return (
              <div key={draft.id} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-6 shadow-lg">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  {selectable.includes(draft.id) ? (
                    <input
                      type="checkbox"
                      aria-label={`Select ${job.title}`}
                      className="mt-2 h-4 w-4 accent-purple-600 cursor-pointer"
                      checked={selected.includes(draft.id)}
                      disabled={bulkBusy}
                      onChange={() => toggleSelected(draft.id)}
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg sm:text-xl font-semibold break-words">{job.title}</h2>
                    <p className="text-zinc-300">
                      {/^(siehe beschreibung|see description|confidential)$/i.test((job.company || "").trim()) ? "Employer not named" : job.company} · {[job.location, job.country].filter(Boolean).join(", ")}
                    </p>
                    <p className="mt-1 text-sm">
                      <span className={`font-semibold capitalize ${LABEL_STYLES[job.match_label] || ""}`}>
                        {job.match_label} match
                      </span>
                      {job.score != null ? <span className="text-zinc-500"> · score {job.score}</span> : null}
                      {job.posted_at || job.deadline ? (
                        <span className="text-zinc-500"> · {jobDates(job.posted_at, job.deadline)}</span>
                      ) : null}
                    </p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${STATUS_STYLES[draft.status]}`}>
                    {draft.status}
                  </span>
                </div>

                {(job.blockers || []).length ? (
                  <p className="mt-3 text-sm text-red-300">Why it may not fit: {job.blockers.join(" · ")}</p>
                ) : null}
                {(job.unknowns || []).length ? (
                  <p className={`${(job.blockers || []).length ? "mt-1" : "mt-3"} text-sm text-yellow-300/90`}>
                    To check: {job.unknowns.join(" · ")}
                  </p>
                ) : null}
                {(job.required_skills || []).length ? (
                  <p className="mt-1 text-sm text-zinc-400">
                    <span className="text-zinc-500">Required: </span>
                    {job.required_skills.map((skill, i) => (
                      <span key={skill}>
                        {i ? ", " : ""}
                        <span className={(job.missing_skills || []).includes(skill) ? "text-red-300/90" : "text-emerald-300/90"}>{skill}</span>
                      </span>
                    ))}
                  </p>
                ) : null}
                {(job.nice_to_have_skills || []).length ? (
                  <p className="mt-1 text-sm text-zinc-400"><span className="text-zinc-500">Nice to have: </span>{job.nice_to_have_skills.join(", ")}</p>
                ) : null}
                {(job.missing_skills || []).length ? (
                  <p className="mt-1 text-sm text-zinc-400">Skills you don&apos;t list: {job.missing_skills.join(", ")}</p>
                ) : null}

                <div className="mt-4 space-y-3">
                  <div className="text-sm text-zinc-300">
                    {retryable ? (
                      <label className="block">
                        <span className="mb-1 block text-zinc-500">To (correct it before retrying if needed):</span>
                        <input type="email" className={inputClass} value={draft.recipient}
                          disabled={busy || bulkBusy}
                          onChange={(event) => setDraftField(draft.id, "recipient", event.target.value)} />
                      </label>
                    ) : <><span className="text-zinc-500">To:</span> {draft.recipient}</>}
                    <span className="block text-xs text-zinc-500">Found in: {draft.recipient_evidence}</span>
                  </div>
                  {typing.includes(draft.id) ? (
                    <TypingDraft
                      subject={draft.subject}
                      body={draft.body}
                      inputClass={inputClass}
                      onDone={() => finishTyping(draft.id)}
                    />
                  ) : (
                    <>
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
                    </>
                  )}
                  <p className="text-xs text-zinc-500">Attachment: {draft.cv_filename || "CV.pdf"}</p>
                </div>

                {draft.error ? <p className="mt-3 text-sm text-red-400">{draft.error}</p> : null}
                {errors[draft.id] ? <p className="mt-3 text-sm text-red-400">{errors[draft.id]}</p> : null}
                {editable && sendBlocked ? <p className="mt-3 text-xs text-zinc-500">To send: {sendBlocked}</p> : null}

                <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                  <a
                    href={job.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-11 items-center justify-center rounded-lg bg-zinc-800 px-3 py-2 text-sm font-semibold transition hover:bg-purple-600 whitespace-nowrap sm:px-4"
                  >
                    View vacancy
                  </a>
                  {editable && draft.dirty ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => updateDraft(draft, { subject: draft.subject, body: draft.body })}
                      className="min-h-11 rounded-lg border border-zinc-700 px-3 py-2 text-sm transition hover:border-purple-500 hover:text-purple-300 disabled:opacity-50 whitespace-nowrap sm:px-4"
                    >
                      Save changes
                    </button>
                  ) : null}
                  {editable && onSend ? (
                    <button
                      type="button"
                      disabled={busy || Boolean(sendBlocked)}
                      title={sendBlocked || "Approve and send now"}
                      onClick={() => approveAndSend(draft)}
                      className="col-span-2 min-h-11 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500 disabled:opacity-50 whitespace-nowrap sm:col-auto"
                    >
                      {draft.status === "approved" ? "Send now" : "Approve & send"}
                    </button>
                  ) : null}
                  {retryable && onSend && !reconnectRequired ? (
                    <button
                      type="button"
                      disabled={busy || Boolean(sendBlocked)}
                      title={sendBlocked || "Queue this failed email and send it again"}
                      onClick={() => retryFailed(draft)}
                      className="col-span-2 min-h-11 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500 disabled:opacity-50 whitespace-nowrap sm:col-auto"
                    >
                      {busy ? "Retrying…" : "Retry this email"}
                    </button>
                  ) : null}
                  {reconnectRequired ? (
                    <button
                      type="button"
                      disabled={gmailBusy}
                      onClick={reconnectGmail}
                      className="col-span-2 min-h-11 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-purple-600 hover:text-white disabled:opacity-50 whitespace-nowrap sm:col-auto"
                    >
                      {gmailBusy ? "Opening Google..." : "Reconnect Gmail"}
                    </button>
                  ) : null}
                  {editable && draft.status !== "approved" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => updateDraft(draft, { subject: draft.subject, body: draft.body, status: "approved" })}
                      className="min-h-11 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black transition hover:bg-purple-600 hover:text-white disabled:opacity-50 whitespace-nowrap sm:px-4"
                    >
                      Approve
                    </button>
                  ) : null}
                  {draft.status === "approved" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => updateDraft(draft, { status: "draft" })}
                      className="min-h-11 rounded-lg border border-zinc-700 px-3 py-2 text-sm transition hover:border-purple-500 hover:text-purple-300 disabled:opacity-50 whitespace-nowrap sm:px-4"
                    >
                      Undo approval
                    </button>
                  ) : null}
                  {editable && draft.status !== "rejected" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => updateDraft(draft, { status: "rejected" })}
                      className="min-h-11 rounded-lg border border-zinc-700 px-3 py-2 text-sm transition hover:border-red-500 hover:text-red-300 disabled:opacity-50 whitespace-nowrap sm:px-4"
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
