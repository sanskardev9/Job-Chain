// Illustrations for the home page: small replicas of the real screens with sample data
// (a made-up candidate), so visitors see what they will get instead of reading about it.
import { AlertCircle, CheckCircle2, FileText, Mail, Paperclip, Send, XCircle } from "lucide-react";

export function Frame({ children, className = "" }) {
  return (
    <div className={`rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 shadow-2xl shadow-purple-900/20 ${className}`}>
      <div className="mb-3 flex gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
      </div>
      {children}
    </div>
  );
}

const Chip = ({ children, tone = "zinc" }) => {
  const tones = {
    zinc: "border-zinc-700 bg-zinc-800 text-zinc-200",
    purple: "border-purple-500/50 bg-purple-500/15 text-purple-200",
    green: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  };
  return <span className={`rounded-full border px-2.5 py-1 text-xs ${tones[tone]}`}>{children}</span>;
};

export function ProfileMock() {
  return (
    <Frame>
      <p className="text-sm font-semibold text-white">Alex Rivera · Frontend Developer</p>
      <p className="text-xs text-zinc-500">2.5 years experience · based in India · needs visa sponsorship</p>
      <p className="mt-4 text-xs text-zinc-500">Skills</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {["React", "TypeScript", "Next.js", "Tailwind CSS", "Node.js", "REST APIs"].map((s) => (
          <Chip key={s} tone="purple">
            {s}
          </Chip>
        ))}
      </div>
      <p className="mt-4 text-xs text-zinc-500">Languages</p>
      <div className="mt-1.5 flex gap-1.5">
        <Chip>English · C1</Chip>
        <Chip>German · A2</Chip>
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5">
        <FileText size={18} className="text-red-300" />
        <span className="text-sm text-zinc-200">Alex_Rivera_CV.pdf</span>
        <span className="ml-auto text-xs text-emerald-300">Uploaded</span>
      </div>
    </Frame>
  );
}

const Reason = ({ ok, children }) => {
  const Icon = ok === true ? CheckCircle2 : ok === false ? XCircle : AlertCircle;
  const tone = ok === true ? "text-emerald-300" : ok === false ? "text-red-300" : "text-yellow-300";
  return (
    <li className="flex items-start gap-2 text-xs text-zinc-300">
      <Icon size={14} className={`mt-px shrink-0 ${tone}`} />
      <span>{children}</span>
    </li>
  );
};

export function MatchCard({ strong = true }) {
  return strong ? (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-white">Frontend Developer (React)</p>
        <span className="shrink-0 text-xs font-semibold text-emerald-300">Strong · 86</span>
      </div>
      <p className="text-xs text-zinc-500">Northwind Labs · Berlin, Germany · posted 2 days ago</p>
      <ul className="mt-2.5 space-y-1">
        <Reason ok>React, TypeScript and Next.js are in your profile</Reason>
        <Reason ok>Asks for 2+ years, you have 2.5</Reason>
        <Reason ok={null}>Visa sponsorship not mentioned, so your email will ask</Reason>
      </ul>
    </div>
  ) : (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3.5 opacity-80">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-white">Senior Backend Engineer (Go)</p>
        <span className="shrink-0 text-xs font-semibold text-red-300">Unlikely · 31</span>
      </div>
      <p className="text-xs text-zinc-500">Brightline · Munich, Germany · posted 5 days ago</p>
      <ul className="mt-2.5 space-y-1">
        <Reason ok={false}>Requires 5+ years of experience</Reason>
        <Reason ok={false}>German C1 required (you have A2)</Reason>
      </ul>
    </div>
  );
}

export function MatchesMock() {
  return (
    <Frame>
      <div className="space-y-2.5">
        <MatchCard strong />
        <MatchCard strong={false} />
      </div>
    </Frame>
  );
}

export const SAMPLE_EMAIL = {
  subject: "Application: Frontend Developer (React) – Ref. NW-2381",
  body:
    "Dear Hiring Team,\n\nI am applying for the Frontend Developer (React) position at Northwind Labs.\n\n" +
    "I have 2.5 years of professional frontend development experience. My skills include React, TypeScript, " +
    "Next.js and Tailwind CSS.\n\nCould you please confirm whether visa sponsorship is available for this position?\n\n" +
    "Please find my CV attached.\n\nKind regards,\nAlex Rivera",
};

export function EmailMock({ subject = SAMPLE_EMAIL.subject, body = SAMPLE_EMAIL.body, cursor = false }) {
  return (
    <Frame>
      <p className="text-xs text-zinc-500">
        To: <span className="text-zinc-300">careers@northwind.example</span>{" "}
        <span className="text-zinc-600">· found in the job ad</span>
      </p>
      <div className="mt-2 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white">{subject}</div>
      <div className="mt-2 min-h-[11rem] whitespace-pre-wrap rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-[11px] leading-relaxed text-zinc-300">
        {body}
        {cursor ? <span className="ml-px inline-block h-3 w-1.5 animate-pulse bg-purple-400 align-middle" /> : null}
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
        <Paperclip size={14} /> Alex_Rivera_CV.pdf
      </div>
    </Frame>
  );
}

export function SentMock() {
  return (
    <Frame>
      <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
        <Send size={18} className="text-emerald-300" />
        <div>
          <p className="text-sm font-semibold text-emerald-200">Sent from alex.rivera@gmail.com</p>
          <p className="text-xs text-emerald-300/80">With Alex_Rivera_CV.pdf · Frontend Developer (React)</p>
        </div>
      </div>
      <p className="mt-4 text-xs text-zinc-500">Applied</p>
      <ul className="mt-1.5 space-y-1.5">
        {[
          ["Frontend Developer (React)", "Northwind Labs", "Applied", "bg-yellow-500/20 text-yellow-300 border-yellow-500/40"],
          ["React Developer", "Pixel & Co", "Interview", "bg-blue-500/20 text-blue-300 border-blue-500/40"],
          ["Web Developer", "Harbor Studio", "Offer", "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"],
        ].map(([title, company, status, tone]) => (
          <li key={title} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
            <span className="min-w-0 truncate text-xs text-zinc-200">
              {title} <span className="text-zinc-500">· {company}</span>
            </span>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone}`}>{status}</span>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

export function SearchMock() {
  return (
    <Frame>
      <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-300">
        <Mail size={14} className="text-zinc-500" /> Searching for “Frontend Developer”, “React Developer”…
      </div>
      <ul className="mt-3 space-y-1.5 font-mono text-[11px] text-zinc-400">
        <li>✓ EURES · 25 results, 9 match your titles</li>
        <li>✓ Arbeitnow · 900 jobs checked</li>
        <li className="text-purple-300">→ 14 new jobs from the last 15 days</li>
      </ul>
    </Frame>
  );
}
