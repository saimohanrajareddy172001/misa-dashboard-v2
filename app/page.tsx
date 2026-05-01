"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase, type InvoiceHeader } from "@/lib/supabase";
import { useRestaurant } from "@/lib/restaurant";
import { downloadCSV, downloadPDF } from "@/lib/export";

export default function Dashboard() {
  const { current } = useRestaurant();
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000)
    .toISOString()
    .slice(0, 10);

  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [vendor, setVendor] = useState("");
  const [headers, setHeaders] = useState<InvoiceHeader[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!current) {
      setHeaders([]);
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      let q = supabase
        .from("invoice_headers")
        .select("*")
        .eq("restaurant_id", current.id)
        .order("invoice_date", { ascending: false });
      if (from) q = q.gte("invoice_date", from);
      if (to) q = q.lte("invoice_date", to);
      if (vendor) q = q.ilike("vendor", `%${vendor}%`);
      const { data, error } = await q;
      if (error) console.error(error);
      setHeaders((data as InvoiceHeader[]) || []);
      setLoading(false);
    })();
  }, [from, to, vendor, current]);

  const stats = useMemo(() => {
    const total = headers.reduce((s, h) => s + Number(h.total || 0), 0);
    const vendors = new Set(headers.map((h) => h.vendor || "Unknown"));
    return { count: headers.length, total, vendors: vendors.size };
  }, [headers]);

  const exportCSV = () =>
    downloadCSV(
      `invoices_${from}_to_${to}.csv`,
      headers.map((h) => ({
        date: h.invoice_date,
        vendor: h.vendor,
        invoice_number: h.invoice_number,
        subtotal: h.subtotal,
        tax: h.tax,
        total: h.total,
      }))
    );

  const exportPDF = () =>
    downloadPDF(
      `invoices_${from}_to_${to}.pdf`,
      `Invoices ${from} → ${to}`,
      ["Date", "Vendor", "Invoice #", "Subtotal", "Tax", "Total"],
      headers.map((h) => [
        h.invoice_date || "",
        h.vendor || "",
        h.invoice_number,
        h.subtotal,
        h.tax,
        h.total,
      ])
    );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">
        {current ? `${current.name} — Invoices` : "Vendor Invoice Dashboard"}
      </h1>

      <div className="grid grid-cols-3 gap-4">
        <Stat label="Receipts" value={stats.count} />
        <Stat label="Total Spend" value={`$${stats.total.toFixed(2)}`} />
        <Stat label="Vendors" value={stats.vendors} />
      </div>

      <div className="bg-white p-4 rounded-lg shadow flex flex-wrap gap-4 items-end">
        <Field label="From">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
        </Field>
        <Field label="To">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
        </Field>
        <Field label="Vendor">
          <input type="text" placeholder="Any" value={vendor} onChange={(e) => setVendor(e.target.value)} className="input" />
        </Field>
        <div className="flex gap-2 ml-auto">
          <button onClick={exportCSV} className="btn">📥 CSV</button>
          <button onClick={exportPDF} className="btn">📄 PDF</button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {!current ? (
          <div className="p-8 text-center text-slate-500">
            No restaurant linked to your account yet. Run the SQL snippet to grant access, then refresh.
          </div>
        ) : loading ? (
          <div className="p-8 text-center text-slate-500">Loading…</div>
        ) : headers.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No invoices in this range.</div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-100 text-left text-sm">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Vendor</th>
                <th className="px-4 py-2">Invoice #</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {headers.map((h) => (
                <tr key={h.id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-2">{h.invoice_date || "—"}</td>
                  <td className="px-4 py-2 font-medium">{h.vendor || "Unknown"}</td>
                  <td className="px-4 py-2 text-slate-600">{h.invoice_number}</td>
                  <td className="px-4 py-2 text-right">${Number(h.total).toFixed(2)}</td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/receipts/${h.id}`} className="text-blue-600 hover:underline">
                      Detail →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <style jsx global>{`
        .input { @apply border rounded px-3 py-2 text-sm; }
        .btn { @apply px-4 py-2 bg-slate-900 text-white rounded hover:bg-slate-700 text-sm; }
      `}</style>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col text-sm">
      <span className="text-slate-600 mb-1">{label}</span>
      {children}
    </label>
  );
}
