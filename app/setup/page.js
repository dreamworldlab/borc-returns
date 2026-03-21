"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

function SetupContent() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const shop = searchParams.get("shop");
  const host = searchParams.get("host");

  useEffect(() => {
    if (!shop) {
      setError("No shop parameter. Open this page from Shopify admin.");
      setLoading(false);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.shopify.com/shopifycloud/app-bridge.js";
    script.onload = async () => {
      try {
        const config = {
          apiKey: process.env.NEXT_PUBLIC_SHOPIFY_CLIENT_ID,
          host: host,
          forceRedirect: false,
        };

        const app = window["app-bridge"].createApp(config);
        const sessionToken = await window["app-bridge"].utilities.getSessionToken(app);

        const res = await fetch("/api/auth/token-exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionToken, shop }),
        });

        const data = await res.json();

        if (data.access_token) {
          setToken(data.access_token);
        } else {
          setError(JSON.stringify(data, null, 2));
        }
      } catch (err) {
        setError(err.message);
      }
      setLoading(false);
    };
    document.head.appendChild(script);
  }, [shop, host]);

  return (
    <div style={{ padding: 40, fontFamily: "monospace", maxWidth: 800, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: 20 }}>DBRMAN Returns Setup</h1>

      {loading && <p>Exchanging token...</p>}

      {token && (
        <div>
          <p style={{ color: "green", fontWeight: "bold" }}>Access token obtained!</p>
          <p style={{ marginTop: 10 }}>Copy this token and add it as SHOPIFY_ACCESS_TOKEN in Netlify:</p>
          <textarea
            readOnly
            value={token}
            style={{
              width: "100%",
              height: 80,
              marginTop: 10,
              padding: 10,
              fontSize: 14,
              border: "2px solid green",
              borderRadius: 8,
              fontFamily: "monospace",
            }}
            onClick={(e) => e.target.select()}
          />
        </div>
      )}

      {error && (
        <div>
          <p style={{ color: "red", fontWeight: "bold" }}>Error:</p>
          <pre style={{ background: "#f5f5f5", padding: 15, borderRadius: 8, whiteSpace: "pre-wrap" }}>{error}</pre>
        </div>
      )}
    </div>
  );
}

export default function SetupPage() {
  return (
    <Suspense fallback={<p style={{ padding: 40 }}>Loading...</p>}>
      <SetupContent />
    </Suspense>
  );
}