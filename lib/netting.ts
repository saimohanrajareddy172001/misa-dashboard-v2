import type { InvoiceLine } from "./supabase";

/**
 * Net out returns/voids: identical item with opposite-sign quantities collapses
 * to the residual. E.g. "Chicken Thigh +1 case" + "Chicken Thigh -1 case" = 0.
 * Groups by item_name + purchase_unit, sums signed quantities and totals.
 */
export type NettedLine = InvoiceLine & { is_voided: boolean };

export function netLines(lines: InvoiceLine[]): NettedLine[] {
  const buckets = new Map<string, NettedLine>();
  for (const l of lines) {
    const key = `${l.item_name}::${l.purchase_unit ?? "each"}`;
    const signedQty =
      (l.purchase_unit === "case" ? l.case_qty : l.unit_qty) || 0;
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, { ...l, is_voided: false });
    } else {
      existing.unit_qty = (existing.unit_qty || 0) + (l.unit_qty || 0);
      existing.case_qty = (existing.case_qty || 0) + (l.case_qty || 0);
      existing.total = (existing.total || 0) + (l.total || 0);
    }
  }
  return Array.from(buckets.values()).map((l) => ({
    ...l,
    is_voided:
      Math.abs(l.unit_qty || 0) < 0.001 &&
      Math.abs(l.case_qty || 0) < 0.001 &&
      Math.abs(l.total || 0) < 0.01,
  }));
}
