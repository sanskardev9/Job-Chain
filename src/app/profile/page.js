"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import { startGmailConnect } from "../../lib/gmailClient";
import Loader from "../../components/Loader";
import PdfModal from "../../components/PdfModal";
import SetupGuide from "../../components/SetupGuide";
import LevelSelect from "../../components/LevelSelect";
import { parseCv, pdfText } from "../../lib/cvParse";
import { wakeWorker } from "../../lib/jobpilotClient";
import { useRouter } from "next/navigation";

// CEFR levels in plain words; the stored value stays the short code (A1…C2, Native).
const LANGUAGE_LEVELS = [
  { value: "A1", label: "A1 · Beginner", hint: "A few words and simple phrases" },
  { value: "A2", label: "A2 · Elementary", hint: "Simple everyday conversations" },
  { value: "B1", label: "B1 · Intermediate", hint: "Can handle most travel and work basics" },
  { value: "B2", label: "B2 · Upper intermediate", hint: "Can work and hold meetings in it" },
  { value: "C1", label: "C1 · Advanced", hint: "Fluent, close to native at work" },
  { value: "C2", label: "C2 · Proficient", hint: "Near-native in every situation" },
  { value: "Native", label: "Native", hint: "Your first language" },
];
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

const STEPS = [
  { id: "cv", label: "Your CV", hint: "We fill in your details from it" },
  { id: "details", label: "Your details", hint: "Check what the CV gave us" },
  { id: "search", label: "What you're looking for", hint: "Visa, countries, job titles" },
  { id: "gmail", label: "Gmail & sending", hint: "Send-only access" },
];

const CV_BUCKET = "cvs";
const CV_MAX_BYTES = 5 * 1024 * 1024;

