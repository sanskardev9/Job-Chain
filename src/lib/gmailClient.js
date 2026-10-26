import { supabase } from "./supabaseClient";

export const GMAIL_STATE_KEY = "jobchain:gmail-oauth-state";

// Starts Google's consent screen; /gmail/callback finishes the connection.
export async function startGmailConnect() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Please sign in first.");

  const state = crypto.randomUUID();
  sessionStorage.setItem(GMAIL_STATE_KEY, state);

  const response = await fetch("/api/gmail/auth-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ state }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Could not start Gmail connection.");
  window.location.assign(body.url);
}
