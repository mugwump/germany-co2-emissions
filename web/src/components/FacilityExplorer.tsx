import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  useListSectors,
  useSectorSubsectors,
  useSourceOwnership,
  useSubsectorSources,
  useTopSources,
} from "#/api/endpoints";
import { fmtTonnes, prettySector } from "#/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table";
import { Badge } from "#/components/ui/badge";

// Leaflet touches `window` at import time, so it must never be loaded during
// SSR. Lazy + client-gated import keeps it out of the server bundle entirely.
const FacilityMap = lazy(() =>
  import("#/components/FacilityMap").then((m) => ({ default: m.FacilityMap })),
);

const YEARS = Array.from({ length: 12 }, (_, i) => 2015 + i);

function Picker({
  label,
  value,
  options,
  onChange,
  render = (v) => v,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  render?: (v: string) => string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-56">
          <SelectValue placeholder={`Select ${label}`} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {render(o)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function FacilityExplorer() {
  const [sector, setSector] = useState("power");
  const [subsector, setSubsector] = useState("electricity-generation");
  const [year, setYear] = useState(2023);
  const [selected, setSelected] = useState<number | null>(null);
  const [client, setClient] = useState(false);
  useEffect(() => setClient(true), []);

  const sectorsQ = useListSectors();
  const sectors = sectorsQ.data?.sectors ?? [];

  const subsectorsQ = useSectorSubsectors(sector, {
    query: { enabled: !!sector },
  });
  const subsectors = useMemo(
    () =>
      Array.from(
        new Set((subsectorsQ.data?.data ?? []).map((d) => d.subsector)),
    ).sort(),
    [subsectorsQ.data],
  );

  const topQ = useTopSources(subsector, { year }, { query: { enabled: !!subsector } });
  const sourcesQ = useSubsectorSources(subsector, { year }, { query: { enabled: !!subsector } });
  const ownershipQ = useSourceOwnership(subsector, selected ?? 0, {
    query: { enabled: selected != null },
  });

  const top = topQ.data?.data ?? [];
  const points = sourcesQ.data?.data ?? [];

  function onSectorChange(s: string) {
    setSector(s);
    setSubsector(""); // force re-pick within the new sector
    setSelected(null);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <Picker label="Sector" value={sector} options={sectors} onChange={onSectorChange} render={prettySector} />
          <Picker label="Subsector" value={subsector} options={subsectors} onChange={(v) => { setSubsector(v); setSelected(null); }} render={prettySector} />
          <Picker label="Year" value={String(year)} options={YEARS.map(String)} onChange={(v) => setYear(Number(v))} />
          <div className="ml-auto text-sm text-muted-foreground">
            {points.length} facilities · {fmtTonnes(points.reduce((s, p) => s + p.emissions_quantity, 0))} total
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Facility map</CardTitle>
          </CardHeader>
          <CardContent className="h-[480px]">
            {client ? (
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    Loading map…
                  </div>
                }
              >
                <FacilityMap points={points} onSelect={setSelected} />
              </Suspense>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                Loading map…
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top emitters — {prettySector(subsector || "—")} {year}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[480px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Facility</TableHead>
                    <TableHead className="text-right">CO₂</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {top.map((s) => (
                    <TableRow
                      key={s.source_id}
                      onClick={() => setSelected(s.source_id)}
                      className={`cursor-pointer ${selected === s.source_id ? "bg-muted" : ""}`}
                    >
                      <TableCell>{s.rank}</TableCell>
                      <TableCell>{s.source_name ?? "Unknown"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtTonnes(s.emissions_quantity)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {top.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        {topQ.isLoading ? "Loading…" : "No data for this selection"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {selected != null && (
        <Card>
          <CardHeader>
            <CardTitle>
              Ownership — {top.find((t) => t.source_id === selected)?.source_name ?? `Source ${selected}`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ownershipQ.isLoading ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : (ownershipQ.data?.data ?? []).length === 0 ? (
              <p className="text-muted-foreground">No ownership records.</p>
            ) : (
              <div className="space-y-3">
                {(ownershipQ.data?.data ?? []).map((o, i) => (
                  <div key={i} className="rounded-md border p-3">
                    <div className="flex items-center gap-2">
                      <strong>{o.parent_name ?? "Unknown"}</strong>
                      {o.parent_entity_type && <Badge variant="secondary">{o.parent_entity_type}</Badge>}
                      {o.overall_share_percent != null && (
                        <Badge>{o.overall_share_percent}%</Badge>
                      )}
                    </div>
                    {o.ownership_path && (
                      <p className="mt-1 text-xs text-muted-foreground break-words">{o.ownership_path}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
