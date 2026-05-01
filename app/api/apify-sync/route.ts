import { NextRequest, NextResponse } from "next/server";

/**
 * Trigger an Apify actor run on demand from the dashboard.
 * The actor itself reads the `restaurants` table from Supabase to know
 * which credentials to use — so this just kicks off a run.
 *
 * Env vars required:
 *   APIFY_TOKEN     — your Apify API token (Apify console → Account → Integrations)
 *   APIFY_ACTOR_ID  — the actor identifier, e.g. "username/restaurant-depot-receipts"
 *                     (or the build ID — Apify accepts both)
 */
export async function POST(req: NextRequest) {
  const apifyToken = process.env.APIFY_TOKEN;
  const actorId = process.env.APIFY_ACTOR_ID;

  if (!apifyToken)
    return NextResponse.json(
      { error: "APIFY_TOKEN not set in environment" },
      { status: 500 }
    );
  if (!actorId)
    return NextResponse.json(
      { error: "APIFY_ACTOR_ID not set in environment" },
      { status: 500 }
    );

  // Optional: pass through actor input from the request body if provided.
  // Otherwise the actor will use its default input (configured in Apify console).
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // no body, that's fine
  }

  const url = `https://api.apify.com/v2/acts/${actorId}/runs?token=${apifyToken}`;

  // Pass env-based input so actor doesn't need default input configured in console
  const input = {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    // Spread any override from request body (e.g. dateRange)
    ...body,
  }

  const apifyResp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!apifyResp.ok) {
    const err = await apifyResp.text();
    return NextResponse.json(
      { error: `Apify API error: ${err}` },
      { status: apifyResp.status }
    );
  }

  const result = await apifyResp.json();
  return NextResponse.json({
    run_id: result.data?.id,
    status: result.data?.status,
    started_at: result.data?.startedAt,
    detail_url: `https://console.apify.com/actors/${actorId}/runs/${result.data?.id}`,
  });
}
