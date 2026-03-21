import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const { sessionToken, shop } = await request.json();

    if (!sessionToken || !shop) {
      return NextResponse.json({ error: "Missing sessionToken or shop" }, { status: 400 });
    }

    const tokenResponse = await fetch(
      `https://${shop}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: process.env.SHOPIFY_CLIENT_ID,
          client_secret: process.env.SHOPIFY_CLIENT_SECRET,
          grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
          subject_token: sessionToken,
          subject_token_type: "urn:ietf:params:oauth:token-type:id-token",
          requested_token_type: "urn:ietf:params:oauth:token-type:offline-access-token",
        }),
      }
    );

    const tokenData = await tokenResponse.json();
    return NextResponse.json(tokenData);
  } catch (error) {
    console.error("Token exchange error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}