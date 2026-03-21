import { NextResponse } from "next/server";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const shop = searchParams.get("shop");
  const hmac = searchParams.get("hmac");

  if (!code || !shop) {
    return NextResponse.json({ error: "Missing code or shop" }, { status: 400 });
  }

  try {
    // Exchange the code for a permanent access token
    const tokenResponse = await fetch(
      `https://${shop}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: process.env.SHOPIFY_CLIENT_ID,
          client_secret: process.env.SHOPIFY_CLIENT_SECRET,
          code: code,
        }),
      }
    );

    const tokenData = await tokenResponse.json();

    if (tokenData.access_token) {
      // LOG THE TOKEN - copy this from your Netlify function logs
      // then add it as SHOPIFY_ACCESS_TOKEN in Netlify env vars
      console.log("=== SHOPIFY ACCESS TOKEN ===");
      console.log(tokenData.access_token);
      console.log("=== SAVE THIS TOKEN ===");

      // Redirect to the returns portal home
      return NextResponse.redirect(new URL("/", request.url));
    } else {
      console.error("Token exchange failed:", tokenData);
      return NextResponse.json(
        { error: "Token exchange failed", details: tokenData },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("OAuth error:", error);
    return NextResponse.json(
      { error: "OAuth callback failed" },
      { status: 500 }
    );
  }
}
