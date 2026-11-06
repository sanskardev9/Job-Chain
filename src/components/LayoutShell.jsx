"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import Navbar from "./Navbar";
import Footer from "./Footer";
import Loader from "./Loader";
import RunTray from "./RunTray";
import BackToTop from "./BackToTop";
import BottomTabs from "./BottomTabs";
import PullToRefresh from "./PullToRefresh";
import { getSetupStatus } from "../lib/setup";

// Pages only for signed-in users. Home, Jobs (view-only preview) and Login are public.
const PRIVATE_PREFIXES = ["/home", "/bookmarks", "/applied", "/jobpilot", "/profile", "/drafts", "/gmail", "/admin"];
// Pages that need the profile details first: new users start with the setup on /profile.
const NEEDS_PROFILE = ["/home", "/jobs", "/bookmarks", "/applied", "/jobpilot"];
const needsProfile = (pathname) => NEEDS_PROFILE.some((p) => pathname === p || pathname.startsWith(`${p}/`));
const SETUP_DONE_KEY = "jobchain:profile-ready";

const isPrivate = (pathname) => PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export default function LayoutShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  // undefined = not checked yet, null = signed out, object = signed in
  const [session, setSession] = useState(undefined);
  // Set when the user signs out, so they land on Home instead of being sent to Login.
  const signedOut = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next ?? null);
      // Signing out (here or in another tab) never leaves personal data on screen.
      if (event === "SIGNED_OUT") {
        signedOut.current = true;
        router.replace("/");
      }
      if (event === "SIGNED_IN") signedOut.current = false;
    });
    return () => subscription.unsubscribe();
  }, [router]);

  // Once Home is reached after signing out, private pages send visitors to Login again.
  useEffect(() => {
    if (pathname === "/") signedOut.current = false;
  }, [pathname]);

  // undefined = checking, true = profile details saved, false = new user (send to setup)
  const [profileReady, setProfileReady] = useState(undefined);
  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId) {
      setProfileReady(undefined);
      return;
    }
    let cached = false;
    try {
      cached = sessionStorage.getItem(SETUP_DONE_KEY) === userId;
    } catch {
      // ignore
    }
    if (cached) {
      setProfileReady(true);
      return;
    }
    getSetupStatus(userId).then((status) => {
      setProfileReady(status.profile);
      if (status.profile) {
        try {
          sessionStorage.setItem(SETUP_DONE_KEY, userId);
        } catch {
          // ignore
        }
      }
    });
    // Re-check after the profile is saved.
    const onSaved = () => setProfileReady(true);
    window.addEventListener("jobchain:profile-saved", onSaved);
    return () => window.removeEventListener("jobchain:profile-saved", onSaved);
  }, [userId, pathname]);

  // One lightweight heartbeat makes daily automation available only to people who have used
  // JobChain recently. The database itself rate-limits this update to once every six hours.
  useEffect(() => {
    if (!userId) return;
    supabase.rpc("mark_user_active").then(({ error }) => {
      if (error && error.code !== "PGRST202") console.error("Could not record recent activity", error);
    });
  }, [userId]);

  const toSetup = Boolean(userId) && needsProfile(pathname) && profileReady === false;

  useEffect(() => {
    if (toSetup) router.replace("/profile?welcome=1");
  }, [toSetup, router]);

  const blocked = isPrivate(pathname) && session === null;

  useEffect(() => {
    if (blocked && !signedOut.current) router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
  }, [blocked, pathname, router]);

  // Signed in: the app, not the website. Home goes to the personal command centre.
  const toApp = pathname === "/" && Boolean(session);
  useEffect(() => {
    if (toApp) router.replace("/home");
  }, [toApp, router]);

  if (pathname === "/login") {
    return <div className="min-h-screen bg-zinc-950"><PullToRefresh /><div key={pathname} className="jc-page-enter">{children}</div></div>;
  }

  if (pathname.startsWith("/admin")) {
    return session ? <div className="min-h-screen bg-zinc-950"><PullToRefresh /><div key={pathname} className="jc-page-enter">{children}</div></div> : (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center"><PullToRefresh /><Loader size="lg" /></div>
    );
  }

  // Private page: show nothing until we know the visitor is signed in.
  const waiting =
    (isPrivate(pathname) && !session) ||
    (Boolean(userId) && needsProfile(pathname) && profileReady !== true) ||
    // Home: wait for the session check so signed-in users never see the website flash.
    (pathname === "/" && session !== null);
  const tabs = Boolean(session?.user);

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950" data-tabs={tabs ? "1" : "0"}>
      <PullToRefresh />
      <Navbar />
      <main className="flex-1">
        {waiting ? (
          <div className="min-h-[calc(100svh-9rem)] flex items-center justify-center">
            <Loader size="lg" />
          </div>
        ) : (
          <div key={pathname} className="jc-page-enter">{children}</div>
        )}
      </main>
      <div className={tabs ? "pb-24 lg:pb-0" : ""}>
        <Footer />
      </div>
      {tabs ? <BottomTabs /> : null}
      {session?.user ? <RunTray userId={session.user.id} /> : null}
      <BackToTop />
    </div>
  );
}
