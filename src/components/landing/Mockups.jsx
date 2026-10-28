// Illustrations for the home page: small replicas of the real screens with sample data
// (the founder's name with a dummy email), so visitors see what they will get instead of reading about it.
import { AlertCircle, CheckCircle2, FileText, Mail, Paperclip, Send, XCircle } from "lucide-react";

// Who the demo is about: visitors see this sample, signed-in users see themselves.
export const SAMPLE_PERSONA = { name: "Sanskar Singh", email: "sanskar@test.com", cv: "sanskar-cv.pdf" };

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

export function ProfileMock({ persona = SAMPLE_PERSONA }) {
  return (
    <Frame>
      <p className="text-sm font-semibold text-white">{persona.name} · Frontend Developer</p>
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
        <span className="min-w-0 truncate text-sm text-zinc-200">{persona.cv}</span>
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

export const sampleEmail = (persona = SAMPLE_PERSONA) => ({
  subject: "Application: Frontend Developer (React) – Ref. NW-2381",
  body:
    "Dear Hiring Team,\n\nI am applying for the Frontend Developer (React) position at Northwind Labs.\n\n" +
    "I have 2.5 years of professional frontend development experience. My skills include React, TypeScript, " +
    "Next.js and Tailwind CSS.\n\nCould you please confirm whether visa sponsorship is available for this position?\n\n" +
    `Please find my CV attached.\n\nKind regards,\n${persona.name}`,
});
export const SAMPLE_EMAIL = sampleEmail();

export function EmailMock({ persona = SAMPLE_PERSONA, subject, body, cursor = false }) {
  const sample = sampleEmail(persona);
  subject = subject ?? sample.subject;
  body = body ?? sample.body;
  return (
    <Frame>
      <p className="text-xs text-zinc-500">
        To: <span className="text-zinc-300">careers@northwind.example</span>{" "}
        <span className="text-zinc-600">· found in the job posting</span>
      </p>
      <div className="mt-2 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white">{subject}</div>
      <div className="mt-2 min-h-[11rem] whitespace-pre-wrap rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-[11px] leading-relaxed text-zinc-300">
        {body}
        {cursor ? <span className="ml-px inline-block h-3 w-1.5 animate-pulse bg-purple-400 align-middle" /> : null}
      </div>
      <div className="mt-2 flex min-w-0 items-center gap-2 text-xs text-zinc-400">
        <Paperclip size={14} className="shrink-0" /> <span className="min-w-0 truncate">{persona.cv}</span>
      </div>
    </Frame>
  );
}

export function SentMock({ persona = SAMPLE_PERSONA }) {
  return (
    <Frame>
      <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
        <Send size={18} className="shrink-0 text-emerald-300" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-emerald-200">Sent from {persona.email}</p>
          <p className="truncate text-xs text-emerald-300/80">With {persona.cv} · Frontend Developer (React)</p>
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

const BATCH = [
  ["Frontend Developer (React)", "Northwind Labs", "Berlin"],
  ["React Developer", "Pixel & Co", "Amsterdam"],
  ["Web Developer", "Harbor Studio", "Vienna"],
  ["Frontend Engineer", "Nordlicht", "Helsinki"],
  ["JavaScript Developer", "Canal Digital", "Rotterdam"],
  ["UI Developer", "Alpine Soft", "Zurich"],
];
export const BATCH_TOTAL = 12;

// A batch of tailored drafts approved together and sent in one click. `sent` = how many are out.
export function BulkSendMock({ persona = SAMPLE_PERSONA, sent = BATCH_TOTAL }) {
  const done = sent >= BATCH_TOTAL;
  return (
    <Frame>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm text-zinc-200">
          <span className="flex h-4 w-4 items-center justify-center rounded bg-purple-500 text-[10px] font-bold text-white">✓</span>
          {BATCH_TOTAL} drafts selected
        </span>
        <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
          done ? "bg-emerald-500/20 text-emerald-300" : sent ? "bg-purple-600/60 text-white" : "bg-purple-600 text-white"
        }`}>
          {done ? "All sent ✓" : sent ? "Sending…" : "Approve & send all"}
        </span>
      </div>
      <ul className="mt-3 space-y-1.5">
        {BATCH.map(([title, company, city], i) => {
          const isSent = i < sent;
          return (
            <li key={title} className="flex items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded bg-purple-500/80 text-[8px] font-bold text-white">✓</span>
              <span className="min-w-0 flex-1 truncate text-xs text-zinc-200">
                {title} <span className="text-zinc-500">· {company}, {city}</span>
              </span>
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors duration-300 ${
                  isSent
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                    : "border-zinc-700 text-zinc-400"
                }`}
              >
                {isSent ? "Sent ✓" : sent ? "Queued" : "Tailored"}
              </span>
            </li>
          );
        })}
        <li className="px-3 text-[11px] text-zinc-500">+ {BATCH_TOTAL - BATCH.length} more</li>
      </ul>
      <div className="mt-3">
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full rounded-full bg-emerald-400 transition-all duration-300" style={{ width: `${(Math.min(sent, BATCH_TOTAL) / BATCH_TOTAL) * 100}%` }} />
        </div>
        <p className="mt-2 flex min-w-0 items-center gap-1.5 text-xs text-zinc-400">
          <Send size={12} className={done ? "text-emerald-300" : "text-purple-300"} />
          <span className="min-w-0 truncate">{done
            ? `${BATCH_TOTAL} applications sent from ${persona.email}, each with ${persona.cv}`
            : `Sending ${Math.min(sent + 1, BATCH_TOTAL)} of ${BATCH_TOTAL} from ${persona.email}…`}</span>
        </p>
      </div>
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
        <li className="text-purple-300">→ 14 fresh jobs for your titles</li>
      </ul>
    </Frame>
  );
}
