import webpush from "web-push";
import { OWNER_EMAIL } from "./serverAuth";

let configured;
function init() {
  if (configured !== undefined) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  configured = Boolean(publicKey && privateKey);
  if (configured) webpush.setVapidDetails(`mailto:${OWNER_EMAIL}`, publicKey, privateKey);
  return configured;
}

export const pushConfigured = () => init();

export async function sendPush(admin, userIds, payload) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : userIds ? [userIds] : []).filter(Boolean))];
  if (!init() || !ids.length) return { sent: 0, failed: 0, removed: 0, users: 0, configured: init() };
  const { data: subscriptions, error: readError } = await admin.from("push_subscriptions")
    .select("endpoint, user_id, p256dh, auth").in("user_id", ids);
  if (readError) throw readError;
  let sent = 0;
  let failed = 0;
  const dead = [];
  const reachedUsers = new Set();
  await Promise.all((subscriptions || []).map(async (subscription) => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, JSON.stringify(payload), { TTL: 86400, urgency: "high" });
      sent += 1;
      reachedUsers.add(subscription.user_id);
    } catch (error) {
      if ([404, 410].includes(error.statusCode)) dead.push(subscription.endpoint);
      else failed += 1;
    }
  }));
  if (dead.length) await admin.from("push_subscriptions").delete().in("endpoint", dead);
  if (sent) {
    await admin.from("push_subscriptions").update({ last_used_at: new Date().toISOString() })
      .in("endpoint", (subscriptions || []).map((item) => item.endpoint).filter((endpoint) => !dead.includes(endpoint)));
  }
  return { sent, failed, removed: dead.length, users: reachedUsers.size, configured: true };
}

export async function notifyOwner(admin, payload) {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const owner = data?.users?.find((user) => (user.email || "").toLowerCase() === OWNER_EMAIL);
  return sendPush(admin, owner?.id, payload);
}
