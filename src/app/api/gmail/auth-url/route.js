import { NextResponse } from "next/server";
import { GMAIL_SCOPES, googleConfig, redirectUri, userFromRequest } from "../../../../lib/gmailServer";

export async function POST(request) {
  const { error } = await userFromRequest(request);
  if (error) return NextResponse.json({ error }, { status: 401 });

  const { state } = await request.json().catch(() => ({}));
  if (!state || typeof state !== "string") {
    return NextResponse.json({ error: "Missing state." }, { status: 400 });
  }

  try {
    const { clientId } = googleConfig();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri(request),
      response_type: "code",
      scope: GMAIL_SCOPES.join(" "),
      access_type: "offline",
      // Always show consent so Google returns a refresh token on reconnect too.
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });
    return NextResponse.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
