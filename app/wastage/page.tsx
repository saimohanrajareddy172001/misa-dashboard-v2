"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRestaurant } from "@/lib/restaurant";

type CategoryRow = {
  category: string;
  purchased: number;
  sold: number | null;
};

function localDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function WastagePage() {
  const { current } = useRestaurant();
  const [range, setRange] = useState<"weekly" | "monthly">("monthly");
  const [data, setData] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cloverConnected, setCloverConnected] = useState(false);

  useEffect(() => {
    if (!current) return;
    (async () => {
      setLoading(true);
      const now = new Date();
      let start: string, end: string;
      if (range === "weekly") {
        const s = new Date(now);
        s.setDate(now.getDate() - 7);
        start = localDate(s);
        end = localDate(now);
      } else {
        start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        end = localDate(now);
      }

      const [linesRes, salesRes] = await Promise.all([
        supabase
          .from("invoice_lines")
          .select("category, total")
          .eq("restaurant_id", current.id)
          .gte("invoice_date", start)
          .lte("invoice_date", end)
          .gt("total", 0),
        supabase
          .from("pos_sales")
          .select("category, revenue")
          .eq("restaurant_id", current.id)
          .gte("sale_date", start)
          .lte("sale_date", end),
      ]);

      const hasSales =
        !salesRes.error && salesRes.data && salesRes.data.length > 0;
      setCloverConnected(hasSales);

      const purchaseMap: Record<string, number> = {};
      for (const l of (linesRes.data as any[]) || []) {
        const cat = l.category || "Other";
        purchaseMap[cat] = (purchaseMap[cat] || 0) + (Number(l.total) || 0);
      }
      const salesMap: Record<string, number> = {};
      for (const s of (salesRes.data as any[]) || []) {
        const cat = s.category || "Other";
        salesMap[cat] = (salesMap[cat] || 0) + (Number(s.revenue) || 0);
      }

      const cats = [
        ...new Set([...Object.keys(purchaseMap), ...Object.keys(salesMap)]),
      ];
      const rows: CategoryRow[] = cats
        .map((cat) => ({
          category: cat,
          purchased: purchaseMap[cat] || 0,
          sold: hasSales ? salesMap[cat] || 0 : null,
        }))
        .sort((a, b) => b.purchased - a.purchased);

      setData(rows);
      setLoading(false);
    })();
  }, [current, range]);

  const totalPurchased = data.reduce((s, r) => s + r.purchased, 0);
  const totalSold = cloverConnected
    ? data.reduce((s, r) => s + (r.sold || 0), 0)
    : null;
  const wasteEstimate =
    totalSold !== null ? totalPurchased - totalSold : null;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">Wastage Tracker</h1>
          <p className="text-sm text-slate-600 mt-1">
            Compare what you purchased vs what you sold (via POS).
          </p>
        </div>
        <div className="flex gap-2">
          {(["weekly", "monthly"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize ${
                range === r
                  ? "bg-slate-900 text-white"
                  : "bg-white border hover:bg-slate-50"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {!cloverConnected && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <span className="text-2xl">🔗</span>
          <div className="flex-1">
            <div className="font-semibold text-amber-900">
              Connect Clover POS to unlock full wastage tracking
            </div>
            <p className="text-sm text-amber-800 mt-1">
              Once connected you&apos;ll see purchased vs sold side by side per
              category, and waste % per item.
            </p>
            <Link
              href="/settings"
              className="inline-block mt-3 px-4 py-2 bg-amber-600 text-white rounded text-sm hover:bg-amber-700"
            >
              Go to Settings → Connect Clover
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Stat
          label="Total Purchased"
          value={`$${totalPurchased.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
        />
        <Stat
          label="Total Revenue (COGS)"
          value={
            totalSold !== null
              ? `$${totalSold.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
              : "—"
          }
        />
        <Stat
          label="Estimated Waste"
          value={
            wasteEstimate !== null
              ? `$${wasteEstimate.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
              : "—"
          }
          highlight={wasteEstimate !== null && wasteEstimate > 0}
        />
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="bg-slate-100 px-4 py-2 text-sm font-bold">
          Category Breakdown
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2 text-right">Purchased</th>
              {cloverConnected && (
                <>
                  <th className="px-4 py-2 text-right">Sold (COGS)</th>
                  <th className="px-4 py-2 text-right">Waste $</th>
                  <th className="px-4 py-2 text-right">Waste %</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={cloverConnected ? 5 : 2} className="text-center py-6 text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={cloverConnected ? 5 : 2} className="text-center py-6 text-slate-500">
                  No data for this period.
                </td>
              </tr>
            ) : (
              data.map((row) => {
                const waste = row.sold !== null ? row.purchased - row.sold : null;
                const wastePct =
                  waste !== null && row.purchased > 0
                    ? (waste / row.purchased) * 100
                    : null;
                return (
                  <tr key={row.category} className="border-t hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium">{row.category}</td>
                    <td className="px-4 py-2 text-right">
                      ${row.purchased.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    {cloverConnected && (
                      <>
                        <td className="px-4 py-2 text-right text-green-700">
                          ${(row.sold || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </td>
                        <td
                          className={`px-4 py-2 text-right font-semibold ${
                            waste && waste > 0 ? "text-red-600" : "text-green-600"
                          }`}
                        >
                          {waste !== null
                            ? `$${waste.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                            : "—"}
                        </td>
                        <td
                          className={`px-4 py-2 text-right ${
                            wastePct && wastePct > 20
                              ? "text-red-600 font-semibold"
                              : "text-slate-600"
                          }`}
                        >
                          {wastePct !== null ? `${wastePct.toFixed(1)}%` : "—"}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: any;
  highlight?: boolean;
}) {
  return (
    <div
      className={`p-4 rounded-lg shadow ${highlight ? "bg-red-50 border border-red-200" : "bg-white"}`}
    >
      <div className="text-sm text-slate-500">{label}</div>
      <div
        className={`text-2xl font-bold mt-1 ${highlight ? "text-red-700" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
