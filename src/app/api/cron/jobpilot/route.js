import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Vercel sends CRON_SECRET as a Bearer token. The same endpoint can be called by another
// scheduler as long as it sends that header; it is never callable with a user's session.
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Automation is not configured" }, { status: 500 });
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: queued, error } = await supabase.rpc("queue_active_jobpilot_searches", {
    p_active_days: 7,
    p_min_hours: 24,
    p_limit: 100,
  });
  if (error) {
    console.error("Could not queue automatic JobPilot searches", error);
    return NextResponse.json({ error: "Could not queue searches" }, { status: 500 });
  }

  if (queued > 0 && process.env.NEXT_PUBLIC_JOBPILOT_WORKER_URL) {
    const worker = process.env.NEXT_PUBLIC_JOBPILOT_WORKER_URL.replace(/\/$/, "");
    try {
      await fetch(`${worker}/health`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    } catch {
      // A timeout is normal while a sleeping worker starts; receiving the request is enough.
    }
  }

  return NextResponse.json({ ok: true, queued, activeWindowDays: 7 });
}
