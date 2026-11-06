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

export async function sendPush(admin, userId, payload) {
  if (!init() || !userId) return { sent: 0, configured: false };
  const { data: subscriptions } = await admin.from("push_subscriptions")
    .select("endpoint, p256dh, auth").eq("user_id", userId);
  let sent = 0;
  const dead = [];
  await Promise.all((subscriptions || []).map(async (subscription) => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, JSON.stringify(payload), { TTL: 86400, urgency: "high" });
      sent += 1;
    } catch (error) {
      if ([404, 410].includes(error.statusCode)) dead.push(subscription.endpoint);
    }
  }));
  if (dead.length) await admin.from("push_subscriptions").delete().in("endpoint", dead);
  return { sent, configured: true };
}

export async function notifyOwner(admin, payload) {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const owner = data?.users?.find((user) => (user.email || "").toLowerCase() === OWNER_EMAIL);
  return sendPush(admin, owner?.id, payload);
}
