"use client";

import { useEffect, useState } from "react";
import { supabase, type InvoiceLine } from "@/lib/supabase";
import { useRestaurant } from "@/lib/restaurant";
import { downloadCSV } from "@/lib/export";

type Result = InvoiceLine & {
  invoice_number?: string;
  vendor?: string;
};

export default function SearchPage() {
  const { current } = useRestaurant();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function search() {
    if (!current || !query.trim()) return;
    setLoading(true);
    setSearched(true);
    const q = query.trim();
    const { data } = await supabase
      .from("invoice_lines")
      .select("*, invoice_headers(invoice_number, vendor)")
      .eq("restaurant_id", current.id)
      .or(`item_name.ilike.%${q}%,display_name.ilike.%${q}%`)
      .order("invoice_date", { ascending: false })
      .limit(500);
    const flattened: Result[] =
      (data as any[] | null)?.map((row) => ({
        ...row,
        invoice_number: row.invoice_headers?.invoice_number,
        vendor: row.invoice_headers?.vendor,
      })) || [];
    setResults(flattened);
    setLoading(false);
  }

  const totalSpend = results.reduce((s, r) => s + (Number(r.total) || 0), 0);
  const avgPrice =
    results.length > 0
      ? results.reduce((s, r) => s + (Number(r.unit_price) || 0), 0) / results.length
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Item Search</h1>
        <p className="text-sm text-slate-600 mt-1">
          Search any ingredient across all invoices for{" "}
          {current?.name || "this restaurant"}.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="e.g. chicken, shrimp, cauliflower…"
          className="flex-1 border rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={search}
          disabled={!current}
          className="px-5 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
        >
          Search
        </button>
      </div>

      {searched && !loading && results.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Purchases found" value={results.length} />
          <Stat
            label="Total spend"
            value={`$${totalSpend.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
          />
          <Stat label="Avg unit price" value={`$${avgPrice.toFixed(2)}`} />
        </div>
      )}

      {loading ? (
        <div className="bg-white p-8 rounded-lg shadow text-center text-slate-500">
          Searching…
        </div>
      ) : searched && results.length === 0 ? (
        <div className="bg-white p-8 rounded-lg shadow text-center text-slate-500">
          No results for &quot;{query}&quot;.
        </div>
      ) : results.length > 0 ? (
        <>
          <div className="flex justify-end">
            <button
              onClick={() =>
                downloadCSV(`search_${query.replace(/\s+/g, "_")}.csv`, results)
              }
              className="px-3 py-1 bg-slate-900 text-white rounded text-sm"
            >
              📥 CSV
            </button>
          </div>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-left">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Invoice #</th>
                  <th className="px-4 py-2">Item</th>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2 text-right">Unit Price</th>
                  <th className="px-4 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-500">{r.invoice_date}</td>
                    <td className="px-4 py-2 text-slate-600">
                      #{r.invoice_number || "—"}
                    </td>
                    <td className="px-4 py-2 font-medium">
                      {r.display_name || r.item_name}
                    </td>
                    <td className="px-4 py-2">{r.category}</td>
                    <td className="px-4 py-2 text-right">
                      ${Number(r.unit_price ?? 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold">
                      ${Number(r.total ?? 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
