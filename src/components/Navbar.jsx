"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

const BOOKMARKS_UPDATED_EVENT = "jobchain:bookmarks-updated";

export default function Navbar() {
  const [user, setUser] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [bookmarkCount, setBookmarkCount] = useState(0);
  const [appliedCount, setAppliedCount] = useState(0);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const pathname = usePathname();
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
      }
    };

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
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
            .eq("is_saved", true),
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
    return () => {
      window.removeEventListener(BOOKMARKS_UPDATED_EVENT, handleBookmarksUpdated);
    };
  }, [user, pathname]);

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
    setToastMessage("Signed out successfully");
    setSigningOut(false);
    setMobileOpen(false);
  };

  return (
    <header className="w-full flex items-center justify-between gap-3 bg-zinc-950 p-4 sm:p-4 shadow-md border-b border-zinc-800 text-white relative">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <Image
          src="/chain.png"
          alt="JobChain logo"
          width={28}
          height={30}
          priority
        />
        <h1 className="text-xl sm:text-2xl font-extrabold hover:text-purple-600 transition-colors tracking-wide hover:drop-shadow-[0_0_15px_rgba(168,85,247,0.9)] duration-300 leading-tight whitespace-nowrap">
          <Link href="/">Job-Chain</Link>
        </h1>
      </div>

      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="sidebar-nav-item sm:hidden rounded-lg border border-zinc-700 p-2 hover:border-purple-500 hover:text-purple-300 transition"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      <nav className="hidden sm:block sm:w-auto">
        <ul className="flex items-center justify-end gap-5 text-sm sm:text-lg font-semibold tracking-wide">
          <li>
            <Link
              href="/"
              className=" hover:drop-shadow-[0_0_15px_rgba(168,85,247,0.9)] hover:text-purple-600 transition-colors duration-200"
            >
              Home
            </Link>
          </li>
          <li>
            <Link
              href="/jobs"
              className="hover:drop-shadow-[0_0_15px_rgba(168,85,247,0.9)] hover:text-purple-600 transition-colors duration-200"
            >
              Jobs
            </Link>
          </li>
          <li>
            <Link
              href="/bookmarks"
              className="relative inline-flex hover:drop-shadow-[0_0_15px_rgba(168,85,247,0.9)] hover:text-purple-600 transition-colors duration-200"
            >
              Bookmarks
              {bookmarkCount > 0 ? (
                <span className="absolute -top-2 -right-4 min-w-5 rounded-full border border-purple-500/50 bg-purple-500/20 px-1.5 text-[10px] leading-5 text-purple-200 text-center">
                  {bookmarkCount}
                </span>
              ) : null}
            </Link>
          </li>
          <li>
            <Link
              href="/applied"
              className="relative inline-flex hover:drop-shadow-[0_0_15px_rgba(168,85,247,0.9)] hover:text-purple-600 transition-colors duration-200"
            >
              Applied
              {appliedCount > 0 ? (
                <span className="absolute -top-2 -right-4 min-w-5 rounded-full border border-purple-500/50 bg-purple-500/20 px-1.5 text-[10px] leading-5 text-purple-200 text-center">
                  {appliedCount}
                </span>
              ) : null}
            </Link>
          </li>
          <li>
            {user ? (
              <div className="flex items-center gap-2 whitespace-nowrap">
                <span className="text-zinc-300 text-sm sm:text-base font-medium">
                  <span className="hidden lg:inline mr-2">| </span>
                  {displayName}
                </span>
                <button
                  type="button"
                  onClick={requestSignOut}
                  className="rounded-lg border border-zinc-700 p-2 hover:border-purple-500 hover:text-purple-300 transition"
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs sm:text-sm hover:border-purple-500 hover:text-purple-300 transition whitespace-nowrap"
              >
                Sign in
              </Link>
            )}
          </li>
        </ul>
      </nav>

      <div
        className={`sm:hidden fixed inset-0 z-50 transition-opacity duration-300 ${
          mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="absolute inset-0 bg-black/60"
          aria-label="Close menu backdrop"
        />
        <aside
          className={`absolute right-0 top-0 h-full w-55 bg-zinc-950 border-l border-zinc-800 shadow-2xl transition-transform duration-300 ease-out ${
            mobileOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
            <span className="font-bold">Menu</span>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="rounded-lg border border-zinc-700 p-2 hover:border-purple-500 hover:text-purple-300 transition"
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          </div>

          <ul className="flex items-start flex-col px-5 py-6 gap-1 text-lg font-semibold tracking-wide w-full">
            <li className="w-full">
              <Link
                href="/"
                onClick={() => setMobileOpen(false)}
                className={`sidebar-nav-item block w-full rounded-lg px-3 py-3 transition ${
                  pathname === "/"
                    ? "bg-purple-500/15 text-purple-300 border border-purple-500/40"
                    : "text-white"
                }`}
              >
                Home
              </Link>
            </li>
            <li className="w-full">
              <Link
                href="/jobs"
                onClick={() => setMobileOpen(false)}
                className={`sidebar-nav-item block w-full rounded-lg px-3 py-3 transition ${
                  pathname === "/jobs"
                    ? "bg-purple-500/15 text-purple-300 border border-purple-500/40"
                    : "text-white"
                }`}
              >
                Jobs
              </Link>
            </li>
            <li className="w-full">
              <Link
                href="/bookmarks"
                onClick={() => setMobileOpen(false)}
                className={`sidebar-nav-item relative block w-full rounded-lg px-3 py-3 transition ${
                  pathname === "/bookmarks"
                    ? "bg-purple-500/15 text-purple-300 border border-purple-500/40"
                    : "text-white"
                }`}
              >
                Bookmarks
                {bookmarkCount > 0 ? (
                  <span className="absolute top-4 sm:top-2 right-3 min-w-5 rounded-full border border-purple-500/50 bg-purple-500/20 px-1.5 text-[10px] leading-5 text-purple-200 text-center">
                    {bookmarkCount}
                  </span>
                ) : null}
              </Link>
            </li>
            <li className="w-full">
              <Link
                href="/applied"
                onClick={() => setMobileOpen(false)}
                className={`sidebar-nav-item relative block w-full rounded-lg px-3 py-3 transition ${
                  pathname === "/applied"
                    ? "bg-purple-500/15 text-purple-300 border border-purple-500/40"
                    : "text-white"
                }`}
              >
                Applied
                {appliedCount > 0 ? (
                  <span className="absolute top-4 sm:top-2 right-3 min-w-5 rounded-full border border-purple-500/50 bg-purple-500/20 px-1.5 text-[10px] leading-5 text-purple-200 text-center">
                    {appliedCount}
                  </span>
                ) : null}
              </Link>
            </li>
            <li className="pt-4 w-full">
              {user ? (
                <div className="sidebar-nav-item mb-3 w-full rounded-lg border border-zinc-800 px-3 py-2 flex items-center justify-between">
                  <p className="text-base font-medium text-zinc-300">{displayName}</p>
                  <button
                    type="button"
                    onClick={requestSignOut}
                    className="rounded-lg border border-zinc-700 p-2 text-white hover:border-purple-500 hover:text-purple-300 transition"
                    aria-label="Sign out"
                    title="Sign out"
                  >
                    <LogOut size={16} />
                  </button>
                </div>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="sidebar-nav-item w-full rounded-lg border border-zinc-700 px-3 py-2 text-sm text-white hover:border-purple-500 hover:text-purple-300 transition inline-block"
                >
                  Sign in
                </Link>
              )}
            </li>
          </ul>
        </aside>
      </div>

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
