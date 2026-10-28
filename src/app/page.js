"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";

const BEFORE_AFTER = [
  {
    before: "Hours scrolling job boards, half the posts weeks old.",
    after: "Fresh jobs from the last 15 days, pulled from European job portals and searched for your own keywords.",
  },
  {
    before: "Applying, then spotting “German C1 required” at the very bottom.",
    after: "Every job is checked against your skills, experience, languages and visa needs first, with the reasons spelled out.",
  },
  {
    before: "Rewriting the same email and attaching your CV for the 30th time.",
    after: "A tailored email with your real skills and your CV, ready in seconds. Sent from your own Gmail, only when you say so.",
  },
  {
    before: "Forgetting where you applied, or applying to the same job twice.",
    after: "One list of everything you applied to. A job you already applied to is never emailed again.",
  },
];

const STEPS = [
  { title: "Tell it about you", text: "Skills, experience, languages, where you want to work, and your CV. About five minutes." },
  { title: "Get your matches", text: "Jobs that fit you, each marked strong, possible or unlikely, and why." },
  { title: "Read the email", text: "It's written for that job using only what's true about you. Edit anything." },
  { title: "Send and track", text: "Approve and it's sent from your Gmail with your CV. It shows up in Applied." },
];

const NEVER = [
  "Invent skills or experience: emails only say what your profile says.",
  "Send anything you haven't approved.",
  "Read your inbox: Gmail access is send-only.",
  "Guess recruiters' emails: it only uses addresses published in the job ad.",
];

export default function Home() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/jobs");
      else setChecked(true);
    });
  }, [router]);

  // Signed-in users go straight to their jobs; avoid flashing this page for them.
  if (!checked) return <div className="min-h-[calc(100svh-9rem)] bg-zinc-950" />;

  return (
    <div className="min-h-full bg-zinc-950 text-white px-4 sm:px-6 py-14 sm:py-20">
      <section className="mx-auto max-w-3xl text-center">
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
          Applying for jobs shouldn&apos;t be a second job.
        </h1>
        <p className="mt-5 text-lg sm:text-xl text-zinc-300">
          Job-Chain finds fresh openings that fit your skills, tells you plainly whether each one is worth your time,
          and writes the application email for you. You read it. You press send.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/login?signup=1"
            className="w-full sm:w-auto whitespace-nowrap rounded-xl bg-white px-6 py-3 font-semibold text-black shadow-md transition duration-200 hover:scale-105 hover:bg-purple-600 hover:text-white"
          >
            Get started, it&apos;s free
          </Link>
          <Link
            href="/login"
            className="w-full sm:w-auto whitespace-nowrap rounded-xl border border-zinc-700 px-6 py-3 font-semibold transition duration-200 hover:border-purple-500 hover:text-purple-300"
          >
            I already have an account
          </Link>
        </div>
        <p className="mt-3 text-sm text-zinc-500">
          Setup takes about five minutes.{" "}
          <Link href="/jobs" className="text-purple-300 hover:underline">
            Or look at today&apos;s jobs first →
          </Link>
        </p>
      </section>

      <section className="mx-auto mt-16 max-w-5xl">
        <h2 className="text-center text-2xl font-bold">Sound familiar?</h2>
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
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
      </section>

      <section className="mx-auto mt-16 max-w-5xl">
        <h2 className="text-center text-2xl font-bold">How it works</h2>
        <ol className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-purple-500/50 bg-purple-500/15 text-sm font-semibold text-purple-200">
                {index + 1}
              </span>
              <h3 className="mt-3 font-semibold">{step.title}</h3>
              <p className="mt-1 text-sm text-zinc-400">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto mt-16 max-w-3xl rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="text-xl font-bold">What it will never do</h2>
        <ul className="mt-4 space-y-2">
          {NEVER.map((line) => (
            <li key={line} className="flex gap-3 text-zinc-300">
              <span className="text-purple-300">✕</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto mt-16 max-w-3xl text-center">
        <h2 className="text-2xl font-bold">Your next application could take a minute, not an hour.</h2>
        <Link
          href="/login?signup=1"
          className="mt-6 inline-block whitespace-nowrap rounded-xl bg-white px-6 py-3 font-semibold text-black shadow-md transition duration-200 hover:scale-105 hover:bg-purple-600 hover:text-white"
        >
          Create your free account
        </Link>
      </section>
    </div>
  );
}
