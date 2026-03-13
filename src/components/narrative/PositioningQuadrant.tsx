"use client";

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Label,
} from "recharts";
import { PositioningPoint } from "@/types/api";
import { EmptyState } from "@/components/EmptyState";

interface PositioningQuadrantProps {
  points: PositioningPoint[];
}

function CustomDot(props: Record<string, unknown>) {
  const { cx, cy, payload } = props as {
    cx: number;
    cy: number;
    payload: PositioningPoint;
  };
  return (
    <g>
      <circle cx={cx} cy={cy} r={6} fill="var(--chart-1)" />
      <text
        x={cx}
        y={cy - 12}
        textAnchor="middle"
        fontSize={12}
        fontWeight={500}
        fill="var(--foreground)"
      >
        {payload.label}
      </text>
    </g>
  );
}

export function PositioningQuadrant({ points }: PositioningQuadrantProps) {
  if (points.length === 0) {
    return <EmptyState message="No positioning data available in this date range." />;
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          type="number"
          dataKey="legitimacy"
          domain={[0, 100]}
          fontSize={12}
        >
          <Label value="Legitimacy" position="insideBottom" offset={-10} fontSize={12} />
        </XAxis>
        <YAxis
          type="number"
          dataKey="controversy"
          domain={[0, 100]}
          fontSize={12}
        >
          <Label value="Controversy" angle={-90} position="insideLeft" offset={10} fontSize={12} />
        </YAxis>
        <ReferenceLine x={50} stroke="var(--border)" strokeDasharray="4 4" />
        <ReferenceLine y={50} stroke="var(--border)" strokeDasharray="4 4" />
        <Tooltip
          formatter={(value, name) => [
            `${value}`,
            name === "legitimacy" ? "Legitimacy" : "Controversy",
          ]}
          labelFormatter={() => ""}
        />
        <Scatter
          data={points}
          shape={<CustomDot />}
        />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
