"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown, ArrowRight, Mail, Search, CalendarCheck, X, XCircle, Zap, CheckCircle2, Eye, KeyRound, Layers, ListChecks, MailCheck, Plane, Send, ShieldCheck, UserCheck,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import HeroDemo from "../components/landing/HeroDemo";
import Reveal, { CountUp } from "../components/Reveal";
import IntroScreen from "../components/IntroScreen";
import EuFlag from "../components/EuFlag";
import { BulkSendMock, EmailMock, MatchesMock, ProfileMock, SAMPLE_PERSONA, SentMock } from "../components/landing/Mockups";

// The old way and the JobPilot way, side by side.
const ADVANTAGES = [
  ["Expired or outdated listings", "Recently posted, still-open jobs"],
  ["Unclear sponsorship eligibility", "Visa needs handled in every email"],
  ["Surprise language requirements", "Requirements checked before you apply"],
  ["Repetitive application emails", "Personalized drafts, sent in batches"],
  ["Applying twice to the same job", "Every job emailed only once"],
  ["Scattered application history", "One organized application tracker"],
];

// What changes with JobPilot: a bold claim, the detail, and the old way it replaces.
const BEFORE_AFTER = [
  {
    icon: CalendarCheck,
    title: "Only open jobs",
    after: "Never older than a month, never past the application deadline, from all over Europe.",
    before: "Scrolling boards full of weeks-old or closed posts",
  },
  {
    icon: Plane,
    title: "Visa, handled",
    after: "Your visa needs are part of your profile. If a job posting doesn't say, your email asks for you.",
    before: "Guessing who sponsors visas or hires from abroad",
  },
  {
    icon: ShieldCheck,
    title: "No hidden deal-breakers",
    after: "Every job is checked against your skills, languages and experience first, with the reasons shown.",
    before: "Spotting “German C1 required” after you applied",
  },
  {
    icon: Layers,
    title: "Apply in bulk",
    after: "A tailored email for every match, written at once. Approve the batch, send it in one click.",
    before: "Rewriting the same email for the 30th time",
  },
  {
    icon: ListChecks,
    title: "Never apply twice",
    after: "One list of everything you applied to. The same job is never emailed twice.",
    before: "Losing track of where you already applied",
  },
  {
    icon: Send,
    title: "Straight to the recruiter",
    after: "Only the address published in the job posting, sent from your own Gmail with your CV attached.",
    before: "Applications vanishing into a portal",
  },
];

// The timeline bolt: a steady zigzag (viewBox 0 0 24 100) with a glow and a white-hot core,
// revealed down to the scroll position.
const BOLT_POINTS = Array.from({ length: 41 }, (_, i) => {
  const y = i * 2.5;
  const x = i === 0 || i === 40 ? 12 : 12 + (i % 2 ? 1 : -1) * (3 + ((i * 7) % 5));
  return `${x},${y}`;
}).join(" ");

