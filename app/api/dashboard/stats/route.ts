import { NextResponse } from "next/server";

import { getDashboardStats } from "@/services/commerce/analytics";

export const dynamic = "force-dynamic";

/** KPI + decision mix + revenue rollup for the dashboard (poll ~30s). */
export async function GET() {
  try {
    return NextResponse.json(await getDashboardStats());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
