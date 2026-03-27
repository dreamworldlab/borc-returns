"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const RETURN_REASONS = [
  "Too small",
  "Too large",
  "Changed my mind",
  "Item not as described",
  "Received wrong item",
  "Damaged / defective",
  "Other",
];

// Config — adjust these per client
const STORE_CREDIT_BONUS_PERCENT = 10;
const REFUND_FEE = 10;

export default function ReturnPage() {
  const [order, setOrder] = useState(null);
  const [selectedItems, setSelectedItems] = useState({});
  const [reasons, setReasons] = useState({});
  const [creditOption, setCreditOption] = useState(null);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [label, setLabel] = useState(null); // { labelUrl, trackingCode, carrier, service }
  const router = useRouter();

  useEffect(() => {
    const stored = sessionStorage.getItem("returnOrder");
    if (!stored) {
      router.push("/");
      return;
    }
    setOrder(JSON.parse(stored));
  }, [router]);

  if (!order) return null;

  // Calculate totals
  const selectedItemsList = order.items.filter((item) => selectedItems[item.id]);
  const itemsTotal = selectedItemsList.reduce(
    (sum, item) => sum + parseFloat(item.price) * (selectedItems[item.id] || 0),
    0
  );
  const storeCreditBonus = (itemsTotal * STORE_CREDIT_BONUS_PERCENT) / 100;
  const storeCreditTotal = itemsTotal + storeCreditBonus;
  const refundTotal = Math.max(0, itemsTotal - REFUND_FEE);

  function toggleItem(itemId, quantity) {
    setSelectedItems((prev) => {
      if (prev[itemId]) {
        const updated = { ...prev };
        delete updated[itemId];
        return updated;
      }
      return { ...prev, [itemId]: quantity };
    });
  }

  function setReason(itemId, reason) {
    setReasons((prev) => ({ ...prev, [itemId]: reason }));
  }

  function canProceedStep1() {
    const hasItems = Object.keys(selectedItems).length > 0;
    const allReasoned = Object.keys(selectedItems).every((id) => reasons[id]);
    return hasItems && allReasoned;
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/returns/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          items: selectedItemsList.map((item) => ({
            id: item.id,
            quantity: selectedItems[item.id],
          })),
          reasons,
          creditOption,
          shippingAddress: order.shipping_address,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to submit return");
      }

      // Store label info if we got one
      if (data.label) {
        setLabel(data.label);
      }

      setStep(4); // confirmation
    } catch (err) {
      console.error("Submit error:", err);
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="return-wrapper">
      <div className="return-container">
        {/* Header */}
        <div className="return-header">
          <h1>Birth Of Royal Child</h1>
          {step < 4 && <h2>Return — Order {order.name}</h2>}
        </div>

        {/* Step 1: Select items */}
        {step === 1 && (
          <div>
            <p className="section-label">Select items to return</p>

            {order.items.map((item) => (
              <div key={item.id}>
                <div
                  className={`item-card ${selectedItems[item.id] ? "selected" : ""}`}
                  onClick={() => toggleItem(item.id, item.quantity)}
                >
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.title}
                      className="item-image"
                    />
                  ) : (
                    <div
                      className="item-image"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.75rem",
                        color: "#aaa",
                      }}
                    >
                      No image
                    </div>
                  )}

                  <div className="item-details">
                    <div className="item-title">{item.title}</div>
                    <div className="item-variant">
                      {item.variant_title} · Qty: {item.quantity}
                    </div>
                  </div>

                  <div className="item-price">
                    ${parseFloat(item.price).toFixed(2)}
                  </div>
                </div>

                {selectedItems[item.id] && (
                  <div style={{ padding: "0 1.25rem 1rem", marginTop: "-0.5rem" }}>
                    <select
                      className="input-field"
                      value={reasons[item.id] || ""}
                      onChange={(e) => setReason(item.id, e.target.value)}
                      style={{ fontSize: "0.8125rem" }}
                    >
                      <option value="">Select a reason...</option>
                      {RETURN_REASONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            ))}

            <button
              className="btn-primary"
              disabled={!canProceedStep1()}
              onClick={() => setStep(2)}
              style={{ marginTop: "1.5rem" }}
            >
              Continue
            </button>

            <button
              onClick={() => router.push("/")}
              style={{
                width: "100%",
                padding: "0.875rem",
                background: "transparent",
                border: "2px solid #e2e2e2",
                borderRadius: "10px",
                fontSize: "0.9375rem",
                fontWeight: 600,
                cursor: "pointer",
                marginTop: "0.5rem",
              }}
            >
              Go back
            </button>
          </div>
        )}

        {/* Step 2: Credit option */}
        {step === 2 && (
          <div>
            <p className="section-label">Choose your return method</p>

            <div
              className={`credit-option ${creditOption === "store_credit" ? "selected" : ""}`}
              onClick={() => setCreditOption("store_credit")}
            >
              <div className="credit-option-icon">🎁</div>
              <div className="credit-option-details">
                <h3>Store credit</h3>
                <span className="bonus">
                  +${storeCreditBonus.toFixed(2)} Bonus credit
                </span>
                <p>
                  Receive a gift card code via email once your return has been
                  approved.
                </p>
              </div>
            </div>

            <div
              className={`credit-option ${creditOption === "refund" ? "selected" : ""}`}
              onClick={() => setCreditOption("refund")}
            >
              <div className="credit-option-icon">💳</div>
              <div className="credit-option-details">
                <h3>Refund to original payment method</h3>
                <span className="fee">-${REFUND_FEE.toFixed(2)} Fee</span>
                <p>
                  Receive a refund (minus applicable fees) to your original
                  payment method once your return is approved.
                </p>
              </div>
            </div>

            <button
              className="btn-primary"
              disabled={!creditOption}
              onClick={() => setStep(3)}
              style={{ marginTop: "1rem" }}
            >
              Continue
            </button>

            <button
              onClick={() => setStep(1)}
              style={{
                width: "100%",
                padding: "0.875rem",
                background: "transparent",
                border: "2px solid #e2e2e2",
                borderRadius: "10px",
                fontSize: "0.9375rem",
                fontWeight: 600,
                cursor: "pointer",
                marginTop: "0.5rem",
              }}
            >
              Go back
            </button>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div>
            <p className="section-label">Review your return</p>

            <div style={{ background: "#fff", borderRadius: 12, padding: "1.25rem", marginBottom: "1rem" }}>
              <p className="section-label" style={{ marginBottom: "0.5rem" }}>
                Items
              </p>
              {selectedItemsList.map((item) => (
                <div className="summary-row" key={item.id}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{item.title}</div>
                    <div style={{ fontSize: "0.8125rem", color: "#6b6b6b" }}>
                      {item.variant_title} · {reasons[item.id]}
                    </div>
                  </div>
                  <div>${parseFloat(item.price).toFixed(2)}</div>
                </div>
              ))}
            </div>

            <div style={{ background: "#fff", borderRadius: 12, padding: "1.25rem", marginBottom: "1rem" }}>
              <p className="section-label" style={{ marginBottom: "0.5rem" }}>
                Return summary
              </p>
              <div className="summary-row">
                <span>Item total</span>
                <span>${itemsTotal.toFixed(2)}</span>
              </div>

              {creditOption === "store_credit" ? (
                <>
                  <div className="summary-row">
                    <span style={{ color: "var(--success)" }}>
                      Store credit bonus ({STORE_CREDIT_BONUS_PERCENT}%)
                    </span>
                    <span style={{ color: "var(--success)" }}>
                      +${storeCreditBonus.toFixed(2)}
                    </span>
                  </div>
                  <div className="summary-row" style={{ fontWeight: 700 }}>
                    <span>Total estimated gift card</span>
                    <span>${storeCreditTotal.toFixed(2)}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="summary-row">
                    <span style={{ color: "var(--error)" }}>Return fee</span>
                    <span style={{ color: "var(--error)" }}>
                      -${REFUND_FEE.toFixed(2)}
                    </span>
                  </div>
                  <div className="summary-row" style={{ fontWeight: 700 }}>
                    <span>Total estimated refund</span>
                    <span>${refundTotal.toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Error message */}
            {submitError && (
              <div
                style={{
                  background: "#fff0f0",
                  border: "1px solid #ffcdd2",
                  borderRadius: 10,
                  padding: "1rem 1.25rem",
                  marginBottom: "1rem",
                  color: "#c62828",
                  fontSize: "0.875rem",
                  lineHeight: 1.5,
                }}
              >
                {submitError}
              </div>
            )}

            <button
              className="btn-primary"
              disabled={submitting}
              onClick={handleSubmit}
            >
              {submitting ? (
                <span className="spinner"></span>
              ) : (
                "Submit return"
              )}
            </button>

            <button
              onClick={() => setStep(2)}
              disabled={submitting}
              style={{
                width: "100%",
                padding: "0.875rem",
                background: "transparent",
                border: "2px solid #e2e2e2",
                borderRadius: "10px",
                fontSize: "0.9375rem",
                fontWeight: 600,
                cursor: submitting ? "not-allowed" : "pointer",
                marginTop: "0.5rem",
                opacity: submitting ? 0.5 : 1,
              }}
            >
              Go back
            </button>
          </div>
        )}

        {/* Step 4: Confirmation */}
        {step === 4 && (
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                background: "#fff",
                borderRadius: 12,
                padding: "3rem 2rem",
                maxWidth: 560,
                margin: "0 auto",
              }}
            >
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>✓</div>
              <h2
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  marginBottom: "0.5rem",
                }}
              >
                Your return has been submitted
              </h2>
              <p
                style={{
                  color: "#6b6b6b",
                  fontSize: "0.9375rem",
                  marginBottom: "2rem",
                  lineHeight: 1.6,
                }}
              >
                Order {order.name} — We&apos;ll send shipping instructions to{" "}
                <strong>{order.email}</strong>.
                <br />
                Check your email for next steps.
              </p>

              {/* ── Label section ── */}
              {label && label.labelUrl ? (
                <div
                  style={{
                    background: "#f8f8f8",
                    borderRadius: 10,
                    padding: "1.5rem",
                    marginBottom: "1.5rem",
                    textAlign: "left",
                  }}
                >
                  <h3
                    style={{
                      fontSize: "1.125rem",
                      fontWeight: 700,
                      marginBottom: "0.25rem",
                    }}
                  >
                    Your label is ready to print
                  </h3>
                  <p
                    style={{
                      fontSize: "0.8125rem",
                      color: "#6b6b6b",
                      lineHeight: 1.5,
                      marginBottom: "1rem",
                    }}
                  >
                    Print your label, attach it to the package, and drop it off
                    at any {label.carrier || "USPS"} location.
                  </p>

                  <a
                    href={label.labelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.5rem",
                      textDecoration: "none",
                      textAlign: "center",
                    }}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="6 9 6 2 18 2 18 9" />
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                      <rect x="6" y="14" width="12" height="8" />
                    </svg>
                    Print return label
                  </a>

                  {label.trackingCode && (
                    <p
                      style={{
                        fontSize: "0.75rem",
                        color: "#999",
                        marginTop: "0.75rem",
                        textAlign: "center",
                      }}
                    >
                      Tracking: {label.trackingCode}
                    </p>
                  )}
                </div>
              ) : (
                /* No label — show estimated refund/credit instead */
                <div
                  style={{
                    background: "#f8f8f8",
                    borderRadius: 10,
                    padding: "1.25rem",
                    marginBottom: "1.5rem",
                  }}
                >
                  <div className="summary-row" style={{ borderBottom: "none" }}>
                    <span>
                      {creditOption === "store_credit"
                        ? "Estimated gift card"
                        : "Estimated refund"}
                    </span>
                    <span style={{ fontSize: "1.25rem", fontWeight: 700 }}>
                      $
                      {creditOption === "store_credit"
                        ? storeCreditTotal.toFixed(2)
                        : refundTotal.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {/* How to ship instructions */}
              <div
                style={{
                  textAlign: "left",
                  marginBottom: "1.5rem",
                  padding: "0 0.5rem",
                }}
              >
                <h4
                  style={{
                    fontSize: "0.9375rem",
                    fontWeight: 700,
                    marginBottom: "0.75rem",
                  }}
                >
                  How to ship your item(s)
                </h4>
                <ol
                  style={{
                    fontSize: "0.8125rem",
                    color: "#6b6b6b",
                    lineHeight: 1.7,
                    paddingLeft: "1.25rem",
                    margin: 0,
                  }}
                >
                  <li style={{ marginBottom: "0.5rem" }}>
                    {label
                      ? "Download and print the return label above."
                      : "Download and print the return label from your email."}
                  </li>
                  <li style={{ marginBottom: "0.5rem" }}>
                    Pack all returned items in their original packaging if
                    possible.
                  </li>
                  <li style={{ marginBottom: "0.5rem" }}>
                    Attach the label to the outside of the package.
                  </li>
                  <li>
                    Drop it off at any{" "}
                    {label?.carrier || "USPS"} location.
                  </li>
                </ol>
              </div>

              {/* Return summary */}
              <div
                style={{
                  background: "#f8f8f8",
                  borderRadius: 10,
                  padding: "1.25rem",
                  marginBottom: "1.5rem",
                  textAlign: "left",
                }}
              >
                <div className="summary-row">
                  <span>
                    {creditOption === "store_credit"
                      ? "Estimated gift card"
                      : "Estimated refund"}
                  </span>
                  <span style={{ fontSize: "1.125rem", fontWeight: 700 }}>
                    $
                    {creditOption === "store_credit"
                      ? storeCreditTotal.toFixed(2)
                      : refundTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              <a
                href="https://birthofroyalchild.com"
                className="btn-primary"
                style={{
                  display: "inline-block",
                  textDecoration: "none",
                  textAlign: "center",
                  maxWidth: 300,
                }}
              >
                Continue shopping
              </a>

              {/* Support footer */}
              <div
                style={{
                  marginTop: "2rem",
                  padding: "1rem",
                  background: "#f8f8f8",
                  borderRadius: 10,
                }}
              >
                <p
                  style={{
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    marginBottom: "0.25rem",
                  }}
                >
                  Questions?
                </p>
                <a
                  href="mailto:support@birthofroyalchild.com"
                  style={{
                    fontSize: "0.8125rem",
                    color: "#000",
                    textDecoration: "underline",
                  }}
                >
                  Contact support@birthofroyalchild.com
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
