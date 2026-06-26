import { DbNotice } from "@/components/db-notice";
import { LiveActivityFeed } from "@/components/live-activity-feed";
import { LiveDashboardStats } from "@/components/live-dashboard-stats";
import { getOpsSnapshot, getRevenueSnapshot } from "@/services/commerce/analytics";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  let snapshot;
  let revenue;
  try {
    [snapshot, revenue] = await Promise.all([
      getOpsSnapshot(),
      getRevenueSnapshot(),
    ]);
  } catch (err) {
    return <DbNotice error={err instanceof Error ? err.message : String(err)} />;
  }

  const { recent, ...stats } = snapshot;

  return (
    <div className="flex flex-col gap-6">
      <LiveDashboardStats initial={stats} initialRevenue={revenue} />
      <LiveActivityFeed initial={recent} />
    </div>
  );
}
