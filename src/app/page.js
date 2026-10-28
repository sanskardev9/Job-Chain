import Image from "next/image";
import Link from "next/link";

const FEATURES = [
  {
    title: "Shortlist jobs",
    text: "Save the jobs you like from JobPilot's matches and come back to apply when you're ready.",
    href: "/bookmarks",
    cta: "View bookmarks",
  },
  {
    title: "Track every application",
    text: "Keep all your applications in one place and move them from applied to interview, offer or rejected.",
    href: "/applied",
    cta: "View applied",
  },
  {
    title: "Let JobPilot apply for you",
    text: "JobPilot finds matching jobs across Europe, scores them against your profile and drafts tailored emails with your CV. Nothing is sent until you approve it.",
    href: "/jobpilot",
    cta: "Open JobPilot",
  },
];

const STEPS = [
  "Fill in your profile and upload your CV",
  "Connect your Gmail (send-only)",
  "Click “Find jobs now” and review the matches",
  "Approve the drafts you like, and JobPilot sends them",
];

export default function Home() {
  return (
    <div className="min-h-full bg-zinc-950 text-white px-6 py-16 sm:py-20">
      <section className="mx-auto max-w-3xl text-center">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Image src="/chain.png" alt="Job-Chain logo" width={56} height={30} priority />
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight transition duration-300 hover:text-purple-500 hover:drop-shadow-[0_0_15px_rgba(168,85,247,0.9)]">
            Welcome to Job-Chain
          </h1>
        </div>
        <p className="mt-6 text-xl sm:text-2xl font-bold text-zinc-200">
          Find jobs, track applications, and apply faster.
        </p>
        <p className="mt-3 text-zinc-400 sm:text-lg">
          JobPilot finds jobs that match your profile, drafts tailored applications, and sends only what you
          approve. Save jobs for later and keep every application organised.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/jobs"
            className="w-full sm:w-auto rounded-xl bg-white px-6 py-3 font-semibold text-black shadow-md transition duration-200 hover:scale-105 hover:bg-purple-600 hover:text-white"
          >
            Let the hunt begin
          </Link>
          <Link
            href="/applied"
            className="w-full sm:w-auto rounded-xl border border-zinc-700 px-6 py-3 font-semibold transition duration-200 hover:border-purple-500 hover:text-purple-300"
          >
            Track applications
          </Link>
        </div>
      </section>

      <section className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-4 md:grid-cols-3">
        {FEATURES.map((feature) => (
          <div key={feature.title} className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <h2 className="text-lg font-semibold">{feature.title}</h2>
            <p className="mt-2 text-sm text-zinc-400">{feature.text}</p>
            <Link href={feature.href} className="mt-auto pt-4 text-sm font-semibold text-purple-300 hover:underline">
              {feature.cta} →
            </Link>
          </div>
        ))}
      </section>

      <section className="mx-auto mt-12 max-w-3xl rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="text-lg font-semibold">How JobPilot works</h2>
        <ol className="mt-4 space-y-3">
          {STEPS.map((step, index) => (
            <li key={step} className="flex items-start gap-3 text-zinc-300">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-purple-500/50 bg-purple-500/15 text-xs font-semibold text-purple-200">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
