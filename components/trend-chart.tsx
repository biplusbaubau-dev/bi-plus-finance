"use client";
import { useState, useEffect, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, Dot,
} from "recharts";
import { rupiah } from "@/lib/format";

type Point = {
  key: string; label: string;
  income: number; profit: number; balance: number;
  sales: number; units: number;
};

type Granularity = "daily" | "weekly" | "monthly";

const metricsList = [
  { key: "income", label: "Income", color: "#16a34a" },
  { key: "profit", label: "Profit", color: "#2563eb" },
  { key: "balance", label: "Saldo", color: "#18181b" },
] as const;

// Chart responsif: ukur lebar container, min 560px (scroll horizontal di HP)
function ChartBox({ data, hidden, height }: { data: Point[]; hidden: Set<string>; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(700);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.max(560, el.clientWidth));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const DotCustom = (props: any) => {
    const { cx, cy, dataKey } = props;
    const metric = metricsList.find((m) => m.key === dataKey);
    if (!metric || hidden.has(dataKey) || cx == null || cy == null) return null;
    return <Dot cx={cx} cy={cy} r={4} fill={metric.color} stroke="white" strokeWidth={2} />;
  };
  return (
    <div ref={ref} style={{ width: "100%", height }}>
      <LineChart data={data} width={width} height={height} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis
          tickFormatter={(v) => v >= 1e6 ? `${(v / 1e6).toFixed(0)}jt` : `${(v / 1e3).toFixed(0)}k`}
          tick={{ fontSize: 11 }}
          width={45}
        />
        <Tooltip
          formatter={(value: number) => rupiah(value)}
          labelStyle={{ fontWeight: "bold", marginBottom: 4 }}
          contentStyle={{ borderRadius: 12, border: "1px solid #e4e4e7", fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {metricsList.filter((m) => !hidden.has(m.key)).map((m) => (
          <Line
            key={m.key}
            type="monotone"
            dataKey={m.key}
            name={m.label}
            stroke={m.color}
            strokeWidth={2.5}
            dot={<DotCustom />}
            activeDot={{ r: 6, strokeWidth: 2 }}
          />
        ))}
      </LineChart>
    </div>
  );
}

export function TrendChart({
  initialData,
  initialGranularity = "monthly",
}: {
  initialData: Point[];
  initialGranularity?: Granularity;
}) {
  const [data, setData] = useState<Point[]>(initialData);
  const [granularity, setGranularity] = useState<Granularity>(initialGranularity);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  const toggleMetric = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Controls — wrap di HP */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {(["daily", "weekly", "monthly"] as Granularity[]).map((g) => (
          <button
            key={g}
            onClick={() => setGranularity(g)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              granularity === g
                ? "bg-zinc-900 text-white"
                : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
            }`}
          >
            {g === "daily" ? "Harian" : g === "weekly" ? "Mingguan" : "Bulanan"}
          </button>
        ))}

        <div className="h-4 w-px bg-zinc-200" />

        {metricsList.map((m) => (
          <button
            key={m.key}
            onClick={() => toggleMetric(m.key)}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition ${
              !hidden.has(m.key)
                ? "bg-zinc-50 ring-1 ring-zinc-200"
                : "text-zinc-400 line-through decoration-zinc-300"
            }`}
          >
            <span
              className="h-2.5 w-2.5 rounded-full ring-2 ring-white"
              style={{ background: !hidden.has(m.key) ? m.color : "#d4d4d8" }}
            />
            {m.label}
          </button>
        ))}
      </div>

      {/* Line Chart — scroll horizontal di HP, tinggi adaptif */}
      {data.length === 0 ? (
        <div className="flex h-64 items-center justify-center rounded-xl bg-zinc-50 text-sm text-zinc-400">
          Tidak ada data
        </div>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="min-w-[560px] sm:min-w-0" style={{ width: "100%", height: 260 }}>
            <ChartBox data={data} hidden={hidden} height={260} />
          </div>
        </div>
      )}

      {/* Table */}
      {data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-zinc-500">
                <th className="py-2">Periode</th>
                <th className="text-right">Unit</th>
                <th className="text-right">Sales</th>
                <th className="text-right">Profit</th>
                <th className="text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.key} className="border-b border-zinc-50 hover:bg-zinc-50/50">
                  <td className="py-2 font-medium">{row.label}</td>
                  <td className="text-right">{row.units}</td>
                  <td className="text-right text-emerald-700">{rupiah(row.sales)}</td>
                  <td className={`text-right ${row.profit < 0 ? "text-red-600" : "text-blue-700"}`}>
                    {rupiah(row.profit)}
                  </td>
                  <td className={`text-right font-semibold ${row.balance < 0 ? "text-red-600" : ""}`}>
                    {rupiah(row.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
