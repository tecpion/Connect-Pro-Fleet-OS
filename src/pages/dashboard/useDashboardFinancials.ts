// Connect Pro Fleet — dashboard financial metrics hook (Build #10).
// Extracted from Dashboard.tsx to keep it under the line limit. Uses the shared
// period-aware selectors so the dashboard never computes financial truth
// independently. Labels distinguish collected (money received) from billed
// revenue (charges generated).

import { useMemo, useState } from "react";
import type { FinancialTransaction, MaintenanceRecord } from "@/lib/types";
import {
  getCollectionsForRange,
  getOutstandingForRange,
  getRentalRevenueForRange,
  getNetContributionForRange,
  startOfWeek,
  startOfMonth,
} from "@/lib/financialSelectors";
import {
  collectionsSeries,
  collectionsSeriesForInterval,
  type CollectionsInterval,
} from "@/lib/dashboard";

export function useDashboardFinancials(
  transactions: FinancialTransaction[],
  maintenance: MaintenanceRecord[],
) {
  const now = new Date();
  const weekStart = startOfWeek(now);
  const monthStart = startOfMonth(now);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const collectedWeek = useMemo(
    () => getCollectionsForRange(transactions, weekStart, now),
    [transactions, weekStart, now],
  );
  const outstanding = useMemo(
    () => getOutstandingForRange(transactions),
    [transactions],
  );
  const revenueMonth = useMemo(
    () => getRentalRevenueForRange(transactions, monthStart, monthEnd),
    [transactions, monthStart, monthEnd],
  );
  const net = useMemo(
    () =>
      getNetContributionForRange(
        transactions,
        maintenance,
        monthStart,
        monthEnd,
      ),
    [transactions, maintenance, monthStart, monthEnd],
  );
  // 7-day collections sparkline values for the Payments Due KPI micro-trend.
  const chart7d = useMemo(
    () => collectionsSeries(transactions, 7).map((d) => d.amount),
    [transactions],
  );

  // Dynamic chart interval selector (Today / This Week / This Month).
  const [chartInterval, setChartInterval] =
    useState<CollectionsInterval>("week");
  const chartData = useMemo(
    () => collectionsSeriesForInterval(transactions, chartInterval),
    [transactions, chartInterval],
  );
  return {
    collectedWeek,
    outstanding,
    revenueMonth,
    net,
    chart7d,
    chartInterval,
    setChartInterval,
    chartData,
  };
}
