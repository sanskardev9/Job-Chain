"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, ShieldCheck, Sparkles } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { switchMode } from "../lib/adminMode";

const BOOKMARKS_UPDATED_EVENT = "jobchain:bookmarks-updated";

// Signed-in app menu (desktop). Phones use the bottom tabs; Profile opens from the avatar.
const LINKS = [
  { href: "/home", label: "Home" },
  { href: "/jobs", label: "Jobs" },
  { href: "/bookmarks", label: "Bookmarks", count: "bookmarks" },
  { href: "/applied", label: "Applied", count: "applied" },
];

export default function Navbar() {
  const [user, setUser] = useState(null);
  // False until the session is known, so logged-in users never see the logged-out bar flash.
  const [authChecked, setAuthChecked] = useState(false);
  const [bookmarkCount, setBookmarkCount] = useState(0);
  const [appliedCount, setAppliedCount] = useState(0);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const pathname = usePathname();
  const router = useRouter();
  const rawDisplayName =
    user?.user_metadata?.full_name?.trim() ||
    user?.user_metadata?.name?.trim() ||
    user?.identities?.[0]?.identity_data?.full_name?.trim() ||
    user?.identities?.[0]?.identity_data?.name?.trim() ||
    user?.email?.split("@")?.[0] ||
    "";
  const displayName = rawDisplayName.split(" ")[0] || "";

  useEffect(() => {
    let isMounted = true;

    const loadUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!error && isMounted) {
        setUser(data.user ?? null);
        setAuthChecked(true);
      }
    };

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthChecked(true);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const loadNavCounts = async () => {
      if (!user) {
        setBookmarkCount(0);
        setAppliedCount(0);
        return;
      }

      const [{ count: savedCount, error: savedError }, { count: trackedCount, error: trackedError }] =
        await Promise.all([
          supabase
            .from("jobs")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("is_saved", true)
            .is("applied_at", null),
          supabase
            .from("jobs")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id)
            .not("applied_at", "is", null),
        ]);

      if (savedError) {
        console.error("Failed to load bookmark count", savedError);
      } else {
        setBookmarkCount(savedCount || 0);
      }

      if (trackedError) {
        console.error("Failed to load applied count", trackedError);
      } else {
        setAppliedCount(trackedCount || 0);
      }
    };

    loadNavCounts();

    const handleBookmarksUpdated = (event) => {
      const delta = Number(event?.detail?.delta);
      if (!Number.isFinite(delta) || delta === 0) return;
      setBookmarkCount((current) => Math.max(0, current + delta));
    };

    window.addEventListener(BOOKMARKS_UPDATED_EVENT, handleBookmarksUpdated);
    // JobPilot sends (and marks jobs applied) in the background: recount now and then, and on return.
    const recount = setInterval(loadNavCounts, 30000);
    window.addEventListener("focus", loadNavCounts);
    return () => {
      clearInterval(recount);
      window.removeEventListener("focus", loadNavCounts);
      window.removeEventListener(BOOKMARKS_UPDATED_EVENT, handleBookmarksUpdated);
    };
  }, [user, pathname]);

  // Profile page's "Sign out" (phones) opens the same confirm dialog.
  useEffect(() => {
    const open = () => setShowSignOutConfirm(true);
    window.addEventListener("jobchain:request-signout", open);
    return () => window.removeEventListener("jobchain:request-signout", open);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(""), 1800);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const requestSignOut = () => {
    setShowSignOutConfirm(true);
  };

  const signOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    setShowSignOutConfirm(false);
    // Nothing personal stays on screen: always continue on the public home page.
    router.replace("/");
    setToastMessage("Signed out successfully");
    setSigningOut(false);
  };

  return (
    <header className="sticky top-0 z-50 h-16 w-full flex items-center justify-between gap-3 bg-zinc-950 px-4 border-b border-zinc-800/80 text-white sm:px-6">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <Image
          src="/chain.png"
          alt="JobChain logo"
          width={28}
          height={30}
          style={{ width: "auto", height: "auto" }}
          priority
        />
        <h1 className="text-xl sm:text-2xl font-extrabold hover:text-purple-600 transition-colors tracking-wide hover:drop-shadow-[0_0_15px_rgba(168,85,247,0.9)] duration-300 leading-tight whitespace-nowrap">
          <Link href={user ? "/home" : "/"}>Job-Chain</Link>
        </h1>
      </div>

      {!authChecked ? null : user ? (
        <div className="flex items-center gap-2">
          <nav className="hidden lg:block">
            <ul className="flex items-center gap-1 text-[15px] font-medium whitespace-nowrap">
              {LINKS.map((link) => {
                const count = link.count === "bookmarks" ? bookmarkCount : link.count === "applied" ? appliedCount : 0;
                const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors duration-200 ${
                        active ? "bg-purple-500/15 text-purple-200" : "text-zinc-300 hover:bg-zinc-800/70 hover:text-white"
                      }`}
                    >
                      {link.label}
                      {count > 0 ? (
                        <span className="min-w-5 rounded-full bg-purple-500/25 px-1.5 text-center text-[11px] font-semibold leading-5 text-purple-100">{count}</span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
              <li className="ml-1">
                <Link
                  href="/jobpilot"
                  className={`group relative inline-flex items-center gap-1.5 overflow-hidden rounded-full bg-gradient-to-r from-purple-600 via-fuchsia-600 to-indigo-600 px-4 py-1.5 font-semibold text-white shadow-lg shadow-purple-900/40 transition-transform hover:scale-[1.03] ${
                    pathname.startsWith("/jobpilot") || pathname.startsWith("/drafts") ? "ring-2 ring-white/60" : ""
                  }`}
                >
                  <Sparkles size={15} className="jp-twinkle" />
                  JobPilot
                </Link>
              </li>
            </ul>
          </nav>

          <div className="flex items-center gap-2 lg:ml-3 lg:border-l lg:border-zinc-800 lg:pl-4">
            {user.email?.toLowerCase() === "sanskar.dev09@gmail.com" ? (
              <Link href="/admin" aria-label="Admin" title="Admin"
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                  event.preventDefault();
                  switchMode(router, true);
                }}
                className="inline-flex rounded-lg border border-purple-500/40 p-2 text-purple-300 transition hover:bg-purple-500/10">
                <ShieldCheck size={16} />
              </Link>
            ) : null}
            <Link
              href="/profile"
              aria-label="Profile"
              title="Profile"
              className={`flex items-center gap-2 rounded-full transition ${pathname.startsWith("/profile") ? "ring-2 ring-purple-400 ring-offset-2 ring-offset-zinc-950" : "hover:opacity-90"}`}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-600 text-sm font-bold text-white">
                {(displayName || "?").charAt(0).toUpperCase()}
              </span>
            </Link>
            <span className="hidden text-sm font-medium text-zinc-300 lg:inline">{displayName}</span>
            <button
              type="button"
              onClick={requestSignOut}
              className="hidden rounded-lg border border-zinc-700 p-2 transition hover:border-purple-500 hover:text-purple-300 lg:inline-flex"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1 sm:gap-3">
          <Link
            href="/"
            className={`hidden sm:inline whitespace-nowrap rounded-lg px-2 sm:px-3 py-1.5 text-sm font-semibold transition hover:text-purple-300 ${
              pathname === "/" ? "text-purple-300" : "text-zinc-300"
            }`}
          >
            Home
          </Link>
          <Link
            href="/jobs"
            className={`hidden sm:inline whitespace-nowrap rounded-lg px-2 sm:px-3 py-1.5 text-sm font-semibold transition hover:text-purple-300 ${
              pathname === "/jobs" ? "text-purple-300" : "text-zinc-300"
            }`}
          >
            Jobs
          </Link>
          <Link
            href="/login"
            className="whitespace-nowrap rounded-lg px-2 sm:px-3 py-1.5 text-sm font-semibold text-zinc-300 hover:text-purple-300 transition"
          >
            Sign in
          </Link>
          <Link
            href="/login?signup=1"
            className="whitespace-nowrap rounded-lg bg-white px-3 sm:px-4 py-1.5 sm:py-2 text-sm font-semibold text-black hover:bg-purple-600 hover:text-white transition"
          >
            Get started
          </Link>
        </div>
      )}

      {showSignOutConfirm ? (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center px-4">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
            <h3 className="text-lg font-bold text-white">Confirm sign out</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Are you sure you want to sign out of Job-Chain?
            </p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowSignOutConfirm(false)}
                disabled={signingOut}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:border-zinc-500 transition disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={signOut}
                disabled={signingOut}
                className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-purple-600 hover:text-white transition disabled:opacity-60"
              >
                {signingOut ? "Signing out..." : "Sign out"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toastMessage ? (
        <div className="fixed top-20 right-6 z-[80] rounded-xl border border-purple-500/40 bg-zinc-900 px-4 py-2 text-sm font-medium text-purple-200 shadow-lg shadow-purple-900/30">
          {toastMessage}
        </div>
      ) : null}
    </header>
  );
}
