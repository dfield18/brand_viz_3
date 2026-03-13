"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import { MODEL_LABELS } from "@/lib/constants";

interface ModelBreakdownProps {
  model: string;
  overallMentionRate: number;
}

export function ModelBreakdown({ model, overallMentionRate }: ModelBreakdownProps) {
  const data = [
    {
      model: MODEL_LABELS[model] ?? model,
      mentionRate: overallMentionRate,
    },
  ];

  return (
    <ResponsiveContainer width="100%" height={80}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 40, bottom: 0, left: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          fontSize={12}
        />
        <YAxis
          type="category"
          dataKey="model"
          width={100}
          fontSize={12}
          tickLine={false}
        />
        <Tooltip
          formatter={(value) => [`${value}%`, "Mention Rate"]}
          cursor={{ fill: "var(--muted)", opacity: 0.3 }}
        />
        <Bar
          dataKey="mentionRate"
          fill="var(--chart-1)"
          radius={[0, 4, 4, 0]}
          barSize={28}
        >
          <LabelList
            dataKey="mentionRate"
            position="right"
            formatter={(v) => `${v}%`}
            fontSize={12}
            fill="var(--muted-foreground)"
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
