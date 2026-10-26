"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { GMAIL_STATE_KEY } from "../../../lib/gmailClient";
import Loader from "../../../components/Loader";

export default function GmailCallbackPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const finish = async () => {
      const params = new URLSearchParams(window.location.search);
      const expectedState = sessionStorage.getItem(GMAIL_STATE_KEY);
      sessionStorage.removeItem(GMAIL_STATE_KEY);

      if (params.get("error")) {
        setErrorMessage("Gmail connection was cancelled.");
        return;
      }
      if (!params.get("code") || !expectedState || params.get("state") !== expectedState) {
        setErrorMessage("This link is invalid or expired. Please connect Gmail again from your profile.");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setErrorMessage("Please sign in, then connect Gmail again.");
        return;
      }

      const response = await fetch("/api/gmail/exchange", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ code: params.get("code") }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setErrorMessage(body.error || "Could not connect Gmail.");
        return;
      }
      router.replace("/profile?gmail=connected");
    };

    finish();
  }, [router]);

  return (
    <div className="min-h-[calc(100svh-9rem)] bg-zinc-950 text-white px-6 flex items-center justify-center">
      {errorMessage ? (
        <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
          <h1 className="text-2xl font-bold">Gmail not connected</h1>
          <p className="mt-3 text-zinc-400">{errorMessage}</p>
          <Link
            href="/profile"
            className="inline-block mt-6 rounded-xl bg-white px-4 py-2 text-black font-semibold hover:bg-purple-600 hover:text-white transition"
          >
            Back to profile
          </Link>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <Loader size="lg" />
          <p className="text-zinc-400">Connecting your Gmail...</p>
        </div>
      )}
    </div>
  );
}
