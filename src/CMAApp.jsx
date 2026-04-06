import { useState, useRef, useEffect } from "react";

const SYSTEM_PROMPT = `You are a Toronto real estate comparative market analysis expert. When given a property address, you must:

1. Search for the property details (bedrooms, bathrooms, lot size, style, features, last sold price/date)
2. Search for 6-10 recent comparable sold properties (2025-2026 only) in the same neighbourhood
3. Search for current market conditions (avg prices, days on market, sale-to-list ratio)
4. Provide an estimated market value range with reasoning

CRITICAL: Respond ONLY in this exact JSON format, no markdown, no backticks, no preamble:
{
  "address": "full address",
  "neighbourhood": "neighbourhood name",
  "property": {
    "type": "Detached/Semi/Town/Condo",
    "style": "e.g. 3-Storey, Bungalow, 2-Storey",
    "bedrooms": "e.g. 4+1",
    "bathrooms": "e.g. 6",
    "lotSize": "e.g. 20' x 140'",
    "lotSqft": 2800,
    "parking": "e.g. 1 car",
    "features": ["feature1", "feature2"],
    "lastSoldPrice": "$X,XXX,XXX",
    "lastSoldDate": "Month Year",
    "yearBuilt": "YYYY or Unknown"
  },
  "comparables": [
    {
      "address": "street address",
      "bedBath": "3+1/4",
      "type": "Det. reno",
      "soldPrice": 2500000,
      "soldDate": "Mon YYYY",
      "quality": "Strong|Good|Fair|Baseline",
      "notes": "brief note on why comparable"
    }
  ],
  "marketContext": {
    "avgSoldPrice": "$X.XM",
    "avgSoldPriceYoY": "-X.X%",
    "daysOnMarket": 22,
    "saleToListRatio": "103.6%",
    "neighbourhoodRank": "#10/144",
    "marketType": "Buyer's|Balanced|Seller's",
    "bocRate": "2.75%",
    "activeListings": 12,
    "sellAboveAsk": "50%"
  },
  "valuation": {
    "conservative": 2400000,
    "midpoint": 2550000,
    "aggressive": 2700000,
    "listingStrategy": "Brief listing price recommendation",
    "reasoning": "2-3 sentence explanation of how you arrived at the range"
  },
  "adjustments": [
    {"factor": "description", "impact": "+$50K or -$25K", "direction": "positive|negative|neutral"}
  ],
  "risks": ["risk1", "risk2"],
  "upside": ["upside1", "upside2"]
}

Always use real data from web search. If you cannot find exact sold prices, estimate based on available data and note it. Focus on 2025-2026 comparables only. All prices in CAD.`;

function formatPrice(n) {
  if (!n) return "\u2014";
  if (typeof n === "string") return n;
  return "$" + n.toLocaleString("en-CA");
}

function QualityBadge({ q }) {
  const map = {
    Strong: { bg: "#E1F5EE", color: "#0F6E56" },
    Good: { bg: "#E6F1FB", color: "#185FA5" },
    Fair: { bg: "#FAEEDA", color: "#854F0B" },
    Baseline: { bg: "#F1EFE8", color: "#5F5E5A" },
  };
  const s = map[q] || map.Fair;
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 500 }}>
      {q}
    </span>
  );
}

