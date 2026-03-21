"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [orderNumber, setOrderNumber] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/orders/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber, email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setLoading(false);
        return;
      }

      // Store order data in sessionStorage and navigate to return flow
      sessionStorage.setItem("returnOrder", JSON.stringify(data.order));
      router.push("/return");
    } catch (err) {
      setError("Connection error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div
      className="page-wrapper"
      style={{
        backgroundImage: `url('/bg.jpg')`,
        backgroundColor: "#0a0a0a",
      }}
    >
      {/* Back to shop */}
      <a href="https://birthofroyalchild.com" className="back-link">
        ← Back to shop
      </a>

      {/* Brand */}
      <div className="brand-logo">Birth Of Royal Child</div>

      {/* Lookup card */}
      <div className="card">
        <h1 className="card-title">Returns</h1>
        <p className="card-subtitle">
          All returns are subject to our{" "}
          <a href="https://birthofroyalchild.com/policies/refund-policy">
            return policy
          </a>
          .
        </p>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <input
              type="text"
              className="input-field"
              placeholder="Order number (e.g. 1001)"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              required
            />
          </div>

          <div className="input-group">
            <input
              type="email"
              className="input-field"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? <span className="spinner"></span> : "Get started"}
          </button>

          {error && <p className="error-message">{error}</p>}
        </form>
      </div>

      {/* Contact footer */}
      <div className="contact-footer">
        <strong>Questions?</strong>
        Contact{" "}
        <a href="mailto:support@birthofroyalchild.com">
          support@birthofroyalchild.com
        </a>
      </div>
    </div>
  );
}
