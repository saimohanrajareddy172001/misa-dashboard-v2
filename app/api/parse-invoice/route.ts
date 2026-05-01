import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are an invoice parser. Extract all line items from the invoice and return ONLY valid JSON in this exact shape:
{
  "vendor": "Restaurant Depot" | other,
  "invoice_number": "string or null",
  "invoice_date": "YYYY-MM-DD or null",
  "subtotal": number or null,
  "tax": number or null,
  "total": number or null,
  "previous_balance": number or null,
  "credit_used": number or null,
  "amount_paid": number or null,
  "items": [{
    "item_name": "exact text from invoice",
    "display_name": "clean readable name (expand abbreviations: CHIX→Chicken, BNLS→Boneless, BRST→Breast, THGH→Thigh, SHR→Shrimp, FZ→Frozen, PROD→remove prefix, BTR→Butter, CHS→Cheese, MLK→Milk, EVAP→Evaporated)",
    "category": "Frozen | Supplies | Produce | Protein | Dairy | Beverages | Dry Goods | Other",
    "quantity": number,
    "purchase_unit": "lb | each | case",
    "unit_price": number,
    "total": number
  }]
}

CRITICAL RULES:
- "invoice_date" MUST be filled in YYYY-MM-DD format. Look EVERYWHERE on the receipt — it may be in:
  • A header like "Date:" or "Invoice Date:"
  • Near the invoice number ("Invoice 12345 · 2026/04/27 11:15 am")
  • The receipt FOOTER/timestamp ("104064 01-13-26 11:47A 363/65" — this is MM-DD-YY 01-13-26 → 2026-01-13)
  • A printed timestamp at the very bottom
  Convert any format (MM/DD/YY, MM-DD-YY, YYYY/MM/DD) to ISO YYYY-MM-DD. Two-digit years 20-99 → 1920-1999, 00-19 → 2020-2119. NEVER return null if any date appears anywhere on the receipt.
- "category" MUST be one of EXACTLY these 8 strings — Frozen, Supplies, Produce, Protein, Dairy, Beverages, Dry Goods, Other.
  Map: Meat/Chicken/Beef/Seafood→Protein. Packaging/Containers/Bags/Cleaning→Supplies. Spices/Sauces/Condiments/Oils/Rice/Bread/Bakery→Dry Goods. Eggs/Yogurt/Milk/Cheese/Cream→Dairy. Water/Juice/Soda/Tea/Coffee→Beverages.
