import { NextResponse } from "next/server";

import { getTransactionsAfter } from "@/services/commerce/analytics";

export const dynamic = "force-dynamic";

/** Incremental activity feed for the dashboard (poll with ?after=<lastTxId>). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const after = Math.max(0, Number(searchParams.get("after") ?? 0));
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? 25)));

  try {
    const items = await getTransactionsAfter(after, limit);
    const latestId =
      items.length > 0 ? Math.max(after, ...items.map((i) => i.id)) : after;
    return NextResponse.json({ items, latestId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
