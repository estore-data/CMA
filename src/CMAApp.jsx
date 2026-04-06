import { useState, useRef, useEffect } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const HOUSE_PROMPT = `You are a Toronto real estate comparative market analysis expert. When given a property address, you must:

1. Search for the property details (bedrooms, bathrooms, lot size, style, features, last sold price/date)
2. Search for 5 recent comparable sold properties (2025-2026 only) in the same neighbourhood
3. Search for current market conditions (avg prices, days on market, sale-to-list ratio)
4. Perform a QUANTITATIVE valuation using the comparable sales adjustment method

VALUATION METHODOLOGY — YOU MUST FOLLOW THIS EXACTLY:

Step 1: For EACH comparable, calculate individual dollar adjustments relative to the subject property.
  - Compare bedrooms, bathrooms, lot size, age/condition, renovation quality, parking, basement, and any other material differences.
  - Each adjustment must have a specific dollar amount (e.g., "1 fewer bedroom" → +$75,000 means the comp would be worth MORE if it matched the subject).
  - Positive adjustment = comp is INFERIOR to subject on that factor (so we adjust its price UP).
  - Negative adjustment = comp is SUPERIOR to subject on that factor (so we adjust its price DOWN).

Step 2: For each comp, compute: adjustedPrice = soldPrice + sum(all adjustments for that comp)

Step 3: Assign a weight (0.05 to 0.30) to each comp based on similarity/recency/reliability. Weights MUST sum to 1.0.

Step 4: Compute weightedAverage = sum(adjustedPrice × weight) across all comps. This IS the midpoint.

Step 5: conservative = weightedAverage × 0.97, aggressive = weightedAverage × 1.03

CRITICAL: The midpoint MUST equal the weighted average of adjusted prices. Do NOT invent a separate number.

CRITICAL: Respond ONLY in this exact JSON format, no markdown, no backticks, no preamble:
{
  "address": "full address",
  "neighbourhood": "neighbourhood name",
  "property": {
    "type": "Detached/Semi/Town",
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
      "weight": 0.20,
      "notes": "brief note on why comparable",
      "adjustments": [
        {"factor": "Bedrooms (1 fewer)", "amount": 75000},
        {"factor": "Lot size (smaller)", "amount": 50000},
        {"factor": "Renovated kitchen (superior)", "amount": -40000}
      ],
      "totalAdjustment": 85000,
      "adjustedPrice": 2585000
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
  "reconciliation": {
    "weightedAverage": 2550000,
    "conservative": 2473500,
    "aggressive": 2626500,
    "listingStrategy": "Brief listing price recommendation",
    "reasoning": "2-3 sentence explanation referencing the math above"
  },
  "risks": ["risk1", "risk2"],
  "upside": ["upside1", "upside2"]
}

Always use real data from web search. If you cannot find exact sold prices, estimate based on available data and note it. Focus on 2025-2026 comparables only. All prices in CAD. Every number must be traceable — no arbitrary figures.`;

