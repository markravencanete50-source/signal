"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ReachEngagementPoint } from "@/services/analytics";

/**
 * Reach vs engagement chart — recharts, theme-aware.
 *
 * Every colour is a CSS variable (`var(--chart-1)`, `var(--border)`, …), which
 * SVG resolves at paint time — so the chart flips with the `.dark` class exactly
 * like the rest of the app, with no JS theme wiring. This is why recharts colours
 * aren't hardcoded hex anywhere here.
 */
export function ReachChart({ data }: { data: ReachEngagementPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <defs>
          <linearGradient id="reachFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.18} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => d.slice(5)}
          tick={{ fill: "var(--text-2)", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
          minTickGap={24}
        />
        <YAxis
          tick={{ fill: "var(--text-2)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
          width={40}
        />
        <Tooltip
          contentStyle={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            fontSize: 12,
            color: "var(--text-1)",
          }}
          labelStyle={{ color: "var(--text-2)" }}
          cursor={{ stroke: "var(--border)" }}
        />
        <Area
          type="monotone"
          dataKey="reach"
          stroke="var(--chart-1)"
          strokeWidth={2.5}
          fill="url(#reachFill)"
          name="Reach"
        />
        <Line
          type="monotone"
          dataKey="engagement"
          stroke="var(--chart-2)"
          strokeWidth={2.5}
          dot={false}
          name="Engagement"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
