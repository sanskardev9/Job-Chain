"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDown, Eye, KeyRound, MailCheck, ShieldCheck, UserCheck } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import HeroDemo from "../components/landing/HeroDemo";
import { EmailMock, MatchesMock, ProfileMock, SentMock } from "../components/landing/Mockups";

const BEFORE_AFTER = [
  {
    before: "Hours scrolling job boards, half the posts weeks old.",
    after: "Fresh jobs from the last 15 days, searched for your own keywords.",
  },
  {
    before: "Applying, then spotting “German C1 required” at the very bottom.",
    after: "Every job is checked against your skills, languages and visa needs first, with the reasons shown.",
  },
  {
    before: "Rewriting the same email and attaching your CV for the 30th time.",
    after: "A tailored email with your CV, ready in seconds, sent from your own Gmail.",
  },
  {
    before: "Forgetting where you applied, or applying to the same job twice.",
    after: "One list of everything you applied to. The same job is never emailed twice.",
  },
];

const STEPS = [
  {
    title: "Tell JobPilot who you are",
    text: "Your skills, experience, languages, where you want to work, whether you need a visa, and your CV. It takes about five minutes, once.",
    visual: <ProfileMock />,
  },
  {
    title: "See which jobs are worth it",
    text: "Every fresh job is checked against your profile and marked strong, possible or unlikely, with the exact reasons. No more discovering a deal-breaker after you applied.",
    visual: <MatchesMock />,
  },
  {
    title: "Get the email written for you",
    text: "One click writes a short, tailored application for that job, using only what is true about you. If something is unclear, like visa sponsorship, it asks politely. Edit anything you like.",
    visual: <EmailMock />,
  },
  {
    title: "Send it, and keep track",
    text: "Approve it and it goes out from your own Gmail with your CV attached. It lands in your Applied list, where you follow it to interview and offer.",
    visual: <SentMock />,
  },
];

const PROMISES = [
  { icon: UserCheck, text: "Only says what your profile says. It never invents skills or experience." },
  { icon: Eye, text: "Nothing is sent until you have read and approved it." },
  { icon: MailCheck, text: "Send-only Gmail access. It can't read your inbox." },
  { icon: ShieldCheck, text: "Only uses recruiter emails published in the job ad. It never guesses." },
];

