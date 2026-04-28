export function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)),
  );
  const sep = widths.map((w) => "-".repeat(w)).join("  ");
  const fmt = (cells: string[]) =>
    cells.map((c, i) => c.padEnd(widths[i]!)).join("  ");
  return [fmt(headers), sep, ...rows.map(fmt)].join("\n");
}

export function dollars(micros: number): string {
  // Micros are USD * 1_000_000. Show with sign and 4 decimals so sub-cent
  // ledger entries (typical for per-character TTS billing) are visible.
  const sign = micros < 0 ? "-" : "";
  const abs = Math.abs(micros) / 1_000_000;
  return `${sign}$${abs.toFixed(4)}`;
}
