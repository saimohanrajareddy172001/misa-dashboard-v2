"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, type InvoiceHeader, type InvoiceLine } from "@/lib/supabase";
import { netLines } from "@/lib/netting";
import { downloadCSV } from "@/lib/export";

export default function ReceiptDetail({ params }: { params: { id: string } }) {
  const { id } = params;
  const [header, setHeader] = useState<InvoiceHeader | null>(null);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [showVoided, setShowVoided] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: h } = await supabase
        .from("invoice_headers")
        .select("*")
        .eq("id", id)
        .single();
      setHeader(h as InvoiceHeader);

      if (h) {
        const { data: l } = await supabase
          .from("invoice_lines")
          .select("*")
          .eq("header_id", h.id);
        setLines((l as InvoiceLine[]) || []);
      }
    })();
  }, [id]);

  if (!header) return <div>Loading…</div>;

  const netted = netLines(lines);
  const visible = showVoided ? netted : netted.filter((l) => !l.is_voided);

  return (
    <div className="space-y-6">
      <Link href="/" className="text-blue-600 hover:underline text-sm">← Back to dashboard</Link>

      <div className="bg-white p-6 rounded-lg shadow">
        <h1 className="text-2xl font-bold">{header.vendor || "Unknown vendor"}</h1>
        <div className="text-slate-600 mt-1">
          Invoice #{header.invoice_number} · {header.invoice_date || "no date"}
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4 text-sm">
          <div><span className="text-slate-500">Subtotal:</span> ${Number(header.subtotal ?? 0).toFixed(2)}</div>
          <div><span className="text-slate-500">Tax:</span> ${Number(header.tax ?? 0).toFixed(2)}</div>
          <div className="font-bold"><span className="text-slate-500 font-normal">Total:</span> ${Number(header.total).toFixed(2)}</div>
        </div>

        {(Number(header.previous_balance ?? 0) !== 0 || Number(header.credit_used ?? 0) !== 0 || header.amount_paid != null) && (
          <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-4 text-sm">
            {Number(header.previous_balance ?? 0) !== 0 && (
              <div>
                <span className="text-slate-500">Previous balance:</span>{" "}
                <span className={Number(header.previous_balance) < 0 ? "text-green-600" : "text-amber-600"}>
                  ${Number(header.previous_balance).toFixed(2)}
                </span>
              </div>
            )}
            {Number(header.credit_used ?? 0) !== 0 && (
              <div>
                <span className="text-slate-500">Store credit applied:</span>{" "}
                <span className="text-green-600">−${Number(header.credit_used).toFixed(2)}</span>
              </div>
            )}
            {header.amount_paid != null && (
              <div>
                <span className="text-slate-500">Paid (cash/card):</span> ${Number(header.amount_paid).toFixed(2)}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">
          Items ({visible.length}{!showVoided && netted.some(l => l.is_voided) ? ` · ${netted.filter(l=>l.is_voided).length} voided hidden` : ""})
        </h2>
        <div className="flex gap-2">
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} />
            Show voided/returned
          </label>
          <button
            onClick={() => downloadCSV(`receipt_${header.invoice_number}.csv`, visible)}
            className="px-3 py-1 bg-slate-900 text-white rounded text-sm"
          >📥 CSV</button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="px-4 py-2">Item</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2 text-right">Unit Qty</th>
              <th className="px-4 py-2 text-right">Case Qty</th>
              <th className="px-4 py-2 text-right">Unit Price</th>
              <th className="px-4 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((l) => (
              <tr key={l.id} className={`border-t ${l.is_voided ? "bg-amber-50 text-slate-500" : ""}`}>
                <td className="px-4 py-2">
                  {l.display_name || l.item_name}
                  {l.is_voided && <span className="ml-2 text-xs bg-amber-200 px-2 py-0.5 rounded">VOIDED</span>}
                </td>
                <td className="px-4 py-2">{l.category}</td>
                <td className="px-4 py-2 text-right">{Number(l.unit_qty).toFixed(2)}</td>
                <td className="px-4 py-2 text-right">{Number(l.case_qty).toFixed(2)}</td>
                <td className="px-4 py-2 text-right">${Number(l.unit_price).toFixed(2)}</td>
                <td className="px-4 py-2 text-right">${Number(l.total).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
