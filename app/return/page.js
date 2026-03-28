"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

/* ═══════════════════════════════════════════
   CONFIG — Edit these values for the client
   ═══════════════════════════════════════════ */

// Return reason dropdown options
const RETURN_REASONS = [
  "Too small",
  "Too large",
  "Changed my mind",
  "Item not as described",
  "Received wrong item",
  "Damaged / defective",
  "Other",
];

// Bonus percentage added to store credit (10 = 10%)
const STORE_CREDIT_BONUS_PERCENT = 10;

// Fee deducted from refund to original payment ($10)
const REFUND_FEE = 10;

/* ═══════════════════════════════════════════ */

export default function ReturnPage() {
  const [order, setOrder] = useState(null);
  const [selectedItems, setSelectedItems] = useState({});
  const [reasons, setReasons] = useState({});
  const [creditOption, setCreditOption] = useState(null);
  const [step, setStep] = useState(1); // 1 = select items, 2 = review + credit + submit, 3 = confirmation
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [label, setLabel] = useState(null);
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

  // Derived data
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
    if (!creditOption) return;
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

      if (data.label) {
        setLabel(data.label);
      }

      setStep(3);
    } catch (err) {
      console.error("Submit error:", err);
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Render helpers ──────────────────────

  function renderItemImage(item) {
    if (item.image) {
      return <img src={item.image} alt={item.title} className="item-img" />;
    }
    return <div className="item-img-placeholder">No image</div>;
  }

  function renderHeader() {
    return (
      <div className="return-page-header">
        {step === 1 && (
          <a href="/" className="back-arrow" title="Back">
            ←
          </a>
        )}
        {step === 2 && (
          <button
            onClick={() => setStep(1)}
            className="back-arrow"
            style={{ background: "none", border: "none", cursor: "pointer" }}
            title="Back"
          >
            ←
          </button>
        )}
        <div className="return-page-logo">Birth Of Royal Child</div>
      </div>
    );
  }

  // ─── STEP 1: Select Items ────────────────

  if (step === 1) {
    return (
      <div className="return-page">
        {renderHeader()}
        <div className="return-page-body" style={{ maxWidth: 680 }}>
          <h1 className="return-page-title">Select items to return</h1>

          {order.items.map((item) => (
            <div
              key={item.id}
              className={`item-selectable ${selectedItems[item.id] ? "selected" : ""}`}
              onClick={() => toggleItem(item.id, item.quantity)}
            >
              <div className="item-inner">
                {renderItemImage(item)}
                <div className="item-info">
                  <div className="item-name">{item.title}</div>
                  <div className="item-meta">
                    {item.variant_title} · Qty: {item.quantity}
                  </div>
                </div>
                <div className="item-price-col">
                  ${parseFloat(item.price).toFixed(2)}
                </div>
              </div>

              {selectedItems[item.id] && (
                <div className="item-reason-select" onClick={(e) => e.stopPropagation()}>
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

          <div style={{ marginTop: "1.5rem" }}>
            <button
              className="btn-primary"
              disabled={!canProceedStep1()}
              onClick={() => setStep(2)}
            >
              Continue
            </button>
            <button
              className="btn-secondary"
              onClick={() => router.push("/")}
              style={{ marginTop: "0.5rem" }}
            >
              Go back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── STEP 2: Review + Credit Option + Submit ────

  if (step === 2) {
    return (
      <div className="return-page">
        {renderHeader()}
        <div className="return-page-body">
          <h1 className="return-page-title">Review your return</h1>

          <div className="return-two-col">
            {/* ── LEFT COLUMN ── */}
            <div>
              {/* Send back your return */}
              <div className="return-card">
                <div className="return-card-title">Send back your return</div>
                <div className="return-card-subtitle">
                  Handling fees may apply.
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.875rem" }}>
                  <div style={{ fontSize: "1.5rem", marginTop: "0.125rem" }}>📦</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.9375rem", marginBottom: "0.25rem" }}>
                      Box and ship it
                    </div>
                    <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                      Print label or show QR code if provided, pack items and bring to carrier. Refund times vary.
                    </div>
                  </div>
                </div>
              </div>

              {/* What you're sending back */}
              <div className="return-card">
                <div className="return-card-title">What you&apos;re sending back</div>
                {selectedItemsList.map((item) => (
                  <div className="item-row" key={item.id}>
                    {renderItemImage(item)}
                    <div className="item-info">
                      <div className="item-name">{item.title}</div>
                      <div className="item-meta">
                        {item.variant_title}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Customer information */}
              {order.shipping_address && (
                <div className="return-card">
                  <div className="return-card-title" style={{ marginBottom: "1.25rem" }}>
                    Customer information
                  </div>

                  <div className="customer-label">Contact info</div>
                  <div className="customer-value">
                    {order.email}
                    {order.shipping_address.phone && (
                      <>
                        <br />
                        {order.shipping_address.phone}
                      </>
                    )}
                  </div>

                  <div className="customer-label">Shipping address</div>
                  <div className="customer-value">
                    {order.shipping_address.name}
                    <br />
                    {order.shipping_address.address1}
                    {order.shipping_address.address2 && (
                      <>
                        <br />
                        {order.shipping_address.address2}
                      </>
                    )}
                    <br />
                    {order.shipping_address.city}{" "}
                    {order.shipping_address.province_code || order.shipping_address.province}{" "}
                    {order.shipping_address.zip}{" "}
                    {order.shipping_address.country}
                  </div>
                </div>
              )}
            </div>

            {/* ── RIGHT COLUMN (Sidebar) ── */}
            <div className="sidebar-summary">
              <div className="return-card">
                <div className="summary-section-title">Return summary</div>

                {/* Items in summary */}
                <div className="section-label" style={{ marginTop: "0.5rem" }}>
                  Return credits ({selectedItemsList.length})
                </div>

                {selectedItemsList.map((item) => (
                  <div className="item-row" key={item.id} style={{ gap: "0.75rem" }}>
                    {renderItemImage(item)}
                    <div className="item-info">
                      <div className="item-name" style={{ fontSize: "0.8125rem" }}>
                        {item.title}
                      </div>
                      <div className="item-meta">{item.variant_title}</div>
                    </div>
                    <div className="item-price-col" style={{ fontSize: "0.8125rem" }}>
                      ${parseFloat(item.price).toFixed(2)}
                    </div>
                  </div>
                ))}

                <hr className="summary-divider" />

                <div className="summary-line">
                  <span>Credit subtotal</span>
                  <span style={{ fontWeight: 600 }}>${itemsTotal.toFixed(2)}</span>
                </div>

                <hr className="summary-divider" />

                {/* Credit options */}
                <div className="section-label" style={{ marginTop: "0.5rem" }}>
                  Credit options
                </div>

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
                      Receive a gift card code via email once your return has
                      been approved.
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

                <hr className="summary-divider" />

                {/* Total */}
                {creditOption && (
                  <div className="summary-total">
                    <span>
                      {creditOption === "store_credit"
                        ? "Total estimated gift card"
                        : "Total estimated refund"}
                    </span>
                    <span>
                      $
                      {creditOption === "store_credit"
                        ? storeCreditTotal.toFixed(2)
                        : refundTotal.toFixed(2)}
                    </span>
                  </div>
                )}

                {/* Error */}
                {submitError && (
                  <div className="error-banner" style={{ marginTop: "1rem" }}>
                    {submitError}
                  </div>
                )}

                {/* Submit */}
                <button
                  className="btn-primary"
                  disabled={!creditOption || submitting}
                  onClick={handleSubmit}
                  style={{ marginTop: "1.25rem" }}
                >
                  {submitting ? <span className="spinner"></span> : "Submit return"}
                </button>

                <button
                  className="btn-secondary"
                  disabled={submitting}
                  onClick={() => setStep(1)}
                  style={{ marginTop: "0.5rem" }}
                >
                  Go back
                </button>

                {/* Questions */}
                <div className="questions-box" style={{ marginTop: "1rem" }}>
                  <strong>Questions?</strong>
                  Contact{" "}
                  <a href="mailto:support@birthofroyalchild.com">
                    support@birthofroyalchild.com
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── STEP 3: Confirmation ────────────────

  if (step === 3) {
    return (
      <div className="return-page">
        {renderHeader()}
        <div className="return-page-body">
          <h1 className="return-page-title">Your return has been submitted</h1>

          <div className="return-two-col">
            {/* ── LEFT COLUMN ── */}
            <div>
              {/* Label card */}
              <div className="confirm-label-card">
                <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
                  Order {order.name}
                </div>

                {label && label.labelUrl ? (
                  <>
                    <div className="confirm-label-title">
                      Your label is ready to print
                    </div>
                    <div className="confirm-label-sub">
                      Use the link below to print your label and attach it to the
                      top of the package, then drop it off at any{" "}
                      {label.carrier || "USPS"} location.
                    </div>

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

                    <div className="confirm-email-note">
                      <span>✉</span>
                      <span>
                        A link to these instructions has been emailed to{" "}
                        {order.email}.
                      </span>
                    </div>

                    {label.trackingCode && (
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-secondary)",
                          marginTop: "0.75rem",
                        }}
                      >
                        Tracking: {label.trackingCode}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="confirm-label-title">
                      We&apos;ll send your return label shortly
                    </div>
                    <div className="confirm-label-sub">
                      Check your email at <strong>{order.email}</strong> for
                      shipping instructions and your return label.
                    </div>
                  </>
                )}
              </div>

              {/* How to ship */}
              <div className="return-card">
                <div className="confirm-ship-title">How to ship your item(s)</div>
                <ol className="confirm-ship-list">
                  <li>
                    {label && label.labelUrl
                      ? "Download and print the return label above."
                      : "Download and print the return label from your email."}
                    {" "}If you do not have a printer, you may take your parcel to
                    your local Post Office where they can attach the label and
                    send off your parcel for you.
                  </li>
                  <li>
                    Pack all returned items in your original shipping satchel or
                    any suitable box. Make sure items are clean and in original
                    condition.
                  </li>
                  <li>
                    Attach the label to the outside of the package.
                  </li>
                  <li>
                    Drop it off at any{" "}
                    {label?.carrier || "USPS"} location.
                  </li>
                </ol>
              </div>
            </div>

            {/* ── RIGHT COLUMN ── */}
            <div className="sidebar-summary">
              <div className="return-card">
                <div className="summary-section-title">Return summary</div>

                <div className="section-label">
                  Return credits ({selectedItemsList.length})
                </div>

                {selectedItemsList.map((item) => (
                  <div className="item-row" key={item.id} style={{ gap: "0.75rem" }}>
                    {renderItemImage(item)}
                    <div className="item-info">
                      <div className="item-name" style={{ fontSize: "0.8125rem" }}>
                        {item.title}
                      </div>
                      <div className="item-meta">{item.variant_title}</div>
                    </div>
                    <div className="item-price-col" style={{ fontSize: "0.8125rem" }}>
                      ${parseFloat(item.price).toFixed(2)}
                    </div>
                  </div>
                ))}

                <hr className="summary-divider" />

                <div className="summary-line">
                  <span>Credit subtotal</span>
                  <span style={{ fontWeight: 600 }}>${itemsTotal.toFixed(2)}</span>
                </div>

                {creditOption === "store_credit" && (
                  <div className="summary-line">
                    <span style={{ color: "var(--success)" }}>
                      Store credit bonus
                    </span>
                    <span style={{ color: "var(--success)", fontWeight: 600 }}>
                      ${storeCreditBonus.toFixed(2)}
                    </span>
                  </div>
                )}

                <hr className="summary-divider" />

                <div className="summary-total">
                  <span>
                    {creditOption === "store_credit"
                      ? "Total estimated gift card"
                      : "Total estimated refund"}
                  </span>
                  <span>
                    $
                    {creditOption === "store_credit"
                      ? storeCreditTotal.toFixed(2)
                      : refundTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Continue shopping */}
              <a
                href="https://birthofroyalchild.com"
                className="btn-primary"
                style={{
                  display: "block",
                  textDecoration: "none",
                  textAlign: "center",
                  marginTop: "0.75rem",
                }}
              >
                Continue shopping
              </a>

              <div className="questions-box" style={{ marginTop: "1rem" }}>
                <strong>Questions?</strong>
                Contact{" "}
                <a href="mailto:support@birthofroyalchild.com">
                  support@birthofroyalchild.com
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
