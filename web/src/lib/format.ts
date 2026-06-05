// CO2 quantities are in tonnes; format compactly as kt / Mt.
export function fmtTonnes(t: number): string {
  const abs = Math.abs(t);
  if (abs >= 1e6) return `${(t / 1e6).toFixed(1)} Mt`;
  if (abs >= 1e3) return `${(t / 1e3).toFixed(1)} kt`;
  return `${t.toFixed(0)} t`;
}

export function prettySector(s: string): string {
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Stable color per sector (10 sectors).
const PALETTE = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#64748b",
];

export function sectorColor(sector: string, allSectors: string[]): string {
  const i = allSectors.indexOf(sector);
  return PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
}
