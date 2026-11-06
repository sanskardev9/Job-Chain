import { requireOwner } from "../../../../lib/serverAuth";
import { pushConfigured, sendPush } from "../../../../lib/pushServer";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request) {
  const { admin, error } = await requireOwner(request);
  if (error) return error;
  const [{ data: devices, error: deviceError }, { data: messages, error: messageError }] = await Promise.all([
    admin.from("push_subscriptions").select("user_id, user_agent, created_at, last_used_at").order("created_at", { ascending: false }),
    admin.from("notification_messages").select("id, user_ids, title, body, url, recipient_count, device_count, failed_count, created_at")
      .order("created_at", { ascending: false }).limit(40),
  ]);
  if (deviceError || messageError) return Response.json({ error: (deviceError || messageError).message }, { status: 500 });
  return Response.json({ configured: pushConfigured(), devices: devices || [], messages: messages || [] });
}

export async function POST(request) {
  const { admin, user, error } = await requireOwner(request);
  if (error) return error;
  const body = await request.json().catch(() => ({}));
  const title = String(body.title || "").trim().slice(0, 80);
  const message = String(body.body || "").trim().slice(0, 240);
  const url = typeof body.url === "string" && body.url.startsWith("/") && !body.url.startsWith("//")
    ? body.url.slice(0, 200) : "/home";
  const userIds = [...new Set((Array.isArray(body.userIds) ? body.userIds : []).filter((id) => UUID.test(id)))].slice(0, 500);
  if (!title) return Response.json({ error: "Add a notification title." }, { status: 400 });
  if (!userIds.length) return Response.json({ error: "Choose at least one user." }, { status: 400 });

  try {
    const result = await sendPush(admin, userIds, { title, body: message, url, tag: `jobchain-${Date.now()}` });
    const { error: logError } = await admin.from("notification_messages").insert({
      created_by: user.id,
      user_ids: userIds,
      title,
      body: message || null,
      url,
      recipient_count: userIds.length,
      device_count: result.sent,
      failed_count: result.failed,
    });
    if (logError) throw logError;
    return Response.json(result);
  } catch (sendError) {
    return Response.json({ error: sendError.message }, { status: 500 });
  }
}
