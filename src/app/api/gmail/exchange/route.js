import { NextResponse } from "next/server";
import {
  encryptToken,
  googleConfig,
  redirectUri,
  userFromRequest,
} from "../../../../lib/gmailServer";

const SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

export async function POST(request) {
  const { supabase, error } = await userFromRequest(request);
  if (error) return NextResponse.json({ error }, { status: 401 });

  const { code } = await request.json().catch(() => ({}));
  if (!code) return NextResponse.json({ error: "Missing code." }, { status: 400 });

  let config;
  try {
    config = googleConfig();
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri(request),
      grant_type: "authorization_code",
    }),
  });
  const tokens = await response.json();

  if (!response.ok) {
    return NextResponse.json(
      { error: tokens.error_description || tokens.error || "Google rejected the sign-in." },
      { status: 400 }
    );
  }
  if (!tokens.refresh_token) {
    return NextResponse.json(
      { error: "Google did not return a refresh token. Remove JobChain under myaccount.google.com/permissions and try again." },
      { status: 400 }
    );
  }
  if (!(tokens.scope || "").split(" ").includes(SEND_SCOPE)) {
    return NextResponse.json(
      { error: "Permission to send email was not granted. Please tick the Gmail checkbox on Google's screen." },
      { status: 400 }
    );
  }

  // The ID token comes straight from Google's token endpoint over TLS, so its claims can be read directly.
  const claims = JSON.parse(
    Buffer.from((tokens.id_token || "").split(".")[1] || "", "base64url").toString() || "{}"
  );
  if (!claims.email || claims.email_verified === false) {
    return NextResponse.json({ error: "Could not read a verified Gmail address." }, { status: 400 });
  }

  // During Google's testing phase, only addresses explicitly added by the owner may connect.
  // The exact Google account chosen must match the address the owner approved.
  const { data: accessRequest, error: requestError } = await supabase
    .from("gmail_access_requests")
    .select("requested_email, status")
    .eq("requested_email", claims.email.toLowerCase())
    .in("status", ["approved", "connected"])
    .maybeSingle();
  if (requestError || !accessRequest) {
    return NextResponse.json(
      { error: `Access for ${claims.email} has not been approved yet. Request access from your Profile first.` },
      { status: 403 }
    );
  }

  const { error: saveError } = await supabase.rpc("connect_gmail", {
    p_email: claims.email,
    p_refresh_token_encrypted: encryptToken(tokens.refresh_token, config.tokenKey),
    p_scope: tokens.scope,
  });
  if (saveError) {
    return NextResponse.json({ error: saveError.message }, { status: 500 });
  }

  if (accessRequest.status === "approved") {
    const { error: statusError } = await supabase.rpc("mark_gmail_request_connected", { p_email: claims.email });
    if (statusError) return NextResponse.json({ error: statusError.message }, { status: 500 });
  }

  return NextResponse.json({ email: claims.email });
}
