"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useRestaurant } from "@/lib/restaurant";

/**
 * Two upload paths in one page:
 *  1. AI drag-and-drop  — drop any receipt (PDF, image, Excel, CSV).
 *     Sent to /api/parse-invoice which calls Claude. Preview, then save.
 *  2. Manual CSV bulk upload — for written-receipt stores. Standard template,
 *     parsed in-browser, inserted directly to Supabase.
 */

// ── Manual CSV path ──────────────────────────────────────────────────────────

const TEMPLATE = `invoice_number,invoice_date,vendor,item_name,category,unit_qty,case_qty,unit_price,total
INV-001,2026-02-12,Indian Bazaar,Basmati Rice 20lb,Dry Goods,1,0,28.99,28.99
INV-001,2026-02-12,Indian Bazaar,Paneer 1lb,Dairy,3,0,5.49,16.47
`;

type Row = Record<string, string>;

function parseCSV(text: string): Row[] {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells =
      line
        .match(/("([^"]|"")*"|[^,]*)(,|$)/g)
        ?.map((c) =>
          c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"')
        ) || [];
    const row: Row = {};
    headers.forEach((h, i) => (row[h] = (cells[i] || "").trim()));
    return row;
  });
}

// ── AI parsed-invoice schema ─────────────────────────────────────────────────

type ParsedItem = {
  item_name: string;
  display_name: string;
  category: string;
  quantity: number;
  purchase_unit: "lb" | "each" | "case";
  unit_price: number;
  total: number;
};

