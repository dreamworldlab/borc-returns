import { NextResponse } from "next/server";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = "2026-01";
const EASYPOST_API_KEY = process.env.EASYPOST_API_KEY;

// BORC's return warehouse address
const RETURN_ADDRESS = {
  name: "BORC Returns",
  street1: "8 Catherine St",
  street2: "Suite 3B",
  city: "New York",
  state: "NY",
  zip: "10002",
  country: "US",
  phone: "",
};

// Map frontend reason strings to Shopify's ReturnReason enum
const REASON_MAP = {
  "Too small": "SIZE_TOO_SMALL",
  "Too large": "SIZE_TOO_LARGE",
  "Changed my mind": "UNWANTED",
  "Item not as described": "NOT_AS_DESCRIBED",
  "Received wrong item": "WRONG_ITEM",
  "Damaged / defective": "DEFECTIVE",
  Other: "OTHER",
};

// ─── Shopify GraphQL helper ───────────────────────────────────
async function shopifyGraphQL(query, variables = {}) {
  const res = await fetch(
    `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": ACCESS_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    }
  );
  return res.json();
}

// ─── Get fulfillment line item IDs for an order ───────────────
// Shopify's returnCreate mutation needs fulfillmentLineItemIds,
// not regular lineItem ids. This query fetches the mapping.
async function getFulfillmentLineItems(orderId) {
  const query = `
    query getReturnableItems($orderId: ID!) {
      returnableFulfillments(orderId: $orderId, first: 10) {
        edges {
          node {
            fulfillment {
              id
            }
            returnableFulfillmentLineItems(first: 50) {
              edges {
                node {
                  fulfillmentLineItem {
                    id
                    lineItem {
                      id
                    }
                  }
                  quantity
                }
              }
            }
          }
        }
      }
    }
  `;

  const result = await shopifyGraphQL(query, {
    orderId: `gid://shopify/Order/${orderId}`,
  });

  if (result.errors) {
    console.error("GraphQL errors (fulfillment lookup):", JSON.stringify(result.errors));
    throw new Error("Failed to fetch fulfillment data");
  }

  const mapping = {};
  const fulfillments = result.data?.returnableFulfillments?.edges || [];

  for (const edge of fulfillments) {
    for (const itemEdge of edge.node.returnableFulfillmentLineItems?.edges || []) {
      const node = itemEdge.node;
      const lineItemNumericId = node.fulfillmentLineItem.lineItem.id
        .replace("gid://shopify/LineItem/", "");
      mapping[lineItemNumericId] = {
        fulfillmentLineItemId: node.fulfillmentLineItem.id,
        maxQuantity: node.quantity,
      };
    }
  }

  return mapping;
}

// ─── Create the return in Shopify ─────────────────────────────
async function createShopifyReturn(orderId, items, reasons, fulfillmentMap) {
  const returnLineItems = [];

  for (const item of items) {
    const mapped = fulfillmentMap[String(item.id)];
    if (!mapped) {
      console.warn(`No fulfillment line item found for line item ${item.id} — skipping`);
      continue;
    }

    returnLineItems.push({
      fulfillmentLineItemId: mapped.fulfillmentLineItemId,
      quantity: item.quantity,
      returnReason: REASON_MAP[reasons[item.id]] || "OTHER",
      customerNote: reasons[item.id] || "",
    });
  }

  if (returnLineItems.length === 0) {
    throw new Error("No eligible items found for return. Items may not be fulfilled yet.");
  }

  const mutation = `
    mutation returnCreate($input: ReturnInput!) {
      returnCreate(returnInput: $input) {
        return {
          id
          name
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const result = await shopifyGraphQL(mutation, {
    input: {
      orderId: `gid://shopify/Order/${orderId}`,
      returnLineItems,
      notifyCustomer: true,
    },
  });

  if (result.errors) {
    console.error("GraphQL errors (returnCreate):", JSON.stringify(result.errors));
    throw new Error("Shopify API error creating return");
  }

  const userErrors = result.data?.returnCreate?.userErrors || [];
  if (userErrors.length > 0) {
    console.error("Return user errors:", JSON.stringify(userErrors));
    throw new Error(userErrors.map((e) => e.message).join(", "));
  }

  return result.data.returnCreate.return;
}

