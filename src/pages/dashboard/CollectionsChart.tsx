import { Link } from "@/lib/router-compat";
import { BarChart3, ArrowRight } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import type { CollectionPoint, CollectionsInterval } from "@/lib/dashboard";

import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const INTERVALS: { key: CollectionsInterval; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
];

export function CollectionsChart({
  data,
  interval,
  onInterval,
}: {
  data: CollectionPoint[];
  interval: CollectionsInterval;
  onInterval: (i: CollectionsInterval) => void;
}) {
  const hasData = data.some((d) => d.amount > 0);
  const total = data.reduce((s, d) => s + d.amount, 0);
  const rangeLabel =
    interval === "today"
      ? "today"
      : interval === "week"
        ? "this week"
        : "this month";
  return (
    <div className="lg:col-span-3">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Collections</p>
          <p className="text-[13px] text-muted-foreground">
            {fmtMoney(total)} {rangeLabel}
          </p>
        </div>
        <div className="seg-control">
          {INTERVALS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onInterval(key)}
              data-active={interval === key}
              className="seg-control-item"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {hasData ? (
        <div className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 12, right: 12, left: -10, bottom: 0 }}
            >
              <defs>
                <linearGradient id="dashColl" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="hsl(var(--kpi-teal))"
                    stopOpacity={0.4}
                  />
                  <stop
                    offset="80%"
                    stopColor="hsl(var(--kpi-teal))"
                    stopOpacity={0.03}
                  />
                  <stop
                    offset="100%"
                    stopColor="hsl(var(--kpi-teal))"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                interval="preserveStartEnd"
                tickLine={false}
                axisLine={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(v) =>
                  `$${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`
                }
                tickLine={false}
                axisLine={false}
                width={36}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 10,
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--surface))",
                  boxShadow: "0 8px 24px -8px hsl(213 30% 20% / 0.18)",
                }}
                formatter={(v: number) => [fmtMoney(v), "Collected"]}
              />
              <Area
                type="monotone"
                dataKey="amount"
                stroke="hsl(var(--kpi-teal))"
                strokeWidth={2.5}
                fill="url(#dashColl)"
                dot={false}
                activeDot={{
                  r: 5,
                  fill: "hsl(var(--kpi-teal))",
                  stroke: "hsl(var(--surface))",
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="dot-grid flex h-52 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface-2/30 text-center">
          <div className="empty-disc mb-3" data-tone="teal">
            <BarChart3 className="h-6 w-6" />
          </div>
          <p className="text-sm font-semibold text-foreground">
            No collections {rangeLabel}
          </p>
          <p className="mt-1 max-w-xs text-[13px] text-muted-foreground">
            Recorded card, cash, and wire payments will trace a revenue curve
            here.
          </p>
          <Link
            to="/rental-management?tab=active&filter=payment_due"
            className="mt-3.5 inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:text-primary-press"
          >
            View Collections <ArrowRight size={14} />
          </Link>
        </div>
      )}
    </div>
  );
}