const CONDO_PROMPT = `You are a Toronto real estate comparative market analysis expert specializing in CONDOMINIUMS. When given a condo unit address, you must:

1. Search for the SPECIFIC UNIT's last sold price and details
2. Search for the unit details — floor, suite size (sqft), bedrooms, bathrooms, locker, parking, maintenance fees, building name, ceiling height
3. Search for 5 recent comparable SOLD CONDO UNITS (2025-2026 only) that are SIMILAR IN SIZE to the subject unit
4. Search for current condo market conditions in the area

IMPORTANT SEARCH STRATEGY FOR CONDOS:
- The user may provide abbreviated addresses like "3508-375 King St W". This means Unit 3508 at 375 King Street West.
- Penthouse units are often listed on MLS with "PH" prefix. For unit 3508, ALSO search for "PH3508", "PH2-3508", "PH-3508". Try multiple variations.
- Search for the building by its FULL street address first (e.g., "375 King Street West Toronto condo").
- Then search for the specific unit using MULTIPLE formats: "Unit 3508 375 King", "3508-375 King", "PH3508 375 King", "PH2-3508 375 King St W sold price".
- Also search for the building name (e.g., "Theatre Park condo Toronto") if you identify it.
- You MUST find and report the subject unit's last sold price. This is critical context for the valuation.

COMPARABLE SELECTION — THIS IS CRITICAL:
- Comparables MUST be similar in SIZE to the subject unit. Match by sqft range (+/- 20%).
- Do NOT compare a 1,500+ sqft penthouse against 600-800 sqft 1-bedroom units. That is invalid.
- For large/penthouse units: search ACROSS NEARBY BUILDINGS in the area for similarly-sized units (1,200-1,800 sqft range for a 1,500 sqft unit).
- Same-building comps are great BUT ONLY IF they are a similar size. A 700 sqft unit in the same building is NOT a valid comp for a 1,500 sqft penthouse.
- Prefer comps in this priority order:
  1. Same building, similar size (+/- 20% sqft) — best comp
  2. Nearby building (same neighbourhood), similar size — very good comp
  3. Same building, different size — use only if nothing else, apply large sqft adjustment
- If the subject is a penthouse with premium features (high ceilings, terrace, etc.), search for other penthouses in the area.

CONDO-SPECIFIC ADJUSTMENT FACTORS:
- Unit size (sqft difference — use area $/sqft to price the difference)
- Floor level (higher floors command premium, ~$5K-15K per 5 floors)
- Ceiling height (standard 9ft vs 10ft+ or 12ft — premium of $30K-80K for high ceilings)
- Exposure/view (south/west premium, unobstructed views)
- Parking spots (0 vs 1 vs 2)
- Locker (with vs without)
- Maintenance fees (per sqft comparison)
- Balcony/terrace size (large private terraces are significant premium)
- Renovation/finishes quality
- Building premium (newer/more prestigious building vs older — applies when comparing across buildings)
- Penthouse premium (if subject is PH and comp is not)

VALUATION METHODOLOGY — YOU MUST FOLLOW THIS EXACTLY:

Step 1: For EACH comparable, calculate individual dollar adjustments relative to the subject unit.
  - Positive adjustment = comp is INFERIOR to subject on that factor (adjust price UP).
  - Negative adjustment = comp is SUPERIOR to subject on that factor (adjust price DOWN).

Step 2: For each comp, compute: adjustedPrice = soldPrice + sum(all adjustments for that comp)

Step 3: Assign a weight (0.05 to 0.30) to each comp based on similarity/recency/reliability. Weights MUST sum to 1.0. Same-size comps get highest weight regardless of building.

Step 4: Compute weightedAverage = sum(adjustedPrice × weight) across all comps. This IS the midpoint.

Step 5: conservative = weightedAverage × 0.97, aggressive = weightedAverage × 1.03

CRITICAL: The midpoint MUST equal the weighted average of adjusted prices. Do NOT invent a separate number.

CRITICAL: Respond ONLY in this exact JSON format, no markdown, no backticks, no preamble:
{
  "address": "full address including unit number",
  "neighbourhood": "neighbourhood name",
  "property": {
    "type": "Condo",
    "unitNumber": "3508",
    "floor": "35th",
    "buildingName": "e.g. Theatre Park",
    "style": "e.g. Penthouse, 1-Bed+Den, 2-Bed, Studio",
    "bedrooms": "e.g. 2+1",
    "bathrooms": "e.g. 2",
    "sqft": 1250,
    "ceilingHeight": "12 ft",
    "parking": "1 owned",
    "locker": "Yes/No",
    "maintenanceFee": "$850/mo",
    "features": ["feature1", "feature2"],
    "lastSoldPrice": "$X,XXX,XXX",
    "lastSoldDate": "Month Year",
    "yearBuilt": "YYYY or Unknown"
  },
  "comparables": [
    {
      "address": "unit and building address",
      "bedBath": "2+1/2",
      "type": "Condo",
      "sqft": 1400,
      "floor": "28th",
      "sameBuilding": false,
      "buildingName": "building name if different",
      "soldPrice": 1050000,
      "soldDate": "Mon YYYY",
      "quality": "Strong|Good|Fair|Baseline",
      "weight": 0.25,
      "notes": "brief note on why comparable",
      "adjustments": [
        {"factor": "Unit size (150 sqft smaller)", "amount": 60000},
        {"factor": "Floor level (7 floors lower)", "amount": 15000},
        {"factor": "Standard 9ft ceilings (vs 12ft)", "amount": 50000},
        {"factor": "Building premium (less prestigious)", "amount": 25000},
        {"factor": "Better finishes (superior)", "amount": -25000}
      ],
      "totalAdjustment": 125000,
      "adjustedPrice": 1175000
    }
  ],
  "marketContext": {
    "avgSoldPrice": "$X,XXX",
    "avgSoldPriceYoY": "-X.X%",
    "daysOnMarket": 22,
    "saleToListRatio": "98.5%",
    "neighbourhoodRank": "#10/144",
    "marketType": "Buyer's|Balanced|Seller's",
    "bocRate": "2.75%",
    "activeListings": 12,
    "sellAboveAsk": "30%",
    "avgPricePerSqft": "$950"
  },
  "reconciliation": {
    "weightedAverage": 1150000,
    "conservative": 1115500,
    "aggressive": 1184500,
    "listingStrategy": "Brief listing price recommendation",
    "reasoning": "2-3 sentence explanation referencing the math above"
  },
  "risks": ["risk1", "risk2"],
  "upside": ["upside1", "upside2"]
}

Always use real data from web search. If you cannot find exact sold prices, estimate based on available data and note it. Focus on 2025-2026 comparables only. All prices in CAD. Every number must be traceable — no arbitrary figures.`;