- "unit_price" must NEVER be 0 when total > 0. If only line total is given, derive unit_price = round(total / qty, 4).
- Skip Sub-Total/Tax/Total/Balance summary rows from items.
- "Previous Balance" / "IOU" / "Account Credit" → previous_balance. Negative = customer credit available.
- Payment lines (AMEX/Visa/Cash/Check) → amount_paid (sum if multiple).
- "Credit Applied" / "Balance Used" → credit_used.
- COUNTING RULE: Count EVERY visible line on the receipt, even if many lines look identical. If you see 12 lines of "JUMBO CAULI 3.99", the quantity is 12, not 8 or 10.
- VERIFY YOUR COUNT: Sum the totals of all your output items. The sum MUST equal the printed Subtotal on the receipt (before tax). If it doesn't match, you miscounted — recount the lines and adjust quantities until items sum = subtotal exactly.
- MERGING RULE: If the SAME item (same item_name AND same unit_price) appears multiple times, output ONE line with the summed quantity and summed total. Example: receipt shows "JUMBO CAULI 3.99" listed 12 times → output ONE line: { item_name: "JUMBO CAULI", quantity: 12, unit_price: 3.99, total: 47.88 }. Never split identical items into arbitrary subgroups.
- VOID/RETURN RULE: If the same item appears with opposite-sign quantities (e.g. +16 case and -16 case), emit a single line with qty=0 and total=0 (fully voided).
- purchase_unit: "lb" if sold by weight, "case" if case_qty>0, else "each".
- Credits/returns should have negative total values.
- All numbers as floats, no currency symbols.`;

// gpt-4o-mini pricing (Nov 2025): $0.15 input / $0.60 output per million tokens.
const PRICE_INPUT_PER_M = 0.15;
const PRICE_OUTPUT_PER_M = 0.6;
const MODEL = "gpt-4o-mini";

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not set in environment" },
      { status: 500 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const bytes = await file.arrayBuffer();
  const mime = file.type || "application/octet-stream";
  const name = file.name.toLowerCase();
  const isPdf = mime === "application/pdf" || name.endsWith(".pdf");
  const isImage = mime.startsWith("image/");

  // Build the user-message content array. OpenAI Chat Completions accepts:
  //   - { type: "text", text: ... }
  //   - { type: "image_url", image_url: { url: data-uri } }
  //   - { type: "file", file: { filename, file_data: data-uri } }   ← PDFs
  const userContent: any[] = [
    { type: "text", text: "Parse this invoice and return ONLY the JSON object — no markdown." },
  ];

  if (isPdf) {
    const base64 = Buffer.from(bytes).toString("base64");
    userContent.push({
      type: "file",
      file: {
        filename: file.name,
        file_data: `data:application/pdf;base64,${base64}`,
      },
    });
  } else if (isImage) {
    const base64 = Buffer.from(bytes).toString("base64");
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${mime};base64,${base64}` },
    });
  } else {
    // CSV, XLSX-as-CSV-text, plain text
    const text = Buffer.from(bytes).toString("utf-8");
    userContent.push({
      type: "text",
      text: `Invoice file content:\n\n${text}`,
    });
  }

  const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      max_tokens: 8192,
      temperature: 0,
    }),
  });

  if (!openaiResp.ok) {
    const err = await openaiResp.text();
    return NextResponse.json(
      { error: `OpenAI API error: ${err}` },
      { status: openaiResp.status }
    );
  }

  const result = await openaiResp.json();
  const raw: string = result.choices?.[0]?.message?.content ?? "";

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return NextResponse.json(
      { error: `Could not parse OpenAI response as JSON: ${raw.slice(0, 200)}` },
      { status: 500 }
    );
  }

  // Defensive enrichment — derive missing unit_price/total
  for (const item of parsed.items || []) {
    item.display_name = item.display_name || item.item_name;
    item.purchase_unit = item.purchase_unit || "each";
    const qty = item.quantity || 1;
    const price = item.unit_price || 0;
    const total = item.total || 0;
    if (price && !total) item.total = Math.round(price * qty * 100) / 100;
    else if (total && !price && qty)
      item.unit_price = Math.round((total / qty) * 10000) / 10000;
  }

  // Server-side merge: if the model ignored the merge rule and emitted N copies
  // of an identical item, collapse them. Key = item_name + unit_price + purchase_unit.
  const merged = new Map<string, any>();
  for (const item of parsed.items || []) {
    const key = `${item.item_name}|${item.unit_price}|${item.purchase_unit}`;
    if (!merged.has(key)) {
      merged.set(key, { ...item });
    } else {
      const existing = merged.get(key);
      existing.quantity = (existing.quantity || 0) + (item.quantity || 0);
      existing.total =
        Math.round(((existing.total || 0) + (item.total || 0)) * 100) / 100;
    }
  }
  parsed.items = Array.from(merged.values());

  // Cost meter
  const usage = result.usage || {};
  const inputTokens = usage.prompt_tokens || 0;
  const outputTokens = usage.completion_tokens || 0;
  const cost =
    (inputTokens * PRICE_INPUT_PER_M) / 1_000_000 +
    (outputTokens * PRICE_OUTPUT_PER_M) / 1_000_000;

  // Math validator — sum of line items should match the printed subtotal (before tax).
  // Flag if it doesn't so the user knows to manually recount.
  const lineSum =
    (parsed.items || []).reduce(
      (s: number, i: any) => s + (Number(i.total) || 0),
      0
    ) || 0;
  const printedSubtotal = Number(parsed.subtotal) || 0;
  const printedTotal = Number(parsed.total) || 0;
  let warning: string | null = null;
  if (printedSubtotal > 0 && Math.abs(printedSubtotal - lineSum) > 0.5) {
    warning = `Items sum to $${lineSum.toFixed(2)} but receipt subtotal is $${printedSubtotal.toFixed(2)} — AI may have miscounted. Verify before saving.`;
  } else if (
    !printedSubtotal &&
    printedTotal > 0 &&
    Math.abs(printedTotal - lineSum) > printedTotal * 0.15
  ) {
    // No subtotal printed; allow up to 15% gap from total (tax, fees, credits)
    warning = `Items sum to $${lineSum.toFixed(2)} but receipt total is $${printedTotal.toFixed(2)} — large gap. AI may have miscounted.`;
  }

  return NextResponse.json({
    ...parsed,
    _meta: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: Math.round(cost * 100000) / 100000, // 5 decimal places
      model: MODEL,
      line_sum: Math.round(lineSum * 100) / 100,
      warning,
    },
  });
}
