import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useSectorTimeseries } from "#/api/endpoints";
import { fmtTonnes, prettySector, sectorColor } from "#/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";

export function SectorBreakdown() {
  const { data } = useSectorTimeseries();
  const [year, setYear] = useState<number>(2023);

  const { years, sectors, slices, total } = useMemo(() => {
    const items = data?.data ?? [];
    const years = Array.from(new Set(items.map((d) => d.year))).sort(
      (a, b) => a - b,
    );
    const sectors = Array.from(new Set(items.map((d) => d.sector))).sort();
    const slices = items
      .filter((d) => d.year === year && d.emissions_quantity > 0)
      .map((d) => ({ name: d.sector, value: d.emissions_quantity }))
      .sort((a, b) => b.value - a.value);
    const total = slices.reduce((s, x) => s + x.value, 0);
    return { years, sectors, slices, total };
  }, [data, year]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Sector share</CardTitle>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="h-[380px]">
        {slices.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Loading…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="name"
                innerRadius={70}
                outerRadius={130}
                paddingAngle={1}
                label={(e: { name?: string }) => prettySector(String(e.name ?? ""))}
              >
                {slices.map((s) => (
                  <Cell key={s.name} fill={sectorColor(s.name, sectors)} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number, name: string) => [
                  `${fmtTonnes(v)} (${((v / total) * 100).toFixed(1)}%)`,
                  prettySector(name),
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
        <p className="text-center text-sm text-muted-foreground">
          National total {year}: <strong>{fmtTonnes(total)}</strong>
        </p>
      </CardContent>
    </Card>
  );
}
