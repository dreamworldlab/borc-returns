import { NextResponse } from 'next/server';

export function middleware(request) {
  const { searchParams } = request.nextUrl;
  const shop = searchParams.get('shop');
  const hmac = searchParams.get('hmac');

  // Shopify sends ?shop=...&hmac=...&timestamp=... when merchant clicks install
  // If we see shop + hmac but NO code, we need to redirect to OAuth authorize
  if (shop && hmac && !searchParams.get('code')) {
    const clientId = process.env.SHOPIFY_CLIENT_ID;

    const scopes = [
      'read_customers',
      'write_fulfillments',
      'read_gift_cards',
      'write_gift_cards',
      'read_orders',
      'read_products',
      'read_returns',
      'write_returns',
      'read_shipping',
    ].join(',');

    // Build the callback URL from the current request (no hardcoded domain needed)
    const appUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    const redirectUri = `${appUrl}/api/auth/callback`;

    // Random state for CSRF protection
    const state = crypto.randomUUID();

    const authUrl =
      `https://${shop}/admin/oauth/authorize` +
      `?client_id=${clientId}` +
      `&scope=${scopes}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${state}`;

    return NextResponse.redirect(authUrl);
  }

  return NextResponse.next();
}

// Only run middleware on the homepage (where Shopify redirects)
export const config = {
  matcher: '/',
};