// Same page for everyone: visitors learn what JobChain does, signed-in users see how each part works.
// The only call to action is at the end, once the visitor has seen what they get.
export default function Home() {
  // undefined = checking, false = visitor, true = signed in
  const [signedIn, setSignedIn] = useState(undefined);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session)));
    supabase.rpc("preview_countries").then(({ data }) => {
      if (data?.length) setStats({ jobs: data.reduce((sum, c) => sum + Number(c.jobs || 0), 0), countries: data.length });
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-full overflow-x-hidden bg-zinc-950 text-white">
      {/* Hero: what it is, shown working. No buttons here on purpose. */}
      <section className="relative px-4 sm:px-6 pt-12 pb-16 sm:pt-20">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(ellipse_at_top,rgba(147,51,234,0.18),transparent_60%)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
          <div className="animate-[fadeUp_0.6s_ease-out] text-center lg:text-left">
            <p className="inline-flex items-center gap-2 rounded-full border border-purple-500/40 bg-purple-500/10 px-3 py-1 text-xs font-semibold text-purple-200">
              Meet JobPilot, your job-application co-pilot
            </p>
            <h1 className="mt-5 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.05]">
              Applying for jobs shouldn&apos;t be a <span className="text-purple-400">second job.</span>
            </h1>
            <p className="mt-5 text-lg text-zinc-300">
              JobPilot finds fresh openings that fit you, tells you honestly whether each one is worth your time, and
              writes the application email. You read it. You press send.
            </p>
            {stats ? (
              <div className="mt-8 flex justify-center gap-5 sm:gap-8 lg:justify-start">
                <div>
                  <p className="whitespace-nowrap text-2xl sm:text-3xl font-extrabold text-white">{stats.jobs.toLocaleString()}</p>
                  <p className="text-xs text-zinc-500">jobs in the last 15 days</p>
                </div>
                <div>
                  <p className="whitespace-nowrap text-2xl sm:text-3xl font-extrabold text-white">{stats.countries}</p>
                  <p className="text-xs text-zinc-500">countries</p>
                </div>
                <div>
                  <p className="whitespace-nowrap text-2xl sm:text-3xl font-extrabold text-white">~1 min</p>
                  <p className="text-xs text-zinc-500">per application</p>
                </div>
              </div>
            ) : null}
            <a
              href="#how-it-works"
              onClick={(event) => {
                // Glide down instead of jumping (instant for people who prefer reduced motion).
                event.preventDefault();
                const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                document.getElementById("how-it-works")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
              }}
              className="mt-10 inline-flex items-center gap-2 text-sm font-semibold text-zinc-400 hover:text-purple-300 transition"
            >
              See how it works <ArrowDown size={16} className="animate-bounce" />
            </a>
          </div>
          <div className="mx-auto w-full max-w-md animate-[fadeUp_0.8s_ease-out] lg:max-w-none">
            <HeroDemo />
          </div>
        </div>
      </section>

      {/* The everyday problem, and what changes. */}
      <section className="px-4 sm:px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl sm:text-3xl font-bold">Sound familiar?</h2>
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
            {BEFORE_AFTER.map((item) => (
              <div key={item.before} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
                <p className="text-sm text-zinc-500 line-through decoration-zinc-600">{item.before}</p>
                <p className="mt-3 text-zinc-200">
                  <span className="mr-2 text-emerald-400">✓</span>
                  {item.after}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works: each step with what it looks like. */}
      <section id="how-it-works" className="scroll-mt-20 px-4 sm:px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-2xl sm:text-3xl font-bold">How JobPilot works</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-zinc-400">
            Four steps. You stay in control of every application.
          </p>
          <div className="mt-14 space-y-20">
            {STEPS.map((step, index) => (
              <div key={step.title} className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
                <div className={index % 2 ? "lg:order-2" : ""}>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-purple-500/50 bg-purple-500/15 font-bold text-purple-200">
                    {index + 1}
                  </span>
                  <h3 className="mt-4 text-2xl font-bold">{step.title}</h3>
                  <p className="mt-3 text-zinc-400 leading-relaxed">{step.text}</p>
                </div>
                <div className={`mx-auto w-full max-w-md ${index % 2 ? "lg:order-1" : ""}`}>{step.visual}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What it will never do. */}
      <section className="px-4 sm:px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl sm:text-3xl font-bold">Your name, your rules</h2>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {PROMISES.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
                <Icon size={22} className="mt-0.5 shrink-0 text-purple-300" />
                <p className="text-zinc-300">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The only call to action, after the visitor has seen what they get. */}
      <section className="px-4 sm:px-6 pb-20 pt-8">
        <div className="mx-auto max-w-4xl rounded-3xl border border-purple-500/30 bg-gradient-to-br from-purple-600/20 via-zinc-900 to-zinc-900 p-8 sm:p-12 text-center">
          <KeyRound size={28} className="mx-auto text-purple-300" />
          <h2 className="mt-4 text-2xl sm:text-4xl font-extrabold">
            {signedIn ? "Your matches are waiting." : "Your next application could take a minute, not an hour."}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-zinc-300">
            {signedIn
              ? "Pick a job you like, let JobPilot write the email, and send it."
              : "Set up your profile once. JobPilot does the searching, checking and writing from then on."}
          </p>
          <div className={`mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row ${signedIn === undefined ? "invisible" : ""}`}>
            <Link
              href={signedIn ? "/jobs" : "/login?signup=1"}
              className="w-full sm:w-auto whitespace-nowrap rounded-xl bg-white px-7 py-3.5 font-semibold text-black shadow-md transition duration-200 hover:scale-105 hover:bg-purple-600 hover:text-white"
            >
              {signedIn ? "Go to my jobs" : "Get started, it's free"}
            </Link>
            <Link
              href={signedIn ? "/jobpilot" : "/jobs"}
              className="w-full sm:w-auto whitespace-nowrap rounded-xl border border-zinc-600 px-7 py-3.5 font-semibold transition duration-200 hover:border-purple-500 hover:text-purple-300"
            >
              {signedIn ? "Open JobPilot" : "Browse today's jobs"}
            </Link>
          </div>
          {signedIn === false ? (
            <p className="mt-4 text-sm text-zinc-500">
              Already have an account?{" "}
              <Link href="/login" className="text-purple-300 hover:underline">
                Sign in
              </Link>
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
