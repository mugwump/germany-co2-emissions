import { useEffect, useState } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { fmtTonnes } from "#/lib/format";

export interface MapPoint {
  source_id: number;
  source_name: string | null;
  lat: number | null;
  lon: number | null;
  emissions_quantity: number;
}

export function FacilityMap({
  points,
  onSelect,
}: {
  points: MapPoint[];
  onSelect?: (sourceId: number) => void;
}) {
  // Leaflet touches window/document — render on the client only.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const valid = points.filter(
    (p) => p.lat != null && p.lon != null && p.emissions_quantity > 0,
  );
  const max = valid.reduce((m, p) => Math.max(m, p.emissions_quantity), 1);

  if (!mounted) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading map…
      </div>
    );
  }

  return (
    <MapContainer
      center={[51.1, 10.4]}
      zoom={6}
      scrollWheelZoom
      style={{ height: "100%", width: "100%", borderRadius: "0.5rem" }}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {valid.map((p) => {
        // Area-proportional bubbles: radius ∝ sqrt(emissions).
        const r = 4 + 26 * Math.sqrt(p.emissions_quantity / max);
        return (
          <CircleMarker
            key={p.source_id}
            center={[p.lat as number, p.lon as number]}
            radius={r}
            pathOptions={{ color: "#ef4444", fillColor: "#ef4444", fillOpacity: 0.45 }}
            eventHandlers={{ click: () => onSelect?.(p.source_id) }}
          >
            <Tooltip>
              <strong>{p.source_name ?? "Unknown"}</strong>
              <br />
              {fmtTonnes(p.emissions_quantity)} CO₂
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
