"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, type InvoiceLine } from "@/lib/supabase";
import { useRestaurant } from "@/lib/restaurant";
import { downloadCSV } from "@/lib/export";

/**
 * Price tracker — track price-per-lb / per-unit / per-case over time.
 * For meat (lb): tracks $/lb across orders so cost/wastage variance is visible.
 * Cross-checks against POS inventory data when available (placeholder for now).
 */
export default function PriceTracker() {
  const { current } = useRestaurant();
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [unit, setUnit] = useState<"lb" | "each" | "case" | "all">("lb");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!current) return;
    (async () => {
      const { data } = await supabase
        .from("invoice_lines")
        .select("*, invoice_headers(vendor, invoice_number)")
        .eq("restaurant_id", current.id)
        .order("invoice_date", { ascending: true });
      const flattened: InvoiceLine[] = (data as any[] | null)?.map((row) => ({
        ...row,
        vendor: row.invoice_headers?.vendor ?? null,
        invoice_number: row.invoice_headers?.invoice_number,
      })) || [];
      setLines(flattened);
    })();
  }, [current]);

  const tracked = useMemo(() => {
    const map = new Map<
      string,
      { item: string; unit: string; prices: { date: string; price: number; vendor: string | null }[]; min: number; max: number; latest: number; variance: number }
    >();
    for (const l of lines) {
      if (unit !== "all" && (l.purchase_unit ?? "each") !== unit) continue;
      if (search && !((l.display_name || l.item_name).toLowerCase().includes(search.toLowerCase()))) continue;
      const key = `${l.display_name || l.item_name}::${l.purchase_unit ?? "each"}`;
      const e = map.get(key) || {
        item: l.display_name || l.item_name,
        unit: l.purchase_unit ?? "each",
        prices: [],
        min: Infinity,
        max: -Infinity,
        latest: 0,
        variance: 0,
      };
      const p = Number(l.unit_price || 0);
      if (p > 0) {
        e.prices.push({ date: l.invoice_date || "", price: p, vendor: l.vendor });
        e.min = Math.min(e.min, p);
        e.max = Math.max(e.max, p);
        e.latest = p;
      }
      map.set(key, e);
    }
    return Array.from(map.values())
      .filter((e) => e.prices.length > 0)
      .map((e) => ({ ...e, variance: e.max - e.min }))
      .sort((a, b) => b.variance - a.variance);
  }, [lines, unit, search]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Price Tracker</h1>
      <p className="text-sm text-slate-600">
        Track $/lb, $/unit, $/case over time. Items with the largest price swings appear first —
        cross-check against POS data to spot cost / wastage variance.
      </p>

      <div className="bg-white p-4 rounded-lg shadow flex gap-4 items-end flex-wrap">
        <label className="flex flex-col text-sm">Purchase unit
          <select value={unit} onChange={(e) => setUnit(e.target.value as any)} className="border rounded px-3 py-2">
            <option value="all">All</option>
            <option value="lb">Per Pound</option>
            <option value="each">Per Unit</option>
            <option value="case">Per Case</option>
          </select>
        </label>
        <label className="flex flex-col text-sm flex-1">Search
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Item name…" className="border rounded px-3 py-2" />
        </label>
        <button
          onClick={() =>
            downloadCSV(
              `prices_${unit}.csv`,
              tracked.map((t) => ({ item: t.item, unit: t.unit, min: t.min, max: t.max, latest: t.latest, variance: t.variance, samples: t.prices.length }))
            )
          }
          className="px-4 py-2 bg-slate-900 text-white rounded text-sm"
        >📥 CSV</button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-2 text-left">Item</th>
              <th className="px-4 py-2 text-left">Unit</th>
              <th className="px-4 py-2 text-right">Min</th>
              <th className="px-4 py-2 text-right">Max</th>
              <th className="px-4 py-2 text-right">Latest</th>
              <th className="px-4 py-2 text-right">Δ (variance)</th>
              <th className="px-4 py-2 text-right">Samples</th>
            </tr>
          </thead>
          <tbody>
            {tracked.slice(0, 100).map((t) => (
              <tr key={`${t.item}-${t.unit}`} className="border-t">
                <td className="px-4 py-2">{t.item}</td>
                <td className="px-4 py-2">{t.unit}</td>
                <td className="px-4 py-2 text-right">${t.min.toFixed(2)}</td>
                <td className="px-4 py-2 text-right">${t.max.toFixed(2)}</td>
                <td className="px-4 py-2 text-right">${t.latest.toFixed(2)}</td>
                <td className={`px-4 py-2 text-right font-medium ${t.variance > 1 ? "text-red-600" : "text-slate-600"}`}>
                  ${t.variance.toFixed(2)}
                </td>
                <td className="px-4 py-2 text-right">{t.prices.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
