import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useQueries } from "@tanstack/react-query";
import { getOwnerTrendQueryOptions, useTopOwners } from "#/api/endpoints";
import { fmtTonnes } from "#/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";

const YEARS = Array.from({ length: 12 }, (_, i) => 2015 + i);
const LINE_COLORS = ["#6366f1", "#ef4444", "#16a34a", "#f97316", "#0891b2"];
const MAX_COMPARE = 5;
const PARTIAL_YEAR = 2026; // incomplete — excluded from trend so it isn't read as a "drop"

export function TopOwners() {
  const [year, setYear] = useState(2023);
  const { data, isLoading } = useTopOwners({ year, limit: 15 });
  const rows = data?.data?.data ?? [];

  // Owners chosen for the trend comparison; default to the top 3 once, then
  // the user toggles via the bars.
  const [selected, setSelected] = useState<string[]>([]);
  const initialized = useRef(false);
  useEffect(() => {
    if (!initialized.current && rows.length > 0) {
      initialized.current = true;
      setSelected(rows.slice(0, 3).map((r) => r.owner));
    }
  }, [rows]);

  function toggle(owner: string) {
    setSelected((prev) =>
      prev.includes(owner)
        ? prev.filter((o) => o !== owner)
        : prev.length >= MAX_COMPARE
          ? prev
          : [...prev, owner],
    );
  }

  const trendQueries = useQueries({
    queries: selected.map((o) => getOwnerTrendQueryOptions(o)),
  });

  const { chartData, series } = useMemo(() => {
    const byYear = new Map<number, Record<string, number>>();
    const series: { owner: string; color: string; change: number | null }[] = [];
    trendQueries.forEach((q, i) => {
      const owner = selected[i];
      if (!owner) return;
      const points = (q.data?.data?.data ?? []).filter((p) => p.year !== PARTIAL_YEAR);
      const color = LINE_COLORS[i % LINE_COLORS.length];
      let change: number | null = null;
      if (points.length >= 2) {
        const first = points[0].emissions_quantity;
        const last = points[points.length - 1].emissions_quantity;
        change = first > 0 ? (last - first) / first : null;
      }
      series.push({ owner, color, change });
      for (const p of points) {
        const row = byYear.get(p.year) ?? { year: p.year };
        row[owner] = p.emissions_quantity;
        byYear.set(p.year, row);
      }
    });
    const chartData = Array.from(byYear.values()).sort((a, b) => a.year - b.year);
    return { chartData, series };
  }, [trendQueries, selected]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Top owners by CO₂</CardTitle>
            <p className="text-sm text-muted-foreground">
              Click a company to add it to the trend below (up to {MAX_COMPARE})
            </p>
          </div>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="h-[560px]">
          {isLoading || rows.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              {isLoading ? "Loading…" : "No ownership data for this year"}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={rows}
                layout="vertical"
                margin={{ top: 8, right: 24, bottom: 8, left: 16 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted" />
                <XAxis type="number" tickFormatter={(v) => fmtTonnes(Number(v))} />
                <YAxis type="category" dataKey="owner" width={240} tick={{ fontSize: 12 }} interval={0} />
                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                  formatter={(value, _name, item) => [
                    `${fmtTonnes(Number(value))} · ${
                      (item?.payload as { source_count?: number })?.source_count ?? 0
                    } facilities`,
                    "CO₂",
                  ]}
                />
                <Bar
                  dataKey="emissions_quantity"
                  radius={[0, 4, 4, 0]}
                  className="cursor-pointer"
                  onClick={(d: { owner?: string }) => d?.owner && toggle(d.owner)}
                >
                  {rows.map((r) => (
                    <Cell
                      key={r.owner}
                      fill={selected.includes(r.owner) ? "#4f46e5" : "#c7d2fe"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Emissions over time</CardTitle>
          <p className="text-sm text-muted-foreground">
            Selected companies, by year (2026 excluded — partial). Green = net
            reduction from first to last full year.
          </p>
        </CardHeader>
        <CardContent className="h-[400px]">
          {series.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              Select a company above to see its trend
            </div>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
                {series.map((s) => (
                  <button
                    key={s.owner}
                    onClick={() => toggle(s.owner)}
                    className="flex items-center gap-1.5 text-sm"
                    title="Remove from comparison"
                  >
                    <span className="h-3 w-3 rounded-full" style={{ background: s.color }} />
                    <span>{s.owner}</span>
                    {s.change != null && (
                      <span className={s.change < 0 ? "text-green-600" : "text-red-600"}>
                        {s.change > 0 ? "+" : ""}
                        {(s.change * 100).toFixed(0)}%
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <ResponsiveContainer width="100%" height="90%">
                <LineChart data={chartData} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="year" allowDecimals={false} />
                  <YAxis tickFormatter={(v) => fmtTonnes(Number(v))} width={70} />
                  <Tooltip formatter={(v: number, name) => [fmtTonnes(Number(v)), String(name)]} />
                  {series.map((s) => (
                    <Line
                      key={s.owner}
                      type="monotone"
                      dataKey={s.owner}
                      stroke={s.color}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
