import { requireUser } from "../../../../lib/serverAuth";
import { notifyOwner } from "../../../../lib/pushServer";

const validEmail = (email) => /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(email);

export async function GET(request) {
  const { admin, user, error } = await requireUser(request);
  if (error) return error;
  const { data, error: readError } = await admin.from("gmail_access_requests")
    .select("id, requested_email, status, requested_at, reviewed_at, review_note")
    .eq("user_id", user.id).maybeSingle();
  if (readError) return Response.json({ error: readError.message }, { status: 500 });
  return Response.json({ request: data || null });
}

export async function POST(request) {
  const { admin, user, error } = await requireUser(request);
  if (error) return error;
  const body = await request.json().catch(() => ({}));
  const requestedEmail = String(body.email || "").trim().toLowerCase();
  if (!validEmail(requestedEmail)) return Response.json({ error: "Enter a valid Gmail address." }, { status: 400 });
  if (!requestedEmail.endsWith("@gmail.com") && !requestedEmail.endsWith("@googlemail.com")) {
    return Response.json({ error: "Use the Gmail address you will choose on Google's connection screen." }, { status: 400 });
  }

  const { data: existing } = await admin.from("gmail_access_requests").select("*").eq("user_id", user.id).maybeSingle();
  if (existing?.requested_email === requestedEmail && ["pending", "approved", "connected"].includes(existing.status)) {
    return Response.json({ request: existing, alreadyRequested: true });
  }

  const fullName = user.user_metadata?.full_name || user.email?.split("@")[0] || "JobChain user";
  const { data, error: saveError } = await admin.from("gmail_access_requests").upsert({
    user_id: user.id,
    account_email: user.email,
    full_name: fullName,
    requested_email: requestedEmail,
    status: "pending",
    requested_at: new Date().toISOString(),
    reviewed_at: null,
    review_note: null,
  }, { onConflict: "user_id" }).select("id, requested_email, status, requested_at, reviewed_at, review_note").single();
  if (saveError) return Response.json({ error: saveError.message }, { status: 500 });

  const notification = await notifyOwner(admin, {
    title: "New Gmail access request",
    body: `${fullName} wants to connect ${requestedEmail}`,
    url: "/admin?tab=requests",
    tag: `gmail-request-${user.id}`,
  }).catch(() => ({ sent: 0 }));
  return Response.json({ request: data, notified: Boolean(notification.sent) });
}
