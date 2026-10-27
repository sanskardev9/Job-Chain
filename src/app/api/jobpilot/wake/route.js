import { NextResponse } from "next/server";

// Wakes the hosted JobPilot worker (Render free plan sleeps when idle). Done server-side so
// browser shields/ad-blockers cannot block the request.
export async function POST() {
  const url = process.env.NEXT_PUBLIC_JOBPILOT_WORKER_URL;
  if (!url) return NextResponse.json({ ok: false, reason: "no worker url" });
  try {
    // Do not wait for a full cold start; the request reaching Render is what wakes it.
    await fetch(`${url.replace(/\/$/, "")}/health`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  } catch {
    // Timeouts are expected while the worker boots.
  }
  return NextResponse.json({ ok: true });
}