function Lightning({ progress }) {
  return (
    <svg aria-hidden viewBox="0 0 24 100" preserveAspectRatio="none"
      className="bolt-flicker absolute left-1/2 top-0 hidden h-full w-6 -translate-x-1/2 animate-[boltFlicker_1.6s_steps(1,end)_infinite] overflow-visible lg:block"
      style={{ clipPath: `inset(0 -30px ${(1 - progress) * 100}% -30px)` }}>
      <defs>
        <filter id="boltGlow" x="-300%" y="-5%" width="700%" height="110%">
          <feGaussianBlur stdDeviation="2" />
        </filter>
      </defs>
      <polyline points={BOLT_POINTS} fill="none" stroke="#a855f7" strokeOpacity="0.8" strokeWidth="6"
        vectorEffect="non-scaling-stroke" filter="url(#boltGlow)" />
      <polyline points={BOLT_POINTS} fill="none" stroke="#e879f9" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
      <polyline points={BOLT_POINTS} fill="none" stroke="#fdf4ff" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// The product, screen by screen: what you give JobPilot, and what it gives back.
const STEPS = [
  {
    tag: "Your profile · 5 minutes, once",
    title: "Tell JobPilot who you are",
    text: "Upload your CV and JobPilot fills in most of your profile. You add what a CV can't say.",
    points: ["Skills, experience and languages, read from your CV", "Countries you want to work in", "Whether you need a visa"],
    visual: (persona) => <ProfileMock persona={persona} />,
  },
  {
    tag: "Your matches · every search",
    title: "See which jobs are worth it",
    text: "Every fresh job is checked against your profile and rated, with the exact reasons shown.",
    points: ["Strong, possible or unlikely, never a black box", "Language, seniority and stack gaps spotted first", "Closed and expired jobs never shown"],
    visual: () => <MatchesMock />,
  },
  {
    tag: "Your emails · written for each job",
    title: "Get applications that sound like you",
    text: "A short, tailored email for each job, using only what's true in your profile.",
    points: ["Names the role, company and reference", "Asks about visa sponsorship politely when unclear", "Edit anything before it goes out"],
    visual: (persona) => <EmailMock persona={persona} />,
  },
  {
    tag: "Your tracker · after sending",
    title: "Follow every application",
    text: "Each email you send lands in your Applied list, so you always know where you stand.",
    points: ["Sent from your own Gmail, with your CV", "Track it from applied to interview to offer", "The same job is never emailed twice"],
    visual: (persona) => <SentMock persona={persona} />,
  },
];

const BULK_STEPS = [
  { icon: Search, title: "Select jobs", text: "Choose relevant openings that match your skills and preferences." },
  { icon: Mail, title: "Generate drafts", text: "A tailored email for each job, using the role, company and contact details from the job posting." },
  { icon: ListChecks, title: "Review applications", text: "Edit messages, remove unsuitable jobs, and approve the drafts you want to send." },
  { icon: Send, title: "Send and track", text: "Send through your connected Gmail, with your CV attached, and follow the status in JobPilot." },
];

const PROMISES = [
  { icon: UserCheck, text: "Only says what your profile says. It never invents skills or experience." },
  { icon: Eye, text: "Nothing is sent until you have approved it, one by one or as a batch." },
  { icon: MailCheck, text: "Send-only Gmail access. It can't read your inbox." },
  { icon: ShieldCheck, text: "Only uses recruiter emails published in the job posting. It never guesses." },
];

// Same page for everyone: visitors learn what JobChain does, signed-in users see how each part works.
// The only call to action is at the end, once the visitor has seen what they get.
export default function Home() {
  // How JobPilot works: how far the timeline has filled while scrolling, and how many steps it reached.
  const timelineRef = useRef(null);
  const [timeline, setTimeline] = useState({ progress: 0, reached: 0 });
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const list = timelineRef.current;
      if (!list) return;
      const box = list.getBoundingClientRect();
      const mark = window.innerHeight * 0.55; // the line fills up to just below the middle of the screen
      const progress = Math.min(Math.max((mark - box.top) / box.height, 0), 1);
      const reached = [...list.querySelectorAll("[data-step-dot]")].filter(
        (dot) => dot.getBoundingClientRect().top + dot.offsetHeight / 2 <= mark
      ).length;
      setTimeline((prev) => (prev.progress === progress && prev.reached === reached ? prev : { progress, reached }));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // Cursor position inside the card under it (for the spotlight glow), and how far the page is read.
  const [pageProgress, setPageProgress] = useState(0);
  useEffect(() => {
    const onMove = (event) => {
      const card = event.target.closest?.(".spotlight");
      if (!card) return;
      const box = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${event.clientX - box.left}px`);
      card.style.setProperty("--my", `${event.clientY - box.top}px`);
    };
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setPageProgress(max > 0 ? window.scrollY / max : 0);
    };
    onScroll();
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // undefined = checking, false = visitor, true = signed in
  const [signedIn, setSignedIn] = useState(undefined);
  const [stats, setStats] = useState(null);
  // Visitors see the sample persona; signed-in users see their own name, email and CV.
  const [persona, setPersona] = useState(SAMPLE_PERSONA);

  useEffect(() => {
    const loadPersona = async (session) => {
      const user = session?.user;
      if (!user) {
        setPersona(SAMPLE_PERSONA);
        return;
      }
      const { data: profile } = await supabase
        .from("candidate_profiles")
        .select("preferred_name, cv_filename")
        .eq("user_id", user.id)
        .maybeSingle();
      const name = profile?.preferred_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "You";
      setPersona({
        name,
        email: user.email || SAMPLE_PERSONA.email,
        cv: profile?.cv_filename || `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-cv.pdf`,
      });
    };
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(Boolean(data.session));
      loadPersona(data.session);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
      loadPersona(session);
    });
    supabase.rpc("preview_countries").then(({ data }) => {
      if (data?.length) setStats({ jobs: data.reduce((sum, c) => sum + Number(c.jobs || 0), 0), countries: data.length });
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-full overflow-x-hidden bg-zinc-950 text-white">
      <IntroScreen />
      {/* Reading progress, just under the navbar. */}
      <div aria-hidden className="fixed inset-x-0 top-16 z-40 h-0.5 bg-transparent">
        <div className="h-full origin-left bg-gradient-to-r from-purple-500 via-fuchsia-400 to-purple-300 shadow-[0_0_10px_rgba(232,121,249,0.8)]"
          style={{ transform: `scaleX(${pageProgress})` }} />
      </div>
      {/* Hero: what it is, shown working. No buttons here on purpose. */}
      <section className="relative px-4 sm:px-6 pt-12 pb-16 sm:pt-20">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(ellipse_at_top,rgba(147,51,234,0.18),transparent_60%)]" />
        <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div className="animate-[fadeUp_0.6s_ease-out] text-center lg:text-left">
            <p className="inline-flex items-center gap-2 rounded-full border border-purple-500/40 bg-purple-500/10 px-3 py-1 text-xs font-semibold text-purple-200">
              <EuFlag /> Live vacancies from EURES, the EU&apos;s official job portal
            </p>
            <h1 className="mt-5 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.05]">
              Your next job, <span className="text-purple-400">anywhere in Europe.</span>
            </h1>
            <p className="mt-5 text-lg text-zinc-300">
              JobPilot scans fresh openings from Berlin to Helsinki, checks every language, visa and experience
              requirement against your profile, and writes a tailored email for each one. Review the batch, approve
              it, and send every application in one click.
            </p>
            {stats ? (
              <div className="mt-8 flex justify-center gap-5 sm:gap-8 lg:justify-start">
                <div>
                  <p className="whitespace-nowrap text-2xl sm:text-3xl font-extrabold text-white"><CountUp value={stats.jobs} /></p>
                  <p className="text-xs text-zinc-500">jobs from the last month</p>
                </div>
                <div>
                  <p className="whitespace-nowrap text-2xl sm:text-3xl font-extrabold text-white"><CountUp value={stats.countries} duration={900} /></p>
                  <p className="text-xs text-zinc-500">European countries</p>
                </div>
                <div>
                  <p className="whitespace-nowrap text-2xl sm:text-3xl font-extrabold text-white">1 click</p>
                  <p className="text-xs text-zinc-500">to send every application</p>
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
            <HeroDemo persona={persona} />
          </div>
        </div>
      </section>

      {/* Each problem of applying abroad, and how JobPilot solves it. */}
      <section className="px-4 sm:px-6 py-16">
        <div className="mx-auto max-w-5xl">
          {/* 1. The problem, on its own. */}
          <p className="text-center text-xs font-bold uppercase tracking-wider text-zinc-500">The problem</p>
          <h2 className="mt-2 text-center text-2xl sm:text-3xl font-bold">Job hunting abroad is broken</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-zinc-400">
            If you&apos;re looking for a job in another European country, you know these:
          </p>
          <ul className="mx-auto mt-8 grid max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2">
            {BEFORE_AFTER.map(({ before }, i) => (
              <Reveal as="li" key={before} delay={i * 80}
                className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-[15px] text-zinc-300 hover:border-zinc-600 spotlight">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-zinc-500">
                  <X size={14} />
                </span>
                {before}
              </Reveal>
            ))}
          </ul>

          {/* 2. What JobChain and JobPilot are, before what they do. */}
          <p className="mt-20 text-center text-xs font-bold uppercase tracking-wider text-purple-300">The solution</p>
          <h2 className="mt-2 text-center text-2xl sm:text-3xl font-bold">Meet JobChain and JobPilot</h2>
          <div className="mx-auto mt-8 grid max-w-4xl grid-cols-1 gap-4 md:grid-cols-2">
            <Reveal from="left" className="spotlight rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-1 hover:border-purple-500/50 hover:shadow-lg hover:shadow-purple-900/20">
              <p className="flex items-center gap-2 text-lg font-bold text-white">
                <Image src="/chain.png" alt="" width={22} height={24} style={{ width: "auto", height: "auto" }} /> JobChain
              </p>
              <p className="mt-1 text-sm font-semibold text-zinc-400">The platform</p>
              <p className="mt-3 text-sm leading-relaxed text-zinc-300">
                Every fresh job from across Europe in one place. Search them, save the ones you like, and keep track of
                every application from sent to offer.
              </p>
            </Reveal>
            <Reveal from="right" delay={120} className="spotlight rounded-2xl border border-purple-500/40 bg-gradient-to-br from-purple-600/15 to-zinc-900/60 p-6 transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-1 hover:border-purple-500/50 hover:shadow-lg hover:shadow-purple-900/20">
              <p className="flex items-center gap-2 text-lg font-bold text-white">
                <Zap size={20} className="fill-current text-purple-300" /> JobPilot
              </p>
              <p className="mt-1 text-sm font-semibold text-purple-300">Your assistant inside JobChain</p>
              <p className="mt-3 text-sm leading-relaxed text-zinc-300">
                Reads every job for you, checks it against your skills, languages and visa needs, writes a tailored
                email for each good match, and sends them from your own Gmail once you approve.
              </p>
            </Reveal>
          </div>

          {/* 3. The JobPilot advantage: the old way next to the JobPilot way, one line each. */}
          <div className="mt-20 rounded-3xl border border-zinc-800 bg-zinc-950 px-4 py-10 sm:px-8">
            <div className="text-center">
              <span className="inline-block rounded-full bg-purple-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-purple-300">
                The JobPilot advantage
              </span>
              <h2 className="mt-4 text-2xl sm:text-3xl font-bold">Your European job search, without the guesswork.</h2>
              <p className="mx-auto mt-3 max-w-xl text-zinc-400">Spend less time searching. Focus on opportunities worth pursuing.</p>
            </div>
            <div className="spotlight mt-8 overflow-hidden rounded-2xl border border-zinc-800">
              <div className="grid grid-cols-2 gap-4 bg-zinc-900 px-4 py-3 text-xs font-semibold uppercase tracking-wider sm:px-6">
                <p className="text-zinc-500">The old way</p>
                <p className="text-purple-300">The JobPilot way</p>
              </div>
              <ul className="divide-y divide-zinc-800">
                {ADVANTAGES.map(([oldWay, newWay], i) => (
                  <Reveal as="li" key={oldWay} delay={i * 90} className="grid grid-cols-2 gap-4 px-4 py-5 transition-colors hover:bg-purple-500/5 sm:px-6">
                    <p className="flex items-start gap-2.5 text-sm text-zinc-400 sm:text-base">
                      <XCircle size={18} className="mt-0.5 shrink-0 text-zinc-600" /> {oldWay}
                    </p>
                    <p className="flex items-start gap-2.5 text-sm font-medium text-white sm:text-base">
                      <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-purple-400" /> {newWay}
                    </p>
                  </Reveal>
                ))}
              </ul>
            </div>
            <p className="mt-6 text-center text-sm text-zinc-500">
              Less busywork. Better-informed applications. More control over your search.
            </p>
          </div>
        </div>
      </section>

      {/* Bulk apply, part 1: the benefit, with the batch shown going out. */}
      <section className="px-4 sm:px-6 py-16">
        <div className="spotlight mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 rounded-3xl border border-purple-500/30 bg-gradient-to-br from-purple-600/15 via-zinc-900 to-zinc-950 p-6 sm:p-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-purple-500/40 bg-purple-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-purple-200">
              <Layers size={14} /> Bulk apply
            </p>
            <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold tracking-tight">
              Apply to multiple jobs. <span className="text-purple-400">From one place.</span>
            </h2>
            <p className="mt-3 text-zinc-400 leading-relaxed">
              Stop writing the same email and attaching your CV one application at a time. JobPilot prepares a
              personalized email for every job you pick, and you review them all before anything is sent.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">By hand</p>
                <p className="mt-1 text-2xl font-extrabold text-zinc-300">4–10</p>
                <p className="text-sm text-zinc-500">applications a day, at most</p>
              </div>
              <div className="rounded-xl border border-purple-500/40 bg-purple-500/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-purple-300">With JobPilot</p>
                <p className="mt-1 text-2xl font-extrabold text-white">Up to 50</p>
                <p className="text-sm text-purple-200/80">per batch, sent in minutes</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-zinc-300">
              <span className="font-semibold text-white">More applications means more chances</span> of landing a job
              abroad, without spending your whole day writing emails.
            </p>
          </div>
          <div className="mx-auto w-full max-w-md">
            <Reveal from="scale"><BulkSendMock persona={persona} sent={3} /></Reveal>
          </div>
        </div>
      </section>

      {/* Bulk apply, part 2: the workflow, as a compact grid. */}
      <section className="px-4 sm:px-6 pb-16">
        <div className="spotlight mx-auto max-w-6xl rounded-3xl border border-zinc-800 bg-zinc-900/50 p-6 sm:p-10">
          <p className="inline-block rounded-full bg-purple-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-purple-300">
            How bulk apply works
          </p>
          <h2 className="mt-4 text-2xl sm:text-3xl font-bold">From job search to sent application.</h2>
          <p className="mt-2 text-zinc-400">Four simple steps. You&apos;re in control at every stage.</p>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {BULK_STEPS.map(({ icon: Icon, title, text }, i) => (
              <Reveal key={title} delay={i * 100} className="spotlight group rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5 transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-1 hover:border-purple-500/50 hover:shadow-lg hover:shadow-purple-900/20">
                <Icon size={22} className="text-purple-300 transition-transform duration-300 group-hover:scale-110" />
                <h3 className="mt-3 font-semibold text-white">{i + 1}. {title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{text}</p>
              </Reveal>
            ))}
          </div>
          <p className="mt-6 flex items-center gap-2 border-t border-zinc-800 pt-5 text-sm text-zinc-300">
            <ShieldCheck size={18} className="shrink-0 text-emerald-400" /> Nothing gets sent until you approve it.
          </p>
        </div>
      </section>

      {/* How it works: the product screen by screen, joined by a timeline. */}
      <section id="how-it-works" className="scroll-mt-20 px-4 sm:px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <span className="inline-block rounded-full bg-purple-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-purple-300">
              How JobPilot works
            </span>
            <h2 className="mt-4 text-2xl sm:text-3xl font-bold">Set up once. JobPilot does the rest.</h2>
            <p className="mx-auto mt-3 max-w-2xl text-zinc-400">
              Here&apos;s what you&apos;ll see in JobChain, from your first five minutes to your first interview.
            </p>
          </div>
          <ol ref={timelineRef} className="relative mt-14 space-y-16 lg:space-y-24">
            {/* Timeline behind the step numbers (desktop): a grey track that fills purple as you scroll. */}
            <span aria-hidden className="absolute bottom-0 left-1/2 hidden w-px -translate-x-1/2 bg-gradient-to-b from-zinc-800 to-transparent lg:block"
              style={{ top: `${timeline.progress * 100}%` }} />
            {/* The bolt: a jagged line revealed down to the scroll position, with a spark at its tip. */}
            <Lightning progress={timeline.progress} />
            {timeline.progress > 0 && timeline.progress < 1 ? (
              <span aria-hidden
                className="spark-pulse absolute left-1/2 hidden h-3 w-3 animate-[sparkPulse_0.5s_ease-in-out_infinite] rounded-full bg-white shadow-[0_0_10px_4px_rgba(232,121,249,0.9),0_0_30px_10px_rgba(168,85,247,0.6)] lg:block"
                style={{ top: `${timeline.progress * 100}%` }} />
            ) : null}
            {STEPS.map((step, index) => (
              <li key={step.title} className="relative grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-24">
                <span aria-hidden data-step-dot
                  className={`absolute left-1/2 top-1/2 hidden h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border font-bold transition-all duration-500 lg:flex ${
                    index < timeline.reached
                      ? "zap-flash scale-110 animate-[zapFlash_0.7s_ease-out] border-fuchsia-300 bg-purple-600 text-white shadow-[0_0_24px_rgba(232,121,249,0.7)]"
                      : "border-zinc-700 bg-zinc-950 text-zinc-500"
                  }`}>
                  {index + 1}
                </span>
                <Reveal from={index % 2 ? "right" : "left"} className={index % 2 ? "lg:order-2" : ""}>
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-purple-300">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-500/20 text-[11px] text-purple-100 lg:hidden">
                      {index + 1}
                    </span>
                    {step.tag}
                  </p>
                  <h3 className="mt-3 text-2xl font-bold">{step.title}</h3>
                  <p className="mt-2 text-zinc-400 leading-relaxed">{step.text}</p>
                  <ul className="mt-4 space-y-2">
                    {step.points.map((point) => (
                      <li key={point} className="flex items-start gap-2 text-sm text-zinc-300">
                        <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-purple-400" /> {point}
                      </li>
                    ))}
                  </ul>
                </Reveal>
                <Reveal from={index % 2 ? "left" : "right"} delay={150}
                  className={`mx-auto w-full max-w-md transition-transform hover:-translate-y-1 ${index % 2 ? "lg:order-1" : ""}`}>
                  {step.visual(persona)}
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* What it will never do. */}
      <section className="px-4 sm:px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl sm:text-3xl font-bold">Your name, your rules</h2>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {PROMISES.map(({ icon: Icon, text }, i) => (
              <Reveal key={text} delay={i * 90} className="spotlight flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-1 hover:border-purple-500/50 hover:shadow-lg hover:shadow-purple-900/20">
                <Icon size={22} className="mt-0.5 shrink-0 text-purple-300" />
                <p className="text-zinc-300">{text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* The only call to action, after the visitor has seen what they get. */}
      <section className="px-4 sm:px-6 pb-24 pt-8">
        <Reveal from="scale"
          className="spotlight relative mx-auto max-w-3xl overflow-hidden rounded-3xl border border-purple-500/30 bg-gradient-to-br from-purple-600/20 via-zinc-900 to-zinc-900 px-6 py-10 text-center sm:px-10 sm:py-12">

          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-2xl font-bold tracking-tight sm:text-3xl">
              {signedIn ? (
                <>Your next job abroad is <span className="text-purple-400">closer than you think.</span></>
              ) : (
                <>A whole continent of jobs. <span className="text-purple-400">One click to apply.</span></>
              )}
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm text-zinc-400 sm:text-base">
              {signedIn
                ? "Your matches and drafts are waiting."
                : "Set up your profile once. JobPilot does the rest."}
            </p>
            <div className={`mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row ${signedIn === undefined ? "invisible" : ""}`}>
              <Link
                href={signedIn ? "/jobs" : "/login?signup=1"}
                className="group inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-white px-6 py-3 font-semibold text-black shadow-md transition duration-200 hover:scale-105 hover:bg-purple-600 hover:text-white sm:w-auto"
              >
                {signedIn ? "See my matches" : "Get started, it's free"}
                <ArrowRight size={18} className="transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
              <Link
                href={signedIn ? "/jobpilot?tab=drafts" : "/jobs"}
                className="inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-zinc-600 px-6 py-3 font-semibold transition duration-200 hover:border-purple-500 hover:text-purple-200 sm:w-auto"
              >
                {signedIn ? <><Mail size={17} /> Review my drafts</> : <><Search size={17} /> Browse today&apos;s jobs</>}
              </Link>
            </div>
            {signedIn === false ? (
              <p className="mt-5 text-sm text-zinc-500">
                Already have an account?{" "}
                <Link href="/login" className="text-purple-300 hover:underline">
                  Sign in
                </Link>
              </p>
            ) : null}
          </div>
        </Reveal>
      </section>
    </div>
  );
}
