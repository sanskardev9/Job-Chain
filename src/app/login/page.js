"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import Loader from "../../components/Loader";

function LoginPageContent() {
  const [loading, setLoading] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/jobs";

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        router.replace(redirectTo);
      }
    };

    checkSession();
  }, [router, redirectTo]);

  const signInWithEmail = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setErrorMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      const normalized = (error.message || "").toLowerCase();
      if (
        normalized.includes("invalid login credentials") ||
        normalized.includes("invalid credentials")
      ) {
        setErrorMessage("No account found with this email, or password is incorrect.");
      } else {
        setErrorMessage(error.message);
      }
      setLoading(false);
      return;
    }

    router.replace(redirectTo);
    setLoading(false);
  };

  const signUpWithEmail = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setErrorMessage("");

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: name.trim(),
        },
      },
    });

    if (error) {
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      router.replace(redirectTo);
      setLoading(false);
      return;
    }

    setMessage(
      "Account created. If email confirmation is enabled, verify your email, then sign in."
    );
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white px-6 flex items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-lg">
        <div className="mb-6 flex flex-col items-center justify-center gap-3">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/chain.png" alt="JobChain logo" width={34} height={38} priority />
            <h1 className="text-2xl font-extrabold tracking-wide">Job-Chain</h1>
          </Link>
        </div>
        <p className="text-zinc-400 mb-6">
          Sign in to access job listings, save jobs, and track application status.
        </p>
        <form onSubmit={showSignup ? signUpWithEmail : signInWithEmail} className="space-y-4">
          {showSignup ? (
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              required
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-600"
            />
          ) : null}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-600"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            minLength={6}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-600"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-white px-4 py-3 text-black font-semibold hover:bg-purple-600 hover:text-white transition disabled:opacity-70 flex items-center justify-center"
          >
            {loading ? (
              <Loader size="sm" className="border-zinc-300 border-t-black" />
            ) : showSignup ? (
              "Create Account"
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        {!showSignup ? (
          <p className="mt-4 text-sm text-zinc-400">
            New user?{" "}
            <button
              type="button"
              onClick={() => {
                setShowSignup(true);
                setMessage("");
                setErrorMessage("");
              }}
              className="font-semibold text-purple-400 hover:text-purple-300"
            >
              Sign up
            </button>
          </p>
        ) : (
          <p className="mt-4 text-sm text-zinc-400">
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => {
                setShowSignup(false);
                setMessage("");
                setErrorMessage("");
              }}
              className="font-semibold text-purple-400 hover:text-purple-300"
            >
              Sign in
            </button>
          </p>
        )}

        {errorMessage ? (
          <p className="mt-4 text-sm text-red-400">{errorMessage}</p>
        ) : null}
        {message ? <p className="mt-4 text-sm text-emerald-400">{message}</p> : null}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
