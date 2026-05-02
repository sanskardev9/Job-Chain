"use client";

import Link from "next/link";

export default function JobsError({ error, reset }) {
  return (
    <div className="min-h-[calc(100svh-9rem)] bg-zinc-950 text-white px-6 flex items-center justify-center">
      <div className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-xl">
        <p className="text-xs uppercase tracking-[0.2em] text-red-400">Error</p>
        <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold">Something went wrong on Jobs</h1>
        <p className="mt-3 text-zinc-400">
          We hit an unexpected error while loading this page. Please try again.
        </p>
        {error?.digest ? (
          <p className="mt-3 text-xs text-zinc-500">Error ID: {error.digest}</p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-purple-600 hover:text-white transition"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:border-purple-500 hover:text-purple-300 transition"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
