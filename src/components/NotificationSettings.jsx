"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { currentPushSubscription, disablePush, enablePush, pushSupported } from "../lib/pushClient";

export default function NotificationSettings({ compact = false }) {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    currentPushSubscription().then((subscription) => {
      setEnabled(Boolean(subscription));
      setReady(true);
    }).catch(() => setReady(true));
  }, []);

  const toggle = async () => {
    setBusy(true);
    setNote("");
    try {
      if (enabled) {
        await disablePush();
        setEnabled(false);
        setNote("Notifications turned off on this device.");
      } else {
        await enablePush();
        setEnabled(true);
        setNote("Notifications are on for this device.");
      }
    } catch (error) {
      setNote(error.message);
    }
    setBusy(false);
  };

  if (!ready) return null;
  const supported = pushSupported();
  return (
    <section className={compact ? "" : "rounded-2xl border border-zinc-800 bg-zinc-900 p-5"}>
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${enabled ? "bg-purple-500/15 text-purple-300" : "bg-zinc-800 text-zinc-400"}`}>
          {enabled ? <Bell size={19} /> : <BellOff size={19} />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-zinc-100">JobChain notifications</h2>
          <p className="text-xs leading-relaxed text-zinc-500">
            {supported ? "Get important JobPilot and account updates on this device." : "Notifications are unavailable in this browser. Use the HTTPS app in Chrome, Safari, Edge or Firefox."}
          </p>
        </div>
        {supported ? (
          <button type="button" onClick={toggle} disabled={busy}
            className={`min-h-10 shrink-0 rounded-xl px-3 text-sm font-semibold transition disabled:opacity-50 ${enabled ? "border border-zinc-700 text-zinc-300 hover:bg-zinc-800" : "bg-purple-600 text-white hover:bg-purple-500"}`}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : enabled ? "Turn off" : "Turn on"}
          </button>
        ) : null}
      </div>
      {note ? <p className={`mt-3 text-xs ${enabled ? "text-emerald-300" : "text-amber-300"}`}>{note}</p> : null}
    </section>
  );
}
