"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

export default function Navbar() {
  const [user, setUser] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

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

  const signOut = async () => {
    await supabase.auth.signOut();
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
              className="hover:drop-shadow-[0_0_15px_rgba(168,85,247,0.9)] hover:text-purple-600 transition-colors duration-200"
            >
              Bookmarks
            </Link>
          </li>
          <li>
            <Link
              href="/applied"
              className="hover:drop-shadow-[0_0_15px_rgba(168,85,247,0.9)] hover:text-purple-600 transition-colors duration-200"
            >
              Applied
            </Link>
          </li>
          <li>
            {user ? (
              <button
                type="button"
                onClick={signOut}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs sm:text-sm hover:border-purple-500 hover:text-purple-300 transition whitespace-nowrap"
              >
                Sign out
              </button>
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
                className={`sidebar-nav-item block w-full rounded-lg px-3 py-3 transition ${
                  pathname === "/bookmarks"
                    ? "bg-purple-500/15 text-purple-300 border border-purple-500/40"
                    : "text-white"
                }`}
              >
                Bookmarks
              </Link>
            </li>
            <li className="w-full">
              <Link
                href="/applied"
                onClick={() => setMobileOpen(false)}
                className={`sidebar-nav-item block w-full rounded-lg px-3 py-3 transition ${
                  pathname === "/applied"
                    ? "bg-purple-500/15 text-purple-300 border border-purple-500/40"
                    : "text-white"
                }`}
              >
                Applied
              </Link>
            </li>
            <li className="pt-4 w-full">
              {user ? (
                <button
                  type="button"
                  onClick={signOut}
                  className="sidebar-nav-item w-full rounded-lg border border-zinc-700 px-3 py-2 text-sm text-white hover:border-purple-500 hover:text-purple-300 transition"
                >
                  Sign out
                </button>
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
    </header>
  );
}