function formatPrice(n) {
  if (n === 0) return "$0";
  if (!n) return "\u2014";
  if (typeof n === "string") return n;
  if (n < 0) return "-$" + Math.abs(n).toLocaleString("en-CA");
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
  const [propertyType, setPropertyType] = useState("house");
  const [unitNumber, setUnitNumber] = useState("");
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
      const isCondo = propertyType === "condo";
      const systemPrompt = isCondo ? CONDO_PROMPT : HOUSE_PROMPT;
      const unit = unitNumber.trim();
      let queryAddress = address.trim();
      let userContent;

      if (isCondo) {
        const fullAddr = unit
          ? `Unit ${unit}, ${queryAddress}, Toronto`
          : queryAddress;
        const phVariants = unit
          ? ` The unit may be listed on MLS as "PH${unit}", "PH-${unit}", "PH2-${unit}", or "Unit ${unit}". Try multiple search variations to find the last sold price.`
          : "";
        userContent = `Perform a full comparative market analysis for this CONDO unit: ${fullAddr}.` +
          (unit ? ` The unit number is ${unit}.` : "") +
          phVariants +
          ` IMPORTANT: First find the subject unit's last sold price — search multiple name variations. Then find 5 recent 2025-2026 sold comparable condo units that are SIMILAR IN SIZE (within +/-20% sqft). Search across nearby buildings in the area, not just the same building. Do NOT use small 1-bed units as comps for a large/penthouse unit. Return ONLY the JSON object specified in the system prompt.`;
      } else {
        userContent = `Perform a full comparative market analysis for this property: ${queryAddress}. Search for the property details, find 5 recent 2025-2026 sold comparables in the same neighbourhood, get current market stats, and provide a valuation range. Return ONLY the JSON object specified in the system prompt.`;
      }

      const res = await fetch("/api/cma", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8000,
          system: systemPrompt,
          tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }],
          messages: [
            {
              role: "user",
              content: userContent,
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

  function exportPDF() {
    if (!data) return;
    try {
    const rec = data.reconciliation || data.valuation || {};
    const prop = data.property || {};
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 48;
    const contentW = pageW - margin * 2;
    let y = margin;

    const colors = {
      black: [26, 26, 26],
      dark: [68, 68, 68],
      mid: [136, 136, 136],
      light: [187, 187, 187],
      accent: [15, 110, 86],
      red: [163, 45, 45],
      bgLight: [247, 246, 243],
      bgDark: [26, 26, 26],
      rule: [212, 208, 200],
    };

    function checkPage(needed) {
      if (y + needed > pageH - margin) {
        doc.addPage();
        y = margin;
      }
    }

    function sectionLabel(text) {
      checkPage(30);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...colors.mid);
      doc.text(text.toUpperCase(), margin, y);
      y += 14;
    }

    function drawRule() {
      doc.setDrawColor(...colors.rule);
      doc.setLineWidth(0.75);
      doc.line(margin, y, pageW - margin, y);
      y += 10;
    }

    // === COVER / HEADER ===
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...colors.mid);
    doc.text("COMPARATIVE MARKET ANALYSIS", margin, y);
    y += 20;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.setTextColor(...colors.black);
    const addressLines = doc.splitTextToSize(data.address || "Property Report", contentW);
    doc.text(addressLines, margin, y);
    y += addressLines.length * 28 + 4;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...colors.mid);
    const subtitle = [data.neighbourhood, prop.type, prop.style].filter(Boolean).join("  |  ");
    doc.text(subtitle, margin, y);
    y += 14;

    const details = [
      prop.bedrooms && `${prop.bedrooms} Bed`,
      prop.bathrooms && `${prop.bathrooms} Bath`,
      prop.lotSize && `Lot: ${prop.lotSize}`,
      prop.parking && `Parking: ${prop.parking}`,
      prop.yearBuilt && `Built: ${prop.yearBuilt}`,
    ].filter(Boolean).join("   |   ");
    if (details) {
      doc.setFontSize(9);
      doc.setTextColor(...colors.dark);
      doc.text(details, margin, y);
      y += 12;
    }
    if (prop.lastSoldPrice) {
      doc.setFontSize(9);
      doc.setTextColor(...colors.mid);
      doc.text(`Last sold: ${prop.lastSoldPrice} (${prop.lastSoldDate || "N/A"})`, margin, y);
      y += 12;
    }
    y += 6;
    drawRule();

    // === VALUATION SUMMARY ===
    sectionLabel("Valuation Summary");
    const midVal = rec.weightedAverage || rec.midpoint;
    const boxW = (contentW - 16) / 3;
    const boxH = 52;

    // Conservative
    doc.setFillColor(...colors.bgLight);
    doc.roundedRect(margin, y, boxW, boxH, 4, 4, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...colors.mid);
    doc.text("CONSERVATIVE (-3%)", margin + 10, y + 16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...colors.black);
    doc.text(formatPrice(rec.conservative), margin + 10, y + 36);

    // Midpoint (dark box)
    const midX = margin + boxW + 8;
    doc.setFillColor(...colors.bgDark);
    doc.roundedRect(midX, y, boxW, boxH, 4, 4, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(170, 170, 170);
    doc.text("WEIGHTED AVERAGE", midX + 10, y + 16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.setTextColor(255, 255, 255);
    doc.text(formatPrice(midVal), midX + 10, y + 36);

    // Aggressive
    const aggX = margin + (boxW + 8) * 2;
    doc.setFillColor(...colors.bgLight);
    doc.roundedRect(aggX, y, boxW, boxH, 4, 4, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...colors.mid);
    doc.text("AGGRESSIVE (+3%)", aggX + 10, y + 16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...colors.black);
    doc.text(formatPrice(rec.aggressive), aggX + 10, y + 36);

    y += boxH + 18;

    // === MARKET CONTEXT ===
    if (data.marketContext) {
      sectionLabel("Market Context");
      const mc = data.marketContext;
      const metrics = [
        ["Avg Sold Price", mc.avgSoldPrice || "—"],
        ["YoY Change", mc.avgSoldPriceYoY || "—"],
        ["Days on Market", mc.daysOnMarket != null ? `${mc.daysOnMarket}` : "—"],
        ["Sale/List Ratio", mc.saleToListRatio || "—"],
        ["Market Type", mc.marketType || "—"],
        ["BoC Rate", mc.bocRate || "—"],
        ["Active Listings", mc.activeListings != null ? `${mc.activeListings}` : "—"],
        ["Sell Above Ask", mc.sellAboveAsk || "—"],
      ];
      const colW = contentW / 4;
      metrics.forEach((m, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        if (i > 0 && col === 0) checkPage(32);
        const cx = margin + col * colW;
        const cy = y + row * 30;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...colors.mid);
        doc.text(m[0].toUpperCase(), cx, cy);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(...colors.black);
        doc.text(m[1], cx, cy + 12);
      });
      y += Math.ceil(metrics.length / 4) * 30 + 10;
      drawRule();
    }

    // === VALUATION RATIONALE ===
    if (rec.reasoning) {
      sectionLabel("Valuation Rationale");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...colors.dark);
      const reasoningLines = doc.splitTextToSize(rec.reasoning, contentW - 10);
      checkPage(reasoningLines.length * 12 + 10);
      doc.text(reasoningLines, margin + 5, y);
      y += reasoningLines.length * 12 + 4;
      if (rec.listingStrategy) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(...colors.mid);
        const stratLines = doc.splitTextToSize(`Listing strategy: ${rec.listingStrategy}`, contentW - 10);
        doc.text(stratLines, margin + 5, y);
        y += stratLines.length * 11 + 4;
      }
      y += 10;
      drawRule();
    }

    // === COMPARABLE SALES & ADJUSTMENTS ===
    if (data.comparables?.length > 0) {
      sectionLabel(`Comparable Sales & Adjustments (${data.comparables.length})`);

      data.comparables.forEach((c, ci) => {
        const adjRows = c.adjustments || [];
        const neededHeight = 60 + adjRows.length * 13 + 30;
        checkPage(neededHeight);

        // Comp header bar
        doc.setFillColor(...colors.bgLight);
        doc.roundedRect(margin, y, contentW, 22, 3, 3, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...colors.black);
        doc.text(`${ci + 1}. ${c.address}`, margin + 8, y + 14);

        const rightInfo = [c.quality, c.weight != null ? `${(c.weight * 100).toFixed(0)}%` : ""].filter(Boolean).join("  |  ");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...colors.mid);
        doc.text(rightInfo, pageW - margin - 8, y + 14, { align: "right" });
        y += 26;

        // Sub-details
        const subLine = [c.bedBath, c.type, c.soldDate, c.notes].filter(Boolean).join("  |  ");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...colors.mid);
        doc.text(subLine, margin + 8, y + 2);
        y += 14;

        // Sold price line
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...colors.dark);
        doc.text("Sold Price", margin + 8, y);
        doc.setFont("helvetica", "bold");
        doc.text(formatPrice(c.soldPrice), pageW - margin - 8, y, { align: "right" });
        y += 14;

        // Each adjustment
        adjRows.forEach((adj) => {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(...colors.mid);
          doc.text(adj.factor, margin + 16, y);

          const amtStr = (adj.amount > 0 ? "+" : "") + formatPrice(adj.amount);
          if (adj.amount > 0) doc.setTextColor(...colors.accent);
          else if (adj.amount < 0) doc.setTextColor(...colors.red);
          else doc.setTextColor(...colors.dark);
          doc.setFont("helvetica", "normal");
          doc.text(amtStr, pageW - margin - 8, y, { align: "right" });
          y += 13;
        });

        // Net adjustment / adjusted price
        doc.setDrawColor(...colors.rule);
        doc.setLineWidth(0.5);
        doc.line(margin + 8, y, pageW - margin - 8, y);
        y += 12;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...colors.mid);
        const netStr = `Net: ${c.totalAdjustment > 0 ? "+" : ""}${formatPrice(c.totalAdjustment)}`;
        doc.text(netStr, margin + 8, y);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(...colors.black);
        doc.text(formatPrice(c.adjustedPrice), pageW - margin - 8, y, { align: "right" });
        y += 20;
      });

      y += 4;
      drawRule();

      // === RECONCILIATION TABLE ===
      sectionLabel("Valuation Reconciliation");

      const table = autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [["Comparable", "Adj. Price", "Weight", "Contribution"]],
        body: [
          ...data.comparables.map((c) => [
            c.address,
            formatPrice(c.adjustedPrice),
            c.weight != null ? `${(c.weight * 100).toFixed(0)}%` : "—",
            c.adjustedPrice && c.weight != null ? formatPrice(Math.round(c.adjustedPrice * c.weight)) : "—",
          ]),
        ],
        foot: [["Weighted Average", "", "100%", formatPrice(midVal)]],
        styles: {
          fontSize: 8,
          cellPadding: { top: 5, bottom: 5, left: 6, right: 6 },
          lineColor: colors.rule,
          lineWidth: 0.5,
          textColor: colors.dark,
          font: "helvetica",
        },
        headStyles: {
          fillColor: colors.bgLight,
          textColor: colors.mid,
          fontStyle: "bold",
          fontSize: 7,
        },
        footStyles: {
          fillColor: colors.bgDark,
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 9,
        },
        columnStyles: {
          0: { cellWidth: "auto" },
          1: { halign: "right", font: "courier" },
          2: { halign: "center" },
          3: { halign: "right", font: "courier", fontStyle: "bold" },
        },
        alternateRowStyles: { fillColor: [252, 251, 249] },
      });

      y = (table?.finalY ?? doc.lastAutoTable?.finalY ?? y) + 18;
    }

    // === RISKS & UPSIDE ===
    const hasRisks = data.risks?.length > 0;
    const hasUpside = data.upside?.length > 0;
    if (hasRisks || hasUpside) {
      checkPage(60);
      const halfW = (contentW - 12) / 2;

      if (hasRisks) {
        sectionLabel("Risk Factors");
        data.risks.forEach((r) => {
          checkPage(14);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(...colors.red);
          doc.text("—", margin + 4, y);
          doc.setTextColor(...colors.dark);
          const rLines = doc.splitTextToSize(r, halfW * 2 - 16);
          doc.text(rLines, margin + 14, y);
          y += rLines.length * 11 + 3;
        });
        y += 8;
      }

      if (hasUpside) {
        sectionLabel("Upside Factors");
        data.upside.forEach((u) => {
          checkPage(14);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(...colors.accent);
          doc.text("—", margin + 4, y);
          doc.setTextColor(...colors.dark);
          const uLines = doc.splitTextToSize(u, halfW * 2 - 16);
          doc.text(uLines, margin + 14, y);
          y += uLines.length * 11 + 3;
        });
        y += 8;
      }
      drawRule();
    }

    // === PROPERTY FEATURES ===
    if (prop.features?.length > 0) {
      sectionLabel("Property Features");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...colors.dark);
      const featureStr = prop.features.join("   |   ");
      const featureLines = doc.splitTextToSize(featureStr, contentW);
      checkPage(featureLines.length * 11 + 10);
      doc.text(featureLines, margin, y);
      y += featureLines.length * 11 + 14;
      drawRule();
    }

    // === DISCLAIMER ===
    checkPage(40);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6.5);
    doc.setTextColor(...colors.light);
    const disclaimer = "This CMA is AI-generated for informational purposes only and is not a formal appraisal. Data sourced via web search of TRREB/MLS, Property.ca, Zolo, Redfin, and public records. Actual sale price depends on market conditions, timing, and presentation. Consult a licensed appraiser for formal valuation.";
    const discLines = doc.splitTextToSize(disclaimer, contentW);
    doc.text(discLines, margin, y);
    y += discLines.length * 9 + 8;

    // Generated date
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...colors.light);
    doc.text(`Generated: ${new Date().toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" })}`, margin, y);

    // Page numbers on every page
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...colors.light);
      doc.text(`Page ${i} of ${totalPages}`, pageW - margin, pageH - 30, { align: "right" });
      doc.text("Comparative Market Analysis", margin, pageH - 30);
    }

    const filename = `CMA-${(data.address || "report").replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-").substring(0, 60)}.pdf`;
    doc.save(filename);
    } catch (err) {
      console.error("PDF export failed:", err);
      alert("PDF export failed: " + err.message);
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

        {/* Property type toggle */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <div style={{ display: "inline-flex", background: "#f0ede6", borderRadius: 8, padding: 3 }}>
            {[["house", "House"], ["condo", "Condo"]].map(([val, label]) => (
              <button
                key={val}
                onClick={() => { setPropertyType(val); if (val === "house") setUnitNumber(""); }}
                style={{
                  padding: "8px 24px",
                  fontSize: 13,
                  fontWeight: 600,
                  border: "none",
                  borderRadius: 6,
                  background: propertyType === val ? "#1a1a1a" : "transparent",
                  color: propertyType === val ? "#fff" : "#888",
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                  transition: "all 0.2s",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div style={{ display: "flex", gap: 10, marginBottom: 40, flexWrap: "wrap" }}>
          {propertyType === "condo" && (
            <input
              type="text"
              value={unitNumber}
              onChange={(e) => setUnitNumber(e.target.value)}
              placeholder="Unit #"
              style={{
                width: 90,
                padding: "14px 12px",
                fontSize: 15,
                border: "1.5px solid #d4d0c8",
                borderRadius: 10,
                background: "#fff",
                outline: "none",
                fontFamily: "'DM Sans', sans-serif",
                transition: "border-color 0.2s",
                textAlign: "center",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#1a1a1a")}
              onBlur={(e) => (e.target.style.borderColor = "#d4d0c8")}
            />
          )}
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !loading && runCMA()}
            placeholder={propertyType === "condo" ? "e.g. 375 King Street West, Toronto" : "e.g. 165 Waverley Road, Toronto"}
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
              minWidth: 200,
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
                {data.property?.buildingName && <span> &middot; {data.property.buildingName}</span>}
              </div>
              <h2 style={{ fontSize: 28, fontWeight: 400, fontFamily: "'Instrument Serif', Georgia, serif", margin: "0 0 10px" }}>
                {data.address}
              </h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 13, color: "#666" }}>
                {data.property?.unitNumber && <span>Unit {data.property.unitNumber}</span>}
                {data.property?.floor && <span>{data.property.floor} floor</span>}
                {data.property?.bedrooms && <span>{data.property.bedrooms} bed</span>}
                {data.property?.bathrooms && <span>{data.property.bathrooms} bath</span>}
                {data.property?.sqft && <span>{data.property.sqft} sqft</span>}
                {data.property?.lotSize && <span>{data.property.lotSize} lot</span>}
                {data.property?.parking && <span>{data.property.parking} parking</span>}
                {data.property?.locker && <span>Locker: {data.property.locker}</span>}
                {data.property?.ceilingHeight && <span>{data.property.ceilingHeight} ceilings</span>}
                {data.property?.maintenanceFee && <span>Maint: {data.property.maintenanceFee}</span>}
                {data.property?.style && <span>{data.property.style}</span>}
              </div>
            </div>

            {/* Valuation cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 12, marginBottom: 28 }}>
              <MetricCard label="Conservative (-3%)" value={formatPrice((data.reconciliation || data.valuation)?.conservative)} />
              <div style={{ background: "#1a1a1a", borderRadius: 10, padding: "16px 18px", color: "#fff" }}>
                <div style={{ fontSize: 12, color: "#aaa", marginBottom: 4, fontFamily: "var(--font-mono, monospace)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Weighted average</div>
                <div style={{ fontSize: 26, fontWeight: 600, fontFamily: "'Instrument Serif', Georgia, serif" }}>{formatPrice((data.reconciliation || data.valuation)?.weightedAverage || (data.reconciliation || data.valuation)?.midpoint)}</div>
              </div>
              <MetricCard label="Aggressive (+3%)" value={formatPrice((data.reconciliation || data.valuation)?.aggressive)} />
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
            {(data.reconciliation || data.valuation)?.reasoning && (
              <div style={{ background: "#fff", border: "1.5px solid #d4d0c8", borderRadius: 10, padding: 20, marginBottom: 28, borderLeft: "4px solid #1a1a1a" }}>
                <div style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "#999", marginBottom: 6 }}>Valuation rationale</div>
                <div style={{ fontSize: 14, lineHeight: 1.65, color: "#444" }}>{(data.reconciliation || data.valuation).reasoning}</div>
                {(data.reconciliation || data.valuation).listingStrategy && (
                  <div style={{ fontSize: 13, color: "#666", marginTop: 10, fontStyle: "italic" }}>
                    Listing strategy: {(data.reconciliation || data.valuation).listingStrategy}
                  </div>
                )}
              </div>
            )}

            {/* Comparables with per-comp adjustment math */}
            {data.comparables?.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.1em", color: "#999", marginBottom: 10 }}>
                  Comparable sales &amp; adjustments ({data.comparables.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {data.comparables.map((c, i) => (
                    <div key={i} style={{ background: "#fff", border: "1.5px solid #d4d0c8", borderRadius: 10, overflow: "hidden" }}>
                      {/* Comp header row */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #eeece6", background: "#fafaf7" }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>
                            {c.address}
                            {c.sameBuilding && <span style={{ marginLeft: 6, fontSize: 10, color: "#0F6E56", fontWeight: 500 }}>SAME BLDG</span>}
                            {!c.sameBuilding && c.buildingName && <span style={{ marginLeft: 6, fontSize: 10, color: "#185FA5", fontWeight: 500 }}>{c.buildingName}</span>}
                          </div>
                          <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                            {c.bedBath} &middot; {c.type}
                            {c.sqft && <span> &middot; {c.sqft} sqft</span>}
                            {c.floor && <span> &middot; {c.floor} fl</span>}
                            {" "}&middot; {c.soldDate}
                            {c.notes && <span> &middot; {c.notes}</span>}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <QualityBadge q={c.quality} />
                            {c.weight != null && (
                              <span style={{ fontSize: 11, color: "#888", fontFamily: "'DM Mono', monospace" }}>
                                wt: {(c.weight * 100).toFixed(0)}%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* Adjustment math */}
                      <div style={{ padding: "10px 16px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
                          <span style={{ color: "#666" }}>Sold price</span>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{formatPrice(c.soldPrice)}</span>
                        </div>
                        {c.adjustments?.map((adj, j) => (
                          <div key={j} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0 3px 12px", fontSize: 12 }}>
                            <span style={{ color: "#888" }}>{adj.factor}</span>
                            <span style={{
                              fontFamily: "'DM Mono', monospace",
                              color: adj.amount > 0 ? "#0F6E56" : adj.amount < 0 ? "#A32D2D" : "#666",
                              fontWeight: 500,
                            }}>
                              {adj.amount > 0 ? "+" : ""}{formatPrice(adj.amount)}
                            </span>
                          </div>
                        ))}
                        <div style={{ borderTop: "1px solid #eeece6", marginTop: 6, paddingTop: 6, display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                          <span style={{ color: "#666" }}>
                            Net adjustment
                            <span style={{ color: "#bbb", marginLeft: 6, fontSize: 11 }}>
                              ({c.totalAdjustment > 0 ? "+" : ""}{formatPrice(c.totalAdjustment)})
                            </span>
                          </span>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 14 }}>
                            {formatPrice(c.adjustedPrice)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reconciliation: weighted average breakdown */}
            {data.comparables?.length > 0 && (data.reconciliation || data.valuation) && (
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.1em", color: "#999", marginBottom: 10 }}>
                  Valuation reconciliation
                </div>
                <div style={{ background: "#fff", border: "1.5px solid #d4d0c8", borderRadius: 10, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#f7f6f3" }}>
                        <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "#888", fontSize: 11, textTransform: "uppercase" }}>Comp</th>
                        <th style={{ textAlign: "right", padding: "8px 12px", fontWeight: 600, color: "#888", fontSize: 11, textTransform: "uppercase" }}>Adj. price</th>
                        <th style={{ textAlign: "center", padding: "8px 12px", fontWeight: 600, color: "#888", fontSize: 11, textTransform: "uppercase" }}>Weight</th>
                        <th style={{ textAlign: "right", padding: "8px 12px", fontWeight: 600, color: "#888", fontSize: 11, textTransform: "uppercase" }}>Contribution</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.comparables.map((c, i) => (
                        <tr key={i} style={{ borderTop: "1px solid #eeece6" }}>
                          <td style={{ padding: "8px 12px", fontSize: 12 }}>{c.address}</td>
                          <td style={{ textAlign: "right", padding: "8px 12px", fontFamily: "'DM Mono', monospace" }}>{formatPrice(c.adjustedPrice)}</td>
                          <td style={{ textAlign: "center", padding: "8px 12px", fontFamily: "'DM Mono', monospace", color: "#888" }}>{c.weight != null ? (c.weight * 100).toFixed(0) + "%" : "—"}</td>
                          <td style={{ textAlign: "right", padding: "8px 12px", fontFamily: "'DM Mono', monospace", fontWeight: 500 }}>
                            {c.adjustedPrice && c.weight != null ? formatPrice(Math.round(c.adjustedPrice * c.weight)) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: "2px solid #1a1a1a", background: "#fafaf7" }}>
                        <td style={{ padding: "10px 12px", fontWeight: 700 }}>Weighted average</td>
                        <td></td>
                        <td style={{ textAlign: "center", padding: "10px 12px", fontFamily: "'DM Mono', monospace", color: "#888" }}>100%</td>
                        <td style={{ textAlign: "right", padding: "10px 12px", fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 15 }}>
                          {formatPrice((data.reconciliation || data.valuation)?.weightedAverage || (data.reconciliation || data.valuation)?.midpoint)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
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

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 24 }}>
              <button
                onClick={exportPDF}
                style={{
                  padding: "10px 24px", fontSize: 13, fontWeight: 600, border: "none",
                  borderRadius: 8, background: "#1a1a1a", color: "#fff", cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s",
                }}
              >
                Export PDF
              </button>
              <button
                onClick={() => { setData(null); setAddress(""); setUnitNumber(""); }}
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
              House: "165 Waverley Road, Toronto" &middot; Condo: Unit 3508 + "375 King Street West, Toronto"
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
