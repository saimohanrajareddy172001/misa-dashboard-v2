import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
export const supabase = createClient(url, key);

export type InvoiceHeader = {
  id: string;
  restaurant_id: string;          // uuid
  file_id?: string | null;
  invoice_number: string;
  invoice_date: string | null;
  vendor: string | null;
  subtotal?: number;
  tax?: number;
  total: number;
  previous_balance?: number;
  credit_used?: number;
  amount_paid?: number | null;
  created_at: string;
};

export type InvoiceLine = {
  id: string;
  header_id: string;
  restaurant_id: string;
  invoice_date: string | null;
  item_name: string;
  display_name?: string;            // populated by actor; harmless if column absent
  category: string | null;
  unit_qty: number;
  case_qty: number;
  unit_price: number;
  purchase_unit?: "lb" | "each" | "case";
  total: number;
  // joined via invoice_headers when needed
  vendor?: string | null;
  invoice_number?: string;
};
