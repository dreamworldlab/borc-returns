import { NextResponse } from "next/server";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = "2026-01";

async function shopifyFetch(endpoint) {
  const res = await fetch(
    `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}/${endpoint}`,
    {
      headers: {
        "X-Shopify-Access-Token": ACCESS_TOKEN,
        "Content-Type": "application/json",
      },
    }
  );
  return res.json();
}

export async function POST(request) {
  try {
    const { orderNumber, email } = await request.json();

    if (!orderNumber || !email) {
      return NextResponse.json(
        { error: "Order number and email are required" },
        { status: 400 }
      );
    }

    if (!ACCESS_TOKEN) {
      return NextResponse.json(
        { error: "App not configured — missing access token" },
        { status: 500 }
      );
    }

    // Clean the order number — remove any prefix like "BORC" or "#"
    const cleanOrderNumber = orderNumber.replace(/[^0-9]/g, "");

    // Search for the order by order number
    const ordersData = await shopifyFetch(
      `orders.json?name=%23${cleanOrderNumber}&status=any&limit=1`
    );

    if (!ordersData.orders || ordersData.orders.length === 0) {
      return NextResponse.json(
        { error: "Order not found. Please check your order number." },
        { status: 404 }
      );
    }

    const order = ordersData.orders[0];

    // Verify email matches
    if (order.email?.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json(
        { error: "Email does not match the order. Please try again." },
        { status: 403 }
      );
    }

    // Check if order is within return window (30 days default)
    const RETURN_WINDOW_DAYS = 30;
    const orderDate = new Date(order.created_at);
    const now = new Date();
    const daysSinceOrder = Math.floor(
      (now - orderDate) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceOrder > RETURN_WINDOW_DAYS) {
      return NextResponse.json(
        {
          error: `This order is outside the ${RETURN_WINDOW_DAYS}-day return window.`,
        },
        { status: 400 }
      );
    }

    // Build clean line items for the frontend
    const items = order.line_items.map((item) => ({
      id: item.id,
      title: item.title,
      variant_title: item.variant_title,
      quantity: item.quantity,
      price: item.price,
      image: item.image?.src || null,
      sku: item.sku,
      fulfillment_status: item.fulfillment_status,
    }));

    return NextResponse.json({
      order: {
        id: order.id,
        name: order.name,
        email: order.email,
        created_at: order.created_at,
        financial_status: order.financial_status,
        fulfillment_status: order.fulfillment_status,
        total_price: order.total_price,
        currency: order.currency,
        days_since_order: daysSinceOrder,
        return_window_days: RETURN_WINDOW_DAYS,
        items: items,
        // Customer's shipping address (needed for return label generation)
        shipping_address: order.shipping_address
          ? {
              name: `${order.shipping_address.first_name} ${order.shipping_address.last_name}`,
              address1: order.shipping_address.address1,
              address2: order.shipping_address.address2,
              city: order.shipping_address.city,
              province: order.shipping_address.province,
              province_code: order.shipping_address.province_code,
              zip: order.shipping_address.zip,
              country: order.shipping_address.country,
              country_code: order.shipping_address.country_code,
              phone: order.shipping_address.phone,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Order lookup error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
