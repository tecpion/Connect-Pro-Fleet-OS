// Connect Pro Fleet — profitability charts (Build #16).
// Revenue vs expenses, operating profit trend, expense breakdown, tender mix.

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import { fmtMoney, fmtDateShort } from "@/lib/format";
import type { TenderMixEntry } from "@/lib/collectionSelectors";

const tooltipStyle = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--surface))",
};

/** Revenue vs expenses over time (daily buckets). */
export function RevenueExpenseChart({
  data,
}: {
  data: { date: string; revenue: number; expenses: number }[];
}) {
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="hsl(var(--primary))"
                stopOpacity={0.35}
              />
              <stop
                offset="100%"
                stopColor="hsl(var(--primary))"
                stopOpacity={0.02}
              />
            </linearGradient>
            <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="hsl(var(--maintenance))"
                stopOpacity={0.3}
              />
              <stop
                offset="100%"
                stopColor="hsl(var(--maintenance))"
                stopOpacity={0.02}
              />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={(d) => fmtDateShort(String(d))}
            interval="preserveStartEnd"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={(v) =>
              `$${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`
            }
            tickLine={false}
            axisLine={false}
            width={36}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(d) => fmtDateShort(String(d))}
            formatter={(v: number, n: string) => [
              fmtMoney(v),
              n === "revenue" ? "Revenue" : "Expenses",
            ]}
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            fill="url(#revGrad)"
          />
          <Area
            type="monotone"
            dataKey="expenses"
            stroke="hsl(var(--maintenance))"
            strokeWidth={2}
            fill="url(#expGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Operating profit over time (daily buckets). */
export function ProfitTrendChart({
  data,
}: {
  data: { date: string; profit: number }[];
}) {
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="hsl(var(--available))"
                stopOpacity={0.35}
              />
              <stop
                offset="100%"
                stopColor="hsl(var(--available))"
                stopOpacity={0.02}
              />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={(d) => fmtDateShort(String(d))}
            interval="preserveStartEnd"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={(v) =>
              `$${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`
            }
            tickLine={false}
            axisLine={false}
            width={36}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(d) => fmtDateShort(String(d))}
            formatter={(v: number) => [fmtMoney(v), "Operating profit"]}
          />
          <Area
            type="monotone"
            dataKey="profit"
            stroke="hsl(var(--available))"
            strokeWidth={2}
            fill="url(#profitGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Expense category breakdown (horizontal bars). */
export function ExpenseBreakdownChart({
  data,
}: {
  data: { category: string; amount: number }[];
}) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
        >
          <XAxis
            type="number"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={(v) =>
              `$${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`
            }
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="category"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            width={110}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v: number) => [fmtMoney(v), "Amount"]}
          />
          <Bar dataKey="amount" radius={[0, 3, 3, 0]}>
            {data.map((_, i) => (
              <Cell
                key={i}
                fill="hsl(var(--primary))"
                fillOpacity={0.7 - i * 0.08}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Collection tender-method mix (donut via stacked bars). */
export function TenderMixChart({ data }: { data: TenderMixEntry[] }) {
  const colors = [
    "hsl(var(--primary))",
    "hsl(var(--available))",
    "hsl(var(--maintenance))",
    "hsl(var(--out))",
    "#8b5cf6",
    "#ec4899",
    "#14b8a6",
    "#f97316",
    "#6366f1",
    "#84cc16",
    "#06b6d4",
  ];
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
            interval={0}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={(v) =>
              `$${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`
            }
            tickLine={false}
            axisLine={false}
            width={36}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(
              v: number,
              _n: string,
              p: { payload?: TenderMixEntry },
            ) => [fmtMoney(v), `${p.payload?.percent.toFixed(0)}%`]}
          />
          <Bar dataKey="total" radius={[3, 3, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