// ─── Generate a prepaid return label via EasyPost ─────────────
async function generateReturnLabel(customerAddress) {
  if (!EASYPOST_API_KEY) {
    console.warn("EASYPOST_API_KEY not set — skipping label generation");
    return null;
  }

  try {
    // Step 1: Create shipment (FROM = customer, TO = BORC warehouse)
    const shipmentRes = await fetch("https://api.easypost.com/v2/shipments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${EASYPOST_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        shipment: {
          from_address: {
            name: customerAddress.name,
            street1: customerAddress.address1,
            street2: customerAddress.address2 || "",
            city: customerAddress.city,
            state: customerAddress.province_code || customerAddress.province,
            zip: customerAddress.zip,
            country: customerAddress.country_code || "US",
            phone: customerAddress.phone || "",
          },
          to_address: RETURN_ADDRESS,
          parcel: {
            // Default parcel size for apparel returns
            length: 14,
            width: 10,
            height: 4,
            weight: 16, // 1 lb in ounces
          },
          is_return: true,
        },
      }),
    });

    const shipment = await shipmentRes.json();

    if (shipment.error) {
      console.error("EasyPost shipment error:", JSON.stringify(shipment.error));
      return null;
    }

    // Step 2: Find the cheapest USPS rate
    const uspsRates = (shipment.rates || [])
      .filter((r) => r.carrier === "USPS")
      .sort((a, b) => parseFloat(a.rate) - parseFloat(b.rate));

    // Fall back to any carrier if no USPS rates
    const allRates = (shipment.rates || []).sort(
      (a, b) => parseFloat(a.rate) - parseFloat(b.rate)
    );

    const selectedRate = uspsRates[0] || allRates[0];

    if (!selectedRate) {
      console.error("No shipping rates returned from EasyPost");
      return null;
    }

    // Step 3: Buy the label
    const buyRes = await fetch(
      `https://api.easypost.com/v2/shipments/${shipment.id}/buy`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${EASYPOST_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rate: { id: selectedRate.id },
        }),
      }
    );

    const purchased = await buyRes.json();

    if (purchased.error) {
      console.error("EasyPost buy error:", JSON.stringify(purchased.error));
      return null;
    }

    return {
      labelUrl: purchased.postage_label?.label_url || null,
      trackingCode: purchased.tracking_code || null,
      carrier: selectedRate.carrier,
      service: selectedRate.service,
      cost: selectedRate.rate,
    };
  } catch (err) {
    console.error("EasyPost label generation failed:", err.message);
    return null;
  }
}

// ─── Main handler ─────────────────────────────────────────────
export async function POST(request) {
  try {
    const body = await request.json();
    const { orderId, items, reasons, creditOption, shippingAddress } = body;

    if (!orderId || !items || items.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // 1. Get fulfillment line item mapping
    console.log("Fetching fulfillment line items for order:", orderId);
    const fulfillmentMap = await getFulfillmentLineItems(orderId);

    // 2. Create the return in Shopify
    console.log("Creating return in Shopify...");
    const shopifyReturn = await createShopifyReturn(
      orderId,
      items,
      reasons,
      fulfillmentMap
    );
    console.log("Return created:", shopifyReturn.id);

    // 3. Generate prepaid return label (if EasyPost is configured)
    let label = null;
    if (shippingAddress) {
      console.log("Generating return label...");
      label = await generateReturnLabel(shippingAddress);
      if (label) {
        console.log("Label generated:", label.trackingCode);
      }
    }

    return NextResponse.json({
      success: true,
      returnId: shopifyReturn.id,
      returnName: shopifyReturn.name,
      label: label,
    });
  } catch (error) {
    console.error("Return creation error:", error.message);
    return NextResponse.json(
      { error: error.message || "Something went wrong creating your return." },
      { status: 500 }
    );
  }
}
