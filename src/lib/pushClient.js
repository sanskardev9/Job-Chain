import { supabase } from "./supabaseClient";

const keyBytes = (base64) => {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
};

export const pushSupported = () => typeof window !== "undefined" && window.isSecureContext &&
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const authed = async (method, body) => {
  const { data } = await supabase.auth.getSession();
  const response = await fetch("/api/push/subscribe", {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token || ""}` },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Could not update notifications.");
  return result;
};

export async function currentPushSubscription() {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) || null;
}

export async function enablePush() {
  if (!pushSupported()) throw new Error("Notifications require HTTPS and a supported browser.");
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) throw new Error("Push notifications are not configured yet.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications were not allowed in this browser.");
  await navigator.serviceWorker.register("/sw.js");
  const ready = await navigator.serviceWorker.ready;
  const subscription = await ready.pushManager.getSubscription() || await ready.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes(publicKey),
  });
  await authed("POST", { subscription: subscription.toJSON() });
  return true;
}

export const enableAdminPush = enablePush;

export async function disablePush() {
  const subscription = await currentPushSubscription();
  if (!subscription) return;
  await authed("DELETE", { endpoint: subscription.endpoint }).catch(() => {});
  await subscription.unsubscribe();
}
