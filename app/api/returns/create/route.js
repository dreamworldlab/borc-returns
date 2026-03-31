import { NextResponse } from "next/server";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = "2026-01";
const EASYPOST_API_KEY = process.env.EASYPOST_API_KEY;
const KLAVIYO_API_KEY = process.env.KLAVIYO_API_KEY;

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

// ─── Verify shipping address via EasyPost ─────────────────────
async function verifyAddress(customerAddress) {
  if (!EASYPOST_API_KEY) return;

  const res = await fetch("https://api.easypost.com/v2/addresses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${EASYPOST_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      address: {
        name: customerAddress.name,
        street1: customerAddress.address1,
        street2: customerAddress.address2 || "",
        city: customerAddress.city,
        state: customerAddress.province_code || customerAddress.province,
        zip: customerAddress.zip,
        country: customerAddress.country_code || "US",
      },
      verify: ["delivery"],
    }),
  });

  const data = await res.json();
  const verifications = data?.verifications?.delivery;

  if (!verifications?.success) {
    const errors = (verifications?.errors || [])
      .map((e) => e.message)
      .join(", ");
    throw new Error(
      errors || "We couldn't verify your shipping address. Please contact support@birthofroyalchild.com for help with your return."
    );
  }
}

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

// ─── Save label URL to order metafield ────────────────────────
async function saveLabelToOrder(orderId, labelUrl) {
  const mutation = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const result = await shopifyGraphQL(mutation, {
    metafields: [
      {
        ownerId: `gid://shopify/Order/${orderId}`,
        namespace: "dbrman_returns",
        key: "label_url",
        type: "single_line_text_field",
        value: labelUrl,
      },
    ],
  });

  if (result.errors) {
    console.error("Metafield save error:", JSON.stringify(result.errors));
  }
}

// ─── Send return notification via Klaviyo ─────────────────────
async function sendKlaviyoEvent(order, selectedItems, creditOption, label) {
  if (!KLAVIYO_API_KEY) {
    console.warn("KLAVIYO_API_KEY not set — skipping email event");
    return;
  }

  try {
    const res = await fetch("https://a.klaviyo.com/api/events", {
      method: "POST",
      headers: {
        Authorization: `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
        "Content-Type": "application/json",
        revision: "2024-10-15",
      },
      body: JSON.stringify({
        data: {
          type: "event",
          attributes: {
            metric: {
              data: {
                type: "metric",
                attributes: {
                  name: "Return Submitted",
                },
              },
            },
            profile: {
              data: {
                type: "profile",
                attributes: {
                  email: order.email,
                },
              },
            },
            properties: {
              order_number: order.name,
              items: selectedItems,
              credit_option: creditOption,
              label_url: label?.labelUrl || null,
              tracking_code: label?.trackingCode || null,
              carrier: label?.carrier || "USPS",
            },
          },
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Klaviyo event error:", err);
    } else {
      console.log("Klaviyo event sent for", order.email);
    }
  } catch (err) {
    console.error("Klaviyo event failed:", err.message);
  }
}

// ─── Main handler ─────────────────────────────────────────────
export async function POST(request) {
  try {
    const body = await request.json();
    const { orderId, orderName, email, items, reasons, creditOption, shippingAddress } = body;

    if (!orderId || !items || items.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // 0. Verify shipping address before creating anything
    if (shippingAddress) {
      console.log("Verifying shipping address...");
      await verifyAddress(shippingAddress);
      console.log("Address verified");
    }

    // 1. Get fulfillment line item mapping
    console.log("Fetching fulfillment line items for order:", orderId);
    const fulfillmentMap = await getFulfillmentLineItems(orderId);

    // 2. Generate prepaid return label FIRST (before creating return)
    let label = null;
    if (shippingAddress) {
      console.log("Generating return label...");
      label = await generateReturnLabel(shippingAddress);
      if (label && label.labelUrl) {
        console.log("Label generated:", label.trackingCode);
        await saveLabelToOrder(orderId, label.labelUrl);
        console.log("Label URL saved to order metafield");
      }
    }

    // 3. Create the return in Shopify (triggers email AFTER metafield is saved)
    console.log("Creating return in Shopify...");
    const shopifyReturn = await createShopifyReturn(
      orderId,
      items,
      reasons,
      fulfillmentMap
    );
    console.log("Return created:", shopifyReturn.id);

    // 4. Send Klaviyo notification event
    await sendKlaviyoEvent(
      { email, name: orderName },
      items,
      creditOption,
      label
    );

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
