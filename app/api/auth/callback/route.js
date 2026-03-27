import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const shop = searchParams.get('shop');

  // If no code or shop, something went wrong
  if (!code || !shop) {
    console.error('OAuth callback missing params:', { code: !!code, shop: !!shop });
    return new NextResponse(
      '<h1>Install Failed</h1><p>Missing authorization code. Go back and try the install link again.</p>',
      { status: 400, headers: { 'Content-Type': 'text/html' } }
    );
  }

  try {
    // Exchange the temporary code for a permanent access token
    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_CLIENT_ID,
        client_secret: process.env.SHOPIFY_CLIENT_SECRET,
        code,
      }),
    });

    const data = await tokenResponse.json();

    if (data.access_token) {
      // Log the token so you can grab it from Netlify logs
      console.log('========================================');
      console.log('=== SHOPIFY ACCESS TOKEN (copy this) ===');
      console.log(data.access_token);
      console.log('=== SHOP: ' + shop + ' ===');
      console.log('=== SCOPE: ' + (data.scope || 'unknown') + ' ===');
      console.log('========================================');

      // Show success page with the token visible (for development only)
      return new NextResponse(
        `<!DOCTYPE html>
        <html>
        <head><title>App Installed</title></head>
        <body style="font-family: system-ui; max-width: 600px; margin: 80px auto; padding: 20px;">
          <h1 style="color: green;">App Installed Successfully!</h1>
          <p>DBRMAN Returns has been installed on <strong>${shop}</strong>.</p>
          <div style="background: #f0f0f0; padding: 16px; border-radius: 8px; margin: 20px 0; word-break: break-all;">
            <p style="margin: 0 0 8px 0; font-weight: bold;">Your Access Token:</p>
            <code style="font-size: 14px;">${data.access_token}</code>
          </div>
          <p style="color: #666;">Copy this token and add it as <code>SHOPIFY_ACCESS_TOKEN</code> in your Netlify environment variables, then redeploy.</p>
          <p style="color: #999; font-size: 13px;">This token is also logged in your Netlify function logs.</p>
        </body>
        </html>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } }
      );
    }

    // Token exchange failed
    console.error('Token exchange failed:', JSON.stringify(data));
    return new NextResponse(
      `<h1>Token Exchange Failed</h1><pre>${JSON.stringify(data, null, 2)}</pre>`,
      { status: 500, headers: { 'Content-Type': 'text/html' } }
    );
  } catch (error) {
    console.error('OAuth callback error:', error.message);
    return new NextResponse(
      `<h1>Error</h1><p>${error.message}</p>`,
      { status: 500, headers: { 'Content-Type': 'text/html' } }
    );
  }
}
