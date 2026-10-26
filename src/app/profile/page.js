"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import { startGmailConnect } from "../../lib/gmailClient";
import Loader from "../../components/Loader";

const LANGUAGE_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2", "Native"];
const SEND_MODES = [
  { value: "dry_run", label: "Dry run", hint: "Find and score jobs, draft emails, never send." },
  { value: "review", label: "Review", hint: "Send only drafts you approve." },
];

const EMPTY_FORM = {
  preferred_name: "",
  github_url: "",
  linkedin_url: "",
  current_base: "",
  role_family: "Frontend / Web Developer",
  skills: "",
  experience_years_part: "",
  experience_months_part: "",
  max_required_experience_years: "",
  education: "",
  languages: [],
  needs_sponsorship: "",
  target_countries: "",
  keywords: "",
  send_mode: "dry_run",
  max_sends_per_run: 5,
};

const CV_BUCKET = "cvs";
const CV_MAX_BYTES = 5 * 1024 * 1024;

const toNumberOrNull = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const toList = (text) =>
  text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const inputClass =
  "w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-600";

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-zinc-200 mb-1">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-zinc-500 mt-1">{hint}</span> : null}
    </label>
  );
}

export default function ProfilePage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [cv, setCv] = useState(null);
  const [cvBusy, setCvBusy] = useState(false);
  const [cvError, setCvError] = useState("");
  const [gmail, setGmail] = useState(null);
  const [gmailBusy, setGmailBusy] = useState(false);
  const [gmailMessage, setGmailMessage] = useState("");
  const [gmailError, setGmailError] = useState("");

  useEffect(() => {
    const loadProfile = async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      setUser(currentUser ?? null);

      if (!currentUser) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("candidate_profiles")
        .select("*")
        .eq("user_id", currentUser.id)
        .maybeSingle();

      if (error) {
        console.error("Failed to load profile", error);
        setErrorMessage("Could not load your profile.");
      }

      const { data: account } = await supabase
        .from("email_accounts")
        .select("email, connected_at")
        .eq("user_id", currentUser.id)
        .maybeSingle();
      setGmail(account ?? null);
      if (new URLSearchParams(window.location.search).get("gmail") === "connected" && account) {
        setGmailMessage(`Connected. Applications will be sent from ${account.email}.`);
        window.history.replaceState(null, "", "/profile");
      }

      if (data?.cv_storage_path) {
        setCv({ path: data.cv_storage_path, filename: data.cv_filename || "cv.pdf" });
      }

      if (data) {
        setForm({
          ...EMPTY_FORM,
          ...Object.fromEntries(
            Object.entries(data).filter(([, value]) => value !== null)
          ),
          skills: (data.skills || []).join(", "),
          target_countries: (data.target_countries || []).join(", "),
          keywords: (data.keywords || []).join(", "),
          experience_years_part:
            data.experience_years == null ? "" : String(Math.floor(data.experience_years)),
          experience_months_part:
            data.experience_years == null
              ? ""
              : String(Math.round((data.experience_years % 1) * 12)),
          max_required_experience_years: data.max_required_experience_years ?? "",
          needs_sponsorship:
            data.needs_sponsorship === null ? "" : String(data.needs_sponsorship),
          languages: data.languages || [],
        });
      } else {
        setForm({
          ...EMPTY_FORM,
          preferred_name: currentUser.user_metadata?.full_name || "",
        });
      }
      setLoading(false);
    };

    loadProfile();
  }, []);

  const setField = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));

  const setLanguage = (index, key, value) =>
    setForm((prev) => ({
      ...prev,
      languages: prev.languages.map((item, i) =>
        i === index ? { ...item, [key]: value } : item
      ),
    }));

  const uploadCv = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCvError("");

    if (file.type !== "application/pdf") {
      setCvError("Please choose a PDF file.");
      return;
    }
    if (file.size > CV_MAX_BYTES) {
      setCvError("The CV must be 5 MB or smaller.");
      return;
    }

    setCvBusy(true);
    const path = `${user.id}/cv.pdf`;
    const { error: uploadError } = await supabase.storage
      .from(CV_BUCKET)
      .upload(path, file, { upsert: true, contentType: "application/pdf" });

    if (uploadError) {
      console.error("Failed to upload CV", uploadError);
      setCvError(uploadError.message);
      setCvBusy(false);
      return;
    }

    const { error } = await supabase
      .from("candidate_profiles")
      .upsert(
        { user_id: user.id, cv_storage_path: path, cv_filename: file.name },
        { onConflict: "user_id" }
      );

    if (error) {
      console.error("Failed to link CV to profile", error);
      setCvError(error.message);
    } else {
      setCv({ path, filename: file.name });
    }
    setCvBusy(false);
  };

  const viewCv = async () => {
    setCvError("");
    const { data, error } = await supabase.storage
      .from(CV_BUCKET)
      .createSignedUrl(cv.path, 60);
    if (error) {
      setCvError(error.message);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const removeCv = async () => {
    setCvBusy(true);
    setCvError("");
    const { error: removeError } = await supabase.storage.from(CV_BUCKET).remove([cv.path]);
    const { error } = removeError
      ? { error: removeError }
      : await supabase
          .from("candidate_profiles")
          .update({ cv_storage_path: null, cv_filename: null })
          .eq("user_id", user.id);

    if (error) {
      console.error("Failed to remove CV", error);
      setCvError(error.message);
    } else {
      setCv(null);
    }
    setCvBusy(false);
  };

  const connectGmail = async () => {
    setGmailBusy(true);
    setGmailError("");
    try {
      await startGmailConnect();
    } catch (err) {
      setGmailError(err.message);
      setGmailBusy(false);
    }
  };

  const disconnectGmail = async () => {
    setGmailBusy(true);
    setGmailError("");
    setGmailMessage("");
    const { error } = await supabase.rpc("disconnect_gmail");
    if (error) {
      console.error("Failed to disconnect Gmail", error);
      setGmailError(error.message);
    } else {
      setGmail(null);
    }
    setGmailBusy(false);
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    setErrorMessage("");

    const years = toNumberOrNull(form.experience_years_part);
    const months = toNumberOrNull(form.experience_months_part);
    // Stored as years with one decimal (1 year 3 months -> 1.3), rounded down so it never overstates.
    const experience =
      years === null && months === null
        ? null
        : Math.floor(((years || 0) + (months || 0) / 12) * 10) / 10;
    const { error } = await supabase.from("candidate_profiles").upsert(
      {
        user_id: user.id,
        preferred_name: form.preferred_name.trim() || null,
        github_url: form.github_url.trim() || null,
        linkedin_url: form.linkedin_url.trim() || null,
        current_base: form.current_base.trim() || null,
        role_family: form.role_family.trim() || null,
        skills: toList(form.skills),
        experience_years: experience,
        max_required_experience_years: toNumberOrNull(form.max_required_experience_years),
        education: form.education.trim() || null,
        languages: form.languages
          .map((item) => ({ language: item.language.trim(), level: item.level || null }))
          .filter((item) => item.language),
        needs_sponsorship:
          form.needs_sponsorship === "" ? null : form.needs_sponsorship === "true",
        target_countries: toList(form.target_countries),
        keywords: toList(form.keywords),
        send_mode: form.send_mode,
        max_sends_per_run: Number(form.max_sends_per_run) || 0,
      },
      { onConflict: "user_id" }
    );

    if (error) {
      console.error("Failed to save profile", error);
      setErrorMessage(error.message);
    } else {
      setMessage("Profile saved. JobPilot will use it on its next run.");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100svh-9rem)] bg-zinc-950 text-white flex items-center justify-center">
        <Loader size="lg" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[calc(100svh-9rem)] bg-zinc-950 text-white px-6 flex items-center justify-center">
        <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
          <h1 className="text-2xl font-bold">Sign in to edit your profile!</h1>
          <Link
            href="/login?redirect=/profile"
            className="inline-block mt-6 rounded-xl bg-white px-4 py-2 text-black font-semibold hover:bg-purple-600 hover:text-white transition"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-zinc-950 px-6 text-white pb-6">
      <div className="flex flex-col items-center justify-center w-content">
        <h1 className="text-3xl font-extrabold mb-3 sm:mb-6 mt-6 sm:mt-6 tracking-tight text-white sm:text-5xl hover:text-purple-500 hover:drop-shadow-[0_0_15px_rgba(168,85,247,0.9)] transition duration-300">
          Profile
        </h1>
        <p className="text-zinc-400 mb-3 text-sm sm:text-base text-center">
          JobPilot matches jobs and writes emails only from what you record here.
        </p>
      </div>

      <form onSubmit={saveProfile} className="max-w-3xl mx-auto py-4 space-y-6">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
          <h2 className="text-xl font-semibold">About you</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Name used in emails">
              <input className={inputClass} value={form.preferred_name}
                onChange={(e) => setField("preferred_name", e.target.value)} />
            </Field>
            <Field label="Current base" hint="Country you live in now.">
              <input className={inputClass} value={form.current_base} placeholder="India"
                onChange={(e) => setField("current_base", e.target.value)} />
            </Field>
            <Field label="GitHub URL">
              <input type="url" className={inputClass} value={form.github_url}
                onChange={(e) => setField("github_url", e.target.value)} />
            </Field>
            <Field label="LinkedIn URL">
              <input type="url" className={inputClass} value={form.linkedin_url}
                onChange={(e) => setField("linkedin_url", e.target.value)} />
            </Field>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
          <h2 className="text-xl font-semibold">Experience</h2>
          <Field label="Role family">
            <input className={inputClass} value={form.role_family}
              onChange={(e) => setField("role_family", e.target.value)} />
          </Field>
          <Field label="Skills" hint="Comma separated. Only skills listed here are ever claimed.">
            <input className={inputClass} value={form.skills}
              placeholder="JavaScript, React.js, Next.js, HTML, CSS"
              onChange={(e) => setField("skills", e.target.value)} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="block text-sm font-semibold text-zinc-200 mb-1">
                Your experience
              </span>
              <div className="flex gap-2">
                <input type="number" min="0" max="60" step="1" className={inputClass}
                  value={form.experience_years_part ?? ""} placeholder="Years, e.g. 1"
                  onChange={(e) => setField("experience_years_part", e.target.value)} />
                <input type="number" min="0" max="11" step="1" className={inputClass}
                  value={form.experience_months_part ?? ""} placeholder="Months, e.g. 3"
                  onChange={(e) => setField("experience_months_part", e.target.value)} />
              </div>
              <span className="block text-xs text-zinc-500 mt-1">
                What you actually have. This is the only figure ever stated in emails.
              </span>
            </div>
            <Field
              label="Apply to jobs asking up to (years)"
              hint="e.g. 2 includes '1–2 years' roles. Leave empty to only match jobs you fully meet."
            >
              <input type="number" min="0" max="60" step="0.5" className={inputClass}
                value={form.max_required_experience_years ?? ""} placeholder="e.g. 2"
                onChange={(e) => setField("max_required_experience_years", e.target.value)} />
            </Field>
          </div>
          <Field label="Education">
            <input className={inputClass} value={form.education}
              placeholder="e.g. B.Tech Computer Science, 2023"
              onChange={(e) => setField("education", e.target.value)} />
          </Field>

          <div>
            <span className="block text-sm font-semibold text-zinc-200 mb-1">Languages</span>
            <div className="space-y-2">
              {form.languages.map((item, index) => (
                <div key={index} className="flex gap-2">
                  <input className={inputClass} value={item.language} placeholder="English"
                    onChange={(e) => setLanguage(index, "language", e.target.value)} />
                  <select className={`${inputClass} max-w-32`} value={item.level || ""}
                    onChange={(e) => setLanguage(index, "level", e.target.value)}>
                    <option value="">Level</option>
                    {LANGUAGE_LEVELS.map((level) => (
                      <option key={level} value={level}>{level}</option>
                    ))}
                  </select>
                  <button type="button"
                    onClick={() => setField("languages", form.languages.filter((_, i) => i !== index))}
                    className="rounded-lg border border-zinc-700 px-3 text-sm hover:border-red-500 hover:text-red-300 transition">
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button type="button"
              onClick={() => setField("languages", [...form.languages, { language: "", level: "" }])}
              className="mt-2 rounded-lg border border-zinc-700 px-3 py-2 text-sm hover:border-purple-500 hover:text-purple-300 transition">
              + Add language
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
          <h2 className="text-xl font-semibold">Job search</h2>
          <Field label="Do you need visa / work-permit sponsorship?">
            <select className={inputClass} value={form.needs_sponsorship}
              onChange={(e) => setField("needs_sponsorship", e.target.value)}>
              <option value="">Not set</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </Field>
          <Field label="Target countries" hint="Comma separated. Empty means all of Europe.">
            <input className={inputClass} value={form.target_countries}
              placeholder="Germany, Netherlands, Ireland"
              onChange={(e) => setField("target_countries", e.target.value)} />
          </Field>
          <Field label="Search keywords" hint="Comma separated. Empty uses JobPilot's frontend defaults.">
            <input className={inputClass} value={form.keywords}
              placeholder="Frontend Developer, React Developer"
              onChange={(e) => setField("keywords", e.target.value)} />
          </Field>
          <div>
            <span className="block text-sm font-semibold text-zinc-200 mb-1">CV</span>
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3">
              {cv ? (
                <>
                  <span className="text-zinc-200 truncate max-w-full">{cv.filename}</span>
                  <button type="button" onClick={viewCv} disabled={cvBusy}
                    className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:border-purple-500 hover:text-purple-300 transition disabled:opacity-50">
                    View
                  </button>
                  <button type="button" onClick={removeCv} disabled={cvBusy}
                    className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:border-red-500 hover:text-red-300 transition disabled:opacity-50">
                    Remove
                  </button>
                </>
              ) : (
                <span className="text-zinc-500">No CV uploaded</span>
              )}
              <label className={`ml-auto rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black hover:bg-purple-600 hover:text-white transition cursor-pointer ${cvBusy ? "opacity-50 pointer-events-none" : ""}`}>
                {cvBusy ? "Uploading..." : cv ? "Replace" : "Upload PDF"}
                <input type="file" accept="application/pdf" className="hidden" onChange={uploadCv} />
              </label>
            </div>
            <span className="block text-xs text-zinc-500 mt-1">
              PDF, up to 5 MB. Stored privately; attached only to emails you approve.
            </span>
            {cvError ? <span className="block text-sm text-red-400 mt-1">{cvError}</span> : null}
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
          <h2 className="text-xl font-semibold">Sending</h2>
          <div>
            <span className="block text-sm font-semibold text-zinc-200 mb-1">Send from Gmail</span>
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3">
              {gmail ? (
                <>
                  <span className="text-zinc-200 truncate max-w-full">{gmail.email}</span>
                  <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">
                    Connected
                  </span>
                  <button type="button" onClick={disconnectGmail} disabled={gmailBusy}
                    className="ml-auto rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:border-red-500 hover:text-red-300 transition disabled:opacity-50">
                    Disconnect
                  </button>
                </>
              ) : (
                <>
                  <span className="text-zinc-500">Not connected</span>
                  <button type="button" onClick={connectGmail} disabled={gmailBusy}
                    className="ml-auto rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black hover:bg-purple-600 hover:text-white transition disabled:opacity-50">
                    {gmailBusy ? "Opening Google..." : "Connect Gmail"}
                  </button>
                </>
              )}
            </div>
            <span className="block text-xs text-zinc-500 mt-1">
              Send-only access: JobPilot can send the applications you approve, but cannot read your inbox.
            </span>
            {gmailMessage ? <span className="block text-sm text-emerald-400 mt-1">{gmailMessage}</span> : null}
            {gmailError ? <span className="block text-sm text-red-400 mt-1">{gmailError}</span> : null}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SEND_MODES.map((mode) => (
              <button key={mode.value} type="button"
                onClick={() => setField("send_mode", mode.value)}
                className={`rounded-xl border p-4 text-left transition ${
                  form.send_mode === mode.value
                    ? "border-purple-500 bg-purple-500/10"
                    : "border-zinc-700 hover:border-purple-500"
                }`}>
                <span className="block font-semibold">{mode.label}</span>
                <span className="block text-xs text-zinc-400 mt-1">{mode.hint}</span>
              </button>
            ))}
          </div>
          <Field label="Max emails per run" hint="0–50.">
            <input type="number" min="0" max="50" className={inputClass}
              value={form.max_sends_per_run}
              onChange={(e) => setField("max_sends_per_run", e.target.value)} />
          </Field>
        </section>

        {errorMessage ? <p className="text-sm text-red-400">{errorMessage}</p> : null}
        {message ? <p className="text-sm text-emerald-400">{message}</p> : null}

        <button type="submit" disabled={saving}
          className="w-full rounded-xl bg-white px-4 py-3 font-semibold text-black hover:bg-purple-600 hover:text-white transition disabled:opacity-60">
          {saving ? "Saving..." : "Save profile"}
        </button>
      </form>
    </div>
  );
}
