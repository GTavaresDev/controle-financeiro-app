"use client";
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, BarChart, Bar, PieChart, Pie, Cell, Legend } from "recharts";
import { brl } from "@/lib/utils";
const colors = ["#1b8970", "#84b8a9", "#d1a45c", "#8e9bba", "#df8a72", "#a4bc73"];
export function FinanceChart({ rows, series, kind = "area" }: { rows: Record<string, string | number | null>[]; series: { key: string; name: string }[]; kind?: "area" | "bar" }) {
  const Chart = kind === "bar" ? BarChart : AreaChart;
  return <div className="chart" role="img" aria-label={series.map(s => s.name).join(", ")}><ResponsiveContainer width="100%" height="100%"><Chart data={rows} margin={{ top: 12, right: 16, left: 4, bottom: 0 }}>
    <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="var(--line)" /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--muted)" }} minTickGap={32} />
    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--muted)" }} tickFormatter={v => Number(v) >= 1000 ? `${Number(v) / 1000} mil` : String(v)} width={55} />
    <Tooltip formatter={v => brl(Number(v))} contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, color: "var(--ink)" }} /><Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 16 }} />
    {series.map((s, i) => kind === "bar" ? <Bar key={s.key} dataKey={s.key} name={s.name} fill={colors[i % colors.length]} radius={[4, 4, 0, 0]} /> : <Area key={s.key} dataKey={s.key} name={s.name} type="monotone" stroke={colors[i % colors.length]} fill={colors[i % colors.length]} fillOpacity={0.08} strokeWidth={2.5} connectNulls={false} />)}
  </Chart></ResponsiveContainer></div>;
}
export function Distribution({ rows }: { rows: { name: string; value: number }[] }) {
  const activeRows = rows.filter(r => r.value > 0);
  return (
    <div className="distribution">
      <div className="donut" role="img" aria-label="Distribuição do orçamento">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={activeRows}
              dataKey="value"
              nameKey="name"
              innerRadius={46}
              outerRadius={68}
              paddingAngle={3}
              stroke="none"
            >
              {activeRows.map((r, i) => (
                <Cell key={r.name} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={v => brl(Number(v))}
              contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, color: "var(--ink)" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="legend-list">
        {rows.map((r, i) => (
          <div key={r.name}>
            <span>
              <i style={{ background: colors[i % colors.length] }} />
              {r.name}
            </span>
            <strong>{brl(r.value)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
