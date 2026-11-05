"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { category, severityMeta } from "@/lib/constants";

const AXIS = { stroke: "#929FB2", fontSize: 10 } as const;
const GRID = "rgba(255,255,255,0.06)";
const TOOLTIP = {
  contentStyle: {
    background: "#0b1320",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 10,
    fontSize: 11,
    color: "#F5F7FA",
  },
  labelStyle: { color: "#929FB2", fontSize: 10 },
} as const;

export function TrendChart({
  data,
}: {
  data: { month: string; submitted: number; verified: number; resolved: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="gSubmitted" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#36D9FF" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#36D9FF" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gVerified" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#43D6A0" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#43D6A0" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="month" {...AXIS} tickLine={false} axisLine={false} />
        <YAxis {...AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip {...TOOLTIP} />
        <Legend wrapperStyle={{ fontSize: 10, color: "#929FB2" }} />
        <Area
          type="monotone"
          dataKey="submitted"
          name="Submitted"
          stroke="#36D9FF"
          strokeWidth={1.8}
          fill="url(#gSubmitted)"
        />
        <Area
          type="monotone"
          dataKey="verified"
          name="Verified"
          stroke="#43D6A0"
          strokeWidth={1.8}
          fill="url(#gVerified)"
        />
        <Line type="monotone" dataKey="resolved" name="Resolved" stroke="#F5B94B" strokeWidth={1.6} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CategoryChart({
  data,
}: {
  data: { category_slug: string; total: number; verified: number; resolved: number }[];
}) {
  const rows = data.map((d) => ({
    name: category(d.category_slug).label,
    total: d.total,
    verified: d.verified,
    color: category(d.category_slug).color,
  }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 34)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
        <XAxis type="number" {...AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={112} {...AXIS} tickLine={false} axisLine={false} />
        <Tooltip {...TOOLTIP} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Bar dataKey="total" name="Submissions" radius={[0, 6, 6, 0]} barSize={11}>
          {rows.map((r) => (
            <Cell key={r.name} fill={r.color} fillOpacity={0.55} />
          ))}
        </Bar>
        <Bar dataKey="verified" name="Verified" radius={[0, 6, 6, 0]} barSize={11}>
          {rows.map((r) => (
            <Cell key={`v-${r.name}`} fill={r.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SeverityChart({ data }: { data: { severity: string; total: number; resolved: number }[] }) {
  const rows = data.map((d) => ({
    name: severityMeta(d.severity).label,
    value: d.total,
    color: severityMeta(d.severity).color,
  }));
  return (
    <ResponsiveContainer width="100%" height={230}>
      <PieChart>
        <Pie
          data={rows}
          dataKey="value"
          nameKey="name"
          innerRadius={52}
          outerRadius={82}
          paddingAngle={3}
          stroke="none"
        >
          {rows.map((r) => (
            <Cell key={r.name} fill={r.color} fillOpacity={0.85} />
          ))}
        </Pie>
        <Tooltip {...TOOLTIP} />
        <Legend wrapperStyle={{ fontSize: 10, color: "#929FB2" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function NeighborhoodChart({
  data,
}: {
  data: { neighborhood: string; total: number; verified: number; resolved: number; critical: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 30)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
        <XAxis type="number" {...AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="neighborhood" width={96} {...AXIS} tickLine={false} axisLine={false} />
        <Tooltip {...TOOLTIP} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Bar dataKey="total" name="Reports" fill="#36D9FF" fillOpacity={0.35} radius={[0, 5, 5, 0]} barSize={9} />
        <Bar dataKey="verified" name="Verified" fill="#43D6A0" fillOpacity={0.7} radius={[0, 5, 5, 0]} barSize={9} />
        <Bar dataKey="resolved" name="Resolved" fill="#F5B94B" radius={[0, 5, 5, 0]} barSize={9} />
      </BarChart>
    </ResponsiveContainer>
  );
}
