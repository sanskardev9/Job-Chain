"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import Navbar from "./Navbar";
import Footer from "./Footer";
import Loader from "./Loader";
import RunTray from "./RunTray";

// Pages only for signed-in users. Home, Jobs (view-only preview) and Login are public.
const PRIVATE_PREFIXES = ["/bookmarks", "/applied", "/jobpilot", "/profile", "/drafts", "/gmail"];
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

  const blocked = isPrivate(pathname) && session === null;

  useEffect(() => {
    if (blocked && !signedOut.current) router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
  }, [blocked, pathname, router]);

  if (pathname === "/login") {
    return <div className="min-h-screen bg-zinc-950">{children}</div>;
  }

  // Private page: show nothing until we know the visitor is signed in.
  const waiting = isPrivate(pathname) && !session;

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950">
      <Navbar />
      <main className="flex-1">
        {waiting ? (
          <div className="min-h-[calc(100svh-9rem)] flex items-center justify-center">
            <Loader size="lg" />
          </div>
        ) : (
          children
        )}
      </main>
      <Footer />
      {session?.user ? <RunTray userId={session.user.id} /> : null}
    </div>
  );
}
