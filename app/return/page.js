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
  const [creditOption, setCreditOption] = useState(null); // 'store_credit' | 'refund'
  const [step, setStep] = useState(1); // 1 = select items, 2 = credit option, 3 = review
  const [submitting, setSubmitting] = useState(false);
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
    // TODO: POST to /api/returns/create with selected items, reasons, creditOption
    // For now, simulate success
    await new Promise((r) => setTimeout(r, 1500));
    setStep(4); // confirmation
    setSubmitting(false);
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

                {/* Reason dropdown (visible when selected) */}
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
                  <div className="summary-row">
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
                  <div className="summary-row">
                    <span>Total estimated refund</span>
                    <span>${refundTotal.toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>

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
              <div
                style={{
                  fontSize: "3rem",
                  marginBottom: "1rem",
                }}
              >
                ✓
              </div>
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
                Order {order.name} — We'll send shipping instructions to{" "}
                <strong>{order.email}</strong>. Check your email for next steps.
              </p>

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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
