import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useSectorTimeseries } from "#/api/endpoints";
import { fmtTonnes, prettySector, sectorColor } from "#/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";

export function SectorTimeseries() {
  const { data, isLoading } = useSectorTimeseries();

  const { rows, sectors } = useMemo(() => {
    const items = data?.data ?? [];
    const sectorSet = Array.from(new Set(items.map((d) => d.sector))).sort();
    const byYear = new Map<number, Record<string, number>>();
    for (const it of items) {
      const row = byYear.get(it.year) ?? { year: it.year };
      // Negative values (land-use sinks) clamped to 0 for the stack.
      row[it.sector] = Math.max(0, it.emissions_quantity);
      byYear.set(it.year, row);
    }
    const rows = Array.from(byYear.values()).sort(
      (a, b) => (a.year as number) - (b.year as number),
    );
    return { rows, sectors: sectorSet };
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>CO₂ emissions by sector, 2015–2026 (tonnes/yr)</CardTitle>
      </CardHeader>
      <CardContent className="h-[420px]">
        {isLoading || rows.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Loading…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="year" />
              <YAxis tickFormatter={(v) => fmtTonnes(Number(v))} width={70} />
              <Tooltip
                formatter={(v: number, name: string) => [fmtTonnes(v), prettySector(name)]}
              />
              <Legend formatter={(v) => prettySector(String(v))} />
              {sectors.map((s) => (
                <Area
                  key={s}
                  type="monotone"
                  dataKey={s}
                  stackId="1"
                  stroke={sectorColor(s, sectors)}
                  fill={sectorColor(s, sectors)}
                  fillOpacity={0.7}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