function MetricCard({ label, value, sub, subColor }) {
  return (
    <div style={{ background: "#f7f6f3", borderRadius: 10, padding: "16px 18px" }}>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 4, fontFamily: "var(--font-mono, monospace)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: "#1a1a1a", fontFamily: "'Instrument Serif', Georgia, serif" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: subColor || "#888", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function CMAApp() {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loadingMsg, setLoadingMsg] = useState("");
  const intervalRef = useRef(null);

  const msgs = [
    "Searching property records...",
    "Pulling recent sold comparables...",
    "Analyzing neighbourhood trends...",
    "Cross-referencing MLS data...",
    "Calculating adjustments...",
    "Building valuation model...",
    "Finalizing market estimate...",
  ];

  useEffect(() => {
    return () => clearInterval(intervalRef.current);
  }, []);

  async function runCMA() {
    if (!address.trim()) return;
    setLoading(true);
    setData(null);
    setError(null);
    let mi = 0;
    setLoadingMsg(msgs[0]);
    intervalRef.current = setInterval(() => {
      mi = (mi + 1) % msgs.length;
      setLoadingMsg(msgs[mi]);
    }, 4000);

    try {
      const res = await fetch("/api/cma", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          system: SYSTEM_PROMPT,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [
            {
              role: "user",
              content: `Perform a full comparative market analysis for this property: ${address.trim()}. Search for the property details, find 6-10 recent 2025-2026 sold comparables in the same neighbourhood, get current market stats, and provide a valuation range. Return ONLY the JSON object specified in the system prompt.`,
            },
          ],
        }),
      });
      const json = await res.json();
      clearInterval(intervalRef.current);

      const textBlocks = (json.content || []).filter((b) => b.type === "text").map((b) => b.text);
      const raw = textBlocks.join("\n").replace(/```json|```/g, "").trim();

      let parsed;
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Could not parse response");
      }
      setData(parsed);
    } catch (e) {
      clearInterval(intervalRef.current);
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif", color: "#1a1a1a", minHeight: "100vh", background: "linear-gradient(180deg, #faf9f6 0%, #f0ede6 100%)" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 24px" }}>
        {/* Header */}
        <div style={{ marginBottom: 40, textAlign: "center" }}>
          <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.15em", color: "#999", marginBottom: 8 }}>
            Comparative market analysis
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 400, fontFamily: "'Instrument Serif', Georgia, serif", margin: "0 0 8px", lineHeight: 1.1 }}>
            Toronto property valuation
          </h1>
          <p style={{ fontSize: 14, color: "#888", margin: 0 }}>
            Enter any Toronto address to generate a live CMA with recent 2025–2026 comparables
          </p>
        </div>

        {/* Search */}
        <div style={{ display: "flex", gap: 10, marginBottom: 40 }}>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !loading && runCMA()}
            placeholder="e.g. 165 Waverley Road, Toronto"
            style={{
              flex: 1,
              padding: "14px 18px",
              fontSize: 15,
              border: "1.5px solid #d4d0c8",
              borderRadius: 10,
              background: "#fff",
              outline: "none",
              fontFamily: "'DM Sans', sans-serif",
              transition: "border-color 0.2s",
            }}
            onFocus={(e) => (e.target.style.borderColor = "#1a1a1a")}
            onBlur={(e) => (e.target.style.borderColor = "#d4d0c8")}
          />
          <button
            onClick={runCMA}
            disabled={loading || !address.trim()}
            style={{
              padding: "14px 28px",
              fontSize: 14,
              fontWeight: 600,
              border: "none",
              borderRadius: 10,
              background: loading ? "#ccc" : "#1a1a1a",
              color: "#fff",
              cursor: loading ? "wait" : "pointer",
              fontFamily: "'DM Sans', sans-serif",
              transition: "all 0.2s",
              whiteSpace: "nowrap",
            }}
          >
            {loading ? "Analyzing..." : "Run CMA"}
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ width: 40, height: 40, border: "3px solid #e0ddd6", borderTopColor: "#1a1a1a", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 20px" }} />
            <div style={{ fontSize: 14, color: "#888", fontStyle: "italic" }}>{loadingMsg}</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: 20, textAlign: "center" }}>
            <div style={{ fontSize: 14, color: "#991b1b", fontWeight: 500 }}>Analysis failed</div>
            <div style={{ fontSize: 13, color: "#b91c1c", marginTop: 4 }}>{error}</div>
            <div style={{ fontSize: 12, color: "#888", marginTop: 8 }}>Try a more specific address (include city/province) or try again.</div>
          </div>
        )}

        {/* Results */}
        {data && (
          <div>
            {/* Property header */}
            <div style={{ marginBottom: 28, borderBottom: "1.5px solid #d4d0c8", paddingBottom: 20 }}>
              <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.1em", color: "#999", marginBottom: 4 }}>
                {data.neighbourhood || "Toronto"} &middot; {data.property?.type || "Detached"}
              </div>
              <h2 style={{ fontSize: 28, fontWeight: 400, fontFamily: "'Instrument Serif', Georgia, serif", margin: "0 0 10px" }}>
                {data.address}
              </h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 13, color: "#666" }}>
                {data.property?.bedrooms && <span>{data.property.bedrooms} bed</span>}
                {data.property?.bathrooms && <span>{data.property.bathrooms} bath</span>}
                {data.property?.lotSize && <span>{data.property.lotSize} lot</span>}
                {data.property?.parking && <span>{data.property.parking} parking</span>}
                {data.property?.style && <span>{data.property.style}</span>}
              </div>
            </div>

            {/* Valuation cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 12, marginBottom: 28 }}>
              <MetricCard label="Conservative" value={formatPrice(data.valuation?.conservative)} />
              <div style={{ background: "#1a1a1a", borderRadius: 10, padding: "16px 18px", color: "#fff" }}>
                <div style={{ fontSize: 12, color: "#aaa", marginBottom: 4, fontFamily: "var(--font-mono, monospace)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Mid-point estimate</div>
                <div style={{ fontSize: 26, fontWeight: 600, fontFamily: "'Instrument Serif', Georgia, serif" }}>{formatPrice(data.valuation?.midpoint)}</div>
              </div>
              <MetricCard label="Aggressive" value={formatPrice(data.valuation?.aggressive)} />
            </div>

            {/* Market stats */}
            {data.marketContext && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 10, marginBottom: 28 }}>
                <MetricCard label="Avg DOM" value={`${data.marketContext.daysOnMarket || "\u2014"} days`} />
                <MetricCard label="Sale/List" value={data.marketContext.saleToListRatio || "\u2014"} />
                <MetricCard label="Market" value={data.marketContext.marketType || "\u2014"} />
                <MetricCard label="BoC rate" value={data.marketContext.bocRate || "\u2014"} />
              </div>
            )}

            {/* Reasoning */}
            {data.valuation?.reasoning && (
              <div style={{ background: "#fff", border: "1.5px solid #d4d0c8", borderRadius: 10, padding: 20, marginBottom: 28, borderLeft: "4px solid #1a1a1a" }}>
                <div style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "#999", marginBottom: 6 }}>Valuation rationale</div>
                <div style={{ fontSize: 14, lineHeight: 1.65, color: "#444" }}>{data.valuation.reasoning}</div>
                {data.valuation.listingStrategy && (
                  <div style={{ fontSize: 13, color: "#666", marginTop: 10, fontStyle: "italic" }}>
                    Listing strategy: {data.valuation.listingStrategy}
                  </div>
                )}
              </div>
            )}

            {/* Comparables table */}
            {data.comparables?.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.1em", color: "#999", marginBottom: 10 }}>
                  Comparable sold properties ({data.comparables.length})
                </div>
                <div style={{ background: "#fff", border: "1.5px solid #d4d0c8", borderRadius: 10, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#f7f6f3" }}>
                        <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600, color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Address</th>
                        <th style={{ textAlign: "center", padding: "10px 6px", fontWeight: 600, color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Bed/Bath</th>
                        <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 600, color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Sold price</th>
                        <th style={{ textAlign: "center", padding: "10px 6px", fontWeight: 600, color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Date</th>
                        <th style={{ textAlign: "center", padding: "10px 8px", fontWeight: 600, color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Comp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.comparables.map((c, i) => (
                        <tr key={i} style={{ borderTop: "1px solid #eeece6" }}>
                          <td style={{ padding: "10px 12px" }}>
                            <div style={{ fontWeight: 500 }}>{c.address}</div>
                            {c.notes && <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{c.notes}</div>}
                          </td>
                          <td style={{ textAlign: "center", padding: "10px 6px", color: "#666" }}>{c.bedBath}</td>
                          <td style={{ textAlign: "right", padding: "10px 12px", fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>{formatPrice(c.soldPrice)}</td>
                          <td style={{ textAlign: "center", padding: "10px 6px", color: "#888", fontSize: 12 }}>{c.soldDate}</td>
                          <td style={{ textAlign: "center", padding: "10px 8px" }}><QualityBadge q={c.quality} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Adjustments */}
            {data.adjustments?.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.1em", color: "#999", marginBottom: 10 }}>
                  Value adjustments
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {data.adjustments.map((a, i) => (
                    <div key={i} style={{
                      background: a.direction === "positive" ? "#E1F5EE" : a.direction === "negative" ? "#FCEBEB" : "#F1EFE8",
                      color: a.direction === "positive" ? "#0F6E56" : a.direction === "negative" ? "#A32D2D" : "#5F5E5A",
                      padding: "6px 12px",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 500,
                    }}>
                      {a.factor}: {a.impact}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Risks & Upside */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 28 }}>
              {data.risks?.length > 0 && (
                <div style={{ background: "#fff", border: "1.5px solid #d4d0c8", borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "#A32D2D", marginBottom: 8 }}>Risk factors</div>
                  {data.risks.map((r, i) => (
                    <div key={i} style={{ fontSize: 12, color: "#666", marginBottom: 4, paddingLeft: 12, position: "relative" }}>
                      <span style={{ position: "absolute", left: 0, color: "#ddd" }}>&mdash;</span>{r}
                    </div>
                  ))}
                </div>
              )}
              {data.upside?.length > 0 && (
                <div style={{ background: "#fff", border: "1.5px solid #d4d0c8", borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "#0F6E56", marginBottom: 8 }}>Upside factors</div>
                  {data.upside.map((u, i) => (
                    <div key={i} style={{ fontSize: 12, color: "#666", marginBottom: 4, paddingLeft: 12, position: "relative" }}>
                      <span style={{ position: "absolute", left: 0, color: "#ddd" }}>&mdash;</span>{u}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Property features */}
            {data.property?.features?.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.1em", color: "#999", marginBottom: 10 }}>
                  Property features
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {data.property.features.map((f, i) => (
                    <span key={i} style={{ background: "#f7f6f3", color: "#555", padding: "4px 10px", borderRadius: 5, fontSize: 12 }}>{f}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Disclaimer */}
            <div style={{ fontSize: 11, color: "#bbb", lineHeight: 1.5, borderTop: "1px solid #e0ddd6", paddingTop: 16 }}>
              This CMA is AI-generated for informational purposes only and is not a formal appraisal. Data sourced via web search of TRREB/MLS, Property.ca, Zolo, Redfin, and public records. Actual sale price depends on market conditions, timing, and presentation. Consult a licensed appraiser for formal valuation.
            </div>

            {/* New search */}
            <div style={{ textAlign: "center", marginTop: 24 }}>
              <button
                onClick={() => { setData(null); setAddress(""); }}
                style={{
                  padding: "10px 24px", fontSize: 13, fontWeight: 600, border: "1.5px solid #d4d0c8",
                  borderRadius: 8, background: "transparent", color: "#666", cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                Analyze another property
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !data && !error && (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#bbb" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>&#8962;</div>
            <div style={{ fontSize: 14 }}>Enter a Toronto-area address above to generate a valuation</div>
            <div style={{ fontSize: 12, marginTop: 8, color: "#ccc" }}>
              Works best with specific street addresses — e.g. "165 Waverley Road, Toronto" or "43 Bellefair Ave, The Beaches"
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
