import { requireOwner } from "../../../../lib/serverAuth";

export async function GET(request) {
  const { admin, error } = await requireOwner(request);
  if (error) return error;
  const [{ data: auth }, { data: requests }, { data: profiles }, { data: accounts }, { data: drafts }] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from("gmail_access_requests").select("*").order("requested_at", { ascending: false }),
    admin.from("profiles").select("id, full_name, last_active_at"),
    admin.from("email_accounts").select("user_id, email, connected_at"),
    admin.from("application_drafts").select("user_id, status"),
  ]);
  const profileById = Object.fromEntries((profiles || []).map((profile) => [profile.id, profile]));
  const accountById = Object.fromEntries((accounts || []).map((account) => [account.user_id, account]));
  const draftCounts = {};
  for (const draft of drafts || []) {
    draftCounts[draft.user_id] ||= { draft: 0, sent: 0, failed: 0 };
    if (draftCounts[draft.user_id][draft.status] != null) draftCounts[draft.user_id][draft.status] += 1;
  }
  const users = (auth?.users || []).map((user) => ({
    id: user.id,
    email: user.email,
    full_name: profileById[user.id]?.full_name || user.user_metadata?.full_name || null,
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at,
    last_active_at: profileById[user.id]?.last_active_at || null,
    gmail: accountById[user.id] || null,
    drafts: draftCounts[user.id] || { draft: 0, sent: 0, failed: 0 },
  }));
  return Response.json({ users, requests: requests || [] });
}
