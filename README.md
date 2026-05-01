# Invoice Dashboard

Next.js dashboard for the WAT invoice-processing pipeline. Reads `invoice_headers`
and `invoice_lines` from Supabase and shows:

- **Dashboard** (`/`) — list of receipts, date range + vendor filter, stats, CSV/PDF export
- **Receipt Detail** (`/receipts/[id]`) — line items with returns/voids automatically netted
- **Items** (`/items`) — top items by spend, spend by category, date filter
- **Prices** (`/prices`) — $/lb, $/each, $/case variance over time (cost/wastage signal)
- **Manual Upload** (`/upload`) — CSV template for written-receipt stores (Indian groceries etc.)

## Setup

```bash
cd dashboard
npm install
cp .env.local.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_ANON_KEY (Supabase → Settings → API → anon public key)
npm run dev
```

Open http://localhost:3000.

## Environment

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key (RLS enforced) |
| `NEXT_PUBLIC_RESTAURANT_ID` | Which restaurant's data to show |

## Returns / Voids netting

Some vendors record voids as a positive line + a negative line (e.g. Chicken Thigh
+1 case and -1 case). [`lib/netting.ts`](lib/netting.ts) groups by
`item_name + purchase_unit` and sums signed quantities. Net-zero rows are flagged
`VOIDED` and hidden by default.

## What's not in here yet

- Auth / login UI (RLS policies are in place; Supabase auth UI is the next step)
- Real-time sync from POS (price tracker assumes invoice line data only for now)
- Payment / SaaS billing (Stripe customer ID column already in `clients`)