// Unsaved form edits are kept in this browser so nothing is lost on reloads or the Google redirect.
const draftKey = (userId) => `jobchain:profile-draft:${userId}`;
const readDraft = (userId) => {
  try {
    const raw = localStorage.getItem(draftKey(userId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const writeDraft = (userId, form) => {
  try {
    localStorage.setItem(draftKey(userId), JSON.stringify({ form, savedAt: Date.now() }));
  } catch {
    // Storage unavailable (private mode / full): the form still works, it just isn't kept.
  }
};
const clearDraft = (userId) => {
  try {
    localStorage.removeItem(draftKey(userId));
  } catch {
    // ignore
  }
};

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

function FieldTag({ tag }) {
  if (tag === "cv") {
    return (
      <span className="ml-2 rounded-full border border-purple-500/40 bg-purple-500/15 px-2 py-0.5 text-[10px] font-semibold text-purple-200">
        From your CV
      </span>
    );
  }
  if (tag === "missing") {
    return (
      <span className="ml-2 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
        Please fill in
      </span>
    );
  }
  return null;
}

function Field({ label, hint, children, tag }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-zinc-200 mb-1">
        {label}
        <FieldTag tag={tag} />
      </span>
      {children}
      {hint ? <span className="block text-xs text-zinc-500 mt-1">{hint}</span> : null}
    </label>
  );
}

export default function ProfilePage() {
  const [user, setUser] = useState(null);
  // Setup checklist: details saved (skills), CV uploaded, Gmail connected.
  const [detailsSaved, setDetailsSaved] = useState(false);
  // Job preferences saved: the CV can't tell us these (visa, countries, job titles).
  const [prefsSaved, setPrefsSaved] = useState(false);
  const [starting, setStarting] = useState(false);
  // Checklist shows while setup is incomplete, during onboarding, or right after finishing it.
  const [showGuide, setShowGuide] = useState(false);
  // Which profile tab is open: cv | details | search | gmail.
  const [step, setStep] = useState("cv");
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  // True when the form has edits not yet saved to the database.
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [cv, setCv] = useState(null);
  const [cvBusy, setCvBusy] = useState(false);
  const [cvError, setCvError] = useState("");
  // CV autofill: which fields were filled from the CV, and whether to flag empty ones.
  const [cvReading, setCvReading] = useState(false);
  const [cvFillNote, setCvFillNote] = useState("");
  const [autoFilled, setAutoFilled] = useState([]);
  const formRef = useRef(form);
  formRef.current = form;
  const [cvOpening, setCvOpening] = useState(false);
  const [cvPreviewUrl, setCvPreviewUrl] = useState("");
  const [confirmRemoveCv, setConfirmRemoveCv] = useState(false);
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

      setDetailsSaved(Boolean(data?.skills?.length));
      setPrefsSaved(data?.needs_sponsorship != null);
      const params = new URLSearchParams(window.location.search);
      setShowGuide(
        !data?.skills?.length || data?.needs_sponsorship == null || !data?.cv_storage_path || !account ||
          params.has("welcome") || params.has("gmail")
      );
      // Open the first unfinished step (Gmail right after connecting it).
      setStep(
        params.has("gmail") ? "gmail"
          : !data?.cv_storage_path ? "cv"
          : !data?.skills?.length ? "details"
          : data?.needs_sponsorship == null ? "search"
          : !account ? "gmail"
          : "details"
      );
      if (data?.cv_storage_path) {
        setCv({ path: data.cv_storage_path, filename: data.cv_filename || "cv.pdf" });
      }

      const draft = readDraft(currentUser.id);
      if (draft?.form) {
        setForm({ ...EMPTY_FORM, ...draft.form });
        setDirty(true);
        setMessage("Restored your unsaved changes. Click “Save profile” to keep them.");
      } else if (data) {
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

  useEffect(() => {
    if (user && dirty) writeDraft(user.id, form);
  }, [user, dirty, form]);

  const setField = (name, value) => {
    setDirty(true);
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const setLanguage = (index, key, value) => {
    setDirty(true);
    setForm((prev) => ({
      ...prev,
      languages: prev.languages.map((item, i) =>
        i === index ? { ...item, [key]: value } : item
      ),
    }));
  };

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
    if (!error) await autofillFromCv(file);
  };

  // Fills only empty fields from the CV text (plain rules, no AI); the user checks and saves.
  const autofillFromCv = async (source) => {
    setCvReading(true);
    setCvFillNote("");
    try {
      const found = parseCv(await pdfText(source));
      const filled = [];
      const prev = formRef.current;
      const next = { ...prev };
      {
        const fillText = (key, value) => {
          if (value && !String(prev[key] || "").trim()) {
            next[key] = value;
            filled.push(key);
          }
        };
        fillText("preferred_name", found.preferred_name);
        fillText("current_base", found.current_base);
        fillText("github_url", found.github_url);
        fillText("linkedin_url", found.linkedin_url);
        fillText("education", found.education);
        if (found.skills?.length && !String(prev.skills || "").trim()) {
          next.skills = found.skills.join(", ");
          filled.push("skills");
        }
        if (found.experience && prev.experience_years_part === "" && prev.experience_months_part === "") {
          next.experience_years_part = String(found.experience.years);
          next.experience_months_part = String(found.experience.months);
          filled.push("experience");
        }
        if (found.languages?.length && !(prev.languages || []).some((l) => l.language?.trim())) {
          next.languages = found.languages;
          filled.push("languages");
        }
      }
      setForm(next);
      setDirty(true);
      setAutoFilled((prev) => [...new Set([...prev, ...filled])]);
      setCvFillNote(
        filled.length
          ? `Filled ${filled.length} field${filled.length === 1 ? "" : "s"} from your CV (marked “From your CV”). Check them, fill in the ones marked “Please fill in”, then save.`
          : "Your profile already had everything your CV mentions. Fill in anything marked “Please fill in”, then save."
      );
      setStep("details");
    } catch (err) {
      console.error("Could not read the CV", err);
      setCvFillNote("Your CV is uploaded, but its text could not be read (scanned PDFs have no text). Please fill in your details below.");
    }
    setCvReading(false);
  };

  const fillFromSavedCv = async () => {
    const { data, error } = await supabase.storage.from(CV_BUCKET).download(cv.path);
    if (error) {
      setCvError(error.message);
      return;
    }
    await autofillFromCv(data);
  };

  // Tag shown next to a field label: filled from the CV, or still empty after reading the CV.
  const tagFor = (key, required = true) => {
    if (autoFilled.includes(key)) return "cv";
    if (!required || !cv) return null;
    const empty = {
      experience: form.experience_years_part === "" && form.experience_months_part === "",
      languages: !(form.languages || []).some((l) => l.language?.trim()),
      needs_sponsorship: form.needs_sponsorship === "",
    }[key] ?? !String(form[key] || "").trim();
    return empty ? "missing" : null;
  };

  // Shows the CV in a modal on this page, using a short-lived private link.
  const viewCv = async () => {
    setCvError("");
    setCvOpening(true);
    const { data, error } = await supabase.storage.from(CV_BUCKET).createSignedUrl(cv.path, 300);
    setCvOpening(false);
    if (error) {
      setCvError(error.message);
      return;
    }
    setCvPreviewUrl(data.signedUrl);
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
    setConfirmRemoveCv(false);
  };

  const connectGmail = async () => {
    setGmailBusy(true);
    setGmailError("");
    if (dirty) {
      const error = await persistProfile();
      if (error) {
        setGmailError(`Save your profile first: ${error}`);
        setGmailBusy(false);
        return;
      }
    }
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
    const error = await persistProfile();
    if (error) {
      setErrorMessage(error);
    } else if (step === "details" || step === "search") {
      goTo(step === "details" ? "search" : "gmail");
    } else {
      setMessage("Profile saved. JobPilot will use it on its next run.");
    }
    setSaving(false);
  };

  // Every application attaches the CV, so the other steps open only once it is uploaded.
  const goTo = (id) => {
    if (id !== "cv" && !cv) {
      setStep("cv");
      setCvError("Upload your CV first: every application is sent with it.");
      return;
    }
    setStep(id);
    setMessage("");
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  // Writes the form to the database. Returns an error message, or null on success.
  const persistProfile = async () => {

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
      return error.message;
    }
    clearDraft(user.id);
    setDirty(false);
    if (toList(form.skills).length) {
      setDetailsSaved(true);
      window.dispatchEvent(new CustomEvent("jobchain:profile-saved"));
    }
    if (form.needs_sponsorship !== "") setPrefsSaved(true);
    return null;
  };

  // Last setup step: run the first search and go to the matches.
  const findFirstJobs = async () => {
    setStarting(true);
    wakeWorker();
    const { error } = await supabase.from("pipeline_runs").insert({ user_id: user.id, kind: "search" });
    if (error && error.code !== "23505") {
      setErrorMessage(error.message);
      setStarting(false);
      return;
    }
    window.dispatchEvent(new CustomEvent("jobchain:run-started"));
    router.push("/jobpilot");
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

      <SetupGuide
        steps={STEPS.map((s) => ({ ...s, done: { cv: Boolean(cv), details: detailsSaved, search: prefsSaved, gmail: Boolean(gmail) }[s.id] }))}
        active={step}
        onSelect={goTo}
        locked={cv ? [] : ["details", "search", "gmail"]}
        showProgress={showGuide}
        starting={starting}
        onFinish={findFirstJobs}
      />

      <form onSubmit={saveProfile} className="max-w-3xl mx-auto py-4 space-y-6">
        <section id="setup-cv" className={`scroll-mt-24 rounded-2xl border border-purple-500/30 bg-zinc-900 p-6 space-y-3 ${step === "cv" ? "" : "hidden"}`}>
          <h2 className="text-xl font-semibold">Start with your CV</h2>
          <p className="text-sm text-zinc-400">
            Upload it and JobPilot fills in what it can find. You only fill in what is left.
          </p>
          <div>
                        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3">
              {cv ? (
                <>
                  <span className="text-zinc-200 truncate max-w-full">{cv.filename}</span>
                  <button type="button" onClick={viewCv} disabled={cvBusy || cvOpening}
                    className="whitespace-nowrap rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:border-purple-500 hover:text-purple-300 transition disabled:opacity-50">
                    {cvOpening ? "Opening…" : "View"}
                  </button>
                  <button type="button" onClick={() => setConfirmRemoveCv(true)} disabled={cvBusy}
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
            {cvReading ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-purple-200">
                <span className="h-2 w-2 animate-ping rounded-full bg-purple-400" /> Reading your CV and filling in your profile…
              </p>
            ) : null}
            {cvFillNote ? (
              <p className="mt-3 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-sm text-purple-100">{cvFillNote}</p>
            ) : null}
            {cv && !cvReading ? (
              <button type="button" onClick={fillFromSavedCv}
                className="mt-3 text-sm font-semibold text-purple-300 hover:underline">
                Fill empty fields from my CV
              </button>
            ) : null}
            {cvError ? <span className="block text-sm text-red-400 mt-1">{cvError}</span> : null}
          </div>
        </section>
        <section id="setup-details" className={`scroll-mt-24 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-4 ${step === "details" ? "" : "hidden"}`}>
          <h2 className="text-xl font-semibold">About you</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Name used in emails" tag={tagFor("preferred_name")}>
              <input className={inputClass} value={form.preferred_name}
                onChange={(e) => setField("preferred_name", e.target.value)} />
            </Field>
            <Field label="Current base" hint="Country you live in now." tag={tagFor("current_base")}>
              <input className={inputClass} value={form.current_base} placeholder="India"
                onChange={(e) => setField("current_base", e.target.value)} />
            </Field>
            <Field label="GitHub URL" tag={tagFor("github_url", false)}>
              <input type="url" className={inputClass} value={form.github_url}
                onChange={(e) => setField("github_url", e.target.value)} />
            </Field>
            <Field label="LinkedIn URL" tag={tagFor("linkedin_url", false)}>
              <input type="url" className={inputClass} value={form.linkedin_url}
                onChange={(e) => setField("linkedin_url", e.target.value)} />
            </Field>
          </div>
        </section>

        <section className={`rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-4 ${step === "details" ? "" : "hidden"}`}>
          <h2 className="text-xl font-semibold">Experience</h2>
          <Field label="Role family">
            <input className={inputClass} value={form.role_family}
              onChange={(e) => setField("role_family", e.target.value)} />
          </Field>
          <Field label="Skills" hint="Comma separated, strongest first. Only skills listed here are ever claimed." tag={tagFor("skills")}>
            <input className={inputClass} value={form.skills}
              placeholder="JavaScript, React.js, Next.js, HTML, CSS"
              onChange={(e) => setField("skills", e.target.value)} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="block text-sm font-semibold text-zinc-200 mb-1">
                Your experience
                <FieldTag tag={tagFor("experience")} />
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
          <Field label="Education" tag={tagFor("education", false)}>
            <input className={inputClass} value={form.education}
              placeholder="e.g. B.Tech Computer Science, 2023"
              onChange={(e) => setField("education", e.target.value)} />
          </Field>

          <div>
            <span className="block text-sm font-semibold text-zinc-200 mb-1">Languages<FieldTag tag={tagFor("languages", false)} /></span>
            <div className="space-y-2">
              {form.languages.map((item, index) => (
                <div key={index} className="flex flex-col gap-2 sm:flex-row">
                  <input className={inputClass} value={item.language} placeholder="English"
                    onChange={(e) => setLanguage(index, "language", e.target.value)} />
                  <LevelSelect options={LANGUAGE_LEVELS} value={item.level || ""}
                    onChange={(level) => setLanguage(index, "level", level)} />
                  <button type="button"
                    onClick={() => setField("languages", form.languages.filter((_, i) => i !== index))}
                    className="rounded-xl border border-zinc-700 px-3 py-2 text-sm hover:border-red-500 hover:text-red-300 transition">
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Levels go from A1 (just starting) to C2 (near-native). Jobs that ask for a language usually want B2 or higher.
            </p>
            <button type="button"
              onClick={() => setField("languages", [...form.languages, { language: "", level: "" }])}
              className="mt-2 rounded-lg border border-zinc-700 px-3 py-2 text-sm hover:border-purple-500 hover:text-purple-300 transition">
              + Add language
            </button>
          </div>
        </section>

        <section id="setup-search" className={`scroll-mt-24 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-4 ${step === "search" ? "" : "hidden"}`}>
          <div>
            <h2 className="text-xl font-semibold">What you&apos;re looking for</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Your CV can&apos;t tell us this. Only the visa question is required; the rest has sensible defaults.
            </p>
          </div>
          <Field label="Do you need visa / work-permit sponsorship?" tag={tagFor("needs_sponsorship")}>
            <select className={inputClass} value={form.needs_sponsorship}
              onChange={(e) => setField("needs_sponsorship", e.target.value)}>
              <option value="">Not set</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </Field>
          <Field label="Target countries" hint="Comma separated. Empty means all of Europe." tag={tagFor("target_countries", false)}>
            <input className={inputClass} value={form.target_countries}
              placeholder="Germany, Netherlands, Ireland"
              onChange={(e) => setField("target_countries", e.target.value)} />
          </Field>
          <Field label="Search keywords" hint="Comma separated. Empty uses JobPilot's frontend defaults.">
            <input className={inputClass} value={form.keywords}
              placeholder="Frontend Developer, React Developer"
              onChange={(e) => setField("keywords", e.target.value)} />
          </Field>
        </section>

        <section className={`rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-4 ${step === "gmail" ? "" : "hidden"}`}>
          <h2 className="text-xl font-semibold">Sending</h2>
          <div id="setup-gmail" className="scroll-mt-24">
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

        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          {step !== "cv" ? (
            <button type="button" onClick={() => goTo(STEPS[STEPS.findIndex((s) => s.id === step) - 1].id)}
              className="rounded-xl border border-zinc-700 px-5 py-3 font-semibold text-zinc-300 hover:border-zinc-500 transition">
              ← Back
            </button>
          ) : null}
          {step === "cv" ? (
            <button type="button" onClick={() => goTo("details")} disabled={cvReading || !cv}
              className="flex-1 rounded-xl bg-white px-4 py-3 font-semibold text-black hover:bg-purple-600 hover:text-white transition disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-black">
              {cv ? "Continue: check your details →" : "Upload your CV to continue"}
            </button>
          ) : (
            <button type="submit" disabled={saving}
              className="flex-1 rounded-xl bg-white px-4 py-3 font-semibold text-black hover:bg-purple-600 hover:text-white transition disabled:opacity-60">
              {saving ? "Saving..." : step === "gmail" ? "Save" : "Save & continue →"}
            </button>
          )}
        </div>
      </form>

      {cvPreviewUrl ? (
        <PdfModal url={cvPreviewUrl} title={cv?.filename || "CV"} onClose={() => setCvPreviewUrl("")} />
      ) : null}

      {confirmRemoveCv ? (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center px-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
            <h3 className="text-lg font-bold text-white">Remove your CV?</h3>
            <p className="mt-2 text-sm text-zinc-400">
              {cv?.filename} will be deleted. JobPilot can&apos;t send applications until you upload a CV again.
            </p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmRemoveCv(false)}
                disabled={cvBusy}
                className="whitespace-nowrap rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:border-zinc-500 transition disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={removeCv}
                disabled={cvBusy}
                className="whitespace-nowrap rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 transition disabled:opacity-60"
              >
                {cvBusy ? "Removing…" : "Remove CV"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
