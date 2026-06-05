import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTopOwners } from "#/api/endpoints";
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

export function TopOwners() {
  const [year, setYear] = useState(2023);
  const { data, isLoading } = useTopOwners({ year, limit: 15 });
  const rows = data?.data ?? [];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Top owners by CO₂</CardTitle>
          <p className="text-sm text-muted-foreground">
            Each facility's emissions credited to its controlling parent company
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
              <YAxis
                type="category"
                dataKey="owner"
                width={240}
                tick={{ fontSize: 12 }}
                interval={0}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                formatter={(value, _name, item) => [
                  `${fmtTonnes(Number(value))} · ${
                    (item?.payload as { source_count?: number })?.source_count ?? 0
                  } facilities`,
                  "CO₂",
                ]}
              />
              <Bar dataKey="emissions_quantity" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
