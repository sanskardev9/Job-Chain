// Server-only helpers for "Connect Gmail". Never import from a client component.
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const GMAIL_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.send",
];

export const redirectUri = (request) =>
  `${new URL(request.url).origin}/gmail/callback`;

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const tokenKey = process.env.GMAIL_TOKEN_KEY;
  if (!clientId || !clientSecret || !tokenKey) {
    throw new Error("Gmail is not configured on the server (GOOGLE_CLIENT_ID/SECRET, GMAIL_TOKEN_KEY).");
  }
  return { clientId, clientSecret, tokenKey };
}

// AES-256-GCM; output is base64(iv | ciphertext | tag). JobPilot decrypts the same format.
export function encryptToken(plaintext, base64Key) {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) throw new Error("GMAIL_TOKEN_KEY must be 32 bytes (base64).");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, ciphertext, cipher.getAuthTag()]).toString("base64");
}

// Supabase client acting as the signed-in user (anon key + their JWT), so RLS and auth.uid() apply.
export async function userFromRequest(request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return { error: "Not signed in." };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } }
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return { error: "Not signed in." };
  return { supabase, user: data.user };
}
