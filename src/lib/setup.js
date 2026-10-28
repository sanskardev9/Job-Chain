import { supabase } from "./supabaseClient";

// What a user still has to set up before JobPilot can work for them.
export async function getSetupStatus(userId) {
  const [{ data: profile }, { data: account }] = await Promise.all([
    supabase.from("candidate_profiles").select("skills, cv_storage_path").eq("user_id", userId).maybeSingle(),
    supabase.from("email_accounts").select("email").eq("user_id", userId).maybeSingle(),
  ]);
  const status = {
    profile: Boolean(profile?.skills?.length),
    cv: Boolean(profile?.cv_storage_path),
    gmail: Boolean(account?.email),
  };
  status.complete = status.profile && status.cv && status.gmail;
  return status;
}

// Short "what to do first" text for actions that need the full setup (e.g. Quick apply).
export function missingSetupText(status) {
  if (!status) return null;
  const missing = [
    !status.profile && "your profile details",
    !status.cv && "your CV",
    !status.gmail && "Gmail",
  ].filter(Boolean);
  if (!missing.length) return null;
  return `Finish setup first: add ${missing.join(", ").replace(/, ([^,]*)$/, " and $1")}.`;
}
