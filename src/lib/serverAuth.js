import { getSupabaseAdmin } from "./supabaseAdmin";

export const OWNER_EMAIL = "sanskar.dev09@gmail.com";

export async function requireUser(request) {
  const admin = getSupabaseAdmin();
  if (!admin) return { error: Response.json({ error: "Server access is not configured." }, { status: 503 }) };
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { error: Response.json({ error: "Sign in first." }, { status: 401 }) };
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return { error: Response.json({ error: "Sign in first." }, { status: 401 }) };
  return { admin, user: data.user };
}

export async function requireOwner(request) {
  const result = await requireUser(request);
  if (result.error) return result;
  if ((result.user.email || "").toLowerCase() !== OWNER_EMAIL) {
    return { error: Response.json({ error: "Owner access only." }, { status: 403 }) };
  }
  return result;
}
