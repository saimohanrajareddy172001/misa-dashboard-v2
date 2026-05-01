"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase, type InvoiceLine } from "@/lib/supabase";
import { useRestaurant } from "@/lib/restaurant";
import { downloadCSV } from "@/lib/export";

export default function ItemsTracker() {
  const { current } = useRestaurant();
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [lines, setLines] = useState<InvoiceLine[]>([]);

  useEffect(() => {
    if (!current) return;
    (async () => {
      let q = supabase
        .from("invoice_lines")
        .select("*")
        .eq("restaurant_id", current.id);
      if (from) q = q.gte("invoice_date", from);
      if (to) q = q.lte("invoice_date", to);
      const { data } = await q;
      setLines((data as InvoiceLine[]) || []);
    })();
  }, [from, to, current]);

  const byItem = useMemo(() => {
    const map = new Map<string, { item: string; category: string; qty: number; spend: number; orders: number }>();
    for (const l of lines) {
      const key = l.display_name || l.item_name;
      const e = map.get(key) || { item: key, category: l.category || "Other", qty: 0, spend: 0, orders: 0 };
      e.qty += Number(l.unit_qty || 0) + Number(l.case_qty || 0);
      e.spend += Number(l.total || 0);
      e.orders += 1;
      map.set(key, e);
    }
    return Array.from(map.values()).sort((a, b) => b.spend - a.spend);
  }, [lines]);

  const byCat = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of lines) map.set(l.category || "Other", (map.get(l.category || "Other") || 0) + Number(l.total || 0));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [lines]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Item Tracker</h1>

      <div className="bg-white p-4 rounded-lg shadow flex gap-4 items-end">
        <label className="flex flex-col text-sm">From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded px-3 py-2" />
        </label>
        <label className="flex flex-col text-sm">To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border rounded px-3 py-2" />
        </label>
        <button
          onClick={() => downloadCSV(`items_${from}_${to}.csv`, byItem)}
          className="ml-auto px-4 py-2 bg-slate-900 text-white rounded text-sm"
        >📥 CSV</button>
      </div>

      <section>
        <h2 className="text-lg font-bold mb-2">Spend by Category</h2>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-100"><tr><th className="px-4 py-2 text-left">Category</th><th className="px-4 py-2 text-right">Spend</th></tr></thead>
            <tbody>
              {byCat.map(([c, s]) => (
                <tr key={c} className="border-t"><td className="px-4 py-2">{c}</td><td className="px-4 py-2 text-right">${s.toFixed(2)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold mb-2">Top Items by Spend</h2>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-4 py-2 text-left">Item</th>
                <th className="px-4 py-2 text-left">Category</th>
                <th className="px-4 py-2 text-right">Qty</th>
                <th className="px-4 py-2 text-right">Orders</th>
                <th className="px-4 py-2 text-right">Total Spend</th>
              </tr>
            </thead>
            <tbody>
              {byItem.slice(0, 50).map((r) => (
                <tr key={r.item} className="border-t">
                  <td className="px-4 py-2">{r.item}</td>
                  <td className="px-4 py-2">{r.category}</td>
                  <td className="px-4 py-2 text-right">{r.qty.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right">{r.orders}</td>
                  <td className="px-4 py-2 text-right">${r.spend.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
