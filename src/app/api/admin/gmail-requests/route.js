import { requireOwner } from "../../../../lib/serverAuth";

export async function PATCH(request) {
  const { admin, error } = await requireOwner(request);
  if (error) return error;
  const { id, status, note } = await request.json().catch(() => ({}));
  if (!id || !["approved", "rejected", "pending"].includes(status)) {
    return Response.json({ error: "Invalid request update." }, { status: 400 });
  }
  const { data, error: updateError } = await admin.from("gmail_access_requests").update({
    status,
    review_note: String(note || "").trim().slice(0, 500) || null,
    reviewed_at: status === "pending" ? null : new Date().toISOString(),
  }).eq("id", id).select("*").single();
  if (updateError) return Response.json({ error: updateError.message }, { status: 500 });
  return Response.json({ request: data });
}