type ParsedInvoice = {
  vendor: string;
  invoice_number: string | null;
  invoice_date: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  previous_balance: number | null;
  credit_used: number | null;
  amount_paid: number | null;
  items: ParsedItem[];
  _meta?: {
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
    model: string;
    line_sum?: number;
    warning?: string | null;
  };
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default function UploadPage() {
  const { current } = useRestaurant();

  // AI path state
  const [dragging, setDragging] = useState(false);
  const [aiFile, setAiFile] = useState<File | null>(null);
  const [aiStatus, setAiStatus] =
    useState<"idle" | "parsing" | "preview" | "saving" | "saved" | "error">("idle");
  const [aiError, setAiError] = useState("");
  const [parsed, setParsed] = useState<ParsedInvoice | null>(null);
  const [savedHeaderId, setSavedHeaderId] = useState<string | null>(null);
  const aiInputRef = useRef<HTMLInputElement>(null);

  // CSV path state
  const [csvStatus, setCsvStatus] = useState("");
  const [csvBusy, setCsvBusy] = useState(false);

  // ── AI: parse + save ──────────────────────────────────────────────────────

  async function aiParse(file: File) {
    setAiFile(file);
    setAiStatus("parsing");
    setAiError("");
    setParsed(null);
    setSavedHeaderId(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const resp = await fetch("/api/parse-invoice", {
        method: "POST",
        body: form,
      });
      const json = await resp.json();
      if (!resp.ok) {
        setAiStatus("error");
        setAiError(json.error || "Parse failed");
        return;
      }
      setParsed(json);
      setAiStatus("preview");
    } catch (e: any) {
      setAiStatus("error");
      setAiError(e.message || "Network error");
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) aiParse(f);
  }, []);

  async function aiSave() {
    if (!parsed || !current) return;
    setAiStatus("saving");
    setAiError("");
    try {
      const lineSum = parsed.items.reduce(
        (s, i) => s + (Number(i.total) || 0),
        0
      );
      const total =
        parsed.total ?? (lineSum !== 0 ? Math.round(lineSum * 100) / 100 : 0);

      // Step 1: create an invoice_files row (file_id is NOT NULL on invoice_headers).
      // For manual uploads we synthesize a unique drive_file_id prefixed "manual:".
      const syntheticDriveId = `manual:${crypto.randomUUID()}`;
      const { data: fileRow, error: fErr } = await supabase
        .from("invoice_files")
        .insert({
          restaurant_id: current.id,
          drive_file_id: syntheticDriveId,
          filename: aiFile?.name || `manual-${Date.now()}`,
          file_date: parsed.invoice_date,
          file_total: total,
          status: "done",
        })
        .select("id")
        .single();
      if (fErr || !fileRow)
        throw new Error(fErr?.message || "file row insert failed");

      // Step 2: insert invoice_headers, linking to the file row.
      const { data: header, error: hErr } = await supabase
        .from("invoice_headers")
        .insert({
          restaurant_id: current.id,
          file_id: fileRow.id,
          vendor: parsed.vendor || "Unknown",
          invoice_number: parsed.invoice_number,
          invoice_date: parsed.invoice_date,
          subtotal: parsed.subtotal,
          tax: parsed.tax,
          total,
          previous_balance: parsed.previous_balance ?? 0,
          credit_used: parsed.credit_used ?? 0,
          amount_paid: parsed.amount_paid,
        })
        .select("id")
        .single();
      if (hErr || !header) throw new Error(hErr?.message || "header insert failed");

      const lineRows = parsed.items.map((item) => ({
        header_id: header.id,
        restaurant_id: current.id,
        invoice_date: parsed.invoice_date,
        item_name: item.item_name,
        display_name: item.display_name,
        category: item.category,
        purchase_unit: item.purchase_unit,
        unit_qty:
          item.purchase_unit === "lb" || item.purchase_unit === "each"
            ? item.quantity
            : 0,
        case_qty: item.purchase_unit === "case" ? item.quantity : 0,
        unit_price: item.unit_price,
        total: item.total,
      }));
      const { error: lErr } = await supabase
        .from("invoice_lines")
        .insert(lineRows);
      if (lErr) throw new Error(lErr.message);

      setSavedHeaderId(header.id);
      setAiStatus("saved");
    } catch (e: any) {
      setAiStatus("error");
      setAiError(e.message);
    }
  }

  function aiReset() {
    setAiFile(null);
    setParsed(null);
    setAiStatus("idle");
    setAiError("");
    setSavedHeaderId(null);
  }

  // ── CSV path ──────────────────────────────────────────────────────────────

  async function csvUpload(file: File) {
    if (!current) {
      setCsvStatus("❌ Pick a restaurant first.");
      return;
    }
    setCsvBusy(true);
    setCsvStatus("Parsing CSV…");
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (!rows.length) throw new Error("Empty CSV");

      const byInvoice = new Map<string, Row[]>();
      for (const r of rows) {
        const key = `${r.invoice_number}|${r.vendor}`;
        if (!byInvoice.has(key)) byInvoice.set(key, []);
        byInvoice.get(key)!.push(r);
      }

      let inserted = 0;
      for (const [, group] of byInvoice) {
        const first = group[0];
        const total = group.reduce((s, r) => s + Number(r.total || 0), 0);

        // Synthetic invoice_files row (NOT NULL constraint on header.file_id)
        const syntheticDriveId = `manual:${crypto.randomUUID()}`;
        const { data: fileRow, error: fErr } = await supabase
          .from("invoice_files")
          .insert({
            restaurant_id: current.id,
            drive_file_id: syntheticDriveId,
            filename: `csv-${first.invoice_number}-${Date.now()}`,
            file_date: first.invoice_date || null,
            file_total: total,
            status: "done",
          })
          .select("id")
          .single();
        if (fErr || !fileRow)
          throw fErr || new Error("file row insert failed");

        const { data: header, error: hErr } = await supabase
          .from("invoice_headers")
          .upsert(
            {
              restaurant_id: current.id,
              file_id: fileRow.id,
              invoice_number: first.invoice_number,
              invoice_date: first.invoice_date || null,
              vendor: first.vendor,
              subtotal: total,
              tax: 0,
              total,
            },
            { onConflict: "restaurant_id,invoice_number" }
          )
          .select("id")
          .single();
        if (hErr || !header) throw hErr || new Error("header insert failed");

        const lineRows = group.map((r) => ({
          header_id: header.id,
          restaurant_id: current.id,
          invoice_date: r.invoice_date || null,
          item_name: r.item_name,
          display_name: r.item_name,
          category: r.category || "Other",
          unit_qty: Number(r.unit_qty || 0),
          case_qty: Number(r.case_qty || 0),
          unit_price: Number(r.unit_price || 0),
          total: Number(r.total || 0),
          purchase_unit:
            Number(r.case_qty) > 0
              ? "case"
              : Number(r.unit_qty) > 1
                ? "lb"
                : "each",
        }));
        const { error: lErr } = await supabase
          .from("invoice_lines")
          .insert(lineRows);
        if (lErr) throw lErr;
        inserted += lineRows.length;
      }
      setCsvStatus(
        `✅ Inserted ${inserted} line items across ${byInvoice.size} invoice(s).`
      );
    } catch (e: any) {
      setCsvStatus(`❌ ${e.message || e}`);
    } finally {
      setCsvBusy(false);
    }
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "invoice_template.csv";
    a.click();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const credits = parsed
    ? parsed.items.filter((i) => Number(i.total) < 0)
    : [];
  const regular = parsed
    ? parsed.items.filter((i) => Number(i.total) >= 0)
    : [];
  const netTotal = parsed
    ? parsed.items.reduce((s, i) => s + (Number(i.total) || 0), 0)
    : 0;

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Upload Invoice</h1>
        <p className="text-sm text-slate-600 mt-1">
          Drop any receipt — PDF, image, Excel, or CSV — and AI extracts the
          line items.
        </p>
      </div>

      {/* ── AI drag/drop ─────────────────────────────────────────────────── */}

      {aiStatus === "saved" && savedHeaderId && parsed ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 flex items-start gap-4">
          <span className="text-2xl">✅</span>
          <div className="flex-1">
            <div className="font-semibold text-green-800">
              Invoice saved successfully
            </div>
            <div className="text-sm text-green-700 mt-1">
              {parsed.items.length} line items added to your records.
            </div>
            <div className="flex gap-2 mt-3">
              <Link
                href={`/receipts/${savedHeaderId}`}
                className="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700"
              >
                View Invoice
              </Link>
              <button
                onClick={aiReset}
                className="px-4 py-2 border border-green-300 text-green-700 rounded text-sm hover:bg-green-50"
              >
                Upload Another
              </button>
            </div>
          </div>
        </div>
      ) : aiStatus === "idle" ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => aiInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition ${
            dragging
              ? "border-blue-500 bg-blue-50"
              : "border-slate-300 hover:border-blue-400 hover:bg-slate-50"
          }`}
        >
          <input
            ref={aiInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) aiParse(f);
            }}
          />
          <div className="text-4xl mb-3">📄</div>
          <div className="font-medium">
            Drop invoice here or click to browse
          </div>
          <div className="text-sm text-slate-500 mt-1">
            PDF, PNG, JPG, Excel, CSV — AI parses everything
          </div>
        </div>
      ) : null}

      {aiStatus === "parsing" && (
        <div className="bg-white p-12 rounded-lg shadow text-center text-slate-600">
          <div className="inline-block animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full mb-3" />
          <div>
            Parsing <span className="font-medium">{aiFile?.name}</span> with AI…
          </div>
        </div>
      )}

      {aiStatus === "error" && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex justify-between items-start">
          <div>
            <div className="font-semibold text-red-800">Parse failed</div>
            <div className="text-sm text-red-700 mt-1">{aiError}</div>
          </div>
          <button
            onClick={aiReset}
            className="text-red-600 hover:text-red-800"
          >
            ✕
          </button>
        </div>
      )}

      {(aiStatus === "preview" || aiStatus === "saving") && parsed && (
        <>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-semibold text-lg">{parsed.vendor}</div>
                <div className="text-sm text-slate-600 mt-1">
                  {parsed.invoice_date && <>{parsed.invoice_date} · </>}
                  {parsed.invoice_number && <>#{parsed.invoice_number} · </>}
                  {regular.length} line{regular.length === 1 ? "" : "s"}
                  {(() => {
                    const totalQty = regular.reduce(
                      (s, i) => s + (Number(i.quantity) || 0),
                      0
                    );
                    return totalQty !== regular.length ? (
                      <> · {totalQty} units</>
                    ) : null;
                  })()}
                  {credits.length > 0 && (
                    <span className="text-red-600 ml-1">
                      · {credits.length} credit{credits.length > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Net Total
                </div>
                <div className="text-2xl font-bold">
                  ${netTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
            {parsed._meta && (
              <>
                <div className="mt-4 pt-4 border-t flex items-center gap-4 text-xs text-slate-500">
                  <span>🤖 {parsed._meta.model}</span>
                  <span>
                    {parsed._meta.input_tokens.toLocaleString()} in /{" "}
                    {parsed._meta.output_tokens.toLocaleString()} out tokens
                  </span>
                  <span className="ml-auto font-medium text-slate-700">
                    Parse cost:{" "}
                    <span className="text-amber-600">
                      ${parsed._meta.cost_usd.toFixed(4)}
                    </span>
                  </span>
                </div>
                {parsed._meta.warning && (
                  <div className="mt-3 bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800 flex items-start gap-2">
                    <span>⚠️</span>
                    <div>
                      <div className="font-semibold">AI count may be off</div>
                      <div className="text-xs mt-0.5">{parsed._meta.warning}</div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-left">
                <tr>
                  <th className="px-4 py-2">Item</th>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2 text-right">Qty</th>
                  <th className="px-4 py-2 text-right">Unit</th>
                  <th className="px-4 py-2 text-right">Unit Price</th>
                  <th className="px-4 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {regular.map((item, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-4 py-2 font-medium">{item.display_name}</td>
                    <td className="px-4 py-2">{item.category}</td>
                    <td className="px-4 py-2 text-right">{item.quantity}</td>
                    <td className="px-4 py-2 text-right text-slate-500 text-xs">
                      {item.purchase_unit}
                    </td>
                    <td className="px-4 py-2 text-right">
                      ${Number(item.unit_price ?? 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold">
                      ${Number(item.total ?? 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
                {credits.map((item, i) => (
                  <tr key={`cr-${i}`} className="border-t bg-red-50">
                    <td className="px-4 py-2 font-medium text-red-800">
                      {item.display_name}{" "}
                      <span className="text-xs font-normal">(credit)</span>
                    </td>
                    <td className="px-4 py-2 text-red-700">{item.category}</td>
                    <td className="px-4 py-2 text-right text-red-700">
                      {item.quantity}
                    </td>
                    <td className="px-4 py-2 text-right text-red-500 text-xs">
                      {item.purchase_unit}
                    </td>
                    <td className="px-4 py-2 text-right text-red-700">
                      ${Number(item.unit_price ?? 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-red-700">
                      ${Number(item.total ?? 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <button
              onClick={aiSave}
              disabled={aiStatus === "saving" || !current}
              className="px-6 py-2 bg-slate-900 text-white rounded text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
            >
              {aiStatus === "saving" ? "Saving…" : "Save to Records"}
            </button>
            <button
              onClick={aiReset}
              className="px-4 py-2 border rounded text-sm hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {/* ── Manual CSV section ───────────────────────────────────────────── */}

      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold">Bulk CSV Upload</h2>
            <p className="text-sm text-slate-600 mt-1">
              For written-receipt stores (Indian groceries etc.) — fill in the
              template and upload.
            </p>
          </div>
          <button
            onClick={downloadTemplate}
            className="px-4 py-2 border rounded text-sm hover:bg-slate-50"
          >
            📋 Template
          </button>
        </div>

        <input
          type="file"
          accept=".csv"
          disabled={csvBusy}
          onChange={(e) => e.target.files?.[0] && csvUpload(e.target.files[0])}
          className="block w-full border rounded p-2 text-sm"
        />

        {csvStatus && (
          <div
            className={`p-3 rounded text-sm ${
              csvStatus.startsWith("❌")
                ? "bg-red-100 text-red-800"
                : "bg-green-100 text-green-800"
            }`}
          >
            {csvStatus}
          </div>
        )}

        <details className="text-sm">
          <summary className="cursor-pointer text-slate-600 hover:text-slate-900">
            CSV format
          </summary>
          <pre className="bg-slate-100 p-3 rounded text-xs mt-2 overflow-x-auto">
            {TEMPLATE}
          </pre>
          <ul className="mt-2 list-disc list-inside text-slate-600 space-y-1">
            <li>
              <code>invoice_number</code> — unique per receipt; rows with the
              same number group into one invoice.
            </li>
            <li>
              For voids/returns enter a negative qty + negative total — the
              dashboard nets them automatically.
            </li>
          </ul>
        </details>
      </div>
    </div>
  );
}
