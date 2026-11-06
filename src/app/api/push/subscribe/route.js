import { requireOwner } from "../../../../lib/serverAuth";

export async function POST(request) {
  const { admin, user, error } = await requireOwner(request);
  if (error) return error;
  const { subscription } = await request.json().catch(() => ({}));
  if (typeof subscription?.endpoint !== "string" || !subscription.endpoint.startsWith("https://") ||
      !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return Response.json({ error: "Invalid push subscription." }, { status: 400 });
  }
  const { error: saveError } = await admin.from("push_subscriptions").upsert({
    endpoint: subscription.endpoint.slice(0, 1000),
    user_id: user.id,
    p256dh: String(subscription.keys.p256dh).slice(0, 200),
    auth: String(subscription.keys.auth).slice(0, 100),
    user_agent: request.headers.get("user-agent")?.slice(0, 300) || null,
    last_used_at: new Date().toISOString(),
  }, { onConflict: "endpoint" });
  if (saveError) return Response.json({ error: saveError.message }, { status: 500 });
  return Response.json({ ok: true });
}
